import { DetailPopover } from "../../components/DetailPopover";
import type { AgentSession } from "../../types";
import type { ToolPopoverProps } from "../types";

export function AgentPopover({
  data: sessions,
  anchor,
  open,
  detailIndex,
  onHoverStart,
  onHoverEnd,
}: ToolPopoverProps<AgentSession[]>) {
  const safeIndex = Math.min(detailIndex, Math.max(0, sessions.length - 1));
  const active = sessions[safeIndex];
  if (!active) return null;

  return (
    <DetailPopover
      sessions={sessions}
      index={safeIndex}
      anchor={anchor}
      open={open}
      onHoverStart={onHoverStart}
      onHoverEnd={onHoverEnd}
    />
  );
}
