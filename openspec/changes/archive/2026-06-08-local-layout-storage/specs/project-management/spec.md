## REMOVED Requirements

### Requirement: Project layout persists inside the repository
**Reason**: Reading and writing a repo-controlled path (`<repo>/.cortex/layout.json`) placed Cortex's layout I/O inside untrusted territory, which produced a recurring class of filesystem vulnerabilities (symlink overwrite, hard-link truncation, FIFO-induced hangs, directory-inode TOCTOU). Layout storage moves into Cortex's own application configuration directory, which the repository cannot influence.
**Migration**: No data migration is required — the feature is unreleased. Any `.cortex/layout.json` written by a development build is ignored from this change forward. Layouts become machine-local and can no longer be committed to the repository to share a default workspace across clones.

## ADDED Requirements

### Requirement: Project layout persists in local application storage
The system SHALL persist a project's terminal layout — the split-pane tree and each pane's working directory relative to the repository root — in the application configuration directory, keyed by the project's canonical repository root path. The system SHALL NOT create, read, or modify any path inside the repository working tree for layout storage.

#### Scenario: Layout saved on change
- **WHEN** a project's pane layout changes (a pane is added, removed, split, or its working directory changes)
- **THEN** the system writes the updated layout to a file in the application configuration directory keyed by the project's canonical repository root path

#### Scenario: Repository is never written for layout storage
- **WHEN** a project's layout is saved or loaded
- **THEN** the system does not create, read, or modify any file inside the repository working tree

#### Scenario: Layout is scoped to its repository
- **WHEN** a project is opened
- **THEN** the system loads only the layout previously saved for that project's canonical repository root path, and opens the project empty when no layout was saved for it

#### Scenario: Final change persists when closing within the debounce window
- **WHEN** a layout change occurs and the project or window is closed before the save debounce interval elapses
- **THEN** the system still writes the final layout before tearing down
