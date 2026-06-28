# container-exec Specification

## Purpose
TBD - created by archiving change container-runtime. Update Purpose after archive.
## Requirements
### Requirement: A running container is driven by a guest init agent
A running container SHALL boot a microVM whose init process is a guest agent that keeps the container
alive and accepts exec requests over a host↔guest channel, rather than running a single command that
ends the VM when it exits.

#### Scenario: Container stays running for exec
- **WHEN** a container is running and its current shells are idle
- **THEN** the container's microVM remains alive and ready to accept additional shells

#### Scenario: Stopping ends the agent
- **WHEN** a running container is stopped
- **THEN** the guest agent shuts down and the microVM exits

### Requirement: Open a shell by exec into a running container
The system SHALL open a shell in a running container by asking the guest agent to run a command with
a pseudo-terminal inside the container, starting the container first if it is not already running.

#### Scenario: First shell starts the container
- **WHEN** a user opens a shell in a container that is not running
- **THEN** the system starts the container's agent microVM and opens a shell in it

#### Scenario: Exec a chosen command
- **WHEN** a user opens a shell specifying a command
- **THEN** the agent runs that command with a pseudo-terminal and the session streams its output

### Requirement: Multiple shells share one running container
The system SHALL support multiple concurrent shells in the same running container, each its own exec
session, without booting an additional microVM.

#### Scenario: Second shell in the same container
- **WHEN** a user opens another shell in an already-running container
- **THEN** the system opens it in the same microVM as a separate exec session, sharing the container's filesystem and processes

#### Scenario: One shell exits, others continue
- **WHEN** one shell in a container exits while other shells remain open
- **THEN** only that exec session ends and the container keeps running with its remaining shells

### Requirement: Exec sessions carry input, output, and resize
An exec session SHALL stream keyboard input to the guest command, render its output, and propagate
viewport resizes to the guest pseudo-terminal, the same way a host-shell session does.

#### Scenario: Type into an exec shell
- **WHEN** a user types in a container shell pane
- **THEN** the guest command receives the input and its output renders in that pane

#### Scenario: Resize an exec shell
- **WHEN** the viewport of a container shell pane changes size
- **THEN** the guest pseudo-terminal is resized to match

