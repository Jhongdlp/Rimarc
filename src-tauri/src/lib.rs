mod models;
mod parser;
mod quota;
mod scanner;
mod clipboard;
mod clipboard_tray;
#[cfg(target_os = "linux")]
pub mod shortcut;
#[cfg(target_os = "linux")]
pub mod mcp;

use std::sync::Mutex;
use tauri_plugin_updater::UpdaterExt;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Emitter, Manager, PhysicalPosition, PhysicalSize, State, WebviewWindow};
use models::{SystemAgentSummary, SystemMetrics};
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
const STAGE_DEPTH: f64 = 560.0;

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

#[tauri::command]
fn get_system_stats(state: State<AppState>) -> Result<SystemMetrics, String> {
    let mut scanner = state.scanner.lock().map_err(|e| e.to_string())?;
    Ok(scanner.get_system_stats())
}

/// Configure Linux GTK window properties for an always-on-top dock.
fn configure_linux_window(window: &WebviewWindow) {
    if window.label() != "main" && window.label() != "clipboard" {
        return;
    }
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
            gtk_win.set_role(if window.label() == "clipboard" { "rimarc-clipboard" } else { "agent-notch" });
        }
    }
}

/// Coloca un rectangulo dado en coordenadas locales de la columna — `depth` es
/// lo que dista del borde de pantalla (de, hasta) y `along` donde cae sobre el
/// eje largo — dentro de la ventana. Mismo giro por borde que `columnTransform`
/// en el front: girado 180 (izquierda) o 90 (abajo) el notch corre hacia atras
/// sobre su eje, de ahi los origenes en el extremo opuesto.
fn edge_rect(
    edge: &str,
    (sw, sh): (f64, f64),
    (d0, d1): (f64, f64),
    along: f64,
    run: f64,
) -> (f64, f64, f64, f64) {
    let a = along.max(0.0);
    let t = d1 - d0;
    match edge {
        "left" => (d0, sh - a - run, t, run),
        "top" => (a, d0, run, t),
        "bottom" => (sw - a - run, sh - d1, run, t),
        _ => (sw - d1, a, t, run),
    }
}

/// Update X11/Wayland input mask so only the active UI area catches clicks,
/// and all transparent area passes clicks through to the desktop.
///
/// La region se calcula en coordenadas locales de la columna y la coloca
/// `edge_rect`.
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
                    // El fondo es fijo (40) porque el recogido puede ser una
                    // astilla de 13 px y hay que poder senalarla; el largo si
                    // sigue a la silueta, o dormido quedaria franja muerta.
                    (40.0, f64::from(height).max(24.0))
                } else {
                    // Pegado a la silueta (NOTCH.depth = 60; el front ya suma
                    // medio engranaje al alto). Holgura de sobra aqui se come
                    // los clics de botones del escritorio junto al notch.
                    (60.0, f64::from(height) + 8.0)
                };
                edge_rect(edge, (sw, sh), (0.0, depth), along, run)
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
    let notch_win = if window.label() == "main" {
        window
    } else if let Some(w) = window.app_handle().get_webview_window("main") {
        w
    } else {
        window
    };
    let edge = state.edge.lock().map_err(|e| e.to_string())?.clone();
    *state.shape.lock().map_err(|e| e.to_string())? = Shape {
        mode: mode.clone(),
        height,
        along,
    };
    let scale = monitor_of(&notch_win).map(|m| m.scale_factor()).unwrap_or(1.0);
    let size = notch_win
        .inner_size()
        .map(|s| (s.width as f64 / scale, s.height as f64 / scale))
        .unwrap_or((STAGE_DEPTH, STAGE_DEPTH));
    update_input_shape(&notch_win, &mode, height, along, scale, &edge, size);
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
    let notch_win = if window.label() == "main" {
        window
    } else if let Some(w) = window.app_handle().get_webview_window("main") {
        w
    } else {
        window
    };
    let edge = normalize_edge(&edge);
    apply_edge(&notch_win, edge, "expanded", 0, 0.0);
    *state.edge.lock().map_err(|e| e.to_string())? = edge.to_string();
    let _ = notch_win.show();
    let _ = notch_win.app_handle().emit("notch_visibility_changed", true);
    Ok(())
}

/// Un paso de arrastre: a que borde apunta el puntero y donde cae sobre el eje
/// largo del notch. Solo lee, no mueve nada; el front suaviza el recorrido y
/// llama a `place_notch` cuando el borde cambia de verdad.
#[tauri::command]
fn drag_probe(window: WebviewWindow, edge: String) -> Result<DragTarget, String> {
    let notch_win = if window.label() == "main" {
        window
    } else if let Some(w) = window.app_handle().get_webview_window("main") {
        w
    } else {
        window
    };
    let cursor = notch_win.cursor_position().map_err(|e| e.to_string())?;
    let mon = notch_win
        .monitor_from_point(cursor.x, cursor.y)
        .ok()
        .flatten()
        .or_else(|| monitor_of(&notch_win))
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

#[tauri::command]
fn toggle_notch_state(app: tauri::AppHandle) -> Result<bool, String> {
    toggle_notch(&app);
    let visible = app.get_webview_window("main").and_then(|w| w.is_visible().ok()).unwrap_or(false);
    Ok(visible)
}

#[tauri::command]
fn get_notch_visibility(app: tauri::AppHandle) -> Result<bool, String> {
    let visible = app.get_webview_window("main").and_then(|w| w.is_visible().ok()).unwrap_or(false);
    Ok(visible)
}

#[tauri::command]
fn open_store_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("store") {
        let _ = window.show();
        let _ = window.set_focus();
    }
    Ok(())
}

#[tauri::command]
fn minimize_store_window(window: WebviewWindow, app: tauri::AppHandle) -> Result<(), String> {
    let _ = window.minimize();
    if let Some(w) = app.get_webview_window("store") {
        let _ = w.minimize();
    }
    Ok(())
}

#[tauri::command]
fn close_store_window(window: WebviewWindow, app: tauri::AppHandle) -> Result<(), String> {
    let _ = window.hide();
    if let Some(w) = app.get_webview_window("store") {
        let _ = w.hide();
    }
    Ok(())
}

#[tauri::command]
fn get_clipboard_history(limit: Option<usize>) -> Result<Vec<clipboard::ClipboardItem>, String> {
    Ok(clipboard::get_clipboard_history(limit))
}

#[tauri::command]
fn set_clipboard_content(text: String) -> Result<(), String> {
    clipboard::set_clipboard_content(&text)
}

#[tauri::command]
fn set_clipboard_image(app: tauri::AppHandle, path: String) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        // GTK solo se toca desde el hilo principal.
        let (tx, rx) = std::sync::mpsc::channel();
        app.run_on_main_thread(move || {
            let _ = tx.send(clipboard::set_clipboard_image(&path));
        })
        .map_err(|e| e.to_string())?;
        rx.recv().map_err(|e| e.to_string())?
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = (app, path);
        Err("solo disponible en Linux".into())
    }
}

#[tauri::command]
fn delete_clipboard_item(id: String) -> Result<(), String> {
    clipboard::delete_clipboard_item(&id)
}

/// Mientras se arrastra un clip fuera de la ventana, perder el foco no la
/// oculta: ocultar el origen a mitad de arrastre cancela el soltar.
static CLIPBOARD_DRAGGING: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

/// Arrastre nativo de GTK para las filas del portapapeles. El drag & drop de
/// HTML no sirve: WebKitGTK no deja salir un `file://` puesto por la pagina, el
/// texto que ofrece lo rechazan destinos como Warp (el cursor con la X), y de
/// icono pinta la fila entera con sus botones.
#[tauri::command]
fn start_clipboard_drag(app: tauri::AppHandle, path: Option<String>, text: Option<String>) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        let window = app.get_webview_window("clipboard").ok_or("sin ventana")?;
        let handle = app.clone();
        if let Some(text) = text {
            CLIPBOARD_DRAGGING.store(true, std::sync::atomic::Ordering::Relaxed);
            return app
                .run_on_main_thread(move || {
                    if let Ok(gtk_win) = window.gtk_window() {
                        start_text_drag(&gtk_win, text, handle);
                    }
                })
                .map_err(|e| e.to_string());
        }
        let path = clipboard::checked_png(path.as_deref().ok_or("sin ruta ni texto")?)?.to_path_buf();
        CLIPBOARD_DRAGGING.store(true, std::sync::atomic::Ordering::Relaxed);
        app.run_on_main_thread(move || {
            let Ok(gtk_win) = window.gtk_window() else { return };
            let icon = drag::Image::Raw(clipboard::drag_icon(&path));
            let result = drag::start_drag(
                &gtk_win,
                drag::DragItem::Files(vec![path]),
                icon,
                move |result, _| {
                    CLIPBOARD_DRAGGING.store(false, std::sync::atomic::Ordering::Relaxed);
                    // Soltada en otra app: ya esta pegada, la ventana sobra.
                    if let (drag::DragResult::Dropped, Some(w)) =
                        (result, handle.get_webview_window("clipboard"))
                    {
                        let _ = w.hide();
                    }
                },
                drag::Options::default(),
            );
            if let Err(e) = result {
                CLIPBOARD_DRAGGING.store(false, std::sync::atomic::Ordering::Relaxed);
                eprintln!("[Clipboard] no se pudo arrastrar: {e}");
            }
        })
        .map_err(|e| e.to_string())
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = (app, path, text);
        Err("solo disponible en Linux".into())
    }
}

/// Lo que `drag::start_drag` hace con ficheros, pero con texto: `drag-rs` no
/// lo soporta en GTK. Ofrece todos los destinos de texto (UTF8_STRING,
/// text/plain...) para que cada app coja el que entienda.
#[cfg(target_os = "linux")]
fn start_text_drag(win: &gtk::ApplicationWindow, text: String, handle: tauri::AppHandle) {
    use std::cell::{Cell, RefCell};
    use std::rc::Rc;
    let done = move |dropped: bool| {
        CLIPBOARD_DRAGGING.store(false, std::sync::atomic::Ordering::Relaxed);
        // Soltado en otra app: ya esta pegado, la ventana sobra.
        if let (true, Some(w)) = (dropped, handle.get_webview_window("clipboard")) {
            let _ = w.hide();
        }
    };

    win.drag_source_set(gdk::ModifierType::BUTTON1_MASK, &[], gdk::DragAction::COPY);
    win.drag_source_add_text_targets();
    let Some(targets) = win.drag_source_get_target_list() else { return done(false) };

    let ids = Rc::new(RefCell::new(Vec::new()));
    let failed = Rc::new(Cell::new(false));
    ids.borrow_mut().push(win.connect_drag_data_get(move |_, _, data, _, _| {
        data.set_text(&text);
    }));
    let f = failed.clone();
    ids.borrow_mut().push(win.connect_drag_failed(move |_, _, _| {
        f.set(true);
        gtk::glib::Propagation::Proceed
    }));
    let own = ids.clone();
    let done_end = done.clone();
    ids.borrow_mut().push(win.connect_drag_end(move |w, _| {
        for id in own.borrow_mut().drain(..) {
            w.disconnect(id);
        }
        done_end(!failed.get());
    }));

    let started = win.drag_begin_with_coordinates(
        &targets,
        gdk::DragAction::COPY,
        gdk::ffi::GDK_BUTTON1_MASK as i32,
        None,
        -1,
        -1,
    );
    match started {
        Some(ctx) => ctx.drag_set_icon_name("text-x-generic", 0, 0),
        None => {
            for id in ids.borrow_mut().drain(..) {
                win.disconnect(id);
            }
            done(false);
        }
    }
}

/// "Abrir" de una fila del portapapeles: un enlace en el navegador, una imagen
/// o una ruta en su aplicacion. El texto viene del historial, que puede traer
/// cualquier cosa: solo pasan http(s) y rutas que existen, nunca otros esquemas.
#[tauri::command]
fn open_clipboard_item(text: String) -> Result<(), String> {
    let t = text.trim();
    let target = if t.starts_with("http://") || t.starts_with("https://") {
        t.to_string()
    } else {
        let path = t.strip_prefix("file://").unwrap_or(t);
        let path = match path.strip_prefix("~/") {
            Some(rest) => dirs::home_dir().ok_or("sin home")?.join(rest),
            None => std::path::PathBuf::from(path),
        };
        if !path.is_absolute() || !path.exists() {
            return Err("no es un enlace ni una ruta que exista".into());
        }
        path.to_string_lossy().into_owned()
    };
    std::process::Command::new("xdg-open")
        .arg(target)
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn clear_clipboard_history() -> Result<(), String> {
    clipboard::clear_clipboard_history()
}

fn setup_clipboard_geometry(window: &WebviewWindow, target_x: Option<f64>) {
    configure_linux_window(window);
    let monitor = monitor_of(window);
    let (monitor_size, monitor_pos, scale) = match monitor {
        Some(ref mon) => (*mon.size(), *mon.position(), mon.scale_factor()),
        None => (
            tauri::PhysicalSize { width: 1920, height: 1080 },
            tauri::PhysicalPosition { x: 0, y: 0 },
            1.0,
        ),
    };

    let w = (460.0 * scale).round() as i32;
    let h = (620.0 * scale).round() as i32;

    // Alinear horizontalmente con el icono de la bandeja si se conoce su posición
    let default_center_x = monitor_pos.x + monitor_size.width as i32 - (150.0 * scale).round() as i32;
    let center_x = target_x.map(|tx| tx.round() as i32).unwrap_or(default_center_x);

    let min_x = monitor_pos.x + 12;
    let max_x = monitor_pos.x + monitor_size.width as i32 - w - 12;
    let x = (center_x - w / 2).clamp(min_x, max_x);

    // Borde inferior: ubicado justo por encima del panel de tareas (~48px en KDE)
    let y = monitor_pos.y + monitor_size.height as i32 - h - (46.0 * scale).round() as i32;

    let _ = window.set_size(tauri::Size::Physical(tauri::PhysicalSize { width: w as u32, height: h as u32 }));
    #[cfg(target_os = "linux")]
    {
        if let Ok(gtk_win) = window.gtk_window() {
            gtk_win.set_size_request(460, 620);
        }
    }
    let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition { x, y }));
    let _ = window.set_always_on_top(true);
}

#[tauri::command]
fn toggle_clipboard_window(app: tauri::AppHandle, target_x: Option<f64>) -> Result<bool, String> {
    let Some(window) = app.get_webview_window("clipboard") else { return Ok(false) };
    let is_vis = window.is_visible().unwrap_or(false);
    if is_vis {
        let _ = window.hide();
        Ok(false)
    } else {
        setup_clipboard_geometry(&window, target_x);
        let _ = window.show();
        let _ = window.set_focus();
        let _ = window.emit("clipboard_window_opened", ());
        Ok(true)
    }
}

/// Comando con el que un cliente MCP arranca el servidor del portapapeles. Es la
/// ruta real de este binario: en una AppImage `current_exe` apunta al montaje
/// temporal, que cambia en cada arranque, y la ruta estable es `$APPIMAGE`.
/// Si el binario esta en el `PATH` (instalado con paquete) basta con su nombre,
/// y el comando copiado vale para cualquier usuario, no solo para este `$HOME`.
#[tauri::command]
fn mcp_command() -> String {
    if let Ok(p) = std::env::var("APPIMAGE") {
        return p;
    }
    let Ok(exe) = std::env::current_exe().and_then(std::fs::canonicalize) else {
        return "rimarc".into();
    };
    let name = exe.file_name().unwrap_or_default();
    let on_path = std::env::var_os("PATH").is_some_and(|path| {
        std::env::split_paths(&path)
            .any(|dir| std::fs::canonicalize(dir.join(name)).is_ok_and(|p| p == exe))
    });
    if on_path {
        name.to_string_lossy().into_owned()
    } else {
        exe.to_string_lossy().into_owned()
    }
}

#[cfg(target_os = "linux")]
#[tauri::command]
async fn global_shortcut() -> shortcut::ShortcutState {
    shortcut::get()
}

#[cfg(target_os = "linux")]
#[tauri::command]
async fn global_shortcut_owner(key: i64) -> Option<String> {
    shortcut::owner(key)
}

#[cfg(target_os = "linux")]
#[tauri::command]
async fn set_global_shortcut(key: i64, label: String, steal: bool) -> Result<(), String> {
    shortcut::set(key, &label, &mcp_command(), steal)
}

#[cfg(target_os = "linux")]
#[tauri::command]
async fn block_global_shortcuts(block: bool) {
    shortcut::block_global(block)
}

/// Ajustes del portapapeles: una ventana aparte, centrada, que sustituye a la
/// carta (la carta se cierra sola al perder el foco, un modal dentro no duraria).
#[tauri::command]
fn open_clipboard_settings(app: tauri::AppHandle) -> Result<(), String> {
    let window = app.get_webview_window("clipboard-settings").ok_or("sin ventana")?;
    if let Some(w) = app.get_webview_window("clipboard") {
        let _ = w.hide();
    }
    // Colocarla desde Tauri no vale: KWin la recoloca al mapearla (bajo el
    // puntero, que esta en la bandeja) y salia abajo a la derecha y cortada.
    // `CenterAlways` es GTK el que la centra, y lo repite si el WM la mueve.
    #[cfg(target_os = "linux")]
    {
        let win = window.clone();
        let _ = app.run_on_main_thread(move || {
            if let Ok(gtk_win) = win.gtk_window() {
                gtk_win.set_position(gtk::WindowPosition::CenterAlways);
            }
            let _ = win.show();
            let _ = win.set_focus();
            // Ya centrada al mapearse: soltar `CenterAlways` o la devuelve al
            // centro cada vez que se arrastra.
            if let Ok(gtk_win) = win.gtk_window() {
                gtk_win.set_position(gtk::WindowPosition::None);
            }
        });
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = window.center();
        let _ = window.show();
        let _ = window.set_focus();
    }
    Ok(())
}

/// `(es, en)` de cada entrada del menu de la bandeja, en el orden de `TrayItems`.
const TRAY_TEXT: [(&str, &str); 3] = [
    ("Abrir Tienda de Componentes", "Open Component Store"),
    ("Mostrar / Ocultar Notch", "Show / Hide Notch"),
    ("Salir de Rimarc", "Quit Rimarc"),
];
const TRAY_TOOLTIP: (&str, &str) = ("Rimarc - Tienda de Componentes e Isla Dinámica", "Rimarc - Component Store and Dynamic Island");

struct TrayItems([MenuItem<tauri::Wry>; 3]);

/// El idioma lo elige el front (ajustes de la tienda); los menus nativos lo siguen.
#[tauri::command]
fn set_tray_lang(app: tauri::AppHandle, lang: String) {
    let en = lang == "en";
    clipboard_tray::set_english(en);
    if let Some(items) = app.try_state::<TrayItems>() {
        for (item, (es, en_text)) in items.0.iter().zip(TRAY_TEXT) {
            let _ = item.set_text(if en { en_text } else { es });
        }
    }
    if let Some(tray) = app.tray_by_id("main") {
        let _ = tray.set_tooltip(Some(if en { TRAY_TOOLTIP.1 } else { TRAY_TOOLTIP.0 }));
    }
}

#[tauri::command]
fn close_clipboard_settings(app: tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("clipboard-settings") {
        let _ = w.hide();
    }
}

#[tauri::command]
fn get_clipboard_enabled() -> bool {
    clipboard_tray::is_enabled()
}

#[tauri::command]
fn set_clipboard_enabled(app: tauri::AppHandle, enabled: bool) -> Result<bool, String> {
    clipboard_tray::set_enabled(&app, enabled)?;
    if !enabled {
        let _ = close_clipboard_window(app);
    }
    Ok(enabled)
}

#[tauri::command]
fn close_clipboard_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("clipboard") {
        let _ = window.hide();
    }
    Ok(())
}

/// Mostrar/ocultar desde la bandeja. Al volver a mostrar hay que reponer la
/// geometria: KWin trata el re-mapeo como una ventana nueva y la recoloca en
/// el centro de la pantalla.
fn toggle_notch(app: &tauri::AppHandle) {
    let Some(window) = app.get_webview_window("main") else { return };
    let new_vis = match window.is_visible() {
        Ok(true) => {
            let _ = window.hide();
            false
        }
        Ok(false) => {
            let state = app.state::<AppState>();
            let edge = state.edge.lock().map(|g| g.clone()).unwrap_or_else(|_| "right".into());
            let shape = state.shape.lock().map(|g| g.clone()).unwrap_or_default();
            setup_initial_geometry(&window, &edge, &shape);
            let _ = window.show();
            setup_initial_geometry(&window, &edge, &shape);
            true
        }
        Err(_) => false,
    };
    let _ = app.emit("notch_visibility_changed", new_vis);
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
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(state)
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "store" || window.label() == "clipboard-settings" {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                // Sin `show`: la ventana nace oculta y la destapa el primer
                // `place_notch` del front, ya con el borde guardado puesto.
                let win = window.clone();
                setup_initial_geometry(&win, "right", &Shape::default());
            }

            if let Some(window) = app.get_webview_window("clipboard") {
                let win = window.clone();
                setup_clipboard_geometry(&win, None);
            }

            // Crear menú para el icono en la bandeja del sistema (System Tray de Rimarc)
            // Textos en español: el front los traduce con `set_tray_lang` al cargar.
            let store_item = MenuItem::with_id(app, "open_store", TRAY_TEXT[0].0, true, None::<&str>)?;
            let toggle_item = MenuItem::with_id(app, "toggle", TRAY_TEXT[1].0, true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", TRAY_TEXT[2].0, true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&store_item, &toggle_item, &quit_item])?;
            app.manage(TrayItems([store_item, toggle_item, quit_item]));

            let mut tray_builder = TrayIconBuilder::with_id("main")
                .menu(&menu)
                .tooltip(TRAY_TOOLTIP.0)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open_store" => {
                        if let Some(w) = app.get_webview_window("store") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
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
                        if let Some(w) = app.get_webview_window("store") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        } else {
                            toggle_notch(app);
                        }
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

            // Icono nativo en segundo plano (StatusNotifierItem) en KDE Plasma al estilo CopyQ:
            // Clic izquierdo abre directamente la ventana flotante sin desplegar menús de texto intermedios.
            // Clic derecho muestra el menú contextual con opciones.
            clipboard_tray::setup_clipboard_tray(app.handle());

            // El atajo global llega por un socket (ver `shortcut.rs`).
            #[cfg(target_os = "linux")]
            {
                let handle = app.handle().clone();
                shortcut::listen(move || {
                    let app = handle.clone();
                    let _ = handle.run_on_main_thread(move || {
                        if clipboard_tray::is_enabled() {
                            let _ = toggle_clipboard_window(app, None);
                        }
                    });
                });
            }

            // Cuota real de Claude en segundo plano: el escaneo nunca espera a la red.
            quota::spawn_poller();

            // Actualizacion silenciosa al arrancar. Solo aplica a los bundles que
            // el updater sabe reemplazar (NSIS/MSI, AppImage, .app); en .deb, .rpm
            // y pacman `check()` falla y se queda en el log, que es lo correcto:
            // ahi manda el gestor de paquetes.
            let updater_app = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let updater = match updater_app.updater() {
                    Ok(u) => u,
                    Err(e) => return eprintln!("[updater] no disponible: {e}"),
                };
                match updater.check().await {
                    Ok(Some(update)) => {
                        println!("[updater] instalando {}", update.version);
                        match update.download_and_install(|_, _| {}, || {}).await {
                            Ok(()) => updater_app.restart(),
                            Err(e) => eprintln!("[updater] fallo al instalar: {e}"),
                        }
                    }
                    Ok(None) => {}
                    Err(e) => eprintln!("[updater] no se pudo comprobar: {e}"),
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            scan_agents,
            get_system_stats,
            set_notch_mode,
            place_notch,
            drag_probe,
            open_in_terminal,
            open_in_file_manager,
            exit_app,
            toggle_notch_state,
            get_notch_visibility,
            open_store_window,
            minimize_store_window,
            close_store_window,
            get_clipboard_history,
            mcp_command,
            #[cfg(target_os = "linux")]
            global_shortcut,
            #[cfg(target_os = "linux")]
            global_shortcut_owner,
            #[cfg(target_os = "linux")]
            set_global_shortcut,
            #[cfg(target_os = "linux")]
            block_global_shortcuts,
            open_clipboard_item,
            open_clipboard_settings,
            close_clipboard_settings,
            set_tray_lang,
            set_clipboard_content,
            set_clipboard_image,
            delete_clipboard_item,
            start_clipboard_drag,
            clear_clipboard_history,
            toggle_clipboard_window,
            close_clipboard_window,
            get_clipboard_enabled,
            set_clipboard_enabled
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    /// La region de input tiene que caer dentro de la ventana en los cuatro
    /// bordes; fuera, el notch deja de recibir clicks.
    #[test]
    fn input_rect_stays_in_window() {
        let stage = (420.0, 768.0);
        for edge in ["right", "left", "top", "bottom"] {
            let (x, y, w, h) = edge_rect(edge, stage, (0.0, 80.0), 200.0, 140.0);
            assert!(x >= 0.0 && y >= 0.0, "{edge}: {x},{y}");
            assert!(x + w <= stage.0 && y + h <= stage.1, "{edge}: {x}+{w},{y}+{h}");
        }
    }
}
