use std::collections::HashMap;
use std::path::{Path, PathBuf};
use sysinfo::{ProcessesToUpdate, System};
use crate::models::{AgentInstance, AgentSession, AgentStatus, AgentType, SystemAgentSummary};
use crate::parser::{
    claude_pending_tool, parse_antigravity_metrics, parse_claude_project_metrics, parse_codex_metrics,
    parse_opencode_metrics, MetricsCache,
};

pub struct AgentScanner {
    sys: System,
    cache: MetricsCache,
}

impl AgentScanner {
    pub fn new() -> Self {
        let mut sys = System::new();
        sys.refresh_processes(ProcessesToUpdate::All, true);
        Self {
            sys,
            cache: MetricsCache::default(),
        }
    }

    pub fn scan(&mut self) -> SystemAgentSummary {
        self.sys.refresh_processes(ProcessesToUpdate::All, true);

        let mut sessions: Vec<AgentSession> = Vec::new();
        let home_dir = dirs::home_dir().unwrap_or_else(|| PathBuf::from("/home/jhon"));
        let winners = self.pick_one_pid_per_agent();
        let mut instances = self.list_instances(&home_dir);

        for (pid, process) in self.sys.processes() {
            let p_name = process.name().to_string_lossy().to_lowercase();
            let cmd_line = process
                .cmd()
                .iter()
                .map(|s| s.to_string_lossy().to_string())
                .collect::<Vec<_>>()
                .join(" ");

            let agent_info = identify_agent(&p_name, &cmd_line);

            if let Some((agent_type, name)) = agent_info {
                let pid_u32 = pid.as_u32();
                let cwd = get_process_cwd(pid_u32).unwrap_or_else(|| {
                    process
                        .cwd()
                        .map(|p| p.to_string_lossy().to_string())
                        .unwrap_or_else(|| home_dir.to_string_lossy().to_string())
                });

                // Un solo gauge por agente, aunque corra en varias carpetas
                if winners.get(&format!("{:?}", agent_type)) != Some(&pid_u32) {
                    continue;
                }

                let project_name = Path::new(&cwd)
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_else(|| "General".to_string());

                let cpu = process.cpu_usage();
                let mem_mb = (process.memory() as f32) / (1024.0 * 1024.0);

                let status = cpu_status(cpu);

                // Fetch metrics from storage with cache
                let m = match agent_type {
                    AgentType::Claude => {
                        let safe_encoded = cwd.replace('/', "-");
                        let project_path = home_dir.join(".claude").join("projects").join(&safe_encoded);
                        parse_claude_project_metrics(&mut self.cache, &project_path)
                    }
                    AgentType::Codex => {
                        let sessions = home_dir.join(".codex").join("sessions");
                        parse_codex_metrics(&sessions, &cwd)
                    }
                    AgentType::OpenCode => {
                        let db = home_dir
                            .join(".local/share/opencode")
                            .join("opencode.db");
                        parse_opencode_metrics(&db, &cwd)
                    }
                    AgentType::Antigravity => {
                        let app_data = home_dir.join(".gemini").join("antigravity-cli");
                        parse_antigravity_metrics(&mut self.cache, &app_data, &cwd, 700_000, 3_800_000)
                    }
                    _ => crate::parser::UsageMetrics::default(),
                };

                let id_key = format!("{:?}", agent_type);
                let now_str = chrono::Local::now().format("%H:%M:%S").to_string();

                // Codex y Antigravity publican la ventana del modelo activo;
                // el resto usa la de su familia.
                let context_cap = if m.context_window > 0 {
                    m.context_window
                } else {
                    200_000
                };
                // Contexto real del ultimo turno; para Antigravity aun no hay dato
                // por turno, asi que cae al total estimado de la sesion.
                let ctx_tokens = if m.context_tokens > 0 {
                    m.context_tokens
                } else {
                    m.tokens_in + m.tokens_out
                };

                sessions.push(AgentSession {
                    // Un gauge por agente y de por vida: la clave no puede llevar
                    // el pid. El proceso "mas ocupado" baila entre el binario y su
                    // helper de un escaneo a otro, y con el pid dentro React
                    // remontaba el anillo — el micro salto cada 3 s. El pid sigue
                    // en su campo.
                    id: id_key.clone(),
                    pid: pid_u32,
                    agent_type,
                    name,
                    cwd,
                    project_name,
                    command: if cmd_line.len() > 60 {
                        format!("{}...", &cmd_line[..57])
                    } else {
                        cmd_line
                    },
                    status,
                    cpu_usage: (cpu * 10.0).round() / 10.0,
                    memory_mb: (mem_mb * 10.0).round() / 10.0,
                    tokens_in: m.tokens_in,
                    tokens_out: m.tokens_out,
                    daily_tokens: m.daily_tokens,
                    weekly_tokens: m.weekly_tokens,
                    daily_percent: m.daily_percent,
                    weekly_percent: m.weekly_percent,
                    reset_daily: m.reset_daily,
                    reset_weekly: m.reset_weekly,
                    total_cost_usd: (m.total_cost_usd * 1000.0).round() / 1000.0,
                    last_active: m.last_timestamp.unwrap_or(now_str),
                    recent_action: m.last_action.or(Some("Active Session".to_string())),
                    model_name: m.model,
                    context_window_size: Some(context_cap),
                    context_tokens: Some(ctx_tokens),
                    quota_live: m.quota_live,
                    instances: instances.remove(&id_key).unwrap_or_default(),
                });
            }
        }

        // Orden determinista y estable para que las posiciones no bailen
        // entre escaneos cuando hay múltiples agentes corriendo.
        sessions.sort_by(|a, b| a.agent_type.cmp(&b.agent_type).then_with(|| a.id.cmp(&b.id)));

        let total_tokens: u64 = sessions.iter().map(|s| s.tokens_in + s.tokens_out).sum();
        let total_cost: f64 = sessions.iter().map(|s| s.total_cost_usd).sum();
        let active_count = sessions.len();

        SystemAgentSummary {
            active_count,
            total_tokens,
            total_cost_usd: (total_cost * 1000.0).round() / 1000.0,
            sessions,
            timestamp: chrono::Local::now().to_rfc3339(),
        }
    }

    pub fn get_system_stats(&mut self) -> crate::models::SystemMetrics {
        self.sys.refresh_cpu_usage();
        self.sys.refresh_memory();
        let cpu_percent = (self.sys.global_cpu_usage() * 10.0).round() / 10.0;
        let memory_used_mb = self.sys.used_memory() / (1024 * 1024);
        let memory_total_mb = self.sys.total_memory() / (1024 * 1024);
        let memory_percent = if memory_total_mb > 0 {
            ((memory_used_mb as f32 / memory_total_mb as f32) * 1000.0).round() / 10.0
        } else {
            0.0
        };
        let uptime_secs = sysinfo::System::uptime();
        crate::models::SystemMetrics {
            cpu_percent,
            memory_used_mb,
            memory_total_mb,
            memory_percent,
            uptime_secs,
        }
    }

    /// Todas las instancias vivas de cada tipo de agente. Se saltan hilos y
    /// procesos hijos de otro agente del mismo tipo (helpers, servidores MCP):
    /// solo cuenta la raiz de cada sesion.
    fn list_instances(&mut self, home: &Path) -> HashMap<String, Vec<AgentInstance>> {
        let identify = |p: &sysinfo::Process| {
            let cmd = p
                .cmd()
                .iter()
                .map(|s| s.to_string_lossy().to_string())
                .collect::<Vec<_>>()
                .join(" ");
            identify_agent(&p.name().to_string_lossy().to_lowercase(), &cmd).map(|(t, _)| t)
        };

        let mut out: HashMap<String, Vec<AgentInstance>> = HashMap::new();
        for (pid, process) in self.sys.processes() {
            if process.thread_kind().is_some() {
                continue;
            }
            let Some(agent_type) = identify(process) else { continue };
            let parent_same = process
                .parent()
                .and_then(|pp| self.sys.process(pp))
                .and_then(|pp| identify(pp))
                .map_or(false, |t| t == agent_type);
            if parent_same {
                continue;
            }

            let pid = pid.as_u32();
            let cwd = get_process_cwd(pid)
                .or_else(|| process.cwd().map(|p| p.to_string_lossy().to_string()))
                .unwrap_or_default();
            let status = match agent_type {
                AgentType::Claude => claude_status(&mut self.cache, home, pid),
                _ => None,
            }
            .unwrap_or_else(|| cpu_status(process.cpu_usage()));

            out.entry(format!("{:?}", agent_type)).or_default().push(AgentInstance {
                pid,
                project_name: Path::new(&cwd)
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_else(|| "General".to_string()),
                cwd,
                status,
            });
        }
        for list in out.values_mut() {
            list.sort_by_key(|i| i.pid);
        }
        out
    }

    /// Un proceso por tipo de agente: el mas ocupado, y a igualdad de CPU el pid
    /// mas bajo, para que la eleccion no baile entre escaneos.
    fn pick_one_pid_per_agent(&self) -> HashMap<String, u32> {
        let mut best: HashMap<String, (u32, f32)> = HashMap::new();
        for (pid, process) in self.sys.processes() {
            let p_name = process.name().to_string_lossy().to_lowercase();
            let cmd_line = process
                .cmd()
                .iter()
                .map(|s| s.to_string_lossy().to_string())
                .collect::<Vec<_>>()
                .join(" ");
            if let Some((agent_type, _)) = identify_agent(&p_name, &cmd_line) {
                let pid = pid.as_u32();
                let cpu = process.cpu_usage();
                let key = format!("{:?}", agent_type);
                let win = match best.get(&key) {
                    Some(&(bpid, bcpu)) => cpu > bcpu || (cpu == bcpu && pid < bpid),
                    None => true,
                };
                if win {
                    best.insert(key, (pid, cpu));
                }
            }
        }
        best.into_iter().map(|(k, (pid, _))| (k, pid)).collect()
    }
}

fn identify_agent(name: &str, cmd: &str) -> Option<(AgentType, String)> {
    let lower_cmd = cmd.to_lowercase();
    let lower_name = name.to_lowercase();

    // Prevent matching self. El binario paso a llamarse `rimarc`; los nombres
    // viejos siguen aqui por si queda una build antigua corriendo.
    const SELF: [&str; 3] = ["rimarc", "tauri-app", "agentnotch"];
    if SELF.contains(&lower_name.as_str())
        || SELF.iter().any(|n| {
            lower_cmd.contains(&format!("target/debug/{}", n))
                || lower_cmd.contains(&format!("target/release/{}", n))
        })
    {
        return None;
    }

    // Check Claude Code (standalone binary, npm package, or node script)
    if lower_name == "claude"
        || lower_cmd.contains("@anthropic-ai/claude-code")
        || lower_cmd.contains("/bin/claude")
        || (lower_name == "node" && lower_cmd.contains("claude"))
    {
        Some((AgentType::Claude, "Claude Code".to_string()))
    }
    // Check Codex CLI (binario nativo o el paquete npm)
    else if lower_name == "codex"
        || lower_cmd.contains("@openai/codex")
        || lower_cmd.contains("/bin/codex")
        || (lower_name == "node" && lower_cmd.contains("codex"))
    {
        Some((AgentType::Codex, "Codex CLI".to_string()))
    }
    // Check Antigravity / Gemini CLI
    else if lower_name == "agy"
        || lower_cmd.contains("antigravity-cli")
        || lower_cmd.contains("/bin/agy")
        || (lower_name == "node" && lower_cmd.contains("antigravity"))
    {
        Some((AgentType::Antigravity, "Antigravity (AGY)".to_string()))
    }
    // Check OpenCode
    else if lower_name == "opencode" || lower_cmd.contains("/bin/opencode") {
        Some((AgentType::OpenCode, "OpenCode".to_string()))
    }
    // Check Aider
    else if lower_name == "aider" || lower_cmd.contains("bin/aider") || (lower_name.starts_with("python") && lower_cmd.contains("aider")) {
        Some((AgentType::Aider, "Aider".to_string()))
    }
    else {
        None
    }
}

fn cpu_status(cpu: f32) -> AgentStatus {
    if cpu > 5.0 {
        AgentStatus::Thinking
    } else if cpu > 0.5 {
        AgentStatus::Running
    } else {
        // Sin fuente de estado real no se sabe si espera o ya acabo.
        AgentStatus::Idle
    }
}

/// Estado real de una instancia de Claude Code: `~/.claude/sessions/<pid>.json`
/// dice si esta ocupada, y la herramienta pendiente de su transcript en que.
fn claude_status(cache: &mut MetricsCache, home: &Path, pid: u32) -> Option<AgentStatus> {
    let raw = std::fs::read_to_string(home.join(".claude/sessions").join(format!("{pid}.json"))).ok()?;
    let v: serde_json::Value = serde_json::from_str(&raw).ok()?;
    let busy = v.get("status")?.as_str()?;
    let transcript = home
        .join(".claude/projects")
        .join(v.get("cwd")?.as_str()?.replace('/', "-"))
        .join(format!("{}.jsonl", v.get("sessionId")?.as_str()?));
    let pending = claude_pending_tool(cache, &transcript);

    Some(match (busy, pending.as_deref()) {
        (_, Some("AskUserQuestion" | "ExitPlanMode")) => AgentStatus::WaitingInput,
        ("busy", Some("Edit" | "Write" | "MultiEdit" | "NotebookEdit")) => AgentStatus::Editing,
        ("busy", Some(_)) => AgentStatus::ToolExecuting,
        ("busy", None) => AgentStatus::Thinking,
        ("idle", _) => AgentStatus::Done,
        // Cualquier otro estado (permiso pendiente, etc.) espera al usuario.
        _ => AgentStatus::WaitingInput,
    })
}

fn get_process_cwd(pid: u32) -> Option<String> {
    #[cfg(target_os = "linux")]
    {
        let link = format!("/proc/{}/cwd", pid);
        std::fs::read_link(link)
            .ok()
            .map(|p| p.to_string_lossy().to_string())
    }
    #[cfg(not(target_os = "linux"))]
    {
        None
    }
}
