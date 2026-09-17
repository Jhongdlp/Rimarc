//! Atajo global para abrir el portapapeles.
//!
//! En KDE Wayland la app corre bajo XWayland y un grab de X11 no recibe teclas
//! con otra ventana enfocada, asi que el atajo lo tiene KGlobalAccel: un
//! `.desktop` oculto con `X-KDE-Shortcuts` crea su componente y el atajo lanza
//! `rimarc --clipboard`, que avisa a la instancia viva por un socket unix. Es
//! lo mismo que hace Ajustes del sistema con "Añadir orden".
//!
//! Las teclas viajan como el entero de `QKeySequence` (modificadores | tecla),
//! que es lo que piden `setForeignShortcutKeys` y `action`; el texto
//! (`Meta+Shift+V`) solo es para el `.desktop` y para pintarlo.

use serde::Serialize;
use std::io::Read;
use std::os::unix::net::{UnixListener, UnixStream};
use std::path::PathBuf;
use std::process::Command;

const DESKTOP: &str = "rimarc-clipboard.desktop";
const ACTION: &str = "_launch";

fn action_id() -> String {
    format!("['{DESKTOP}','{ACTION}','Rimarc','Abrir portapapeles']")
}

fn desktop_path() -> Option<PathBuf> {
    dirs::data_dir().map(|d| d.join("applications").join(DESKTOP))
}

pub fn socket_path() -> PathBuf {
    dirs::runtime_dir().unwrap_or_else(std::env::temp_dir).join("rimarc.sock")
}

fn gdbus(method: &str, args: &[&str]) -> Option<String> {
    let out = Command::new("gdbus")
        .args(["call", "--session", "--dest", "org.kde.kglobalaccel", "--object-path", "/kglobalaccel", "--method"])
        .arg(format!("org.kde.KGlobalAccel.{method}"))
        .args(args)
        .output()
        .ok()?;
    out.status.success().then(|| String::from_utf8_lossy(&out.stdout).into_owned())
}

/// Enteros de una respuesta de gdbus: `([([251658297, 0, 0, 0],)],)` -> [251658297, 0, 0, 0].
fn ints(s: &str) -> Vec<i64> {
    s.split(|c: char| !c.is_ascii_digit()).filter_map(|n| n.parse().ok()).collect()
}

#[derive(Serialize)]
pub struct ShortcutState {
    /// Solo KDE Plasma: en otros escritorios la pestaña lo explica y no deja grabar.
    pub supported: bool,
    /// Entero de Qt del atajo activo, 0 = sin atajo.
    pub key: i64,
}

pub fn supported() -> bool {
    std::env::var("XDG_CURRENT_DESKTOP").is_ok_and(|d| d.contains("KDE")) && gdbus("allComponents", &[]).is_some()
}

pub fn get() -> ShortcutState {
    if !supported() {
        return ShortcutState { supported: false, key: 0 };
    }
    // Sin componente responde una lista vacia: todavia no hay atajo.
    let key = gdbus("shortcutKeys", &[&action_id()]).map(|s| ints(&s).first().copied().unwrap_or(0)).unwrap_or(0);
    ShortcutState { supported: true, key }
}

/// Quien usa ya esa combinacion (nombre legible de la accion), si no somos nosotros.
pub fn owner(key: i64) -> Option<String> {
    let out = gdbus("action", &[&key.to_string()])?;
    // `(['plasmashell', 'show-on-mouse-pos', 'plasmashell', 'Mostrar …'],)`
    let parts: Vec<&str> = out.split('\'').skip(1).step_by(2).collect();
    match parts.as_slice() {
        [component, ..] if *component == DESKTOP => None,
        [_, _, friendly_component, friendly_action] => Some(format!("{friendly_action} ({friendly_component})")),
        _ => None,
    }
}

/// Asigna el atajo (`key` 0 lo quita). `steal` se lo quita antes a quien lo tenga.
pub fn set(key: i64, label: &str, exec: &str, steal: bool) -> Result<(), String> {
    if !supported() {
        return Err("Solo disponible en KDE Plasma".into());
    }
    let path = desktop_path().ok_or("sin carpeta de aplicaciones")?;

    if key == 0 {
        let _ = gdbus("setForeignShortcutKeys", &[&action_id(), "[]"]);
        let _ = gdbus("unregister", &[DESKTOP, ACTION]);
        let _ = std::fs::remove_file(&path);
        let _ = Command::new("kbuildsycoca6").output();
        return Ok(());
    }

    if steal {
        if let Some(out) = gdbus("action", &[&key.to_string()]) {
            let parts: Vec<&str> = out.split('\'').skip(1).step_by(2).collect();
            if parts.len() == 4 && parts[0] != DESKTOP {
                let other = format!("['{}','{}','{}','{}']", parts[0], parts[1], parts[2], parts[3]);
                let _ = gdbus("setForeignShortcutKeys", &[&other, "[]"]);
            }
        }
    }

    let _ = std::fs::create_dir_all(path.parent().unwrap());
    std::fs::write(
        &path,
        format!(
            "[Desktop Entry]\nType=Application\nName=Abrir portapapeles de Rimarc\nExec=\"{exec}\" --clipboard\n\
             Icon=edit-paste\nNoDisplay=true\nX-KDE-Shortcuts={label}\n"
        ),
    )
    .map_err(|e| e.to_string())?;
    // KGlobalAccel crea el componente cuando se entera del `.desktop` nuevo, y
    // eso va tras reconstruir la cache de servicios y con su propio retraso.
    let _ = Command::new("kbuildsycoca6").output();
    let keys = format!("[([{key}, 0, 0, 0],)]");
    for _ in 0..20 {
        // `shortcutKeys` responde vacio aunque el componente no exista; `getComponent` falla.
        if gdbus("getComponent", &[DESKTOP]).is_some() {
            // Si ya habia un atajo guardado en kglobalshortcutsrc, manda ese sobre
            // `X-KDE-Shortcuts`: se fija explicitamente.
            gdbus("setForeignShortcutKeys", &[&action_id(), &keys]);
            return match get().key == key {
                true => Ok(()),
                false => Err("KDE no aceptó la combinación: puede que ya esté en uso".into()),
            };
        }
        std::thread::sleep(std::time::Duration::from_millis(150));
    }
    Err("KDE no registró el atajo".into())
}

/// Mientras se graba una combinacion en ajustes, KDE no debe ejecutar las suyas:
/// si no, `Meta+V` abriria Klipper y la webview nunca veria la tecla.
pub fn block_global(block: bool) {
    let _ = gdbus("blockGlobalShortcuts", &[if block { "true" } else { "false" }]);
}

/// Lado del `rimarc --clipboard` que lanza el atajo: avisa a la instancia viva.
/// `false` si no hay ninguna escuchando.
pub fn notify_running() -> bool {
    UnixStream::connect(socket_path()).is_ok()
}

/// Lado de la app: cada conexion al socket es una pulsacion del atajo.
pub fn listen(on_press: impl Fn() + Send + 'static) {
    let path = socket_path();
    let _ = std::fs::remove_file(&path);
    let Ok(listener) = UnixListener::bind(&path) else { return };
    std::thread::spawn(move || {
        for mut conn in listener.incoming().flatten() {
            // Nada que leer: basta con la conexion. Se vacia para no dejar al otro lado colgado.
            let _ = conn.read(&mut [0; 16]);
            on_press();
        }
    });
}
