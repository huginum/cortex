## Why

Two friction points block real use of sandboxes. First, you must hand-prepare a rootfs directory
before anything runs — there's no way to just say "run `ubuntu:24.04`." Second, libkrun and its guest
kernel must be installed on the host, so the app isn't something you can simply hand to a machine and
run. This change removes both: fetch and run OCI images by reference, and ship a self-contained Linux
build (starting with ARM) that needs nothing else installed.

## What Changes

- Add **OCI image fetching** in pure Rust (the `oci-client` crate): pull an image by reference
  (e.g. `ubuntu:24.04`, `docker.io/library/alpine:latest`) for the guest architecture, unpack its
  layers (applying whiteouts) into a cached rootfs. No external tools (skopeo/buildah) — keeping the
  app self-contained.
- Add an **image cache** under the app data directory, keyed by image reference; it supersedes the
  manually-prepared `rootfs` directory from the previous change as the source of sandbox rootfs.
- Add a **"Run container" flow**: from the project toolbar (and split), pick an existing cached image
  (`name:tag`) or type a reference; if not cached, pull it (with progress) and then boot a sandbox
  pane from it.
- A sandbox pane now records an **image reference** (resolved to a cached rootfs) instead of a
  prepared-rootfs directory name. **BREAKING** to the sandbox pane's persisted shape (back-compatible
  default still loads host panes; sandbox panes from the previous change referenced a rootfs name).
- Add a **self-contained Linux AppImage** (ARM first) that embeds libkrun + libkrunfw, so the app
  runs without installing the VMM; the sandbox helper resolves the bundled libraries at runtime
  (`LD_LIBRARY_PATH`, the Linux mirror of the macOS dylib resolution). Documents the `/dev/kvm`
  runtime requirement and that ARM AppImages build on an ARM Linux host.

Out of scope (later): building images from Dockerfiles, pushing to registries, private-registry
authentication, the macOS self-contained bundle, and the network-policy/mediator north star.

## Capabilities

### New Capabilities
- `container-images`: Fetching OCI images by reference, unpacking them into a cached rootfs, listing
  cached images, and running a container by selecting a cached image or typing a reference (pulling
  if needed).
- `linux-app-bundle`: A self-contained Linux AppImage that embeds libkrun and libkrunfw and resolves
  them at runtime, so sandboxes run without a separate VMM install (given host `/dev/kvm`).

### Modified Capabilities
- `embedded-terminal`: A sandbox terminal session SHALL be defined by an image reference (resolved to
  a cached rootfs), rather than a prepared root filesystem.
- `project-management`: A persisted sandbox pane SHALL record an image reference, so reopening
  resolves it to a cached rootfs (pulling if needed) and boots a fresh microVM.

## Impact

- **Backend (Rust)**: new image module (pull via `oci-client`, layer unpack with whiteouts, cache
  management, list/resolve by reference); `sandbox`/`terminal` resolve a pane's image reference to a
  cached rootfs, pulling on demand; new Tauri commands for listing/pulling images with progress.
- **Frontend**: the sandbox menu lists cached images and accepts a typed reference; a pull-progress
  state; the pane session stores an image reference.
- **Dependencies**: `oci-client` (+ `flate2`/`tar`) added to `src-tauri`.
- **Packaging**: `tauri.conf.json` `bundle.linux.appimage.files` embeds `libkrun`/`libkrunfw`; the
  helper's library-path resolution generalized to Linux. Build of the ARM AppImage happens on an ARM
  Linux host (not derivable from the macOS dev machine).
- **Platform**: image fetching works on macOS and Linux; the AppImage targets Linux ARM first.
