## 1. Refactor terminal into a reusable pane

- [x] 1.1 Extract `TerminalViewport` into a `TerminalPane` component that takes a session/cwd and renders one pane, preserving current rendering, selection, mouse, resize, and clipboard behavior
- [x] 1.2 Remove the auto-start-on-mount effect (`startedRef` + `idle → start()`) so a pane only starts a shell when explicitly told to
- [x] 1.3 Remove the `quit_app` call from the session-exit handler; emit a pane-exit signal to the parent instead
- [x] 1.4 Verify a single pane behaves identically to today's terminal (input, output, resize, selection, copy/paste)

## 2. Backend: working directory + lifecycle

- [x] 2.1 Add a `cwd` argument to `start_terminal` and spawn the shell in that directory, defaulting to the project repo root when absent
- [x] 2.2 Handle a missing/invalid `cwd` by falling back to the repo root without failing the session
- [x] 2.3 Confirm `terminal-exit` is emitted per session and consumable by the frontend to close a single pane

## 3. Layout tree model

- [x] 3.1 Define the layout tree types: leaf (pane + relative cwd) and split (orientation + children + size ratios), including an empty tree
- [x] 3.2 Implement `ProjectView` that renders the layout tree as `TerminalPane`s, tracking the focused pane
- [x] 3.3 Implement split (horizontal/vertical) and close-pane operations on the tree, with remaining panes reflowing
- [x] 3.4 Route keyboard input to the focused pane only; verify input follows focus across panes
- [x] 3.5 Handle last-pane exit: close the pane and leave the project open with no panes (no app exit)
- [x] 3.6 Provide a UI affordance to add the first terminal when a project has no panes

## 4. App-config recent-projects store

- [x] 4.1 Add an app-config store (alongside `settings.rs`) for the recent-projects list with read/write commands
- [x] 4.2 Record a project (repo root + optional metadata) on open and reorder most-recently-opened first
- [x] 4.3 On picker render, detect missing or non-repository entries and offer to remove/relocate them without crashing

## 5. Git open / init / clone

- [x] 5.1 Add a command to validate whether a directory is a git repository and return its root
- [x] 5.2 Add an "open existing repository" flow (folder browser → validate → open)
- [x] 5.3 Add an "open directory, `git init` if needed" flow
- [x] 5.4 Add a "clone from remote" flow (URL + destination → clone with progress → open on success only; report failures)
- [x] 5.5 Leave the repository's git configuration untouched on open/init/clone (no edits to tracked ignore files or `.git/info/exclude`)

## 6. Project picker UI and routing

- [x] 6.1 Build the `ProjectPicker` listing recent projects (most-recent first) with an add-project affordance, and an empty state with only the affordance
- [x] 6.2 Wire `App.tsx` to route between picker ("no project open") and `ProjectView` ("project open")
- [x] 6.3 Provide an action to close the current project and return to the picker (or confirm window-controls-only for v1)

## 7. Layout persistence and restore

- [x] 7.1 Write the layout (split tree + per-pane relative cwd) to `<repo>/.cortex/layout.json` whenever it changes
- [x] 7.2 On open, read `layout.json` (if present) and restore the pane arrangement, spawning fresh shells in each saved cwd
- [x] 7.3 Open a project with no saved layout as an empty project (no panes, add-terminal affordance)
- [x] 7.4 Verify reopening a project that was left empty reopens empty, and one left with panes restores them

## 8. Docs and ADR

- [x] 8.1 Write an ADR covering the project-as-git-repo model, two-layer persistence, and session-vs-app lifecycle decoupling
- [x] 8.2 Update Antora user/developer docs for the project picker, adding/cloning projects, and split panes

## 9. Verification

- [x] 9.1 Manually verify the full flow: launch → empty picker → add project (open/init/clone) → add/split panes → quit → relaunch → restore
- [x] 9.2 Verify a shell exiting closes only its pane and never the app, including the last pane
- [x] 9.3 Run `openspec verify --change project-workspaces` and reconcile any gaps (ran `openspec validate --strict`: valid)
