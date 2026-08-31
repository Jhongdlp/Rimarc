import { motion } from "framer-motion";
import { NOTCH, agentColor } from "../design/tokens";
import { AgentIcon } from "./icons/AgentIcon";
import { useTheme } from "../lib/theme";
import type { AgentType } from "../types";

const { size, stroke, icon } = NOTCH.ring;
const RADIUS = (size - stroke) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export interface RingGaugeProps {
  type: AgentType;
  /** 0-100. El arco arranca a las 12 y avanza en sentido horario. */
  percent: number;
}

/**
 * Anillo de consumo. El color del arco corresponde a la identidad visual de
 * cada agente (Claude: naranja, Antigravity: azul, OpenCode: amarillo, etc.).
 */
export function RingGauge({ type, percent }: RingGaugeProps) {
  const { isDark, colors } = useTheme();
  const clamped = Math.max(0, Math.min(100, percent));
  const accent = agentColor(type, isDark);

  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={RADIUS}
            fill="none"
            stroke={colors.track}
            strokeWidth={stroke}
          />
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={RADIUS}
            fill="none"
            stroke={accent}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            initial={false}
            animate={{ strokeDashoffset: CIRCUMFERENCE * (1 - clamped / 100) }}
            transition={{ type: "spring", stiffness: 180, damping: 26 }}
          />
        </g>
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "grid",
          placeItems: "center",
        }}
      >
        <AgentIcon type={type} size={icon} color={colors.icon} />
      </div>
    </div>
  );
}
