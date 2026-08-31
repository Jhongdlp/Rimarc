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

/** Ventana Tauri (src-tauri/tauri.conf.json). 1 unidad = 1 px logico. */
export const STAGE = { width: 420, height: 600 } as const;

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
 * 1.13, por eso la ventana paso a 420 (ver `WINDOW_WIDTH` en src-tauri).
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
  /** Filas del panel: idioma y auto-ocultado. */
  rows: 2,
} as const;

/** Alto total del panel de ajustes. */
export const SETTINGS_HEIGHT =
  SETTINGS.labelY +
  (SETTINGS.rows - 1) * SETTINGS.rowPitch +
  SETTINGS.labelToControl +
  SETTINGS.control +
  POPOVER.padBottom;

export const COLOR = {
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
} as const;

/**
 * Acento por severidad de consumo. La referencia usa 21% verde, 52% amarillo
 * y 73% naranja, asi que el color codifica el porcentaje, no el agente.
 * Valores muestreados del pixel de mayor croma de cada arco.
 */
export const ACCENT = {
  low: "#1DFC9C",
  mid: "#F5FF2E",
  high: "#FF4A14",
} as const;

export function accentFor(percent: number): string {
  if (percent >= 70) return ACCENT.high;
  if (percent >= 40) return ACCENT.mid;
  return ACCENT.low;
}

export const MOTION = {
  /** Muelle de la silueta. Sin rebote: la barra no debe "saltar" en el escritorio. */
  shape: { stiffness: 260, damping: 32, mass: 0.9 },
  /** Retardo antes de ocultar el engranaje al salir el puntero. */
  hoverCloseMs: 180,
} as const;
