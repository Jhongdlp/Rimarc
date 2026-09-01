import { useSyncExternalStore } from "react";
import { getThemeColors, type ThemeColors } from "../design/tokens";

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

export function useTheme(): {
  theme: ThemeMode;
  resolvedTheme: ResolvedTheme;
  isDark: boolean;
  colors: ThemeColors;
  setTheme: (theme: ThemeMode) => void;
} {
  const mode = useSyncExternalStore(subscribe, () => currentTheme);
  const sys = useSyncExternalStore(subscribe, () => systemTheme);
  const resolvedTheme: ResolvedTheme = mode === "system" ? sys : mode;
  const isDark = resolvedTheme === "dark";
  const colors = getThemeColors(isDark);

  return {
    theme: mode,
    resolvedTheme,
    isDark,
    colors,
    setTheme,
  };
}
