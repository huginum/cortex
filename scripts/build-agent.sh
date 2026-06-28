#!/usr/bin/env sh
# Build the in-guest agent `cortex-init` as static Linux musl binaries for both
# guest architectures, using cargo-zigbuild (zig as the cross linker). The host
# injects the matching binary into each container's rootfs.
#
# Prereqs (one-time):
#   rustup target add aarch64-unknown-linux-musl x86_64-unknown-linux-musl
#   cargo install cargo-zigbuild
#   a Zig toolchain (the repo already uses Zig 0.15 for libghostty-vt)
set -eu

# Use the Homebrew keg-only Zig on macOS if present; otherwise rely on PATH.
[ -d /opt/homebrew/opt/zig@0.15/bin ] && export PATH="/opt/homebrew/opt/zig@0.15/bin:$PATH"

cd "$(dirname "$0")/../src-tauri"
OUT="agent-bin"
mkdir -p "$OUT"

for target in aarch64-unknown-linux-musl x86_64-unknown-linux-musl; do
  cargo zigbuild -p cortex-init --target "$target" --release
  arch="${target%%-*}"
  cp "target/$target/release/cortex-init" "$OUT/cortex-init-$arch"
  echo "Built $OUT/cortex-init-$arch"
done
