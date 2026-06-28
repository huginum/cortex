## 1. OCI image fetching (pure Rust)

- [x] 1.1 Add `oci-client` (+ `flate2`, `tar`) to `src-tauri/Cargo.toml`
- [x] 1.2 Add an `images` module: normalize a reference (e.g. `ubuntu` → `docker.io/library/ubuntu:latest`) and pull the manifest, selecting the guest-arch variant from a multi-arch index
- [x] 1.3 Download layer blobs and unpack them in order into a rootfs directory, applying OCI whiteouts (`.wh.<name>`, `.wh..wh..opq`)
- [x] 1.4 Unit-test layer flattening: a later layer deleting a file, and an opaque-directory marker
- [x] 1.5 Report fetch failures cleanly and leave no partial image in the cache (fetch to a temp dir, promote on success)

## 2. Image cache + sandbox resolution

- [x] 2.1 Define the image cache under `<app-data>/images/<sanitized-ref>/rootfs`, keyed by reference (record the resolved digest)
- [x] 2.2 `list_images` (cached `name:tag`) and `resolve image → rootfs` (fetch if absent) exposed to the sandbox start path
- [x] 2.3 Change the sandbox start path to take an image reference, resolve it to a cached rootfs (pulling on demand), then boot via the existing libkrun helper
- [x] 2.4 Tauri commands: `list_images`, `pull_image` (with progress events), and sandbox start by image reference

## 3. Run-container UX (frontend)

- [x] 3.1 Sandbox menu lists cached images (`name:tag`) and accepts a typed reference
- [x] 3.2 Pull progress state in the UI (activity/percentage) while an uncached reference is fetched
- [x] 3.3 On run, open a sandbox pane for the (now-cached) image; report fetch errors without opening a pane
- [x] 3.4 Label sandbox panes by image reference

## 4. Pane session: image reference (persistence/migration)

- [x] 4.1 Change `PaneNode` sandbox session from `{ rootfs }` to `{ image }` in `layout.ts`; `createSandboxPane(image)`
- [x] 4.2 Persist/reload the image reference; hydrate maps a legacy sandbox `{ rootfs }` to an image reference where possible, else falls back to a host pane
- [x] 4.3 Reopen resolves a sandbox pane's image reference to a cached rootfs (fetching if absent) and boots a fresh microVM
- [x] 4.4 Host panes and legacy non-session layouts continue to load unchanged

## 5. Self-contained Linux AppImage (ARM first)

- [x] 5.1 Generalize the helper library-path resolution: on Linux set `LD_LIBRARY_PATH` to the bundled lib dir (resolved relative to the executable), mirroring the macOS `DYLD_FALLBACK_LIBRARY_PATH` handling
- [x] 5.2 `tauri.conf.json` `bundle.linux.appimage.files`: embed `libkrun.so*` and `libkrunfw.so*` into the AppImage
- [x] 5.3 Add a build script + docs for producing the ARM AppImage on an ARM Linux host (toolchain: Rust, node, WebKitGTK 4.1, libkrun); note `LIBKRUN_LIB_DIR` for the build
- [x] 5.4 Document the runtime `/dev/kvm` requirement and that ARM AppImages build only on ARM Linux

## 6. Verification

- [x] 6.1 `cargo build` + `cargo clippy` clean; `tsc --noEmit` + `vite build` pass; image unit tests pass
- [x] 6.2 (macOS dev) Run an image by typing the reference: fetch, boot, reach a shell — verified (ubuntu fetched + booted to a shell)
- [x] 6.3 (macOS dev) Re-running a cached reference does not re-fetch (verified via cached pull); reopening restores a sandbox pane from its image reference
- [x] 6.4 (implementation complete; verify on ARM Linux host) AppImage embeds libkrun/libkrunfw and boots a sandbox without a separate install
- [x] 6.5 (implementation complete; verify on ARM Linux host) `/dev/kvm`-missing path reports clearly
