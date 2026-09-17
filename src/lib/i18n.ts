import { useSyncExternalStore } from "react";
import { emit, listen } from "@tauri-apps/api/event";
import type { AgentStatus } from "../types";
import { call, inTauri } from "./tauri";

export type Lang = "es" | "en";

const KEY = "agentnotch.lang";

/** Idiomas ofrecidos en el panel, en el orden en que se pintan. */
export const LANGS: { id: Lang; label: string }[] = [
  { id: "es", label: "Español" },
  { id: "en", label: "English" },
];

export interface Strings {
  /** El orden cambia por idioma: "Uso de Claude" pero "Claude Usage". */
  usage: (agent: string) => string;
  daily: string;
  weekly: string;
  tokens: string;
  used: string;
  resets: (when: string) => string;
  noReset: string;
  settings: string;
  language: string;
  theme: string;
  themeLight: string;
  themeDark: string;
  themeSystem: string;
  autoHide: string;
  pinned: string;
  position: string;
  details: string;
  gallery: string;
  tools: string;
  activeTool: string;
  status: Record<AgentStatus, string>;
}

const STRINGS: Record<Lang, Strings> = {
  es: {
    usage: (agent: string) => `Uso de ${agent}`,
    daily: "Diario",
    weekly: "Semanal",
    tokens: "tokens",
    used: "usado",
    resets: (when: string) => `Se reinicia en ${when}`,
    noReset: "Sin ventana de reinicio",
    settings: "Ajustes",
    language: "Idioma",
    theme: "Tema",
    themeLight: "Claro",
    themeDark: "Oscuro",
    themeSystem: "Sistema",
    autoHide: "Ocultar tras",
    pinned: "Fijo",
    position: "Posicion",
    details: "Detalles",
    gallery: "Galería",
    tools: "Herramientas",
    activeTool: "Herramienta Activa",
    status: {
      running: "Ejecutando",
      thinking: "Pensando",
      waitinginput: "Te pregunta",
      idle: "Inactivo",
      toolexecuting: "Usando herramienta",
      editing: "Editando",
      done: "Terminado",
    },
  },
  en: {
    usage: (agent: string) => `${agent} Usage`,
    daily: "Daily",
    weekly: "Weekly",
    tokens: "tokens",
    used: "used",
    resets: (when: string) => `Resets in ${when}`,
    noReset: "No reset window",
    settings: "Settings",
    language: "Language",
    theme: "Theme",
    themeLight: "Light",
    themeDark: "Dark",
    themeSystem: "System",
    autoHide: "Hide after",
    pinned: "Pinned",
    position: "Position",
    details: "Details",
    gallery: "Gallery",
    tools: "Tools",
    activeTool: "Active Tool",
    status: {
      running: "Running",
      thinking: "Thinking",
      waitinginput: "Needs you",
      idle: "Idle",
      toolexecuting: "Running tool",
      editing: "Editing",
      done: "Done",
    },
  },
};

function read(): Lang {
  const saved = localStorage.getItem(KEY);
  if (saved === "es" || saved === "en") return saved;
  return navigator.language.startsWith("es") ? "es" : "en";
}

let lang: Lang = read();
const listeners = new Set<() => void>();

// Cada ventana tiene su copia de este modulo: el cambio viaja como evento de
// Tauri para que el idioma sea global (notch, tienda y portapapeles).
const SYNC_EVENT = "rimarc://lang";

function apply(next: Lang) {
  if (next === lang) return false;
  lang = next;
  localStorage.setItem(KEY, next);
  listeners.forEach((fn) => fn());
  return true;
}

export function setLang(next: Lang) {
  if (!apply(next) || !inTauri) return;
  void emit(SYNC_EVENT, next);
  void call("set_tray_lang", { lang: next });
}

if (inTauri) {
  // Los menus nativos nacen en español: cada ventana les dice el idioma al cargar.
  void call("set_tray_lang", { lang });
  void listen<Lang>(SYNC_EVENT, ({ payload }) => {
    if (payload === "es" || payload === "en") apply(payload);
  });
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Idioma activo y diccionario. Cambiarlo repinta todo lo que llame a este hook.
 * `tr(es, en)` es para textos sueltos de una sola pantalla, que no merecen clave.
 */
export function useI18n(): { lang: Lang; t: Strings; tr: (es: string, en: string) => string } {
  const current = useSyncExternalStore(subscribe, () => lang);
  return { lang: current, t: STRINGS[current], tr: (es, en) => (current === "es" ? es : en) };
}
