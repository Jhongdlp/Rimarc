import { useEffect } from "react";
import { call } from "../lib/tauri";
import type { Edge } from "../lib/placement";

/**
 * Sincroniza la mascara de input de X11/GTK con lo que se esta pintando.
 *
 * Es obligatorio: la ventana es transparente y cubre el borde de pantalla
 * entero, asi que sin esta llamada o el escritorio deja de recibir clics en
 * toda esa franja, o el notch deja de recibirlos. El backend recorta la region
 * a partir del modo, del alto y del sitio del notch dentro del borde (ver
 * src-tauri/src/lib.rs::update_input_shape); `edge` no viaja porque el backend
 * ya lo tiene, pero cambiarlo obliga a rehacer la region.
 */
export function useInputShape(
  mode: "peek" | "bar" | "expanded",
  height: number,
  edge: Edge,
  along: number,
) {
  useEffect(() => {
    void call("set_notch_mode", { mode, height: Math.ceil(height), along: Math.round(along) });
  }, [mode, height, edge, along]);
}
