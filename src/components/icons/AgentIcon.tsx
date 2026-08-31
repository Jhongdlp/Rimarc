import type { AgentType } from "../../types";
import { rosettePath } from "./shapes";
import { ClaudeMark, OpenCodeMark, AntigravityMark } from "./brand";

/**
 * Glifo de agente sobre un lienzo de 24x24, escalado por el consumidor.
 *
 * Claude, OpenAI, OpenCode y Antigravity usan las marcas reales de
 * `public/Icons/`. `aider` y `copilot` todavia no tienen asset, asi que llevan
 * marcas propias en el mismo lenguaje.
 */
export interface AgentIconProps {
  type: AgentType;
  size?: number;
  color?: string;
}

const BOX = 24;
const C = BOX / 2;

/**
 * Correccion optica: cada marca llena su lienzo de forma distinta, y a 19 px
 * dentro de un anillo de 38 la diferencia se nota. 1 = ocupa el lienzo entero.
 */
const OPTICAL: Partial<Record<AgentType, number>> = {
  // El bloque de OpenCode es macizo: a igualdad de caja pesa mucho mas que un
  // trazo, asi que se baja un punto.
  opencode: 0.95,
};

export function AgentIcon({ type, size = 19, color = "#FFFFFF" }: AgentIconProps) {
  const scale = OPTICAL[type] ?? 1;
  return (
    <svg
      width={size * scale}
      height={size * scale}
      viewBox={`0 0 ${BOX} ${BOX}`}
      fill="none"
      aria-hidden
      focusable="false"
    >
      {glyph(type, color)}
    </svg>
  );
}

function glyph(type: AgentType, color: string) {
  switch (type) {
    case "claude":
      return <ClaudeMark color={color} />;
    case "opencode":
      return <OpenCodeMark color={color} />;
    case "antigravity":
      return <AntigravityMark extent={BOX} color={color} />;
    case "aider":
      return <Caret color={color} />;
    case "copilot":
      return <Visor color={color} />;
    default:
      return <circle cx={C} cy={C} r={3.4} fill={color} />;
  }
}

/** Doble chevron. */
function Caret({ color }: { color: string }) {
  return (
    <g stroke={color} strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round" fill="none">
      <path d="M8.5 7.5 4 12l4.5 4.5" />
      <path d="M15.5 7.5 20 12l-4.5 4.5" />
    </g>
  );
}

/** Visera redondeada. */
function Visor({ color }: { color: string }) {
  return (
    <g fill="none" stroke={color} strokeWidth={1.9} strokeLinecap="round">
      <path d={rosettePath(8.6, 1.1, 4, C, C)} />
      <circle cx={9.4} cy={11.4} r={1.5} fill={color} stroke="none" />
      <circle cx={14.6} cy={11.4} r={1.5} fill={color} stroke="none" />
    </g>
  );
}

/**
 * Engranaje del boton de ajustes. Medido en la referencia: linea de centro del
 * cuerpo a r = 8.8 con lobulos de +-1.4, seis lobulos, trazo 2.4, y un anillo
 * interior a r = 3.0 con el mismo trazo (todo relativo a un disco de 42).
 */
export interface GearIconProps {
  size?: number;
  color?: string;
  /** Permiten colocar el glifo dentro de un SVG padre. */
  x?: number;
  y?: number;
}

export function GearIcon({ size = 23, color = "#FFFFFF", x, y }: GearIconProps) {
  const s = BOX / 23; // los radios medidos estan en unidades de glifo de 23 px
  return (
    <svg
      x={x}
      y={y}
      width={size}
      height={size}
      viewBox={`0 0 ${BOX} ${BOX}`}
      fill="none"
      aria-hidden
      focusable="false"
    >
      <g stroke={color} strokeWidth={2.4 * s} strokeLinejoin="round" fill="none">
        <path d={rosettePath(8.8 * s, 1.4 * s, 6, C, C)} />
        <circle cx={C} cy={C} r={3.0 * s} />
      </g>
    </svg>
  );
}
