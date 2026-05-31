## 1. Project Bootstrap

- [x] 1.1 Confirm package manager choice and record it in the implementation notes or ADR if architecture-significant.
- [x] 1.2 Bootstrap a Tauri 2 desktop application using Rust tooling where practical.
- [x] 1.3 Add a React frontend and minimal application shell.
- [x] 1.4 Configure development scripts for running the Tauri app locally.
- [x] 1.5 Verify the desktop app launches on macOS and displays the React shell.

## 2. Terminal Architecture Spike

- [x] 2.1 Add libghostty-vt build inputs and document the selected integration path.
- [x] 2.2 Validate loading libghostty-vt as WebAssembly from the React frontend.
- [x] 2.3 Feed static VT bytes into libghostty and extract render-state rows, cells, colors, and cursor data.
- [x] 2.4 Render the static libghostty output in the terminal viewport using the selected canvas/rendering strategy.
- [x] 2.5 Document any blocker that would force native backend integration instead of frontend WASM.

## 3. Local Terminal Session

- [x] 3.1 Implement Rust-side PTY/session lifecycle for one local shell session.
- [x] 3.2 Stream PTY output bytes from Rust/Tauri to the frontend terminal subsystem.
- [x] 3.3 Feed PTY output bytes into libghostty and refresh the rendered terminal viewport.
- [x] 3.4 Encode keyboard input through the terminal subsystem and write input bytes to the PTY.
- [x] 3.5 Resize both libghostty terminal state and the backend PTY when the viewport dimensions change.
- [x] 3.6 Verify an interactive local shell works in the embedded terminal.

## 4. Reusable Boundaries

- [x] 4.1 Isolate terminal frontend code behind a reusable component/API boundary.
- [x] 4.2 Isolate backend session transport behind a boundary that can later support container-backed sessions.
- [x] 4.3 Add minimal tests or verification scripts for terminal adapter behavior where practical.

## 5. ADRs

- [x] 5.1 Add an ADR for using libghostty from the first terminal implementation.
- [x] 5.2 Add an ADR for the chosen libghostty integration architecture: frontend WASM or documented fallback.
- [x] 5.3 Add developer-guide ADR guidance describing location, status values, and when ADRs are required.

## 6. Antora Documentation

- [x] 6.1 Add Antora documentation structure for developer and user guides.
- [x] 6.2 Add concise developer setup documentation covering required local tools.
- [x] 6.3 Add concise terminal architecture documentation for Tauri + React + libghostty.
- [x] 6.4 Add a short user-guide page describing the initial embedded terminal capability.

## 7. Verification

- [x] 7.1 Run formatting and linting for Rust and frontend code.
- [x] 7.2 Run available unit or integration tests.
- [x] 7.3 Build or dry-run the Antora documentation site.
- [x] 7.4 Run OpenSpec validation for the change.
- [x] 7.5 Record any known limitations for follow-up changes.
