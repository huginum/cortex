#!/usr/bin/env sh
# Build a self-contained arm64 Linux AppImage inside a Linux container, so you can
# build on a Mac and copy the .AppImage to a clean Ubuntu test machine (which then
# needs only /dev/kvm — no build tools, no libkrun install).
#
# Requires Docker (or colima) able to run linux/arm64 containers. On Apple silicon
# that is native (no emulation). The first build is slow: it compiles libkrun and
# libkrunfw from source into the builder image.
#
# Output: ./dist-linux/*.AppImage
set -eu

IMAGE=cortex-appimage-builder
mkdir -p dist-linux

docker build --platform linux/arm64 -t "$IMAGE" -f docker/appimage.Dockerfile docker

# Source is mounted read-only and copied into the container (excluding the macOS
# target/node_modules), so the host tree is never modified and the Linux build
# uses the container filesystem.
docker run --rm --platform linux/arm64 \
  -v "$PWD:/src:ro" \
  -v "$PWD/dist-linux:/out" \
  "$IMAGE" sh -lc '
    rsync -a --exclude target --exclude node_modules --exclude dist-linux --exclude .git /src/ /work/ &&
    cd /work &&
    npm install &&
    sh scripts/build-appimage.sh &&
    cp /build/release/bundle/appimage/*.AppImage /out/
  '

echo "AppImage written to ./dist-linux/ — copy it to the Ubuntu 26.04 test machine."
