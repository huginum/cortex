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

### Requirement: Project layout persists inside the repository
The system SHALL persist a project's terminal layout — the split-pane tree and each pane's working directory relative to the repository root — in a `.cortex/` directory at the repository root. The system SHALL NOT modify the repository's git configuration, including tracked ignore files and the local exclude file (`.git/info/exclude`); whether `.cortex/` is ignored, committed, or left untracked is left to the user.

#### Scenario: Layout saved on change
- **WHEN** a project's pane layout changes (a pane is added, removed, split, or its working directory changes)
- **THEN** the system writes the updated layout to `<repository root>/.cortex/layout.json`

#### Scenario: Git ignore configuration left untouched
- **WHEN** a project is opened, initialized, or cloned
- **THEN** the system does not modify the repository's tracked ignore files or its `.git/info/exclude`

### Requirement: Reopening a project restores its layout with fresh shells
When a project with a saved layout is reopened, the system SHALL restore the split-pane arrangement and start a fresh shell in each pane's saved working directory. The system SHALL NOT attempt to restore live process state or prior scrollback.

#### Scenario: Reopen a project that had panes
- **WHEN** a user reopens a project whose saved layout describes one or more panes
- **THEN** the system recreates that pane arrangement and starts a fresh shell in each pane's saved working directory

#### Scenario: Reopen a project that was left empty
- **WHEN** a user reopens a project whose saved layout describes no panes
- **THEN** the system opens the project with no panes and presents an affordance to add the first terminal

### Requirement: A new project opens with no panes
When a project is opened for the first time and has no saved layout, the system SHALL open it with no terminal panes and present an affordance to add the first terminal.

#### Scenario: First open of a project
- **WHEN** a project is opened and no saved layout exists for it
- **THEN** the system shows the project with no panes and an affordance to add a terminal, and does not auto-start a shell
