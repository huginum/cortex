mod project;
pub mod sandbox;
mod settings;
mod terminal;

use tauri::Manager;

#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

/// Whether this host can run microVM sandboxes.
#[tauri::command]
fn sandbox_support() -> sandbox::SandboxSupport {
    sandbox::sandbox_support()
}

/// Prepared rootfs entries a sandbox session can boot from, under the app's
/// `rootfs` config directory. Empty when the directory is absent.
#[tauri::command]
fn list_sandbox_rootfs(app: tauri::AppHandle) -> Vec<sandbox::RootfsEntry> {
    match app.path().app_config_dir() {
        Ok(dir) => sandbox::list_rootfs(&dir.join("rootfs")),
        Err(_) => Vec::new(),
    }
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
            list_sandbox_rootfs,
            quit_app,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Cortex");
}
