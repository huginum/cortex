## 1. Container store, COW clone, names (testable on macOS)

- [x] 1.1 Add a `containers` module: store under `<app-data>/containers/<id>/` with `rootfs/` and `container.json` (`id`, `name`, `image`, `command`, `created`, `running`)
- [x] 1.2 Copy-on-write clone the image rootfs → container rootfs: APFS `clonefile` (macOS), `cp --reflink=auto` (Linux), full-copy fallback; unit/integration test that the image is untouched
- [x] 1.3 Generate Docker-style `adjective_noun` names (bundled word lists), enforce uniqueness; accept a user-specified name
- [x] 1.4 `create(image, name?, command?)`, `list()`, `remove(id)` (stopped only); Tauri commands for create/list/remove
- [x] 1.5 Custom command stored per container (default `/bin/sh`)

## 2. Guest init agent `cortex-init`

- [x] 2.1 New workspace member `cortex-init`: minimal Linux PID 1 (mount `/proc`, `/sys`, devtmpfs, set hostname, reap children)
- [x] 2.2 vsock server: listen on the agent port; accept one connection per exec session
- [x] 2.3 Per session: parse `Exec{cmd,args,env,cwd,cols,rows}`, allocate a PTY, fork the command with the PTY as controlling tty, proxy PTY ⇄ vsock
- [x] 2.4 Handle `Resize`, `Exit`/EOF, and clean child reaping; shutdown request stops the agent
- [x] 2.5 Static musl build for linux/arm64 and linux/amd64; bundle both with the app

## 3. Host: boot the agent VM + exec transport

- [x] 3.1 Inject the matching `cortex-init` into a container rootfs on run (refresh each run); boot the VM with `krun_set_exec(/.cortex/init)` and `krun_add_vsock_port2(port, <id>/agent.sock, listen=true)`
- [x] 3.2 Container manager: one agent VM (helper process) per running container; own `<id>/agent.sock`; track running state; stop tears down the VM and socket
- [x] 3.3 Define the framed vsock protocol (host side): `Exec`, `Data`, `Resize`, `Exit`; length-prefixed
- [x] 3.4 Exec-session transport: connect to `<id>/agent.sock`, send `Exec`, then bridge `Data` ⇄ `terminal-output`/`write_terminal` and `Resize`/`Exit`, integrated alongside the host-shell PTY path in `terminal.rs`
- [x] 3.5 Startup cleanup of stale sockets / mark crashed containers stopped

## 4. Exec lifecycle + Tauri commands

- [x] 4.1 `run_container(id)` (start agent VM if needed), `exec_shell(id, command?)` → a terminal session, `stop_container(id)`
- [x] 4.2 First exec starts the container; subsequent execs attach to the running VM; closing the last shell leaves it running (until stopped)
- [x] 4.3 One shell exiting ends only its session; stopping ends all

## 5. Frontend: containers, custom command, context-aware split

- [x] 5.1 Pane session becomes a container reference (`{ kind: 'container', id, command? }`); migrate legacy sandbox-image panes (create/run a container from the image)
- [x] 5.2 Run dialog: pick/enter image, optional name, optional command → create + run + open a shell pane
- [x] 5.3 Containers list UI (running/stopped) with run / stop / remove and "open shell"
- [x] 5.4 Context-aware split: split a container pane → exec another shell in the same container; split a host pane → host shell
- [x] 5.5 "New" affordance: host shell / new container / shell into an existing running container
- [x] 5.6 Label container panes by name (and command when non-default)

## 6. Persistence & migration

- [x] 6.1 Persist a container pane's container reference (and command); host panes unchanged
- [x] 6.2 Reopen: restore a container pane by starting its container if needed and opening a fresh shell
- [x] 6.3 Reopen with a removed container reports unavailable for that pane without failing others
- [x] 6.4 Legacy layouts (host, and image-sandbox from the prior change) still load

## 7. Verification

- [x] 7.1 `cargo build`/`clippy` clean (incl. `cortex-init`), `tsc`/`vite` build, container/COW unit tests pass
- [x] 7.2 (macOS dev) Create a container from `alpine`, run it, reach a shell; create a named container; run a custom command
- [x] 7.3 (macOS dev) Open a second shell into the same running container (and via split); confirm shared filesystem (a file made in one shell is visible in the other)
- [x] 7.4 (macOS dev) One shell exits without stopping the container; stop tears down all; remove deletes the rootfs; the image stays clean
- [x] 7.5 (macOS dev) Reopen a project and confirm a container pane restores by starting its container and opening a shell
- [x] 7.6 (ARM Linux host) Build with the arm64 agent and verify create/run/exec/split on the AppImage
