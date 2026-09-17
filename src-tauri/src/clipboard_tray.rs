use tauri::AppHandle;

#[cfg(target_os = "linux")]
use ksni::blocking::TrayMethods;

#[cfg(target_os = "linux")]
struct ClipboardKdeTray {
    app: AppHandle,
}

#[cfg(target_os = "linux")]
impl ksni::Tray for ClipboardKdeTray {
    // Crucial: al ser false, KDE Plasma NO muestra el menú contextual en clic izquierdo.
    // En su lugar, llama directamente a `activate(x, y)`.
    const MENU_ON_ACTIVATE: bool = false;

    fn id(&self) -> String {
        "rimarc-clipboard".into()
    }

    fn title(&self) -> String {
        "Portapapeles Rimarc".into()
    }

    fn icon_name(&self) -> String {
        // En KDE Plasma (tema Breeze), "klipper" o "edit-paste" es el icono nativo
        "klipper".into()
    }

    fn icon_pixmap(&self) -> Vec<ksni::Icon> {
        let Ok(img) = image::load_from_memory_with_format(
            include_bytes!("../icons/clipboard.png"),
            image::ImageFormat::Png,
        ) else {
            return Vec::new();
        };
        let width = img.width();
        let height = img.height();
        let mut data = img.into_rgba8().into_vec();
        // El protocolo StatusNotifierItem espera píxeles en formato ARGB (32-bit big endian)
        for pixel in data.chunks_exact_mut(4) {
            pixel.rotate_right(1); // RGBA -> ARGB
        }
        vec![ksni::Icon {
            width: width as i32,
            height: height as i32,
            data,
        }]
    }

    // Se invoca cuando el usuario hace clic izquierdo sobre el icono en la barra de tareas de KDE Plasma
    fn activate(&mut self, x: i32, _y: i32) {
        let app = self.app.clone();
        let target_x = if x > 0 { Some(x as f64) } else { None };
        let _ = crate::toggle_clipboard_window(app, target_x);
    }

    // Menú contextual nativo de KDE que se abre con clic derecho
    fn menu(&self) -> Vec<ksni::MenuItem<Self>> {
        use ksni::menu::*;
        let app_open = self.app.clone();
        vec![
            StandardItem {
                label: "Abrir Portapapeles".into(),
                activate: Box::new(move |_| {
                    let _ = crate::toggle_clipboard_window(app_open.clone(), None);
                }),
                ..Default::default()
            }
            .into(),
            MenuItem::Separator,
            StandardItem {
                label: "Vaciar Historial".into(),
                activate: Box::new(|_| {
                    let _ = crate::clipboard::clear_clipboard_history();
                }),
                ..Default::default()
            }
            .into(),
        ]
    }
}

#[cfg(target_os = "linux")]
static HANDLE: std::sync::Mutex<Option<ksni::blocking::Handle<ClipboardKdeTray>>> =
    std::sync::Mutex::new(None);

/// Si existe, el usuario apago el portapapeles desde la tienda. Vive en disco y
/// no en `localStorage` porque el icono se registra antes de que cargue el front.
fn disabled_flag() -> Option<std::path::PathBuf> {
    dirs::config_dir().map(|d| d.join("rimarc").join("clipboard_disabled"))
}

pub fn is_enabled() -> bool {
    !disabled_flag().is_some_and(|p| p.exists())
}

pub fn set_enabled(app: &AppHandle, enabled: bool) -> Result<(), String> {
    if let Some(flag) = disabled_flag() {
        if enabled {
            let _ = std::fs::remove_file(&flag);
        } else {
            if let Some(dir) = flag.parent() {
                std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
            }
            std::fs::write(&flag, b"").map_err(|e| e.to_string())?;
        }
    }
    #[cfg(target_os = "linux")]
    {
        let mut handle = HANDLE.lock().map_err(|e| e.to_string())?;
        match (enabled, handle.take()) {
            (true, None) => *handle = spawn(app),
            (false, Some(h)) => h.shutdown().wait(),
            (_, h) => *handle = h,
        }
    }
    #[cfg(not(target_os = "linux"))]
    let _ = app;
    Ok(())
}

#[cfg(target_os = "linux")]
fn spawn(app: &AppHandle) -> Option<ksni::blocking::Handle<ClipboardKdeTray>> {
    ClipboardKdeTray { app: app.clone() }
        .spawn()
        .map_err(|e| eprintln!("[Clipboard] Error al registrar StatusNotifierItem en KDE: {e}"))
        .ok()
}

pub fn setup_clipboard_tray(app: &AppHandle) {
    #[cfg(target_os = "linux")]
    if is_enabled() {
        if let Ok(mut handle) = HANDLE.lock() {
            *handle = spawn(app);
        }
    }
    #[cfg(not(target_os = "linux"))]
    let _ = app;
}
