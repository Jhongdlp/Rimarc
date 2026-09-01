# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**AgentNotch** — a Tauri 2 desktop overlay (Linux-first, KDE/Wayland tuned) that renders a MacBook-style "notch" pinned to the right edge of the screen. It scans running OS processes for AI coding agents (Claude Code, Antigravity/`agy`, OpenCode, Aider), reads their on-disk session transcripts to compute token usage / quota / cost, and shows one radial gauge per live agent session.

The window is 340×600 px, transparent, undecorated, always-on-top, and `skipTaskbar`. Most of it is transparent and click-through — see *Input shape* below.

## Commands

Package manager is **pnpm**.

```bash
pnpm dev            # Vite only (port 1420, strictPort) — browser preview, `invoke` calls will fail
pnpm dev:tauri      # full app (Rust + webview). This is the normal dev loop.
pnpm build          # tsc --noEmit + vite build → dist/
pnpm build:tauri    # NO_STRIP=true tauri build → release bundles
pnpm clean          # pkill the stale debug binary if a run is wedged
```

There are no tests, linter, or formatter configured. Type checking is `tsc` via `pnpm build`; Rust checking is `cargo check --manifest-path src-tauri/Cargo.toml`.

Only one instance may run: `main.rs::cleanup_stale_instances` writes `$TMPDIR/notch_agent_app.pid` at startup and `kill`s any previous PID whose `/proc/<pid>/cmdline` matches `rimarc`/`tauri-app`/`agentnotch`. A crashed instance can leave a stale window around — `pnpm clean` before restarting.

## Architecture

### Two halves, one IPC command each way

Rust (`src-tauri/src/`) owns process scanning, transcript parsing, and window geometry. React (`src/`) owns all UI and hover state, and tells Rust when its footprint changes.

- `main.rs` — stale-instance cleanup + Linux env fixes (`WEBKIT_DISABLE_DMABUF_RENDERER=1`; forces `GDK_BACKEND=x11` under Wayland so KWin honors exact edge positioning). Then calls `lib.rs::run`.
- `lib.rs` — Tauri builder, `AppState { scanner: Mutex<AgentScanner> }`, all `#[tauri::command]`s, and the Linux GTK/cairo window code.
- `scanner.rs` — `AgentScanner::scan()` walks `sysinfo` processes, identifies agents by name/cmdline, resolves cwd via `/proc/<pid>/cwd`, keeps **one session per `agent_type`** (the busiest process; ties go to the lowest pid, so the pick doesn't flicker between scans), and merges in parsed usage metrics.
- `parser.rs` — un parser por agente, todos devolviendo `UsageMetrics` (ver *Usage metrics*).
- `quota.rs` — sondeo de la cuota real de Claude (ver abajo).
- `models.rs` — `AgentSession` / `SystemAgentSummary`, serde-serialized to the frontend. **`src/types.ts` mirrors these by hand — change both together.** Enums are `#[serde(rename_all = "lowercase")]`, so `AgentStatus::WaitingInput` crosses the wire as `"waitinginput"`.

Commands: `scan_agents`, `set_notch_mode`, `place_notch`, `drag_probe`, `open_in_terminal`, `open_in_file_manager`, `exit_app`.

### The window covers a whole screen edge

The window is flush against one screen edge, spans it end to end, and reaches `STAGE_DEPTH` (560 px) inwards — most of that depth is transparent room for the popover to open into. It only ever moves or resizes when the notch changes edge; sliding the notch *along* an edge is a CSS transform inside a window that never moves. (It used to be a fixed 600 px window with the notch pinned to its origin, which put half of every edge out of reach.)

### The input shape is the whole trick

Since that window is transparent and covers an entire screen edge, only the rectangle matching the current UI catches clicks — the **GTK input region** (`input_shape_combine_region`, cairo); everything else passes through to the desktop. `update_input_shape` in `lib.rs` computes the rectangle in *column-local* coordinates — depth from the screen edge, `along` + run along it — and then places it according to the current edge:

| mode | region (depth × run) |
|---|---|
| `peek` | 40 × 72 |
| `bar` | 80 × `max(height+100, 140)` |
| `expanded`/other | the whole window |

So **any change to the React layout's occupied area must be accompanied by a `set_notch_mode` invoke with a matching `height` and `along`**, or the app will either eat desktop clicks or become unclickable. `NotchBar` fires this through `useInputShape`.

### The notch lives on any screen edge

`Placement { edge, offset }` (`src/lib/placement.ts`) is the whole story: which of the four screen edges, and where along it — `offset` is the notch's centre as a fraction of the edge, so it survives a resolution change. It is persisted to `localStorage` under `agentnotch.placement`; the backend only ever knows the `edge`, because the offset never leaves the front.

Dragging happens from the grip in the settings panel (`GripRow`), not from the silhouette — the notch would move on any stray press otherwise, and there was no way to hint "grab here". `drag_probe` only *reads*: it reports which edge the cursor is nearest (with `EDGE_HYSTERESIS` so it doesn't flicker on the diagonals) and where along it. `NotchBar`'s rAF loop eases the offset toward that (`DRAG_EASE`) — that lag is the sticky feel, and it needs frames rather than `mousemove` events so it keeps converging with the pointer held still. `place_notch` is only called when the edge actually changes.

The window is born `visible: false` and the first `place_notch` from the front is what reveals it — otherwise the WM shows a frame at its own size and position before the geometry lands.

The front is written *once*, for a notch on the right edge growing downwards. The other three edges are the same layout under a rotation:

- `columnTransform(edge, stage, along)` rotates the notch column into place and slides it along the edge (0°/180° for the vertical edges, ∓90° for the horizontal ones, which also swap the window's axes). Always rotations, never mirrors — a mirror would reverse the text.
- Only what has to *read* takes the inverse rotation: the ring gauge, the `%` label, and the gear glyph (`angle` prop). The layout itself is untouched, so on a horizontal edge the label ends up beside its ring instead of under it. **The settings arc is not in that list** — in rest it is just the sliver of the disc poking past the silhouette's tip, so it has to keep rotating *with* the silhouette or it detaches and floats beside the notch. Its centre rides `animatedHeight`/`animatedDepth`, not the target height, for the same reason: on the target it drifts off the tip while the notch is growing.
- `popoverPath` takes the same `rot` and maps its points, so the popover shell keeps its upright body with the tail on whichever side the notch is. For ±90 the caller passes `bodyW`/`bodyH` swapped — see `Popover`.

`pnpm check:geometry` asserts, on all four edges, that `anchorFor` agrees with where `columnTransform` actually puts the ring, that the popover tail lands on it, that the detail drawer still fits in the window without covering the bar, and that the notch reaches both ends of its edge. Run it after touching `popoverPath`, `placement`, or `Popover`.

The detail card grows a **drawer**: a wider rounded box that shares the card's
surface, tucked `POPOVER.drawer.overlap` px behind its base so the two read as
one silhouette (no path surgery — the growth is an animated `inset()`). It opens
on hovering the chevron at the foot of the card and holds the **roster**: one
row per live agent — glyph, project, what it is running right now, and its daily
bar, which doubles as the row separator. Hovering a row swaps what the card
counts but *not* where the tail points: re-anchoring would slide the panel out
from under the pointer, so `DetailPopover` keeps its own `shown` index over the
`index` prop that the ring hover sets.

The drawer bleeds sideways *away from the tail*, and on a bottom-edge notch it
grows upwards instead of down, or it would end up under the bar. `STAGE_DEPTH`
has to stay deep enough for notch + gap + tail + card + a drawer with
`MAX_ITEMS` rows on a horizontal edge — that is what pushed it to 560, and
`check:geometry` asserts it.

### Frontend state machine

`App.tsx` (single stateful component, ~680 lines) drives three `displayMode`s: `peek` → `bar` → `expanded`. There are no per-element hover handlers for the main flow — a single `onPointerMove` dispatcher on the root resolves intent by walking up from `e.target` through data attributes:

- `[data-accent-container]` — bottom gear button; sets `isGearHovered` (morphs the SVG silhouette to grow a gear bulb)
- `[data-gauge-id]` — an agent gauge (or `"standby"`); enters `expanded` and selects the tooltip
- `[data-tooltip]` — inside the popup card; keeps timers cancelled
- `[data-notch-column]` / `[data-notch-container]` — the bar itself
- anything else — `handleLeaveToBackground`, which collapses back to `peek` after `settings.behavior.autoCollapseDelayMs`

This exists because the click-through input shape makes normal mouseenter/mouseleave unreliable near the transparent boundary. Two refs (`collapseTimer`, `tooltipCloseTimer`) debounce collapse; `cancelTimers()` before any state change that should keep the notch open.

The notch silhouette is a hand-built bezier string from `notchPath(w, h, isPeek, isGear)`, animated by framer-motion morphing the `d` attribute under `MORPH_SPRING`. The magic numbers in it (`rIn=20`, `rOut=22`, gear circle at `cx=27, r=17`) are tuned against `reference.png` / `screen2.png` in the repo root.

Settings live in `localStorage` under `agent_notch_settings_v1` (`src/settings.ts`), never in Rust. `loadSettings()` deep-merges over `DEFAULT_SETTINGS` per section, so adding a new settings key is backwards-compatible.

### Usage metrics: una fuente distinta por agente

Cada agente guarda su uso en un sitio y un formato distinto, y solo dos de ellos
publican la **cuota real**. `quota_live` viaja al front para distinguirlos: `true`
= porcentaje real de la cuenta, `false` = estimacion local, que el popover pinta
como `~N tokens` en vez de un porcentaje duro.

| agente | fuente | cuota |
|---|---|---|
| Claude | `~/.claude/projects/<cwd>/*.jsonl` + `api/oauth/usage` | real |
| Codex | `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` | real, en el propio transcript |
| OpenCode | `~/.local/share/opencode/opencode.db` (SQLite) | estimada |
| Antigravity | `~/.gemini/antigravity-cli/brain/*/…/transcript.jsonl` | estimada |

**Claude.** `quota.rs` es un hilo que cada 300 s hace `GET
https://api.anthropic.com/api/oauth/usage` con el `claudeAiOauth.accessToken` de
`~/.claude/.credentials.json` (header `anthropic-beta: oauth-2025-04-20`) y deja
`five_hour.utilization` / `seven_day.utilization` en un `OnceLock<Mutex<…>>` que
`scan_agents` lee sin bloquear. **Ese endpoint da 429 con facilidad** — lo
comparte con el propio Claude Code y con cada arranque de la app — y un fallo
dejaba los dos anillos a 0 %: la ultima respuesta buena se guarda en crudo en
`$TMPDIR/notch_agent_quota.json` y `spawn_poller` la carga antes de salir a la
red, asi que un arranque con 429 pinta la cuota de hace un rato en vez de cero.
Se descarta si su `five_hour.resets_at` ya paso (ventana reiniciada = el
porcentaje viejo no dice nada). El primer fallo reintenta a los 30 s y a partir
de ahi dobla hasta 1800 s. Los transcripts solo dan tokens y coste:
`parser.rs` lee el `.jsonl` mas reciente de forma **incremental**
(`SessionAccum.offset`, cortando en el ultimo `\n`), suma los cuatro buckets de
`message.usage` — ignorar los de cache era lo que dejaba las cifras ~10x bajas —
y deduplica por `message.id` porque Claude Code reescribe la misma respuesta
varias veces. `context_tokens` **no se suma**: es `input + cache_write +
cache_read` del ultimo turno.

**Codex** es el mas facil: escribe la cuota en su propio rollout. Cada evento
`payload.type == "token_count"` lleva `rate_limits.primary` (ventana de 5 h) y
`.secondary` (semanal) con `used_percent` y `resets_in_seconds`, asi que
`quota_live` sale `true` sin tocar la red. `info.total_token_usage` es
**acumulado de la sesion**, no incremental: se coge el ultimo evento y ya, aqui
no se suma nada. `input_tokens` ya incluye los cacheados y `output_tokens` el
razonamiento — sumarlos aparte cuenta doble. El rollout activo se elige leyendo
los primeros 8 KB de cada candidato y buscando el `cwd` de su `session_meta`, no
por mtime: el mas reciente puede ser de otro proyecto. En `codex exec`
`rate_limits` llega a `null` y entonces `quota_live` se queda en `false`.

**OpenCode** guarda todo en SQLite y la tabla `session` ya trae los totales
(`cost`, `tokens_input/output/reasoning/cache_read/cache_write`, `model`,
`directory`), asi que no hay transcript que recorrer: una sola consulta, con las
sumas de ventana como subconsultas para no lanzar `sqlite3` mas de una vez por
escaneo. Se invoca el binario `sqlite3 -readonly` en vez de meter rusqlite en el
arbol, por el mismo motivo por el que `quota.rs` usa `curl`. La columna `model`
es un JSON `{"id":…,"providerID":…}`. No hay cuota que consultar (es
trae-tu-clave), asi que las ventanas son estimaciones contra
`OPENCODE_5H_LIMIT` / `OPENCODE_WEEKLY_LIMIT`.

**Antigravity** no escribe ni un solo contador de tokens ni su cuota en ninguna
parte, asi que todo es estimacion (`chars / 4`). Dos detalles que no son
opcionales:

- **Son dos pools independientes.** Antigravity reparte la cuota entre los
  modelos Gemini y los Claude, y gastar uno no toca el saldo del otro. El modelo
  de cada conversacion viaja como texto dentro de un `USER_SETTINGS_CHANGE` del
  transcript (``…`Model Selection` from None to Gemini 3.7 Flash (High). …``),
  que `model_selection()` extrae. Cada conversacion se acumula en el pool de su
  familia y solo se reporta el del modelo activo, con sus propios limites
  (`antigravity_limits`), su ventana de contexto y sus tarifas.
- **Las ventanas se reparten por `created_at` de cada paso, nunca por el mtime
  del fichero.** Una conversacion de hace semanas que hoy se abre un momento
  cambia su mtime; contando por fichero, sus 45k tokens de historia entraban
  enteros en la ventana de 5 h y pintaban un 8 % de consumo diario sin haber
  usado el agente. `CachedFileTokens.steps` guarda `(epoch, tokens)` por paso
  (solo los de los ultimos 7 dias) y las ventanas se suman de ahi. Un paso sin
  `created_at` no cuenta: no hay forma de ubicarlo. **Tampoco hay rellenos**: si
  hoy no se ha hablado con esa familia la ventana es 0 y el anillo sale vacio.

Los porcentajes que viajan al front son el **consumo**, no lo restante
(`utilization` tal cual). Es lo que espera todo el front: el anillo se llena con
el gasto y `accentFor` vira a naranja por encima de 70.

## Gotchas

- **Tauri camelCase → snake_case**: `invoke("cmd", { someArg })` binds to a Rust parameter named `some_arg`. `App.tsx`'s `handleOpenTerminal` sends `preferredTerminal` while `open_in_terminal` declares `terminal`, so the preferred-terminal setting is silently dropped today.
- Hardcoded `/home/jhon` fallbacks appear in `scanner.rs` and `lib.rs` where `dirs::home_dir()` fails.
- `identify_agent` must keep excluding this app itself (`rimarc`, plus the old `tauri-app`/`agentnotch` names) or the notch will list itself as an agent.
- `tsconfig.json` sets `noUnusedLocals`/`noUnusedParameters`, so unused imports break `pnpm build` even though `pnpm dev` is happy.
- El crate de Cargo es `rimarc` y el producto es `Rimarc` (`tauri.conf.json`), pero la lib sigue siendo `tauri_app_lib`; `pnpm clean` y el matcher de PIDs dependen del nombre del binario.
- Anadir un `AgentType` toca los dos lados: `models.rs`, `src/types.ts`, los dos mapas de `AGENT_COLOR_*` en `src/design/tokens.ts` (son `Record<AgentType, string>` exhaustivos, si falta uno `pnpm build` falla) y el `switch` de `AgentIcon`.
- `parse_opencode_metrics` depende del binario `sqlite3` en el `PATH`; sin el, las metricas de OpenCode salen a cero en silencio.
- El cajon del `Popover` solo se monta con la carta abierta: recogido, su `inset()` deja una fila de subpixel sin recortar y, sin carta encima que la tape, sale una raya de `surface` de 220 px cruzando el escritorio.
- UI copy is Spanish ("Cuota Diaria", "Límite Semanal", "Sin agentes activos"); match that when adding strings.

## Styling

Tailwind v4 via `@tailwindcss/vite` — `src/index.css` is just `@import "tailwindcss"` plus a base layer that forces `background: transparent` on `html/body/#root` (required for the overlay) and disables text selection/drag globally. There is no `tailwind.config.js`. `src/App.css` is empty and unused. Icons: inline SVGs in `src/Icons.tsx` (`AgentIcon` dispatches on `AgentType`), plus `lucide-react` for chrome.
