## Context

Cortex is a Tauri (Rust backend + React frontend) desktop terminal. Today a terminal pane is a
host shell: `terminal.rs` opens a PTY via `portable-pty`, spawns `$SHELL`, and streams bytes to a
libghostty-vt emulator rendered on a canvas. Panes live in a per-project split-pane tree
(`layout.ts`) persisted per git repository.

The product north star is running isolated workloads as microVMs from OCI images, behind a
policy-governed network boundary (egress proxy, mediators, service sandboxes). This change is the
first, deliberately small step: boot a microVM from an OCI image and let a user work inside it
through the terminal Cortex already has. Network policy, mediators, services, and image building
are explicitly deferred.

The substrate fork was resolved by the platform target. Linux **and** macOS + OCI images +
microVM has one common denominator: **libkrun** (KVM on Linux, Hypervisor.framework on
macOS/ARM64). Apple's `container` is Mac-only and is therefore out; plain containerd without a VMM
does not isolate. Windows is out by choice.

## Goals / Non-Goals

**Goals:**
- Boot a microVM from an OCI image and run an interactive command (e.g. `/bin/sh`) on a PTY.
- Reuse the existing terminal pipeline (transport, libghostty-vt, resize, exit) unchanged for
  sandbox sessions — only the process behind the PTY differs.
- Make a pane a *session of a chosen kind* (host shell or sandbox) so both coexist in one layout.
- Keep the substrate swappable behind a Rust `Sandbox` trait.
- Ship the macOS signing/entitlement and Linux `/dev/kvm` plumbing required to run VMs.

**Non-Goals:**
- Network policy, egress proxy, mediators/bridges, service sandboxes (Forgejo).
- Image building, registries, or rich image management beyond listing what is locally available.
- Windows support; Intel macOS support (HVF is ARM64-only).
- Persisting live VM state or scrollback across reopen (fresh sessions on restore, as today).

## Decisions

### Decision: libkrun family as the microVM substrate
Linux+macOS+OCI+microVM converges on libkrun. **Alternatives considered:** Apple `container`
(rejected: Mac-only, breaks the Linux target); containerd-only (rejected: not a VMM, no
isolation); full Firecracker/Cloud-Hypervisor (rejected: Linux-only on the host side). libkrun is
a C-API library (Rust internally) designed to be embedded, which suits Cortex's Rust backend.

### Decision: link `libkrun` directly (via `krun-sys`), not a CLI
v1 drives the microVM by linking libkrun directly through a minimal in-tree FFI binding to its C API
(only the handful of functions v1 needs), rather than shelling out to a CLI or pulling a larger
bindings crate. libkrun is a C-API library designed for embedding, and Cortex's backend is already
Rust, so this is the natural home. `build.rs` resolves the library (Homebrew keg on macOS, or
`LIBKRUN_LIB_DIR`). The decisive reason to skip a CLI step entirely: the
north-star egress proxy requires Cortex to own the guest's virtio-net (TSI/passt), which a CLI
hides; linking libkrun puts that control in-process from the start.

libkrun's configuration model is `krun_create_ctx` → `krun_set_vm_config` (vcpus, ram) →
`krun_set_root(dir)` → `krun_set_exec(path, argv, envp)` → `krun_start_enter`.

**Alternatives considered:** a `krunvm` CLI spike first (rejected: throwaway work and a shipped CLI
dependency, when libkrun-direct is the known destination); nerdbox/containerd shim (rejected: a
containerd daemon + EROFS snapshotter + experimental shim is heavy to bundle; revisit when registry
image management lands).

### Decision: each microVM runs in its own child process, spawned into a PTY (the crux)
Two hard constraints from `libkrun.h` shape the whole integration:
1. `krun_start_enter` **never returns** — once the VM is configured, "the VMM assumes it has full
   control of the process" and calls `exit()` with the workload's exit code when the VM shuts down.
2. The implicit console binds to the **calling process's own stdin/stdout**.
   `krun_set_console_output` is output-only and explicitly *ignores stdin*, so it cannot back an
   interactive shell.

Therefore libkrun cannot run on a thread inside the Tauri app (it would terminate Cortex and fight
over the app's stdio). Instead, **each sandbox session runs in a dedicated child process whose
stdio is a PTY slave** — exactly how `terminal.rs` already spawns a host shell via `portable-pty`.
The child configures libkrun and calls `krun_start_enter`; its fd 0/1/2 are the PTY, so the implicit
console gives a bidirectional interactive shell, and the `exit()` only ends that child. Multiple
sandboxes are multiple child processes, each with its own PTY — a perfect fit for the existing
per-session model.

The child process is **Cortex re-executing itself** as a hidden helper subcommand (e.g.
`cortex __sandbox-run <rootfs> -- <cmd>`), so no second binary ships and the helper links the same
libkrun. `main.rs` dispatches to the helper when invoked with that argument instead of launching the
GUI. **Alternatives considered:** a separate helper binary (rejected: extra artifact to build/sign;
re-exec is simpler); a vsock data channel instead of the console (rejected for v1: more moving parts
than a console for one interactive shell).

### Decision: the `Sandbox` trait abstracts the host PTY command + the in-process runner
Given the process model, the swappable seam is not "run returns a PTY handle" but two paired
operations: building the host-side PTY command that launches a workload (`host_command(config) ->
CommandBuilder`, used by `terminal.rs`) and the in-child runner that actually boots it
(`run_in_process(config) -> !`, called from the helper subcommand), plus capability detection. A
future substrate (a remote runner, or a different VMM) can implement the same seam differently
without touching `terminal.rs` or the session model.

### Decision: v1 boots from a prepared rootfs; OCI pull/unpack is the next change (option B)
libkrun does not pull or unpack OCI images — it boots from an existing root filesystem **directory**
and runs a single executable. So "run an image" decomposes into (1) get an unpacked rootfs and
(2) boot it. v1 takes only step 2: it boots from a prepared rootfs directory already on disk, which
is the smallest path to a working shell-in-a-microVM and proves the libkrun + PTY integration.
Step 1 — pulling an image reference from a registry and unpacking its layers (e.g. via
`oci-distribution` + tar/gzip) — is the immediate follow-on change that delivers the
fetch-images-and-run vision. **Alternatives considered:** full OCI pull in v1 (rejected for now:
adds registry + layer-unpack code on top of an unvalidated libkrun/PTY path; sequence it after the
substrate is proven).

### Decision: the existing terminal pipeline is reused unchanged
Because a sandbox session is a child process in a PTY (above), the existing reader-thread →
`terminal-output` → libghostty-vt → canvas pipeline, and the `write_terminal` / `resize_terminal` /
`terminal-exit` paths, all work without modification. Only the command spawned into the PTY differs:
a host shell for host panes, the re-exec sandbox helper for sandbox panes.

### Decision: A pane is a session of a kind, not always a host shell
`PaneNode` gains a `session` describing its kind: `{ kind: "host", cwd }` (today's behavior) or
`{ kind: "sandbox", image }`. The backend `start_terminal` path branches on kind to spawn either
`$SHELL` or a sandbox command, returning the same session id + PTY transport. **Alternatives
considered:** a separate top-level "Sandboxes" view (rejected by product decision — sandboxes
should sit beside host shells in the workspace); a second parallel transport for sandboxes
(rejected: needless duplication, the transport is already backend-agnostic).

### Decision: macOS signing/entitlement and guest-kernel bundling are part of this change
Running a libkrun VM on macOS requires the app to be code-signed with
`com.apple.security.hypervisor`, even in dev (HVF refuses otherwise), and the guest kernel
(libkrunfw) must be bundled. On Linux the process needs `/dev/kvm` access (user in `kvm` group).
These are not optional follow-ups — without them nothing boots — so they are in scope here.

## Risks / Trade-offs

- **macOS dev loop friction (entitlement/signing)** → Establish an ad-hoc signing step with the
  hypervisor entitlement wired into `tauri:dev`; document it in the developer guide so the VM path
  works locally without a full distribution build.
- **Intel Macs unsupported (HVF is ARM64)** → Accepted limitation; detect and present a clear
  "Apple Silicon required" message rather than failing obscurely.
- **`krunvm`/buildah behavior differs across Linux and macOS** → Treat the CLI strictly as a spike
  behind the trait; validate the image→shell path on both OSes early, and let problems push the
  timeline toward libkrun-direct rather than leaking CLI quirks into the model.
- **Isolation is microVM-grade, not a hardened hypervisor boundary** (libkrun: "guest and VMM share
  a security context") → Acceptable for v1; the real trust model (untrusted agents) depends on the
  later policy/egress layer, so this change must not advertise isolation alone as the security story.
- **Bundling libkrun + libkrunfw inflates the app and complicates packaging** → Keep the substrate
  behind the trait and load/bundle per-platform; revisit packaging when image management lands.
- **libkrun `dlopen`s libkrunfw by leaf name, which the dynamic loader can't find off the Homebrew
  keg path** → For dev, `host_command` sets `DYLD_FALLBACK_LIBRARY_PATH` on the helper, resolved via
  `brew --prefix libkrunfw`. This is a dev-only resolution; distribution (task 1.3) must instead
  embed libkrunfw in the bundle and reference it via `@rpath`.
- **Pane schema migration** → New `session` field defaults to `{ kind: "host", cwd }` when absent,
  so existing saved layouts load unchanged.

## Migration Plan

1. Add the `session` field to the persisted pane schema with a back-compatible default of host
   shell; existing `layouts.json` entries load as host-shell panes with no rewrite.
2. Land the `Sandbox` trait + `krunvm` spike implementation behind it; gate sandbox UI so host
   shells are entirely unaffected if the substrate is unavailable.
3. Add macOS entitlement/signing and Linux `/dev/kvm` documentation + dev-loop wiring.

Rollback: sandbox panes are additive; disabling the sandbox spawn path leaves host-shell terminals
and existing layouts fully functional.

## Open Questions

- Where do locally available OCI images come from for the v1 image picker — `krunvm list` /
  buildah store, or a minimal Cortex-managed list? (Leaning on the substrate's own store for the
  spike.)
- Default resource limits (vCPUs, memory) for a v1 sandbox, and whether they are surfaced in UI or
  fixed for now.
- How a sandbox pane labels itself in the UI (image name/tag) versus a host shell pane.
