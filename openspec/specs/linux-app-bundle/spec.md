# linux-app-bundle Specification

## Purpose
TBD - created by archiving change container-images-and-linux-bundle. Update Purpose after archive.
## Requirements
### Requirement: Self-contained Linux bundle embeds the VMM
The system SHALL provide a Linux application bundle (AppImage), targeting ARM first, that embeds
libkrun and the guest kernel (libkrunfw), so sandboxes run without installing the VMM separately.

#### Scenario: Bundle contains the VMM libraries
- **WHEN** the Linux bundle is produced
- **THEN** it contains the libkrun and libkrunfw shared libraries

#### Scenario: Run sandboxes without a separate VMM install
- **WHEN** the bundle runs on a Linux host that has not installed libkrun
- **THEN** a sandbox session can still boot, using the embedded libraries

### Requirement: The bundled VMM is resolved at runtime
When running from the bundle, the system SHALL make the embedded libkrun and libkrunfw discoverable to
the sandbox helper at runtime, without relying on host library installation.

#### Scenario: Helper finds the embedded libraries
- **WHEN** the sandbox helper starts inside the bundle
- **THEN** it resolves the embedded libkrun and libkrunfw rather than failing to load them

### Requirement: Linux host virtualization requirement is reported
On Linux the bundle SHALL require host KVM access, and SHALL report when it is unavailable rather than
failing obscurely.

#### Scenario: Host without KVM access
- **WHEN** the bundle runs on a Linux host without access to `/dev/kvm`
- **THEN** the system reports that sandboxes require `/dev/kvm` access and does not fail silently

