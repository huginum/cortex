## Purpose

Define the desktop application shell foundation for Cortex.

## Requirements

### Requirement: Desktop app launches
The system SHALL provide a Tauri desktop application with a React frontend that launches on macOS for local development.

#### Scenario: Launch development app
- **WHEN** a developer starts the Tauri development command
- **THEN** the system opens a desktop window containing the React application shell

### Requirement: Application shell hosts terminal area
The system SHALL provide a main application shell with two states: a "no project open" state that presents the project picker, and a "project open" state whose main view hosts the open project's terminal pane layout.

#### Scenario: View picker when no project is open
- **WHEN** the application window is open and no project is open
- **THEN** the main view presents the project picker

#### Scenario: View project pane layout
- **WHEN** a project is open
- **THEN** the main view hosts that project's terminal pane layout

### Requirement: Desktop app has minimal platform configuration
The system SHALL include minimal Tauri configuration for a macOS desktop application without introducing mobile or unrelated platform targets.

#### Scenario: Inspect platform scope
- **WHEN** a developer reviews the Tauri configuration
- **THEN** the configuration is scoped to the desktop bootstrap needed for macOS development
