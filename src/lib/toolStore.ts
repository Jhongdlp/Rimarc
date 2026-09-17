import { useSyncExternalStore } from "react";
import { DEFAULT_TOOL_ID, getTool, getAllTools } from "../tools/registry";
import type { NotchTool } from "../tools/types";

const KEY = "agentnotch.activeTool";

function read(): string {
  const saved = localStorage.getItem(KEY);
  if (saved && getTool(saved)) return saved;
  return DEFAULT_TOOL_ID;
}

let currentToolId: string = read();
const listeners = new Set<() => void>();

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === KEY && e.newValue && getTool(e.newValue)) {
      currentToolId = e.newValue;
      listeners.forEach((fn) => fn());
    }
  });
}

export function setActiveTool(id: string) {
  if (id === currentToolId) return;
  if (!getTool(id)) return;
  currentToolId = id;
  localStorage.setItem(KEY, id);
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Hook que devuelve la herramienta activa en el notch */
export function useActiveTool(): NotchTool<any> {
  const id = useSyncExternalStore(subscribe, () => currentToolId);
  return getTool(id) ?? getTool(DEFAULT_TOOL_ID)!;
}

/** Hook que devuelve el ID de la herramienta activa */
export function useActiveToolId(): string {
  return useSyncExternalStore(subscribe, () => currentToolId);
}

export { getAllTools };
