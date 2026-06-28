## MODIFIED Requirements

### Requirement: Project layout persists in local application storage
The system SHALL persist a project's terminal layout — the split-pane tree and, for each pane, its
session kind together with the data that kind requires (a host-shell pane's working directory
relative to the repository root, or a sandbox pane's root filesystem reference) — in the application
configuration directory, keyed by the project's canonical repository root path. A pane with no
recorded session kind SHALL be treated as a host-shell pane for backward compatibility. The system
SHALL NOT create, read, or modify any path inside the repository working tree for layout storage.

#### Scenario: Layout saved on change
- **WHEN** a project's pane layout changes (a pane is added, removed, split, its working directory changes, or its session kind changes)
- **THEN** the system writes the updated layout to a file in the application configuration directory keyed by the project's canonical repository root path

#### Scenario: Pane session kind is persisted
- **WHEN** a project has both a host-shell pane and a sandbox pane
- **THEN** the saved layout records each pane's session kind and the data that kind requires

#### Scenario: Legacy layout loads as host shells
- **WHEN** a saved layout predates session kinds and records panes without a session kind
- **THEN** the system loads each such pane as a host-shell pane using its recorded working directory

#### Scenario: Repository is never written for layout storage
- **WHEN** a project's layout is saved or loaded
- **THEN** the system does not create, read, or modify any file inside the repository working tree

#### Scenario: Layout is scoped to its repository
- **WHEN** a project is opened
- **THEN** the system loads only the layout previously saved for that project's canonical repository root path, and opens the project empty when no layout was saved for it

#### Scenario: Final change persists when closing within the debounce window
- **WHEN** a layout change occurs and the project or window is closed before the save debounce interval elapses
- **THEN** the system still writes the final layout before tearing down

### Requirement: Reopening a project restores its layout with fresh shells
When a project with a saved layout is reopened, the system SHALL restore the split-pane arrangement
and start a fresh session for each pane according to its recorded kind: a host-shell pane starts a
fresh shell in its saved working directory, and a sandbox pane starts a fresh microVM from its
recorded root filesystem. The system SHALL NOT attempt to restore live process or VM state or prior
scrollback.

#### Scenario: Reopen a project that had host-shell panes
- **WHEN** a user reopens a project whose saved layout describes one or more host-shell panes
- **THEN** the system recreates that pane arrangement and starts a fresh shell in each pane's saved working directory

#### Scenario: Reopen a project that had a sandbox pane
- **WHEN** a user reopens a project whose saved layout describes a sandbox pane
- **THEN** the system recreates that pane and starts a fresh microVM from the pane's recorded root filesystem

#### Scenario: Reopen a project that was left empty
- **WHEN** a user reopens a project whose saved layout describes no panes
- **THEN** the system opens the project with no panes and presents an affordance to add the first terminal
