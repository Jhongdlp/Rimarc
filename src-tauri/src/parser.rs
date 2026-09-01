use std::collections::{HashMap, HashSet};
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};
use serde_json::Value;

use crate::quota;

#[derive(Debug, Clone, Default)]
pub struct CachedFileTokens {
    pub mtime_secs: u64,
    pub file_size: u64,
    /// Modelo con el que se hablo en ese transcript, para saber a que pool de
    /// cuota de Antigravity pertenece.
    pub model: Option<String>,
    /// `(epoch del paso, tokens estimados)`, solo de los ultimos 7 dias.
    ///
    /// Guardar un total por fichero era el bug: una conversacion de hace
    /// semanas que hoy se abre un momento cambia su mtime, y entonces sus
    /// 45k tokens de historia entraban enteros en la ventana de 5 h. Con la
    /// marca de tiempo de cada paso solo cuenta lo que se escribio dentro de
    /// la ventana.
    pub steps: Vec<(u64, u64)>,
}

/// Contabilidad incremental de un transcript de Claude Code. Los `.jsonl` son
/// append-only y llegan a decenas de MB, asi que solo se leen los bytes nuevos
/// desde el ultimo escaneo y se guarda el acumulado aqui.
#[derive(Debug, Clone, Default)]
pub struct SessionAccum {
    /// Bytes ya contabilizados (siempre acaba en salto de linea).
    pub offset: u64,
    pub input: u64,
    pub output: u64,
    pub cache_write: u64,
    pub cache_read: u64,
    pub cost_usd: f64,
    /// Ocupacion real de la ventana de contexto en el ultimo turno.
    pub context_tokens: u64,
    pub model: Option<String>,
    pub last_action: Option<String>,
    pub last_timestamp: Option<String>,
    /// `message.id` ya contados. Claude Code reescribe la misma respuesta varias
    /// veces (sidechains, reintentos); sin esto se cuenta doble.
    pub seen: HashSet<String>,
}

#[derive(Debug, Clone, Default)]
pub struct MetricsCache {
    /// Solo Antigravity, que se estima por tamano de fichero.
    pub file_cache: HashMap<PathBuf, CachedFileTokens>,
    pub sessions: HashMap<PathBuf, SessionAccum>,
}

#[derive(Debug, Clone, Default)]
pub struct UsageMetrics {
    pub tokens_in: u64,
    pub tokens_out: u64,
    pub daily_tokens: u64,
    pub weekly_tokens: u64,
    /// Porcentaje **consumido** de la ventana, igual que lo muestra `/usage`.
    /// El front lo pinta directo: el anillo se llena con el consumo y
    /// `accentFor` vira a naranja por encima de 70.
    pub daily_percent: u32,
    pub weekly_percent: u32,
    pub reset_daily: Option<String>,
    pub reset_weekly: Option<String>,
    pub total_cost_usd: f64,
    pub last_action: Option<String>,
    pub last_timestamp: Option<String>,
    pub model: Option<String>,
    pub context_tokens: u64,
    /// Ventana de contexto del modelo cuando el agente la publica (Codex lo
    /// hace); `0` = usar el valor por defecto del scanner.
    pub context_window: u64,
    /// `true` si los porcentajes vienen del endpoint de cuota real y no de una
    /// estimacion local. El frontend lo usa para no vender humo como dato.
    pub quota_live: bool,
}

/// Precio por millon de tokens (entrada, salida) segun el id de modelo.
fn rates(model: &str) -> (f64, f64) {
    let m = model.to_lowercase();
    if m.contains("fable") || m.contains("mythos") {
        (10.0, 50.0)
    } else if m.contains("haiku") {
        (1.0, 5.0)
    } else if m.contains("sonnet-5") {
        (2.0, 10.0)
    } else if m.contains("sonnet") {
        (3.0, 15.0)
    } else {
        (5.0, 25.0) // familia Opus, y default si el id es desconocido
    }
}

/// Coste de un turno. La escritura de cache cuesta 1.25x la entrada y la
/// lectura 0.1x; ignorarlas es lo que hacia que el coste saliera ~10x bajo.
fn turn_cost(model: &str, input: u64, output: u64, cache_write: u64, cache_read: u64) -> f64 {
    let (r_in, r_out) = rates(model);
    let m = 1_000_000.0;
    (input as f64 / m) * r_in
        + (cache_write as f64 / m) * r_in * 1.25
        + (cache_read as f64 / m) * r_in * 0.1
        + (output as f64 / m) * r_out
}

/// "claude-opus-5" -> "Opus 5". Sin tabla de nombres que se quede vieja.
fn pretty_model(id: &str) -> String {
    id.strip_prefix("claude-")
        .unwrap_or(id)
        .split('-')
        .map(|part| {
            let mut c = part.chars();
            match c.next() {
                Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

/// Lee solo los bytes nuevos de `path` y actualiza el acumulado.
fn accumulate_session(acc: &mut SessionAccum, path: &Path) {
    let mut file = match File::open(path) {
        Ok(f) => f,
        Err(_) => return,
    };
    let len = file.metadata().map(|m| m.len()).unwrap_or(0);

    // Fichero truncado o reemplazado: el offset ya no significa nada.
    if len < acc.offset {
        *acc = SessionAccum::default();
    }
    if len == acc.offset {
        return;
    }

    if file.seek(SeekFrom::Start(acc.offset)).is_err() {
        return;
    }
    let mut buf = Vec::with_capacity((len - acc.offset) as usize);
    if file.read_to_end(&mut buf).is_err() {
        return;
    }

    // La ultima linea puede estar a medio escribir: se deja para la proxima vuelta.
    let complete = match buf.iter().rposition(|b| *b == b'\n') {
        Some(i) => i + 1,
        None => return,
    };
    acc.offset += complete as u64;

    for line in String::from_utf8_lossy(&buf[..complete]).lines() {
        let val: Value = match serde_json::from_str(line) {
            Ok(v) => v,
            Err(_) => continue,
        };

        if let Some(ts) = val.get("timestamp").and_then(|v| v.as_str()) {
            acc.last_timestamp = Some(ts.to_string());
        }

        if let Some(hook) = val
            .get("attachment")
            .and_then(|a| a.get("hookName"))
            .and_then(|v| v.as_str())
        {
            acc.last_action = Some(format!("Hook: {}", hook));
        }

        let msg = match val.get("message") {
            Some(m) => m,
            None => continue,
        };

        if let Some(items) = msg.get("content").and_then(|v| v.as_array()) {
            for item in items {
                if item.get("type").and_then(|v| v.as_str()) == Some("tool_use") {
                    if let Some(name) = item.get("name").and_then(|v| v.as_str()) {
                        acc.last_action = Some(format!("Tool: {}", name));
                    }
                }
            }
        }

        let usage = match msg.get("usage") {
            Some(u) => u,
            None => continue,
        };

        // Deduplicar por id de mensaje; sin id, por requestId.
        let key = msg
            .get("id")
            .and_then(|v| v.as_str())
            .or_else(|| val.get("requestId").and_then(|v| v.as_str()));
        if let Some(k) = key {
            if !acc.seen.insert(k.to_string()) {
                continue;
            }
        }

        let n = |field: &str| usage.get(field).and_then(|v| v.as_u64()).unwrap_or(0);
        let (input, output) = (n("input_tokens"), n("output_tokens"));
        let (cw, cr) = (n("cache_creation_input_tokens"), n("cache_read_input_tokens"));

        let model = msg
            .get("model")
            .and_then(|v| v.as_str())
            .unwrap_or("claude-opus-5");
        acc.model = Some(pretty_model(model));

        acc.input += input;
        acc.output += output;
        acc.cache_write += cw;
        acc.cache_read += cr;
        acc.cost_usd += turn_cost(model, input, output, cw, cr);
        // El contexto no se suma: es lo que ocupaba el prompt de este turno.
        acc.context_tokens = input + cw + cr;
    }
}

/// Metricas de la sesion activa de Claude Code en `project_dir`.
///
/// Los porcentajes de cuota salen de `quota::current()` (el mismo dato que
/// `/usage`), no del disco: los transcripts no saben nada de la cuota real de
/// la cuenta. Si no hay respuesta del endpoint, `quota_live` queda en `false`.
pub fn parse_claude_project_metrics(
    cache: &mut MetricsCache,
    project_dir_path: &Path,
) -> UsageMetrics {
    let mut metrics = UsageMetrics::default();

    if let Some(latest) = newest_jsonl(project_dir_path) {
        let acc = cache.sessions.entry(latest.clone()).or_default();
        accumulate_session(acc, &latest);

        metrics.tokens_in = acc.input + acc.cache_write + acc.cache_read;
        metrics.tokens_out = acc.output;
        metrics.total_cost_usd = acc.cost_usd;
        metrics.context_tokens = acc.context_tokens;
        metrics.model = acc.model.clone();
        metrics.last_action = acc.last_action.clone();
        metrics.last_timestamp = acc.last_timestamp.clone();
    }

    let session_total = metrics.tokens_in + metrics.tokens_out;
    metrics.daily_tokens = session_total;
    metrics.weekly_tokens = session_total;

    if let Some(q) = quota::current() {
        metrics.quota_live = true;
        metrics.daily_percent = q.five_hour_used;
        metrics.weekly_percent = q.seven_day_used;
        metrics.reset_daily = q.five_hour_reset;
        metrics.reset_weekly = q.seven_day_reset;
    }

    metrics
}

fn newest_jsonl(dir: &Path) -> Option<PathBuf> {
    let mut files: Vec<PathBuf> = std::fs::read_dir(dir)
        .ok()?
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| p.extension().map_or(false, |x| x == "jsonl"))
        .collect();
    files.sort_by_key(|p| {
        std::cmp::Reverse(
            p.metadata()
                .and_then(|m| m.modified())
                .unwrap_or(UNIX_EPOCH),
        )
    });
    files.into_iter().next()
}

/// Ultimos `max` bytes de un fichero, recortados hasta el primer salto de linea
/// para no empezar a medio JSON. Los transcripts crecen sin limite y aqui solo
/// interesa el final.
fn tail(path: &Path, max: u64) -> String {
    let mut file = match File::open(path) {
        Ok(f) => f,
        Err(_) => return String::new(),
    };
    let len = file.metadata().map(|m| m.len()).unwrap_or(0);
    let start = len.saturating_sub(max);
    if file.seek(SeekFrom::Start(start)).is_err() {
        return String::new();
    }
    let mut buf = Vec::with_capacity((len - start) as usize);
    if file.read_to_end(&mut buf).is_err() {
        return String::new();
    }
    let text = String::from_utf8_lossy(&buf).into_owned();
    if start == 0 {
        text
    } else {
        // La primera linea del corte esta partida por la mitad.
        text.split_once('\n').map(|(_, rest)| rest.to_string()).unwrap_or_default()
    }
}

// ---------------------------------------------------------------------- Codex

const CODEX_TAIL_BYTES: u64 = 512 * 1024;

/// Precio por millon de tokens (entrada, salida) de los modelos de Codex.
fn codex_rates(model: &str) -> (f64, f64) {
    let m = model.to_lowercase();
    if m.contains("nano") {
        (0.05, 0.40)
    } else if m.contains("mini") {
        (0.25, 2.00)
    } else {
        (1.25, 10.00) // familia gpt-5, y default si el id es desconocido
    }
}

/// Metricas de Codex CLI.
///
/// A diferencia de Claude, Codex **escribe su cuota real en el propio
/// transcript**: cada evento `token_count` lleva un `rate_limits` con el
/// porcentaje usado de la ventana de 5h (`primary`) y de la semanal
/// (`secondary`) y los segundos que faltan para el reinicio. No hace falta
/// llamar a ninguna API, asi que `quota_live` sale `true` sin red.
///
/// Los contadores de `info.total_token_usage` son **acumulados de la sesion**,
/// no incrementales: se coge el ultimo evento y ya, aqui no se suma nada.
pub fn parse_codex_metrics(sessions_root: &Path, cwd: &str) -> UsageMetrics {
    let mut metrics = UsageMetrics::default();
    let rollout = match newest_codex_rollout(sessions_root, cwd) {
        Some(p) => p,
        None => return metrics,
    };

    let mut model = String::from("gpt-5");
    for line in tail(&rollout, CODEX_TAIL_BYTES).lines() {
        let val: Value = match serde_json::from_str(line) {
            Ok(v) => v,
            Err(_) => continue,
        };
        let payload = match val.get("payload") {
            Some(p) => p,
            None => continue,
        };

        if let Some(ts) = val.get("timestamp").and_then(|v| v.as_str()) {
            metrics.last_timestamp = Some(ts.to_string());
        }
        // `session_meta` y `turn_context` traen el modelo del turno.
        if let Some(m) = payload.get("model").and_then(|v| v.as_str()) {
            model = m.to_string();
        }

        match payload.get("type").and_then(|v| v.as_str()) {
            Some("function_call") => {
                if let Some(name) = payload.get("name").and_then(|v| v.as_str()) {
                    metrics.last_action = Some(format!("Tool: {}", name));
                }
            }
            Some("token_count") => {
                let info = match payload.get("info") {
                    Some(i) if !i.is_null() => i,
                    // `rate_limits` puede llegar aunque `info` sea null.
                    _ => {
                        read_codex_rate_limits(payload, &mut metrics);
                        continue;
                    }
                };

                if let Some(total) = info.get("total_token_usage") {
                    let n = |f: &str| total.get(f).and_then(|v| v.as_u64()).unwrap_or(0);
                    // `input_tokens` ya incluye los cacheados y `output_tokens`
                    // el razonamiento: sumarlos aparte contaria doble.
                    let (input, cached, output) =
                        (n("input_tokens"), n("cached_input_tokens"), n("output_tokens"));
                    metrics.tokens_in = input;
                    metrics.tokens_out = output;

                    let (r_in, r_out) = codex_rates(&model);
                    let m = 1_000_000.0;
                    metrics.total_cost_usd = (input.saturating_sub(cached) as f64 / m) * r_in
                        + (cached as f64 / m) * r_in * 0.1
                        + (output as f64 / m) * r_out;
                }
                if let Some(last) = info.get("last_token_usage") {
                    metrics.context_tokens =
                        last.get("total_tokens").and_then(|v| v.as_u64()).unwrap_or(0);
                }
                metrics.context_window = info
                    .get("model_context_window")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(0);

                read_codex_rate_limits(payload, &mut metrics);
            }
            _ => {}
        }
    }

    metrics.model = Some(pretty_model(&model));
    // Codex no desglosa tokens por ventana, solo el porcentaje: lo unico real
    // que se puede poner aqui es el total de la sesion.
    let session_total = metrics.tokens_in + metrics.tokens_out;
    metrics.daily_tokens = session_total;
    metrics.weekly_tokens = session_total;
    metrics
}

/// `payload.rate_limits` -> porcentajes y reinicios. Llega a `null` en modo
/// `codex exec`, y entonces `quota_live` se queda como estaba.
fn read_codex_rate_limits(payload: &Value, metrics: &mut UsageMetrics) {
    let limits = match payload.get("rate_limits") {
        Some(v) if !v.is_null() => v,
        _ => return,
    };
    let window = |key: &str| -> Option<(u32, Option<String>)> {
        let w = limits.get(key).filter(|v| !v.is_null())?;
        let used = w
            .get("used_percent")
            .and_then(|v| v.as_f64())
            .unwrap_or(0.0)
            .clamp(0.0, 100.0)
            .round() as u32;
        let reset = w
            .get("resets_in_seconds")
            .and_then(|v| v.as_f64())
            .map(|secs| quota::humanize(secs.max(0.0) as u64));
        Some((used, reset))
    };

    if let Some((used, reset)) = window("primary") {
        metrics.daily_percent = used;
        metrics.reset_daily = reset;
        metrics.quota_live = true;
    }
    if let Some((used, reset)) = window("secondary") {
        metrics.weekly_percent = used;
        metrics.reset_weekly = reset;
        metrics.quota_live = true;
    }
}

/// Rollout mas reciente cuya cabecera apunta a `cwd`; si ninguno coincide, el
/// mas reciente a secas. Codex los archiva por fecha, en
/// `~/.codex/sessions/YYYY/MM/DD/rollout-<ts>-<uuid>.jsonl`.
fn newest_codex_rollout(sessions_root: &Path, cwd: &str) -> Option<PathBuf> {
    let today = chrono::Local::now().date_naive();
    let mut files: Vec<(SystemTime, PathBuf)> = Vec::new();

    for back in 0..7 {
        let day = today.checked_sub_days(chrono::Days::new(back))?;
        let dir = sessions_root
            .join(day.format("%Y").to_string())
            .join(day.format("%m").to_string())
            .join(day.format("%d").to_string());
        let entries = match std::fs::read_dir(&dir) {
            Ok(e) => e,
            Err(_) => continue,
        };
        for entry in entries.filter_map(|e| e.ok()) {
            let path = entry.path();
            let is_rollout = path.extension().map_or(false, |x| x == "jsonl")
                && path
                    .file_name()
                    .map_or(false, |n| n.to_string_lossy().starts_with("rollout-"));
            if is_rollout {
                let mtime = path
                    .metadata()
                    .and_then(|m| m.modified())
                    .unwrap_or(UNIX_EPOCH);
                files.push((mtime, path));
            }
        }
    }

    files.sort_by(|a, b| b.0.cmp(&a.0));
    // El `session_meta` es la primera linea, con 8 KB sobra para el cwd.
    let needle = format!("\"cwd\":\"{}\"", cwd);
    files
        .iter()
        .find(|(_, p)| head(p, 8192).contains(&needle))
        .or_else(|| files.first())
        .map(|(_, p)| p.clone())
}

fn head(path: &Path, max: usize) -> String {
    let mut file = match File::open(path) {
        Ok(f) => f,
        Err(_) => return String::new(),
    };
    let mut buf = vec![0u8; max];
    let n = file.read(&mut buf).unwrap_or(0);
    String::from_utf8_lossy(&buf[..n]).into_owned()
}

// ------------------------------------------------------------------- OpenCode

/// ponytail: OpenCode no publica cuota (es trae-tu-clave), asi que las ventanas
/// son estimaciones locales y viajan con `quota_live: false`. Si algun dia
/// expone un endpoint de uso, esto se borra.
const OPENCODE_5H_LIMIT: f64 = 1_000_000.0;
const OPENCODE_WEEKLY_LIMIT: f64 = 8_000_000.0;

/// Metricas de OpenCode.
///
/// OpenCode guarda todo en SQLite y la tabla `session` ya trae los totales por
/// sesion: coste, tokens de entrada, salida, razonamiento y cache. No hay
/// transcript que recorrer ni nada que estimar salvo las ventanas de cuota, una
/// sola consulta lo resuelve.
///
/// ponytail: se consulta con el binario `sqlite3` en vez de meter rusqlite en el
/// arbol, por el mismo motivo por el que `quota.rs` usa curl. Si falta el
/// binario las metricas salen a cero. Cambiar a rusqlite si hace falta Windows.
pub fn parse_opencode_metrics(db_path: &Path, cwd: &str) -> UsageMetrics {
    let mut metrics = UsageMetrics::default();
    if !db_path.exists() {
        return metrics;
    }

    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;
    let five_hours_ago = now_ms.saturating_sub(5 * 3600 * 1000);
    let seven_days_ago = now_ms.saturating_sub(7 * 86400 * 1000);

    // Todo en una fila para no lanzar `sqlite3` mas de una vez por escaneo.
    const TOKENS: &str = "tokens_input + tokens_output + tokens_cache_read + tokens_cache_write";
    let sql = format!(
        "select cost, tokens_input, tokens_output, tokens_reasoning, tokens_cache_read, \
         tokens_cache_write, coalesce(model, ''), \
         (select coalesce(sum({t}), 0) from session where time_updated > {h5}), \
         (select coalesce(sum({t}), 0) from session where time_updated > {d7}), \
         coalesce((select min(time_updated) from session where time_updated > {h5}), 0), \
         coalesce((select min(time_updated) from session where time_updated > {d7}), 0), \
         time_updated \
         from session where directory = '{dir}' order by time_updated desc limit 1;",
        t = TOKENS,
        h5 = five_hours_ago,
        d7 = seven_days_ago,
        dir = cwd.replace('\'', "''"),
    );

    let row = match sqlite_row(db_path, &sql) {
        Some(r) if r.len() >= 12 => r,
        _ => return metrics,
    };
    let num = |i: usize| row[i].parse::<f64>().unwrap_or(0.0);
    let int = |i: usize| row[i].parse::<u64>().unwrap_or(0);

    let (cache_read, cache_write) = (int(4), int(5));
    metrics.tokens_in = int(1) + cache_read + cache_write;
    metrics.tokens_out = int(2) + int(3);
    metrics.total_cost_usd = num(0);
    // El contexto del ultimo turno no esta desglosado; lo mas cercano es lo que
    // entro en la sesion.
    metrics.context_tokens = int(1) + cache_read;
    metrics.daily_tokens = int(7);
    metrics.weekly_tokens = int(8);
    metrics.model = opencode_model(&row[6]);

    metrics.daily_percent = pct_of(metrics.daily_tokens, OPENCODE_5H_LIMIT);
    metrics.weekly_percent = pct_of(metrics.weekly_tokens, OPENCODE_WEEKLY_LIMIT);
    metrics.reset_daily = rolling_reset(int(9), 5 * 3600 * 1000, now_ms);
    metrics.reset_weekly = rolling_reset(int(10), 7 * 86400 * 1000, now_ms);
    if int(11) > 0 {
        metrics.last_timestamp = chrono::DateTime::from_timestamp_millis(int(11) as i64)
            .map(|t| t.with_timezone(&chrono::Local).format("%H:%M:%S").to_string());
    }

    metrics
}

/// Una fila de `sqlite3`, con los campos separados por 0x1F para que ningun
/// titulo con `|` la parta. `-readonly` para no tocar la base del usuario.
fn sqlite_row(db_path: &Path, sql: &str) -> Option<Vec<String>> {
    let out = Command::new("sqlite3")
        .arg("-readonly")
        .arg("-separator")
        .arg("\u{1f}")
        .arg(db_path)
        .arg(sql)
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&out.stdout);
    let line = text.lines().next()?;
    Some(line.split('\u{1f}').map(|s| s.to_string()).collect())
}

/// La columna `model` de OpenCode es un JSON `{"id":..,"providerID":..}`.
fn opencode_model(raw: &str) -> Option<String> {
    let id = serde_json::from_str::<Value>(raw)
        .ok()
        .and_then(|v| v.get("id").and_then(|s| s.as_str()).map(String::from))?;
    Some(pretty_model(&id))
}

fn pct_of(tokens: u64, limit: f64) -> u32 {
    ((tokens as f64 / limit) * 100.0).round().min(100.0) as u32
}

/// Cuanto falta para que la ventana deslizante se vacie, contando desde su
/// evento mas antiguo. `oldest_ms == 0` = ventana vacia.
fn rolling_reset(oldest_ms: u64, window_ms: u64, now_ms: u64) -> Option<String> {
    if oldest_ms == 0 {
        return None;
    }
    Some(quota::humanize(
        (oldest_ms + window_ms).saturating_sub(now_ms) / 1000,
    ))
}

// ---------------------------------------------------------------- Antigravity

/// Antigravity reparte la cuota en **dos pools independientes** segun el modelo
/// elegido: los Gemini por un lado y los Claude por otro. Gastar Gemini no toca
/// el saldo de Claude, asi que contarlos juntos daba un porcentaje que no
/// significaba nada.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum ModelFamily {
    #[default]
    Gemini,
    Claude,
}

impl ModelFamily {
    fn of(model: &str) -> Self {
        if model.to_lowercase().contains("claude") {
            ModelFamily::Claude
        } else {
            ModelFamily::Gemini
        }
    }
}

/// ponytail: estimaciones, no dato real. Antigravity no publica su cuota en
/// ningun sitio y sus transcripts no traen un solo contador de tokens, asi que
/// todo esto sale marcado con `quota_live: false`. El pool de Claude es
/// bastante mas corto que el de Gemini.
fn antigravity_limits(family: ModelFamily) -> (f64, f64) {
    match family {
        ModelFamily::Gemini => (575_000.0, 3_550_000.0),
        ModelFamily::Claude => (180_000.0, 1_100_000.0),
    }
}

fn antigravity_context_window(family: ModelFamily) -> u64 {
    match family {
        ModelFamily::Gemini => 1_000_000,
        ModelFamily::Claude => 200_000,
    }
}

/// El modelo que se uso en un transcript viaja como texto dentro de un
/// `USER_SETTINGS_CHANGE`:
///
/// ``...`Model Selection` from None to Gemini 3.7 Flash (High). No need to...``
fn model_selection(content: &str) -> Option<String> {
    let after = content.split("Model Selection` from").nth(1)?;
    let name = after.split(" to ").nth(1)?.split(". ").next()?.trim();
    if name.is_empty() {
        None
    } else {
        Some(name.to_string())
    }
}

/// Pasos de un transcript posteriores a `since_secs`, como `(epoch, tokens)`,
/// mas el ultimo modelo elegido.
///
/// Los tokens son estimados (`chars / 4`): Antigravity no escribe ni un solo
/// contador real. Lo que si escribe es un `created_at` por paso, que es lo que
/// permite repartirlos por ventana en vez de achacar el fichero entero a la
/// hora en que se toco por ultima vez.
pub fn parse_antigravity_file(path: &Path, since_secs: u64) -> (Vec<(u64, u64)>, Option<String>) {
    let content = match std::fs::read_to_string(path) {
        Ok(c) => c,
        Err(_) => return (Vec::new(), None),
    };
    let mut steps = Vec::new();
    let mut model = None;
    for line in content.lines() {
        let val: Value = match serde_json::from_str(line) {
            Ok(v) => v,
            Err(_) => continue,
        };
        let text = val.get("content").and_then(|v| v.as_str()).unwrap_or("");
        let thinking = val.get("thinking").and_then(|v| v.as_str()).unwrap_or("");
        if let Some(m) = model_selection(text) {
            model = Some(m);
        }
        let at = match val.get("created_at").and_then(|v| v.as_str()).and_then(epoch) {
            Some(t) if t > since_secs => t,
            // Sin fecha no hay forma de saber a que ventana pertenece, y
            // meterlo por si acaso es justo lo que inflaba el porcentaje.
            _ => continue,
        };
        let tokens = ((text.len() + thinking.len()) / 4) as u64;
        if tokens > 0 {
            steps.push((at, tokens));
        }
    }
    (steps, model)
}

fn epoch(rfc3339: &str) -> Option<u64> {
    chrono::DateTime::parse_from_rfc3339(rfc3339)
        .ok()
        .map(|t| t.timestamp().max(0) as u64)
}

/// Metricas de Antigravity.
///
/// Todo aqui es **estimacion** (`chars / 4` sobre los transcripts, ventanas por
/// mtime de fichero): Antigravity no escribe un solo contador de tokens ni su
/// cuota en ninguna parte, asi que sale con `quota_live: false` y el popover lo
/// pinta como `~N tokens` en vez de un porcentaje duro.
///
/// Lo que si sabe hacer es separar los dos pools: cada conversacion declara su
/// modelo en el transcript, se acumula en el pool de su familia (Gemini o
/// Claude) y solo se reporta el pool del modelo que esta activo ahora.
pub fn parse_antigravity_metrics(
    cache: &mut MetricsCache,
    app_data_dir: &Path,
    cwd: &str,
    _daily_limit: u64,
    _weekly_limit: u64,
) -> UsageMetrics {
    let mut metrics = UsageMetrics::default();

    // Seleccion global, que vale de respaldo si el transcript activo no declara
    // modelo (conversacion vieja, anterior a que Antigravity lo registrase).
    let mut active_model = std::fs::read_to_string(app_data_dir.join("settings.json"))
        .ok()
        .and_then(|c| serde_json::from_str::<Value>(&c).ok())
        .and_then(|v| v.get("model").and_then(|m| m.as_str()).map(String::from));

    let now_secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let five_hours_ago = now_secs.saturating_sub(5 * 3600);
    let seven_days_ago = now_secs.saturating_sub(7 * 86400);

    // Un cubo por familia, indexado por `ModelFamily as usize`.
    let mut daily = [0u64; 2];
    let mut weekly = [0u64; 2];
    let mut oldest_5h = [u64::MAX; 2];
    let mut oldest_7d = [u64::MAX; 2];

    let brain_dir = app_data_dir.join("brain");
    if let Ok(entries) = std::fs::read_dir(&brain_dir) {
        for entry in entries.filter_map(|e| e.ok()) {
            let log_file = entry
                .path()
                .join(".system_generated")
                .join("logs")
                .join("transcript.jsonl");
            let meta = match log_file.metadata() {
                Ok(m) => m,
                Err(_) => continue,
            };
            let mtime_secs = meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_secs())
                .unwrap_or(0);
            if mtime_secs <= seven_days_ago {
                continue;
            }

            // 33 MB de transcripts repartidos en ~150 ficheros: sin la cache por
            // mtime+tamano esto se releeria entero cada 2.5 s.
            let file_size = meta.len();
            let fresh = cache
                .file_cache
                .get(&log_file)
                .map_or(false, |c| c.mtime_secs == mtime_secs && c.file_size == file_size);
            if !fresh {
                let (steps, model) = parse_antigravity_file(&log_file, seven_days_ago);
                cache.file_cache.insert(
                    log_file.clone(),
                    CachedFileTokens { mtime_secs, file_size, model, steps },
                );
            }
            let cached = match cache.file_cache.get(&log_file) {
                Some(c) => c,
                None => continue,
            };

            let i = ModelFamily::of(cached.model.as_deref().unwrap_or("")) as usize;
            for &(at, tokens) in &cached.steps {
                if at <= seven_days_ago {
                    continue;
                }
                weekly[i] += tokens;
                oldest_7d[i] = oldest_7d[i].min(at);
                if at > five_hours_ago {
                    daily[i] += tokens;
                    oldest_5h[i] = oldest_5h[i].min(at);
                }
            }
        }
    }

    // Conversacion activa de este proyecto; si no la hay, la ultima tocada.
    let target_conv_id = std::fs::read_to_string(app_data_dir.join("cache").join("last_conversations.json"))
        .ok()
        .and_then(|c| serde_json::from_str::<Value>(&c).ok())
        .and_then(|v| v.get(cwd).and_then(|s| s.as_str()).map(String::from));

    let transcript_path = target_conv_id
        .map(|id| {
            brain_dir
                .join(id)
                .join(".system_generated")
                .join("logs")
                .join("transcript.jsonl")
        })
        .filter(|p| p.exists())
        .or_else(|| find_latest_antigravity_transcript(&brain_dir));

    if let Some(log_file) = transcript_path {
        // El modelo del transcript activo manda sobre la seleccion global.
        if let Some(m) = cache.file_cache.get(&log_file).and_then(|c| c.model.clone()) {
            active_model = Some(m);
        }

        let mut chars_in = 0usize;
        let mut chars_out = 0usize;
        for line in tail(&log_file, 262_144).lines() {
            let val: Value = match serde_json::from_str(line) {
                Ok(v) => v,
                Err(_) => continue,
            };
            match val.get("type").and_then(|v| v.as_str()).unwrap_or("") {
                "USER_INPUT" | "CHECKPOINT" | "GENERIC" => {
                    if let Some(c) = val.get("content").and_then(|v| v.as_str()) {
                        chars_in += c.len();
                    }
                }
                "PLANNER_RESPONSE" => {
                    if let Some(t) = val.get("thinking").and_then(|v| v.as_str()) {
                        chars_out += t.len();
                    }
                    if let Some(calls) = val.get("tool_calls").and_then(|v| v.as_array()) {
                        for tc in calls {
                            if let Some(name) = tc.get("name").and_then(|v| v.as_str()) {
                                metrics.last_action = Some(format!("Tool: {}", name));
                            }
                        }
                        chars_out += serde_json::to_string(calls).map_or(0, |s| s.len());
                    }
                }
                _ => {}
            }
            if let Some(ts) = val.get("created_at").and_then(|v| v.as_str()) {
                metrics.last_timestamp = Some(ts.to_string());
            }
        }
        metrics.tokens_in = (chars_in / 4) as u64;
        metrics.tokens_out = (chars_out / 4) as u64;
    }

    let model = active_model.unwrap_or_else(|| "Gemini".to_string());
    let family = ModelFamily::of(&model);
    let i = family as usize;
    metrics.model = Some(model);
    metrics.context_window = antigravity_context_window(family);

    // Sin relleno: si hoy no se ha hablado con esta familia, la ventana esta a
    // cero y el anillo tiene que salir vacio. Caer al total de la sesion activa
    // era lo que pintaba un 8 % de consumo diario sin haber usado el agente.
    metrics.daily_tokens = daily[i];
    metrics.weekly_tokens = weekly[i];

    let (limit_5h, limit_7d) = antigravity_limits(family);
    metrics.daily_percent = pct_of(metrics.daily_tokens, limit_5h);
    metrics.weekly_percent = pct_of(metrics.weekly_tokens, limit_7d);

    // Ventana vacia: no hay nada que reiniciar, se muestra la ventana entera.
    metrics.reset_daily = window_reset(oldest_5h[i], 5 * 3600, now_secs).or(Some("5h".into()));
    metrics.reset_weekly = window_reset(oldest_7d[i], 7 * 86400, now_secs).or(Some("7d".into()));
    metrics.total_cost_usd = antigravity_cost(&metrics);

    metrics
}

/// Ventana deslizante en segundos. `u64::MAX` = no hay nada en la ventana.
fn window_reset(oldest_secs: u64, window: u64, now_secs: u64) -> Option<String> {
    if oldest_secs == u64::MAX {
        return None;
    }
    Some(quota::humanize((oldest_secs + window).saturating_sub(now_secs)))
}

/// Tarifa segun la familia y el escalon del modelo activo.
fn antigravity_cost(metrics: &UsageMetrics) -> f64 {
    let model = metrics.model.as_deref().unwrap_or("").to_lowercase();
    let (r_in, r_out) = if model.contains("opus") {
        (5.0, 25.0)
    } else if model.contains("claude") {
        (3.0, 15.0) // Sonnet, y default de la familia Claude
    } else if model.contains("pro") {
        (1.25, 5.0)
    } else {
        (0.15, 0.60) // Gemini Flash
    };
    let m = 1_000_000.0;
    (metrics.tokens_in as f64 / m) * r_in + (metrics.tokens_out as f64 / m) * r_out
}

fn find_latest_antigravity_transcript(brain_dir: &Path) -> Option<PathBuf> {
    if let Ok(entries) = std::fs::read_dir(brain_dir) {
        let mut candidates: Vec<PathBuf> = Vec::new();
        for entry in entries.filter_map(|e| e.ok()) {
            let log_file = entry.path().join(".system_generated").join("logs").join("transcript.jsonl");
            if log_file.exists() {
                candidates.push(log_file);
            }
        }
        candidates.sort_by(|a, b| {
            let meta_a = a.metadata().and_then(|m| m.modified()).ok();
            let meta_b = b.metadata().and_then(|m| m.modified()).ok();
            meta_b.cmp(&meta_a)
        });
        return candidates.into_iter().next();
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn turn(id: &str, input: u64, out: u64, cw: u64, cr: u64) -> String {
        format!(
            r#"{{"timestamp":"2026-08-31T17:35:56Z","message":{{"id":"{}","model":"claude-opus-5","usage":{{"input_tokens":{},"output_tokens":{},"cache_creation_input_tokens":{},"cache_read_input_tokens":{}}}}}}}"#,
            id, input, out, cw, cr
        )
    }

    #[test]
    fn accumulates_incrementally_without_double_counting() {
        let path = std::env::temp_dir().join("notch_parser_test.jsonl");
        let _ = std::fs::remove_file(&path);

        let mut f = std::fs::File::create(&path).unwrap();
        writeln!(f, "{}", turn("msg_a", 2, 220, 37137, 0)).unwrap();
        writeln!(f, "{}", turn("msg_a", 2, 220, 37137, 0)).unwrap(); // duplicado
        f.flush().unwrap();

        let mut acc = SessionAccum::default();
        accumulate_session(&mut acc, &path);
        assert_eq!(acc.output, 220, "el duplicado no debe contarse dos veces");
        assert_eq!(acc.cache_write, 37137, "la escritura de cache si se cuenta");
        assert_eq!(acc.context_tokens, 37139);

        // Linea a medio escribir: no se consume hasta que llegue el salto de linea.
        let mut f = std::fs::OpenOptions::new().append(true).open(&path).unwrap();
        write!(f, "{}", turn("msg_b", 5, 100, 0, 40000)).unwrap();
        f.flush().unwrap();
        let offset_before = acc.offset;
        accumulate_session(&mut acc, &path);
        assert_eq!(acc.offset, offset_before, "linea incompleta no se contabiliza");
        assert_eq!(acc.output, 220);

        writeln!(f).unwrap();
        f.flush().unwrap();
        accumulate_session(&mut acc, &path);
        assert_eq!(acc.output, 320, "solo se leen los bytes nuevos");
        assert_eq!(acc.cache_read, 40000);
        assert_eq!(acc.context_tokens, 40005, "el contexto no se suma, se reemplaza");
        assert_eq!(acc.model.as_deref(), Some("Opus 5"));

        // 37137 escritura * 5$ * 1.25 + 40000 lectura * 5$ * 0.1 + 7 in + 320 out.
        let expected = turn_cost("claude-opus-5", 2, 220, 37137, 0)
            + turn_cost("claude-opus-5", 5, 100, 0, 40000);
        assert!((acc.cost_usd - expected).abs() < 1e-9);

        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn codex_reads_cuota_real_del_transcript() {
        let dir = std::env::temp_dir().join("notch_codex_test");
        let day = chrono::Local::now().date_naive();
        let day_dir = dir
            .join(day.format("%Y").to_string())
            .join(day.format("%m").to_string())
            .join(day.format("%d").to_string());
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&day_dir).unwrap();

        // Rollout de otro proyecto, mas reciente: no debe ganar al del cwd.
        let otro = day_dir.join("rollout-2026-09-01T09-00-00-bbb.jsonl");
        std::fs::write(
            &otro,
            "{\"type\":\"session_meta\",\"payload\":{\"cwd\":\"/otro\",\"model\":\"gpt-5-mini\"}}\n",
        )
        .unwrap();

        let mio = day_dir.join("rollout-2026-09-01T10-00-00-aaa.jsonl");
        let mut f = std::fs::File::create(&mio).unwrap();
        writeln!(f, r#"{{"type":"session_meta","payload":{{"cwd":"/proj","model":"gpt-5-codex"}}}}"#).unwrap();
        writeln!(f, r#"{{"type":"response_item","payload":{{"type":"function_call","name":"shell"}}}}"#).unwrap();
        // Acumulado del turno anterior: lo pisa el siguiente, no se suma.
        writeln!(f, r#"{{"type":"event_msg","payload":{{"type":"token_count","info":{{"total_token_usage":{{"input_tokens":1000,"cached_input_tokens":0,"output_tokens":100}},"last_token_usage":{{"total_tokens":1100}},"model_context_window":272000}},"rate_limits":{{"primary":{{"used_percent":10.0,"resets_in_seconds":3600}}}}}}}}"#).unwrap();
        writeln!(f, r#"{{"timestamp":"2026-09-01T10:05:00Z","type":"event_msg","payload":{{"type":"token_count","info":{{"total_token_usage":{{"input_tokens":50000,"cached_input_tokens":40000,"output_tokens":2000}},"last_token_usage":{{"total_tokens":48000}},"model_context_window":272000}},"rate_limits":{{"primary":{{"used_percent":42.4,"resets_in_seconds":11520}},"secondary":{{"used_percent":7.0,"resets_in_seconds":432000}}}}}}}}"#).unwrap();
        f.flush().unwrap();

        // Se elige el rollout cuyo `session_meta` apunta al cwd, no el mas nuevo.
        let m = parse_codex_metrics(&dir, "/proj");
        assert_eq!(m.tokens_in, 50000, "el acumulado se reemplaza, no se suma");
        assert_eq!(m.tokens_out, 2000);
        assert_eq!(m.context_tokens, 48000);
        assert_eq!(m.context_window, 272_000);
        assert_eq!(m.model.as_deref(), Some("Gpt 5 Codex"));
        assert_eq!(m.last_action.as_deref(), Some("Tool: shell"));

        // Cuota real, sin tocar la red.
        assert!(m.quota_live);
        assert_eq!(m.daily_percent, 42);
        assert_eq!(m.weekly_percent, 7);
        assert_eq!(m.reset_daily.as_deref(), Some("3h 12m"));
        assert_eq!(m.reset_weekly.as_deref(), Some("5d 0h"));

        // 10k sin cachear a 1.25 + 40k cacheados a 0.125 + 2k salida a 10.
        let esperado = 0.010 * 1.25 + 0.040 * 0.125 + 0.002 * 10.0;
        assert!((m.total_cost_usd - esperado).abs() < 1e-9);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn antigravity_separa_los_pools_de_gemini_y_claude() {
        // El modelo se declara dentro del `USER_SETTINGS_CHANGE` del transcript.
        let gemini = "<USER_SETTINGS_CHANGE>\nThe user changed setting `Model Selection` \
                      from None to Gemini 3.7 Flash (High). No need to comment on this change.";
        let claude = "The user changed setting `Model Selection` from Gemini 3.7 Flash (High) \
                      to Claude Opus 4.6 (Thinking). No need to comment on this change.";
        assert_eq!(model_selection(gemini).as_deref(), Some("Gemini 3.7 Flash (High)"));
        assert_eq!(model_selection(claude).as_deref(), Some("Claude Opus 4.6 (Thinking)"));
        assert_eq!(model_selection("sin cambio de modelo"), None);

        assert_eq!(ModelFamily::of("Claude Opus 4.6 (Thinking)"), ModelFamily::Claude);
        assert_eq!(ModelFamily::of("Gemini 3.7 Flash (High)"), ModelFamily::Gemini);

        // Cada familia consume su propio pool: los mismos tokens dan
        // porcentajes distintos segun con quien se hablase.
        let (g5, _) = antigravity_limits(ModelFamily::Gemini);
        let (c5, _) = antigravity_limits(ModelFamily::Claude);
        assert!(c5 < g5, "el pool de Claude es mas corto que el de Gemini");
        assert_ne!(pct_of(100_000, g5), pct_of(100_000, c5));
    }

    #[test]
    fn antigravity_no_cuenta_historia_vieja_en_la_ventana_de_5h() {
        // Una conversacion de hace tres dias que hoy se abre un momento: el
        // fichero queda con mtime de ahora, pero sus pasos siguen siendo
        // viejos. Contarlos como consumo de hoy era lo que pintaba un 8 % de
        // uso diario sin haber tocado el agente.
        let path = std::env::temp_dir().join("notch_antigravity_test.jsonl");
        let _ = std::fs::remove_file(&path);

        let now = chrono::Utc::now();
        let paso = |edad_horas: i64, texto: &str| {
            let at = now - chrono::Duration::hours(edad_horas);
            format!(
                r#"{{"type":"USER_INPUT","created_at":"{}","content":"{}"}}"#,
                at.to_rfc3339(),
                texto
            )
        };

        let viejo = "x".repeat(40_000); // 10k tokens de hace 3 dias
        let nuevo = "y".repeat(400); // 100 tokens de hace media hora
        let mut f = std::fs::File::create(&path).unwrap();
        writeln!(f, "{}", paso(72, &viejo)).unwrap();
        writeln!(f, "{}", paso(1, &nuevo)).unwrap();
        f.flush().unwrap();

        let hace_7d = (now.timestamp() - 7 * 86400) as u64;
        let (steps, _) = parse_antigravity_file(&path, hace_7d);
        assert_eq!(steps.len(), 2, "ambos pasos caen dentro de los 7 dias");

        let hace_5h = (now.timestamp() - 5 * 3600) as u64;
        let en_5h: u64 = steps.iter().filter(|(at, _)| *at > hace_5h).map(|(_, t)| t).sum();
        let en_7d: u64 = steps.iter().map(|(_, t)| t).sum();
        assert_eq!(en_5h, 100, "solo el paso reciente entra en la ventana de 5 h");
        assert_eq!(en_7d, 10_100);

        // Un paso sin `created_at` no se puede ubicar, asi que no cuenta.
        let mut f = std::fs::OpenOptions::new().append(true).open(&path).unwrap();
        writeln!(f, r#"{{"type":"USER_INPUT","content":"zzzz"}}"#).unwrap();
        f.flush().unwrap();
        let (steps, _) = parse_antigravity_file(&path, hace_7d);
        assert_eq!(steps.len(), 2, "sin fecha no se inventa una ventana");

        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn opencode_lee_los_totales_de_sqlite() {
        let db = std::env::temp_dir().join("notch_opencode_test.db");
        let _ = std::fs::remove_file(&db);

        let now_ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64;
        // 30 s pasados del borde para que el redondeo no baile con el reloj.
        let hace_1h = now_ms - (3600 + 30) * 1000;
        let hace_3d = now_ms - (3 * 86400 + 30) * 1000;
        let hace_30d = now_ms - 30 * 86400 * 1000;

        let schema = format!(
            "create table session (id text, directory text, model text, cost real, \
             tokens_input int, tokens_output int, tokens_reasoning int, \
             tokens_cache_read int, tokens_cache_write int, time_updated int);\
             insert into session values \
             ('a','/proj','{{\"id\":\"claude-sonnet-5\"}}',0.5,1000,200,50,3000,100,{hace_1h}),\
             ('b','/proj','{{\"id\":\"claude-sonnet-5\"}}',0.1,10,20,0,30,40,{hace_3d}),\
             ('c','/otro','{{\"id\":\"x\"}}',9.9,777,777,0,0,0,{hace_1h}),\
             ('d','/proj','{{\"id\":\"x\"}}',0.0,5,5,0,0,0,{hace_30d});",
        );
        let ok = Command::new("sqlite3")
            .arg(&db)
            .arg(&schema)
            .status()
            .map_or(false, |s| s.success());
        if !ok {
            return; // sin binario sqlite3 no hay nada que comprobar
        }

        let m = parse_opencode_metrics(&db, "/proj");
        // Sesion activa de /proj: la mas reciente, no la de /otro.
        assert_eq!(m.tokens_in, 1000 + 3000 + 100);
        assert_eq!(m.tokens_out, 200 + 50);
        assert!((m.total_cost_usd - 0.5).abs() < 1e-9);
        assert_eq!(m.model.as_deref(), Some("Sonnet 5"));

        // Las ventanas suman **todas** las sesiones, tambien las de /otro, que
        // es lo que de verdad consume la cuenta. La de hace 30 dias queda fuera.
        assert_eq!(m.daily_tokens, 1000 + 200 + 3000 + 100 + 777 + 777);
        assert_eq!(m.weekly_tokens, 1000 + 200 + 3000 + 100 + 777 + 777 + 10 + 20 + 30 + 40);
        assert!(!m.quota_live, "OpenCode no publica cuota: es estimacion");
        assert_eq!(m.reset_daily.as_deref(), Some("3h 59m"));
        assert_eq!(m.reset_weekly.as_deref(), Some("3d 23h"));

        // Sin filas para ese directorio, cero, no panico.
        assert_eq!(parse_opencode_metrics(&db, "/no/existe").tokens_in, 0);

        let _ = std::fs::remove_file(&db);
    }
}
