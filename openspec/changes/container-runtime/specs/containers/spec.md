## ADDED Requirements

### Requirement: Create a container from an image
The system SHALL create a container as an instance of a cached image, giving it a generated id and
its own copy-on-write root filesystem cloned from the image, while leaving the image unchanged. A
container SHALL record the command it runs by default (`/bin/sh` when unspecified).

#### Scenario: Instantiate an image
- **WHEN** a user creates a container from a cached image
- **THEN** the system clones the image rootfs copy-on-write into a new container with a generated id, and the image rootfs is unchanged

#### Scenario: Writes stay in the container
- **WHEN** a process in a container writes to its filesystem
- **THEN** the change is confined to that container's rootfs and does not affect the image or other containers

### Requirement: Containers have a name
A container SHALL have a name: a generated `adjective_noun` name when none is given, or a
user-specified name. A name SHALL be unique among containers.

#### Scenario: Auto-generated name
- **WHEN** a container is created without a name
- **THEN** the system assigns a unique generated name

#### Scenario: User-specified name
- **WHEN** a container is created with a name that is not already in use
- **THEN** the system uses that name

#### Scenario: Duplicate name rejected
- **WHEN** a container is created with a name already in use
- **THEN** the system reports the conflict and does not create the container

### Requirement: Containers persist and are listable
The system SHALL keep a container (its rootfs and metadata) until it is removed, and SHALL list
containers with their id, name, image, and running state.

#### Scenario: List containers
- **WHEN** containers exist
- **THEN** the system lists them with id, name, image, and whether each is running

#### Scenario: Container survives stop
- **WHEN** a running container is stopped
- **THEN** its rootfs and metadata remain and it is listed as stopped

### Requirement: Container lifecycle
The system SHALL support running, stopping, and removing a container. Removing a container SHALL
delete its rootfs; removing SHALL require the container to be stopped first.

#### Scenario: Run a custom command
- **WHEN** a container is run with a specified command
- **THEN** the container runs that command instead of the default `/bin/sh`

#### Scenario: Stop a running container
- **WHEN** a user stops a running container
- **THEN** the system shuts down its microVM and marks it stopped, preserving its rootfs

#### Scenario: Remove a container
- **WHEN** a user removes a stopped container
- **THEN** the system deletes its rootfs and metadata and it no longer appears in the list
