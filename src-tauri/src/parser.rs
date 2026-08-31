use std::collections::{HashMap, HashSet};
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use serde_json::Value;

use crate::quota;

#[derive(Debug, Clone, Default)]
pub struct CachedFileTokens {
    pub mtime_secs: u64,
    pub file_size: u64,
    pub tokens: u64,
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

pub fn parse_antigravity_file_tokens(path: &Path) -> u64 {
    let mut file_tokens = 0u64;
    if let Ok(content) = std::fs::read_to_string(path) {
        let mut file_chars = 0usize;
        for line in content.lines() {
            if let Ok(val) = serde_json::from_str::<Value>(line) {
                let c_len = val.get("content").and_then(|v| v.as_str()).map(|s| s.len()).unwrap_or(0);
                let th_len = val.get("thinking").and_then(|v| v.as_str()).map(|s| s.len()).unwrap_or(0);
                file_chars += c_len + th_len;
            }
        }
        file_tokens = (file_chars / 4) as u64;
    }
    file_tokens
}

/// ponytail: Antigravity no escribe tokens ni cuota en ninguna parte, asi que
/// todo aqui es estimacion (chars/4 sobre transcripts, ventanas por mtime de
/// fichero) y sale marcada con `quota_live: false`. Si Google expone una API de
/// cuota como la de Anthropic, esta funcion se reduce a lo mismo que Claude.
pub fn parse_antigravity_metrics(
    cache: &mut MetricsCache,
    app_data_dir: &Path,
    cwd: &str,
    _daily_limit: u64,
    _weekly_limit: u64,
) -> UsageMetrics {
    // Specifically calibrated for Gemini models (Gemini Flash & Gemini Pro):
    // Standard Gemini 5-hour rate window: ~575k tokens
    // Standard Gemini 7-day weekly pool: ~3.55M tokens
    let gemini_5h_limit: f64 = 575_000.0;
    let gemini_weekly_limit: f64 = 3_550_000.0;

    let mut metrics = UsageMetrics {
        model: Some("Gemini 3.7 Flash".to_string()),
        ..Default::default()
    };

    let settings_file = app_data_dir.join("settings.json");
    if let Ok(content) = std::fs::read_to_string(&settings_file) {
        if let Ok(val) = serde_json::from_str::<Value>(&content) {
            if let Some(m) = val.get("model").and_then(|v| v.as_str()) {
                metrics.model = Some(m.to_string());
            }
        }
    }

    let now_secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let five_hours_ago = now_secs.saturating_sub(5 * 3600);
    let seven_days_ago = now_secs.saturating_sub(7 * 86400);

    let brain_dir = app_data_dir.join("brain");
    let mut timestamps_5h: Vec<u64> = Vec::new();
    let mut timestamps_7d: Vec<u64> = Vec::new();

    // 1. Compute rolling 5h quota tokens and 7d weekly tokens across brain transcripts for Gemini with cache
    if let Ok(entries) = std::fs::read_dir(&brain_dir) {
        for entry in entries.filter_map(|e| e.ok()) {
            let log_file = entry.path().join(".system_generated").join("logs").join("transcript.jsonl");
            if log_file.exists() {
                if let Ok(meta) = log_file.metadata() {
                    if let Ok(mtime) = meta.modified() {
                        let mtime_secs = mtime
                            .duration_since(UNIX_EPOCH)
                            .unwrap_or_default()
                            .as_secs();

                        if mtime_secs > seven_days_ago {
                            let file_size = meta.len();
                            let tokens = if let Some(cached) = cache.file_cache.get(&log_file) {
                                if cached.mtime_secs == mtime_secs && cached.file_size == file_size {
                                    cached.tokens
                                } else {
                                    let tok = parse_antigravity_file_tokens(&log_file);
                                    cache.file_cache.insert(log_file.clone(), CachedFileTokens {
                                        mtime_secs,
                                        file_size,
                                        tokens: tok,
                                    });
                                    tok
                                }
                            } else {
                                let tok = parse_antigravity_file_tokens(&log_file);
                                cache.file_cache.insert(log_file.clone(), CachedFileTokens {
                                    mtime_secs,
                                    file_size,
                                    tokens: tok,
                                });
                                tok
                            };

                            metrics.weekly_tokens += tokens;
                            timestamps_7d.push(mtime_secs);

                            if mtime_secs > five_hours_ago {
                                metrics.daily_tokens += tokens;
                                timestamps_5h.push(mtime_secs);
                            }
                        }
                    }
                }
            }
        }
    }

    // 2. Identify active conversation for the current project CWD
    let mut target_conv_id: Option<String> = None;
    let last_conv_file = app_data_dir.join("cache").join("last_conversations.json");
    if let Ok(content) = std::fs::read_to_string(&last_conv_file) {
        if let Ok(val) = serde_json::from_str::<Value>(&content) {
            if let Some(id_val) = val.get(cwd).and_then(|v| v.as_str()) {
                target_conv_id = Some(id_val.to_string());
            }
        }
    }

    let transcript_path: Option<PathBuf> = if let Some(ref conv_id) = target_conv_id {
        let p = brain_dir.join(conv_id).join(".system_generated").join("logs").join("transcript.jsonl");
        if p.exists() {
            Some(p)
        } else {
            find_latest_antigravity_transcript(&brain_dir)
        }
    } else {
        find_latest_antigravity_transcript(&brain_dir)
    };

    if let Some(log_file) = transcript_path {
        if let Ok(mut file) = File::open(&log_file) {
            let file_len = file.metadata().map(|m| m.len()).unwrap_or(0);
            let read_len = std::cmp::min(file_len, 262_144);
            let seek_pos = file_len.saturating_sub(read_len);
            let _ = file.seek(SeekFrom::Start(seek_pos));

            let mut buffer = Vec::with_capacity(read_len as usize);
            let _ = file.read_to_end(&mut buffer);

            let content = String::from_utf8_lossy(&buffer);
            let mut total_chars_in: usize = 0;
            let mut total_chars_out: usize = 0;

            for line in content.lines() {
                if let Ok(val) = serde_json::from_str::<Value>(line) {
                    let step_type = val.get("type").and_then(|v| v.as_str()).unwrap_or("");

                    if step_type == "USER_INPUT" || step_type == "CHECKPOINT" || step_type == "GENERIC" {
                        if let Some(c) = val.get("content").and_then(|v| v.as_str()) {
                            total_chars_in += c.len();
                        }
                    } else if step_type == "PLANNER_RESPONSE" {
                        if let Some(thinking) = val.get("thinking").and_then(|v| v.as_str()) {
                            total_chars_out += thinking.len();
                        }
                        if let Some(tool_calls) = val.get("tool_calls").and_then(|v| v.as_array()) {
                            for tc in tool_calls {
                                if let Some(name) = tc.get("name").and_then(|v| v.as_str()) {
                                    metrics.last_action = Some(format!("Tool: {}", name));
                                }
                            }
                            total_chars_out += serde_json::to_string(tool_calls).map(|s| s.len()).unwrap_or(0);
                        }
                    }

                    if let Some(ts) = val.get("created_at").and_then(|v| v.as_str()) {
                        metrics.last_timestamp = Some(ts.to_string());
                    }
                }
            }

            metrics.tokens_in = (total_chars_in / 4) as u64;
            metrics.tokens_out = (total_chars_out / 4) as u64;
        }
    }

    if metrics.daily_tokens == 0 {
        metrics.daily_tokens = metrics.tokens_in + metrics.tokens_out;
    }
    if metrics.weekly_tokens == 0 {
        metrics.weekly_tokens = metrics.daily_tokens;
    }

    let used_daily = ((metrics.daily_tokens as f64 / gemini_5h_limit) * 100.0).round().min(100.0) as u32;
    let used_weekly = ((metrics.weekly_tokens as f64 / gemini_weekly_limit) * 100.0).round().min(100.0) as u32;

    metrics.daily_percent = used_daily;
    metrics.weekly_percent = used_weekly;

    if let Some(&oldest_5h) = timestamps_5h.iter().min() {
        let remaining_5h_secs = (oldest_5h + 5 * 3600).saturating_sub(now_secs);
        let m = remaining_5h_secs / 60;
        let h = m / 60;
        let m_rem = m % 60;
        if h > 0 {
            metrics.reset_daily = Some(format!("{}h {}m", h, m_rem));
        } else {
            metrics.reset_daily = Some(format!("{}m", m_rem.max(1)));
        }
    } else {
        metrics.reset_daily = Some("5h".to_string());
    }

    if let Some(&oldest_7d) = timestamps_7d.iter().min() {
        let remaining_7d_secs = (oldest_7d + 7 * 86400).saturating_sub(now_secs);
        let h = remaining_7d_secs / 3600;
        let m = (remaining_7d_secs % 3600) / 60;
        metrics.reset_weekly = Some(format!("{}h {}m", h, m));
    } else {
        metrics.reset_weekly = Some("7d".to_string());
    }

    let model_lower = metrics.model.as_deref().unwrap_or("").to_lowercase();
    if model_lower.contains("pro") {
        metrics.total_cost_usd = ((metrics.tokens_in as f64 / 1_000_000.0) * 1.25)
            + ((metrics.tokens_out as f64 / 1_000_000.0) * 5.0);
    } else if model_lower.contains("claude") {
        metrics.total_cost_usd = ((metrics.tokens_in as f64 / 1_000_000.0) * 3.0)
            + ((metrics.tokens_out as f64 / 1_000_000.0) * 15.0);
    } else {
        metrics.total_cost_usd = ((metrics.tokens_in as f64 / 1_000_000.0) * 0.15)
            + ((metrics.tokens_out as f64 / 1_000_000.0) * 0.60);
    }

    metrics
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
}
