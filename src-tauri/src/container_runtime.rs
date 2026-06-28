//! Runtime state for running containers: one agent microVM per running container,
//! and exec sessions (shells) opened into it over the vsock UNIX socket.
//!
//! Booting/streaming uses the libkrun agent helper (`sandbox::agent_command`) and
//! the framed protocol (`agent-proto`). The store (metadata, rootfs) lives in
//! `containers`; this module owns the live processes and sockets.

use std::{
    collections::HashMap,
    os::unix::net::UnixStream,
    path::{Path, PathBuf},
    process::Child,
    sync::Mutex,
    time::{Duration, Instant},
};

use agent_proto::{write_exec, ExecRequest};
use tauri::{AppHandle, Manager};

use crate::{containers, sandbox};

const DEFAULT_VCPUS: u8 = 2;
const DEFAULT_RAM_MIB: u32 = 512;

/// Tracks the agent-VM helper process for each running container.
#[derive(Default)]
pub struct ContainerRuntime {
    running: Mutex<HashMap<String, Child>>,
}

impl ContainerRuntime {
    pub fn is_running(&self, id: &str) -> bool {
        self.running
            .lock()
            .map(|m| m.contains_key(id))
            .unwrap_or(false)
    }
}

fn agent_socket(containers_root: &Path, id: &str) -> PathBuf {
    containers_root.join(id).join("agent.sock")
}

/// Locate the bundled `cortex-init` for the guest (host) architecture: a bundled
/// resource in a packaged app, or the dev `agent-bin` directory.
fn agent_binary(app: &AppHandle) -> Option<PathBuf> {
    let arch = if cfg!(target_arch = "aarch64") {
        "aarch64"
    } else {
        "x86_64"
    };
    let name = format!("cortex-init-{arch}");

    if let Ok(resources) = app.path().resource_dir() {
        let bundled = resources.join("agent-bin").join(&name);
        if bundled.exists() {
            return Some(bundled);
        }
    }
    let dev = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("agent-bin")
        .join(&name);
    dev.exists().then_some(dev)
}

/// Copy the agent binary into the container rootfs at the path the VM execs. Done
/// on every run so an updated Cortex refreshes the agent.
fn inject_agent(app: &AppHandle, rootfs: &Path) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;

    let src = agent_binary(app)
        .ok_or_else(|| "agent binary not found; run `npm run build:agent`".to_string())?;
    let dst = rootfs.join(".cortex").join("init");
    if let Some(parent) = dst.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::copy(&src, &dst).map_err(|e| e.to_string())?;
    let mut perms = std::fs::metadata(&dst).map_err(|e| e.to_string())?.permissions();
    perms.set_mode(0o755);
    std::fs::set_permissions(&dst, perms).map_err(|e| e.to_string())
}

/// Ensure a container's agent VM is running, starting it if needed. Returns the
/// agent socket path.
pub fn ensure_running(
    app: &AppHandle,
    runtime: &ContainerRuntime,
    id: &str,
) -> Result<PathBuf, String> {
    let containers_root = crate::containers_root(app)?;
    let socket = agent_socket(&containers_root, id);

    if runtime.is_running(id) {
        return Ok(socket);
    }

    if containers::get(&containers_root, id).is_none() {
        return Err(format!("container not found: {id}"));
    }
    let rootfs = containers::rootfs_path(&containers_root, id);
    inject_agent(app, &rootfs)?;
    let _ = std::fs::remove_file(&socket);

    let config = sandbox::AgentConfig {
        rootfs,
        vcpus: DEFAULT_VCPUS,
        ram_mib: DEFAULT_RAM_MIB,
        socket: socket.clone(),
    };
    let mut command = sandbox::agent_command(&config).map_err(|e| e.to_string())?;
    let mut child = command.spawn().map_err(|e| e.to_string())?;

    if !wait_for_socket(&socket, Duration::from_secs(20)) {
        let _ = child.kill();
        let _ = child.wait();
        return Err("container agent did not become ready".to_string());
    }

    runtime
        .running
        .lock()
        .map_err(|_| "runtime lock".to_string())?
        .insert(id.to_string(), child);
    let _ = containers::set_running(&containers_root, id, true);
    Ok(socket)
}

/// Stop a running container: kill its agent VM and clear its socket. The rootfs
/// (and the container) remain.
pub fn stop(app: &AppHandle, runtime: &ContainerRuntime, id: &str) -> Result<(), String> {
    let containers_root = crate::containers_root(app)?;
    if let Some(mut child) = runtime
        .running
        .lock()
        .map_err(|_| "runtime lock".to_string())?
        .remove(id)
    {
        let _ = child.kill();
        let _ = child.wait();
    }
    let _ = std::fs::remove_file(agent_socket(&containers_root, id));
    let _ = containers::set_running(&containers_root, id, false);
    Ok(())
}

/// Open an exec session (a shell) in a container, starting it if needed. Returns
/// the connected socket after the `Exec` request is sent; the terminal layer
/// streams over it.
pub fn open_exec(
    app: &AppHandle,
    runtime: &ContainerRuntime,
    id: &str,
    command: Option<String>,
    cols: u16,
    rows: u16,
) -> Result<UnixStream, String> {
    let socket = ensure_running(app, runtime, id)?;
    let containers_root = crate::containers_root(app)?;
    let container =
        containers::get(&containers_root, id).ok_or_else(|| format!("container not found: {id}"))?;
    let command = command.unwrap_or(container.command);

    let mut stream = UnixStream::connect(&socket).map_err(|e| e.to_string())?;
    let request = ExecRequest {
        command,
        args: vec![],
        env: vec![
            "TERM=xterm-256color".into(),
            "COLORTERM=truecolor".into(),
            "TERM_PROGRAM=Cortex".into(),
            "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin".into(),
            "HOME=/root".into(),
        ],
        cwd: None,
        cols,
        rows,
    };
    write_exec(&mut stream, &request).map_err(|e| e.to_string())?;
    Ok(stream)
}

/// On startup no agent VMs are running, so clear any stale `running` flags and
/// leftover sockets from a previous (possibly crashed) session.
pub fn cleanup_on_start(app: &AppHandle) {
    let Ok(containers_root) = crate::containers_root(app) else {
        return;
    };
    for container in containers::list(&containers_root) {
        let _ = std::fs::remove_file(agent_socket(&containers_root, &container.id));
        if container.running {
            let _ = containers::set_running(&containers_root, &container.id, false);
        }
    }
}

fn wait_for_socket(path: &Path, timeout: Duration) -> bool {
    let start = Instant::now();
    while start.elapsed() < timeout {
        if UnixStream::connect(path).is_ok() {
            // Give the agent a moment to reach its accept loop before the first
            // real exec connection.
            std::thread::sleep(Duration::from_millis(150));
            return true;
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    false
}
