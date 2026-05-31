## ADDED Requirements

### Requirement: Terminal uses libghostty
The embedded terminal SHALL use libghostty for terminal emulation from the first implementation.

#### Scenario: Verify terminal implementation dependency
- **WHEN** a developer inspects the terminal subsystem
- **THEN** terminal emulation is implemented through libghostty rather than a temporary non-Ghostty terminal emulator

### Requirement: Terminal renders local shell output
The system SHALL provide one embedded terminal session that renders output from a local shell process.

#### Scenario: Open local shell terminal
- **WHEN** the application starts a terminal session
- **THEN** the terminal viewport displays output from a local shell process

### Requirement: Terminal accepts keyboard input
The system SHALL send keyboard input from the terminal viewport to the active local shell session.

#### Scenario: Type into terminal
- **WHEN** a user focuses the terminal viewport and types text
- **THEN** the active shell receives the corresponding input bytes

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
