use std::collections::HashSet;
use std::path::{Path, PathBuf};
use sysinfo::{ProcessesToUpdate, System};
use crate::models::{AgentSession, AgentStatus, AgentType, SystemAgentSummary};
use crate::parser::{parse_antigravity_metrics, parse_claude_project_metrics, MetricsCache};

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
        let mut seen_cwds: HashSet<String> = HashSet::new();
        let home_dir = dirs::home_dir().unwrap_or_else(|| PathBuf::from("/home/jhon"));

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

                // Deduplicate multi-process/threads for the same agent in the same folder
                let dedupe_key = format!("{:?}:{}", agent_type, cwd);
                if seen_cwds.contains(&dedupe_key) {
                    continue;
                }
                seen_cwds.insert(dedupe_key);

                let project_name = Path::new(&cwd)
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_else(|| "General".to_string());

                let cpu = process.cpu_usage();
                let mem_mb = (process.memory() as f32) / (1024.0 * 1024.0);

                let status = if cpu > 5.0 {
                    AgentStatus::Thinking
                } else if cpu > 0.5 {
                    AgentStatus::Running
                } else {
                    AgentStatus::WaitingInput
                };

                // Fetch metrics from storage with cache
                let m = match agent_type {
                    AgentType::Claude => {
                        let safe_encoded = cwd.replace('/', "-");
                        let project_path = home_dir.join(".claude").join("projects").join(&safe_encoded);
                        parse_claude_project_metrics(&mut self.cache, &project_path)
                    }
                    AgentType::Antigravity => {
                        let app_data = home_dir.join(".gemini").join("antigravity-cli");
                        parse_antigravity_metrics(&mut self.cache, &app_data, &cwd, 700_000, 3_800_000)
                    }
                    _ => crate::parser::UsageMetrics::default(),
                };

                let now_str = chrono::Local::now().format("%H:%M:%S").to_string();

                let context_cap = match agent_type {
                    AgentType::Antigravity => 1_000_000,
                    AgentType::Claude => 200_000,
                    _ => 200_000,
                };
                // Contexto real del ultimo turno; para Antigravity aun no hay dato
                // por turno, asi que cae al total estimado de la sesion.
                let ctx_tokens = if m.context_tokens > 0 {
                    m.context_tokens
                } else {
                    m.tokens_in + m.tokens_out
                };

                sessions.push(AgentSession {
                    id: format!("{}-{}", pid_u32, name),
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
                });
            }
        }

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
}

fn identify_agent(name: &str, cmd: &str) -> Option<(AgentType, String)> {
    let lower_cmd = cmd.to_lowercase();
    let lower_name = name.to_lowercase();

    // Prevent matching self (Notch app)
    if lower_name == "tauri-app" || lower_name.contains("agentnotch") || lower_cmd.contains("target/debug/tauri-app") || lower_cmd.contains("target/release/tauri-app") {
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
