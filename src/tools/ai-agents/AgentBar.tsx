import { AnimatePresence, motion } from "framer-motion";
import { NOTCH, type ThemeColors } from "../../design/tokens";
import { ringCenterY } from "../../lib/notchGeometry";
import { RingGauge } from "../../components/RingGauge";
import type { AgentSession } from "../../types";
import type { ToolBarProps } from "../types";

export function AgentBar({
  data: sessions,
  angle,
  colors,
  onOpenDetail,
  onCloseDetail,
}: ToolBarProps<AgentSession[]>) {
  return (
    <AnimatePresence initial={false}>
      {sessions.map((session, i) => (
        <AgentSlot
          key={session.id}
          session={session}
          centerY={ringCenterY(i)}
          angle={angle}
          colors={colors}
          onHoverStart={() => onOpenDetail(i)}
          onHoverEnd={onCloseDetail}
        />
      ))}
    </AnimatePresence>
  );
}

function AgentSlot({
  session,
  centerY,
  angle,
  colors,
  onHoverStart,
  onHoverEnd,
}: {
  session: AgentSession;
  centerY: number;
  angle: number;
  colors: ThemeColors;
  onHoverStart: () => void;
  onHoverEnd: () => void;
}) {
  const percent = Math.round(session.daily_percent ?? 0);
  const upright = `rotate(${-angle}deg)`;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      transition={{ type: "spring", stiffness: 380, damping: 30 }}
      style={{
        position: "absolute",
        top: centerY - NOTCH.ring.size / 2,
        left: 0,
        width: NOTCH.depth,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        pointerEvents: "none",
      }}
    >
      <div
        style={{ pointerEvents: "auto", transform: upright }}
        onMouseEnter={onHoverStart}
        onMouseLeave={onHoverEnd}
      >
        <RingGauge type={session.agent_type} percent={percent} />
      </div>
      <span
        style={{
          position: "absolute",
          top: NOTCH.ring.size / 2 + NOTCH.labelOffset,
          left: "50%",
          transform: `translate(-50%, -50%) ${upright}`,
          fontFamily: NOTCH.label.family,
          fontSize: NOTCH.label.size,
          fontWeight: NOTCH.label.weight,
          letterSpacing: NOTCH.label.tracking,
          lineHeight: 1,
          color: colors.label,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {percent}%
      </span>
    </motion.div>
  );
}
