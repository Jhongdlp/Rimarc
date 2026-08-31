import { POPOVER } from "../design/tokens";

/**
 * Silueta del panel de detalle: rectangulo redondeado mas cola triangular
 * saliendo del centro de un lado.
 *
 * Se dibuja siempre con la cola en el lado derecho y despues se gira `rot`
 * grados. Como todos los arcos son circulares, un giro multiplo de 90 no toca
 * ni los radios ni los flags de barrido: basta con mapear los puntos. Girar en
 * vez de escribir cuatro variantes es lo que permite que el notch viva en
 * cualquier borde de la pantalla con un unico path.
 *
 * Ojo: para `rot` de +-90 el llamante pasa `bodyW`/`bodyH` intercambiados, de
 * forma que la caja ya girada quede derecha.
 *
 * El crecimiento va dentro: con `t < 1` todo encoge hacia la punta de la cola,
 * que se queda quieta. Es el mismo string para el `d` del SVG y para el
 * `clip-path` del contenido, y ahi no hay `<g transform>` donde meter nada.
 */
export interface PopoverShape {
  bodyW: number;
  bodyH: number;
  tailLength?: number;
  tailBase?: number;
  /** Y de la punta dentro del cuerpo sin girar. Por defecto, centrada. */
  apex?: number;
  /** Giro en grados: 0, 90, 180 o 270. */
  rot?: number;
  /** Apertura, 0 a 1. */
  t?: number;
}

export function popoverPath({
  bodyW,
  bodyH,
  tailLength = POPOVER.tail.length,
  tailBase = POPOVER.tail.base,
  apex = bodyH / 2,
  rot = 0,
  t = 1,
}: PopoverShape): string {
  // Cerrado del todo no se dibuja nada: si no, la cola se quedaria flotando
  // sobre el escritorio con el panel ya recogido.
  if (bodyW * t < 0.5 || bodyH * t < 0.5) return "";

  // La punta se ancla con la forma abierta del todo, no con la de este frame:
  // asi el panel brota literalmente de ella en vez de aparecer escalado.
  const apexFull = clamp(apex, POPOVER.radius + tailBase / 2, bodyH - POPOVER.radius - tailBase / 2);
  const [tipX, tipY] = tip(rot, bodyW, bodyH, tailLength, apexFull);
  const offX = (1 - t) * tipX;
  const offY = (1 - t) * tipY;

  const w = bodyW * t;
  const h = bodyH * t;
  const tl = tailLength * t;
  const tb = tailBase * t;
  const apexY = apexFull * t;

  const r = Math.min(POPOVER.radius, w / 2, h / 2);
  const tailTip = w + tl;

  // Base de la cola, recortada si el panel aun es mas bajo que ella.
  const half = Math.max(0, Math.min(tb / 2, apexY - r, h - r - apexY));
  const top = apexY - half;
  const bot = apexY + half;

  // Redondeo de la punta: se retrocede por cada lado del triangulo y se pasa
  // una cuadratica con el vertice como punto de control.
  const back = Math.min(POPOVER.tail.apexRound, tl / 3);
  const [ax, ay] = towards(tailTip, apexY, w, top, back);
  const [bx, by] = towards(tailTip, apexY, w, bot, back);

  /** Punto local -> punto final: giro, recolocacion en caja positiva y offset. */
  const p = (x: number, y: number): string => {
    let fx: number;
    let fy: number;
    switch (rot) {
      case 90:
        fx = h - y;
        fy = x;
        break;
      case 180:
        fx = tailTip - x;
        fy = h - y;
        break;
      case 270:
        fx = y;
        fy = tailTip - x;
        break;
      default:
        fx = x;
        fy = y;
    }
    return `${n(fx + offX)},${n(fy + offY)}`;
  };

  return [
    `M${p(r, 0)}`,
    `L${p(w - r, 0)}`,
    `A${n(r)},${n(r)} 0 0 1 ${p(w, r)}`,
    `L${p(w, top)}`,
    `L${p(ax, ay)}`,
    `Q${p(tailTip, apexY)} ${p(bx, by)}`,
    `L${p(w, bot)}`,
    `L${p(w, h - r)}`,
    `A${n(r)},${n(r)} 0 0 1 ${p(w - r, h)}`,
    `L${p(r, h)}`,
    `A${n(r)},${n(r)} 0 0 1 ${p(0, h - r)}`,
    `L${p(0, r)}`,
    `A${n(r)},${n(r)} 0 0 1 ${p(r, 0)}`,
    "Z",
  ].join(" ");
}

/** Punta de la cola, ya girada, con el panel abierto del todo. */
function tip(rot: number, bodyW: number, bodyH: number, tailLength: number, apex: number): [number, number] {
  const far = bodyW + tailLength;
  switch (rot) {
    case 90:
      return [bodyH - apex, far];
    case 180:
      return [0, bodyH - apex];
    case 270:
      return [apex, 0];
    default:
      return [far, apex];
  }
}

/** Esquina superior izquierda del cuerpo dentro de la caja girada. */
export function bodyOrigin(rot: number, tailLength: number): [number, number] {
  if (rot === 180) return [tailLength, 0];
  if (rot === 270) return [0, tailLength];
  return [0, 0];
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
