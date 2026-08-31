//! Cuota real de Claude, leida del mismo endpoint que usa `/usage`.
//!
//! No estima nada: `api/oauth/usage` devuelve la utilizacion real de las
//! ventanas de 5h y 7d de la cuenta, con su hora de reinicio. El token OAuth
//! sale de `~/.claude/.credentials.json`, que es lo que Claude Code ya guarda.
//!
//! ponytail: se llama con `curl` en vez de reqwest porque el reqwest del arbol
//! de Tauri viene sin backend TLS; habilitarlo mete rustls entero. Si algun dia
//! hace falta Windows sin curl, cambiar esta funcion por reqwest+rustls.

use std::path::PathBuf;
use std::process::Command;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const USAGE_URL: &str = "https://api.anthropic.com/api/oauth/usage";
const POLL_SECS: u64 = 60;

#[derive(Debug, Clone)]
pub struct ClaudeQuota {
    /// Porcentaje usado de la ventana de 5h (0-100).
    pub five_hour_used: u32,
    /// Porcentaje usado de la ventana de 7d (0-100).
    pub seven_day_used: u32,
    /// "3h 12m" hasta el reinicio, ya formateado.
    pub five_hour_reset: Option<String>,
    pub seven_day_reset: Option<String>,
}

static QUOTA: OnceLock<Mutex<Option<ClaudeQuota>>> = OnceLock::new();

fn slot() -> &'static Mutex<Option<ClaudeQuota>> {
    QUOTA.get_or_init(|| Mutex::new(None))
}

/// Ultima cuota conocida. `None` mientras no haya habido una respuesta valida
/// (sin red, token caducado, curl ausente): el frontend lo marca como estimado.
pub fn current() -> Option<ClaudeQuota> {
    slot().lock().ok().and_then(|g| g.clone())
}

/// Arranca el sondeo en segundo plano. Idempotente-por-proceso: llamarlo una vez
/// en el setup de Tauri. No bloquea nunca al escaneo, que corre cada 2.5s.
pub fn spawn_poller() {
    std::thread::spawn(|| loop {
        if let Some(q) = fetch() {
            if let Ok(mut g) = slot().lock() {
                *g = Some(q);
            }
        }
        std::thread::sleep(Duration::from_secs(POLL_SECS));
    });
}

fn credentials_path() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("/home/jhon"))
        .join(".claude")
        .join(".credentials.json")
}

fn access_token() -> Option<String> {
    let raw = std::fs::read_to_string(credentials_path()).ok()?;
    let val: serde_json::Value = serde_json::from_str(&raw).ok()?;
    let oauth = val.get("claudeAiOauth")?;

    // `expiresAt` viene en milisegundos. Un token caducado da 401 y ensuciaria
    // la cuota buena que ya tengamos cacheada, asi que ni lo intentamos.
    let expires_ms = oauth.get("expiresAt").and_then(|v| v.as_u64()).unwrap_or(0);
    if expires_ms > 0 {
        let now_ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;
        if now_ms >= expires_ms {
            return None;
        }
    }

    oauth
        .get("accessToken")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
}

fn fetch() -> Option<ClaudeQuota> {
    let token = access_token()?;

    let out = Command::new("curl")
        .args([
            "-s",
            "--max-time",
            "10",
            "-H",
            &format!("Authorization: Bearer {}", token),
            "-H",
            "anthropic-beta: oauth-2025-04-20",
            USAGE_URL,
        ])
        .output()
        .ok()?;

    if !out.status.success() {
        return None;
    }

    let val: serde_json::Value = serde_json::from_slice(&out.stdout).ok()?;
    // Una respuesta de error tambien es JSON valido; sin `five_hour` no sirve.
    let five = val.get("five_hour")?;
    let seven = val.get("seven_day")?;

    Some(ClaudeQuota {
        five_hour_used: pct(five),
        seven_day_used: pct(seven),
        five_hour_reset: reset_in(five),
        seven_day_reset: reset_in(seven),
    })
}

fn pct(window: &serde_json::Value) -> u32 {
    window
        .get("utilization")
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0)
        .clamp(0.0, 100.0)
        .round() as u32
}

/// "2026-08-31T21:10:00+00:00" -> "3h 12m" restantes.
fn reset_in(window: &serde_json::Value) -> Option<String> {
    let at = window.get("resets_at").and_then(|v| v.as_str())?;
    let when = chrono::DateTime::parse_from_rfc3339(at).ok()?;
    let secs = (when.timestamp() - chrono::Utc::now().timestamp()).max(0) as u64;
    Some(humanize(secs))
}

pub fn humanize(secs: u64) -> String {
    let mins = secs / 60;
    let (d, h, m) = (mins / 1440, (mins % 1440) / 60, mins % 60);
    if d > 0 {
        format!("{}d {}h", d, h)
    } else if h > 0 {
        format!("{}h {}m", h, m)
    } else {
        format!("{}m", m.max(1))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_a_real_usage_payload() {
        let body = serde_json::json!({
            "five_hour": { "utilization": 77.0, "resets_at": "2999-01-01T00:00:00+00:00" },
            "seven_day": { "utilization": 11.0, "resets_at": null }
        });
        assert_eq!(pct(body.get("five_hour").unwrap()), 77);
        assert_eq!(pct(body.get("seven_day").unwrap()), 11);
        assert!(reset_in(body.get("five_hour").unwrap()).is_some());
        assert!(reset_in(body.get("seven_day").unwrap()).is_none());
    }

    #[test]
    fn humanizes_windows() {
        assert_eq!(humanize(0), "1m");
        assert_eq!(humanize(3 * 3600 + 12 * 60), "3h 12m");
        assert_eq!(humanize(2 * 86400 + 6 * 3600), "2d 6h");
    }
}
