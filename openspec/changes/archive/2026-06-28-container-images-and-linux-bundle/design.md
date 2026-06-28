## Context

The previous change (`run-microvm-sandboxes`) made a sandbox pane boot a microVM from a prepared
rootfs **directory** via libkrun, reusing the terminal pipeline. Two gaps remain before it's usable:
the rootfs must be hand-prepared, and libkrun/libkrunfw must be installed on the host. This change
closes both — fetch images by reference, and ship a self-contained Linux build.

libkrun boots from an unpacked rootfs directory (it does not pull or unpack images), so "run an
image" decomposes into: (1) acquire an unpacked rootfs for a reference, and (2) boot it — which the
sandbox substrate already does. This change adds (1) and the UX around it, plus Linux packaging.

The macOS dev machine cannot build the Linux artifact (Tauri Linux bundling needs a Linux host;
arm64 AppImages can only be built on ARM Linux). Image fetching is platform-agnostic and is built
and tested on macOS; the AppImage is built and verified on an ARM Linux host.

## Goals / Non-Goals

**Goals:**
- Pull an OCI image by reference for the guest arch, in pure Rust, and unpack it into a cached rootfs.
- Run a container by selecting a cached image or typing a reference (pull if missing, with progress).
- Persist a sandbox pane as an image reference; reopening resolves it (pulling if needed).
- A self-contained Linux ARM AppImage embedding libkrun + libkrunfw, runnable with only `/dev/kvm`.

**Non-Goals:**
- Building images from Dockerfiles; pushing to registries; private-registry auth.
- The macOS self-contained bundle (the dev flow still loads libkrun from Homebrew).
- Network policy / mediators (north star).

## Decisions

### Decision: pull images in pure Rust (`oci-client`), not via skopeo/buildah
Use the `oci-client` crate (formerly `oci-distribution`) to pull manifests and layer blobs, then
unpack with `flate2` + `tar`. Shelling out to skopeo/buildah/umoci would reintroduce exactly the
"install something else" friction this change removes, and would break the self-contained Linux
bundle. **Alternatives considered:** skopeo/umoci (rejected: external dependency); containerd/nerdbox
(rejected earlier: heavy daemon stack).

### Decision: the image cache supersedes the prepared-rootfs directory
Unpacked images live under `<app-data>/images/<sanitized-ref>/rootfs`, keyed by reference (with the
resolved digest recorded for cache validity). This cache is now the source of sandbox rootfs; the
previous change's manual `rootfs` directory is no longer the primary path. Listing cached images
enumerates this cache as `name:tag`. **Alternatives considered:** a content-addressed layer store
shared across images (rejected for v1: more machinery than needed; revisit if disk use matters).

### Decision: unpack layers sequentially, applying OCI whiteouts
Apply each layer's tar in manifest order into the rootfs, honoring `.wh.<name>` (delete entry) and
`.wh..wh..opq` (opaque-dir) whiteout markers, so the flattened rootfs matches the image's overlay
semantics. This is the one correctness-sensitive part and is unit-tested with crafted layers.

### Decision: select the layer set matching the guest architecture
When a reference resolves to a multi-arch image index, select the `linux/arm64` (Apple Silicon / ARM
Linux) or `linux/amd64` variant matching the guest, failing clearly if absent. v1 pulls public
images anonymously (handling Docker Hub's anonymous token flow, which `oci-client` supports).

### Decision: a sandbox pane stores an image reference, resolved on start
The pane session becomes `sandbox { image }` (was `sandbox { rootfs }`). On start (and on reopen),
the backend resolves the reference to a cached rootfs, pulling if absent, then boots. This keeps
layouts portable across machines (a reference travels; a local rootfs path does not). Persistence
stays frontend-owned JSON with a host-shell fallback, as before.

### Decision: self-contained Linux AppImage via embedded libraries + runtime path
`bundle.linux.appimage.files` copies `libkrun.so*` and `libkrunfw.so*` into the AppImage. The helper
generalizes the macOS `DYLD_FALLBACK_LIBRARY_PATH` resolution to Linux by setting `LD_LIBRARY_PATH`
to the bundled library directory (resolved relative to the running executable), so libkrun's runtime
`dlopen` of libkrunfw succeeds without a host install. `build.rs` already links `-lkrun`; the build
host needs libkrun present (system or `LIBKRUN_LIB_DIR`), distinct from the end-user "install
nothing" goal. **Alternatives considered:** `.deb` with a libkrun dependency (rejected: not
self-contained — requires installing libkrun); static linking (rejected: libkrunfw is a separate
loadable kernel blob).

## Risks / Trade-offs

- **Layer whiteout/opaque handling is subtle** → Implement to the OCI spec and unit-test with crafted
  layers (deleted file, opaque dir); a wrong flatten yields a broken guest rootfs.
- **Large pulls are slow and use disk** → Stream pull progress to the UI; cache by reference/digest
  so re-runs are instant; document where the cache lives.
- **Docker Hub anonymous rate limits / auth** → v1 supports anonymous public pulls; surface a clear
  error on auth/limit failures; private-registry auth is later.
- **arm64 AppImage builds only on ARM Linux; can't be produced from the macOS dev box** → Build on
  the ARM Linux desktop (or ARM Linux CI); provide a one-command script and document the build-host
  toolchain (Rust, node, WebKitGTK 4.1, libkrun).
- **Bundled libkrun must be found at runtime** → Set `LD_LIBRARY_PATH` to the bundled lib dir in the
  helper; verify on the target before relying on it.
- **`/dev/kvm` cannot be bundled** → It's a kernel feature; document that the host needs KVM and the
  user in the `kvm` group.
- **Pane-shape change (rootfs → image)** → Frontend hydrate maps a legacy sandbox pane's `rootfs` to
  an image reference where possible, else drops to a host pane; host panes are unaffected.

## Migration Plan

1. Add image fetching + cache and the `sandbox { image }` pane session; resolve references to cached
   rootfs on start, pulling on demand. Test on macOS dev (sandboxes run there).
2. Wire the "Run container" UX (list cached images, type a reference, pull progress).
3. Add the Linux AppImage packaging (embedded libs + runtime path); build and verify on the ARM Linux
   host.

Rollback: image fetching is additive; if the cache/pull path fails, host shells and the existing
sandbox-from-rootfs path remain. The AppImage work is packaging-only.

## Open Questions

- Default registry and reference normalization (`ubuntu` → `docker.io/library/ubuntu:latest`?).
- Cache eviction / size limits, and whether to expose a "remove image" action in v1.
- Whether to show pull progress as a percentage (needs total size from the manifest) or activity only.
