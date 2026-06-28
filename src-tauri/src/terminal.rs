use std::{
    collections::HashMap,
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::{
        Mutex,
        atomic::{AtomicU64, Ordering},
    },
    thread,
};

use portable_pty::{Child, CommandBuilder, MasterPty, PtySize, native_pty_system};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::sandbox;

#[derive(Default)]
pub struct TerminalManager {
    next_id: AtomicU64,
    sessions: Mutex<HashMap<String, TerminalSession>>,
}

struct TerminalSession {
    master: Box<dyn MasterPty + Send>,
    writer: Mutex<Box<dyn Write + Send>>,
    child: Mutex<Box<dyn Child + Send + Sync>>,
    /// The PTY reader, held until the frontend subscribes. Output streaming does
    /// not begin until then, so no startup output is emitted before listeners
    /// are attached. `None` once streaming has started.
    reader: Mutex<Option<Box<dyn Read + Send>>>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct TerminalOutput {
    session_id: String,
    data: Vec<u8>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct TerminalExit {
    session_id: String,
}

#[derive(Debug, thiserror::Error)]
pub enum TerminalError {
    #[error("terminal session not found: {0}")]
    MissingSession(String),
    #[error("terminal session lock failed")]
    Lock,
    #[error("pty operation failed: {0}")]
    Pty(String),
}

impl serde::Serialize for TerminalError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::ser::Serializer,
    {
        serializer.serialize_str(self.to_string().as_ref())
    }
}

/// The kind of process a terminal session drives. `kind` is `"sandbox"` for a
/// microVM session and host-shell (the default) otherwise, so the existing
/// frontend call — which omits it — keeps starting host shells unchanged.
#[tauri::command]
pub fn start_terminal(
    app: AppHandle,
    manager: State<'_, TerminalManager>,
    cols: u16,
    rows: u16,
    pixel_width: u16,
    pixel_height: u16,
    cwd: Option<String>,
    root: Option<String>,
    kind: Option<String>,
    rootfs: Option<String>,
) -> Result<String, TerminalError> {
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width,
            pixel_height,
        })
        .map_err(|error| TerminalError::Pty(error.to_string()))?;

    let command = match kind.as_deref() {
        Some("sandbox") => sandbox_command(&app, rootfs)?,
        _ => host_shell_command(cwd, root),
    };

    let child = pair
        .slave
        .spawn_command(command)
        .map_err(|error| TerminalError::Pty(error.to_string()))?;
    let reader = pair
        .master
        .try_clone_reader()
        .map_err(|error| TerminalError::Pty(error.to_string()))?;
    let writer = pair
        .master
        .take_writer()
        .map_err(|error| TerminalError::Pty(error.to_string()))?;

    let session_id = format!(
        "local-{}",
        manager.next_id.fetch_add(1, Ordering::Relaxed) + 1
    );

    // The reader is parked on the session and only drained once the frontend
    // calls `subscribe_terminal`, after it has attached its listeners — so the
    // initial prompt (or a fast exit) is never emitted before anyone is
    // listening, and the PTY buffers it in the meantime.
    let session = TerminalSession {
        master: pair.master,
        writer: Mutex::new(writer),
        child: Mutex::new(child),
        reader: Mutex::new(Some(reader)),
    };

    manager
        .sessions
        .lock()
        .map_err(|_| TerminalError::Lock)?
        .insert(session_id.clone(), session);

    Ok(session_id)
}

/// Begin streaming a session's output. The frontend calls this only after it has
/// registered its `terminal-output`/`terminal-exit` listeners, closing the race
/// where startup output is emitted before the listeners exist. Taking the reader
/// makes it a no-op if called more than once.
#[tauri::command]
pub fn subscribe_terminal(
    app: AppHandle,
    manager: State<'_, TerminalManager>,
    session_id: String,
) -> Result<(), TerminalError> {
    let reader = {
        let sessions = manager.sessions.lock().map_err(|_| TerminalError::Lock)?;
        let session = sessions
            .get(&session_id)
            .ok_or_else(|| TerminalError::MissingSession(session_id.clone()))?;
        session
            .reader
            .lock()
            .map_err(|_| TerminalError::Lock)?
            .take()
    };
    let Some(mut reader) = reader else {
        return Ok(());
    };

    let output_session_id = session_id;
    thread::spawn(move || {
        let mut buffer = [0_u8; 8192];
        loop {
            match reader.read(&mut buffer) {
                Ok(0) => break,
                Ok(read) => {
                    let _ = app.emit(
                        "terminal-output",
                        TerminalOutput {
                            session_id: output_session_id.clone(),
                            data: buffer[..read].to_vec(),
                        },
                    );
                }
                Err(_) => break,
            }
        }

        let _ = app.emit(
            "terminal-exit",
            TerminalExit {
                session_id: output_session_id,
            },
        );
    });

    Ok(())
}

/// Pick a working directory for a new shell, confined to the project repository.
///
/// The requested directory comes from a repo-controlled layout, so it is
/// canonicalized — resolving `..` and any symlinks — and accepted only when it
/// stays inside the canonical repository root. Without this, a committed symlink
/// such as `outside -> /elsewhere` would pass a plain `is_dir()` check and start
/// the shell outside the project. Falls back to the repository root (or `HOME`
/// when no project root is given) so a stale, missing, or rejected path never
/// prevents a session from starting.
fn resolve_cwd(cwd: Option<String>, root: Option<String>) -> Option<PathBuf> {
    let canonical_root = root
        .map(PathBuf::from)
        .and_then(|r| r.canonicalize().ok())
        .filter(|r| r.is_dir());

    if let Some(requested) = cwd {
        if let Ok(path) = PathBuf::from(&requested).canonicalize() {
            if path.is_dir() {
                match &canonical_root {
                    // Within the project root: accept.
                    Some(root_dir) if path.starts_with(root_dir) => return Some(path),
                    // No project root to confine against: accept the existing dir.
                    None => return Some(path),
                    // Escapes the project root (e.g. via a committed symlink): reject.
                    Some(_) => {}
                }
            }
        }
    }

    canonical_root.or_else(|| std::env::var_os("HOME").map(PathBuf::from))
}

/// Build the command for a host-shell session (the original behavior).
fn host_shell_command(cwd: Option<String>, root: Option<String>) -> CommandBuilder {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
    let mut command = CommandBuilder::new(shell);
    add_login_shell_arg(&mut command);
    command.env("TERM", "xterm-256color");
    command.env("COLORTERM", "truecolor");
    command.env("TERM_PROGRAM", "Cortex");
    command.env("PATH", terminal_path());
    if let Some(dir) = resolve_cwd(cwd, root) {
        command.cwd(dir);
    }
    command
}

/// Build the command for a sandbox session: Cortex re-executing itself as the
/// libkrun helper for the rootfs identified by `rootfs` (a directory name under
/// the app's `rootfs` config dir). Rejected when the host can't run sandboxes or
/// the rootfs can't be resolved.
fn sandbox_command(
    app: &AppHandle,
    rootfs: Option<String>,
) -> Result<CommandBuilder, TerminalError> {
    let support = sandbox::sandbox_support();
    if !support.supported {
        return Err(TerminalError::Pty(support.reason.unwrap_or_else(|| {
            "Sandboxes are not supported on this host.".to_string()
        })));
    }

    let rootfs_id =
        rootfs.ok_or_else(|| TerminalError::Pty("missing rootfs for sandbox session".to_string()))?;
    let dir = sandbox_rootfs_dir(app)?;
    let path = sandbox::resolve_rootfs(&dir, &rootfs_id)
        .ok_or_else(|| TerminalError::Pty(format!("rootfs not found: {rootfs_id}")))?;

    sandbox::host_command(&sandbox::SandboxConfig::new(path))
        .map_err(|error| TerminalError::Pty(error.to_string()))
}

/// The directory holding prepared rootfs entries, under the app config dir.
fn sandbox_rootfs_dir(app: &AppHandle) -> Result<PathBuf, TerminalError> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|error| TerminalError::Pty(error.to_string()))?;
    Ok(dir.join("rootfs"))
}

fn add_login_shell_arg(command: &mut CommandBuilder) {
    let Some(shell) = command.get_argv().first() else {
        return;
    };
    let shell_name = Path::new(shell)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or_default();

    match shell_name {
        "bash" | "sh" | "zsh" => command.arg("-l"),
        "fish" => command.arg("--login"),
        _ => {}
    }
}

fn terminal_path() -> String {
    let mut paths = vec![
        "/opt/homebrew/bin".to_string(),
        "/opt/homebrew/sbin".to_string(),
        "/usr/local/bin".to_string(),
        "/usr/local/sbin".to_string(),
    ];

    if let Ok(home) = std::env::var("HOME") {
        paths.push(format!("{home}/.local/bin"));
        paths.push(format!("{home}/.cargo/bin"));
    }

    paths.extend([
        "/usr/bin".to_string(),
        "/bin".to_string(),
        "/usr/sbin".to_string(),
        "/sbin".to_string(),
    ]);

    if let Ok(existing) = std::env::var("PATH") {
        paths.extend(
            existing
                .split(':')
                .filter(|path| !path.is_empty())
                .map(str::to_string),
        );
    }

    paths.dedup();
    paths.join(":")
}

#[tauri::command]
pub fn write_terminal(
    manager: State<'_, TerminalManager>,
    session_id: String,
    data: Vec<u8>,
) -> Result<(), TerminalError> {
    let sessions = manager.sessions.lock().map_err(|_| TerminalError::Lock)?;
    let session = sessions
        .get(&session_id)
        .ok_or_else(|| TerminalError::MissingSession(session_id.clone()))?;
    let mut writer = session.writer.lock().map_err(|_| TerminalError::Lock)?;

    writer
        .write_all(&data)
        .map_err(|error| TerminalError::Pty(error.to_string()))
}

#[tauri::command]
pub fn resize_terminal(
    manager: State<'_, TerminalManager>,
    session_id: String,
    cols: u16,
    rows: u16,
    pixel_width: u16,
    pixel_height: u16,
) -> Result<(), TerminalError> {
    let sessions = manager.sessions.lock().map_err(|_| TerminalError::Lock)?;
    let session = sessions
        .get(&session_id)
        .ok_or_else(|| TerminalError::MissingSession(session_id.clone()))?;

    session
        .master
        .resize(PtySize {
            rows,
            cols,
            pixel_width,
            pixel_height,
        })
        .map_err(|error| TerminalError::Pty(error.to_string()))
}

#[tauri::command]
pub fn stop_terminal(
    manager: State<'_, TerminalManager>,
    session_id: String,
) -> Result<(), TerminalError> {
    let session = manager
        .sessions
        .lock()
        .map_err(|_| TerminalError::Lock)?
        .remove(&session_id)
        .ok_or_else(|| TerminalError::MissingSession(session_id.clone()))?;

    let mut child = session.child.lock().map_err(|_| TerminalError::Lock)?;
    child
        .kill()
        .map_err(|error| TerminalError::Pty(error.to_string()))
}

#[cfg(all(test, unix))]
mod tests {
    use super::resolve_cwd;
    use std::fs;
    use std::os::unix::fs::symlink;
    use std::path::PathBuf;

    struct TempDir(PathBuf);

    impl TempDir {
        fn new(tag: u32) -> Self {
            let dir = std::env::temp_dir().join(format!("cortex-cwd-{}-{}", std::process::id(), tag));
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

    fn s(path: &std::path::Path) -> String {
        path.to_str().unwrap().to_string()
    }

    #[test]
    fn accepts_a_subdirectory_of_the_repo() {
        let tmp = TempDir::new(line!());
        let repo = tmp.0.join("repo");
        let sub = repo.join("sub");
        fs::create_dir_all(&sub).unwrap();

        let resolved = resolve_cwd(Some(s(&sub)), Some(s(&repo))).unwrap();
        assert_eq!(resolved, sub.canonicalize().unwrap());
    }

    #[test]
    fn rejects_a_symlink_that_escapes_the_repo() {
        let tmp = TempDir::new(line!());
        let repo = tmp.0.join("repo");
        fs::create_dir_all(&repo).unwrap();
        let elsewhere = tmp.0.join("elsewhere");
        fs::create_dir_all(&elsewhere).unwrap();
        // A committed symlinked directory pointing outside the repo.
        symlink(&elsewhere, repo.join("outside")).unwrap();

        let resolved = resolve_cwd(Some(s(&repo.join("outside"))), Some(s(&repo))).unwrap();
        // Confined to the repo root, not the symlink target.
        assert_eq!(resolved, repo.canonicalize().unwrap());
    }

    #[test]
    fn falls_back_to_repo_root_for_a_missing_cwd() {
        let tmp = TempDir::new(line!());
        let repo = tmp.0.join("repo");
        fs::create_dir_all(&repo).unwrap();

        let resolved = resolve_cwd(Some(s(&repo.join("does-not-exist"))), Some(s(&repo))).unwrap();
        assert_eq!(resolved, repo.canonicalize().unwrap());
    }
}
