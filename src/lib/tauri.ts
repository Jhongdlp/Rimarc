import { invoke } from "@tauri-apps/api/core";

/** En `pnpm dev` (navegador suelto) no hay backend: el puente queda inerte. */
export const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/**
 * Obtiene la etiqueta (label) de la ventana actual ("main" para el Notch dock, "store" para la tienda).
 */
export function getTauriWindowLabel(): string | null {
  if (typeof window === "undefined") return null;

  // 1. Detección por parámetro URL (definido en tauri.conf.json)
  try {
    const params = new URLSearchParams(window.location.search);
    const v = params.get("view") || params.get("window");
    if (v === "main" || v === "notch") return "main";
    if (v === "store") return "store";
    if (v === "clipboard") return "clipboard";
    if (v === "clipboard-settings") return "clipboard-settings";
  } catch {}

  // 2. Detección por hash
  if (window.location.hash === "#notch") return "main";
  if (window.location.hash === "#store") return "store";
  if (window.location.hash === "#clipboard") return "clipboard";

  // 3. Detección nativa por metadatos de Tauri v2
  try {
    const internals = (window as any).__TAURI_INTERNALS__;
    if (internals?.metadata?.currentWindow?.label) {
      return internals.metadata.currentWindow.label as string;
    }
    if (internals?.metadata?.currentWebview?.label) {
      return internals.metadata.currentWebview.label as string;
    }
  } catch {}

  return null;
}

export async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T | null> {
  if (!inTauri) return null;
  try {
    return await invoke<T>(cmd, args);
  } catch (err) {
    console.error(`invoke(${cmd}) fallo:`, err);
    return null;
  }
}
