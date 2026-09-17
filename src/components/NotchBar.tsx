import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import {
  MOTION,
  NOTCH,
  STAGE,
  SETTINGS_HEIGHT,
} from "../design/tokens";
import { ringCenterY } from "../lib/notchGeometry";
import { popoverHeight } from "../lib/popoverPath";
import { NotchSurface } from "./NotchSurface";
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
import { useActiveTool } from "../lib/toolStore";
import type { NotchTool } from "../tools/types";
import type { AgentSession } from "../types";

/** Fraccion del camino que recorre el notch por fotograma al arrastrar. */
const DRAG_EASE = 0.2;

interface DragTarget {
  edge: Edge;
  offset: number;
}

export interface NotchBarProps {
  tool?: NotchTool<any>;
  sessions?: AgentSession[];
}

export function NotchBar({ tool: propTool }: NotchBarProps = {}) {
  const activeTool = propTool ?? useActiveTool();
  return <NotchBarInner key={activeTool.id} activeTool={activeTool} />;
}

function NotchBarInner({ activeTool }: { activeTool: NotchTool<any> }) {
  const { isDark, colors } = useTheme();
  const toolData = activeTool.useData();

  // Borde de pantalla al que esta pegado el notch. Toda la maqueta se escribe
  // como si estuviera a la derecha; `columnTransform` la gira al borde real.
  const edge = useEdge();
  const stage = useStage(edge);
  const angle = EDGE_ANGLE[edge];
  useEffect(syncPlacement, []);

  // El disparador del boton es la linea de ajustes, no la barra
  const settings = useHoverIntent();
  const detail = useHoverIntent();
  const [detailIndex, setDetailIndex] = useState(0);
  const [dragging, setDragging] = useState(false);

  const empty = activeTool.isEmpty(toolData);
  const detailOpen = detail.hovered && !empty;

  // El disco se abre al pasar por encima, pero el panel solo con un clic
  const [settingsPinned, setSettingsPinned] = useState(false);
  const settingsOpen = settingsPinned && (settings.hovered || dragging);
  useEffect(() => {
    if (!settings.hovered && !dragging) setSettingsPinned(false);
  }, [settings.hovered, dragging]);

  // Arranca recogido. Cualquier actividad lo despliega; el silencio lo recoge
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

  // Sin elementos el recogido es la astilla dormida, no el peek con puntos
  const collapsed = !expanded;
  const peek = empty ? NOTCH.dormant : NOTCH.peek;
  const targetHeight = activeTool.getNotchHeight(toolData);
  const height = collapsed ? peek.height : targetHeight;
  const depth = collapsed ? peek.depth : NOTCH.depth;
  const dots = activeTool.getDots(toolData, isDark);

  // Sitio del notch dentro del borde
  const [offset, setOffset] = useState(savedOffset);
  const along = alongFor(offset, stage, height + NOTCH.gear.size);
  const startDrag = useDrag(edge, setOffset, setDragging);

  // El panel se sale de la columna del notch, asi que mientras esta abierto la
  // mascara de input tiene que cubrir toda la ventana, no solo los 80 px.
  const shapeMode = dragging || detailOpen || settingsOpen ? "expanded" : collapsed ? "peek" : "bar";
  const anchorY = activeTool.getDetailAnchorY
    ? activeTool.getDetailAnchorY(toolData, detailIndex)
    : ringCenterY(detailIndex);
  const detailBottom = detailOpen ? anchorY + popoverHeight(2) / 2 : 0;
  const settingsBottom = settingsOpen ? height + SETTINGS_HEIGHT / 2 : 0;

  useInputShape(
    shapeMode,
    collapsed ? height : Math.max(height + NOTCH.gear.size / 2, detailBottom, settingsBottom),
    edge,
    shapeMode === "expanded" ? 0 : along,
  );

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {/* Popover de detalle de la herramienta activa */}
      {activeTool.renderPopover({
        data: toolData,
        anchor: anchorFor(edge, along + anchorY, stage),
        open: detailOpen,
        detailIndex,
        onHoverStart: detail.open,
        onHoverEnd: detail.close,
      })}

      {/* Panel de ajustes */}
      <SettingsPanel
        anchor={anchorFor(edge, along + height, stage)}
        open={settingsOpen}
        onDragStart={startDrag}
        dragging={dragging}
        onHoverStart={settings.open}
        onHoverEnd={settings.close}
      />

      {/* Columna del Notch con su silueta transformable */}
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
          dots={dots}
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
          {!collapsed &&
            activeTool.renderBar({
              data: toolData,
              angle,
              colors,
              isDark,
              activeDetailIndex: detailIndex,
              onOpenDetail: (i) => {
                setDetailIndex(i);
                detail.open();
              },
              onCloseDetail: detail.close,
            })}
        </NotchSurface>
      </div>
    </div>
  );
}

/**
 * Arrastre del notch desde el asa de ajustes.
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
