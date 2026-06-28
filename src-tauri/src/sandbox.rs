//! MicroVM sandboxes backed by libkrun.
//!
//! A sandbox session boots a microVM from a prepared root filesystem and runs an
//! interactive command (e.g. `/bin/sh`) inside it. Two libkrun constraints shape
//! the design (see `libkrun.h`):
//!
//! 1. `krun_start_enter` never returns — once the VM is configured the monitor
//!    takes over the process and `exit()`s with the workload's status.
//! 2. The implicit console binds to the calling process's own stdin/stdout.
//!
//! So libkrun cannot run on a thread inside the GUI process. Instead each sandbox
//! session runs in a **dedicated child process whose stdio is a PTY** — exactly
//! how `terminal.rs` already spawns a host shell. The child is Cortex itself,
//! re-executed as a hidden helper subcommand (`SANDBOX_HELPER_ARG`); `main.rs`
//! dispatches to [`run_helper`] before launching the GUI. Because it is the same
//! signed binary, the child inherits the macOS hypervisor entitlement.
//!
//! Acquiring a root filesystem (pulling/unpacking an OCI image) is out of scope
//! here; v1 boots from a prepared rootfs directory on disk.

use std::{
    ffi::{CString, OsString},
    path::PathBuf,
};

use portable_pty::CommandBuilder;
use serde::Serialize;

/// First argument that marks a process launch as the sandbox helper rather than
/// the GUI. Kept distinctive and underscored so it never collides with real CLI.
pub const SANDBOX_HELPER_ARG: &str = "__sandbox-run";

/// First argument marking a process launch as the container agent-VM helper: it
/// boots a container's microVM running the `cortex-init` agent with a vsock
/// channel, rather than running a single command. Never returns.
pub const CONTAINER_HELPER_ARG: &str = "__container-run";

const DEFAULT_VCPUS: u8 = 2;
const DEFAULT_RAM_MIB: u32 = 512;
const DEFAULT_COMMAND: &str = "/bin/sh";

/// How a sandbox microVM should be booted.
#[derive(Clone, Debug)]
pub struct SandboxConfig {
    /// Prepared root filesystem directory the microVM boots from.
    pub rootfs: PathBuf,
    /// Executable to run inside the guest, as an absolute guest path.
    pub command: String,
    pub vcpus: u8,
    pub ram_mib: u32,
}

impl SandboxConfig {
    pub fn new(rootfs: PathBuf) -> Self {
        Self {
            rootfs,
            command: DEFAULT_COMMAND.to_string(),
            vcpus: DEFAULT_VCPUS,
            ram_mib: DEFAULT_RAM_MIB,
        }
    }
}

/// Whether this host can run sandboxes, with a user-facing reason when it cannot.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SandboxSupport {
    pub supported: bool,
    pub reason: Option<String>,
}

impl SandboxSupport {
    fn ok() -> Self {
        Self {
            supported: true,
            reason: None,
        }
    }

    // Used only on hosts that can be unsupported (non-aarch64 macOS, Linux,
    // other OSes); dead on the always-supported macOS/aarch64 build.
    #[allow(dead_code)]
    fn no(reason: impl Into<String>) -> Self {
        Self {
            supported: false,
            reason: Some(reason.into()),
        }
    }
}

/// Detect whether the host supports the libkrun substrate. macOS needs Apple
/// Silicon (HVF is ARM64); Linux needs access to `/dev/kvm`.
#[cfg(all(target_os = "macos", target_arch = "aarch64"))]
pub fn sandbox_support() -> SandboxSupport {
    SandboxSupport::ok()
}

#[cfg(all(target_os = "macos", not(target_arch = "aarch64")))]
pub fn sandbox_support() -> SandboxSupport {
    SandboxSupport::no("Sandboxes require an Apple Silicon Mac.")
}

#[cfg(target_os = "linux")]
pub fn sandbox_support() -> SandboxSupport {
    match std::fs::OpenOptions::new()
        .read(true)
        .write(true)
        .open("/dev/kvm")
    {
        Ok(_) => SandboxSupport::ok(),
        Err(_) => SandboxSupport::no(
            "Sandboxes require access to /dev/kvm. Add your user to the `kvm` group.",
        ),
    }
}

#[cfg(not(any(target_os = "macos", target_os = "linux")))]
pub fn sandbox_support() -> SandboxSupport {
    SandboxSupport::no("Sandboxes are only supported on macOS and Linux.")
}

/// Build the host-side PTY command that launches a sandbox session: Cortex
/// re-executing itself as the helper. `terminal.rs` spawns this exactly like a
/// shell, so the existing transport/rendering/resize pipeline is reused as-is.
pub fn host_command(config: &SandboxConfig) -> std::io::Result<CommandBuilder> {
    let exe = std::env::current_exe()?;
    let mut command = CommandBuilder::new(exe);
    command.arg(SANDBOX_HELPER_ARG);
    command.arg(&config.rootfs);
    command.arg(config.vcpus.to_string());
    command.arg(config.ram_mib.to_string());
    command.arg(&config.command);
    if let Some((var, path)) = libkrun_library_env() {
        command.env(var, path);
    }
    Ok(command)
}

/// libkrun `dlopen`s libkrunfw by leaf name, so the helper needs its directory on
/// the dynamic loader's search path. Returns the loader env var and value for the
/// current platform, or `None` when the system path already suffices.
///
/// - macOS (dev): the Homebrew keg is off the default path; resolve it via
///   `brew --prefix` into `DYLD_FALLBACK_LIBRARY_PATH`.
/// - Linux (bundle): the embedded libraries sit next to the executable
///   (`../lib`); prepend that to `LD_LIBRARY_PATH`.
#[cfg(target_os = "macos")]
fn libkrun_library_env() -> Option<(&'static str, String)> {
    let output = std::process::Command::new("brew")
        .arg("--prefix")
        .arg("libkrunfw")
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let prefix = String::from_utf8(output.stdout).ok()?.trim().to_string();
    (!prefix.is_empty())
        .then(|| ("DYLD_FALLBACK_LIBRARY_PATH", format!("{prefix}/lib:/usr/local/lib:/usr/lib")))
}

#[cfg(target_os = "linux")]
fn libkrun_library_env() -> Option<(&'static str, String)> {
    // Bundle layout: <appdir>/usr/bin/cortex and <appdir>/usr/lib/*.so.
    let exe = std::env::current_exe().ok()?;
    let lib_dir = exe.parent()?.parent()?.join("lib");
    let bundled = lib_dir.to_string_lossy().into_owned();
    let value = match std::env::var("LD_LIBRARY_PATH") {
        Ok(existing) if !existing.is_empty() => format!("{bundled}:{existing}"),
        _ => bundled,
    };
    Some(("LD_LIBRARY_PATH", value))
}

#[cfg(not(any(target_os = "macos", target_os = "linux")))]
fn libkrun_library_env() -> Option<(&'static str, String)> {
    None
}

/// How a container's agent microVM is booted.
#[derive(Clone, Debug)]
pub struct AgentConfig {
    /// The container's copy-on-write rootfs (with `/.cortex/init` injected).
    pub rootfs: PathBuf,
    pub vcpus: u8,
    pub ram_mib: u32,
    /// Host UNIX socket the agent's vsock port is wired to.
    pub socket: PathBuf,
}

/// Build the plain (non-PTY) command that boots a container's agent VM by
/// re-executing Cortex as the container helper. The container manager spawns this
/// as a child and keeps it as the running VM; it does not need a PTY because the
/// agent is reached over the vsock socket, not its console.
pub fn agent_command(config: &AgentConfig) -> std::io::Result<std::process::Command> {
    let exe = std::env::current_exe()?;
    let mut command = std::process::Command::new(exe);
    command
        .arg(CONTAINER_HELPER_ARG)
        .arg(&config.rootfs)
        .arg(config.vcpus.to_string())
        .arg(config.ram_mib.to_string())
        .arg(&config.socket);
    if let Some((var, path)) = libkrun_library_env() {
        command.env(var, path);
    }
    Ok(command)
}

/// Entry point for the re-executed container helper child: boots the agent VM and
/// never returns.
pub fn run_agent_helper(mut args: std::env::ArgsOs) -> ! {
    let rootfs = args.next().map(PathBuf::from);
    let vcpus = parse_arg::<u8>(args.next());
    let ram_mib = parse_arg::<u32>(args.next());
    let socket = args.next().map(PathBuf::from);

    let (Some(rootfs), Some(vcpus), Some(ram_mib), Some(socket)) = (rootfs, vcpus, ram_mib, socket)
    else {
        eprintln!("cortex container helper: malformed arguments");
        std::process::exit(2);
    };

    run_agent_in_process(&AgentConfig {
        rootfs,
        vcpus,
        ram_mib,
        socket,
    })
}

/// Boot a container's microVM running the injected `cortex-init` agent, wiring its
/// vsock port to the host socket. Returns only on a configuration error.
#[cfg(any(target_os = "macos", target_os = "linux"))]
pub fn run_agent_in_process(config: &AgentConfig) -> ! {
    use std::os::unix::ffi::OsStrExt;

    unsafe {
        let ctx = ffi::krun_create_ctx();
        if ctx < 0 {
            fail("krun_create_ctx", ctx);
        }
        let ctx = ctx as u32;

        let ret = ffi::krun_set_vm_config(ctx, config.vcpus, config.ram_mib);
        if ret < 0 {
            fail("krun_set_vm_config", ret);
        }

        let Ok(root) = CString::new(config.rootfs.as_os_str().as_bytes()) else {
            eprintln!("cortex container helper: rootfs path contains a NUL byte");
            std::process::exit(2);
        };
        if ffi::krun_set_root(ctx, root.as_ptr()) < 0 {
            fail("krun_set_root", -1);
        }

        let Ok(socket) = CString::new(config.socket.as_os_str().as_bytes()) else {
            eprintln!("cortex container helper: socket path contains a NUL byte");
            std::process::exit(2);
        };
        // listen=true: the guest agent listens on the vsock port; the host
        // initiates connections through `socket`.
        let ret = ffi::krun_add_vsock_port2(
            ctx,
            agent_proto::AGENT_VSOCK_PORT,
            socket.as_ptr(),
            true,
        );
        if ret < 0 {
            fail("krun_add_vsock_port2", ret);
        }

        let exec = CString::new(AGENT_GUEST_PATH).unwrap_or_default();
        let argv: [*const std::os::raw::c_char; 1] = [std::ptr::null()];
        let env = guest_env();
        let envp = env.as_ptrs();
        if ffi::krun_set_exec(ctx, exec.as_ptr(), argv.as_ptr(), envp.as_ptr()) < 0 {
            fail("krun_set_exec", -1);
        }

        ffi::krun_start_enter(ctx)
    };

    fail("krun_start_enter", -1)
}

#[cfg(not(any(target_os = "macos", target_os = "linux")))]
pub fn run_agent_in_process(_config: &AgentConfig) -> ! {
    eprintln!("Sandboxes are only supported on macOS and Linux.");
    std::process::exit(1);
}

/// Where the agent binary is injected inside a container's rootfs.
pub const AGENT_GUEST_PATH: &str = "/.cortex/init";

/// Entry point for the re-executed helper child. Parses the arguments produced by
/// [`host_command`], boots the microVM, and never returns — `krun_start_enter`
/// takes over this process and exits with the workload's status.
pub fn run_helper(mut args: std::env::ArgsOs) -> ! {
    let rootfs = args.next().map(PathBuf::from);
    let vcpus = parse_arg::<u8>(args.next());
    let ram_mib = parse_arg::<u32>(args.next());
    let command = args.next().and_then(|c| c.into_string().ok());

    let (Some(rootfs), Some(vcpus), Some(ram_mib), Some(command)) =
        (rootfs, vcpus, ram_mib, command)
    else {
        eprintln!("cortex sandbox helper: malformed arguments");
        std::process::exit(2);
    };

    run_in_process(&SandboxConfig {
        rootfs,
        command,
        vcpus,
        ram_mib,
    })
}

fn parse_arg<T: std::str::FromStr>(value: Option<OsString>) -> Option<T> {
    value?.into_string().ok()?.parse().ok()
}

/// Configure and start the microVM via libkrun. Only returns (with an exit) on a
/// configuration error; on success `krun_start_enter` exits the process itself.
#[cfg(any(target_os = "macos", target_os = "linux"))]
pub fn run_in_process(config: &SandboxConfig) -> ! {
    use std::os::unix::ffi::OsStrExt;

    let code = unsafe {
        let ctx = ffi::krun_create_ctx();
        if ctx < 0 {
            fail("krun_create_ctx", ctx);
        }
        let ctx = ctx as u32;

        let ret = ffi::krun_set_vm_config(ctx, config.vcpus, config.ram_mib);
        if ret < 0 {
            fail("krun_set_vm_config", ret);
        }

        let Ok(root) = CString::new(config.rootfs.as_os_str().as_bytes()) else {
            eprintln!("cortex sandbox helper: rootfs path contains a NUL byte");
            std::process::exit(2);
        };
        let ret = ffi::krun_set_root(ctx, root.as_ptr());
        if ret < 0 {
            fail("krun_set_root", ret);
        }

        let Ok(exec) = CString::new(config.command.as_bytes()) else {
            eprintln!("cortex sandbox helper: command contains a NUL byte");
            std::process::exit(2);
        };
        // No extra argv (interactive shell); a NULL-terminated empty array.
        let argv: [*const std::os::raw::c_char; 1] = [std::ptr::null()];
        let env = guest_env();
        let envp = env.as_ptrs();
        let ret = ffi::krun_set_exec(ctx, exec.as_ptr(), argv.as_ptr(), envp.as_ptr());
        if ret < 0 {
            fail("krun_set_exec", ret);
        }

        // Returns only on error; on success the monitor exits the process.
        ffi::krun_start_enter(ctx)
    };

    fail("krun_start_enter", code)
}

#[cfg(not(any(target_os = "macos", target_os = "linux")))]
pub fn run_in_process(_config: &SandboxConfig) -> ! {
    eprintln!("Sandboxes are only supported on macOS and Linux.");
    std::process::exit(1);
}

#[cfg(any(target_os = "macos", target_os = "linux"))]
fn fail(call: &str, code: i32) -> ! {
    eprintln!("cortex sandbox helper: {call} failed ({code})");
    std::process::exit(1);
}

/// A NULL-terminated C environment for the guest workload, owned for the call.
struct GuestEnv {
    _owned: Vec<CString>,
    ptrs: Vec<*const std::os::raw::c_char>,
}

impl GuestEnv {
    fn as_ptrs(&self) -> &Vec<*const std::os::raw::c_char> {
        &self.ptrs
    }
}

/// A minimal, predictable environment for the guest — not the host's, which
/// references host-only paths.
#[cfg(any(target_os = "macos", target_os = "linux"))]
fn guest_env() -> GuestEnv {
    let vars = [
        "TERM=xterm-256color",
        "COLORTERM=truecolor",
        "TERM_PROGRAM=Cortex",
        "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
        "HOME=/root",
    ];
    let owned: Vec<CString> = vars
        .iter()
        .filter_map(|v| CString::new(*v).ok())
        .collect();
    let mut ptrs: Vec<*const std::os::raw::c_char> = owned.iter().map(|c| c.as_ptr()).collect();
    ptrs.push(std::ptr::null());
    GuestEnv {
        _owned: owned,
        ptrs,
    }
}

#[cfg(any(target_os = "macos", target_os = "linux"))]
mod ffi {
    use std::os::raw::c_char;

    // Linked via build.rs (`cargo:rustc-link-lib=dylib=krun`). Only the subset
    // of libkrun.h that v1 needs.
    unsafe extern "C" {
        pub fn krun_create_ctx() -> i32;
        pub fn krun_set_vm_config(ctx_id: u32, num_vcpus: u8, ram_mib: u32) -> i32;
        pub fn krun_set_root(ctx_id: u32, root_path: *const c_char) -> i32;
        pub fn krun_set_exec(
            ctx_id: u32,
            exec_path: *const c_char,
            argv: *const *const c_char,
            envp: *const *const c_char,
        ) -> i32;
        pub fn krun_add_vsock_port2(
            ctx_id: u32,
            port: u32,
            c_filepath: *const c_char,
            listen: bool,
        ) -> i32;
        pub fn krun_start_enter(ctx_id: u32) -> i32;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn host_command_targets_the_helper() {
        let config = SandboxConfig::new(PathBuf::from("/tmp/rootfs"));
        let command = host_command(&config).unwrap();
        let args: Vec<String> = command
            .get_argv()
            .iter()
            .map(|a| a.to_string_lossy().into_owned())
            .collect();
        assert!(args.iter().any(|a| a == SANDBOX_HELPER_ARG));
        assert!(args.iter().any(|a| a == "/tmp/rootfs"));
        assert!(args.iter().any(|a| a == DEFAULT_COMMAND));
    }
}
