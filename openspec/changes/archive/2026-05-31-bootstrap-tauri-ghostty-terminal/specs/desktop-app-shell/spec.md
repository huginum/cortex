## ADDED Requirements

### Requirement: Desktop app launches
The system SHALL provide a Tauri desktop application with a React frontend that launches on macOS for local development.

#### Scenario: Launch development app
- **WHEN** a developer starts the Tauri development command
- **THEN** the system opens a desktop window containing the React application shell

### Requirement: Application shell hosts terminal area
The system SHALL provide a main application shell with a dedicated terminal viewport area.

#### Scenario: View terminal host area
- **WHEN** the application window is open
- **THEN** the main view contains a terminal host area ready to display an embedded terminal session

### Requirement: Desktop app has minimal platform configuration
The system SHALL include minimal Tauri configuration for a macOS desktop application without introducing mobile or unrelated platform targets.

#### Scenario: Inspect platform scope
- **WHEN** a developer reviews the Tauri configuration
- **THEN** the configuration is scoped to the desktop bootstrap needed for macOS development
