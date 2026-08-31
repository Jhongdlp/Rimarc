import { useEffect, useState } from "react";
import type { AgentSession, SystemAgentSummary } from "../types";
import { call, inTauri } from "../lib/tauri";

/**
 * Sondea `scan_agents`. Fuera de Tauri devuelve la muestra de la referencia
 * (73 / 21 / 52) para poder comparar el render contra el mockup en el
 * navegador sin levantar el backend.
 */
export function useAgentScan(intervalMs: number): AgentSession[] {
  const [sessions, setSessions] = useState<AgentSession[]>(inTauri ? [] : REFERENCE_SAMPLE);

  useEffect(() => {
    if (!inTauri) return;
    let alive = true;

    const tick = async () => {
      const summary = await call<SystemAgentSummary>("scan_agents");
      if (alive && summary) setSessions(summary.sessions);
    };

    void tick();
    const id = window.setInterval(tick, intervalMs);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [intervalMs]);

  return sessions;
}

const REFERENCE_SAMPLE: AgentSession[] = [
  // Los porcentajes del notch y los dos del panel son los de la referencia.
  sample("claude", "Claude", 73, 11, 146_200, 512_000),
  sample("opencode", "OpenCode", 21, 8, 38_400, 190_500),
  sample("antigravity", "Antigravity", 52, 34, 91_800, 402_300),
];

function sample(
  agent_type: AgentSession["agent_type"],
  name: string,
  daily: number,
  weekly: number,
  dailyTokens: number,
  weeklyTokens: number,
): AgentSession {
  return {
    id: agent_type,
    pid: 0,
    agent_type,
    name,
    cwd: "",
    project_name: name,
    command: "",
    status: "running",
    cpu_usage: 0,
    memory_mb: 0,
    tokens_in: 0,
    tokens_out: 0,
    daily_tokens: dailyTokens,
    weekly_tokens: weeklyTokens,
    daily_percent: daily,
    weekly_percent: weekly,
    reset_daily: "3h 12m",
    reset_weekly: "2d 6h",
    total_cost_usd: 0,
    last_active: "",
    recent_action: null,
    model_name: null,
    context_window_size: null,
    context_tokens: null,
    quota_live: false,
  };
}
