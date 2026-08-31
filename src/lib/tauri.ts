import { invoke } from "@tauri-apps/api/core";

/** En `pnpm dev` (navegador suelto) no hay backend: el puente queda inerte. */
export const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T | null> {
  if (!inTauri) return null;
  try {
    return await invoke<T>(cmd, args);
  } catch (err) {
    console.error(`invoke(${cmd}) fallo:`, err);
    return null;
  }
}
