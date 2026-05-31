## Context

Cortex is starting from a greenfield repository with OpenSpec policy and project constraints in `AGENTS.md`. The first product slice is a reusable terminal foundation built from Tauri, React, and libghostty before adding nerdbox/containerd runtime management.

The terminal stack is intended to be reusable across future projects, so the first implementation must avoid temporary terminal emulators that would shape APIs, rendering assumptions, or test strategy around a disposable solution.

## Goals / Non-Goals

**Goals:**

- Create a Tauri 2 desktop application bootstrapped from Rust tooling where practical.
- Use React for the frontend application shell.
- Use libghostty from the first terminal implementation.
- Validate and implement a local terminal session with Rust-owned PTY/session lifecycle.
- Prefer libghostty-vt WebAssembly in the frontend so terminal state and rendering extraction live close to the React viewport.
- Establish minimal Antora developer documentation and ADR conventions.

**Non-Goals:**

- Managing nerdbox, containerd, images, or containers.
- Bundling runtime binaries such as containerd, nerdbox, libkrun, or erofs tools.
- Implementing tabs, split panes, fullscreen mode, settings UI, or container attach.
- Shipping a production-grade terminal renderer with every advanced terminal feature polished.

## Decisions

### Use libghostty from the first terminal implementation

The terminal subsystem will use libghostty immediately rather than starting with a temporary terminal emulator such as xterm.js. This preserves the reusable Tauri + React + Ghostty architecture and prevents a disposable implementation from defining long-lived APIs.

Alternatives considered:

- Temporary web terminal emulator: faster first render, rejected because it creates migration waste and can constrain architecture.
- Native Ghostty view first: potentially best native fidelity, rejected for the first slice because it adds platform-specific integration before the reusable React package boundary is understood.

### Prefer libghostty-vt WebAssembly in the React frontend

The preferred architecture runs libghostty-vt as WebAssembly in the frontend. Rust/Tauri owns PTY spawning, resizing, and byte transport. The frontend feeds PTY bytes into libghostty, updates render state, and draws the terminal viewport.

Alternatives considered:

- Native libghostty in Rust backend: keeps PTY and terminal state together, but pushes render-state snapshots over IPC and makes the terminal package less reusable outside Tauri.
- Full native terminal surface: promising later, but too much platform-specific work for the bootstrap milestone.

### Separate terminal session transport from rendering

The first implementation will define a narrow boundary between backend session transport and frontend rendering. Backend events carry PTY output, lifecycle state, and resize acknowledgement. Frontend commands carry encoded input bytes and resize requests.

This keeps the terminal subsystem reusable when later sessions attach to nerdbox containers instead of local shells.

### Capture architecture decisions in ADRs and concise Antora docs

This change will add ADRs for terminal architecture and ADR/documentation policy. It will also add concise developer-guide pages so future changes know where decisions live and how to work on the terminal foundation.

## Risks / Trade-offs

- libghostty-vt WASM build or API friction delays the first terminal -> Mitigate with an early spike that renders static VT output before PTY integration.
- High JS/WASM call volume hurts rendering performance -> Mitigate by using render-state dirty tracking, row iteration, and a canvas-oriented renderer rather than per-cell React components.
- Font metrics and Unicode rendering are hard in canvas -> Mitigate by starting with a fixed monospace cell model and documenting limitations for follow-up work.
- Tauri IPC may be inefficient for high-volume PTY output -> Mitigate with binary payloads/channels and batching instead of line-oriented events.
- libghostty API is not fully stable -> Mitigate by isolating calls behind a small terminal adapter package.
- Documentation and ADRs can become noisy -> Mitigate by keeping docs short and requiring ADRs only for architecture-significant decisions.

## Migration Plan

No existing application code is migrated. The change creates the initial application, terminal subsystem, docs, and ADR structure.

Rollback is removing the generated app, terminal subsystem, docs, and ADR artifacts introduced by this change before implementation is accepted.

## Open Questions

- Which package manager should be committed for the frontend workspace: npm or pnpm?
- Which canvas/rendering strategy is sufficient for the first milestone: 2D canvas first or WebGL from the start?
- Should the reusable terminal package live inside the app source initially or as a workspace package from day one?
