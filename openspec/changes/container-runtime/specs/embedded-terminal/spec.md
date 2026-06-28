## MODIFIED Requirements

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
