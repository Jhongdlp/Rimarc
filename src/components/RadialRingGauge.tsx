import { type ReactNode } from "react";
import { motion } from "framer-motion";
import { NOTCH } from "../design/tokens";
import { useTheme } from "../lib/theme";

const { size: DEFAULT_SIZE, stroke: DEFAULT_STROKE } = NOTCH.ring;

export interface RadialRingGaugeProps {
  /** Porcentaje 0-100. El arco arranca a las 12 y avanza en sentido horario. */
  percent: number;
  /** Color del arco de progreso. */
  color: string;
  /** Icono o contenido centrado. */
  icon?: ReactNode;
  /** Diámetro exterior (px). Por defecto 38px. */
  size?: number;
  /** Grosor del trazo (px). Por defecto 4.5px. */
  stroke?: number;
}

/**
 * Anillo radial reutilizable para cualquier herramienta/widget de la isla/notch.
 */
export function RadialRingGauge({
  percent,
  color,
  icon,
  size = DEFAULT_SIZE,
  stroke = DEFAULT_STROKE,
}: RadialRingGaugeProps) {
  const { colors } = useTheme();
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, percent));

  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={colors.track}
            strokeWidth={stroke}
          />
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={false}
            animate={{ strokeDashoffset: circumference * (1 - clamped / 100) }}
            transition={{ type: "spring", stiffness: 180, damping: 26 }}
          />
        </g>
      </svg>
      {icon && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
          }}
        >
          {icon}
        </div>
      )}
    </div>
  );
}
