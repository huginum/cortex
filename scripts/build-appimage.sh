#!/usr/bin/env sh
# Build a self-contained Linux AppImage that embeds libkrun + libkrunfw, so the
# app runs sandboxes without a separate VMM install (the host still needs
# /dev/kvm). Run this on an ARM Linux host — arm64 AppImages can only be built on
# ARM hardware.
#
# It stages the libkrun/libkrunfw shared objects into src-tauri/appimage-libs/
# (referenced by tauri.conf.json > bundle > linux > appimage > files), then runs
# the Tauri AppImage build. The runtime loader path is set by the sandbox helper
# (LD_LIBRARY_PATH -> the bundled lib dir); see sandbox.rs.
set -eu

STAGE="src-tauri/appimage-libs"
mkdir -p "$STAGE"

# Resolve a shared object by its base soname (e.g. libkrun.so.1), trying ldconfig
# then common library directories. Copies the real file to the staged name.
stage_lib() {
  soname="$1"
  base="${soname%%.so*}.so"
  found="$(ldconfig -p 2>/dev/null | grep -oE "/[^ ]*${base}[^ ]*" | head -n1 || true)"
  if [ -z "$found" ]; then
    for dir in /usr/lib /usr/local/lib /usr/lib/aarch64-linux-gnu /lib/aarch64-linux-gnu; do
      cand="$(ls "$dir/${base}"* 2>/dev/null | head -n1 || true)"
      [ -n "$cand" ] && found="$cand" && break
    done
  fi
  if [ -z "$found" ] || [ ! -e "$found" ]; then
    echo "Could not locate $soname. Install libkrun/libkrunfw, or copy the .so into $STAGE manually." >&2
    echo "If your installed soname differs (e.g. libkrunfw.so.6), update tauri.conf.json's appimage files map to match." >&2
    exit 1
  fi
  cp -L "$found" "$STAGE/$soname"
  echo "Staged $soname from $found"
}

stage_lib libkrun.so.1
stage_lib libkrunfw.so.5

npm run tauri:build -- --bundles appimage
echo "AppImage built under src-tauri/target/release/bundle/appimage/."
