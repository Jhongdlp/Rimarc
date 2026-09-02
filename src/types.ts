// Espejo exacto de src-tauri/src/models.rs (serde rename_all = "lowercase").
// Mantener sincronizado a mano si cambian los structs de Rust.

export type AgentType =
  | "claude"
  | "antigravity"
  | "opencode"
  | "codex"
  | "aider"
  | "copilot"
  | "unknown";

export type AgentStatus =
  | "running"
  | "thinking"
  | "waitinginput"
  | "idle"
  | "toolexecuting";

export interface AgentSession {
  id: string;
  pid: number;
  agent_type: AgentType;
  name: string;
  cwd: string;
  project_name: string;
  command: string;
  status: AgentStatus;
  cpu_usage: number;
  memory_mb: number;
  tokens_in: number;
  tokens_out: number;
  daily_tokens: number;
  weekly_tokens: number;
  /** Porcentaje consumido (no restante) de cada ventana de cuota. */
  daily_percent: number;
  weekly_percent: number;
  reset_daily: string | null;
  reset_weekly: string | null;
  total_cost_usd: number;
  last_active: string;
  recent_action: string | null;
  model_name: string | null;
  context_window_size: number | null;
  context_tokens: number | null;
  /** false = los porcentajes son estimacion local, no la cuota real de la cuenta. */
  quota_live: boolean;
}

export interface SystemAgentSummary {
  active_count: number;
  total_tokens: number;
  total_cost_usd: number;
  sessions: AgentSession[];
  timestamp: string;
}
