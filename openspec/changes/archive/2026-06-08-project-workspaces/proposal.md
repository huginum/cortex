## Why

Today Cortex boots straight into a single, auto-started terminal that owns the whole window — and when that shell exits, the app quits. There is no way to organize work, return to where you left off, or run more than one terminal. We want the unit of work to be a **project** (a git repository you open, in the DAW/NLE sense — like opening a project in Ableton Live or DaVinci Resolve), not a lone shell. You open a project, and its terminal layout is what comes back.

## What Changes

- **BREAKING**: The app no longer auto-starts a terminal on launch. Launch now shows a **project picker**: a list of recently opened projects, or a `+` to add one when none exist.
- A **project is a git repository.** Its root directory anchors the project; terminal working directories are stored relative to it.
- **Add a project** via `+` supports three entry points: open an existing git repo, open a directory and `git init` it if it is not yet a repo, or clone from a remote URL into a chosen destination.
- A project can hold **multiple terminals arranged in split panes** (horizontal/vertical), instead of one fixed terminal.
- **Per-project layout persistence**: the split tree and each pane's relative working directory are saved to `<repo>/.cortex/layout.json`. Cortex does not modify the repository's git configuration; whether `.cortex/` is ignored, committed, or left untracked is the user's choice.
- **Reopening a project restores the layout and spawns fresh shells** in each pane's saved working directory. Saved layout describes panes/cwds only — not live process state or scrollback.
- A **new/empty project opens with no panes** and an affordance to add the first terminal, consistent with "restore whatever you left, even if you left nothing."
- **BREAKING**: A pane's shell exiting now closes that pane only. The app quits only when the user quits it (or closes the last window) — it no longer quits when a shell exits.
- The **recent-projects list** (which repos have been opened, and in what order) is stored in Cortex's app config, since it must be available before any repo is open.

## Capabilities

### New Capabilities
- `project-management`: Opening/creating/cloning git-repository projects, the launch-time project picker and recent-projects list, and per-project layout persistence under `.cortex/`.

### Modified Capabilities
- `desktop-app-shell`: The shell boots into the project picker rather than a terminal, and gains a "no project open" vs "project open" state. The terminal host area now hosts a project's pane layout.
- `embedded-terminal`: Supports multiple concurrent sessions within a project, arranged as a split-pane tree; each session starts in a specified working directory; a session exiting closes its pane rather than the application.

## Impact

- **Frontend (`src/`)**: New project-picker UI and split-pane layout manager. `App.tsx` switches between picker and project views. `TerminalViewport` becomes one pane among many rather than the root, loses its auto-start-on-mount behavior, and drops the `quit_app` on exit.
- **Backend (`src-tauri/`)**: `start_terminal` gains a working-directory argument. New Tauri commands for git operations (init, clone, repo/branch status) and for reading/writing the recent-projects config and per-repo `.cortex/layout.json`. Session lifecycle no longer tied to app lifecycle.
- **Persistence**: New app-config file for the recent-projects list (alongside `settings.rs`); new per-repo `.cortex/layout.json`. The repository's git configuration is left untouched.
- **Dependencies**: Likely a git integration path (a Rust git library or shelling out to `git`) for init/clone/status.
- **Docs/ADR**: Per AGENTS.md, this warrants an ADR (terminal architecture, app shell, and persistence model all shift) and Antora doc updates (project picker and splits are user-facing).
