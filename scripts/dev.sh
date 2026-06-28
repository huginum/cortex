#!/usr/bin/env sh
# One-command signed dev run on macOS.
#
# Hypervisor.framework requires the binary to be signed with the hypervisor
# entitlement, and `cargo tauri dev` re-strips that signature on every rebuild.
# So instead of the two-terminal dance, this builds, signs, then runs the signed
# binary directly against the Vite dev server.
#
# Usage: sh scripts/dev.sh
set -eu

DEV_URL="http://127.0.0.1:1420"
BIN="src-tauri/target/debug/cortex"

# Start the Vite dev server in the background; stop it when we exit.
npm run dev >/dev/null 2>&1 &
VITE_PID=$!
trap 'kill "$VITE_PID" 2>/dev/null || true' EXIT INT TERM

# Wait for Vite to be reachable so the webview doesn't load a blank page.
i=0
while [ "$i" -lt 120 ]; do
  if curl -sf "$DEV_URL" >/dev/null 2>&1; then break; fi
  i=$((i + 1))
  sleep 0.5
done

cargo build --manifest-path src-tauri/Cargo.toml
sh scripts/codesign-dev.sh "$BIN"
exec "$BIN"
