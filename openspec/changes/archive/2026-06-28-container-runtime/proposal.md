## Why

Today a sandbox boots a microVM directly from the (mutable, shared) cached image rootfs, so writes
dirty the image and concurrent runs of the same image would collide. That's not how containers
should work. Users expect the Docker model: instantiate an image into a **container** with an id and
a name, on its own copy-on-write filesystem, and open **multiple shells into that one running
container**. This change builds that — the core of a microVM container runtime.

## What Changes

- Introduce **containers**: an instance created from an image, with a generated id and a name
  (auto, Docker-style `adjective_noun`, or user-specified), its own **copy-on-write rootfs** (APFS
  `clonefile` on macOS, reflink on Linux, full-copy fallback), persisting until removed. The cached
  image stays immutable. **BREAKING**: a sandbox pane now references a container, not an image
  directly.
- Run a container with a **custom command** (defaults to `/bin/sh`), not always `/bin/sh`.
- Introduce a **guest init agent** (`cortex-init`, a static Linux binary injected into each
  container rootfs) that runs as the VM's PID 1, keeps the container alive, and multiplexes shells
  over **vsock**: the host opens an exec session per shell and the agent spawns the command with a
  PTY inside the guest.
- **Exec into a running container**: open additional shells in the same container without booting a
  new VM. A container is "running" while its agent VM is alive; stopping it tears the VM down.
- **Context-aware split**: splitting a container pane execs another shell **in the same container**;
  splitting a host pane makes another host shell; a "new" action offers host / new container / a
  shell into an existing container.
- A **containers list** (running and stopped) with create / run / stop / remove.

Out of scope (later): image build/push, private-registry auth, container networking/port mapping
and the egress-policy north star, volumes/bind mounts, and resource limits UI.

## Capabilities

### New Capabilities
- `containers`: Container instances from images — id + name, copy-on-write rootfs, custom command,
  persistence, and lifecycle (create, run, stop, remove, list).
- `container-exec`: The guest init agent and host↔guest vsock protocol that keep a container running
  and multiplex multiple shells (exec) into it, with PTY and resize over the channel.

### Modified Capabilities
- `microvm-sandboxes`: The substrate boots a container's copy-on-write rootfs with the init agent as
  PID 1 and a vsock channel, and supports exec sessions, rather than running a single command
  directly from an image rootfs.
- `embedded-terminal`: A sandbox pane is backed by an exec session in a container; splitting a
  container pane execs another shell in the same container.
- `project-management`: A persisted sandbox pane references a container (and its command); reopening
  re-runs/attaches the container rather than booting a fresh image rootfs.

## Impact

- **New guest binary** `cortex-init` (Rust, `no_std`-ish static musl build for linux/arm64 and
  linux/amd64): PID 1 duties, vsock exec server, in-guest PTY management. Built and bundled per arch,
  injected into each container's rootfs on create.
- **Backend**: container store + COW clone + name generation; a container manager (boot the agent VM,
  own the vsock socket, track running state); an exec-session transport (vsock) integrated with the
  terminal streaming/resize path alongside the existing host-shell PTY path; lifecycle + list Tauri
  commands.
- **Frontend**: containers list UI; run dialog (image, optional name, command); context-aware split
  menu; a pane references a container id + command.
- **Substrate**: `terminal.rs`/`sandbox.rs` gain the agent boot path (`krun_add_vsock_port`,
  `krun_set_exec` to the injected init) and the exec transport; the host-shell path is unchanged.
- **Platform**: Linux + macOS (Apple Silicon), as before.
