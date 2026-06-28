## ADDED Requirements

### Requirement: Fetch an OCI image by reference
The system SHALL fetch an OCI image identified by a reference (such as `ubuntu:24.04` or
`docker.io/library/alpine:latest`) from a registry, selecting the variant matching the guest
architecture, and unpack its layers into a cached root filesystem. Fetching SHALL use no external
command-line tools.

#### Scenario: Fetch a public image
- **WHEN** the system is asked to fetch a reference for an image available in a public registry
- **THEN** it downloads the image's layers for the guest architecture and produces an unpacked rootfs in the cache

#### Scenario: Reference has no matching architecture
- **WHEN** a fetched image index has no variant for the guest architecture
- **THEN** the system reports that the image is unavailable for this architecture and does not produce a rootfs

#### Scenario: Fetch fails
- **WHEN** a fetch cannot complete (unknown reference, network failure, or registry rejection)
- **THEN** the system reports the failure and does not leave a partial image in the cache

### Requirement: Layers unpack with whiteout semantics
When unpacking image layers, the system SHALL apply each layer in order and honor OCI whiteout
markers, so the flattened rootfs matches the image's layered filesystem.

#### Scenario: A later layer deletes a file
- **WHEN** a later layer contains a whiteout marker for a path created by an earlier layer
- **THEN** the unpacked rootfs does not contain that path

#### Scenario: An opaque directory marker hides earlier contents
- **WHEN** a layer marks a directory opaque
- **THEN** the unpacked rootfs contains only that layer's contents for the directory, not earlier layers'

### Requirement: Cached images are listed by reference
The system SHALL maintain an image cache keyed by reference and SHALL list the cached images by their
`name:tag` so they can be chosen without re-fetching.

#### Scenario: List cached images
- **WHEN** one or more images have been fetched
- **THEN** the system lists them by `name:tag`

#### Scenario: Reusing a cached image does not re-fetch
- **WHEN** a sandbox is requested for a reference already present in the cache
- **THEN** the system boots from the cached rootfs without contacting the registry

### Requirement: Run a container from a reference
The system SHALL let a user start a sandbox by selecting a cached image or entering an image
reference; when the reference is not cached, the system SHALL fetch it first and report progress, and
then boot a sandbox pane from it.

#### Scenario: Run a cached image
- **WHEN** a user selects a cached image to run
- **THEN** the system opens a sandbox pane booted from that image's cached rootfs

#### Scenario: Run a not-yet-cached reference
- **WHEN** a user enters a reference that is not cached and runs it
- **THEN** the system fetches the image with progress feedback and then opens a sandbox pane booted from it

#### Scenario: Fetch for a run fails
- **WHEN** fetching an entered reference fails
- **THEN** the system reports the failure and does not open a sandbox pane
