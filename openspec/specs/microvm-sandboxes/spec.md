# microvm-sandboxes Specification

## Purpose
TBD - created by archiving change run-microvm-sandboxes. Update Purpose after archive.
## Requirements
### Requirement: Sandbox runs from a prepared root filesystem
The system SHALL boot a microVM from a container's copy-on-write root filesystem with a guest init
agent as its init process, and SHALL run interactive commands inside it as exec sessions over a
host↔guest channel, so their input and output stream the same way as a local shell session. The
container rootfs is cloned from an immutable cached image; pulling images is covered by the
`container-images` capability.

#### Scenario: Run a shell in a sandbox
- **WHEN** a sandbox session is started for a running container with an interactive command such as `/bin/sh`
- **THEN** the system runs that command inside the container's microVM and the session streams its output

#### Scenario: Container root filesystem is not available
- **WHEN** a sandbox session is requested for a container whose root filesystem is missing
- **THEN** the system reports that the container is unavailable and does not start a session

### Requirement: Sandbox session runs in its own child process
A sandbox session SHALL run its microVM in a dedicated child process whose standard input and output
are connected to the session's pseudo-terminal, so that the microVM monitor controls only that child
and the application process is unaffected when the microVM exits.

#### Scenario: MicroVM exit does not affect the application
- **WHEN** a sandbox session's microVM shuts down
- **THEN** only that session's child process ends, and the application and other sessions keep running

#### Scenario: Interactive console over the session PTY
- **WHEN** a user types into a pane backed by a sandbox session
- **THEN** the input reaches the microVM guest console and the guest output renders in that pane

### Requirement: MicroVM substrate is swappable
The system SHALL access the microVM substrate through a single backend abstraction that exposes
creating a sandbox from an image, running a command on a PTY, and stopping the sandbox, so that the
underlying implementation can change without affecting callers.

#### Scenario: Lifecycle goes through the abstraction
- **WHEN** a developer inspects how the backend creates, runs, and stops a sandbox
- **THEN** those operations are mediated by one substrate abstraction rather than calling a specific runtime directly from terminal or UI code

### Requirement: Sandbox sessions reuse the terminal pipeline
A sandbox session SHALL use the same byte transport, terminal emulation, rendering, keyboard input,
and resize handling as a local shell session, differing only in the process behind the PTY.

#### Scenario: Interact with a sandbox session
- **WHEN** a user focuses a pane backed by a sandbox session and types text
- **THEN** the sandbox command receives the input bytes and its output renders in that pane

#### Scenario: Resize a sandbox session
- **WHEN** the viewport of a pane backed by a sandbox session changes size
- **THEN** the system resizes both the terminal emulation state and the sandbox PTY

### Requirement: Sandbox lifecycle is bounded by its session
The system SHALL stop a sandbox's microVM when its session ends, and a sandbox command exit SHALL
close that session's pane without exiting the application, as with a local shell session.

#### Scenario: Sandbox command exits
- **WHEN** the interactive command in a sandbox session exits
- **THEN** the system stops that sandbox's microVM, closes the session's pane, and leaves the application running

#### Scenario: Session stopped by the user
- **WHEN** a user closes a pane backed by a running sandbox session
- **THEN** the system stops that sandbox's microVM and frees its resources

### Requirement: Platform requirements for running microVMs
The system SHALL run microVMs only where the host supports the libkrun-family substrate: on macOS
this SHALL require Apple Silicon with the application code-signed with the hypervisor entitlement
and the guest kernel bundled; on Linux this SHALL require access to the kernel virtualization
device. Where these are not met, the system SHALL report that sandboxes are unavailable rather than
failing obscurely.

#### Scenario: Unsupported macOS hardware
- **WHEN** the application runs on macOS hardware that does not support the hypervisor framework
- **THEN** the system reports that sandboxes require Apple Silicon and does not offer to start one

#### Scenario: Linux without virtualization access
- **WHEN** the application runs on Linux without access to the kernel virtualization device
- **THEN** the system reports that sandboxes are unavailable and explains the required access

#### Scenario: Guest kernel is present
- **WHEN** the application starts a sandbox on a supported host
- **THEN** the bundled guest kernel is used to boot the microVM without a separate installation step

