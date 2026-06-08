use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

#[derive(Debug, thiserror::Error)]
pub enum ProjectError {
    #[error("not a git repository: {0}")]
    NotARepo(String),
    #[error("git command failed: {0}")]
    Git(String),
    #[error("filesystem error: {0}")]
    Io(String),
}

impl serde::Serialize for ProjectError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::ser::Serializer,
    {
        serializer.serialize_str(self.to_string().as_ref())
    }
}

/// A project as surfaced to the frontend. `root` is the git repository root.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub root: String,
    pub name: String,
    /// Current branch, when the repository is present and readable.
    pub branch: Option<String>,
    /// Whether `root` still exists and is a git repository.
    pub exists: bool,
}

#[derive(Default, Serialize, Deserialize)]
struct RecentProjects {
    /// Repository roots, most-recently-opened first.
    roots: Vec<String>,
}

fn run_git(args: &[&str], cwd: Option<&Path>) -> Result<String, ProjectError> {
    let mut command = Command::new("git");
    command.args(args);
    if let Some(dir) = cwd {
        command.current_dir(dir);
    }
    let output = command
        .output()
        .map_err(|error| ProjectError::Git(error.to_string()))?;
    if !output.status.success() {
        return Err(ProjectError::Git(
            String::from_utf8_lossy(&output.stderr).trim().to_string(),
        ));
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

/// Resolve the git repository root that contains `path`.
fn repo_root(path: &Path) -> Result<PathBuf, ProjectError> {
    let toplevel = run_git(&["rev-parse", "--show-toplevel"], Some(path))
        .map_err(|_| ProjectError::NotARepo(path.display().to_string()))?;
    if toplevel.is_empty() {
        return Err(ProjectError::NotARepo(path.display().to_string()));
    }
    Ok(PathBuf::from(toplevel))
}

fn current_branch(root: &Path) -> Option<String> {
    let branch = run_git(&["rev-parse", "--abbrev-ref", "HEAD"], Some(root)).ok()?;
    if branch.is_empty() {
        None
    } else {
        Some(branch)
    }
}

fn project_name(root: &Path) -> String {
    root.file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("project")
        .to_string()
}

fn project_at(root: &Path) -> Project {
    Project {
        root: root.display().to_string(),
        name: project_name(root),
        branch: current_branch(root),
        exists: true,
    }
}

fn config_path(app: &AppHandle) -> Result<PathBuf, ProjectError> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|error| ProjectError::Io(error.to_string()))?;
    fs::create_dir_all(&dir).map_err(|error| ProjectError::Io(error.to_string()))?;
    Ok(dir.join("projects.json"))
}

fn read_recent(app: &AppHandle) -> RecentProjects {
    let Ok(path) = config_path(app) else {
        return RecentProjects::default();
    };
    let Ok(contents) = fs::read_to_string(path) else {
        return RecentProjects::default();
    };
    serde_json::from_str(&contents).unwrap_or_default()
}

fn write_recent(app: &AppHandle, recent: &RecentProjects) -> Result<(), ProjectError> {
    let path = config_path(app)?;
    let contents =
        serde_json::to_string_pretty(recent).map_err(|error| ProjectError::Io(error.to_string()))?;
    fs::write(path, contents).map_err(|error| ProjectError::Io(error.to_string()))
}

fn record_recent(app: &AppHandle, root: &str) {
    let mut recent = read_recent(app);
    recent.roots.retain(|existing| existing != root);
    recent.roots.insert(0, root.to_string());
    let _ = write_recent(app, &recent);
}

/// List recent projects, most-recent first, annotating whether each still
/// resolves to a git repository so the picker can offer to remove stale ones.
#[tauri::command]
pub fn list_recent_projects(app: AppHandle) -> Vec<Project> {
    read_recent(&app)
        .roots
        .into_iter()
        .map(|root| {
            let path = PathBuf::from(&root);
            let exists = path.is_dir() && repo_root(&path).map(|r| r == path).unwrap_or(false);
            Project {
                name: project_name(&path),
                branch: if exists { current_branch(&path) } else { None },
                root,
                exists,
            }
        })
        .collect()
}

#[tauri::command]
pub fn remove_recent_project(app: AppHandle, root: String) -> Result<(), ProjectError> {
    let mut recent = read_recent(&app);
    recent.roots.retain(|existing| existing != &root);
    write_recent(&app, &recent)
}

/// Open an existing git repository, recording it in the recent list.
#[tauri::command]
pub fn open_project(app: AppHandle, path: String) -> Result<Project, ProjectError> {
    let root = repo_root(Path::new(&path))?;
    let project = project_at(&root);
    record_recent(&app, &project.root);
    Ok(project)
}

/// Open a directory as a project, running `git init` first if it is not yet a
/// repository.
#[tauri::command]
pub fn init_project(app: AppHandle, path: String) -> Result<Project, ProjectError> {
    let dir = Path::new(&path);
    if repo_root(dir).is_err() {
        run_git(&["init"], Some(dir))?;
    }
    open_project(app, path)
}

/// Clone a remote repository into `dest` and open it as a project.
#[tauri::command]
pub fn clone_project(
    app: AppHandle,
    url: String,
    dest: String,
) -> Result<Project, ProjectError> {
    run_git(&["clone", &url, &dest], None)?;
    open_project(app, dest)
}

/// Read a project's saved layout, if any. Returns the raw JSON document so the
/// frontend owns its shape.
#[tauri::command]
pub fn read_layout(root: String) -> Option<String> {
    fs::read_to_string(Path::new(&root).join(".cortex").join("layout.json")).ok()
}

/// Persist a project's layout under `<root>/.cortex/layout.json`.
#[tauri::command]
pub fn write_layout(root: String, contents: String) -> Result<(), ProjectError> {
    let root_path = Path::new(&root);
    let cortex_dir = root_path.join(".cortex");
    fs::create_dir_all(&cortex_dir).map_err(|error| ProjectError::Io(error.to_string()))?;
    fs::write(cortex_dir.join("layout.json"), contents)
        .map_err(|error| ProjectError::Io(error.to_string()))
}
