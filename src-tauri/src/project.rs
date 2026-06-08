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

/// A persisted layout, stored in Cortex's own config directory rather than in
/// the repository. The canonical repository root is recorded alongside the
/// layout so a hash-filename collision (or a stale entry) is detected on read
/// and treated as a miss.
#[derive(Serialize, Deserialize)]
struct StoredLayout {
    root: String,
    layout: serde_json::Value,
}

/// Read a project's saved layout, if any. Returns the raw JSON document so the
/// frontend owns its shape. Layout lives in the application config directory,
/// keyed by the canonical repository root, so nothing inside the repository is
/// read.
#[tauri::command]
pub fn read_layout(app: AppHandle, root: String) -> Option<String> {
    read_layout_in(&layouts_dir(&app).ok()?, &root)
}

/// Persist a project's layout in the application config directory, keyed by the
/// canonical repository root. Cortex never writes inside the repository.
#[tauri::command]
pub fn write_layout(app: AppHandle, root: String, contents: String) -> Result<(), ProjectError> {
    write_layout_in(&layouts_dir(&app)?, &root, &contents)
}

/// The `layouts/` directory under the app config dir, created if absent.
fn layouts_dir(app: &AppHandle) -> Result<PathBuf, ProjectError> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|error| ProjectError::Io(error.to_string()))?
        .join("layouts");
    fs::create_dir_all(&dir).map_err(|error| ProjectError::Io(error.to_string()))?;
    Ok(dir)
}

/// Canonicalize a repository root to a stable string key (resolves symlinks and
/// `.`/`..`), so the same repository maps to the same layout regardless of how
/// its path was spelled.
fn canonical_root(root: &str) -> Result<String, ProjectError> {
    Path::new(root)
        .canonicalize()
        .map_err(|error| ProjectError::Io(error.to_string()))?
        .to_str()
        .map(|value| value.to_string())
        .ok_or_else(|| ProjectError::Io("repository path is not valid UTF-8".into()))
}

/// The layout file for a project: `<dir>/<hash-of-canonical-root>.json`. The
/// hash only needs to produce a stable, filesystem-safe name; the canonical
/// root stored inside the file resolves any collision deterministically.
fn layout_file(dir: &Path, canonical: &str) -> PathBuf {
    use std::hash::{Hash, Hasher};
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    canonical.hash(&mut hasher);
    dir.join(format!("{:016x}.json", hasher.finish()))
}

fn read_layout_in(dir: &Path, root: &str) -> Option<String> {
    let canonical = canonical_root(root).ok()?;
    let data = fs::read_to_string(layout_file(dir, &canonical)).ok()?;
    let stored: StoredLayout = serde_json::from_str(&data).ok()?;
    // Guard against a hash collision or a stale/foreign entry.
    if stored.root != canonical {
        return None;
    }
    serde_json::to_string(&stored.layout).ok()
}

fn write_layout_in(dir: &Path, root: &str, contents: &str) -> Result<(), ProjectError> {
    let canonical = canonical_root(root)?;
    let layout: serde_json::Value = serde_json::from_str(contents)
        .map_err(|error| ProjectError::Io(format!("invalid layout JSON: {error}")))?;
    let stored = StoredLayout {
        root: canonical.clone(),
        layout,
    };
    let data =
        serde_json::to_string_pretty(&stored).map_err(|error| ProjectError::Io(error.to_string()))?;
    fs::write(layout_file(dir, &canonical), data).map_err(|error| ProjectError::Io(error.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A scratch directory under the system temp dir, removed on drop.
    struct TempDir(PathBuf);

    impl TempDir {
        fn new(tag: u32) -> Self {
            let dir = std::env::temp_dir().join(format!("cortex-test-{}-{}", std::process::id(), tag));
            let _ = fs::remove_dir_all(&dir);
            fs::create_dir_all(&dir).unwrap();
            TempDir(dir)
        }
    }

    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn layout_round_trips_through_local_storage() {
        let tmp = TempDir::new(line!());
        let store = tmp.0.join("layouts");
        fs::create_dir_all(&store).unwrap();
        let repo = tmp.0.join("repo");
        fs::create_dir_all(&repo).unwrap();

        write_layout_in(&store, repo.to_str().unwrap(), "{\"type\":\"pane\",\"cwd\":\".\"}").unwrap();

        let restored = read_layout_in(&store, repo.to_str().unwrap()).unwrap();
        let value: serde_json::Value = serde_json::from_str(&restored).unwrap();
        assert_eq!(value["type"], "pane");
        assert_eq!(value["cwd"], ".");
    }

    #[test]
    fn layout_is_not_written_inside_the_repository() {
        let tmp = TempDir::new(line!());
        let store = tmp.0.join("layouts");
        fs::create_dir_all(&store).unwrap();
        let repo = tmp.0.join("repo");
        fs::create_dir_all(&repo).unwrap();

        write_layout_in(&store, repo.to_str().unwrap(), "{\"type\":\"pane\"}").unwrap();

        // The layout lives under the store, never in the repo.
        assert!(!repo.join(".cortex").exists());
        assert!(fs::read_dir(&store).unwrap().next().is_some());
    }

    #[test]
    fn layout_is_scoped_to_its_repository() {
        let tmp = TempDir::new(line!());
        let store = tmp.0.join("layouts");
        fs::create_dir_all(&store).unwrap();
        let repo_a = tmp.0.join("repo-a");
        let repo_b = tmp.0.join("repo-b");
        fs::create_dir_all(&repo_a).unwrap();
        fs::create_dir_all(&repo_b).unwrap();

        write_layout_in(&store, repo_a.to_str().unwrap(), "{\"type\":\"pane\"}").unwrap();

        // A different repository has no layout of its own.
        assert_eq!(read_layout_in(&store, repo_b.to_str().unwrap()), None);
    }

    #[test]
    fn missing_layout_reads_as_none() {
        let tmp = TempDir::new(line!());
        let store = tmp.0.join("layouts");
        fs::create_dir_all(&store).unwrap();
        let repo = tmp.0.join("repo");
        fs::create_dir_all(&repo).unwrap();

        assert_eq!(read_layout_in(&store, repo.to_str().unwrap()), None);
    }

    #[test]
    fn root_mismatch_in_file_reads_as_none() {
        let tmp = TempDir::new(line!());
        let store = tmp.0.join("layouts");
        fs::create_dir_all(&store).unwrap();
        let repo = tmp.0.join("repo");
        fs::create_dir_all(&repo).unwrap();

        // Simulate a hash collision: a file at the repo's key whose stored root
        // belongs to a different project must be treated as a miss.
        let canonical = canonical_root(repo.to_str().unwrap()).unwrap();
        let data = serde_json::to_string(&StoredLayout {
            root: "/some/other/repo".into(),
            layout: serde_json::json!({"type": "pane"}),
        })
        .unwrap();
        fs::write(layout_file(&store, &canonical), data).unwrap();

        assert_eq!(read_layout_in(&store, repo.to_str().unwrap()), None);
    }
}
