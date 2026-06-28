## 1. Toolchain, platform & developer docs

- [x] 1.1 Link against libkrun/libkrunfw (a minimal in-tree FFI binding; `build.rs` resolves the Homebrew `libkrun/krun` keg, or `LIBKRUN_LIB_DIR`); `cargo build` links
- [x] 1.2 Add macOS code-signing with the `com.apple.security.hypervisor` entitlement (`Entitlements.plist` wired into `tauri.conf.json`; `scripts/codesign-dev.sh` + `npm run sandbox:sign-dev` for the dev binary)
- [x] 1.3 (scope moved) Distribution bundling of libkrun/libkrunfw into a self-contained artifact is tracked in the follow-on `container-images-and-linux-bundle` change (Linux AppImage first); dev runs load libkrun from Homebrew/system
- [x] 1.4 Update developer setup docs: libkrun toolchain (`brew tap`/`trust`/`install libkrun`), the macOS hypervisor entitlement, the Apple-Silicon requirement, the Linux `/dev/kvm` requirement, and preparing a rootfs
- [x] 1.5 Add host capability detection: report sandboxes unavailable on non–Apple-Silicon macOS and on Linux without `/dev/kvm`

## 2. Sandbox substrate (libkrun, in a child process)

- [x] 2.1 Define the sandbox seam in `src-tauri/src/sandbox.rs`: `host_command(config)`, `run_in_process(config) -> !`, capability detection, and `SandboxConfig { rootfs, command, vcpus, ram_mib }`
- [x] 2.2 Implement `run_in_process` via the libkrun FFI: `krun_create_ctx` → `krun_set_vm_config` → `krun_set_root` → `krun_set_exec` → `krun_start_enter` (runs in the helper child, takes over its stdio/PTY, never returns)
- [x] 2.3 Add the hidden helper subcommand dispatch in `main.rs` (`__sandbox-run <rootfs> <vcpus> <ram> <cmd>`) that calls `run_helper` instead of launching the GUI
- [x] 2.4 Provide a prepared-rootfs source (`list_rootfs`/`resolve_rootfs` under the app `rootfs` config dir) and a `list_sandbox_rootfs` Tauri command (no registry pull)

## 3. Generalize terminal spawn to session kinds

- [x] 3.1 Add a session kind to `start_terminal` (`kind`/`rootfs` args); for sandbox, build the PTY command via `sandbox::host_command` (re-exec helper) instead of `$SHELL`
- [x] 3.2 `subscribe_terminal`, `write_terminal`, `resize_terminal`, and `terminal-exit` reused unchanged for sandbox-backed sessions (child-process-in-PTY model)
- [x] 3.3 On sandbox session end (workload exit or pane close), the existing exit/`stop_terminal` path closes the pane and kills the child/VM
- [x] 3.4 Register `sandbox_support` and `list_sandbox_rootfs` Tauri commands in `lib.rs`; `start_terminal` carries the sandbox args

## 4. Frontend pane session model

- [x] 4.1 Extend `PaneNode` in `layout.ts` with a `session` union (`host { cwd }` | `sandbox { rootfs }`); add `createSandboxPane`
- [x] 4.2 Thread the session through `TerminalPane` and `startTerminalSession` (was `startLocalTerminal`)
- [x] 4.3 Add a sandbox menu in the project toolbar that lists available rootfs (and host support) and opens a sandbox pane
- [x] 4.4 Label sandbox panes with their rootfs (badge in the pane) so they are distinguishable from host-shell panes

## 5. Persistence & migration

- [x] 5.1 The persisted pane carries `session`; a pane with no session loads as host shell (`isLayoutNode` accepts legacy panes, `hydrateSession` defaults to host)
- [x] 5.2 Persist and reload sandbox panes (rootfs reference) alongside host-shell panes (working directory) — layout JSON is frontend-owned, so no Rust schema change
- [x] 5.3 Restore sandbox panes on reopen by starting a fresh microVM from the recorded rootfs; host-shell panes restore as before
- [x] 5.4 Legacy `layouts.json` entries (bare `cwd`, no session) load as host-shell panes with no rewrite

## 6. Verification

- [x] 6.1 `cargo build` links libkrun, `npx vite build` + `tsc --noEmit` pass, `cargo clippy` clean on new code, sandbox unit tests pass; capability detection implemented
- [x] 6.2 (manual, signed dev build) Boot a prepared rootfs in a pane and reach an interactive `/bin/sh` — verified booting an alpine rootfs from the cube menu
- [x] 6.3 (manual) Confirm keyboard input and output rendering work in a sandbox pane (interactive shell confirmed)
- [x] 6.4 (manual) Confirm a sandbox workload exit closes only its pane and frees its VM, leaving the app and other panes running — verified
- [x] 6.5 (manual) Reopen the project and confirm the sandbox pane restores from its rootfs and a legacy layout loads as host shells — verified
