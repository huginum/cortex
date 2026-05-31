use std::{env, fs};

use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalSettings {
    font_family: Option<String>,
    font_size: Option<f64>,
    adjust_cell_height: Option<f64>,
}

#[tauri::command]
pub fn get_terminal_settings() -> TerminalSettings {
    let Some(home) = env::var_os("HOME") else {
        return TerminalSettings::default();
    };

    let path = std::path::PathBuf::from(home).join(".config/ghostty/config");
    let Ok(contents) = fs::read_to_string(path) else {
        return TerminalSettings::default();
    };

    parse_ghostty_config(&contents)
}

impl Default for TerminalSettings {
    fn default() -> Self {
        Self {
            font_family: None,
            font_size: None,
            adjust_cell_height: None,
        }
    }
}

fn parse_ghostty_config(contents: &str) -> TerminalSettings {
    let mut settings = TerminalSettings::default();

    for line in contents.lines() {
        let line = line.split('#').next().unwrap_or_default().trim();
        if line.is_empty() {
            continue;
        }

        let Some((key, value)) = line.split_once('=') else {
            continue;
        };
        let key = key.trim();
        let value = value.trim();

        match key {
            "font-family" if !value.is_empty() => settings.font_family = Some(value.to_string()),
            "font-size" => settings.font_size = value.parse().ok(),
            "adjust-cell-height" => settings.adjust_cell_height = value.parse().ok(),
            _ => {}
        }
    }

    settings
}

#[cfg(test)]
mod tests {
    use super::parse_ghostty_config;

    #[test]
    fn parses_supported_ghostty_terminal_settings() {
        let settings = parse_ghostty_config(
            r#"
            font-family = FiraCode Nerd Font Mono
            font-size = 12
            adjust-cell-height = -1
            custom-shader = shaders/cursor_warp.glsl
            "#,
        );

        assert_eq!(
            settings.font_family.as_deref(),
            Some("FiraCode Nerd Font Mono")
        );
        assert_eq!(settings.font_size, Some(12.0));
        assert_eq!(settings.adjust_cell_height, Some(-1.0));
    }
}
