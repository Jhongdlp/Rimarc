import { NOTCH, agentColor } from "../design/tokens";
import { AgentIcon } from "./icons/AgentIcon";
import { RadialRingGauge } from "./RadialRingGauge";
import { useTheme } from "../lib/theme";
import type { AgentType } from "../types";

export interface RingGaugeProps {
  type: AgentType;
  /** 0-100. El arco arranca a las 12 y avanza en sentido horario. */
  percent: number;
}

/**
 * Anillo de consumo específico para agentes de IA.
 */
export function RingGauge({ type, percent }: RingGaugeProps) {
  const { isDark, colors } = useTheme();
  const accent = agentColor(type, isDark);

  return (
    <RadialRingGauge
      percent={percent}
      color={accent}
      icon={<AgentIcon type={type} size={NOTCH.ring.icon} color={colors.icon} />}
    />
  );
}
