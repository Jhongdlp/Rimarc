import { createContext, createElement, useContext, useSyncExternalStore, type ReactNode } from "react";
import { emit, listen } from "@tauri-apps/api/event";
import { getThemeColors, type ThemeColors } from "../design/tokens";
import { inTauri } from "./tauri";

export type ThemeMode = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const KEY = "agentnotch.theme";
const DEFAULT_THEME: ThemeMode = "system";

export const THEME_OPTIONS: { id: ThemeMode }[] = [
  { id: "light" },
  { id: "dark" },
  { id: "system" },
];

function read(): ThemeMode {
  const saved = localStorage.getItem(KEY);
  if (THEME_OPTIONS.some((o) => o.id === saved)) return saved as ThemeMode;
  return DEFAULT_THEME;
}

let currentTheme: ThemeMode = read();
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((fn) => fn());
}

export function setTheme(next: ThemeMode) {
  if (next === currentTheme) return;
  currentTheme = next;
  localStorage.setItem(KEY, next);
  notify();
  broadcast();
}

/**
 * Preferencias del portapapeles (carta y ventana de ajustes). `auto` pinta un
 * gris que contrasta con el tema: claro sobre la carta negra, oscuro sobre la blanca.
 */
export type BorderMode = "none" | "auto" | "custom";
export type ClipboardPrefs = {
  /** Tema propio del portapapeles, independiente del de la app (notch y tienda). */
  theme: ThemeMode;
  border: BorderMode;
  /** Color de `custom`, uno de `PALETTE`. */
  borderColor: string;
  borderWidth: 1 | 2 | 3;
  /** Multiplica los tamaños de letra de la carta. */
  fontScale: number;
  /** `null` = el color de texto del tema, sin acento. */
  accent: string | null;
  /** Opacidad del fondo de la carta. */
  surfaceOpacity: number;
  density: "compact" | "comfy";
  previewLines: 1 | 2 | 3;
  historyLimit: 25 | 50 | 100;
  closeOnCopy: boolean;
};
const PREFS_KEY = "agentnotch.clipboardPrefs";
const DEFAULT_PREFS: ClipboardPrefs = {
  theme: "system",
  border: "none",
  borderColor: "#0A84FF",
  borderWidth: 2,
  fontScale: 1,
  accent: null,
  surfaceOpacity: 1,
  density: "comfy",
  previewLines: 1,
  historyLimit: 25,
  closeOnCopy: true,
};
const readPrefs = (): ClipboardPrefs => {
  try {
    return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") };
  } catch {
    return DEFAULT_PREFS;
  }
};
let currentPrefs: ClipboardPrefs = readPrefs();

export function setClipboardPrefs(patch: Partial<ClipboardPrefs>) {
  currentPrefs = { ...currentPrefs, ...patch };
  localStorage.setItem(PREFS_KEY, JSON.stringify(currentPrefs));
  notify();
  broadcast();
}

export function resetClipboardPrefs() {
  setClipboardPrefs(DEFAULT_PREFS);
}

/** Colores que ofrecen el acento y el borde: los del sistema de Apple, legibles en los dos temas. */
export const PALETTE = [
  { color: "#0A84FF", label: "Azul", en: "Blue" },
  { color: "#BF5AF2", label: "Morado", en: "Purple" },
  { color: "#FF375F", label: "Rosa", en: "Pink" },
  { color: "#FF453A", label: "Rojo", en: "Red" },
  { color: "#FF9F0A", label: "Naranja", en: "Orange" },
  { color: "#FFD60A", label: "Amarillo", en: "Yellow" },
  { color: "#30D158", label: "Verde", en: "Green" },
  { color: "#64D2FF", label: "Cian", en: "Cyan" },
];

export const useClipboardPrefs = () => useSyncExternalStore(subscribe, () => currentPrefs);

/** Color resuelto del borde, o `undefined` sin borde. */
export function borderColorFor(prefs: ClipboardPrefs, isDark: boolean): string | undefined {
  switch (prefs.border) {
    case "none":
      return undefined;
    case "auto":
      return isDark ? "#A1A1A6" : "#48484A";
    default:
      return prefs.borderColor;
  }
}

// Cada ventana tiene su propia copia de este modulo, y el evento `storage` no
// cruza entre webviews de WebKitGTK: los cambios viajan como evento de Tauri con
// los valores dentro, sin depender de que el localStorage de la otra ya este al dia.
const SYNC_EVENT = "rimarc://appearance";
type SyncPayload = { theme: ThemeMode; prefs: ClipboardPrefs };

function broadcast() {
  if (inTauri) void emit(SYNC_EVENT, { theme: currentTheme, prefs: currentPrefs } satisfies SyncPayload);
}

if (inTauri) {
  void listen<SyncPayload>(SYNC_EVENT, ({ payload }) => {
    currentTheme = payload.theme;
    currentPrefs = { ...DEFAULT_PREFS, ...payload.prefs };
    notify();
  });
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined" || !window.matchMedia) return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

let systemTheme: ResolvedTheme = getSystemTheme();

if (typeof window !== "undefined" && window.matchMedia) {
  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  const onChange = (e: MediaQueryListEvent) => {
    systemTheme = e.matches ? "dark" : "light";
    notify();
  };
  if (mediaQuery.addEventListener) {
    mediaQuery.addEventListener("change", onChange);
  } else {
    // Fallback for older WebKit / Safari
    mediaQuery.addListener(onChange);
  }
}

/**
 * Tema de un subarbol que no sigue al global: dentro, `useTheme` (y todo lo que
 * lo usa, como `Popover`) lee y escribe este en su lugar.
 */
const ThemeScopeCtx = createContext<{ mode: ThemeMode; set: (mode: ThemeMode) => void } | null>(null);

/** Las ventanas del portapapeles: su tema vive en `ClipboardPrefs.theme`. */
export function ClipboardThemeScope({ children }: { children: ReactNode }) {
  const { theme } = useClipboardPrefs();
  return createElement(
    ThemeScopeCtx.Provider,
    { value: { mode: theme, set: (mode: ThemeMode) => setClipboardPrefs({ theme: mode }) } },
    children,
  );
}

/** Tema propio de la tienda, independiente del notch. Solo hay una ventana: no se difunde. */
const STORE_KEY = "agentnotch.storeTheme";
let storeTheme: ThemeMode = (() => {
  const saved = localStorage.getItem(STORE_KEY);
  return THEME_OPTIONS.some((o) => o.id === saved) ? (saved as ThemeMode) : read();
})();

function setStoreTheme(next: ThemeMode) {
  storeTheme = next;
  localStorage.setItem(STORE_KEY, next);
  notify();
}

export function StoreThemeScope({ children }: { children: ReactNode }) {
  const mode = useSyncExternalStore(subscribe, () => storeTheme);
  return createElement(ThemeScopeCtx.Provider, { value: { mode, set: setStoreTheme } }, children);
}

export function useTheme(): {
  theme: ThemeMode;
  resolvedTheme: ResolvedTheme;
  isDark: boolean;
  colors: ThemeColors;
  setTheme: (theme: ThemeMode) => void;
} {
  const scope = useContext(ThemeScopeCtx);
  const globalMode = useSyncExternalStore(subscribe, () => currentTheme);
  const mode = scope?.mode ?? globalMode;
  const sys = useSyncExternalStore(subscribe, () => systemTheme);
  const resolvedTheme: ResolvedTheme = mode === "system" ? sys : mode;
  const isDark = resolvedTheme === "dark";
  const colors = getThemeColors(isDark);

  return {
    theme: mode,
    resolvedTheme,
    isDark,
    colors,
    setTheme: scope?.set ?? setTheme,
  };
}
