mod models;
mod parser;
mod quota;
mod scanner;

use std::sync::Mutex;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Manager, PhysicalPosition, PhysicalSize, State, WebviewWindow};
use models::SystemAgentSummary;
use scanner::AgentScanner;

#[cfg(target_os = "linux")]
use cairo::{RectangleInt, Region};
#[cfg(target_os = "linux")]
use gtk::prelude::*;

/// Profundidad del escenario: lo que se mete la ventana hacia dentro desde el
/// borde de pantalla. La ventana es transparente y lo que sobra por delante del
/// notch es sitio para que se despliegue el panel. El otro eje lo cubre entero:
/// asi el notch puede deslizarse por todo el borde sin mover la ventana, que es
/// lo que antes lo dejaba fuera de alcance en media pantalla.
const STAGE_DEPTH: f64 = 420.0;

/// Cuanto mas cerca (px logicos) tiene que estar otro borde para que el notch
/// salte a el. Sin esta banda muerta parpadea entre dos bordes en las
/// diagonales, que es justo donde el puntero pasa mas rato al arrastrar.
const EDGE_HYSTERESIS: f64 = 90.0;

fn is_horizontal(edge: &str) -> bool {
    edge == "top" || edge == "bottom"
}

fn normalize_edge(edge: &str) -> &'static str {
    match edge {
        "left" => "left",
        "top" => "top",
        "bottom" => "bottom",
        _ => "right",
    }
}

/// Borde de pantalla al que apunta el puntero y donde cae sobre el eje de ese
/// borde, como fraccion de su largo y ya en el sentido local de la columna.
#[derive(Clone, serde::Serialize)]
struct DragTarget {
    edge: String,
    offset: f64,
}

/// Ultimo recorte que pidio el front. Hay que recordarlo para poder reponerlo
/// al volver de la bandeja: el remapeo de la ventana se lleva por delante la
/// region de input, y el front no vuelve a pedir nada porque su estado no ha
/// cambiado — se quedaria con el notch pintado y nada que cazara el raton.
#[derive(Clone)]
struct Shape {
    mode: String,
    height: u32,
    along: f64,
}

impl Default for Shape {
    fn default() -> Self {
        Shape { mode: "peek".into(), height: 60, along: 0.0 }
    }
}

struct AppState {
    scanner: Mutex<AgentScanner>,
    /// Solo el borde: la posicion a lo largo de el vive en el front, que la
    /// mueve por CSS sin tocar la ventana.
    edge: Mutex<String>,
    shape: Mutex<Shape>,
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
            gtk_win.set_type_hint(gdk::WindowTypeHint::Dock);
            gtk_win.stick();
            gtk_win.set_keep_above(true);
            gtk_win.set_skip_taskbar_hint(true);
            gtk_win.set_skip_pager_hint(true);
            gtk_win.set_decorated(false);
            gtk_win.set_resizable(false);
            gtk_win.set_role("agent-notch");
        }
    }
}

/// Update X11/Wayland input mask so only the active UI area catches clicks,
/// and all transparent area passes clicks through to the desktop.
///
/// La region se calcula en coordenadas locales de la columna (profundidad desde
/// el borde de pantalla, y `along` + largo sobre el eje del borde) y luego se
/// coloca segun el borde, igual que hace `columnTransform` en el front. Girado
/// 180 (izquierda) o 90 (abajo) el notch corre hacia atras sobre su eje largo,
/// de ahi los origenes en el extremo opuesto.
fn update_input_shape(
    window: &WebviewWindow,
    mode: &str,
    height: u32,
    along: f64,
    scale_factor: f64,
    edge: &str,
    (sw, sh): (f64, f64),
) {
    #[cfg(target_os = "linux")]
    {
        let Ok(gtk_win) = window.gtk_window() else { return };

        // Expandido ocupa la ventana entera: mientras hay un panel abierto (o se
        // esta arrastrando) el puntero esta encima del notch de todas formas, y
        // recortar la region dejaria fuera al panel, que sale de la columna.
        let (x, y, w, h) = match mode {
            "peek" | "bar" => {
                let (depth, run) = if mode == "peek" {
                    (40.0, 72.0)
                } else {
                    (80.0, (f64::from(height) + 100.0).max(140.0))
                };
                let a = along.max(0.0);
                match edge {
                    "left" => (0.0, sh - a - run, depth, run),
                    "top" => (a, 0.0, run, depth),
                    "bottom" => (sw - a - run, sh - depth, run, depth),
                    _ => (sw - depth, a, depth, run),
                }
            }
            _ => (0.0, 0.0, sw, sh),
        };

        let px = |v: f64| (v.max(0.0) * scale_factor).round() as i32;
        let rect = RectangleInt::new(px(x), px(y), px(w), px(h));
        gtk_win.input_shape_combine_region(Some(&Region::create_rectangle(&rect)));
    }
}

/// Core geometry: la ventana cubre el borde `edge` de punta a punta y se mete
/// `STAGE_DEPTH` hacia dentro.
fn compute_geometry(
    monitor_size: &tauri::PhysicalSize<u32>,
    monitor_pos: &tauri::PhysicalPosition<i32>,
    scale_factor: f64,
    edge: &str,
) -> (PhysicalSize<u32>, PhysicalPosition<i32>) {
    let depth = (STAGE_DEPTH * scale_factor).round() as u32;

    if is_horizontal(edge) {
        let h = depth.min(monitor_size.height);
        let y = if edge == "top" {
            monitor_pos.y
        } else {
            monitor_pos.y + monitor_size.height as i32 - h as i32
        };
        (
            PhysicalSize { width: monitor_size.width, height: h },
            PhysicalPosition { x: monitor_pos.x, y },
        )
    } else {
        let w = depth.min(monitor_size.width);
        let x = if edge == "left" {
            monitor_pos.x
        } else {
            monitor_pos.x + monitor_size.width as i32 - w as i32
        };
        (
            PhysicalSize { width: w, height: monitor_size.height },
            PhysicalPosition { x, y: monitor_pos.y },
        )
    }
}

fn monitor_of(window: &WebviewWindow) -> Option<tauri::Monitor> {
    window
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| window.primary_monitor().ok().flatten())
        .or_else(|| window.available_monitors().ok().and_then(|m| m.into_iter().next()))
}

/// Recoloca y redimensiona la ventana para un borde, y repone la mascara de
/// input, que depende de el.
fn apply_edge(window: &WebviewWindow, edge: &str, mode: &str, height: u32, along: f64) {
    let monitor = monitor_of(window);
    let (monitor_size, monitor_pos, scale) = match monitor {
        Some(ref mon) => (*mon.size(), *mon.position(), mon.scale_factor()),
        None => (
            tauri::PhysicalSize { width: 1920, height: 1080 },
            tauri::PhysicalPosition { x: 0, y: 0 },
            1.0,
        ),
    };

    let (size, pos) = compute_geometry(&monitor_size, &monitor_pos, scale, edge);
    let logical = (size.width as f64 / scale, size.height as f64 / scale);
    let _ = window.set_size(tauri::Size::Physical(size));

    // Por el camino de tao el cambio de tamano se queda en un
    // `gtk_window_resize` que GTK ignora: la ventana es `resizable(false)`. Con
    // el tamano fijado como peticion minima si obedece, porque una ventana no
    // redimensionable toma su tamano natural.
    #[cfg(target_os = "linux")]
    {
        if let Ok(gtk_win) = window.gtk_window() {
            gtk_win.set_size_request(logical.0.round() as i32, logical.1.round() as i32);
        }
    }

    let _ = window.set_position(tauri::Position::Physical(pos));
    update_input_shape(window, mode, height, along, scale, edge, logical);
}

/// Initialize window geometry for an edge.
fn setup_initial_geometry(window: &WebviewWindow, edge: &str, shape: &Shape) {
    configure_linux_window(window);
    apply_edge(window, edge, &shape.mode, shape.height, shape.along);
    let _ = window.set_always_on_top(true);
}

#[tauri::command]
fn set_notch_mode(
    window: WebviewWindow,
    state: State<AppState>,
    mode: String,
    height: u32,
    along: f64,
) -> Result<(), String> {
    let edge = state.edge.lock().map_err(|e| e.to_string())?.clone();
    *state.shape.lock().map_err(|e| e.to_string())? = Shape {
        mode: mode.clone(),
        height,
        along,
    };
    let scale = monitor_of(&window).map(|m| m.scale_factor()).unwrap_or(1.0);
    let size = window
        .inner_size()
        .map(|s| (s.width as f64 / scale, s.height as f64 / scale))
        .unwrap_or((STAGE_DEPTH, STAGE_DEPTH));
    update_input_shape(&window, &mode, height, along, scale, &edge, size);
    Ok(())
}

/// Pega el notch a un borde. Lo llama el front al arrancar, para reponer lo que
/// hubiera guardado, y cada vez que un arrastre cruza a otro borde.
///
/// Tambien es quien muestra la ventana: nace oculta (`visible: false`) para que
/// no se vea un fotograma con el tamano y la posicion que le ponga el gestor de
/// ventanas antes de que aqui se coloque donde toca.
#[tauri::command]
fn place_notch(window: WebviewWindow, state: State<AppState>, edge: String) -> Result<(), String> {
    let edge = normalize_edge(&edge);
    apply_edge(&window, edge, "expanded", 0, 0.0);
    *state.edge.lock().map_err(|e| e.to_string())? = edge.to_string();
    let _ = window.show();
    Ok(())
}

/// Un paso de arrastre: a que borde apunta el puntero y donde cae sobre el eje
/// largo del notch. Solo lee, no mueve nada; el front suaviza el recorrido y
/// llama a `place_notch` cuando el borde cambia de verdad.
#[tauri::command]
fn drag_probe(window: WebviewWindow, edge: String) -> Result<DragTarget, String> {
    let cursor = window.cursor_position().map_err(|e| e.to_string())?;
    let mon = window
        .monitor_from_point(cursor.x, cursor.y)
        .ok()
        .flatten()
        .or_else(|| monitor_of(&window))
        .ok_or("sin monitor")?;

    let ms = mon.size();
    let mp = mon.position();
    let scale = mon.scale_factor();

    let left = cursor.x - mp.x as f64;
    let top = cursor.y - mp.y as f64;
    let right = ms.width as f64 - left;
    let bottom = ms.height as f64 - top;

    let mut next = "right";
    let mut best = right;
    for (name, dist) in [("left", left), ("top", top), ("bottom", bottom)] {
        if dist < best {
            best = dist;
            next = name;
        }
    }

    // Se cambia de borde solo si el nuevo gana por un margen claro.
    let current = normalize_edge(&edge);
    let dist_to = match current {
        "left" => left,
        "top" => top,
        "bottom" => bottom,
        _ => right,
    };
    if next != current && best + EDGE_HYSTERESIS * scale > dist_to {
        next = current;
    }

    // Girado 180 (izquierda) o 90 (abajo) el eje local corre al reves.
    let (mon_along, cursor_along) = if is_horizontal(next) {
        (ms.width as f64, left)
    } else {
        (ms.height as f64, top)
    };
    let along = if next == "left" || next == "bottom" {
        mon_along - cursor_along
    } else {
        cursor_along
    };

    Ok(DragTarget {
        edge: next.to_string(),
        offset: (along / mon_along).clamp(0.0, 1.0),
    })
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

/// Mostrar/ocultar desde la bandeja. Al volver a mostrar hay que reponer la
/// geometria: KWin trata el re-mapeo como una ventana nueva y la recoloca en
/// el centro de la pantalla.
fn toggle_notch(app: &tauri::AppHandle) {
    let Some(window) = app.get_webview_window("main") else { return };
    match window.is_visible() {
        Ok(true) => {
            let _ = window.hide();
        }
        Ok(false) => {
            let state = app.state::<AppState>();
            let edge = state.edge.lock().map(|g| g.clone()).unwrap_or_else(|_| "right".into());
            let shape = state.shape.lock().map(|g| g.clone()).unwrap_or_default();
            // Dos veces a proposito: antes para que no se vea un fotograma con
            // el tamano que le ponga el gestor de ventanas, y despues porque
            // KWin trata el re-mapeo como una ventana nueva y la recoloca en el
            // centro de la pantalla ignorando lo de antes.
            setup_initial_geometry(&window, &edge, &shape);
            let _ = window.show();
            setup_initial_geometry(&window, &edge, &shape);
        }
        Err(_) => {}
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let scanner = AgentScanner::new();
    let state = AppState {
        scanner: Mutex::new(scanner),
        edge: Mutex::new("right".into()),
        shape: Mutex::new(Shape::default()),
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(state)
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                // Sin `show`: la ventana nace oculta y la destapa el primer
                // `place_notch` del front, ya con el borde guardado puesto.
                let win = window.clone();
                setup_initial_geometry(&win, "right", &Shape::default());
            }

            // Crear menú para el icono en la bandeja del sistema (System Tray)
            let toggle_item = MenuItem::with_id(app, "toggle", "Mostrar / Ocultar Notch", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Salir de Agent Notch", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&toggle_item, &quit_item])?;

            let mut tray_builder = TrayIconBuilder::new()
                .menu(&menu)
                .tooltip("Agent Notch - Monitor de Agentes")
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => {
                        app.exit(0);
                    }
                    "toggle" => {
                        toggle_notch(app);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        toggle_notch(app);
                    }
                });

            let icon_bytes = include_bytes!("../icons/128x128.png");
            if let Ok(tray_icon) = tauri::image::Image::from_bytes(icon_bytes) {
                tray_builder = tray_builder.icon(tray_icon.clone());
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.set_icon(tray_icon);
                }
            } else if let Some(icon) = app.default_window_icon() {
                tray_builder = tray_builder.icon(icon.clone());
            }

            let _tray = tray_builder.build(app)?;

            // Cuota real de Claude en segundo plano: el escaneo nunca espera a la red.
            quota::spawn_poller();
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            scan_agents,
            set_notch_mode,
            place_notch,
            drag_probe,
            open_in_terminal,
            open_in_file_manager,
            exit_app
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
