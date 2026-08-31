mod models;
mod parser;
mod quota;
mod scanner;

use std::sync::Mutex;
use tauri::{Manager, PhysicalPosition, PhysicalSize, State, WebviewWindow};
use models::SystemAgentSummary;
use scanner::AgentScanner;

#[cfg(target_os = "linux")]
use cairo::{RectangleInt, Region};
#[cfg(target_os = "linux")]
use gtk::prelude::*;

/// Ancho logico de la ventana. La ventana va pegada al borde derecho y es
/// transparente, asi que lo que sobra a la izquierda del notch es sitio para
/// que se despliegue el panel de detalle. Tiene que coincidir con `STAGE.width`
/// del front y con `app.windows[0].width` de tauri.conf.json.
const WINDOW_WIDTH: f64 = 420.0;

struct AppState {
    scanner: Mutex<AgentScanner>,
}

#[tauri::command]
fn scan_agents(state: State<AppState>) -> Result<SystemAgentSummary, String> {
    let mut scanner = state.scanner.lock().map_err(|e| e.to_string())?;
    Ok(scanner.scan())
}

/// Configure Linux GTK window properties for an always-on-top dock.
fn configure_linux_window(window: &WebviewWindow) {
    #[cfg(target_os = "linux")]
    {
        if let Ok(gtk_win) = window.gtk_window() {
            gtk_win.set_keep_above(true);
            gtk_win.set_skip_taskbar_hint(true);
            gtk_win.set_skip_pager_hint(true);
            gtk_win.set_decorated(false);
            gtk_win.set_resizable(false);
        }
    }
}

/// Update X11/Wayland input mask so only the active UI area catches clicks,
/// and all transparent area passes clicks through to the desktop.
fn update_input_shape(window: &WebviewWindow, mode: &str, height: u32, scale_factor: f64) {
    #[cfg(target_os = "linux")]
    {
        if let Ok(gtk_win) = window.gtk_window() {
            let total_w = (WINDOW_WIDTH * scale_factor).round() as i32;

            let rect = match mode {
                "peek" => {
                    let peek_w = (40.0 * scale_factor).round() as i32;
                    let peek_h = (72.0 * scale_factor).round() as i32;
                    RectangleInt::new(total_w - peek_w, 0, peek_w, peek_h)
                }
                "bar" => {
                    let bar_w = (80.0 * scale_factor).round() as i32;
                    let current_h = (((height + 100) as f64).max(140.0) * scale_factor).round() as i32;
                    RectangleInt::new(total_w - bar_w, 0, bar_w, current_h)
                }
                _ => {
                    // "expanded" or "open"
                    let exp_h = (((height + 120) as f64).max(380.0) * scale_factor).round() as i32;
                    RectangleInt::new(0, 0, total_w, exp_h)
                }
            };

            let region = Region::create_rectangle(&rect);
            gtk_win.input_shape_combine_region(Some(&region));
        }
    }
}

/// Core geometry computation — overlay de ancho fijo `WINDOW_WIDTH`.
fn compute_geometry(
    monitor_size: &tauri::PhysicalSize<u32>,
    monitor_pos: &tauri::PhysicalPosition<i32>,
    scale_factor: f64,
) -> (PhysicalSize<u32>, PhysicalPosition<i32>) {
    let w_logical = WINDOW_WIDTH;
    let h_logical = 600.0; // Fixed comfortable overlay height

    let tw = (w_logical * scale_factor).round() as u32;
    let th = ((h_logical * scale_factor).round() as u32).min(monitor_size.height);

    // Anchor: right edge of window ALWAYS aligns with right edge of monitor
    let x = monitor_pos.x + (monitor_size.width as i32) - (tw as i32);
    // Vertical: fixed at 2/7 from top
    let y = monitor_pos.y + ((monitor_size.height as i32) * 2) / 7;

    (
        PhysicalSize { width: tw, height: th },
        PhysicalPosition { x, y },
    )
}

/// Initialize fixed window geometry once.
fn setup_initial_geometry(window: &WebviewWindow) {
    let monitor = window
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| window.primary_monitor().ok().flatten())
        .or_else(|| window.available_monitors().ok().and_then(|m| m.into_iter().next()));

    let (monitor_size, monitor_pos, scale) = if let Some(ref mon) = monitor {
        (*mon.size(), *mon.position(), mon.scale_factor())
    } else {
        (
            tauri::PhysicalSize { width: 1920, height: 1080 },
            tauri::PhysicalPosition { x: 0, y: 0 },
            1.0,
        )
    };

    let (size, pos) = compute_geometry(
        &monitor_size,
        &monitor_pos,
        scale,
    );

    configure_linux_window(window);

    let _ = window.set_size(tauri::Size::Physical(size));
    let _ = window.set_position(tauri::Position::Physical(pos));
    let _ = window.set_always_on_top(true);

    update_input_shape(window, "peek", 60, scale);
}

#[tauri::command]
fn set_notch_mode(window: WebviewWindow, mode: String, height: u32) -> Result<(), String> {
    let monitor = window
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| window.primary_monitor().ok().flatten())
        .or_else(|| window.available_monitors().ok().and_then(|m| m.into_iter().next()));

    let scale = monitor.map(|m| m.scale_factor()).unwrap_or(1.0);
    update_input_shape(&window, &mode, height, scale);
    Ok(())
}

#[tauri::command]
fn snap_to_right_edge(window: WebviewWindow) -> Result<(), String> {
    let monitor = window
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| window.primary_monitor().ok().flatten())
        .or_else(|| window.available_monitors().ok().and_then(|m| m.into_iter().next()));

    let scale = monitor.map(|m| m.scale_factor()).unwrap_or(1.0);
    update_input_shape(&window, "peek", 60, scale);
    Ok(())
}

#[tauri::command]
fn open_in_terminal(cwd: Option<String>, terminal: Option<String>) -> Result<(), String> {
    let target_dir = cwd
        .filter(|s| !s.is_empty())
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| dirs::home_dir().unwrap_or_else(|| std::path::PathBuf::from("/home/jhon")));

    #[cfg(target_os = "linux")]
    {
        let mut terminals = vec!["warp-terminal", "konsole", "alacritty", "kitty", "ghostty", "x-terminal-emulator"];
        if let Some(ref pref) = terminal {
            if pref != "auto" && !pref.is_empty() {
                terminals.insert(0, pref.as_str());
            }
        }
        for term in terminals {
            if std::process::Command::new(term)
                .current_dir(&target_dir)
                .spawn()
                .is_ok()
            {
                return Ok(());
            }
        }
        std::process::Command::new("sh")
            .arg("-c")
            .arg(format!("cd \"{}\" && x-terminal-emulator", target_dir.display()))
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("wt.exe")
            .arg("-d")
            .arg(&target_dir)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn open_in_file_manager(cwd: Option<String>) -> Result<(), String> {
    let target_dir = cwd
        .filter(|s| !s.is_empty())
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| dirs::home_dir().unwrap_or_else(|| std::path::PathBuf::from("/home/jhon")));

    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&target_dir)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&target_dir)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn exit_app(app: tauri::AppHandle) {
    app.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let scanner = AgentScanner::new();
    let state = AppState {
        scanner: Mutex::new(scanner),
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(state)
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                let win = window.clone();
                setup_initial_geometry(&win);
                let _ = win.show();
            }
            // Cuota real de Claude en segundo plano: el escaneo nunca espera a la red.
            quota::spawn_poller();
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            scan_agents,
            set_notch_mode,
            snap_to_right_edge,
            open_in_terminal,
            open_in_file_manager,
            exit_app
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
