## MODIFIED Requirements

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
