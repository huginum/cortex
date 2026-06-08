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

/// Resolve `<root>/.cortex`, guaranteeing it is a real directory inside the repo
/// rather than a symlink. `.cortex` is repo-controlled, so a malicious repo could
/// ship it as a symlink to another directory to redirect our writes outside the
/// project; refuse to follow it. Creates the directory when `create` is set.
fn resolve_cortex_dir(root: &Path, create: bool) -> Result<PathBuf, ProjectError> {
    let dir = root.join(".cortex");
    match fs::symlink_metadata(&dir) {
        Ok(meta) if meta.file_type().is_symlink() => Err(ProjectError::Io(
            ".cortex is a symlink; refusing to follow it".into(),
        )),
        Ok(meta) if meta.is_dir() => Ok(dir),
        Ok(_) => Err(ProjectError::Io(
            ".cortex exists but is not a directory".into(),
        )),
        Err(_) if create => {
            fs::create_dir(&dir).map_err(|error| ProjectError::Io(error.to_string()))?;
            Ok(dir)
        }
        Err(error) => Err(ProjectError::Io(error.to_string())),
    }
}

const LAYOUT_FILE: &str = "layout.json";

/// Read a project's saved layout, if any. Returns the raw JSON document so the
/// frontend owns its shape. `.cortex` and `layout.json` are repo-controlled, so
/// neither a symlinked directory nor a symlinked file is followed (which could
/// otherwise read an arbitrary file's contents into the app).
#[tauri::command]
pub fn read_layout(root: String) -> Option<String> {
    let dir = resolve_cortex_dir(Path::new(&root), false).ok()?;
    read_in_dir(&dir, LAYOUT_FILE)
}

/// Persist a project's layout under `<root>/.cortex/layout.json`.
#[tauri::command]
pub fn write_layout(root: String, contents: String) -> Result<(), ProjectError> {
    let dir = resolve_cortex_dir(Path::new(&root), true)?;
    write_in_dir(&dir, LAYOUT_FILE, &contents)
}

/// Read `name` inside `dir` without following a symlink at either the directory
/// or the file. On Unix the directory is opened with `O_NOFOLLOW | O_DIRECTORY`
/// and the file is opened relative to that pinned fd, so swapping `.cortex` for
/// a symlink after it was validated cannot redirect the read outside the repo.
#[cfg(unix)]
fn read_in_dir(dir: &Path, name: &str) -> Option<String> {
    use std::io::Read;
    use std::os::unix::io::FromRawFd;

    let dirfd = open_dir_nofollow(dir).ok()?;
    let name_c = std::ffi::CString::new(name).ok()?;
    let fd = unsafe {
        libc::openat(
            dirfd.0,
            name_c.as_ptr(),
            libc::O_RDONLY | libc::O_NOFOLLOW | libc::O_CLOEXEC,
        )
    };
    if fd < 0 {
        return None;
    }
    let mut file = unsafe { fs::File::from_raw_fd(fd) };
    let mut buf = String::new();
    file.read_to_string(&mut buf).ok()?;
    Some(buf)
}

/// Write `contents` to `name` inside `dir` without following a symlink at the
/// directory or the file, and without ever truncating a pre-existing entry in
/// place. On Unix the parent directory is opened with `O_NOFOLLOW | O_DIRECTORY`
/// and all operations go through that pinned fd via `*at` syscalls, so a racing
/// swap of `.cortex` for a symlink cannot redirect the write. The data is
/// written to a fresh temp file and `renameat`-ed over `name`: rename repoints
/// the directory entry atomically, so even if `name` was a hard link to a file
/// outside the repo, that target's inode is left untouched (and a symlink dest
/// is replaced, not followed).
#[cfg(unix)]
fn write_in_dir(dir: &Path, name: &str, contents: &str) -> Result<(), ProjectError> {
    use std::io::Write;
    use std::os::unix::io::FromRawFd;
    use std::sync::atomic::{AtomicU64, Ordering};

    static TMP_SEQ: AtomicU64 = AtomicU64::new(0);

    let dirfd = open_dir_nofollow(dir)?;
    let name_c =
        std::ffi::CString::new(name).map_err(|_| ProjectError::Io("name contains NUL".into()))?;
    let tmp = format!(
        ".{name}.{}.{}.tmp",
        std::process::id(),
        TMP_SEQ.fetch_add(1, Ordering::Relaxed)
    );
    let tmp_c =
        std::ffi::CString::new(tmp).map_err(|_| ProjectError::Io("temp name contains NUL".into()))?;

    // Clear any stale/planted entry at the temp name (the entry itself, not a
    // target it may point at), then create a brand-new regular file: O_EXCL plus
    // O_NOFOLLOW guarantees we never reuse or follow an existing inode.
    unsafe { libc::unlinkat(dirfd.0, tmp_c.as_ptr(), 0) };
    let fd = unsafe {
        libc::openat(
            dirfd.0,
            tmp_c.as_ptr(),
            libc::O_WRONLY | libc::O_CREAT | libc::O_EXCL | libc::O_NOFOLLOW | libc::O_CLOEXEC,
            0o644,
        )
    };
    if fd < 0 {
        return Err(ProjectError::Io(
            std::io::Error::last_os_error().to_string(),
        ));
    }
    let mut file = unsafe { fs::File::from_raw_fd(fd) };
    if let Err(error) = file.write_all(contents.as_bytes()) {
        unsafe { libc::unlinkat(dirfd.0, tmp_c.as_ptr(), 0) };
        return Err(ProjectError::Io(error.to_string()));
    }
    drop(file);

    let renamed = unsafe { libc::renameat(dirfd.0, tmp_c.as_ptr(), dirfd.0, name_c.as_ptr()) };
    if renamed != 0 {
        let error = std::io::Error::last_os_error();
        unsafe { libc::unlinkat(dirfd.0, tmp_c.as_ptr(), 0) };
        return Err(ProjectError::Io(error.to_string()));
    }
    Ok(())
}

/// An owned directory file descriptor, closed on drop.
#[cfg(unix)]
struct DirFd(i32);

#[cfg(unix)]
impl Drop for DirFd {
    fn drop(&mut self) {
        unsafe { libc::close(self.0) };
    }
}

/// Open `dir` itself as a directory fd without following a symlink. Pinning the
/// directory inode means later `*at` operations cannot be redirected by swapping
/// the directory for a symlink after this point.
#[cfg(unix)]
fn open_dir_nofollow(dir: &Path) -> Result<DirFd, ProjectError> {
    use std::os::unix::ffi::OsStrExt;
    let dir_c = std::ffi::CString::new(dir.as_os_str().as_bytes())
        .map_err(|_| ProjectError::Io("path contains NUL".into()))?;
    let fd = unsafe {
        libc::open(
            dir_c.as_ptr(),
            libc::O_RDONLY | libc::O_DIRECTORY | libc::O_NOFOLLOW | libc::O_CLOEXEC,
        )
    };
    if fd < 0 {
        return Err(ProjectError::Io(
            std::io::Error::last_os_error().to_string(),
        ));
    }
    Ok(DirFd(fd))
}

#[cfg(not(unix))]
fn read_in_dir(dir: &Path, name: &str) -> Option<String> {
    let file = dir.join(name);
    let meta = fs::symlink_metadata(&file).ok()?;
    if meta.file_type().is_symlink() || !meta.is_file() {
        return None;
    }
    fs::read_to_string(&file).ok()
}

#[cfg(not(unix))]
fn write_in_dir(dir: &Path, name: &str, contents: &str) -> Result<(), ProjectError> {
    let file = dir.join(name);
    if let Ok(meta) = fs::symlink_metadata(&file) {
        if meta.file_type().is_symlink() {
            fs::remove_file(&file).map_err(|error| ProjectError::Io(error.to_string()))?;
        }
    }
    fs::write(&file, contents).map_err(|error| ProjectError::Io(error.to_string()))
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use std::os::unix::fs::symlink;

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
    fn write_layout_does_not_clobber_a_symlinked_target() {
        let tmp = TempDir::new(line!());
        let repo = tmp.0.join("repo");
        fs::create_dir_all(repo.join(".cortex")).unwrap();
        let victim = tmp.0.join("victim.txt");
        fs::write(&victim, "SECRET-ORIGINAL").unwrap();
        // Attacker plants layout.json as a symlink to a file outside the repo.
        symlink(&victim, repo.join(".cortex").join("layout.json")).unwrap();

        write_layout(repo.to_str().unwrap().into(), "{\"type\":\"pane\"}".into()).unwrap();

        // The victim is untouched and the layout is now a real file in the repo.
        assert_eq!(fs::read_to_string(&victim).unwrap(), "SECRET-ORIGINAL");
        let layout = repo.join(".cortex").join("layout.json");
        assert!(!fs::symlink_metadata(&layout).unwrap().file_type().is_symlink());
        assert_eq!(fs::read_to_string(&layout).unwrap(), "{\"type\":\"pane\"}");
    }

    #[test]
    fn write_layout_does_not_truncate_a_hard_linked_target() {
        let tmp = TempDir::new(line!());
        let repo = tmp.0.join("repo");
        fs::create_dir_all(repo.join(".cortex")).unwrap();
        let victim = tmp.0.join("victim.txt");
        fs::write(&victim, "SECRET-ORIGINAL").unwrap();
        // Attacker hard-links layout.json to a file outside the repo (same fs).
        fs::hard_link(&victim, repo.join(".cortex").join("layout.json")).unwrap();

        write_layout(repo.to_str().unwrap().into(), "{\"type\":\"pane\"}".into()).unwrap();

        // The hard-linked target keeps its contents; the rename repointed only
        // the directory entry, and layout.json is now an independent file.
        assert_eq!(fs::read_to_string(&victim).unwrap(), "SECRET-ORIGINAL");
        let layout = repo.join(".cortex").join("layout.json");
        assert_eq!(fs::read_to_string(&layout).unwrap(), "{\"type\":\"pane\"}");
    }

    #[test]
    fn write_in_dir_refuses_a_symlinked_directory() {
        let tmp = TempDir::new(line!());
        let real = tmp.0.join("real");
        fs::create_dir_all(&real).unwrap();
        let link = tmp.0.join("link");
        // Even past resolve_cortex_dir, opening the dir with O_NOFOLLOW|O_DIRECTORY
        // rejects a directory that was swapped for a symlink.
        symlink(&real, &link).unwrap();

        assert!(write_in_dir(&link, "layout.json", "{}").is_err());
        assert!(!real.join("layout.json").exists());
    }

    #[test]
    fn write_layout_refuses_a_symlinked_cortex_dir() {
        let tmp = TempDir::new(line!());
        let repo = tmp.0.join("repo");
        fs::create_dir_all(&repo).unwrap();
        let elsewhere = tmp.0.join("elsewhere");
        fs::create_dir_all(&elsewhere).unwrap();
        // Attacker points .cortex at a directory outside the repo.
        symlink(&elsewhere, repo.join(".cortex")).unwrap();

        let result = write_layout(repo.to_str().unwrap().into(), "{}".into());

        assert!(result.is_err());
        assert!(!elsewhere.join("layout.json").exists());
    }

    #[test]
    fn read_layout_ignores_a_symlinked_file() {
        let tmp = TempDir::new(line!());
        let repo = tmp.0.join("repo");
        fs::create_dir_all(repo.join(".cortex")).unwrap();
        let secret = tmp.0.join("secret.txt");
        fs::write(&secret, "TOP SECRET").unwrap();
        symlink(&secret, repo.join(".cortex").join("layout.json")).unwrap();

        assert_eq!(read_layout(repo.to_str().unwrap().into()), None);
    }

    #[test]
    fn layout_round_trips_through_a_real_file() {
        let tmp = TempDir::new(line!());
        let repo = tmp.0.join("repo");
        fs::create_dir_all(&repo).unwrap();

        write_layout(repo.to_str().unwrap().into(), "{\"type\":\"pane\",\"cwd\":\".\"}".into())
            .unwrap();

        assert_eq!(
            read_layout(repo.to_str().unwrap().into()),
            Some("{\"type\":\"pane\",\"cwd\":\".\"}".into())
        );
    }
}
