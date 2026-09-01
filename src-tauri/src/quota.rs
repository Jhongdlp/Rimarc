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
/// Cada 60s el endpoint acababa devolviendo `429 rate_limit_error` a todas
/// horas y la cuota no se refrescaba nunca. La ventana de 5h no se mueve tanto.
const POLL_SECS: u64 = 300;
/// El endpoint lo comparten Claude Code y cada arranque de esta app, asi que un
/// 429 en el primer sondeo es lo normal. Reintentar en 30s y no en 5 minutos:
/// si no, el anillo se queda a 0% todo ese rato.
const RETRY_SECS: u64 = 30;
const MAX_POLL_SECS: u64 = 1800;

/// Espera hasta el siguiente sondeo. El primer fallo baja a `RETRY_SECS` y los
/// siguientes doblan (429, sin red, token caducado: no se distinguen, y a todos
/// les viene bien esperar); un acierto vuelve a la cadencia normal.
fn next_wait(wait: u64, ok: bool) -> u64 {
    if ok {
        POLL_SECS
    } else if wait == POLL_SECS {
        RETRY_SECS
    } else {
        (wait * 2).min(MAX_POLL_SECS)
    }
}

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

fn store(q: ClaudeQuota) -> bool {
    slot().lock().map(|mut g| *g = Some(q)).is_ok()
}

/// Ultima respuesta buena, en crudo. Sin esto, cada arranque que se comia un 429
/// pintaba 0% hasta el primer sondeo con suerte.
fn cache_path() -> PathBuf {
    std::env::temp_dir().join("notch_agent_quota.json")
}

/// Arranca el sondeo en segundo plano. Idempotente-por-proceso: llamarlo una vez
/// en el setup de Tauri. No bloquea nunca al escaneo, que corre cada 2.5s.
pub fn spawn_poller() {
    if let Some(q) = std::fs::read(cache_path()).ok().and_then(|b| parse(&b)) {
        store(q);
    }
    std::thread::spawn(|| {
        let mut wait = POLL_SECS;
        loop {
            let ok = match fetch() {
                Some(q) => store(q),
                None => false,
            };
            wait = next_wait(wait, ok);
            std::thread::sleep(Duration::from_secs(wait));
        }
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

    let q = parse(&out.stdout)?;
    let _ = std::fs::write(cache_path(), &out.stdout);
    Some(q)
}

/// El cuerpo de `/usage`, venga de la red o del fichero de cache. Un 429 tambien
/// es JSON valido; sin `five_hour` no sirve.
fn parse(body: &[u8]) -> Option<ClaudeQuota> {
    let val: serde_json::Value = serde_json::from_slice(body).ok()?;
    let five = val.get("five_hour")?;
    let seven = val.get("seven_day")?;

    // Una cuota cacheada de una ventana ya reiniciada no dice nada del consumo
    // de ahora: mejor "estimado" que un porcentaje viejo pintado como real.
    if resets_in_secs(five)? == 0 {
        return None;
    }

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

fn resets_in_secs(window: &serde_json::Value) -> Option<u64> {
    let at = window.get("resets_at").and_then(|v| v.as_str())?;
    let when = chrono::DateTime::parse_from_rfc3339(at).ok()?;
    Some((when.timestamp() - chrono::Utc::now().timestamp()).max(0) as u64)
}

/// "2026-08-31T21:10:00+00:00" -> "3h 12m" restantes.
fn reset_in(window: &serde_json::Value) -> Option<String> {
    resets_in_secs(window).map(humanize)
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
    fn backoff_retries_soon_then_grows() {
        let mut w = next_wait(POLL_SECS, false);
        assert_eq!(w, RETRY_SECS, "el primer fallo reintenta pronto");
        for _ in 0..10 {
            w = next_wait(w, false);
        }
        assert_eq!(w, MAX_POLL_SECS);
        assert_eq!(next_wait(w, true), POLL_SECS);
    }

    #[test]
    fn parses_a_real_usage_payload() {
        let body = serde_json::json!({
            "five_hour": { "utilization": 77.0, "resets_at": "2999-01-01T00:00:00+00:00" },
            "seven_day": { "utilization": 11.0, "resets_at": null }
        });
        let q = parse(body.to_string().as_bytes()).expect("payload valido");
        assert_eq!(q.five_hour_used, 77);
        assert_eq!(q.seven_day_used, 11);
        assert!(q.five_hour_reset.is_some());
        assert!(q.seven_day_reset.is_none());
    }

    #[test]
    fn rejects_errors_and_stale_cache() {
        let err = br#"{"type":"error","error":{"message":"Rate limited."}}"#;
        assert!(parse(err).is_none(), "un 429 no es una cuota");
        let stale = serde_json::json!({
            "five_hour": { "utilization": 77.0, "resets_at": "2020-01-01T00:00:00+00:00" },
            "seven_day": { "utilization": 11.0, "resets_at": null }
        });
        assert!(
            parse(stale.to_string().as_bytes()).is_none(),
            "la ventana de 5h ya reinicio: el porcentaje cacheado no vale"
        );
    }

    #[test]
    fn humanizes_windows() {
        assert_eq!(humanize(0), "1m");
        assert_eq!(humanize(3 * 3600 + 12 * 60), "3h 12m");
        assert_eq!(humanize(2 * 86400 + 6 * 3600), "2d 6h");
    }
}
