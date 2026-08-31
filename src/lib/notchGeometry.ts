import { NOTCH } from "../design/tokens";

/**
 * Silueta del notch.
 *
 * La barra se ancla al borde derecho de la pantalla y entra en el cuerpo a
 * traves de un filete en S formado por dos arcos de circunferencia tangentes
 * (uno concavo contra el borde, otro convexo hacia el cuerpo), arriba y abajo.
 * Ese es el rasgo que se midio en la referencia: el borde izquierdo es recto,
 * y las transiciones ajustan a dos arcos con rms < 0.6 px sobre la imagen x6.
 *
 * Con radio R = flare * depth el barrido de cada arco queda fijo:
 *
 *   depth = 2R(1 - cos t)  =>  cos t = 1 - 1/(2 * flare)
 *
 * es decir, t no depende del ancho. La silueta es autosemejante: se puede
 * animar `depth` y `height` sin que las esquinas cambien de caracter.
 */
const THETA = Math.acos(1 - 1 / (2 * NOTCH.flare));
const SIN_T = Math.sin(THETA);

/** Alto que consume cada transicion en S. Con depth=60 da 53.67 (medido 53.7). */
export function flareRun(depth: number = NOTCH.depth): number {
  return 2 * NOTCH.flare * depth * SIN_T;
}

/** Alto minimo con el que la silueta sigue siendo valida (las dos S se tocan). */
export function minHeight(depth: number = NOTCH.depth): number {
  return 2 * flareRun(depth);
}

/**
 * Genera el path de la silueta dentro de un viewBox cuyo borde derecho es
 * `right`. Se dibuja de punta superior a punta inferior por el lado izquierdo
 * y se cierra por el borde derecho, que queda a ras de la pantalla.
 */
export function notchPath(height: number, depth: number = NOTCH.depth, right: number = depth): string {
  const r = NOTCH.flare * depth;
  const run = 2 * r * SIN_T;
  const h = Math.max(height, 2 * run);

  const left = right - depth;
  // r * (1 - cos t) es exactamente depth / 2, o sea el eje del cuerpo.
  const mid = right - depth / 2;
  const dy = r * SIN_T;

  return [
    `M${round(right)},0`,
    `A${round(r)},${round(r)} 0 0 1 ${round(mid)},${round(dy)}`,
    `A${round(r)},${round(r)} 0 0 0 ${round(left)},${round(run)}`,
    `L${round(left)},${round(h - run)}`,
    `A${round(r)},${round(r)} 0 0 0 ${round(mid)},${round(h - dy)}`,
    `A${round(r)},${round(r)} 0 0 1 ${round(right)},${round(h)}`,
    "Z",
  ].join("");
}

/** Centro vertical del anillo del elemento `index`. */
export function ringCenterY(index: number, depth: number = NOTCH.depth): number {
  return flareRun(depth) + NOTCH.padTop + index * NOTCH.itemPitch;
}

/** Alto total de la silueta, punta a punta, para `count` agentes. */
export function notchHeight(count: number, depth: number = NOTCH.depth): number {
  if (count <= 0) return minHeight(depth);
  const content = NOTCH.padTop + (count - 1) * NOTCH.itemPitch + NOTCH.padBottom;
  return 2 * flareRun(depth) + content;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
