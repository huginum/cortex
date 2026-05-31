## Purpose

Define developer documentation expectations for Cortex.

## Requirements

### Requirement: Developer guide exists
The system SHALL provide an Antora-based developer guide structure for project development documentation.

#### Scenario: Locate developer guide
- **WHEN** a developer browses the documentation source
- **THEN** they can find the developer guide entry points in the Antora documentation structure

### Requirement: ADR policy is documented
The developer guide SHALL document how Cortex records architecture-significant decisions as ADRs.

#### Scenario: Review ADR guidance
- **WHEN** a developer reads the ADR guidance
- **THEN** they understand where ADRs live, when to create one, and how ADR tasks relate to OpenSpec changes

### Requirement: Terminal development guidance is documented
The developer guide SHALL include concise guidance for working on the Tauri + React + libghostty terminal foundation.

#### Scenario: Review terminal development notes
- **WHEN** a developer reads the terminal development guide
- **THEN** they understand the high-level terminal architecture and required local tools

### Requirement: Documentation updates are included with behavior changes
OpenSpec implementation tasks SHALL include Antora documentation updates when a change affects user-facing or developer-facing behavior.

#### Scenario: Review implementation tasks
- **WHEN** a change affects user-facing or developer-facing behavior
- **THEN** its tasks include concise Antora documentation work
