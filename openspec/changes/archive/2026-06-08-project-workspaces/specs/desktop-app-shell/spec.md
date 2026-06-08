## MODIFIED Requirements

### Requirement: Application shell hosts terminal area
The system SHALL provide a main application shell with two states: a "no project open" state that presents the project picker, and a "project open" state whose main view hosts the open project's terminal pane layout.

#### Scenario: View picker when no project is open
- **WHEN** the application window is open and no project is open
- **THEN** the main view presents the project picker

#### Scenario: View project pane layout
- **WHEN** a project is open
- **THEN** the main view hosts that project's terminal pane layout
