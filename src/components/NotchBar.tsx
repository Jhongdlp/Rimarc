import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { NOTCH, MOTION, SETTINGS_HEIGHT, STAGE, agentColor, type ThemeColors } from "../design/tokens";
import { notchHeight, ringCenterY } from "../lib/notchGeometry";
import { popoverHeight } from "../lib/popoverPath";
import { NotchSurface } from "./NotchSurface";
import { RingGauge } from "./RingGauge";
import { DetailPopover } from "./DetailPopover";
import { SettingsPanel } from "./SettingsPanel";
import { useInputShape } from "../hooks/useInputShape";
import { useAutoHide } from "../lib/prefs";
import { useTheme } from "../lib/theme";
import type { AgentSession } from "../types";

/** Con 5 agentes el notch mas el boton ya rozan los 600 px de la ventana. */
export const MAX_ITEMS = 5;

const NOTCH_LEFT = STAGE.width - NOTCH.depth;

export interface NotchBarProps {
  sessions: AgentSession[];
}

export function NotchBar({ sessions }: NotchBarProps) {
  const { isDark, colors } = useTheme();
  const items = sessions.slice(0, MAX_ITEMS);

  // El disparador del boton es la linea de ajustes, no la barra: en la
  // referencia el arco esta siempre visible y pasar por la barra no abre nada.
  const settings = useHoverIntent();
  const detail = useHoverIntent();
  const [detailIndex, setDetailIndex] = useState(0);

  const active = items[detailIndex];
  const detailOpen = detail.hovered && Boolean(active);

  // El disco se abre al pasar por encima, pero el panel solo con un clic; al
  // salir del conjunto boton+panel se sueltan los dos a la vez.
  const [settingsPinned, setSettingsPinned] = useState(false);
  const settingsOpen = settingsPinned && settings.hovered;
  useEffect(() => {
    if (!settings.hovered) setSettingsPinned(false);
  }, [settings.hovered]);

  // Arranca recogido. Cualquier actividad lo despliega; el silencio lo recoge
  // otra vez pasado el tiempo que diga el ajuste, salvo que este fijo.
  const autoHide = useAutoHide();
  const pinned = autoHide.delay === null;
  const [surfaceHover, setSurfaceHover] = useState(false);
  const [expanded, setExpanded] = useState(pinned);

  const busy = surfaceHover || detailOpen || settingsOpen || settings.hovered;
  useEffect(() => {
    if (pinned || busy) {
      setExpanded(true);
      return;
    }
    const id = window.setTimeout(() => setExpanded(false), autoHide.delay ?? 0);
    return () => window.clearTimeout(id);
  }, [pinned, busy, autoHide.delay]);

  const collapsed = !expanded;
  const height = collapsed ? NOTCH.peek.height : notchHeight(items.length);
  const depth = collapsed ? NOTCH.peek.depth : NOTCH.depth;

  // El panel se sale de la columna del notch, asi que mientras esta abierto la
  // mascara de input tiene que cubrir toda la ventana, no solo los 80 px.
  const detailBottom = detailOpen
    ? ringCenterY(detailIndex) + popoverHeight(2) / 2
    : 0;
  const settingsBottom = settingsOpen ? height + SETTINGS_HEIGHT / 2 : 0;
  useInputShape(
    detailOpen || settingsOpen ? "expanded" : collapsed ? "peek" : "bar",
    Math.max(height + NOTCH.gear.size / 2, detailBottom, settingsBottom),
  );

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {active && (
        <DetailPopover
          session={active}
          anchorY={ringCenterY(detailIndex)}
          notchLeft={NOTCH_LEFT}
          open={detailOpen}
          onHoverStart={detail.open}
          onHoverEnd={detail.close}
        />
      )}

      <SettingsPanel
        anchorY={height}
        notchLeft={NOTCH_LEFT}
        open={settingsOpen}
        onHoverStart={settings.open}
        onHoverEnd={settings.close}
      />

      <div
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          width: NOTCH.depth,
          height: "100%",
          pointerEvents: "none",
        }}
      >
        <NotchSurface
          height={height}
          depth={depth}
          gearCenterY={height}
          dots={items.map((s) => agentColor(s.agent_type, isDark))}
          collapsed={collapsed}
          settingsOpen={settings.hovered}
          onSettingsHoverStart={settings.open}
          onSettingsHoverEnd={settings.close}
          onSettingsClick={() => setSettingsPinned((v) => !v)}
          onHoverStart={() => setSurfaceHover(true)}
          onHoverEnd={() => setSurfaceHover(false)}
        >
          <AnimatePresence initial={false}>
            {!collapsed &&
              items.map((session, i) => (
                <AgentSlot
                  key={session.id}
                  session={session}
                  centerY={ringCenterY(i)}
                  colors={colors}
                  onHoverStart={() => {
                    setDetailIndex(i);
                    detail.open();
                  }}
                  onHoverEnd={detail.close}
                />
              ))}
          </AnimatePresence>
        </NotchSurface>
      </div>
    </div>
  );
}

/** Hover con cierre diferido, para poder cruzar el hueco entre dos elementos. */
function useHoverIntent() {
  const [hovered, setHovered] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return {
    hovered,
    open: () => {
      window.clearTimeout(timer.current);
      setHovered(true);
    },
    close: () => {
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setHovered(false), MOTION.hoverCloseMs);
    },
  };
}

/**
 * Anillo y etiqueta de un agente. Se posicionan por centro absoluto en lugar de
 * apilarse con flex: la referencia fija el paso entre anillos y la distancia
 * anillo-etiqueta, y ese ritmo no debe depender de la altura del texto.
 */
function AgentSlot({
  session,
  centerY,
  colors,
  onHoverStart,
  onHoverEnd,
}: {
  session: AgentSession;
  centerY: number;
  colors: ThemeColors;
  onHoverStart: () => void;
  onHoverEnd: () => void;
}) {
  const percent = Math.round(session.daily_percent ?? 0);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      transition={{ type: "spring", stiffness: 380, damping: 30 }}
      style={{
        position: "absolute",
        // El centrado va en `top` y no en un translate: framer-motion es dueno
        // de `transform` en un motion.div y borraria cualquier valor estatico.
        top: centerY - NOTCH.ring.size / 2,
        left: 0,
        width: NOTCH.depth,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        pointerEvents: "none",
      }}
    >
      {/* Solo el anillo abre el detalle; la etiqueta queda fuera del objetivo. */}
      <div style={{ pointerEvents: "auto" }} onMouseEnter={onHoverStart} onMouseLeave={onHoverEnd}>
        <RingGauge type={session.agent_type} percent={percent} />
      </div>
      <span
        style={{
          position: "absolute",
          top: NOTCH.ring.size / 2 + NOTCH.labelOffset,
          transform: "translateY(-50%)",
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
