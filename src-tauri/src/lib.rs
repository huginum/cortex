pub mod images;
mod project;
pub mod sandbox;
mod settings;
mod terminal;

use tauri::{Emitter, Manager};

#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

/// Whether this host can run microVM sandboxes.
#[tauri::command]
fn sandbox_support() -> sandbox::SandboxSupport {
    sandbox::sandbox_support()
}

/// The image cache directory, under the app data dir.
pub(crate) fn images_root(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|dir| dir.join("images"))
        .map_err(|error| error.to_string())
}

/// Cached OCI images a sandbox can boot from, listed by `name:tag`.
#[tauri::command]
fn list_images(app: tauri::AppHandle) -> Vec<images::ImageEntry> {
    match images_root(&app) {
        Ok(root) => images::list_cached(&root),
        Err(_) => Vec::new(),
    }
}

/// Ensure an OCI image is cached, pulling and unpacking it if needed. Emits
/// `image-pull` progress events keyed by reference while it runs.
#[tauri::command]
async fn pull_image(app: tauri::AppHandle, reference: String) -> Result<(), images::ImageError> {
    let root = images_root(&app).map_err(images::ImageError::Io)?;
    let progress_app = app.clone();
    let progress_ref = reference.clone();
    images::ensure_image(&root, &reference, |phase| {
        let _ = progress_app.emit(
            "image-pull",
            images::PullProgress {
                reference: progress_ref.clone(),
                phase: phase.to_string(),
            },
        );
    })
    .await
    .map(|_| ())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            app.set_menu(tauri::menu::Menu::default(app.handle())?)?;
            Ok(())
        })
        .manage(terminal::TerminalManager::default())
        .invoke_handler(tauri::generate_handler![
            settings::get_terminal_settings,
            terminal::start_terminal,
            terminal::subscribe_terminal,
            terminal::write_terminal,
            terminal::resize_terminal,
            terminal::stop_terminal,
            project::list_recent_projects,
            project::remove_recent_project,
            project::open_project,
            project::init_project,
            project::clone_project,
            project::read_layout,
            project::write_layout,
            sandbox_support,
            list_images,
            pull_image,
            quit_app,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Cortex");
}
