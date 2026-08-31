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

Only one instance may run: `main.rs::cleanup_stale_instances` writes `$TMPDIR/notch_agent_app.pid` at startup and `kill`s any previous PID whose `/proc/<pid>/cmdline` matches `tauri-app`/`agentnotch`. A crashed instance can leave a stale window around — `pnpm clean` before restarting.

## Architecture

### Two halves, one IPC command each way

Rust (`src-tauri/src/`) owns process scanning, transcript parsing, and window geometry. React (`src/`) owns all UI and hover state, and tells Rust when its footprint changes.

- `main.rs` — stale-instance cleanup + Linux env fixes (`WEBKIT_DISABLE_DMABUF_RENDERER=1`; forces `GDK_BACKEND=x11` under Wayland so KWin honors exact edge positioning). Then calls `lib.rs::run`.
- `lib.rs` — Tauri builder, `AppState { scanner: Mutex<AgentScanner> }`, all `#[tauri::command]`s, and the Linux GTK/cairo window code.
- `scanner.rs` — `AgentScanner::scan()` walks `sysinfo` processes, identifies agents by name/cmdline, resolves cwd via `/proc/<pid>/cwd`, dedupes by `(agent_type, cwd)`, and merges in parsed usage metrics.
- `parser.rs` — reads agent transcript files off disk and produces `UsageMetrics`.
- `quota.rs` — sondeo de la cuota real de Claude (ver abajo).
- `models.rs` — `AgentSession` / `SystemAgentSummary`, serde-serialized to the frontend. **`src/types.ts` mirrors these by hand — change both together.** Enums are `#[serde(rename_all = "lowercase")]`, so `AgentStatus::WaitingInput` crosses the wire as `"waitinginput"`.

Commands: `scan_agents`, `set_notch_mode`, `place_notch`, `drag_probe`, `open_in_terminal`, `open_in_file_manager`, `exit_app`.

### The window covers a whole screen edge

The window is flush against one screen edge, spans it end to end, and reaches `STAGE_DEPTH` (420 px) inwards — most of that depth is transparent room for the popover to open into. It only ever moves or resizes when the notch changes edge; sliding the notch *along* an edge is a CSS transform inside a window that never moves. (It used to be a fixed 600 px window with the notch pinned to its origin, which put half of every edge out of reach.)

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

`pnpm check:geometry` asserts, on all four edges, that `anchorFor` agrees with where `columnTransform` actually puts the ring, that the popover tail lands on it, and that the notch reaches both ends of its edge. Run it after touching `popoverPath`, `placement`, or `Popover`.

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

### Usage metrics: cuota real para Claude, estimación para el resto

Claude Code **no** guarda su cuota en disco, y los transcripts sólo tienen tokens por turno. La cuota real sale del mismo endpoint que usa `/usage`:

- `quota.rs` — hilo en segundo plano que cada 60 s hace `GET https://api.anthropic.com/api/oauth/usage` con el `claudeAiOauth.accessToken` de `~/.claude/.credentials.json` (header `anthropic-beta: oauth-2025-04-20`). Devuelve `five_hour.utilization`, `seven_day.utilization` y sus `resets_at`. Se guarda en un `OnceLock<Mutex<Option<ClaudeQuota>>>` que `scan_agents` lee sin bloquear. Si no hay token válido, red, o `curl`, la cuota queda en `None` y `quota_live` viaja como `false`.
- La llamada usa `curl` a propósito: el `reqwest` que arrastra Tauri viene sin backend TLS, y habilitarlo mete rustls entero en el árbol.

`parser.rs` sólo se ocupa de la **sesión activa**, ya no recorre los 287 MB de `~/.claude/projects`:

- Lee el `.jsonl` más reciente del proyecto de forma **incremental** (`SessionAccum.offset`, sólo los bytes nuevos, cortando en el último `\n` para no leer una línea a medio escribir).
- Suma los cuatro buckets de `message.usage`: `input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`. Ignorar los de caché era lo que dejaba las cifras ~10x bajas.
- Deduplica por `message.id` (o `requestId`): Claude Code reescribe la misma respuesta varias veces.
- `context_tokens` **no se suma**: es `input + cache_write + cache_read` del último turno, o sea la ocupación real de la ventana.
- Coste con tarifas por modelo (`rates()`), escritura de caché a 1.25x la entrada y lectura a 0.1x.

**Antigravity** sigue siendo estimación pura (`chars / 4`, ventanas por mtime de fichero) porque no escribe tokens ni cuota en ninguna parte; sale con `quota_live: false` y el popover lo pinta como `~N tokens` en vez de un porcentaje.

Los porcentajes que viajan al front son el **consumo**, no lo restante (`utilization` tal cual). Es lo que espera todo el front: el anillo se llena con el gasto y `accentFor` vira a naranja por encima de 70.

## Gotchas

- **Tauri camelCase → snake_case**: `invoke("cmd", { someArg })` binds to a Rust parameter named `some_arg`. `App.tsx`'s `handleOpenTerminal` sends `preferredTerminal` while `open_in_terminal` declares `terminal`, so the preferred-terminal setting is silently dropped today.
- Hardcoded `/home/jhon` fallbacks appear in `scanner.rs` and `lib.rs` where `dirs::home_dir()` fails.
- `identify_agent` must keep excluding this app itself (`tauri-app`, `agentnotch`, `target/{debug,release}/tauri-app`) or the notch will list itself as an agent.
- `tsconfig.json` sets `noUnusedLocals`/`noUnusedParameters`, so unused imports break `pnpm build` even though `pnpm dev` is happy.
- The Rust crate is still named `tauri-app` (Cargo) while the product is `AgentNotch` (`tauri.conf.json`); `pnpm clean` and the PID-cleanup matcher depend on the crate name.
- UI copy is Spanish ("Cuota Diaria", "Límite Semanal", "Sin agentes activos"); match that when adding strings.

## Styling

Tailwind v4 via `@tailwindcss/vite` — `src/index.css` is just `@import "tailwindcss"` plus a base layer that forces `background: transparent` on `html/body/#root` (required for the overlay) and disables text selection/drag globally. There is no `tailwind.config.js`. `src/App.css` is empty and unused. Icons: inline SVGs in `src/Icons.tsx` (`AgentIcon` dispatches on `AgentType`), plus `lucide-react` for chrome.
