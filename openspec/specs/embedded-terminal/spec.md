## Purpose

Define the embedded terminal foundation for Cortex.
## Requirements
### Requirement: Terminal uses libghostty
The embedded terminal SHALL use libghostty for terminal emulation from the first implementation.

#### Scenario: Verify terminal implementation dependency
- **WHEN** a developer inspects the terminal subsystem
- **THEN** terminal emulation is implemented through libghostty rather than a temporary non-Ghostty terminal emulator

### Requirement: Terminal renders local shell output
The system SHALL support multiple concurrent embedded terminal sessions within an open project,
each rendering output from its own backing process and each displayed in its own pane. A session's
backing process SHALL be either a local shell process or a shell exec'd into a container running in a
microVM.

#### Scenario: Open local shell terminal
- **WHEN** a project starts a terminal session in a pane with a host-shell backing
- **THEN** that pane displays output from a local shell process

#### Scenario: Open container terminal
- **WHEN** a project starts a terminal session in a pane with a container backing
- **THEN** that pane displays output from a shell exec'd into that container's microVM

#### Scenario: Multiple sessions render independently
- **WHEN** a project has more than one terminal session open
- **THEN** each pane renders output from its own backing process independently of the others, regardless of whether the backing is a local shell or a container shell

### Requirement: Terminal accepts keyboard input
The system SHALL send keyboard input to the shell session of the currently focused terminal pane.

#### Scenario: Type into the focused pane
- **WHEN** a user focuses a terminal pane and types text
- **THEN** the shell session of that pane receives the corresponding input bytes

#### Scenario: Input follows focus
- **WHEN** a user moves focus from one pane to another and types text
- **THEN** only the newly focused pane's shell session receives the input bytes

### Requirement: Terminal resizes with viewport
The system SHALL resize both the terminal emulation state and backend PTY when the terminal viewport dimensions change.

#### Scenario: Resize terminal viewport
- **WHEN** the terminal viewport size changes
- **THEN** the terminal session updates its row and column dimensions for rendering and shell interaction

### Requirement: Terminal architecture supports future session backends
The terminal subsystem SHALL separate session byte transport from terminal rendering so future sessions can attach to non-local-shell backends.

#### Scenario: Review terminal boundaries
- **WHEN** a developer reviews the terminal subsystem interfaces
- **THEN** local shell process management is separated from frontend terminal rendering and input handling

### Requirement: Terminals arrange in split panes
The system SHALL allow the terminals within a project to be arranged as a tree of split panes,
supporting both horizontal and vertical splits and an arbitrary number of panes. Splitting a pane
SHALL open a same-context shell: another host shell for a host pane, or another shell in the same
container for a container pane.

#### Scenario: Split a pane
- **WHEN** a user splits a pane horizontally or vertically
- **THEN** the system creates a new pane adjacent to it in the requested orientation, and both panes remain usable

#### Scenario: Split a host pane
- **WHEN** a user splits a host-shell pane
- **THEN** the new pane is another host shell

#### Scenario: Split a container pane
- **WHEN** a user splits a container pane
- **THEN** the new pane is another shell exec'd into the same running container

#### Scenario: Close a pane
- **WHEN** a user closes a pane
- **THEN** the system removes it from the layout and the remaining panes occupy the freed space

### Requirement: Sessions start in a specified working directory
For host-shell sessions, the system SHALL start the shell in a specified working directory,
defaulting to the project's repository root when none is specified. Sandbox sessions are defined by
an image reference and do not take a host working directory.

#### Scenario: New host-shell session uses project root
- **WHEN** a host-shell terminal session is started without a specified working directory
- **THEN** the shell starts in the project's repository root directory

#### Scenario: Restored host-shell session uses saved directory
- **WHEN** a host-shell terminal session is started from a restored layout that records a working directory
- **THEN** the shell starts in that working directory, resolved relative to the repository root

#### Scenario: Sandbox session ignores host working directory
- **WHEN** a sandbox terminal session is started
- **THEN** the session is defined by its image reference rather than a host working directory

### Requirement: Session exit closes its pane, not the application
When a terminal session's shell process exits, the system SHALL close that session's pane and SHALL NOT exit the application as a result.

#### Scenario: Shell exits in one pane
- **WHEN** the shell process of a pane exits while other panes remain open
- **THEN** the system closes that pane and leaves the application and other panes running

#### Scenario: Last pane's shell exits
- **WHEN** the shell process of the only remaining pane exits
- **THEN** the system closes that pane, leaving the project open with no panes, and does not exit the application

