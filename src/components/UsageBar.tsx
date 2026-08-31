import { motion } from "framer-motion";
import { POPOVER, accentFor } from "../design/tokens";
import { useTheme } from "../lib/theme";

/**
 * Barra de consumo del panel. Track y relleno comparten alto y extremos
 * redondeados; el color del relleno sale de la misma escala de severidad que
 * los anillos, que es lo que hace la referencia (naranja arriba, verde abajo).
 */
export function UsageBar({
  percent,
  width,
  color,
}: {
  percent: number;
  width: number;
  color?: string;
}) {
  const { isDark, colors } = useTheme();
  const clamped = Math.max(0, Math.min(100, percent));
  const h = POPOVER.barHeight;
  const filled = (width * clamped) / 100;
  const barColor = color ?? accentFor(clamped, isDark);

  return (
    <svg width={width} height={h} viewBox={`0 0 ${width} ${h}`} style={{ display: "block" }}>
      <rect x={0} y={0} width={width} height={h} rx={h / 2} fill={colors.track} />
      {clamped > 0 && (
        <motion.rect
          x={0}
          y={0}
          height={h}
          rx={h / 2}
          fill={barColor}
          initial={false}
          animate={{ width: Math.max(filled, h) }}
          transition={{ type: "spring", stiffness: 200, damping: 28 }}
        />
      )}
    </svg>
  );
}
