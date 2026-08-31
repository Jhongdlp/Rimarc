import { useSyncExternalStore } from "react";

const KEY = "agentnotch.autohide";

/**
 * Cuanto espera el notch sin actividad antes de recogerse. `null` = fijo, no se
 * esconde nunca. Las etiquetas de duracion no se traducen: "5s" se lee igual en
 * los dos idiomas.
 */
export interface AutoHideOption {
  id: string;
  /** ms de espera, o null para dejarlo fijo. */
  delay: number | null;
  label: string | null;
}

export const AUTO_HIDE_OPTIONS: AutoHideOption[] = [
  { id: "2s", delay: 2000, label: "2s" },
  { id: "5s", delay: 5000, label: "5s" },
  { id: "10s", delay: 10000, label: "10s" },
  // Sin etiqueta propia: la pone el diccionario, que si cambia por idioma.
  { id: "pinned", delay: null, label: null },
];

const DEFAULT_ID = "5s";

function read(): string {
  const saved = localStorage.getItem(KEY);
  return AUTO_HIDE_OPTIONS.some((o) => o.id === saved) ? (saved as string) : DEFAULT_ID;
}

let current: string = read();
const listeners = new Set<() => void>();

export function setAutoHide(id: string) {
  if (id === current) return;
  current = id;
  localStorage.setItem(KEY, id);
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Opcion activa. Cambiarla repinta todo lo que llame a este hook. */
export function useAutoHide(): AutoHideOption {
  const id = useSyncExternalStore(subscribe, () => current);
  return AUTO_HIDE_OPTIONS.find((o) => o.id === id) ?? AUTO_HIDE_OPTIONS[1];
}
