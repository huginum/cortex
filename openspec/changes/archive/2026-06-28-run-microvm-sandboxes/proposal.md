## Why

Cortex's long-term goal is to run isolated workloads — for AI agents and for Cortex's own
services — as microVMs built from OCI images, governed by a policy boundary. None of that is
possible until Cortex can do the most basic thing: boot a microVM from an OCI image and let a
person work inside it. This change delivers that foundation by reusing the terminal pipeline
Cortex already has, so a sandbox shell is just another pane next to a host shell.

## What Changes

- Introduce a microVM **sandbox** substrate by linking **libkrun directly** (a minimal in-tree FFI
  binding to its C API) into the Rust backend — KVM on Linux, Hypervisor.framework on macOS/ARM64.
  A sandbox
  boots from a root filesystem directory and runs a single interactive command (e.g. `/bin/sh`) on
  a PTY. Linking libkrun directly (rather than shelling out to a CLI) is the intended long-term
  home, because Cortex must own the VMM and guest networking for the later policy/egress work.
- Add a backend `Sandbox` abstraction (a Rust trait) so the substrate stays swappable behind a
  stable interface.
- For v1, a sandbox boots from a **prepared root filesystem directory** (option B). Pulling and
  unpacking OCI images from a registry is explicitly deferred to the immediate follow-on change;
  libkrun itself does not pull or unpack images.
- Generalize a terminal pane from "always a host shell" to a **session of a chosen kind**:
  a host shell (existing behavior) or a sandbox shell running in a microVM. **BREAKING** to the
  pane/layout model — a pane node gains a session kind.
- Reuse the existing terminal transport, libghostty-vt rendering, and resize path unchanged for
  sandbox sessions — only the backing differs: libkrun's guest console is wired to a host PTY.
- Add minimal UI to start a sandbox session in a pane from an available prepared rootfs.
- Add macOS code-signing with the `com.apple.security.hypervisor` entitlement, bundle the guest
  kernel (libkrunfw), take a build-time dependency on libkrun, and document the Linux `/dev/kvm`
  requirement and the libkrun toolchain setup.

Explicitly **out of scope** (later changes): OCI image pull/unpack and registry/image-library
management (the immediate next change), network policy, the egress proxy, mediators/bridges, and
persistent service sandboxes (e.g. Forgejo).

## Capabilities

### New Capabilities
- `microvm-sandboxes`: Booting a microVM from a prepared root filesystem via libkrun linked
  directly, running an interactive command on a PTY, and managing a sandbox session's lifecycle
  (create, run, stop). Covers the substrate abstraction, platform requirements (Apple Silicon +
  hypervisor entitlement on macOS, `/dev/kvm` on Linux), and the guest kernel bundling.

### Modified Capabilities
- `embedded-terminal`: A terminal session SHALL render output from either a local shell process
  or a sandbox shell process running in a microVM, using the same emulation and rendering path.
- `project-management`: A persisted pane SHALL carry a session kind (host shell or sandbox), so a
  project layout can reconstruct sandbox panes, not only host-shell panes.

## Impact

- **Backend (Rust, `src-tauri/`)**: new sandbox module wrapping libkrun (in-tree FFI binding) behind
  a host-command/in-process-runner seam; `terminal.rs` spawn path generalized to launch a host shell or a sandbox session
  behind the PTY; new Tauri commands for sandbox lifecycle and listing available rootfs sources.
- **Frontend (`src/`)**: `layout.ts` `PaneNode` gains a session kind; `TerminalPane`/transport
  pass the kind through; minimal affordance to open a sandbox pane from an available rootfs.
- **Persistence**: layout store schema gains the pane session kind (back-compatible default =
  host shell).
- **Dependencies / packaging / toolchain**: link libkrun + libkrunfw (build-time dependency,
  installed on macOS via the `libkrun/krun` Homebrew tap, resolved by `build.rs`); macOS hypervisor entitlement
  + signing in the bundle config; Linux `/dev/kvm` access. Developer setup docs updated.
- **Platform limits**: macOS support is Apple Silicon + macOS 14 only (HVF is ARM64); no Windows.
