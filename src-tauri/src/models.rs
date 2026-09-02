use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "lowercase")]
pub enum AgentType {
    Claude,
    Antigravity,
    OpenCode,
    Codex,
    Aider,
    Copilot,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum AgentStatus {
    Running,
    Thinking,
    WaitingInput,
    Idle,
    ToolExecuting,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentSession {
    pub id: String,
    pub pid: u32,
    pub agent_type: AgentType,
    pub name: String,
    pub cwd: String,
    pub project_name: String,
    pub command: String,
    pub status: AgentStatus,
    pub cpu_usage: f32,
    pub memory_mb: f32,
    pub tokens_in: u64,
    pub tokens_out: u64,
    pub daily_tokens: u64,
    pub weekly_tokens: u64,
    /// Porcentaje consumido (no restante) de cada ventana de cuota.
    pub daily_percent: u32,
    pub weekly_percent: u32,
    pub reset_daily: Option<String>,
    pub reset_weekly: Option<String>,
    pub total_cost_usd: f64,
    pub last_active: String,
    pub recent_action: Option<String>,
    pub model_name: Option<String>,
    pub context_window_size: Option<u64>,
    pub context_tokens: Option<u64>,
    /// `false` = los porcentajes son una estimacion local, no la cuota real.
    pub quota_live: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemAgentSummary {
    pub active_count: usize,
    pub total_tokens: u64,
    pub total_cost_usd: f64,
    pub sessions: Vec<AgentSession>,
    pub timestamp: String,
}
