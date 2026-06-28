## MODIFIED Requirements

### Requirement: Terminal renders local shell output
The system SHALL support multiple concurrent embedded terminal sessions within an open project,
each rendering output from its own backing process and each displayed in its own pane. A session's
backing process SHALL be either a local shell process or a sandbox shell process running in a
microVM.

#### Scenario: Open local shell terminal
- **WHEN** a project starts a terminal session in a pane with a host-shell backing
- **THEN** that pane displays output from a local shell process

#### Scenario: Open sandbox terminal
- **WHEN** a project starts a terminal session in a pane with a sandbox backing for an image reference
- **THEN** that pane displays output from a command running inside the microVM booted from that image's cached rootfs

#### Scenario: Multiple sessions render independently
- **WHEN** a project has more than one terminal session open
- **THEN** each pane renders output from its own backing process independently of the others, regardless of whether the backing is a local shell or a sandbox

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
