## 1. Backend: relocate layout storage

- [x] 1.1 Add a helper that resolves a project's layout file path under `app_config_dir()/layouts/`, named by a stable hash (`DefaultHasher`, hex) of the canonical repository root, creating the `layouts/` directory as needed
- [x] 1.2 Rewrite `write_layout` to canonicalize the repo root and write `{ root, layout }` (canonical root + raw layout JSON) to that file
- [x] 1.3 Rewrite `read_layout` to read that file, return the inner layout only when the stored canonical root matches the requested project's canonical root, and return `None` otherwise (missing file or root mismatch)
- [x] 1.4 Remove the in-repo I/O layer: `resolve_cortex_dir`, `read_in_dir`/`write_in_dir`, `open_dir_nofollow`, the `DirFd` guard, and the `LAYOUT_FILE` in-repo constant usage

## 2. Backend: drop the no-follow hardening

- [x] 2.1 Remove the `#[cfg(unix)]` / `#[cfg(not(unix))]` no-follow read/write implementations now that no repo-controlled path is touched
- [x] 2.2 Replace the unix symlink/hard-link/FIFO/`.cortex` tests with tests for the new store: round-trip save/read, repository scoping (a different repo path does not return another project's layout), and missing-file → `None`
- [x] 2.3 Drop the `libc` dependency from `src-tauri/Cargo.toml` and update `Cargo.lock`

## 3. Frontend: flush debounced save on close

- [x] 3.1 In `ProjectView`, flush the pending debounced `saveLayout` on unmount so a layout change made within the 300 ms window is not lost when the project or window closes

## 4. Docs

- [x] 4.1 Update ADR 0003 to supersede the layout-storage decision (now in app config dir, keyed by repo path) and remove the "Cortex does not touch git" framing that was specific to the in-repo file
- [x] 4.2 Update developer docs (`terminal-architecture.adoc`) and user docs (`embedded-terminal.adoc`) to describe local layout storage and remove the `.cortex/layout.json` / `git status` guidance

## 5. Verification

- [x] 5.1 `cargo test` (new store tests pass) and `cargo build --lib`
- [x] 5.2 `npx tsc --noEmit` and `npx vite build`
- [x] 5.3 `openspec validate local-layout-storage --strict`
- [ ] 5.4 Manually verify: add/split panes → close project → reopen restores layout; move/rename repo → opens empty; confirm no `.cortex/` is created in the repo
