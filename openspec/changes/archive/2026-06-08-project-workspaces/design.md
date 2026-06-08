## Context

Cortex currently launches directly into a single `TerminalViewport` that auto-starts one shell on mount (`startedRef` + the `idle → start()` effect) and calls `quit_app` when that shell exits. The Rust side (`terminal.rs`) already supports multiple sessions in a `HashMap` keyed by `session_id`, but `start_terminal` takes no working directory and nothing groups sessions or persists anything. Settings persistence already exists in `settings.rs`, giving us a pattern for app-level config.

This change reframes the unit of work as a **project = git repository** (the DAW/NLE "open your project" model). Launch shows a project picker; opening a project restores a saved split-pane layout by spawning fresh shells. Decisions captured during exploration: a project is a git repo; the recent-projects list lives in app config; per-project layout lives in `<repo>/.cortex/layout.json` and Cortex leaves the repo's git configuration untouched; reopening restores layout + fresh shells (not live state); a new/empty project opens with zero panes.

Per AGENTS.md this change crosses major layers (app shell, terminal architecture, persistence) and warrants an ADR plus Antora doc updates.

## Goals / Non-Goals

**Goals:**
- Boot into a project picker; never auto-start a terminal at launch.
- Open/init/clone a git repository as a project and track a recent-projects list.
- Support a tree of split panes (horizontal/vertical) with per-pane working directories.
- Persist and restore the layout per project; restoration spawns fresh shells in saved cwds.
- Decouple session lifecycle from app lifecycle (pane exit ≠ app exit).

**Non-Goals:**
- Restoring live shell state or scrollback (saved layout is panes + cwds only).
- Multiple projects per window / project tabs (one project per window; a second project is a second window — deferred).
- Remote/non-local session backends (the transport seam is preserved, not extended here).
- Git workflow features beyond what's needed to open a project (no commit/branch UI; branch is read-only metadata in the picker, optional).

## Decisions

### Project identity = repository root path
A project is keyed by its absolute git repository root. The recent-projects list stores root paths (plus optional cached display metadata like branch). Rationale: the repo root is the natural anchor, makes per-pane cwds expressible as relative paths, and keeps the picker list trivial to render. Alternative considered: keying by remote URL — rejected because local-only repos have no remote and the same remote can be cloned to multiple working copies.

### Two-layer persistence
- **Recent-projects list** → app config dir (alongside `settings.rs`), e.g. `projects.json`. Must exist independently of any repo because it is read before any project is open.
- **Per-project layout** → `<repo>/.cortex/layout.json`. Travels with the working copy, scoped to that repo.

Alternative considered: storing layouts centrally in app config keyed by path. Rejected per exploration — layout belongs with the working copy.

### Cortex does not touch git's ignore configuration
Cortex writes `<repo>/.cortex/layout.json` and otherwise leaves the repository alone — it edits neither the tracked `.gitignore` nor the local `.git/info/exclude`. Rationale: silently writing into the user's `.git/` directory is surprising, and ignore-vs-commit is a decision that belongs to the user — a layout can reasonably be ignored (personal workspace) or committed (a default workspace shared with clones). Consequence: `.cortex/layout.json` appears in `git status` until the user decides what to do with it. Alternatives rejected: appending to the tracked `.gitignore` (mutates a committed, shared file) and auto-appending to `.git/info/exclude` (still a silent mutation of `.git/`, and pre-decides the ignore-vs-commit question).

### Layout is a binary split tree
Model the layout as a tree of nodes: a node is either a **leaf** (a pane with a relative cwd) or a **split** (orientation horizontal/vertical + children + size ratios). This is the standard tmux/iTerm representation and serializes cleanly to `layout.json`. The frontend renders the tree; the empty project is an empty tree (no panes).

### `start_terminal` gains a `cwd` argument
Add a working-directory parameter to `start_terminal`, defaulting to the repo root. The reader thread that currently emits `terminal-exit` stays, but the frontend handler changes: `terminal-exit` closes the pane in the layout instead of calling `quit_app`. Session grouping by project can stay implicit on the frontend (the open project owns its session ids); the Rust manager need not know about projects in v1.

### Git operations: shell out to `git`
Use the system `git` binary via the existing PTY/command infrastructure or a dedicated command for init/clone/status, rather than adding a Rust git library. Rationale: zero new dependency surface, matches "prefer minimal/permissive deps" in AGENTS.md, and clone/init/status are simple CLI calls. Alternative: a Rust git crate (e.g. gix) — heavier dependency for little gain in v1; revisit if richer git UI is added. (Confirm licensing either way.)

### Frontend structure
`App.tsx` becomes a router between `ProjectPicker` and `ProjectView`. `ProjectView` owns the layout tree and renders one `TerminalPane` (today's `TerminalViewport`, refactored) per leaf, tracking which pane has focus so input routes correctly. `TerminalViewport` loses its auto-start effect and `quit_app` call; starting a shell becomes an explicit action (add/split pane, or layout restore).

## Risks / Trade-offs

- **`.cortex/layout.json` shows up in `git status`** (Cortex does not ignore it) → Acceptable and documented: the user decides whether to ignore, commit, or leave it untracked. Commit-to-share is a legitimate use.
- **Stale recent-list entries** when a repo is moved or deleted → Detect missing/non-repo paths on picker render and offer to remove or relocate; never crash the picker.
- **Focus/input routing across many panes** is new surface area and easy to get subtly wrong (input to wrong pane) → Spec scenarios pin "input follows focus"; cover with explicit focus tests.
- **`cwd` may no longer exist** on restore (deleted subdir) → Fall back to repo root and surface a non-fatal notice rather than failing to start the pane.
- **Clone is long-running / can fail midway** → Run clone with progress and only add to the recent list on success; leave partial destinations to the user.
- **Refactor breaks existing terminal behavior** (selection, mouse, resize all live in `TerminalViewport`) → Refactor into `TerminalPane` preserving current logic; the single-pane path must remain behavior-identical.

## Migration Plan

1. Refactor `TerminalViewport` into a reusable `TerminalPane` with no auto-start and no `quit_app`; behavior-identical for one pane.
2. Add `cwd` to `start_terminal`; change `terminal-exit` handling to close the pane.
3. Introduce the layout tree model + `ProjectView` rendering a single pane, then splits.
4. Add app-config recent-projects store and the `ProjectPicker`; wire `App.tsx` to route picker ↔ project.
5. Add git open/init/clone/status commands (no git-ignore handling — the repo's git configuration is left untouched).
6. Add `.cortex/layout.json` read/write and restore-on-open.
7. ADR + Antora docs.

No data migration is required (no prior persisted state). Rollback is reverting the branch; the only on-disk artifacts created are app-config `projects.json` and per-repo `.cortex/`, both inert if the feature is removed.

## Open Questions

- Where do clones default their destination (prompt every time, or a configurable default parent dir)?
- Should the picker show git branch / dirty status (nice, but needs a status call per entry — lazy/async)?
- Pane focus and split **keybindings** — define now or in a follow-up? (Splitting must at least be reachable via UI in v1.)
- Is there a "close project / back to picker" action in v1, or only via window controls?
