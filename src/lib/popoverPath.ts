import { POPOVER } from "../design/tokens";

/**
 * Silueta del panel de detalle: rectangulo redondeado mas cola triangular
 * saliendo del centro del lado derecho.
 *
 * El origen del viewBox es la esquina superior izquierda del cuerpo, asi que la
 * punta de la cola cae en (bodyW + tail.length, bodyH / 2). Igual que la
 * silueta del notch, el path se regenera desde los escalares animados: al
 * abrirse el cuerpo crece desde ancho cero y el panel sale literalmente de la
 * punta, sin escalados ni fundidos entre formas.
 */
export interface PopoverShape {
  bodyW: number;
  bodyH: number;
  tailLength?: number;
  tailBase?: number;
  /** Y de la punta dentro del cuerpo. Por defecto, centrada. */
  apex?: number;
  /**
   * Desplazamiento del path dentro de su caja. Se necesita porque el mismo
   * string se usa como `d` del SVG y como `clip-path` del contenido HTML, y ahi
   * no hay un `<g transform>` donde meter el corrimiento.
   */
  ox?: number;
  oy?: number;
}

export function popoverPath({
  bodyW,
  bodyH,
  tailLength = POPOVER.tail.length,
  tailBase = POPOVER.tail.base,
  apex = bodyH / 2,
  ox = 0,
  oy = 0,
}: PopoverShape): string {
  // Cerrado del todo no se dibuja nada: si no, la cola se quedaria flotando
  // sobre el escritorio con el panel ya recogido.
  if (bodyW < 0.5 || bodyH < 0.5) return "";

  const r = Math.min(POPOVER.radius, bodyW / 2, bodyH / 2);
  // La punta no puede meterse en las esquinas redondeadas.
  const apexY = clamp(apex, r + tailBase / 2, bodyH - r - tailBase / 2);
  const tipX = bodyW + tailLength;

  // Base de la cola, recortada si el panel aun es mas bajo que ella.
  const half = Math.max(0, Math.min(tailBase / 2, apexY - r, bodyH - r - apexY));
  const top = apexY - half;
  const bot = apexY + half;

  // Redondeo de la punta: se retrocede por cada lado del triangulo y se pasa
  // una cuadratica con el vertice como punto de control.
  const back = Math.min(POPOVER.tail.apexRound, tailLength / 3);
  const [ax, ay] = towards(tipX, apexY, bodyW, top, back);
  const [bx, by] = towards(tipX, apexY, bodyW, bot, back);

  const px = (v: number) => n(v + ox);
  const py = (v: number) => n(v + oy);

  return [
    `M${px(r)},${py(0)}`,
    `L${px(bodyW - r)},${py(0)}`,
    `A${n(r)},${n(r)} 0 0 1 ${px(bodyW)},${py(r)}`,
    `L${px(bodyW)},${py(top)}`,
    `L${px(ax)},${py(ay)}`,
    `Q${px(tipX)},${py(apexY)} ${px(bx)},${py(by)}`,
    `L${px(bodyW)},${py(bot)}`,
    `L${px(bodyW)},${py(bodyH - r)}`,
    `A${n(r)},${n(r)} 0 0 1 ${px(bodyW - r)},${py(bodyH)}`,
    `L${px(r)},${py(bodyH)}`,
    `A${n(r)},${n(r)} 0 0 1 ${px(0)},${py(bodyH - r)}`,
    `L${px(0)},${py(r)}`,
    `A${n(r)},${n(r)} 0 0 1 ${px(r)},${py(0)}`,
    "Z",
  ].join(" ");
}

/** Punto a distancia `d` de (x0,y0) en direccion a (x1,y1). */
function towards(x0: number, y0: number, x1: number, y1: number, d: number): [number, number] {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  return [x0 + (dx / len) * d, y0 + (dy / len) * d];
}

/** Alto del panel para `sections` secciones. */
export function popoverHeight(sections: number): number {
  const lastCaption =
    POPOVER.sectionFirst +
    Math.max(0, sections - 1) * POPOVER.sectionPitch +
    POPOVER.rowToBar +
    POPOVER.barToCaption;
  return lastCaption + POPOVER.text.caption * 0.34 + POPOVER.padBottom;
}

function clamp(v: number, lo: number, hi: number): number {
  return hi < lo ? (lo + hi) / 2 : Math.min(Math.max(v, lo), hi);
}

function n(v: number): number {
  return Math.round(v * 100) / 100;
}
