import { useEffect } from "react";
import { call } from "../lib/tauri";

/**
 * Sincroniza la mascara de input de X11/GTK con lo que se esta pintando.
 *
 * Es obligatorio: la ventana es transparente y ocupa 340x600, asi que sin esta
 * llamada o el escritorio deja de recibir clics en toda esa area, o el notch
 * deja de recibirlos. El backend recorta la region a partir del modo y del
 * alto que le pasemos (ver src-tauri/src/lib.rs::update_input_shape).
 */
export function useInputShape(mode: "peek" | "bar" | "expanded", height: number) {
  useEffect(() => {
    void call("set_notch_mode", { mode, height: Math.ceil(height) });
  }, [mode, height]);
}
