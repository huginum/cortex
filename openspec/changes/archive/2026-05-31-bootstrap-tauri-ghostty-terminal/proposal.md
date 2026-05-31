## Why

Cortex needs a reusable desktop terminal foundation before introducing nerdbox runtime management. Starting with libghostty avoids a throwaway terminal implementation shaping the product architecture and preserves the goal of a reusable Tauri + React + Ghostty stack for future projects.

## What Changes

- Bootstrap a Tauri 2 desktop application with a React frontend.
- Introduce a reusable terminal subsystem built around libghostty from the first implementation.
- Prefer evaluating libghostty-vt as WebAssembly in the React frontend, with Tauri/Rust managing PTY and session lifecycle.
- Provide one working local terminal session as the first visible product capability.
- Establish concise developer documentation for the terminal architecture and local development workflow.
- Record architecture-significant decisions as ADRs for the terminal architecture and documentation/decision process.
- Exclude nerdbox/containerd runtime management, bundled runtime distribution, tabs, split panes, and container attachment from this first change.

## Capabilities

### New Capabilities

- `desktop-app-shell`: Tauri + React application shell that can launch as a macOS desktop app.
- `embedded-terminal`: reusable libghostty-backed terminal session capability for local shell interaction.
- `developer-documentation`: Antora-based developer guide structure for local setup, ADR policy, and terminal architecture notes.

### Modified Capabilities

- None.

## Impact

- Adds the initial Tauri/Rust application structure and React frontend structure.
- Adds libghostty and related build/tooling integration for the terminal subsystem.
- Adds PTY/session management in the Tauri backend and frontend IPC/rendering contracts.
- Adds Antora documentation scaffolding for developer-facing guidance.
- Adds ADRs for terminal architecture and ADR/documentation policy.
