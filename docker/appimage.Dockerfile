# Builds a self-contained arm64 Linux AppImage for Cortex inside a Linux
# container, so you can build on a Mac (arm64 Linux container, native on Apple
# silicon) and copy the .AppImage to a clean Ubuntu machine.
#
# Base matches the target test machine (Ubuntu 26.04) so the AppImage's glibc
# baseline is compatible. libkrun/libkrunfw have no apt package on Ubuntu, so
# they are built from source and installed to /usr/local.
FROM ubuntu:26.04

ARG DEBIAN_FRONTEND=noninteractive
# Note: CARGO_TARGET_DIR is intentionally NOT set here — it is set only at
# `docker run` time for the app build. Setting it during the image build would
# redirect libkrun's cargo output away from its Makefile's expected ./target.
ENV PATH="/root/.cargo/bin:/opt/zig:${PATH}" \
    LIBKRUN_LIB_DIR=/usr/local/lib64 \
    APPIMAGE_EXTRACT_AND_RUN=1

# Toolchain + Tauri (WebKitGTK 4.1) + AppImage + libkrun build dependencies.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl git xz-utils file rsync pkg-config build-essential \
      libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev libssl-dev \
      libayatana-appindicator3-dev libfuse2t64 \
      patchelf python3 python3-pyelftools flex bison bc libelf-dev cpio kmod gettext \
      clang libclang-dev \
    && rm -rf /var/lib/apt/lists/*

# Rust + the musl target for the static guest agent.
RUN curl -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal \
    && rustup target add aarch64-unknown-linux-musl

# Node.
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get update && apt-get install -y nodejs && rm -rf /var/lib/apt/lists/*

# Zig + cargo-zigbuild (agent cross-build) and the Tauri CLI.
RUN curl -fsSL https://ziglang.org/download/0.13.0/zig-linux-aarch64-0.13.0.tar.xz \
      | tar -xJ -C /opt \
    && mv /opt/zig-linux-aarch64-0.13.0 /opt/zig
RUN cargo install cargo-zigbuild tauri-cli --locked

# Build libkrunfw then libkrun from source and install to /usr/local/lib.
RUN git clone --depth 1 https://github.com/containers/libkrunfw /tmp/libkrunfw \
    && make -C /tmp/libkrunfw -j"$(nproc)" \
    && make -C /tmp/libkrunfw install \
    && rm -rf /tmp/libkrunfw
RUN git clone --depth 1 https://github.com/containers/libkrun /tmp/libkrun \
    && make -C /tmp/libkrun -j"$(nproc)" \
    && make -C /tmp/libkrun install \
    && rm -rf /tmp/libkrun \
    && echo /usr/local/lib64 > /etc/ld.so.conf.d/libkrun.conf \
    && ldconfig

# The agent build (build-agent.sh) cross-builds both guest arches; add the second
# musl target. Placed last so it does not invalidate the libkrun/kernel layers.
RUN rustup target add x86_64-unknown-linux-musl

# The libghostty-vt wasm build (Tauri's beforeBuildCommand) requires Zig 0.15.x;
# /opt/zig (0.13) is kept for cargo-zigbuild. Provide 0.15 via ZIG_015.
RUN curl -fsSL https://ziglang.org/download/0.15.2/zig-aarch64-linux-0.15.2.tar.xz \
      | tar -xJ -C /opt \
    && mv /opt/zig-aarch64-linux-0.15.2 /opt/zig15
ENV ZIG_015=/opt/zig15/zig
