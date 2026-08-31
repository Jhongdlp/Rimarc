# Contrato backend (Rust) — referencia para reconstruir el front

Todo esto ya existe y funciona en `src-tauri/`. El front nuevo solo consume esto.

## Comandos (`invoke` desde `@tauri-apps/api/core`)

| Comando | Args | Devuelve | Notas |
|---|---|---|---|
| `scan_agents` | — | `SystemAgentSummary` | Escanea procesos de agentes. Llamar en polling. |
| `set_notch_mode` | `{ mode: "peek" \| "bar" \| "expanded", height: number }` | `void` | Ajusta la mascara de input X11/GTK. **Obligatorio**: sin esto los clicks no pasan al escritorio o el notch no es clickeable. `height` = alto logico del contenido. |
| `snap_to_right_edge` | — | `void` | Resetea la mascara a modo `peek`. |
| `open_in_terminal` | `{ cwd?: string, terminal?: string }` | `void` | `terminal: "auto"` o binario concreto. |
| `open_in_file_manager` | `{ cwd?: string }` | `void` | `xdg-open`. |
| `exit_app` | — | `void` | Cierra la app. |

## Geometria de la ventana (fija, definida en Rust)

- Ancho: **340 px logicos**, alto: **600 px logicos**. No redimensionable.
- Anclada al **borde derecho** del monitor, a 2/7 de altura desde arriba.
- `transparent: true`, `decorations: false`, `alwaysOnTop: true`, `skipTaskbar: true`.
- El area clickeable la decide `set_notch_mode`, no el CSS:
  - `peek` → 40x72 px pegado a la derecha
  - `bar` → 80 px de ancho x `max(height + 100, 140)`
  - `expanded` → 340 px de ancho x `max(height + 120, 380)`

Consecuencia de diseño: el layout del front debe estar **alineado a la derecha** y su alto real reportarse a `set_notch_mode`, o habra desfase entre lo que se ve y lo que se puede clickear.

## Tipos

Ver `src/types.ts` (espejo de `src-tauri/src/models.rs`).

## Dependencias ya instaladas

react 19, framer-motion 13, lucide-react, clsx, tailwind-merge, tailwindcss 4 (via `@tailwindcss/vite`).
