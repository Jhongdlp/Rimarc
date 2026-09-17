//! Servidor MCP por stdio (`rimarc --mcp`): deja que un agente lea el historial
//! del portapapeles, imagenes incluidas, sin que haya que pegarselas.
//! JSON-RPC de una linea por mensaje, que es todo lo que pide el transporte stdio.

use crate::clipboard;
use serde_json::{json, Value};
use std::io::{BufRead, Write};

/// Lado largo maximo de las imagenes que se devuelven: por encima, el modelo
/// las reescala igual y solo se paga en tamano del mensaje.
const MAX_SIDE: u32 = 1568;

pub fn serve() {
    let stdin = std::io::stdin();
    let mut stdout = std::io::stdout();
    for line in stdin.lock().lines() {
        let Ok(line) = line else { break };
        let Ok(msg) = serde_json::from_str::<Value>(&line) else { continue };
        // Sin `id` es una notificacion (`notifications/initialized`): no se contesta.
        let Some(id) = msg.get("id").cloned() else { continue };
        let reply = match handle(&msg) {
            Ok(result) => json!({ "jsonrpc": "2.0", "id": id, "result": result }),
            Err((code, message)) => {
                json!({ "jsonrpc": "2.0", "id": id, "error": { "code": code, "message": message } })
            }
        };
        let _ = writeln!(stdout, "{reply}");
        let _ = stdout.flush();
    }
}

fn handle(msg: &Value) -> Result<Value, (i64, String)> {
    let params = &msg["params"];
    match msg["method"].as_str().unwrap_or("") {
        "initialize" => Ok(json!({
            "protocolVersion": params["protocolVersion"].as_str().unwrap_or("2025-06-18"),
            "capabilities": { "tools": {} },
            "serverInfo": { "name": "rimarc-clipboard", "version": env!("CARGO_PKG_VERSION") },
        })),
        "ping" => Ok(json!({})),
        "tools/list" => Ok(json!({ "tools": [{
            "name": "clipboard_history",
            "description": "Lee el historial del portapapeles del usuario (Klipper), del mas reciente al mas antiguo. \
                Las imagenes se devuelven como imagen, para verlas directamente. \
                Usalo cuando el usuario hable de lo que ha copiado: 'las ultimas 3 imagenes', 'lo que copie antes'.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "limit": { "type": "integer", "minimum": 1, "maximum": 20, "default": 5,
                               "description": "Cuantos elementos devolver." },
                    "kind": { "type": "string", "enum": ["any", "image", "text"], "default": "any",
                              "description": "Filtrar por tipo: solo imagenes, solo texto o todo." }
                }
            }
        }]})),
        "tools/call" if params["name"] == "clipboard_history" => Ok(clipboard_history(&params["arguments"])),
        "tools/call" => Err((-32602, "herramienta desconocida".into())),
        _ => Err((-32601, "metodo no soportado".into())),
    }
}

fn clipboard_history(args: &Value) -> Value {
    let limit = args["limit"].as_u64().unwrap_or(5).clamp(1, 20) as usize;
    let kind = args["kind"].as_str().unwrap_or("any");
    // ponytail: con filtro se leen los 40 ultimos y se filtra aqui; una imagen
    // mas vieja que eso no aparece. Filtrar en el SQL si hace falta mas fondo.
    let fetch = if kind == "any" { limit } else { 40 };

    let mut content: Vec<Value> = clipboard::get_clipboard_history(Some(fetch))
        .into_iter()
        .filter(|it| match kind {
            "image" => it.kind == "image",
            "text" => it.kind != "image",
            _ => true,
        })
        .take(limit)
        .flat_map(|it| {
            let when = format!("copiado hace {}", ago(it.timestamp));
            if it.kind != "image" {
                return vec![json!({ "type": "text", "text": format!("[{}, {when}]\n{}", it.kind, it.text) })];
            }
            let mut blocks = vec![json!({ "type": "text", "text": format!("[imagen {}, {when}] {}", it.preview, it.text) })];
            match png_base64(&it.text) {
                Some(data) => blocks.push(json!({ "type": "image", "data": data, "mimeType": "image/png" })),
                None => blocks.push(json!({ "type": "text", "text": "(no se pudo leer la imagen)" })),
            }
            blocks
        })
        .collect();

    if content.is_empty() {
        content.push(json!({ "type": "text", "text": "No hay nada de ese tipo en el portapapeles." }));
    }
    json!({ "content": content })
}

fn png_base64(path: &str) -> Option<String> {
    let bytes = std::fs::read(path).ok()?;
    let img = image::load_from_memory_with_format(&bytes, image::ImageFormat::Png).ok()?;
    if img.width().max(img.height()) <= MAX_SIDE {
        return Some(gtk::glib::base64_encode(&bytes).to_string());
    }
    let mut png = std::io::Cursor::new(Vec::new());
    img.thumbnail(MAX_SIDE, MAX_SIDE).write_to(&mut png, image::ImageFormat::Png).ok()?;
    Some(gtk::glib::base64_encode(png.get_ref()).to_string())
}

fn ago(ts: i64) -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(ts)
        - ts;
    match secs.max(0) {
        s if s < 60 => format!("{s} s"),
        s if s < 3600 => format!("{} min", s / 60),
        s if s < 86400 => format!("{} h", s / 3600),
        s => format!("{} d", s / 86400),
    }
}
