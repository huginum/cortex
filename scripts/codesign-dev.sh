#!/usr/bin/env sh
# Ad-hoc sign the development binary with the hypervisor entitlement so libkrun
# can use Hypervisor.framework on macOS. Without this, starting a sandbox session
# fails because Hypervisor.framework refuses an unentitled process.
#
# The sandbox helper re-executes this same binary, so signing it once covers both
# the GUI process and the microVM helper.
#
# Usage: scripts/codesign-dev.sh [path-to-binary]
#   defaults to src-tauri/target/debug/cortex
set -eu

BIN="${1:-src-tauri/target/debug/cortex}"
ENTITLEMENTS="src-tauri/Entitlements.plist"

if [ ! -f "$BIN" ]; then
  echo "Binary not found: $BIN" >&2
  echo "Build it first (e.g. 'cargo build --manifest-path src-tauri/Cargo.toml')." >&2
  exit 1
fi

codesign --force --sign - --entitlements "$ENTITLEMENTS" "$BIN"
echo "Signed $BIN with the hypervisor entitlement."
