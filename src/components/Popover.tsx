import { useEffect, type ReactNode } from "react";
import { motion, useSpring, useTransform } from "framer-motion";
import { POPOVER, FONT_FAMILY, STAGE } from "../design/tokens";
import { popoverPath } from "../lib/popoverPath";
import { useTheme } from "../lib/theme";

export interface PopoverProps {
  /** Y del centro de la cola, en coordenadas del stage. */
  anchorY: number;
  /** X del borde izquierdo del notch: la punta queda a `gap` de el. */
  notchLeft: number;
  height: number;
  open: boolean;
  onHoverStart?: () => void;
  onHoverEnd?: () => void;
  children: ReactNode;
}

/**
 * Concha compartida por el panel de detalle y el de ajustes: la silueta
 * (cuerpo mas cola) es un unico path regenerado desde el ancho y el alto
 * animados, asi que al abrirse el cuerpo brota de la punta de la cola en vez de
 * aparecer escalado. El contenido se pinta encima, ya sangrado por `padX`.
 */
export function Popover({
  anchorY,
  notchLeft,
  height,
  open,
  onHoverStart,
  onHoverEnd,
  children,
}: PopoverProps) {
  const { colors } = useTheme();
  const progress = useSpring(open ? 1 : 0, { stiffness: 300, damping: 32, mass: 0.8 });
  useEffect(() => {
    progress.set(open ? 1 : 0);
  }, [progress, open]);

  // El panel se centra en su ancla, pero no puede salirse de la ventana: si se
  // sale, se pega al borde y es la cola la que se desplaza dentro del cuerpo
  // para seguir apuntando al anillo.
  const top = clamp(anchorY - height / 2, 0, Math.max(0, STAGE.height - height));
  const apex = anchorY - top;

  /**
   * Un unico path para las dos cosas: la concha y el recorte del
   * contenido. El contenido esta maquetado en su posicion final desde el primer
   * frame, asi que sin recortarlo se veian los textos y las barras fuera de la
   * carta mientras la concha todavia venia creciendo por detras. El
   * desplazamiento va dentro del path en vez de en un `<g transform>` porque
   * `clip-path` no admite transformadas.
   */
  const d = useTransform(progress, (t) =>
    popoverPath({
      bodyW: t * POPOVER.width,
      bodyH: t * height,
      tailLength: t * POPOVER.tail.length,
      tailBase: t * POPOVER.tail.base,
      apex: t * apex,
      // La punta se queda quieta: el resto crece hacia la izquierda desde ella.
      ox: (1 - t) * (POPOVER.width + POPOVER.tail.length),
      oy: (1 - t) * apex,
    }),
  );
  // Path vacio = nada dibujado; para el recorte hace falta una forma de area
  // cero, que no es lo mismo que no tener recorte.
  const clip = useTransform(d, (path) => `path("${path || "M0,0 Z"}")`);
  // Un punto de fundido corto: el recorte ya impide que se salga nada, esto
  // solo evita que el texto asome a medio glifo en los primeros frames.
  const contentOpacity = useTransform(progress, [0.12, 0.5], [0, 1]);

  const svgW = POPOVER.width + POPOVER.tail.length;
  const left = notchLeft - POPOVER.gap - svgW;

  return (
    <div
      style={{
        position: "absolute",
        left,
        top,
        width: svgW,
        height,
        pointerEvents: open ? "auto" : "none",
      }}
      onMouseEnter={onHoverStart}
      onMouseLeave={onHoverEnd}
    >
      <motion.svg
        width={svgW}
        height={height}
        viewBox={`0 0 ${svgW} ${height}`}
        style={{ position: "absolute", inset: 0, overflow: "visible" }}
      >
        <motion.path d={d} fill={colors.surface} />
      </motion.svg>

      {/* Comparte caja con el SVG para que el recorte use sus mismas
          coordenadas; el sangrado va en el hijo. */}
      <motion.div
        style={{
          position: "absolute",
          inset: 0,
          width: svgW,
          height,
          clipPath: clip,
          opacity: contentOpacity,
        }}
      >
        <div
          style={{
            position: "absolute",
            left: POPOVER.padX,
            top: 0,
            width: POPOVER.width - POPOVER.padX * 2,
            height,
            fontFamily: FONT_FAMILY,
          }}
        >
          {children}
        </div>
      </motion.div>
    </div>
  );
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

/** Cabecera comun: glifo a la izquierda y titulo, al ritmo de la referencia. */
export function PopoverHeader({ icon, title }: { icon: ReactNode; title: string }) {
  const { colors } = useTheme();
  return (
    <div
      style={{
        position: "absolute",
        top: POPOVER.headerTop,
        display: "flex",
        alignItems: "center",
        gap: POPOVER.iconGap,
      }}
    >
      {icon}
      <span
        style={{
          fontSize: POPOVER.text.title,
          fontWeight: 600,
          lineHeight: 1,
          color: colors.title,
        }}
      >
        {title}
      </span>
    </div>
  );
}
