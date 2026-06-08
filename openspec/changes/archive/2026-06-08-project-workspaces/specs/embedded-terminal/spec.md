## MODIFIED Requirements

### Requirement: Terminal renders local shell output
The system SHALL support multiple concurrent embedded terminal sessions within an open project, each rendering output from its own local shell process and each displayed in its own pane.

#### Scenario: Open local shell terminal
- **WHEN** a project starts a terminal session in a pane
- **THEN** that pane displays output from a local shell process

#### Scenario: Multiple sessions render independently
- **WHEN** a project has more than one terminal session open
- **THEN** each pane renders output from its own shell process independently of the others

### Requirement: Terminal accepts keyboard input
The system SHALL send keyboard input to the shell session of the currently focused terminal pane.

#### Scenario: Type into the focused pane
- **WHEN** a user focuses a terminal pane and types text
- **THEN** the shell session of that pane receives the corresponding input bytes

#### Scenario: Input follows focus
- **WHEN** a user moves focus from one pane to another and types text
- **THEN** only the newly focused pane's shell session receives the input bytes

## ADDED Requirements

### Requirement: Terminals arrange in split panes
The system SHALL allow the terminals within a project to be arranged as a tree of split panes, supporting both horizontal and vertical splits and an arbitrary number of panes.

#### Scenario: Split a pane
- **WHEN** a user splits a pane horizontally or vertically
- **THEN** the system creates a new pane adjacent to it in the requested orientation, and both panes remain usable

#### Scenario: Close a pane
- **WHEN** a user closes a pane
- **THEN** the system removes it from the layout and the remaining panes occupy the freed space

### Requirement: Sessions start in a specified working directory
The system SHALL start each terminal session's shell in a specified working directory, defaulting to the project's repository root when none is specified.

#### Scenario: New session uses project root
- **WHEN** a terminal session is started without a specified working directory
- **THEN** the shell starts in the project's repository root directory

#### Scenario: Restored session uses saved directory
- **WHEN** a terminal session is started from a restored layout that records a working directory
- **THEN** the shell starts in that working directory, resolved relative to the repository root

### Requirement: Session exit closes its pane, not the application
When a terminal session's shell process exits, the system SHALL close that session's pane and SHALL NOT exit the application as a result.

#### Scenario: Shell exits in one pane
- **WHEN** the shell process of a pane exits while other panes remain open
- **THEN** the system closes that pane and leaves the application and other panes running

#### Scenario: Last pane's shell exits
- **WHEN** the shell process of the only remaining pane exits
- **THEN** the system closes that pane, leaving the project open with no panes, and does not exit the application
