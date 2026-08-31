import { useEffect } from "react";
import { motion, useSpring, useTransform } from "framer-motion";
import { NOTCH, COLOR } from "../design/tokens";
import { GearIcon } from "./icons/AgentIcon";

const R_DISC = NOTCH.gear.size / 2;
const { hintStroke, hintStart, hintSweep } = NOTCH.gear;

/**
 * En reposo el trazo corre por el borde del disco, asi que su linea de centro
 * queda medio grosor por dentro.
 */
const R_REST = R_DISC - hintStroke / 2;
/**
 * Al abrir, el aro se cierra sobre si mismo: con radio R/2 y grosor R el borde
 * interior llega a cero y el exterior queda justo en R. Es decir, el mismo
 * circulo se convierte en disco sin cambiar de elemento.
 */
const R_OPEN = R_DISC / 2;
const REST_FRACTION = hintSweep / 360;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export interface SettingsMorphProps {
  cx: number;
  cy: number;
  open: boolean;
  onHoverStart: () => void;
  onHoverEnd: () => void;
  onClick: () => void;
}

/**
 * Boton de ajustes. Un unico `<circle>` hace todo el recorrido: el arco fino
 * del reposo y el disco lleno del hover son el mismo trazo, engordando hacia
 * dentro mientras el guion barre hasta cerrar la vuelta. Por eso se anima un
 * solo escalar y de ahi salen radio, grosor y guion.
 */
export function SettingsMorph({ cx, cy, open, onHoverStart, onHoverEnd, onClick }: SettingsMorphProps) {
  const progress = useSpring(open ? 1 : 0, { stiffness: 380, damping: 34, mass: 0.7 });
  useEffect(() => {
    progress.set(open ? 1 : 0);
  }, [progress, open]);

  const radius = useTransform(progress, (t) => lerp(R_REST, R_OPEN, t));
  const width = useTransform(progress, (t) => lerp(hintStroke, R_DISC, t));
  const dash = useTransform(progress, (t) => {
    const c = 2 * Math.PI * lerp(R_REST, R_OPEN, t);
    return `${c * lerp(REST_FRACTION, 1, t)} ${c}`;
  });

  return (
    <g
      onMouseEnter={onHoverStart}
      onMouseLeave={onHoverEnd}
      onClick={onClick}
      style={{ cursor: "pointer" }}
    >
      {/* Area de agarre: el arco mide 4.5 px, hace falta el pie del disco entero. */}
      <circle cx={cx} cy={cy} r={R_DISC} fill="transparent" pointerEvents="all" />

      <motion.circle
        cx={cx}
        cy={cy}
        r={radius}
        fill="none"
        stroke={COLOR.surface}
        strokeWidth={width}
        strokeLinecap="round"
        strokeDasharray={dash}
        // El guion arranca a las 12; se gira para que el arco caiga donde la
        // referencia lo pone.
        transform={`rotate(${-90 + hintStart} ${cx} ${cy})`}
        pointerEvents="none"
      />

      <motion.g
        initial={false}
        animate={{ opacity: open ? 1 : 0, scale: open ? 1 : 0.55 }}
        transition={{ type: "spring", stiffness: 420, damping: 30 }}
        style={{ transformBox: "fill-box", transformOrigin: "center" }}
        pointerEvents="none"
      >
        <GearIcon
          size={NOTCH.gear.icon}
          color={COLOR.icon}
          x={cx - NOTCH.gear.icon / 2}
          y={cy - NOTCH.gear.icon / 2}
        />
      </motion.g>
    </g>
  );
}
