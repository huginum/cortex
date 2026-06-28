## Purpose

Define how Cortex discovers, adds, opens, and persists projects, where a project is a git repository.
## Requirements
### Requirement: Launch shows a project picker
On launch, the system SHALL present a project picker rather than starting a terminal. The picker SHALL list recently opened projects when any exist, and SHALL present an affordance to add a project when none exist.

#### Scenario: Launch with existing projects
- **WHEN** Cortex launches and the recent-projects list is non-empty
- **THEN** the picker lists those projects, most-recently-opened first, and offers an option to add another project

#### Scenario: Launch with no projects
- **WHEN** Cortex launches and the recent-projects list is empty
- **THEN** the picker presents only an affordance to add the first project, and no terminal is started

### Requirement: A project is a git repository
The system SHALL treat a project as a git repository whose root directory anchors the project. The repository root SHALL be the reference for any working directories stored by the project.

#### Scenario: Project anchored at repository root
- **WHEN** a project is opened
- **THEN** the system identifies the project by its git repository root directory

### Requirement: Add a project by opening an existing repository
The system SHALL allow adding a project by selecting a directory that is already a git repository, and SHALL add it to the recent-projects list.

#### Scenario: Open an existing repository
- **WHEN** a user selects a directory that contains a git repository
- **THEN** the system opens it as a project and records it in the recent-projects list

### Requirement: Add a project by initializing a directory
The system SHALL allow adding a project by selecting a directory that is not yet a git repository, and SHALL initialize a git repository in that directory before opening it as a project.

#### Scenario: Initialize a non-repository directory
- **WHEN** a user selects a directory that is not a git repository
- **THEN** the system initializes a git repository in that directory and opens it as a project

### Requirement: Add a project by cloning a remote
The system SHALL allow adding a project by providing a remote repository URL and a destination location, SHALL clone the repository to that destination, and SHALL open it as a project.

#### Scenario: Clone a remote repository
- **WHEN** a user provides a remote URL and a destination directory
- **THEN** the system clones the repository to that destination and opens it as a project

#### Scenario: Clone fails
- **WHEN** a clone cannot complete (invalid URL, network failure, or non-empty destination)
- **THEN** the system reports the failure and does not add a project to the recent-projects list

### Requirement: Recent-projects list persists in app config
The system SHALL persist the recent-projects list in application configuration, independent of any repository, so that it is available before any project is opened.

#### Scenario: Recent list survives restart
- **WHEN** a user opens projects and later relaunches Cortex
- **THEN** the previously opened projects appear in the picker in most-recently-opened order

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

### Requirement: A new project opens with no panes
When a project is opened for the first time and has no saved layout, the system SHALL open it with no terminal panes and present an affordance to add the first terminal.

#### Scenario: First open of a project
- **WHEN** a project is opened and no saved layout exists for it
- **THEN** the system shows the project with no panes and an affordance to add a terminal, and does not auto-start a shell

