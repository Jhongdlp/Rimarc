import { useEffect, useState, useSyncExternalStore } from "react";
import { NOTCH, STAGE } from "../design/tokens";
import { call } from "./tauri";

/** Borde de pantalla al que esta pegado el notch. */
export type Edge = "right" | "left" | "top" | "bottom";
/** Hacia donde se despliegan los paneles desde el notch. */
export type PopoverDir = "left" | "right" | "up" | "down";

export interface Placement {
  edge: Edge;
  /** Centro del notch como fraccion del largo del borde, 0 a 1. */
  offset: number;
}

const KEY = "agentnotch.placement";
const EDGES: Edge[] = ["right", "left", "top", "bottom"];
const DEFAULT: Placement = { edge: "right", offset: 0.34 };

/**
 * Todo el front esta maquetado en un unico sistema local: el notch pegado al
 * lado derecho del escenario, creciendo hacia abajo. Para los otros tres bordes
 * no se rehace la maqueta, se gira la columna entera; solo el contenido que
 * tiene que leerse derecho (anillo, etiqueta, engranaje) lleva el giro
 * contrario. Los giros son de 90 grados exactos, nunca espejos: un espejo
 * dejaria el texto del reves.
 */
export const EDGE_ANGLE: Record<Edge, number> = { right: 0, bottom: 90, left: 180, top: -90 };

const EDGE_DIR: Record<Edge, PopoverDir> = { right: "left", left: "right", top: "down", bottom: "up" };

export const isHorizontal = (edge: Edge) => edge === "top" || edge === "bottom";

/**
 * La ventana cubre el borde de punta a punta, asi que el escenario no es una
 * constante: `along` es el largo del borde y `depth` lo que se mete hacia
 * dentro, que si es fijo (`STAGE.width`). El notch se desliza dentro de ese
 * largo por CSS, sin mover la ventana, que es lo que antes lo dejaba fuera de
 * alcance en media pantalla.
 */
export interface Stage {
  along: number;
  depth: number;
}

export function useStage(edge: Edge): Stage {
  const [, bump] = useState(0);
  useEffect(() => {
    const onResize = () => bump((n) => n + 1);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const horizontal = isHorizontal(edge);
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  /*
    Al cambiar de borde la ventana gira, pero `resize` llega un fotograma o dos
    despues de que aqui ya se sepa el borde nuevo. Pintar ese hueco con el
    escenario del borde anterior es el fogonazo al cambiar de lado, asi que
    mientras el viewport no cuadre con el borde se tira de la pantalla, que da
    lo mismo por construccion: la ventana cubre el borde entero.
  */
  const settled = (horizontal ? vh : vw) <= STAGE.width + 1;
  const along = settled
    ? horizontal
      ? vw
      : vh
    : horizontal
      ? window.screen.width
      : window.screen.height;

  return { along, depth: STAGE.width };
}

/**
 * Lleva la columna local (ancho `NOTCH.depth`, largo `stage.along`) a su borde,
 * desplazada `along` sobre el eje del borde. Origen de transformacion 0 0.
 */
export function columnTransform(edge: Edge, stage: Stage, along: number): string {
  const d = NOTCH.depth;
  const { along: L, depth: D } = stage;
  switch (edge) {
    case "left":
      return `translate(${d}px, ${L - along}px) rotate(180deg)`;
    case "top":
      return `translate(${along}px, ${d}px) rotate(-90deg)`;
    case "bottom":
      return `translate(${L - along}px, ${D - d}px) rotate(90deg)`;
    default:
      return `translate(${D - d}px, ${along}px)`;
  }
}

/** Donde y hacia donde sale un panel anclado a la coordenada local `local`. */
export interface Anchor {
  dir: PopoverDir;
  /** Coordenada del ancla sobre el eje largo del notch, ya en la ventana. */
  along: number;
  /** Coordenada del borde interior del notch sobre el eje perpendicular. */
  inner: number;
  /** Extension de la ventana sobre el eje largo, para no salirse. */
  alongMax: number;
}

export function anchorFor(edge: Edge, local: number, stage: Stage): Anchor {
  const d = NOTCH.depth;
  const { along: L, depth: D } = stage;
  const dir = EDGE_DIR[edge];
  switch (edge) {
    // Girados 180 y 90 el notch corre hacia atras sobre su eje largo.
    case "left":
      return { dir, along: L - local, inner: d, alongMax: L };
    case "top":
      return { dir, along: local, inner: d, alongMax: L };
    case "bottom":
      return { dir, along: L - local, inner: D - d, alongMax: L };
    default:
      return { dir, along: local, inner: D - d, alongMax: L };
  }
}

/** Sitio del notch dentro del borde, en px, para una fraccion guardada. */
export function alongFor(offset: number, stage: Stage, notchLength: number): number {
  return clamp(offset * stage.along - notchLength / 2, 0, Math.max(0, stage.along - notchLength));
}

/** La inversa: fraccion del borde donde queda el centro del notch. */
export function offsetFor(along: number, stage: Stage, notchLength: number): number {
  return clamp((along + notchLength / 2) / Math.max(1, stage.along), 0, 1);
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

function read(): Placement {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (raw && EDGES.includes(raw.edge) && typeof raw.offset === "number") {
      return { edge: raw.edge, offset: raw.offset };
    }
  } catch {
    // Sin guardar todavia, o guardado corrupto: al borde por defecto.
  }
  return DEFAULT;
}

let current: Placement = read();
const listeners = new Set<() => void>();

/**
 * Durante el arrastre no se guarda: solo al soltar. Y solo se avisa cuando
 * cambia el borde: el arrastre actualiza `offset` en cada fotograma y repintar
 * a 60 Hz algo que no depende de el es tirar el tiempo.
 */
export function setEdge(edge: Edge) {
  if (edge === current.edge) return;
  current = { ...current, edge };
  listeners.forEach((fn) => fn());
}

export function persistPlacement(offset: number) {
  current = { ...current, offset };
  localStorage.setItem(KEY, JSON.stringify(current));
}

export function savedOffset(): number {
  return current.offset;
}

/** El backend arranca en el borde por defecto y oculto: hay que reponerle lo
 *  guardado, que ademas es lo que destapa la ventana. */
export function syncPlacement() {
  void call("place_notch", { edge: current.edge });
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Borde activo. Es lo unico del emplazamiento que cambia lo que se pinta. */
export function useEdge(): Edge {
  return useSyncExternalStore(subscribe, () => current.edge);
}
