## Context

Project layout currently persists at `<repo>/.cortex/layout.json` (see ADR 0003 and the archived `project-workspaces` change). Because that path lives inside a repository the user may have cloned from an untrusted source, every layout read/write is an operation against attacker-influenceable filesystem objects. Code review of PR #2 surfaced a steady stream of vulnerabilities rooted in exactly that: symlink overwrite of arbitrary files, hard-link truncation, a FIFO that hangs project open, and TOCTOU races on the `.cortex` directory inode. Each was fixed with progressively more `libc` no-follow machinery (`open_dir_nofollow`, `openat`/`fstatat`/`unlinkat`/`renameat`, `O_NOFOLLOW`/`O_EXCL`/`O_NONBLOCK`, a `DirFd` guard), which is correct but complex `unsafe` code that exists only to make in-repo I/O safe.

The recent-projects list already lives outside any repository, in the application configuration directory (`app.path().app_config_dir()/projects.json`). Layout is the same kind of data — local, per-machine state about how the user arranged their workspace — and belongs in the same place.

## Goals / Non-Goals

**Goals:**
- Store each project's layout in the application configuration directory, keyed by the canonical repository root path.
- Remove all in-repo `.cortex/` I/O and the `libc` no-follow hardening it required; drop the `libc` dependency.
- Preserve restore-on-reopen, per-pane relative cwd, and fresh-shell semantics unchanged.
- Fix the debounced-save-dropped-on-close bug.

**Non-Goals:**
- Sharing layouts across clones / committing layouts to the repo (explicitly dropped — see Risks).
- Changing the layout document shape or the split-tree model.
- Changing the backend `resolve_cwd` canonicalization/confinement — pane cwds still come from a saved layout, so confining them to the repo root is still required.
- Migrating any existing `.cortex/layout.json` (feature is unreleased).

## Decisions

### Store layout in the app config dir, keyed by canonical repo path
Layout files live under `app_config_dir()/layouts/`, one file per project named `<hash>.json`, where `<hash>` is a stable hash (Rust `std::hash::DefaultHasher` over the canonical repository root string, rendered as hex). The canonical root is stored *inside* each file alongside the layout JSON; on read, if the stored root does not match the requested project's canonical root, the entry is treated as a miss (defensive against the small chance of a hash collision). Canonicalization uses the same repo root the rest of the project flow already resolves.

- Why a hash filename rather than the raw path: repository paths contain `/` and other characters that are not safe, portable filenames. A hash maps any path to a fixed, filesystem-safe name.
- Why `DefaultHasher` rather than a cryptographic hash: the hash only needs to produce a stable, well-distributed filename, not resist adversarial collisions — the stored-root check inside the file resolves any collision deterministically. This avoids adding a hashing crate.
- Why one file per project rather than a single keyed map: writes stay small and isolated; there is no read-modify-write of a shared document. (The app opens one project at a time today, but per-file storage is also forward-compatible with multiple windows.)

Alternative considered: a true OS cache directory (`app_cache_dir()`). Rejected — a cache dir implies disposable, OS-purgeable data; a layout is persistent state the user expects to survive, so the config/data dir is the correct bucket.

### Remove the in-repo I/O and the `libc` hardening
With storage in a directory only Cortex writes, none of the untrusted-path defenses are reachable: delete `resolve_cortex_dir`, `read_in_dir`/`write_in_dir`, `open_dir_nofollow`, the `DirFd` guard, and the unix symlink/hard-link/FIFO tests. `read_layout`/`write_layout` become straightforward reads/writes of the per-project file under the app config dir (the dir is created with `create_dir_all`, same as `projects.json`). Drop `libc` from `Cargo.toml`.

### Flush the debounced layout save on unmount
The project view debounces saves by 300 ms. Its cleanup currently clears the pending timer without flushing, so closing the project/window within the window drops the last change. On unmount, if a save is pending, write it synchronously-enough (fire the `saveLayout` invoke) before clearing the timer.

## Risks / Trade-offs

- **Layouts no longer travel with the repo** → Accepted and explicit: a layout cannot be committed to share a default workspace across clones. This was a speculative benefit of the in-repo design; no user asked for it, and it is the direct cause of the vulnerability class. Documented as BREAKING.
- **Orphaned layout entries when a repo is moved/deleted** → Keyed by canonical path, a moved repo simply opens empty (a fresh layout). Same staleness profile the recent-projects list already has; harmless. Optional future cleanup is out of scope.
- **Hash collision returns the wrong layout** → Prevented by storing the canonical root in the file and treating a mismatch as a miss.
- **Removing `unsafe`/`libc` code on an open PR** → Net reduction in attack surface and code; covered by new tests that the store round-trips and is scoped per repository path.

## Migration Plan

1. Re-target `read_layout`/`write_layout` to the app config `layouts/` dir keyed by canonical repo path; add the stored-root collision check.
2. Delete the in-repo I/O layer (`resolve_cortex_dir`, `*_in_dir`, `open_dir_nofollow`, `DirFd`) and the unix hardening tests; drop `libc`.
3. Flush the debounced save on unmount in `ProjectView`.
4. Update ADR 0003 (supersede the layout-storage / git sections) and the developer + user docs.

No rollback data concerns — feature unreleased, no persisted production state.

## Open Questions

None.
