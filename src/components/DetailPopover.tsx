import { POPOVER, COLOR } from "../design/tokens";
import { popoverHeight } from "../lib/popoverPath";
import { Popover, PopoverHeader } from "./Popover";
import { AgentIcon } from "./icons/AgentIcon";
import { UsageBar } from "./UsageBar";
import { useI18n, type Strings } from "../lib/i18n";
import type { AgentSession } from "../types";

const CONTENT_W = POPOVER.width - POPOVER.padX * 2;

export interface DetailPopoverProps {
  session: AgentSession;
  /** Y del centro del anillo al que apunta la cola, en coordenadas del stage. */
  anchorY: number;
  notchLeft: number;
  open: boolean;
  onHoverStart: () => void;
  onHoverEnd: () => void;
}

/** Panel de detalle de un agente: cuota diaria y semanal. */
export function DetailPopover({
  session,
  anchorY,
  notchLeft,
  open,
  onHoverStart,
  onHoverEnd,
}: DetailPopoverProps) {
  const { t } = useI18n();
  const sections = buildSections(session, t);

  return (
    <Popover
      anchorY={anchorY}
      notchLeft={notchLeft}
      height={popoverHeight(sections.length)}
      open={open}
      onHoverStart={onHoverStart}
      onHoverEnd={onHoverEnd}
    >
      <PopoverHeader
        icon={<AgentIcon type={session.agent_type} size={POPOVER.icon} />}
        title={t.usage(session.name)}
      />

      {sections.map((section, i) => {
        const rowY = POPOVER.sectionFirst + i * POPOVER.sectionPitch;
        return (
          <div key={section.label}>
            <Row y={rowY} label={section.label} value={section.value} />
            <div
              style={{
                position: "absolute",
                top: rowY + POPOVER.rowToBar - POPOVER.barHeight / 2,
                left: 0,
              }}
            >
              <UsageBar percent={section.percent} width={CONTENT_W} />
            </div>
            <span
              style={{
                position: "absolute",
                top: rowY + POPOVER.rowToBar + POPOVER.barToCaption,
                left: 0,
                transform: "translateY(-50%)",
                fontSize: POPOVER.text.caption,
                fontWeight: 500,
                lineHeight: 1,
                color: COLOR.detailCaption,
                whiteSpace: "nowrap",
              }}
            >
              {section.caption}
            </span>
          </div>
        );
      })}
    </Popover>
  );
}

function Row({ y, label, value }: { y: number; label: string; value: string }) {
  return (
    <div
      style={{
        position: "absolute",
        top: y,
        left: 0,
        width: CONTENT_W,
        transform: "translateY(-50%)",
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: 8,
        lineHeight: 1,
      }}
    >
      <span
        style={{
          fontSize: POPOVER.text.label,
          fontWeight: 600,
          color: COLOR.detailLabel,
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: POPOVER.text.value,
          fontWeight: 500,
          color: COLOR.detailValue,
          whiteSpace: "nowrap",
        }}
      >
        {value}
      </span>
    </div>
  );
}

interface Section {
  label: string;
  value: string;
  caption: string;
  percent: number;
}

/**
 * Las dos ventanas de cuota. Con `quota_live` el backend trae el porcentaje real
 * consumido de la cuenta (el mismo que `/usage`) y no hay recuento de tokens
 * asociado, asi que el valor de la derecha es ese mismo consumo. Sin cuota real cae a
 * los tokens estimados de la sesion, marcados con `~`.
 */
function buildSections(s: AgentSession, t: Strings): Section[] {
  const value = (percent: number, tokens: number) =>
    s.quota_live ? `${percent}% ${t.used}` : `~${formatTokens(tokens)} ${t.tokens}`;

  return [
    {
      label: t.daily,
      value: value(s.daily_percent ?? 0, s.daily_tokens),
      caption: s.reset_daily ? t.resets(s.reset_daily) : t.noReset,
      percent: s.daily_percent ?? 0,
    },
    {
      label: t.weekly,
      value: value(s.weekly_percent ?? 0, s.weekly_tokens),
      caption: s.reset_weekly ? t.resets(s.reset_weekly) : t.noReset,
      percent: s.weekly_percent ?? 0,
    },
  ];
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
