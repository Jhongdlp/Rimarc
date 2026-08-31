/**
 * Comprobacion de la geometria girada. `pnpm check:geometry`.
 *
 * Dos cosas, que son las que pueden romperse en silencio al mover el notch de
 * borde y no dan error por ningun lado:
 *
 *  1. Que `anchorFor` diga la verdad: el ancla tiene que caer donde la
 *     transformada CSS de `columnTransform` pone de verdad el anillo. Si no
 *     coinciden, el panel apunta a un sitio donde no hay nada.
 *  2. Que la punta de la cola del panel caiga sobre esa ancla en los cuatro
 *     giros. Si falla, el panel sale flotando al lado del notch.
 *
 * Y de paso que el notch alcance las dos puntas del borde, que es lo que no
 * hacia cuando la ventana medida 600 px en vez del borde entero.
 */
import { NOTCH, POPOVER } from "../design/tokens.ts";
import { alongFor, anchorFor, columnTransform, isHorizontal, type Edge, type Stage } from "./placement.ts";
import { popoverPath } from "./popoverPath.ts";

function assert(ok: unknown, msg: string): asserts ok {
  if (!ok) throw new Error(msg);
}

/** Aplica un `translate(...) rotate(...)` de CSS a un punto. */
function applyTransform(css: string, x: number, y: number): [number, number] {
  const t = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(css);
  const r = /rotate\(([-\d.]+)deg\)/.exec(css);
  assert(t, `transformada sin translate: ${css}`);
  const a = ((r ? Number(r[1]) : 0) * Math.PI) / 180;
  const [cos, sin] = [Math.cos(a), Math.sin(a)];
  return [x * cos - y * sin + Number(t[1]), x * sin + y * cos + Number(t[2])];
}

/** La punta es el punto de control de la unica cuadratica del path. */
function tipOf(path: string): [number, number] {
  const q = /Q([-\d.]+),([-\d.]+)/.exec(path);
  assert(q, "el path no tiene cola");
  return [Number(q[1]), Number(q[2])];
}

const ROT = { left: 0, right: 180, up: 90, down: 270 } as const;
const H = 200; // alto de contenido cualquiera
const W = POPOVER.width;
const TAIL = POPOVER.tail.length;

// Pantalla de 1920x1080 con la ventana metida 420 px desde el borde.
const SCREEN = { w: 1920, h: 1080 };
const NOTCH_LEN = 300;
const RING = 120; // un anillo cualquiera dentro de la barra

for (const edge of ["right", "left", "top", "bottom"] as Edge[]) {
  const horiz = isHorizontal(edge);
  const stage: Stage = { along: horiz ? SCREEN.w : SCREEN.h, depth: 420 };

  // Barra a media pantalla y anillo dentro de ella: lejos de todos los topes.
  const slid = alongFor(0.5, stage, NOTCH_LEN);
  const a = anchorFor(edge, slid + RING, stage);

  // 1. El ancla contra donde la transformada pone la columna de verdad.
  const css = columnTransform(edge, stage, slid);
  const flush = applyTransform(css, NOTCH.depth, RING); // punta pegada a la pantalla
  const inner = applyTransform(css, 0, RING); // borde interior de la barra
  const [alongAxis, perpAxis] = horiz ? [0, 1] : [1, 0];

  assert(
    Math.abs(flush[alongAxis] - a.along) < 0.001,
    `${edge}: el ancla dice ${a.along} y la columna pone el anillo en ${flush[alongAxis]}`,
  );
  assert(
    Math.abs(inner[perpAxis] - a.inner) < 0.001,
    `${edge}: el ancla dice ${a.inner} y la barra acaba en ${inner[perpAxis]}`,
  );
  // Y la punta pegada al borde de pantalla, no flotando.
  const screenEdge = edge === "left" || edge === "top" ? 0 : stage.depth;
  assert(Math.abs(flush[perpAxis] - screenEdge) < 0.001, `${edge}: la barra no toca la pantalla`);

  // 2. La cola del panel contra el ancla.
  const sideways = a.dir === "left" || a.dir === "right";
  const boxW = sideways ? W + TAIL : W;
  const boxH = sideways ? H : H + TAIL;
  const localW = sideways ? W : H;
  const localH = sideways ? H : W;

  let left: number;
  let top: number;
  let apex: number;
  if (sideways) {
    top = a.along - H / 2;
    left = a.dir === "left" ? a.inner - POPOVER.gap - boxW : a.inner + POPOVER.gap;
    apex = a.dir === "left" ? a.along - top : H - (a.along - top);
  } else {
    left = a.along - W / 2;
    top = a.dir === "down" ? a.inner + POPOVER.gap : a.inner - POPOVER.gap - boxH;
    apex = a.dir === "down" ? a.along - left : W - (a.along - left);
  }

  const [tx, ty] = tipOf(popoverPath({ bodyW: localW, bodyH: localH, apex, rot: ROT[a.dir] }));
  const tip = [left + tx, top + ty];
  const sign = a.dir === "left" || a.dir === "up" ? 1 : -1;
  const want = sideways
    ? [a.inner - sign * POPOVER.gap, a.along]
    : [a.along, a.inner - sign * POPOVER.gap];

  assert(
    Math.hypot(tip[0] - want[0], tip[1] - want[1]) < 0.05,
    `${edge}: punta en ${tip}, se esperaba ${want}`,
  );

  // 3. El notch tiene que poder llegar a las dos puntas del borde.
  assert(alongFor(0, stage, NOTCH_LEN) === 0, `${edge}: no llega al principio del borde`);
  assert(
    Math.abs(alongFor(1, stage, NOTCH_LEN) - (stage.along - NOTCH_LEN)) < 0.001,
    `${edge}: no llega al final del borde`,
  );
}

console.log("geometria ok en los cuatro bordes");
