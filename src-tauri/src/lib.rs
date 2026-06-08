mod project;
mod settings;
mod terminal;

#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
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
            quit_app,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Cortex");
}
