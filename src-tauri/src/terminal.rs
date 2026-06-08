use std::{
    collections::HashMap,
    io::{Read, Write},
    path::Path,
    sync::{
        Mutex,
        atomic::{AtomicU64, Ordering},
    },
    thread,
};

use portable_pty::{Child, CommandBuilder, MasterPty, PtySize, native_pty_system};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

#[derive(Default)]
pub struct TerminalManager {
    next_id: AtomicU64,
    sessions: Mutex<HashMap<String, TerminalSession>>,
}

struct TerminalSession {
    master: Box<dyn MasterPty + Send>,
    writer: Mutex<Box<dyn Write + Send>>,
    child: Mutex<Box<dyn Child + Send + Sync>>,
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

#[tauri::command]
pub fn start_terminal(
    app: AppHandle,
    manager: State<'_, TerminalManager>,
    cols: u16,
    rows: u16,
    pixel_width: u16,
    pixel_height: u16,
    cwd: Option<String>,
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

    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
    let mut command = CommandBuilder::new(shell);
    add_login_shell_arg(&mut command);
    command.env("TERM", "xterm-256color");
    command.env("COLORTERM", "truecolor");
    command.env("TERM_PROGRAM", "Cortex");
    command.env("PATH", terminal_path());
    if let Some(dir) = resolve_cwd(cwd) {
        command.cwd(dir);
    }

    let child = pair
        .slave
        .spawn_command(command)
        .map_err(|error| TerminalError::Pty(error.to_string()))?;
    let mut reader = pair
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
    let output_session_id = session_id.clone();
    let output_app = app.clone();

    thread::spawn(move || {
        let mut buffer = [0_u8; 8192];
        loop {
            match reader.read(&mut buffer) {
                Ok(0) => break,
                Ok(read) => {
                    let _ = output_app.emit(
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

        let _ = output_app.emit(
            "terminal-exit",
            TerminalExit {
                session_id: output_session_id,
            },
        );
    });

    let session = TerminalSession {
        master: pair.master,
        writer: Mutex::new(writer),
        child: Mutex::new(child),
    };

    manager
        .sessions
        .lock()
        .map_err(|_| TerminalError::Lock)?
        .insert(session_id.clone(), session);

    Ok(session_id)
}

/// Pick a working directory for a new shell. Uses the requested directory when
/// it exists, otherwise falls back to the user's home so a stale or missing
/// saved path never prevents a session from starting.
fn resolve_cwd(cwd: Option<String>) -> Option<std::path::PathBuf> {
    if let Some(requested) = cwd {
        let path = std::path::PathBuf::from(&requested);
        if path.is_dir() {
            return Some(path);
        }
    }
    std::env::var_os("HOME").map(std::path::PathBuf::from)
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
