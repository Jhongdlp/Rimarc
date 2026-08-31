import { useEffect, type ReactNode } from "react";
import { motion, useSpring, useTransform } from "framer-motion";
import { NOTCH, STAGE, MOTION } from "../design/tokens";
import { notchPath } from "../lib/notchGeometry";
import { SettingsMorph } from "./SettingsMorph";
import { useTheme } from "../lib/theme";

export interface NotchSurfaceProps {
  /** Alto objetivo de la silueta. Se interpola con muelle. */
  height: number;
  /** Fondo objetivo. Recogido vale `NOTCH.peek.depth`. */
  depth: number;
  /** Un color por agente activo. Solo se pintan con el notch recogido. */
  dots: string[];
  /** Giro de la columna, para descontarlo en lo que tiene que leerse derecho. */
  angle: number;
  /** true = notch recogido: se ven los puntos y no hay boton de ajustes. */
  collapsed: boolean;
  /** true = el arco de reposo ya se abrio en disco. */
  settingsOpen: boolean;
  onSettingsHoverStart: () => void;
  onSettingsHoverEnd: () => void;
  onSettingsClick: () => void;
  /** Pasar por la silueta es lo que despliega el notch. */
  onHoverStart: () => void;
  onHoverEnd: () => void;
  /** Contenido del notch. Se recorta contra la silueta mientras esta crece. */
  children?: ReactNode;
}

const EDGE = NOTCH.depth;

/**
 * Todo el fondo del notch vive en este SVG: la silueta y el boton de ajustes.
 * El path se regenera en cada frame a partir del alto y el fondo animados, asi
 * que el morph entre recogido y desplegado es geometrico de verdad. Como la
 * silueta es autosemejante (ver `notchGeometry`), encoger el fondo no deforma
 * las esquinas: el estado recogido es la misma forma, mas pequena.
 */
export function NotchSurface({
  height,
  depth,
  dots,
  angle,
  collapsed,
  settingsOpen,
  onSettingsHoverStart,
  onSettingsHoverEnd,
  onSettingsClick,
  onHoverStart,
  onHoverEnd,
  children,
}: NotchSurfaceProps) {
  const { colors } = useTheme();
  const animatedHeight = useSpring(height, MOTION.shape);
  const animatedDepth = useSpring(depth, MOTION.shape);
  useEffect(() => {
    animatedHeight.set(height);
    animatedDepth.set(depth);
  }, [animatedHeight, animatedDepth, height, depth]);

  const d = useTransform([animatedHeight, animatedDepth], ([h, w]: number[]) =>
    notchPath(h, w, EDGE),
  );
  /**
   * El mismo path recorta el contenido. Los anillos estan maquetados en su
   * posicion final desde el primer frame, asi que al desplegarse desde recogido
   * se veian los logos y los porcentajes fuera de la carta mientras la silueta
   * todavia venia creciendo por detras. Mismo arreglo que en `Popover`.
   */
  const clip = useTransform(d, (path) => `path("${path}")`);
  // Los puntos y el boton viven en el eje del cuerpo, que se mueve con el
  // fondo. El boton ademas se ancla a la punta, que se mueve con el alto.
  const dotCx = useTransform(animatedDepth, (w) => EDGE - w / 2);

  // Centrados en la silueta recogida, que es la unica en la que se ven.
  const dotsTop = NOTCH.peek.height / 2 - ((dots.length - 1) * NOTCH.peek.dotPitch) / 2;

  return (
    <>
      {/* Comparte caja con el SVG para que el recorte use sus coordenadas. */}
      <motion.div
        style={{
          position: "absolute",
          inset: 0,
          clipPath: clip,
          pointerEvents: "none",
          zIndex: 1,
        }}
      >
        {children}
      </motion.div>

      <svg
      width={NOTCH.depth}
      height={STAGE.height}
      viewBox={`0 0 ${NOTCH.depth} ${STAGE.height}`}
      style={{ position: "absolute", top: 0, right: 0, pointerEvents: "none" }}
    >
      <motion.path
        d={d}
        fill={colors.surface}
        style={{ pointerEvents: "auto" }}
        onMouseEnter={onHoverStart}
        onMouseLeave={onHoverEnd}
      />

      {dots.map((color, i) => (
        <motion.circle
          key={i}
          cx={dotCx}
          cy={dotsTop + i * NOTCH.peek.dotPitch}
          r={NOTCH.peek.dot}
          fill={color}
          initial={false}
          animate={{ opacity: collapsed ? 1 : 0 }}
          transition={{ duration: collapsed ? 0.22 : 0.1 }}
          pointerEvents="none"
        />
      ))}

      {!collapsed && (
        <SettingsMorph
          cx={dotCx}
          cy={animatedHeight}
          angle={angle}
          open={settingsOpen}
          onHoverStart={onSettingsHoverStart}
          onHoverEnd={onSettingsHoverEnd}
          onClick={onSettingsClick}
        />
      )}
      </svg>
    </>
  );
}
