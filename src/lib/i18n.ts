import { useSyncExternalStore } from "react";

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
  },
};

function read(): Lang {
  const saved = localStorage.getItem(KEY);
  if (saved === "es" || saved === "en") return saved;
  return navigator.language.startsWith("es") ? "es" : "en";
}

let lang: Lang = read();
const listeners = new Set<() => void>();

export function setLang(next: Lang) {
  if (next === lang) return;
  lang = next;
  localStorage.setItem(KEY, next);
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Idioma activo y diccionario. Cambiarlo repinta todo lo que llame a este hook. */
export function useI18n(): { lang: Lang; t: Strings } {
  const current = useSyncExternalStore(subscribe, () => lang);
  return { lang: current, t: STRINGS[current] };
}
