//! `cortex-init` — the in-guest agent that runs as a container microVM's PID 1.
//!
//! It performs minimal init duties, then listens on vsock for exec sessions. Each
//! host connection (one shell) sends an `Exec` request; the agent allocates a PTY,
//! forks the command as a session leader with the PTY as its controlling terminal,
//! and proxies bytes between the PTY and the connection. Keeping the agent alive
//! across sessions is what makes a container "running" and lets multiple shells
//! share it.
//!
//! This binary targets Linux (musl, static) and is injected into each container's
//! rootfs by the host. See the `container-runtime` change.

use std::fs::File;
use std::io::{Read, Write};
use std::os::fd::{AsRawFd, OwnedFd, RawFd};
use std::thread;

use agent_proto::{
    parse_exec, parse_resize, read_frame, write_data, write_exit, FrameKind, ExecRequest,
    AGENT_VSOCK_PORT,
};
use nix::sys::wait::{waitpid, WaitStatus};
use nix::unistd::{ForkResult, Pid};
use vsock::{VsockListener, VsockStream};

fn main() {
    // Best-effort init; failures are non-fatal so the agent still serves.
    init_system();
    if let Err(error) = serve() {
        eprintln!("cortex-init: serve failed: {error}");
    }
    // As PID 1 we must not return; idle so the kernel doesn't panic.
    loop {
        std::thread::park();
    }
}

/// Minimal PID 1 setup: pseudo-filesystems and a hostname. Each step is
/// best-effort (e.g. when not actually PID 1 during debugging).
fn init_system() {
    use nix::mount::{mount, MsFlags};

    let _ = nix::unistd::sethostname("container");
    let none = None::<&str>;
    for (target, fstype) in [
        ("/proc", "proc"),
        ("/sys", "sysfs"),
        ("/dev", "devtmpfs"),
        ("/dev/pts", "devpts"),
    ] {
        let _ = std::fs::create_dir_all(target);
        let _ = mount(none, target, Some(fstype), MsFlags::empty(), none);
    }
}

fn serve() -> std::io::Result<()> {
    let listener = VsockListener::bind_with_cid_port(libc::VMADDR_CID_ANY, AGENT_VSOCK_PORT)?;
    for connection in listener.incoming() {
        match connection {
            Ok(stream) => {
                thread::spawn(move || {
                    if let Err(error) = handle_session(stream) {
                        eprintln!("cortex-init: session ended: {error}");
                    }
                });
            }
            Err(_) => continue,
        }
    }
    Ok(())
}

fn handle_session(mut stream: VsockStream) -> std::io::Result<()> {
    let (kind, payload) = read_frame(&mut stream)?;
    if kind != FrameKind::Exec {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            "expected an Exec frame to start a session",
        ));
    }
    let request = parse_exec(&payload)?;

    let winsize = libc::winsize {
        ws_row: request.rows,
        ws_col: request.cols,
        ws_xpixel: 0,
        ws_ypixel: 0,
    };
    let pty = nix::pty::openpty(Some(&winsize), None)
        .map_err(|e| std::io::Error::other(format!("openpty: {e}")))?;

    match unsafe { nix::unistd::fork() } {
        Ok(ForkResult::Child) => {
            // No return: either exec succeeds or we _exit.
            run_child(pty.slave, pty.master, &request);
        }
        Ok(ForkResult::Parent { child }) => {
            drop(pty.slave);
            proxy(stream, pty.master, child)
        }
        Err(e) => Err(std::io::Error::other(format!("fork: {e}"))),
    }
}

/// In the forked child: become a session leader, attach the PTY slave as the
/// controlling terminal and stdio, then exec the requested command.
fn run_child(slave: OwnedFd, master: OwnedFd, request: &ExecRequest) -> ! {
    use std::ffi::CString;

    let slave_fd = slave.as_raw_fd();
    let _ = nix::unistd::setsid();
    unsafe {
        libc::ioctl(slave_fd, libc::TIOCSCTTY, 0);
        libc::dup2(slave_fd, 0);
        libc::dup2(slave_fd, 1);
        libc::dup2(slave_fd, 2);
    }
    drop(master);
    if slave_fd > 2 {
        drop(slave);
    }

    if let Some(cwd) = &request.cwd {
        let _ = nix::unistd::chdir(cwd.as_str());
    }

    let path = CString::new(request.command.as_bytes()).unwrap_or_default();
    let mut argv = vec![path.clone()];
    argv.extend(
        request
            .args
            .iter()
            .filter_map(|a| CString::new(a.as_bytes()).ok()),
    );
    let envp: Vec<CString> = request
        .env
        .iter()
        .filter_map(|e| CString::new(e.as_bytes()).ok())
        .collect();

    // execvpe: PATH search with an explicit environment (no global env mutation
    // after fork).
    let _ = nix::unistd::execvpe(&path, &argv, &envp);
    unsafe { libc::_exit(127) }
}

/// In the parent: bridge the PTY master and the vsock connection until either side
/// closes, then reap the child and report its exit code.
fn proxy(stream: VsockStream, master: OwnedFd, child: Pid) -> std::io::Result<()> {
    let master = File::from(master);
    let mut master_read = master.try_clone()?;
    let mut master_write = master;

    let mut stream_write = stream.try_clone()?;
    let stream_shutdown = stream.try_clone()?;
    let mut stream_read = stream;

    // PTY -> Data frames. On EOF (the shell exited) reap, send Exit, and hang up
    // the connection so the read loop below unblocks.
    let reader = thread::spawn(move || {
        let mut buffer = [0u8; 8192];
        loop {
            match master_read.read(&mut buffer) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    if write_data(&mut stream_write, &buffer[..n]).is_err() {
                        break;
                    }
                }
            }
        }
        let code = reap(child);
        let _ = write_exit(&mut stream_write, code);
        let _ = stream_shutdown.shutdown(std::net::Shutdown::Both);
    });

    // Host frames -> PTY. Data is written to the master; Resize adjusts the
    // window. Loop ends when the host hangs up (or the reader shut us down).
    loop {
        match read_frame(&mut stream_read) {
            Ok((FrameKind::Data, bytes)) => {
                if master_write.write_all(&bytes).is_err() {
                    break;
                }
            }
            Ok((FrameKind::Resize, payload)) => {
                if let Ok(resize) = parse_resize(&payload) {
                    set_winsize(master_write.as_raw_fd(), resize.cols, resize.rows);
                }
            }
            Ok(_) => {}
            Err(_) => break,
        }
    }

    // The host closed: hang up the child so the reader thread reaps it.
    let _ = nix::sys::signal::kill(child, nix::sys::signal::Signal::SIGHUP);
    let _ = reader.join();
    Ok(())
}

fn reap(child: Pid) -> i32 {
    match waitpid(child, None) {
        Ok(WaitStatus::Exited(_, code)) => code,
        Ok(WaitStatus::Signaled(_, _, _)) => 137,
        _ => 0,
    }
}

fn set_winsize(fd: RawFd, cols: u16, rows: u16) {
    let winsize = libc::winsize {
        ws_row: rows,
        ws_col: cols,
        ws_xpixel: 0,
        ws_ypixel: 0,
    };
    unsafe {
        libc::ioctl(fd, libc::TIOCSWINSZ, &winsize);
    }
}
