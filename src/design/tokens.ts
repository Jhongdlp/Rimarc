import type { AgentType } from "../types";

/**
 * Design tokens medidos sobre la referencia (Captura 2026-08-31).
 *
 * La referencia es un mockup rotado 15 grados a 233x296 px. Se des-rotó, se
 * escaló x6 y se midieron silueta, anillos y texto por analisis de pixeles.
 * Cada constante lleva su medida original en px-referencia (1x) para poder
 * re-derivarla. Factor de escala aplicado: 60 / 39.67 = 1.5125.
 */

/**
 * Familia compartida por el notch y el panel. Ver la nota de `NOTCH.label`:
 * la referencia usa una grotesca comprimida y esta es la unica instalada que
 * llega a sus metricas.
 */
export const FONT_FAMILY =
  '"Fira Sans Compressed", "SF Compact Display", "Inter Tight", "Roboto Condensed", system-ui, sans-serif';

/**
 * `width` es lo que se mete la ventana hacia dentro desde el borde de pantalla
 * (`STAGE_DEPTH` en src-tauri); el otro eje lo cubre entero, asi que el largo
 * de la ventana no es una constante — sale de `useStage`. `height` es el largo
 * del lienzo local en el que se dibuja la barra, que se desliza dentro de ese
 * borde: tiene que dar para `notchHeight(MAX_ITEMS)` mas el boton.
 * 1 unidad = 1 px logico.
 */
export const STAGE = { width: 560, height: 600 } as const;

export const NOTCH = {
  /** Ancho del cuerpo de la barra. Medido 39.67 -> 60. */
  depth: 60,

  /**
   * Radio de los arcos del filete en S, como fraccion del ancho.
   * Medido: R = 17.8 sobre ancho 39.67 => 0.4487. Se usa 0.45 exacto porque
   * hace que el angulo de barrido sea constante y la silueta autosemejante,
   * lo que permite morphear el ancho sin deformar las esquinas.
   */
  flare: 0.45,

  ring: {
    /** Diametro exterior del anillo. Medido 25.0 -> 37.8. */
    size: 38,
    /** Grosor del trazo (track y progreso comparten radio y grosor). Medido 3.0 -> 4.5. */
    stroke: 4.5,
    /** Lado del icono centrado. Medido 12.3 -> 18.7. */
    icon: 19,
  },

  /** Distancia centro-anillo a centro-anillo. Medido 58.79 -> 88.9. */
  itemPitch: 89,
  /** Centro del anillo al centro de su etiqueta. Medido 22.9 -> 34.6. */
  labelOffset: 35,
  /**
   * Etiqueta de porcentaje. En la referencia la caja de "73%" mide 25.0 x 11.0
   * a esta escala: aspecto 2.27, o sea una grotesca comprimida, no una de
   * ancho normal. Noto Sans o Cantarell necesitarian -0.21 em de tracking para
   * llegar a ese ancho (los glifos se solaparian); Fira Sans Compressed 600 a
   * 16.2 px da 24.9 x 11.0 con tracking cero. `size` sale de fijar la altura de
   * mayuscula en 11.0 px, que es lo que se midio.
   */
  label: {
    size: 16.2,
    weight: 600,
    tracking: "0",
    family: FONT_FAMILY,
  },

  /** Del inicio del tramo recto al centro del primer anillo. Medido 11.83 -> 17.9. */
  padTop: 18,
  /** Del centro del ultimo anillo al fin del tramo recto. Medido 26.25 -> 39.7. */
  padBottom: 40,

  /**
   * Estado recogido: la misma silueta con menos fondo y menos alto. Tiene que
   * caber en la mascara "peek" que expone el backend, que son 40 x 72 px
   * logicos pegados a la esquina superior derecha (ver `update_input_shape`).
   */
  peek: { depth: 26, height: 68, dot: 2, dotPitch: 6.5 },

  /**
   * Estado dormido: recogido y sin ningun agente. Sin puntos que ensenar el
   * notch no tiene nada que decir, asi que se encoge a una astilla translucida
   * — casi el filete en S y nada mas. En cuanto aparece un agente vuelve a
   * `peek` por el mismo muelle que anima la silueta.
   *
   * `hit` es lo que se puede senalar aunque no se vea: la mascara de input del
   * backend es mas profunda que la astilla, y sin un blanco de ese tamano el
   * puntero cae en la region sin tocar el path y el notch no se despliega.
   */
  dormant: { depth: 13, height: 34, opacity: 0.5, hit: 40 },

  /** Marca del notch vacio desplegado: un anillo apagado, sin aguja. */
  idle: { radius: 8.5, stroke: 2, dot: 2 },

  /**
   * Boton de ajustes, centrado en la punta inferior de la silueta.
   *
   * En reposo no se ve el disco sino solo un arco sobre su borde superior
   * derecho: es la "linea" del segundo mockup. Medido sobre el panel izquierdo
   * de la referencia (ajuste de circunferencia al trazo, rms bajo):
   *   centro    31.7 px a la izquierda del borde y 3.3 bajo la punta, o sea el
   *             mismo punto que el disco del panel derecho dentro del error de
   *             medida; se usa ese punto para los dos y asi el morph cierra.
   *   radio     19.7 de linea de centro  ->  borde exterior 21.9 ~= el disco.
   *   barrido   la caja del trazo pintado va de 9.3 a 37.6 px a la izquierda
   *             del borde; descontando remate redondo y desenfoque eso situa
   *             el arco entre -14 y +93 grados horarios desde las 12.
   */
  gear: {
    size: 42,
    icon: 23,
    /** Trazo del arco en reposo. */
    hintStroke: 4.5,
    /** Grados horarios desde las 12 donde arranca el arco. */
    hintStart: -14,
    /** Barrido del arco en reposo. */
    hintSweep: 107,
  },
} as const;

/**
 * Panel de detalle, medido sobre la tercera referencia (mockup rotado -15
 * grados, des-rotado y escalado x6 igual que el resto). La escala de ESE
 * mockup se fijo con dos anclas independientes del propio notch que ya
 * conocemos: el paso entre anillos (379.25 px(6x) = 89) y el radio de linea de
 * centro del track (70.75 = 16.75). Ambas dan 0.2347 y 0.2367; se uso 0.2357.
 *
 * El panel muestra el detalle de UN agente: la barra naranja repite el
 * porcentaje del anillo (diario) y la verde es el semanal. Por eso el color de
 * relleno sale del mismo `accentFor` que los anillos - se comprobo que el
 * lavado de color de esa captura afecta por igual al anillo y a la barra.
 */
/**
 * Aumento sobre lo medido. La referencia se lee apretada a tamano real, asi que
 * `SCALE` agranda el panel entero y `AIR` estira ademas el ritmo vertical, que
 * es donde mas se notaba. Poner los dos a 1 devuelve el panel exacto de la
 * referencia. Es lo unico de este archivo que no sale de una medida.
 *
 * El techo lo pone el ancho de la ventana: hueco + cola + panel tienen que
 * caber en `STAGE.width - NOTCH.depth`. Con los 340 px originales el maximo era
 * 1.13, por eso la ventana paso a 420 y luego a 560 (`STAGE_DEPTH` en
 * src-tauri): en un borde horizontal la carta cuelga del notch y el cajon de
 * ella, asi que la ventana tiene que dar para notch + hueco + cola + carta +
 * cajon con los `MAX_ITEMS` agentes. `pnpm check:geometry` lo comprueba.
 */
const POPOVER_SCALE = 1.25;
const POPOVER_AIR = 1.15;

const V = POPOVER_SCALE * POPOVER_AIR;

export const POPOVER = {
  /** Cuerpo sin la cola. Medido 899 x 535 px(6x) = 212 de ancho. */
  width: 212 * POPOVER_SCALE,
  /** Radio de esquina. Ajustado sobre el perfil del borde: 77 px(6x) = 18. */
  radius: 18 * POPOVER_SCALE,
  padX: 10 * POPOVER_SCALE,
  padTop: 11 * V,
  padBottom: 14 * V,

  /**
   * Cola triangular, centrada en la vertical del panel y apuntando al anillo.
   * Base 98 y largo 105 px(6x) = 23 y 25. La punta no es afilada del todo: el
   * maximo en x se sostiene unas cuatro filas, o sea ~1.5 px de radio.
   */
  tail: {
    length: 25 * POPOVER_SCALE,
    base: 23 * POPOVER_SCALE,
    apexRound: 3 * POPOVER_SCALE,
  },
  /** De la punta de la cola al borde izquierdo del notch. Medido 55 px(6x). */
  gap: 13 * POPOVER_SCALE,

  /** Cabecera: icono del agente y titulo. */
  icon: 16 * POPOVER_SCALE,
  iconGap: 5.5 * POPOVER_SCALE,
  headerTop: 10.6 * V,

  /**
   * Ritmo vertical. `sectionFirst` es el centro de la primera fila
   * etiqueta/valor; dentro de cada seccion los tres elementos van a 13 px de
   * distancia entre centros, medidos 12.9 y 12.9.
   */
  sectionFirst: 39.8 * V,
  sectionPitch: 43 * V,
  rowToBar: 13 * V,
  barToCaption: 13 * V,

  /** Alto de la barra de progreso. Medido 21 px(6x) = 5. Extremos redondeados. */
  barHeight: 5 * POPOVER_SCALE,

  /**
   * Cajon de detalle: crece por debajo de la carta al pasar por su boton. Es
   * mas ancho que ella y se mete `overlap` px por detras; como comparten
   * superficie y no hay borde, las dos siluetas se leen como una sola (es el
   * boceto). Sobresale `bleed` px hacia el lado contrario a la cola — hacia el
   * otro se comeria el hueco que lo separa del notch. `pnpm check:geometry`
   * comprueba que lo que sobresale sigue cabiendo en la ventana.
   */
  drawer: {
    bleed: 44,
    /** No puede bajar del radio de esquina o el canto compartido se estrecha. */
    overlap: 18 * POPOVER_SCALE,
    /** Sitio del boton dentro de la carta, medido desde su base. */
    foot: 15,
    chevron: 11,

    /**
     * Una fila por agente vivo: glifo, proyecto y porcentaje arriba, que hace
     * y donde debajo, y la barra de consumo cerrando la fila de lado a lado.
     * La barra hace de separador, asi que no hay reglas ni cajas.
     */
    rowFirst: 14,
    rowPitch: 38,
    rowHeight: 30,
    /** Del glifo al texto, y alto de la linea de consumo. */
    icon: 15,
    iconGap: 8,
    bar: 2.5,
    /** Linea de cierre con modelo, contexto y coste del agente elegido. */
    footer: 18,
    padBottom: 12,
    /** Fila sin elegir: presente pero en segundo plano. */
    dim: 0.45,
    text: { name: 12.5, meta: 10, value: 11 },
  },

  /**
   * Tamanos derivados de la altura de mayuscula medida en cada franja:
   * titulo 10.6, etiqueta 8.0, valor 6.8, pie 7.8.
   */
  text: {
    title: 15.5 * POPOVER_SCALE,
    label: 12 * POPOVER_SCALE,
    value: 10 * POPOVER_SCALE,
    caption: 11.5 * POPOVER_SCALE,
  },
} as const;

/**
 * Panel de ajustes. Comparte concha, ancho y sangrados con `POPOVER`; aqui solo
 * viven el ritmo vertical propio y el alto del segmentado.
 */
export const SETTINGS = {
  /** Centro de la fila de etiqueta, al mismo ritmo que la primera fila del panel. */
  labelY: POPOVER.sectionFirst,
  /** Del centro de la etiqueta al borde superior del control. */
  labelToControl: 12,
  /** Alto del segmentado de opciones. */
  control: 24,
  /** Del centro de una etiqueta al centro de la siguiente. */
  rowPitch: 52,
  /** Filas del panel: idioma, tema, auto-ocultado y posicion. */
  rows: 4,
} as const;

/** Con 5 agentes el notch mas el boton ya rozan los 600 px de lienzo. */
export const MAX_ITEMS = 5;

/** Alto del cajon de detalle para `n` agentes. */
export function drawerHeight(n: number): number {
  const d = POPOVER.drawer;
  return (
    d.rowFirst + Math.max(0, n - 1) * d.rowPitch + d.rowHeight + d.footer + d.padBottom
  );
}

/** Alto total del panel de ajustes. */
export const SETTINGS_HEIGHT =
  SETTINGS.labelY +
  (SETTINGS.rows - 1) * SETTINGS.rowPitch +
  SETTINGS.labelToControl +
  SETTINGS.control +
  POPOVER.padBottom;

export interface ThemeColors {
  /** Color de fondo de la barra y conchas. */
  surface: string;
  /** Track del anillo y barras de consumo. */
  track: string;
  /** Etiquetas principales (porcentaje, pastilla activa). */
  label: string;
  /** Iconos de agente y engranaje. */
  icon: string;
  /** Titulo de cabecera. */
  title: string;
  /** Jerarquia del panel de detalle. */
  detailLabel: string;
  detailCaption: string;
  detailValue: string;
}

export const DARK_COLORS: ThemeColors = {
  /** La barra es negro puro en la referencia (lum media medida < 1). */
  surface: "#000000",
  /** Track del anillo. Meseta de luminancia medida ~50. */
  track: "#323232",
  /** Etiquetas. Pico medido 227 sobre texto de 7px con blur => blanco ~93%. */
  label: "rgba(255,255,255,0.93)",
  icon: "#FFFFFF",
  /** Jerarquia del panel de detalle. Picos medidos: 254 / 248 / 228 / 128. */
  title: "#FFFFFF",
  detailLabel: "rgba(255,255,255,0.95)",
  detailCaption: "rgba(255,255,255,0.86)",
  detailValue: "rgba(255,255,255,0.55)",
};

export const LIGHT_COLORS: ThemeColors = {
  /** La barra es blanco puro en modo claro. */
  surface: "#FFFFFF",
  /** Track del anillo en gris claro suave sobre la superficie blanca. */
  track: "#E5E7EB",
  /** Etiquetas en negro de alto contraste. */
  label: "rgba(0,0,0,0.92)",
  icon: "#000000",
  /** Jerarquia del panel de detalle en modo claro. */
  title: "#000000",
  detailLabel: "rgba(0,0,0,0.92)",
  detailCaption: "rgba(0,0,0,0.68)",
  detailValue: "rgba(0,0,0,0.48)",
};

export function getThemeColors(isDark = true): ThemeColors {
  return isDark ? DARK_COLORS : LIGHT_COLORS;
}

export const COLOR = DARK_COLORS;

export const AGENT_COLOR_DARK: Record<AgentType, string> = {
  claude: "#FF4A14", // Naranja neón original de la referencia
  codex: "#FFFFFF", // Blanco de la marca OpenAI
  antigravity: "#00D2FF", // Azul eléctrico neón
  opencode: "#F5FF2E", // Amarillo neón de la referencia
  aider: "#E040FB", // Púrpura neón
  copilot: "#00F5D4", // Cyan neón
  unknown: "#E2E8F0",
};

export const AGENT_COLOR_LIGHT: Record<AgentType, string> = {
  claude: "#E8440C",
  codex: "#111827",
  antigravity: "#0284C7",
  opencode: "#D97706",
  aider: "#A855F7",
  copilot: "#0D9488",
  unknown: "#64748B",
};

export const AGENT_COLOR = AGENT_COLOR_DARK;

export function agentColor(type: AgentType, isDark = true): string {
  const map = isDark ? AGENT_COLOR_DARK : AGENT_COLOR_LIGHT;
  return map[type] ?? map.unknown;
}

/**
 * Acento por severidad de consumo (opcional / fallback).
 * Valores muestreados del pixel de mayor croma de cada arco.
 */
export const ACCENT_DARK = {
  low: "#1DFC9C",
  mid: "#F5FF2E",
  high: "#FF4A14",
} as const;

export const ACCENT_LIGHT = {
  low: "#10B981",
  mid: "#D97706",
  high: "#E8440C",
} as const;

export const ACCENT = ACCENT_DARK;

export function accentFor(percent: number, isDark = true): string {
  const acc = isDark ? ACCENT_DARK : ACCENT_LIGHT;
  if (percent >= 70) return acc.high;
  if (percent >= 40) return acc.mid;
  return acc.low;
}

export const MOTION = {
  /** Muelle de la silueta. Sin rebote: la barra no debe "saltar" en el escritorio. */
  shape: { stiffness: 260, damping: 32, mass: 0.9 },
  /** Retardo antes de ocultar el engranaje al salir el puntero. */
  hoverCloseMs: 180,
} as const;
