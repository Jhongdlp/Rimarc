import { useEffect, type ReactNode } from "react";
import { motion, useSpring, useTransform } from "framer-motion";
import { POPOVER, FONT_FAMILY } from "../design/tokens";
import { bodyOrigin, popoverPath } from "../lib/popoverPath";
import type { Anchor, PopoverDir } from "../lib/placement";
import { useTheme } from "../lib/theme";

export interface PopoverProps {
  /** Borde del notch al que se pega y hacia donde se abre. */
  anchor: Anchor;
  height: number;
  open: boolean;
  onHoverStart?: () => void;
  onHoverEnd?: () => void;
  children: ReactNode;
}

/** Giro del path segun hacia donde se abre el panel. */
const ROT: Record<PopoverDir, number> = { left: 0, right: 180, up: 90, down: 270 };

/**
 * Concha compartida por el panel de detalle y el de ajustes: la silueta
 * (cuerpo mas cola) es un unico path regenerado desde la apertura animada, asi
 * que al abrirse el cuerpo brota de la punta de la cola en vez de aparecer
 * escalado. El contenido se pinta encima, siempre derecho: el giro vive en el
 * path, no en la caja de texto (ver `popoverPath`).
 */
export function Popover({ anchor, height, open, onHoverStart, onHoverEnd, children }: PopoverProps) {
  const { colors } = useTheme();
  const progress = useSpring(open ? 1 : 0, { stiffness: 300, damping: 32, mass: 0.8 });
  useEffect(() => {
    progress.set(open ? 1 : 0);
  }, [progress, open]);

  const { dir, along, inner, alongMax } = anchor;
  const rot = ROT[dir];
  /** El panel sale de un lado (bordes verticales) o por arriba/abajo. */
  const sideways = dir === "left" || dir === "right";
  const tail = POPOVER.tail.length;
  const W = POPOVER.width;
  const H = height;

  // La cola siempre suma sobre el eje perpendicular al borde.
  const boxW = sideways ? W + tail : W;
  const boxH = sideways ? H : H + tail;
  // El path se dibuja con la cola a la derecha; en los giros de +-90 el cuerpo
  // va intercambiado para que la caja ya girada quede derecha.
  const localW = sideways ? W : H;
  const localH = sideways ? H : W;

  // El panel se centra en su ancla, pero no puede salirse de la ventana: si se
  // sale, se pega al borde y es la cola la que se desplaza dentro del cuerpo
  // para seguir apuntando al anillo.
  let left: number;
  let top: number;
  let apex: number;
  if (sideways) {
    top = clamp(along - H / 2, 0, Math.max(0, alongMax - H));
    left = dir === "left" ? inner - POPOVER.gap - boxW : inner + POPOVER.gap;
    apex = dir === "left" ? along - top : H - (along - top);
  } else {
    left = clamp(along - W / 2, 0, Math.max(0, alongMax - W));
    top = dir === "down" ? inner + POPOVER.gap : inner - POPOVER.gap - boxH;
    apex = dir === "down" ? along - left : W - (along - left);
  }

  /**
   * Un unico path para las dos cosas: la concha y el recorte del contenido. El
   * contenido esta maquetado en su posicion final desde el primer frame, asi
   * que sin recortarlo se veian los textos y las barras fuera de la carta
   * mientras la concha todavia venia creciendo por detras.
   */
  const d = useTransform(progress, (t) =>
    popoverPath({ bodyW: localW, bodyH: localH, apex, rot, t }),
  );
  // Path vacio = nada dibujado; para el recorte hace falta una forma de area
  // cero, que no es lo mismo que no tener recorte.
  const clip = useTransform(d, (path) => `path("${path || "M0,0 Z"}")`);
  // Un punto de fundido corto: el recorte ya impide que se salga nada, esto
  // solo evita que el texto asome a medio glifo en los primeros frames.
  const contentOpacity = useTransform(progress, [0.12, 0.5], [0, 1]);

  const [bodyX, bodyY] = bodyOrigin(rot, tail);

  return (
    <div
      style={{
        position: "absolute",
        left,
        top,
        width: boxW,
        height: boxH,
        pointerEvents: open ? "auto" : "none",
      }}
      onMouseEnter={onHoverStart}
      onMouseLeave={onHoverEnd}
    >
      <motion.svg
        width={boxW}
        height={boxH}
        viewBox={`0 0 ${boxW} ${boxH}`}
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
          width: boxW,
          height: boxH,
          clipPath: clip,
          opacity: contentOpacity,
        }}
      >
        <div
          style={{
            position: "absolute",
            left: bodyX + POPOVER.padX,
            top: bodyY,
            width: POPOVER.width - POPOVER.padX * 2,
            height: H,
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
