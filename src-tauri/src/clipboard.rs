use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClipboardItem {
    pub id: String,
    pub text: String,
    pub preview: String,
    pub kind: String, // "url" | "code" | "color" | "text" | "image"
    pub char_count: usize,
    pub line_count: usize,
    pub timestamp: i64,
    /// Miniatura `data:` de las imagenes; `text` lleva la ruta del PNG completo.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image: Option<String>,
}

static FALLBACK_CLIPBOARD: Mutex<Vec<ClipboardItem>> = Mutex::new(Vec::new());

fn now_secs() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn find_qdbus() -> Option<&'static str> {
    if std::path::Path::new("/usr/bin/qdbus6").exists() {
        Some("/usr/bin/qdbus6")
    } else if std::path::Path::new("/usr/bin/qdbus").exists() {
        Some("/usr/bin/qdbus")
    } else {
        None
    }
}

pub fn is_klipper_available() -> bool {
    let Some(bin) = find_qdbus() else { return false };
    Command::new(bin)
        .args(["org.kde.klipper", "/klipper", "org.kde.klipper.klipper.getClipboardContents"])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

fn hash_str(s: &str) -> u64 {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut hasher = DefaultHasher::new();
    s.hash(&mut hasher);
    hasher.finish()
}

fn classify_content(s: &str) -> String {
    let trimmed = s.trim();
    if trimmed.starts_with("http://")
        || trimmed.starts_with("https://")
        || trimmed.starts_with("file://")
        || trimmed.starts_with("ftp://")
    {
        return "url".into();
    }

    // Hex colors like #fff, #1a2b3c, #11223344
    if (trimmed.starts_with('#') && (trimmed.len() == 4 || trimmed.len() == 7 || trimmed.len() == 9))
        && trimmed[1..].chars().all(|c| c.is_ascii_hexdigit())
    {
        return "color".into();
    }

    if trimmed.starts_with("rgb(") || trimmed.starts_with("rgba(") || trimmed.starts_with("hsl(") {
        return "color".into();
    }

    // Code & shell keywords
    let code_indicators = [
        "const ", "let ", "var ", "function ", "def ", "class ", "import ", "export ",
        "return ", "from ", "async ", "await ", "select ", "insert ", "update ", "curl ",
        "git ", "npm ", "pnpm ", "cargo ", "docker ", "sudo ", "grep ", "pacman ", "yay ",
        "systemctl ", "export ", "#!/bin/", "=>", "==", "!=", "->",
    ];

    let lower = trimmed.to_lowercase();
    let has_keyword = code_indicators.iter().any(|k| lower.contains(k));
    let has_braces = (trimmed.contains('{') && trimmed.contains('}'))
        || (trimmed.contains('[') && trimmed.contains(']'));
    let is_multiline = trimmed.lines().count() > 1;

    if has_keyword || has_braces || (is_multiline && (trimmed.contains(" = ") || trimmed.contains(";\n"))) {
        return "code".into();
    }

    "text".into()
}

fn make_preview(s: &str, max_chars: usize) -> String {
    let clean: String = s.lines()
        .map(|l| l.trim())
        .filter(|l| !l.is_empty())
        .take(3)
        .collect::<Vec<&str>>()
        .join(" ↵ ");

    if clean.chars().count() > max_chars {
        let truncated: String = clean.chars().take(max_chars).collect();
        format!("{truncated}...")
    } else {
        clean
    }
}

/// Klipper (Plasma 6) guarda el historial en SQLite, con fechas reales y las
/// imagenes en `data/<uuid>/<data_uuid>`. Por D-Bus solo da texto y sin fechas,
/// asi que se lee de ahi; D-Bus queda para un Klipper sin base de datos.
fn klipper_dir() -> Option<PathBuf> {
    dirs::data_local_dir().map(|d| d.join("klipper"))
}

/// Los uuid de Klipper son sha1 en hex. Validarlos es lo que permite meterlos
/// en SQL y en rutas sin escapar nada.
fn is_uuid(s: &str) -> bool {
    s.len() == 40 && s.bytes().all(|b| b.is_ascii_hexdigit())
}

#[derive(Deserialize)]
struct KlipperRow {
    uuid: String,
    used: f64,
    text: Option<String>,
    png: Option<String>,
}

fn klipper_db_history(limit: usize) -> Option<Vec<ClipboardItem>> {
    let dir = klipper_dir()?;
    let db = dir.join("history3.sqlite");
    if !db.exists() {
        return None;
    }
    let sql = format!(
        "select m.uuid, coalesce(m.last_used_time, m.added_time) as used, m.text, \
         (select a.data_uuid from aux a where a.uuid = m.uuid and a.mimetype = 'image/png') as png \
         from main m order by used desc limit {limit}"
    );
    let out = Command::new("sqlite3")
        .args(["-readonly", "-json"])
        .arg(&db)
        .arg(sql)
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    // Sin filas, `-json` no imprime nada (ni siquiera `[]`).
    if out.stdout.iter().all(u8::is_ascii_whitespace) {
        return Some(Vec::new());
    }
    let rows: Vec<KlipperRow> = serde_json::from_slice(&out.stdout).ok()?;

    Some(
        rows.into_iter()
            .filter(|r| is_uuid(&r.uuid))
            .filter_map(|r| {
                let id = format!("klipper-{}", r.uuid);
                let timestamp = r.used as i64;
                if let Some(png) = r.png.filter(|p| is_uuid(p)) {
                    let src = dir.join("data").join(&r.uuid).join(png);
                    let (w, h, thumb) = thumbnail(&src)?;
                    let path = png_copy(&src, &r.uuid)?;
                    return Some(ClipboardItem {
                        id,
                        text: path.to_string_lossy().into_owned(),
                        preview: format!("{w} × {h}"),
                        kind: "image".into(),
                        char_count: 0,
                        line_count: 0,
                        timestamp,
                        image: Some(thumb),
                    });
                }
                let text = r.text?;
                let trimmed = text.trim();
                if trimmed.is_empty() {
                    return None;
                }
                Some(ClipboardItem {
                    id,
                    preview: make_preview(trimmed, 100),
                    kind: classify_content(trimmed),
                    char_count: trimmed.chars().count(),
                    line_count: trimmed.lines().count(),
                    text: text.trim_end_matches('\n').to_string(),
                    timestamp,
                    image: None,
                })
            })
            .collect(),
    )
}

/// Klipper guarda cada imagen con su hash por nombre, sin extension. Arrastrada
/// asi, los agentes (Claude Code y compania) no la reconocen como imagen: miran
/// la extension. Se expone una copia `<uuid>.png`, una sola vez por imagen.
fn png_dir() -> PathBuf {
    dirs::cache_dir()
        .unwrap_or_else(std::env::temp_dir)
        .join("rimarc/clipboard")
}

fn png_copy(src: &Path, uuid: &str) -> Option<PathBuf> {
    let dst = png_dir().join(format!("{uuid}.png"));
    if !dst.exists() {
        std::fs::create_dir_all(png_dir()).ok()?;
        std::fs::copy(src, &dst).ok()?;
    }
    Some(dst)
}

/// Miniatura `data:` de un PNG, cacheada por ruta: el front sondea cada 2 s y
/// el PNG de Klipper no cambia nunca bajo el mismo uuid.
#[cfg(target_os = "linux")]
fn thumbnail(path: &Path) -> Option<(u32, u32, String)> {
    static THUMBS: Mutex<Option<HashMap<PathBuf, (u32, u32, String)>>> = Mutex::new(None);
    let mut cache = THUMBS.lock().ok()?;
    let cache = cache.get_or_insert_with(HashMap::new);
    if let Some(hit) = cache.get(path) {
        return Some(hit.clone());
    }
    let img = image::load_from_memory_with_format(&std::fs::read(path).ok()?, image::ImageFormat::Png).ok()?;
    // A 2x del hueco que ocupa en la carta. `thumbnail` tambien agranda: una
    // captura de 177x51 salia a 720 de ancho y ocupaba la carta entera.
    let small = if img.width() > 720 || img.height() > 280 { img.thumbnail(720, 280) } else { img.clone() };
    let mut png = std::io::Cursor::new(Vec::new());
    small.write_to(&mut png, image::ImageFormat::Png).ok()?;
    let data = format!("data:image/png;base64,{}", gtk::glib::base64_encode(png.get_ref()));
    let entry = (img.width(), img.height(), data);
    cache.insert(path.to_path_buf(), entry.clone());
    Some(entry)
}

/// Icono que sigue al cursor al arrastrar una imagen: el PNG entero seria del
/// tamano de la captura.
#[cfg(target_os = "linux")]
pub fn drag_icon(path: &Path) -> Vec<u8> {
    let mut png = std::io::Cursor::new(Vec::new());
    if let Ok(img) = image::load_from_memory_with_format(
        &std::fs::read(path).unwrap_or_default(),
        image::ImageFormat::Png,
    ) {
        let _ = img.thumbnail(160, 120).write_to(&mut png, image::ImageFormat::Png);
    }
    png.into_inner()
}

#[cfg(not(target_os = "linux"))]
fn thumbnail(_: &Path) -> Option<(u32, u32, String)> {
    None
}

pub fn get_clipboard_history(limit: Option<usize>) -> Vec<ClipboardItem> {
    let limit_num = limit.unwrap_or(20).clamp(1, 100);

    if let Some(items) = klipper_db_history(limit_num) {
        return items;
    }
    // Por D-Bus cada elemento es un `qdbus` aparte, cada 2 s: ahi 40 ya es mucho.
    let limit_num = limit_num.min(40);

    if is_klipper_available() {
        let qdbus_bin = find_qdbus().unwrap_or("/usr/bin/qdbus6");
        let raw_items: Vec<(usize, String)> = std::thread::scope(|s| {
            let mut handles = Vec::new();
            for i in 0..limit_num {
                handles.push(s.spawn(move || {
                    let output = Command::new(qdbus_bin)
                        .args([
                            "org.kde.klipper",
                            "/klipper",
                            "org.kde.klipper.klipper.getClipboardHistoryItem",
                            &i.to_string(),
                        ])
                        .output();
                    if let Ok(out) = output {
                        if out.status.success() {
                            let text = String::from_utf8_lossy(&out.stdout).to_string();
                            return Some((i, text));
                        }
                    }
                    None
                }));
            }
            handles.into_iter().filter_map(|h| h.join().ok().flatten()).collect()
        });

        let mut sorted_raw = raw_items;
        sorted_raw.sort_by_key(|(i, _)| *i);

        let now = now_secs();
        let mut items = Vec::new();
        let mut seen = HashSet::new();

        for (idx, text) in sorted_raw {
            let trimmed = text.trim();
            if trimmed.is_empty() || !seen.insert(trimmed.to_string()) {
                continue;
            }
            items.push(ClipboardItem {
                id: format!("klipper-{}", hash_str(trimmed)),
                text: text.trim_end_matches('\n').to_string(),
                preview: make_preview(trimmed, 100),
                kind: classify_content(trimmed),
                char_count: trimmed.chars().count(),
                line_count: trimmed.lines().count(),
                timestamp: now - (idx as i64 * 30),
                image: None,
            });
        }

        if !items.is_empty() {
            return items;
        }
    }

    // Fallback store if Klipper returned nothing
    FALLBACK_CLIPBOARD
        .lock()
        .map(|guard| guard.clone())
        .unwrap_or_default()
}

/// Borra un clip de verdad: de la base de datos de Klipper y sus ficheros.
/// Klipper no tiene metodo D-Bus para esto ni relee la base mientras corre, asi
/// que su propio menu lo sigue ensenando hasta reiniciar plasmashell; la lista
/// de Rimarc, que lee la base, deja de verlo al momento.
pub fn delete_clipboard_item(id: &str) -> Result<(), String> {
    if let Ok(mut fallback) = FALLBACK_CLIPBOARD.lock() {
        fallback.retain(|it| it.id != id);
    }
    let Some(uuid) = id.strip_prefix("klipper-").filter(|u| is_uuid(u)) else {
        return Ok(());
    };
    let dir = klipper_dir().ok_or("sin directorio de datos")?;
    let out = Command::new("sqlite3")
        .arg(dir.join("history3.sqlite"))
        .arg(format!(
            "delete from aux where uuid = '{uuid}'; delete from main where uuid = '{uuid}';"
        ))
        .output()
        .map_err(|e| e.to_string())?;
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).into_owned());
    }
    let _ = std::fs::remove_dir_all(dir.join("data").join(uuid));
    let _ = std::fs::remove_file(png_dir().join(format!("{uuid}.png")));
    Ok(())
}

/// Vuelve a poner en el portapapeles una imagen del historial. Solo acepta
/// rutas de la cache de copias `.png`: la ruta llega del front, que guarda los
/// fijados en `localStorage`.
pub fn checked_png(path: &str) -> Result<&Path, String> {
    let path = Path::new(path);
    if !path.starts_with(png_dir()) || path.components().any(|c| c.as_os_str() == "..") {
        return Err("ruta fuera del historial del portapapeles".into());
    }
    Ok(path)
}

#[cfg(target_os = "linux")]
pub fn set_clipboard_image(path: &str) -> Result<(), String> {
    let path = checked_png(path)?;
    let pb = gtk::gdk_pixbuf::Pixbuf::from_file(path).map_err(|e| e.to_string())?;
    gtk::Clipboard::get(&gdk::SELECTION_CLIPBOARD).set_image(&pb);
    Ok(())
}

pub fn set_clipboard_content(text: &str) -> Result<(), String> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return Ok(());
    }

    if let Some(bin) = find_qdbus() {
        let _ = Command::new(bin)
            .args([
                "org.kde.klipper",
                "/klipper",
                "org.kde.klipper.klipper.setClipboardContents",
                text,
            ])
            .output();
    }

    // Fallback memory push
    if let Ok(mut fallback) = FALLBACK_CLIPBOARD.lock() {
        let now = now_secs();

        fallback.retain(|item| item.text != text);
        let char_count = trimmed.chars().count();
        let line_count = trimmed.lines().count();
        let kind = classify_content(trimmed);
        let preview = make_preview(trimmed, 100);

        fallback.insert(
            0,
            ClipboardItem {
                id: format!("local-{}", hash_str(trimmed)),
                text: text.to_string(),
                preview,
                kind,
                char_count,
                line_count,
                timestamp: now,
                image: None,
            },
        );
        if fallback.len() > 50 {
            fallback.truncate(50);
        }
    }

    Ok(())
}

pub fn clear_clipboard_history() -> Result<(), String> {
    if let Some(bin) = find_qdbus() {
        let _ = Command::new(bin)
            .args([
                "org.kde.klipper",
                "/klipper",
                "org.kde.klipper.klipper.clearClipboardHistory",
            ])
            .output();
        let _ = Command::new(bin)
            .args([
                "org.kde.klipper",
                "/klipper",
                "org.kde.klipper.klipper.clearClipboardContents",
            ])
            .output();
    }

    if let Ok(mut fallback) = FALLBACK_CLIPBOARD.lock() {
        fallback.clear();
    }

    Ok(())
}
