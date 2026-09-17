import { Bot } from "lucide-react";
import { MAX_ITEMS, agentColor } from "../../design/tokens";
import { notchHeight } from "../../lib/notchGeometry";
import { useAgentScan, sortSessions } from "../../hooks/useAgentScan";
import type { AgentSession } from "../../types";
import type { NotchTool } from "../types";
import { AgentBar } from "./AgentBar";
import { AgentPopover } from "./AgentPopover";

const SCAN_INTERVAL_MS = 2500;

function useAgentSessions(): AgentSession[] {
  const raw = useAgentScan(SCAN_INTERVAL_MS);
  return sortSessions(raw).slice(0, MAX_ITEMS);
}

export const agentMonitorTool: NotchTool<AgentSession[]> = {
  id: "ai-agents",
  name: "Monitor de Agentes IA",
  tagline: "Claude Code, Antigravity, OpenCode, Codex",
  description:
    "Monitoreo en tiempo real de sesiones de programación con IA, consumo de cuota diaria/semanal, tokens y accesos rápidos.",
  version: "1.0.0",
  author: "Rimarc Core",
  category: "ai",
  badge: "Oficial",
  en: {
    name: "AI Agent Monitor",
    tagline: "Claude Code, Antigravity, OpenCode, Codex",
    description: "Real-time monitoring of AI coding sessions, daily/weekly quota usage, tokens and quick shortcuts.",
    badge: "Official",
  },
  icon: Bot,
  thumbnail: "/miniature/ai-agents.webp",

  useData: useAgentSessions,

  getNotchHeight: (sessions) => notchHeight(sessions.length),

  getDots: (sessions, isDark) =>
    sessions.map((s) => agentColor(s.agent_type, isDark)),

  isEmpty: (sessions) => sessions.length === 0,

  renderBar: (props) => <AgentBar {...props} />,

  renderPopover: (props) => <AgentPopover {...props} />,
};
