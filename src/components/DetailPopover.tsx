import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { MAX_ITEMS, POPOVER, agentColor, drawerHeight } from "../design/tokens";
import { popoverHeight } from "../lib/popoverPath";
import { Popover, PopoverHeader } from "./Popover";
import { AgentIcon } from "./icons/AgentIcon";
import { UsageBar } from "./UsageBar";
import { useI18n, type Strings } from "../lib/i18n";
import type { Anchor } from "../lib/placement";
import { useTheme } from "../lib/theme";
import type { AgentInstance, AgentSession } from "../types";

const CONTENT_W = POPOVER.width - POPOVER.padX * 2;
const DRAWER = POPOVER.drawer;
/** La carta reserva una franja al pie para el boton del cajon. */
const CARD_HEIGHT = popoverHeight(2) + DRAWER.foot;

export interface DetailPopoverProps {
  /** Todos los agentes vivos; la carta y el cajon solo muestran el de `index`. */
  sessions: AgentSession[];
  /** Agente del anillo por el que se abrio, al que apunta la cola. */
  index: number;
  /** Anilla a la que apunta la cola, ya resuelta contra el borde de pantalla. */
  anchor: Anchor;
  open: boolean;
  onHoverStart: () => void;
  onHoverEnd: () => void;
}

/**
 * Carta de un agente — cuota diaria y semanal — con el cajon debajo, que lista
 * cada instancia abierta de ese mismo agente con su ruta y su estado.
 */
export function DetailPopover({
  sessions,
  index,
  anchor,
  open,
  onHoverStart,
  onHoverEnd,
}: DetailPopoverProps) {
  const session = sessions[index] ?? sessions[0];
  const { t } = useI18n();
  const { isDark, colors } = useTheme();
  const sections = buildSections(session, t);
  // Solo las instancias de este agente; el lienzo no da para mas de MAX_ITEMS filas.
  const instances = (session.instances ?? []).slice(0, MAX_ITEMS);

  // El cajon se abre al pasar por el boton y se recoge al cerrarse la carta:
  // asi no hace falta un temporizador para cruzar el hueco entre los dos, y la
  // carta nunca reaparece con el cajon ya desplegado.
  const [drawerOpen, setDrawerOpen] = useState(false);
  useEffect(() => {
    if (!open) setDrawerOpen(false);
  }, [open]);

  return (
    <Popover
      anchor={anchor}
      height={CARD_HEIGHT}
      open={open}
      drawerOpen={drawerOpen}
      drawerHeight={drawerHeight(instances.length)}
      drawer={<InstanceRoster session={session} instances={instances} isDark={isDark} />}
      onHoverStart={onHoverStart}
      onHoverEnd={onHoverEnd}
    >
      <PopoverHeader
        icon={<AgentIcon type={session.agent_type} size={POPOVER.icon} color={colors.icon} />}
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
              <UsageBar
                percent={section.percent}
                width={CONTENT_W}
                color={agentColor(session.agent_type, isDark)}
              />
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
                color: colors.detailCaption,
                whiteSpace: "nowrap",
              }}
            >
              {section.caption}
            </span>
          </div>
        );
      })}

      <button
        type="button"
        title={t.details}
        onMouseEnter={() => setDrawerOpen(true)}
        onClick={() => setDrawerOpen((v) => !v)}
        style={{
          position: "absolute",
          left: CONTENT_W / 2,
          top: CARD_HEIGHT - DRAWER.foot,
          transform: "translate(-50%, -50%)",
          // Blanco mas ancho que el glifo: el chevron solo son 11 px.
          width: 34,
          height: 18,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 0,
          border: "none",
          background: "transparent",
          cursor: "pointer",
          pointerEvents: "auto",
        }}
      >
        <motion.svg
          width={DRAWER.chevron}
          height={DRAWER.chevron}
          viewBox="0 0 12 12"
          fill="none"
          animate={{ rotate: drawerOpen ? 180 : 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 26 }}
        >
          <path
            d="M2.5 4.5 L6 8 L9.5 4.5"
            stroke={drawerOpen ? colors.detailLabel : colors.detailValue}
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </motion.svg>
      </button>
    </Popover>
  );
}

/**
 * Las instancias vivas del agente de la carta: una fila por sesion abierta, con
 * su proyecto, su ruta y lo que esta haciendo. Las que ya acabaron quedan
 * desvaidas para que salte a la vista cual trabaja o cual te espera.
 */
function InstanceRoster({
  session,
  instances,
  isDark,
}: {
  session: AgentSession;
  instances: AgentInstance[];
  isDark: boolean;
}) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const color = agentColor(session.agent_type, isDark);

  return (
    <>
      {instances.map((inst, i) => {
        const resting = inst.status === "done" || inst.status === "idle";
        return (
          <div
            key={inst.pid}
            title={inst.cwd}
            style={{
              position: "absolute",
              top: DRAWER.rowFirst + i * DRAWER.rowPitch,
              left: 0,
              right: 0,
              height: DRAWER.rowHeight,
              opacity: resting ? DRAWER.dim : 1,
              pointerEvents: "auto",
              transition: "opacity 140ms ease",
            }}
          >
            {/* Absoluto como el resto: en flujo, el glifo arrastra su caja de
                linea y descuadra el alto de la fila. */}
            <span style={{ position: "absolute", top: 0, left: 0, lineHeight: 0 }}>
              <AgentIcon type={session.agent_type} size={DRAWER.icon} color={color} />
            </span>

            <span
              style={{
                position: "absolute",
                top: 1,
                left: DRAWER.icon + DRAWER.iconGap,
                fontSize: DRAWER.text.name,
                fontWeight: 600,
                lineHeight: 1,
                color: colors.detailLabel,
                whiteSpace: "nowrap",
              }}
            >
              {inst.project_name}
            </span>

            <span
              style={{
                position: "absolute",
                top: 1,
                right: 0,
                fontSize: DRAWER.text.value,
                fontWeight: 600,
                lineHeight: 1,
                color: resting ? colors.detailValue : color,
                whiteSpace: "nowrap",
              }}
            >
              {t.status[inst.status] ?? inst.status}
            </span>

            <span
              style={{
                position: "absolute",
                top: 16,
                left: DRAWER.icon + DRAWER.iconGap,
                right: 0,
                fontSize: DRAWER.text.meta,
                fontWeight: 500,
                lineHeight: 1,
                color: colors.detailValue,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {shortPath(inst.cwd)}
            </span>

            {/* Separador de lado a lado. */}
            <div
              style={{
                position: "absolute",
                top: DRAWER.rowHeight - DRAWER.bar,
                left: 0,
                right: 0,
                height: DRAWER.bar,
                borderRadius: DRAWER.bar,
                background: colors.track,
              }}
            />
          </div>
        );
      })}

      {/* Cierre: modelo, contexto y coste del agente. */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: DRAWER.rowFirst + Math.max(0, instances.length - 1) * DRAWER.rowPitch + DRAWER.rowHeight + 7,
          fontSize: DRAWER.text.meta,
          fontWeight: 500,
          lineHeight: 1,
          color: colors.detailValue,
          textAlign: "right",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {footerOf(session)}
      </div>
    </>
  );
}

/** Modelo, contexto y coste del agente elegido, lo que haya. */
function footerOf(s: AgentSession | undefined): string {
  if (!s) return "";
  const parts = [s.model_name];
  if (s.context_tokens && s.context_window_size) {
    parts.push(`${formatTokens(s.context_tokens)} / ${formatTokens(s.context_window_size)}`);
  }
  if (s.total_cost_usd > 0) parts.push(`$${s.total_cost_usd.toFixed(2)}`);
  return parts.filter(Boolean).join("   ·   ");
}

/**
 * Ruta recortada por delante: el final (el proyecto) es lo que identifica la
 * sesion, el principio es siempre el mismo. El recorte va aqui y no en el CSS
 * porque `text-overflow` solo sabe cortar por el final.
 */
const PATH_MAX = 26;

function shortPath(p: string): string {
  if (!p) return "";
  const home = p.match(/^\/home\/[^/]+/);
  const short = home ? `~${p.slice(home[0].length)}` : p;
  if (short.length <= PATH_MAX) return short;
  const parts = short.split("/");
  let out = "";
  for (let i = parts.length - 1; i > 0; i--) {
    const next = `/${parts[i]}${out}`;
    if (next.length > PATH_MAX - 1) break;
    out = next;
  }
  return `…${out || `/${parts[parts.length - 1]}`}`;
}

function Row({ y, label, value }: { y: number; label: string; value: string }) {
  const { colors } = useTheme();
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
          color: colors.detailLabel,
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: POPOVER.text.value,
          fontWeight: 500,
          color: colors.detailValue,
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
