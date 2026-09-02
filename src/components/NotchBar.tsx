import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  MAX_ITEMS,
  MOTION,
  NOTCH,
  SETTINGS_HEIGHT,
  STAGE,
  agentColor,
  type ThemeColors,
} from "../design/tokens";
import { notchHeight, ringCenterY } from "../lib/notchGeometry";
import { popoverHeight } from "../lib/popoverPath";
import { NotchSurface } from "./NotchSurface";
import { RingGauge } from "./RingGauge";
import { DetailPopover } from "./DetailPopover";
import { SettingsPanel } from "./SettingsPanel";
import { useInputShape } from "../hooks/useInputShape";
import {
  EDGE_ANGLE,
  alongFor,
  anchorFor,
  columnTransform,
  persistPlacement,
  savedOffset,
  setEdge,
  syncPlacement,
  useEdge,
  useStage,
  type Edge,
} from "../lib/placement";
import { call } from "../lib/tauri";
import { useAutoHide } from "../lib/prefs";
import { useTheme } from "../lib/theme";
import { sortSessions } from "../hooks/useAgentScan";
import type { AgentSession } from "../types";

/** Fraccion del camino que recorre el notch por fotograma al arrastrar. */
const DRAG_EASE = 0.2;

interface DragTarget {
  edge: Edge;
  offset: number;
}

export function NotchBar({ sessions }: { sessions: AgentSession[] }) {
  const { isDark, colors } = useTheme();
  const items = sortSessions(sessions).slice(0, MAX_ITEMS);

  // Borde de pantalla al que esta pegado el notch. Toda la maqueta se escribe
  // como si estuviera a la derecha; `columnTransform` la gira al borde real.
  const edge = useEdge();
  const stage = useStage(edge);
  const angle = EDGE_ANGLE[edge];
  useEffect(syncPlacement, []);

  // El disparador del boton es la linea de ajustes, no la barra: en la
  // referencia el arco esta siempre visible y pasar por la barra no abre nada.
  const settings = useHoverIntent();
  const detail = useHoverIntent();
  const [detailIndex, setDetailIndex] = useState(0);
  const [dragging, setDragging] = useState(false);

  const safeDetailIndex = Math.min(detailIndex, Math.max(0, items.length - 1));
  const active = items[safeDetailIndex];
  const detailOpen = detail.hovered && Boolean(active);

  // El disco se abre al pasar por encima, pero el panel solo con un clic; al
  // salir del conjunto boton+panel se sueltan los dos a la vez. Arrastrando lo
  // sostiene abierto: el puntero se va al otro extremo de la pantalla y si no
  // el panel se cierra y el asa desaparece bajo el cursor.
  const [settingsPinned, setSettingsPinned] = useState(false);
  const settingsOpen = settingsPinned && (settings.hovered || dragging);
  useEffect(() => {
    if (!settings.hovered && !dragging) setSettingsPinned(false);
  }, [settings.hovered, dragging]);

  // Arranca recogido. Cualquier actividad lo despliega; el silencio lo recoge
  // otra vez pasado el tiempo que diga el ajuste, salvo que este fijo.
  const autoHide = useAutoHide();
  const pinned = autoHide.delay === null;
  const [surfaceHover, setSurfaceHover] = useState(false);
  const [expanded, setExpanded] = useState(pinned);

  const busy = surfaceHover || dragging || detailOpen || settingsOpen || settings.hovered;
  useEffect(() => {
    if (pinned || busy) {
      setExpanded(true);
      return;
    }
    const id = window.setTimeout(() => setExpanded(false), autoHide.delay ?? 0);
    return () => window.clearTimeout(id);
  }, [pinned, busy, autoHide.delay]);

  // Sin agentes el recogido es la astilla dormida, no el peek con puntos: no
  // hay puntos que ensenar y el notch tiene que estorbar lo minimo.
  const empty = items.length === 0;
  const collapsed = !expanded;
  const peek = empty ? NOTCH.dormant : NOTCH.peek;
  const height = collapsed ? peek.height : notchHeight(items.length);
  const depth = collapsed ? peek.depth : NOTCH.depth;

  // Sitio del notch dentro del borde. Se guarda como fraccion y no como pixeles
  // para que no se descoloque al cambiar de pantalla ni al crecer la barra.
  const [offset, setOffset] = useState(savedOffset);
  const along = alongFor(offset, stage, height + NOTCH.gear.size);
  const startDrag = useDrag(edge, setOffset, setDragging);

  // El panel se sale de la columna del notch, asi que mientras esta abierto la
  // mascara de input tiene que cubrir toda la ventana, no solo los 80 px.
  const shapeMode = dragging || detailOpen || settingsOpen ? "expanded" : collapsed ? "peek" : "bar";
  const detailBottom = detailOpen ? ringCenterY(safeDetailIndex) + popoverHeight(2) / 2 : 0;
  const settingsBottom = settingsOpen ? height + SETTINGS_HEIGHT / 2 : 0;
  useInputShape(
    shapeMode,
    // Recogido no hay boton, asi que la region es la silueta y nada mas: con la
    // astilla dormida ese margen de sobra era una franja muerta de 40 px.
    collapsed ? height : Math.max(height + NOTCH.gear.size / 2, detailBottom, settingsBottom),
    edge,
    // Expandido cubre la ventana entera: mandar el sitio del notch en cada
    // fotograma del arrastre seria una llamada por fotograma para nada.
    shapeMode === "expanded" ? 0 : along,
  );

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {active && (
        <DetailPopover
          sessions={items}
          index={safeDetailIndex}
          anchor={anchorFor(edge, along + ringCenterY(safeDetailIndex), stage)}
          open={detailOpen}
          onHoverStart={detail.open}
          onHoverEnd={detail.close}
        />
      )}

      <SettingsPanel
        anchor={anchorFor(edge, along + height, stage)}
        open={settingsOpen}
        onDragStart={startDrag}
        dragging={dragging}
        onHoverStart={settings.open}
        onHoverEnd={settings.close}
      />

      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: NOTCH.depth,
          height: STAGE.height,
          transformOrigin: "0 0",
          transform: columnTransform(edge, stage, along),
          pointerEvents: "none",
        }}
      >
        <NotchSurface
          height={height}
          depth={depth}
          dots={items.map((s) => agentColor(s.agent_type, isDark))}
          angle={angle}
          collapsed={collapsed}
          empty={empty}
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
                  angle={angle}
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

/**
 * Arrastre del notch desde el asa de ajustes. El backend solo mira: dice a que
 * borde apunta el puntero y en que fraccion de ese borde cae. Deslizarse por el
 * borde es una transformada CSS, no un movimiento de ventana — la ventana ya
 * cubre el borde entero y solo se toca cuando el arrastre cruza a otro.
 *
 * El bucle es de `requestAnimationFrame` y no de `mousemove` a proposito: el
 * notch persigue al objetivo por fracciones, asi que hacen falta fotogramas
 * tambien cuando el puntero se para o se quedaria a medio camino. De ahi el
 * tacto pegajoso.
 *
 * Durante el arrastre la mascara de input cubre la ventana entera (ver
 * `dragging` mas arriba): con la mascara recogida el puntero se sale de la
 * region en cuanto el notch se aparta y se pierden los eventos.
 */
function useDrag(
  edge: Edge,
  setOffset: (fn: (o: number) => number) => void,
  setDragging: (v: boolean) => void,
) {
  const edgeRef = useRef(edge);
  edgeRef.current = edge;

  return (e: ReactMouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    setDragging(true);

    let alive = true;
    // Una llamada en vuelo como mucho: encolarlas solo anadiria retraso.
    let inFlight = false;
    let target: number | null = null;
    let last = 0;

    const frame = () => {
      if (!alive) return;
      if (!inFlight) {
        inFlight = true;
        void call<DragTarget>("drag_probe", { edge: edgeRef.current }).then((t) => {
          inFlight = false;
          if (!t || !alive) return;
          target = t.offset;
          if (t.edge !== edgeRef.current) {
            // Cambiar de borde cambia de eje: ahi no hay nada que suavizar.
            setEdge(t.edge);
            void call("place_notch", { edge: t.edge });
            setOffset(() => (last = t.offset));
          }
        });
      }
      if (target !== null) {
        const to = target;
        setOffset((o) => (last = o + (to - o) * DRAG_EASE));
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);

    const onUp = () => {
      alive = false;
      window.removeEventListener("mouseup", onUp);
      setDragging(false);
      persistPlacement(last);
    };
    window.addEventListener("mouseup", onUp);
  };
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
 *
 * `angle` es el giro de la columna: se descuenta en el anillo y en la etiqueta,
 * que son lo unico que tiene que leerse derecho. La maqueta no cambia, asi que
 * en un borde horizontal la etiqueta acaba al lado del anillo en vez de debajo.
 */
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
