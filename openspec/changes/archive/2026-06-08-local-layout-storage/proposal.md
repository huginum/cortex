## Why

Persisting a project's pane layout at `<repo>/.cortex/layout.json` means Cortex reads and writes a path inside an untrusted, repo-controlled directory. That single fact has produced a string of filesystem vulnerabilities — symlink overwrite, hard-link truncation, FIFO-induced hangs, and directory-inode TOCTOU races — each requiring more `libc` no-follow hardening. Moving the layout into Cortex's own application config directory removes the attack surface entirely: a repository can no longer plant anything in a directory only Cortex writes.

## What Changes

- **Layout storage moves out of the repository** into the application config directory (the same base directory as the recent-projects list, `app_config_dir()`), under a `layouts/` subdirectory, one file per project named by a stable hash of the canonical repository root. The canonical root is stored inside the file so a hash collision is detected and treated as a cache miss.
- **All in-repo `.cortex/` I/O is removed**, along with the entire `libc` no-follow hardening layer (`open_dir_nofollow`, `read_in_dir`/`write_in_dir`, `openat`/`fstatat`/`unlinkat`/`renameat`, `O_NOFOLLOW`/`O_EXCL`/`O_NONBLOCK`, the `DirFd` guard) and the `resolve_cortex_dir` helper. The `libc` dependency added for that hardening is dropped.
- **The final layout save is no longer lost on close** — the 300 ms debounced save in the project view flushes its pending write when the project or window closes within the debounce window.
- **BREAKING**: layouts become machine-local. A layout can no longer be committed to the repository to share a default workspace across clones. This reverses the prior "store inside the repo; the user decides whether to commit" decision.
- **Unchanged**: the repo-relative per-pane working-directory model and the backend `resolve_cwd` canonicalization/confinement (with `start_terminal` taking the repository root) remain — pane working directories still originate from a saved layout, so that confinement is still required.

## Capabilities

### New Capabilities
<!-- None. -->

### Modified Capabilities
- `project-management`: The requirement "Project layout persists inside the repository" is replaced — layout persists in the application config directory keyed by repository path, and Cortex no longer reads or writes inside the repository for layout storage.

## Impact

- **Backend (`src-tauri/src/project.rs`)**: `read_layout`/`write_layout` re-target the app config dir keyed by canonical repo path; remove `resolve_cortex_dir` and the entire `#[cfg(unix)]` no-follow I/O layer plus the unix symlink/hard-link/FIFO tests (replaced with tests for the new path-keyed store).
- **Backend (`src-tauri/Cargo.toml`)**: drop the `libc` dependency added solely for the no-follow hardening.
- **Frontend (`src/project/ProjectView.tsx`)**: flush the debounced layout save on unmount; no change to the layout shape passed to the backend.
- **Docs**: ADR 0003 (projects-as-git-repositories) — supersede the layout-storage and "Cortex does not touch git" sections; update developer and user docs that describe `.cortex/layout.json` and `git status` behavior.
- **No migration**: the feature is unreleased (PR #2 open, unmerged); any `.cortex/layout.json` written during development is simply ignored going forward.
