import { useEffect } from "react";
import { motion, useSpring, useTransform, type MotionValue } from "framer-motion";
import { NOTCH } from "../design/tokens";
import { GearIcon } from "./icons/AgentIcon";
import { useTheme } from "../lib/theme";

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
  /**
   * Centro del disco. Son los muelles de la silueta, no el destino: el arco de
   * reposo lo unico que hace es asomar por el borde de la punta, asi que si el
   * centro va al valor final el boton se despega mientras el notch crece.
   */
  cx: MotionValue<number>;
  cy: MotionValue<number>;
  /**
   * Giro de la columna. Lo descuenta el glifo y nada mas: el arco tiene que
   * girar CON la silueta o deja de trazar su borde y queda flotando al lado.
   */
  angle: number;
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
 *
 * Todo se dibuja en el origen y es el grupo el que se lleva al centro: asi el
 * centro puede ser un muelle sin repetirlo en cada atributo.
 */
export function SettingsMorph({ cx, cy, angle, open, onHoverStart, onHoverEnd, onClick }: SettingsMorphProps) {
  const { colors } = useTheme();
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
    <motion.g
      style={{ x: cx, y: cy, cursor: "pointer" }}
      onMouseEnter={onHoverStart}
      onMouseLeave={onHoverEnd}
      onClick={onClick}
    >
      {/* Area de agarre: el arco mide 4.5 px, hace falta el pie del disco entero. */}
      <circle cx={0} cy={0} r={R_DISC} fill="transparent" pointerEvents="all" />

      <motion.circle
        cx={0}
        cy={0}
        r={radius}
        fill="none"
        stroke={colors.surface}
        strokeWidth={width}
        strokeLinecap="round"
        strokeDasharray={dash}
        // El guion arranca a las 12; se gira para que el arco caiga donde la
        // referencia lo pone, que es asomando por el borde de la punta.
        transform={`rotate(${-90 + hintStart})`}
        pointerEvents="none"
      />

      {/* El glifo si se endereza: es lo unico que hay que poder leer. */}
      <g transform={angle ? `rotate(${-angle})` : undefined}>
        <motion.g
          initial={false}
          animate={{ opacity: open ? 1 : 0, scale: open ? 1 : 0.55 }}
          transition={{ type: "spring", stiffness: 420, damping: 30 }}
          style={{ transformBox: "fill-box", transformOrigin: "center" }}
          pointerEvents="none"
        >
          <GearIcon
            size={NOTCH.gear.icon}
            color={colors.icon}
            x={-NOTCH.gear.icon / 2}
            y={-NOTCH.gear.icon / 2}
          />
        </motion.g>
      </g>
    </motion.g>
  );
}
