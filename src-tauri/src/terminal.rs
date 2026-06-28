use std::{
    collections::HashMap,
    io::{Read, Write},
    net::Shutdown,
    os::unix::net::UnixStream,
    path::{Path, PathBuf},
    sync::{
        Mutex,
        atomic::{AtomicU64, Ordering},
    },
    thread,
};

use portable_pty::{Child, CommandBuilder, MasterPty, PtySize, native_pty_system};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use crate::{container_runtime::ContainerRuntime, sandbox};

#[derive(Default)]
pub struct TerminalManager {
    next_id: AtomicU64,
    sessions: Mutex<HashMap<String, TerminalSession>>,
}

/// A terminal session's backend. Host shells and direct image sandboxes run
/// behind a host PTY; container shells stream over a vsock exec connection. Both
/// share the same frontend transport, so only construction and the
/// resize/write/exit mechanics differ.
enum TerminalSession {
    Pty(PtySession),
    Exec(ExecSession),
}

struct PtySession {
    master: Box<dyn MasterPty + Send>,
    writer: Mutex<Box<dyn Write + Send>>,
    child: Mutex<Box<dyn Child + Send + Sync>>,
    /// The PTY reader, held until the frontend subscribes. Output streaming does
    /// not begin until then, so no startup output is emitted before listeners
    /// are attached. `None` once streaming has started.
    reader: Mutex<Option<Box<dyn Read + Send>>>,
}

/// A shell exec'd into a running container, streamed over the agent's vsock
/// socket using the framed protocol.
struct ExecSession {
    /// Write half: frames `Data` (input) and `Resize` to the guest agent.
    writer: Mutex<UnixStream>,
    /// Read half, taken by `subscribe` to drive the frame-reading thread.
    reader: Mutex<Option<UnixStream>>,
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
#[allow(clippy::too_many_arguments)] // Tauri commands take flat positional args.
pub fn start_terminal(
    app: AppHandle,
    manager: State<'_, TerminalManager>,
    runtime: State<'_, ContainerRuntime>,
    cols: u16,
    rows: u16,
    pixel_width: u16,
    pixel_height: u16,
    cwd: Option<String>,
    root: Option<String>,
    kind: Option<String>,
    image: Option<String>,
    container: Option<String>,
    command: Option<String>,
) -> Result<String, TerminalError> {
    let session = match kind.as_deref() {
        // A shell exec'd into a container: no host PTY; stream over the agent.
        Some("container") => {
            let id = container
                .ok_or_else(|| TerminalError::Pty("missing container for session".to_string()))?;
            let stream = crate::container_runtime::open_exec(&app, &runtime, &id, command, cols, rows)
                .map_err(TerminalError::Pty)?;
            let read_half = stream
                .try_clone()
                .map_err(|error| TerminalError::Pty(error.to_string()))?;
            TerminalSession::Exec(ExecSession {
                writer: Mutex::new(stream),
                reader: Mutex::new(Some(read_half)),
            })
        }
        // Host shell or direct image sandbox: behind a host PTY.
        other => {
            let pty_system = native_pty_system();
            let pair = pty_system
                .openpty(PtySize {
                    rows,
                    cols,
                    pixel_width,
                    pixel_height,
                })
                .map_err(|error| TerminalError::Pty(error.to_string()))?;
            let command = match other {
                Some("sandbox") => sandbox_command(&app, image)?,
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
            TerminalSession::Pty(PtySession {
                master: pair.master,
                writer: Mutex::new(writer),
                child: Mutex::new(child),
                reader: Mutex::new(Some(reader)),
            })
        }
    };

    let session_id = format!(
        "local-{}",
        manager.next_id.fetch_add(1, Ordering::Relaxed) + 1
    );

    // The reader is parked on the session and only drained once the frontend
    // calls `subscribe_terminal`, after it has attached its listeners — so the
    // initial prompt (or a fast exit) is never emitted before anyone is
    // listening.
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
    enum Source {
        Pty(Box<dyn Read + Send>),
        Exec(UnixStream),
        Already,
    }

    let source = {
        let sessions = manager.sessions.lock().map_err(|_| TerminalError::Lock)?;
        let session = sessions
            .get(&session_id)
            .ok_or_else(|| TerminalError::MissingSession(session_id.clone()))?;
        match session {
            TerminalSession::Pty(pty) => pty
                .reader
                .lock()
                .map_err(|_| TerminalError::Lock)?
                .take()
                .map_or(Source::Already, Source::Pty),
            TerminalSession::Exec(exec) => exec
                .reader
                .lock()
                .map_err(|_| TerminalError::Lock)?
                .take()
                .map_or(Source::Already, Source::Exec),
        }
    };

    match source {
        Source::Pty(reader) => spawn_pty_stream(app, session_id, reader),
        Source::Exec(stream) => spawn_exec_stream(app, session_id, stream),
        Source::Already => {}
    }
    Ok(())
}

/// Stream raw PTY bytes as `terminal-output`, emitting `terminal-exit` on EOF.
fn spawn_pty_stream(app: AppHandle, session_id: String, mut reader: Box<dyn Read + Send>) {
    thread::spawn(move || {
        let mut buffer = [0_u8; 8192];
        loop {
            match reader.read(&mut buffer) {
                Ok(0) => break,
                Ok(read) => {
                    let _ = app.emit(
                        "terminal-output",
                        TerminalOutput {
                            session_id: session_id.clone(),
                            data: buffer[..read].to_vec(),
                        },
                    );
                }
                Err(_) => break,
            }
        }
        let _ = app.emit("terminal-exit", TerminalExit { session_id });
    });
}

/// Decode the agent's framed stream: `Data` becomes `terminal-output`; `Exit` or
/// EOF ends the session with `terminal-exit`.
fn spawn_exec_stream(app: AppHandle, session_id: String, mut stream: UnixStream) {
    thread::spawn(move || {
        loop {
            match agent_proto::read_frame(&mut stream) {
                Ok((agent_proto::FrameKind::Data, payload)) => {
                    let _ = app.emit(
                        "terminal-output",
                        TerminalOutput {
                            session_id: session_id.clone(),
                            data: payload,
                        },
                    );
                }
                Ok((agent_proto::FrameKind::Exit, _)) => break,
                Ok(_) => {}
                Err(_) => break,
            }
        }
        let _ = app.emit("terminal-exit", TerminalExit { session_id });
    });
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
/// libkrun helper for the cached rootfs of the OCI image `image`. The image must
/// already be present in the cache (the frontend pulls it first); rejected when
/// the host can't run sandboxes or the image isn't cached.
fn sandbox_command(
    app: &AppHandle,
    image: Option<String>,
) -> Result<CommandBuilder, TerminalError> {
    let support = sandbox::sandbox_support();
    if !support.supported {
        return Err(TerminalError::Pty(support.reason.unwrap_or_else(|| {
            "Sandboxes are not supported on this host.".to_string()
        })));
    }

    let reference =
        image.ok_or_else(|| TerminalError::Pty("missing image for sandbox session".to_string()))?;
    let root = crate::images_root(app).map_err(TerminalError::Pty)?;
    let path = crate::images::cached_rootfs(&root, &reference)
        .ok_or_else(|| TerminalError::Pty(format!("image not prepared: {reference}")))?;

    sandbox::host_command(&sandbox::SandboxConfig::new(path))
        .map_err(|error| TerminalError::Pty(error.to_string()))
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

    match session {
        TerminalSession::Pty(pty) => {
            let mut writer = pty.writer.lock().map_err(|_| TerminalError::Lock)?;
            writer
                .write_all(&data)
                .map_err(|error| TerminalError::Pty(error.to_string()))
        }
        TerminalSession::Exec(exec) => {
            let mut stream = exec.writer.lock().map_err(|_| TerminalError::Lock)?;
            agent_proto::write_data(&mut *stream, &data)
                .map_err(|error| TerminalError::Pty(error.to_string()))
        }
    }
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

    match session {
        TerminalSession::Pty(pty) => pty
            .master
            .resize(PtySize {
                rows,
                cols,
                pixel_width,
                pixel_height,
            })
            .map_err(|error| TerminalError::Pty(error.to_string())),
        TerminalSession::Exec(exec) => {
            let mut stream = exec.writer.lock().map_err(|_| TerminalError::Lock)?;
            agent_proto::write_resize(&mut *stream, &agent_proto::ResizeRequest { cols, rows })
                .map_err(|error| TerminalError::Pty(error.to_string()))
        }
    }
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

    match session {
        TerminalSession::Pty(pty) => {
            let mut child = pty.child.lock().map_err(|_| TerminalError::Lock)?;
            child
                .kill()
                .map_err(|error| TerminalError::Pty(error.to_string()))
        }
        // Closing the exec shell hangs up the connection; the container keeps
        // running for its other shells (stop the container to tear it down).
        TerminalSession::Exec(exec) => {
            if let Ok(stream) = exec.writer.lock() {
                let _ = stream.shutdown(Shutdown::Both);
            }
            Ok(())
        }
    }
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
