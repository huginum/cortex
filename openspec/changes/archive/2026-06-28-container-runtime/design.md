## Context

Sandboxes currently boot a microVM directly from the cached image rootfs via libkrun
(`krun_set_root` + `krun_set_exec(/bin/sh)`), mounted read-write — so writes mutate the shared image
and there is no notion of a container instance or of more than one shell. This change introduces the
Docker-style container model and, with it, the one genuinely hard piece: **multiple shells in one
running microVM**.

The hard constraint (from the prior change): `krun_start_enter` runs a single workload as the VM's
init and never returns; there is no API to inject another process into a running VM. Therefore
multi-exec requires the container's PID 1 to be an agent we control, exposing a control channel.
libkrun provides exactly the needed plumbing: `krun_add_vsock_port2(ctx, port, host_unix_socket,
listen=true)` wires a guest vsock port to a host UNIX socket. The host opens one connection per
shell; the guest agent accepts each and spawns a PTY-backed command. This is the same shape kata /
nerdbox use.

## Goals / Non-Goals

**Goals:**
- Containers as image instances: id + name, copy-on-write rootfs, custom command, persistence, list,
  and lifecycle (create/run/stop/remove).
- Multiple shells into one running container via a guest init agent over vsock.
- Context-aware split (split a container pane → another shell in the same container).
- Keep the cached image immutable; the host-shell path unchanged.

**Non-Goals:**
- Image build/push, registry auth, networking/port mapping, volumes, resource-limit UI (later).
- Reaping orphaned containers across app restarts beyond a best-effort cleanup.

## Decisions

### Decision: a container is an image instance with a COW rootfs
`create(image, name?, command?)` clones the immutable cached image rootfs into
`<app-data>/containers/<id>/rootfs` copy-on-write, and writes `container.json`
`{ id, name, image, command, created, … }`. The clone uses APFS `clonefile` on macOS, `cp
--reflink=auto` on Linux (btrfs/xfs), and a full recursive copy as fallback. id is a short random hex
string; name is a generated `adjective_noun` (Docker-style) unless specified, and must be unique.
The container persists until `remove`. **Alternatives considered:** an overlay (lower=image,
upper=container) mounted on the host (rejected: macOS has no host overlayfs; COW clone is uniform and
simple); per-run ephemeral copy with no instance identity (rejected: the user wants named, listable
containers).

### Decision: the container's PID 1 is `cortex-init`, a guest agent over vsock (the crux)
A small static Linux binary (`cortex-init`, built for linux/{arm64,amd64} with musl) is **injected
into each container's rootfs** at create time (e.g. `/.cortex/init`). The container VM boots with
`krun_set_exec("/.cortex/init")` and `krun_add_vsock_port2(VSOCK_PORT, "<id>/agent.sock",
listen=true)`. The agent:
- performs minimal PID 1 duties: mount `/proc`, `/sys`, `/dev` (devtmpfs), set hostname, reap
  children;
- listens on the vsock port; each accepted connection is one **exec session**;
- per session: reads an `Exec` request, allocates a PTY, forks the command in a new session with the
  PTY as controlling terminal and the requested env/cwd, and proxies PTY ⇄ vsock;
- keeps the VM alive while it runs; exits (stopping the container) on a shutdown request or when the
  host closes the control connection.

**Alternatives considered:** reuse the image's own init (systemd) + sshd for exec (rejected: heavy,
fragile, image-dependent); one VM per shell sharing the COW rootfs (rejected: concurrent rw
corruption, not the same instance); a fuse/9p control file (rejected: vsock is the supported, simple
path).

### Decision: a framed vsock protocol, one connection per exec session
Each exec session is one host↔guest connection carrying length-prefixed frames:
`Exec{cmd,args,env,cwd,cols,rows}` (host→guest, first frame), `Data{bytes}` (both directions),
`Resize{cols,rows}` (host→guest), `Exit{code}` (guest→host). Multiplexing happens at the
connection level (N shells = N connections), so each session's data path stays simple. The host
demuxes frames: `Data` → `terminal-output`; `write_terminal` → `Data`; `resize_terminal` →
`Resize`; `Exit`/EOF → `terminal-exit`. **Alternatives considered:** a single multiplexed connection
with stream ids (rejected: more host/guest complexity than one-conn-per-shell for v1).

### Decision: an exec session is a new terminal transport alongside the PTY one
`terminal.rs`'s session becomes an abstraction over a byte source/sink + resize, with two
implementations: the existing `portable-pty` (host shell) and a new **vsock exec** transport
(container). The streaming thread, `write_terminal`, `resize_terminal`, and `terminal-exit` work for
both; only construction and the resize/exit mechanics differ. The host-shell path is untouched.
**Alternatives considered:** force the container shell through a host PTY too (rejected: the PTY is
in the guest; the host side is a byte stream).

### Decision: one agent VM per running container; execs attach to it
The first run of a container starts its helper process (Cortex re-exec'd) which boots the agent VM
and owns `<id>/agent.sock`. Subsequent execs (including splits) open new connections to that socket —
no new VM. Stopping the container shuts the agent down and removes the socket. A container with no
open shells stays running until explicitly stopped (like `docker run -d`), or — configurable later —
auto-stops when its last shell closes.

### Decision: context-aware split
Splitting a pane consults the focused pane's kind: a container pane → exec another shell in the same
container (default command); a host pane → another host shell. A separate "new" affordance offers
host shell / new container / exec into an existing running container. The split toolbar action thus
becomes "same-context shell".

## Risks / Trade-offs

- **The guest agent is a real subsystem (PID 1 + vsock + in-guest PTY)** → Keep it small and
  single-purpose; develop it against a tiny rootfs (alpine/busybox) and test exec/resize/exit on both
  arches before wiring the UI.
- **Building/bundling a per-arch static guest binary** → Build `cortex-init` with musl for
  linux/arm64 and linux/amd64; bundle both and inject the matching one. Document the cross-build.
- **COW clone cost on non-reflink filesystems (ext4)** → Instant on APFS/btrfs/xfs; on ext4 it's a
  full copy — log it and accept for v1; revisit with a layered store later.
- **Concurrent writers within one container** → All execs share one VM/rootfs, so writes are
  serialized by the single guest kernel — safe. Two *containers* never share a rootfs.
- **Orphaned VMs/sockets after a crash** → Track running containers in the store; on startup, clean
  up stale sockets and mark containers stopped.
- **vsock connection ⇄ terminal lifecycle** → Treat the control connection as the session lifetime;
  EOF closes the pane; closing a pane closes the connection (and the in-guest shell).
- **Protocol/version skew between host and injected agent** → Inject the agent from the bundled copy
  on every run (not just create), so an updated Cortex refreshes `/.cortex/init`.

## Migration Plan

1. Container store + COW clone + name generation + custom command; a sandbox pane references a
   container id. Cached images stay immutable. (Testable on macOS: clone speed, persistence.)
2. `cortex-init` guest agent + vsock protocol; boot a container VM with the agent; one exec session
   end-to-end (a shell in a container). (Test on macOS dev.)
3. Multiple execs into one container; context-aware split; containers list + lifecycle UI.
4. Per-arch agent build/bundle; verify on ARM Linux.

Rollback: containers are additive; the host-shell path and the existing image-fetch path remain. If
the agent path fails, a container can still be booted with a direct `/bin/sh` (single shell, no
exec) as a fallback.

## Open Questions

- Auto-stop a container when its last shell closes, or keep it running until explicitly stopped?
- Where do containers appear in the UI — a global list, per-project, or both?
- Name generator word lists (bundle a small adjective/noun set) and collision handling.
- Should `stop` preserve the rootfs (default) with only `remove` deleting it? (Assumed yes.)
