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
  /** Contenido del cajon que crece pegado a la carta. Sin alto, no hay cajon. */
  drawer?: ReactNode;
  drawerHeight?: number;
  drawerOpen?: boolean;
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
export function Popover({
  anchor,
  height,
  open,
  drawer,
  drawerHeight = 0,
  drawerOpen = false,
  onHoverStart,
  onHoverEnd,
  children,
}: PopoverProps) {
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
    // El cajon se reserva su sitio aunque este cerrado: si no, abrirlo cerca
    // del final del borde tendria que subir la carta y el panel daria un salto.
    top = clamp(along - H / 2, 0, Math.max(0, alongMax - H - drawerHeight));
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

  /**
   * Cajon: una caja redondeada mas ancha que la carta, pegada a su base y
   * pintada por detras. Al compartir superficie no hay junta que dibujar, asi
   * que no toca `popoverPath`: el crecimiento es un `inset()` que se abre
   * desde el borde de la carta hacia fuera, y el contenido va maquetado en su
   * sitio final desde el primer frame para que no se recomponga al crecer.
   *
   * Sobresale hacia el lado contrario a la cola — hacia el otro lado se
   * comeria el hueco que la separa del notch. En un borde inferior de pantalla
   * la carta se abre hacia arriba y el cajon con ella, o crecer hacia abajo lo
   * metería por debajo de la barra.
   */
  const drawerUp = rot === 90;
  const [bleedL, bleedR] =
    rot === 0
      ? [POPOVER.drawer.bleed, 0]
      : rot === 180
        ? [0, POPOVER.drawer.bleed]
        : [POPOVER.drawer.bleed / 2, POPOVER.drawer.bleed / 2];
  const drawerShown = drawerOpen && open;
  const dp = useSpring(drawerShown ? 1 : 0, { stiffness: 260, damping: 30, mass: 0.9 });
  useEffect(() => {
    dp.set(drawerShown ? 1 : 0);
  }, [dp, drawerShown]);
  /**
   * Por el lado que no sobresale, la carta y el cajon comparten borde y ese
   * borde tiene que ser una recta. Si ahi el cajon redondea su esquina de
   * arriba, la union pinta un estrechamiento: la carta cierra su curva hacia
   * dentro y el cajon vuelve a abrirse. Cuadrando esa esquina, el cajon rellena
   * el recorte de la carta y el canto sale seguido de arriba abajo — que es
   * justo lo que hace que `overlap` no pueda bajar del radio.
   */
  const R = POPOVER.radius;
  // Esquinas del cajon, en orden CSS: arriba-izq, arriba-der, abajo-der,
  // abajo-izq. Se cuadra la del lado que no sobresale, y del canto por el que
  // se pega a la carta, que es el de abajo cuando crece hacia arriba.
  const seam: number[] = drawerUp
    ? [R, R, bleedR ? R : 0, bleedL ? R : 0]
    : [bleedL ? R : 0, bleedR ? R : 0, R, R];
  const drawerClip = useTransform(dp, (t) => {
    const g = 1 - t;
    // Cerrado se recoge dentro de la carta, sin asomar por sus esquinas.
    const grow = g * (drawerHeight + POPOVER.drawer.overlap);
    const l = g * (bleedL + R);
    const r = g * (bleedR + R);
    const round = seam.map((v) => `${v}px`).join(" ");
    return `inset(${drawerUp ? grow : 0}px ${r}px ${drawerUp ? 0 : grow}px ${l}px round ${round})`;
  });

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
      {/* Antes de la concha: la carta tiene que pintarse por encima. Solo con la
          carta abierta: cerrado, el `inset()` que recoge el cajon deja una fila
          de subpixel sin recortar, y con la carta encima no se ve, pero sin
          ella era una raya negra de 220 px cruzando el escritorio. */}
      {drawerHeight > 0 && open && (
        <motion.div
          style={{
            position: "absolute",
            left: bodyX - bleedL,
            top: drawerUp ? bodyY - drawerHeight : bodyY + H - POPOVER.drawer.overlap,
            width: W + bleedL + bleedR,
            height: drawerHeight + POPOVER.drawer.overlap,
            background: colors.surface,
            clipPath: drawerClip,
            pointerEvents: drawerShown ? "auto" : "none",
          }}
        >
          <div
            style={{
              position: "absolute",
              left: POPOVER.padX,
              top: drawerUp ? 0 : POPOVER.drawer.overlap,
              width: W + bleedL + bleedR - POPOVER.padX * 2,
              height: drawerHeight,
              fontFamily: FONT_FAMILY,
            }}
          >
            {drawer}
          </div>
        </motion.div>
      )}

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
