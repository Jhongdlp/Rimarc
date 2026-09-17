import { useEffect, useState } from "react";
import { AlertTriangle, Ban, Check, Copy, Info, Keyboard, List, Monitor, Moon, Palette, Plug, RotateCcw, Sparkles, Sun, X } from "lucide-react";
import { FONT_FAMILY } from "../design/tokens";
import {
  PALETTE,
  borderColorFor,
  resetClipboardPrefs,
  setClipboardPrefs,
  useClipboardPrefs,
  useTheme,
  type ClipboardPrefs,
  type ThemeMode,
} from "../lib/theme";
import { call, inTauri } from "../lib/tauri";
import { useI18n } from "../lib/i18n";

type Section = "appearance" | "list" | "keys" | "mcp";

/** Etiquetas `[es, en]`: se eligen con `tr(...pair)`. */
type Pair = [string, string];

const SECTIONS: { id: Section; label: Pair; title: Pair; icon: typeof Plug }[] = [
  { id: "appearance", label: ["Apariencia", "Appearance"], title: ["Apariencia", "Appearance"], icon: Palette },
  { id: "list", label: ["Lista", "List"], title: ["Lista", "List"], icon: List },
  { id: "keys", label: ["Atajos", "Shortcuts"], title: ["Atajos de teclado", "Keyboard shortcuts"], icon: Keyboard },
  { id: "mcp", label: ["Conectar", "Connect"], title: ["Conectar a un agente", "Connect to an agent"], icon: Plug },
];

const close = () => void call("close_clipboard_settings");

/**
 * Ajustes del portapapeles, en su propia ventana centrada (`clipboard-settings`):
 * el dock de secciones a la izquierda y la seccion elegida a la derecha.
 */
export function ClipboardSettings() {
  const { colors, isDark } = useTheme();
  const prefs = useClipboardPrefs();
  const edge = borderColorFor(prefs, isDark);
  const { tr } = useI18n();
  const [section, setSection] = useState<Section>("appearance");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    // Clic fuera = la ventana pierde el foco: se cierra como un modal. Por eso
    // aqui no hay `<input type="color">`: su dialogo de GTK le quita el foco.
    window.addEventListener("blur", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("blur", close);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        // La ventana es transparente: las esquinas las pone este recorte.
        borderRadius: 16,
        overflow: "hidden",
        border: edge ? `${prefs.borderWidth}px solid ${edge}` : `1px solid ${colors.track}`,
        background: colors.surface,
        color: colors.detailLabel,
        fontFamily: FONT_FAMILY,
      }}
    >
      <nav
        data-tauri-drag-region
        style={{
          width: 180,
          flex: "none",
          padding: "20px 10px",
          borderRight: `1px solid ${colors.track}`,
          display: "flex",
          flexDirection: "column",
          gap: 2,
        }}
      >
        <div
          data-tauri-drag-region
          style={{ padding: "0 10px 16px", fontSize: 15, fontWeight: 600, color: colors.title }}
        >
          {tr("Portapapeles", "Clipboard")}
        </div>
        {SECTIONS.map(({ id, label, icon: Icon }) => {
          const active = section === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setSection(id)}
              style={{
                ...bare,
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "9px 10px",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                background: active ? colors.track : "transparent",
                color: active ? colors.detailLabel : colors.detailValue,
              }}
            >
              <Icon size={15} strokeWidth={1.8} />
              {tr(...label)}
            </button>
          );
        })}
      </nav>

      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        {/* Cabecera fija: el titulo no se va con el scroll y el cierre nunca queda
            encima de la vista previa ni de un bloque de codigo. */}
        <header
          data-tauri-drag-region
          style={{
            flex: "none",
            height: 60,
            padding: "0 14px 0 28px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <h1 data-tauri-drag-region style={{ margin: 0, fontSize: 20, fontWeight: 600, color: colors.title }}>
            {tr(...SECTIONS.find((x) => x.id === section)!.title)}
          </h1>
          <CloseButton />
        </header>
        <main key={section} style={{ flex: 1, overflowY: "auto", padding: "0 28px 20px", scrollbarWidth: "thin" }}>
          {section === "appearance" ? <Appearance /> : section === "list" ? <ListPrefs /> : section === "keys" ? <Shortcuts /> : <Mcp />}
        </main>
      </div>
    </div>
  );
}

function CloseButton() {
  const { colors } = useTheme();
  const { tr } = useI18n();
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      title={tr("Cerrar (Esc)", "Close (Esc)")}
      aria-label={tr("Cerrar", "Close")}
      onClick={close}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        ...bare,
        width: 30,
        height: 30,
        borderRadius: 15,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        // Siempre con fondo: sin el, el aspa se perdia sobre lo que hubiera detras.
        background: hover ? colors.detailValue : colors.track,
        color: hover ? colors.surface : colors.detailLabel,
        transition: "background 120ms ease, color 120ms ease",
      }}
    >
      <X size={16} strokeWidth={2.2} />
    </button>
  );
}

/** Cada tema se muestra como una muestra de su propio fondo; Sistema, partido en diagonal. */
const THEMES: { id: ThemeMode; label: string; en: string; icon: typeof Sun; swatch: string; ink: string }[] = [
  { id: "light", label: "Claro", en: "Light", icon: Sun, swatch: "#FFFFFF", ink: "#1C1C1E" },
  { id: "dark", label: "Oscuro", en: "Dark", icon: Moon, swatch: "#000000", ink: "#FFFFFF" },
  // El glifo en blanco con `difference` sale negro sobre la mitad blanca y blanco sobre la negra.
  { id: "system", label: "Sistema", en: "System", icon: Monitor, swatch: "linear-gradient(135deg, #FFFFFF 50%, #000000 50%)", ink: "#FFFFFF" },
];

type Option<T> = { id: T; label: string; en?: string };

const WIDTHS: Option<ClipboardPrefs["borderWidth"]>[] = [
  { id: 1, label: "Fino", en: "Thin" },
  { id: 2, label: "Medio", en: "Medium" },
  { id: 3, label: "Grueso", en: "Thick" },
];

const FONT_SCALES: Option<number>[] = [
  { id: 0.9, label: "Pequeña", en: "Small" },
  { id: 1, label: "Normal" },
  { id: 1.15, label: "Grande", en: "Large" },
];

const OPACITIES: Option<number>[] = [
  { id: 1, label: "100 %" },
  { id: 0.9, label: "90 %" },
  { id: 0.8, label: "80 %" },
  { id: 0.65, label: "65 %" },
];

const DENSITIES: Option<ClipboardPrefs["density"]>[] = [
  { id: "compact", label: "Compacta", en: "Compact" },
  { id: "comfy", label: "Cómoda", en: "Comfy" },
];

const LINES: Option<ClipboardPrefs["previewLines"]>[] = [
  { id: 1, label: "1" },
  { id: 2, label: "2" },
  { id: 3, label: "3" },
];

const LIMITS: Option<ClipboardPrefs["historyLimit"]>[] = [
  { id: 25, label: "25" },
  { id: 50, label: "50" },
  { id: 100, label: "100" },
];

/** Texto de una opcion en el idioma activo; sin `en`, la etiqueta vale para los dos. */
function useLabel() {
  const { lang } = useI18n();
  return (o: { label: string; en?: string }) => (lang === "en" && o.en) || o.label;
}

function usePaletteName() {
  const label = useLabel();
  return (color: string) => {
    const p = PALETTE.find((p) => p.color === color);
    return p ? label(p) : color;
  };
}

function Appearance() {
  const { colors, theme, setTheme, isDark } = useTheme();
  const prefs = useClipboardPrefs();
  const ring = useRing();
  const { tr } = useI18n();
  const label = useLabel();
  const paletteName = usePaletteName();
  const current = THEMES.find((t) => t.id === theme);

  return (
    <>
      <Preview />

      <Card>
        <Row label={tr("Tema", "Theme")} hint={current && label(current)}>
          <div role="radiogroup" style={{ display: "flex", gap: 10 }}>
            {THEMES.map((o) => ({ ...o, label: label(o) })).map(({ id, label, icon: Icon, swatch, ink }) => (
              <button
                key={id}
                type="button"
                role="radio"
                title={label}
                aria-label={label}
                aria-checked={theme === id}
                onClick={() => setTheme(id)}
                style={{
                  ...bare,
                  width: 52,
                  height: 36,
                  borderRadius: 8,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: swatch,
                  // Que la muestra blanca no se funda con la carta clara ni la negra con la oscura.
                  boxShadow: `inset 0 0 0 1px ${colors.track}`,
                  ...ring(theme === id),
                }}
              >
                <Icon
                  size={16}
                  strokeWidth={1.8}
                  color={ink}
                  style={id === "system" ? { mixBlendMode: "difference" } : undefined}
                />
              </button>
            ))}
          </div>
        </Row>

        <Row label={tr("Acento", "Accent")} hint={prefs.accent ? paletteName(prefs.accent) : tr("Automático", "Automatic")}>
          <Swatches
            value={prefs.accent}
            extra={[{ id: null, label: tr("Automático", "Automatic"), color: colors.detailLabel }]}
            onChange={(accent) => setClipboardPrefs({ accent })}
          />
        </Row>
      </Card>

      <Card title={tr("Carta", "Card")}>
        <Row
          label={tr("Borde", "Border")}
          hint={
            prefs.border === "none"
              ? tr("Sin borde", "No border")
              : prefs.border === "auto"
                ? tr("Según el tema", "Follows theme")
                : paletteName(prefs.borderColor)
          }
        >
          <Swatches
            value={prefs.border === "custom" ? prefs.borderColor : prefs.border}
            extra={[
              { id: "none", label: tr("Sin borde", "No border") },
              { id: "auto", label: tr("Según el tema", "Follows theme"), color: borderColorFor({ ...prefs, border: "auto" }, isDark) },
            ]}
            onChange={(v) =>
              setClipboardPrefs(v === "none" || v === "auto" ? { border: v } : { border: "custom", borderColor: v })
            }
          />
        </Row>

        {/* Sin borde el grosor no significa nada: se queda, pero apagado. */}
        <Row label={tr("Grosor del borde", "Border width")} disabled={prefs.border === "none"}>
          <Segmented
            options={WIDTHS}
            value={prefs.borderWidth}
            onChange={(borderWidth) => setClipboardPrefs({ borderWidth })}
            render={(o) => (
              <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ width: 14, height: o.id, borderRadius: 2, background: "currentColor" }} />
                {o.label}
              </span>
            )}
          />
        </Row>

        <Row label={tr("Opacidad del fondo", "Background opacity")} hint={tr("Deja ver el escritorio a través", "Lets the desktop show through")}>
          <Segmented
            options={OPACITIES}
            value={prefs.surfaceOpacity}
            onChange={(surfaceOpacity) => setClipboardPrefs({ surfaceOpacity })}
          />
        </Row>
      </Card>

      <Reset />
    </>
  );
}

function ListPrefs() {
  const prefs = useClipboardPrefs();
  const { tr } = useI18n();
  return (
    <>
      <Preview />

      <Card title={tr("Texto", "Text")}>
        <Row label={tr("Tamaño de letra", "Font size")}>
          <Segmented
            options={FONT_SCALES}
            value={prefs.fontScale}
            onChange={(fontScale) => setClipboardPrefs({ fontScale })}
            render={(o) => (
              <span style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
                <span style={{ fontSize: 13 * o.id, fontWeight: 700 }}>Aa</span>
                {o.label}
              </span>
            )}
          />
        </Row>
        <Row label={tr("Líneas de vista previa", "Preview lines")} hint={tr("Cuánto texto enseña cada elemento", "How much text each item shows")}>
          <Segmented options={LINES} value={prefs.previewLines} onChange={(previewLines) => setClipboardPrefs({ previewLines })} />
        </Row>
        <Row label={tr("Densidad", "Density")} hint={tr("Espacio entre elementos", "Space between items")}>
          <Segmented
            options={DENSITIES}
            value={prefs.density}
            onChange={(density) => setClipboardPrefs({ density })}
            render={(o) => (
              <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ display: "flex", flexDirection: "column", gap: o.id === "compact" ? 2 : 4 }}>
                  {[0, 1, 2].map((i) => (
                    <span key={i} style={{ width: 12, height: 1.5, borderRadius: 1, background: "currentColor" }} />
                  ))}
                </span>
                {o.label}
              </span>
            )}
          />
        </Row>
      </Card>

      <Card title={tr("Comportamiento", "Behavior")}>
        <Row label={tr("Elementos en el historial", "Items in history")} hint={tr("Los fijados se guardan aparte", "Pinned items are kept separately")}>
          <Segmented options={LIMITS} value={prefs.historyLimit} onChange={(historyLimit) => setClipboardPrefs({ historyLimit })} />
        </Row>
        <Row label={tr("Cerrar al copiar", "Close on copy")} hint={tr("Desactívalo para copiar varios seguidos", "Turn off to copy several in a row")}>
          <Switch on={prefs.closeOnCopy} onChange={(closeOnCopy) => setClipboardPrefs({ closeOnCopy })} />
        </Row>
      </Card>

      <Reset />
    </>
  );
}

const SAMPLE = [
  {
    text: ["pnpm dev:tauri\ncargo check --manifest-path src-tauri/Cargo.toml\ngit status", "pnpm dev:tauri\ncargo check --manifest-path src-tauri/Cargo.toml\ngit status"],
    meta: ["Copiado", "Copied"],
    mono: true,
    copied: true,
  },
  {
    text: ["La reunión se mueve al jueves a las 10:00.\nTraed la demo del portapapeles.", "The meeting moves to Thursday at 10:00.\nBring the clipboard demo."],
    meta: ["Texto  ·  74 car.", "Text  ·  74 chars"],
    mono: false,
    copied: false,
  },
] satisfies { text: Pair; meta: Pair; mono: boolean; copied: boolean }[];

/**
 * La carta en miniatura con las preferencias aplicadas, sobre un degradado:
 * sin algo detras, la opacidad del fondo no se ve cambiar. Se queda pegada
 * arriba mientras se recorren las opciones.
 */
function Preview() {
  const { colors, isDark } = useTheme();
  const prefs = useClipboardPrefs();
  const edge = borderColorFor(prefs, isDark);
  const accent = prefs.accent ?? colors.detailLabel;
  const k = prefs.fontScale;
  const pad = prefs.density === "compact" ? 6 : 10;
  const { tr } = useI18n();

  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 1,
        margin: "0 -28px 16px",
        padding: "0 28px 14px",
        background: colors.surface,
      }}
    >
      <div
        style={{
          height: 150,
          borderRadius: 12,
          paddingTop: 16,
          display: "flex",
          justifyContent: "center",
          overflow: "hidden",
          background: "linear-gradient(120deg, #5E5CE6 0%, #BF5AF2 40%, #FF375F 70%, #FF9F0A 100%)",
        }}
      >
        <div
          style={{
            position: "relative",
            // Contexto propio: sin el, la capa de fondo con `zIndex: -1` se iria detras del degradado.
            zIndex: 0,
            width: 300,
            height: 150,
            borderRadius: "14px 14px 0 0",
            padding: "12px 16px 0",
            boxShadow: edge ? `inset 0 0 0 ${prefs.borderWidth}px ${edge}` : "none",
            overflow: "hidden",
            fontFamily: FONT_FAMILY,
          }}
        >
          {/* El fondo en su propia capa: `opacity` en la carta apagaria tambien el texto y el borde. */}
          <div style={{ position: "absolute", inset: 0, zIndex: -1, background: colors.surface, opacity: prefs.surfaceOpacity }} />
          <div style={{ display: "flex", gap: 14, fontSize: 12 * k, fontWeight: 600 }}>
            <span style={{ paddingBottom: 5, color: colors.detailLabel, borderBottom: `2px solid ${accent}` }}>{tr("Recientes", "Recent")}</span>
            <span style={{ color: colors.detailValue }}>{tr("Fijados", "Pinned")}</span>
          </div>
          {SAMPLE.map((s) => ({ ...s, text: tr(...s.text), meta: tr(...s.meta) })).map((r) => (
            <div key={r.meta} style={{ padding: `${pad}px 0`, borderBottom: `1px solid ${colors.track}` }}>
              <div
                style={{
                  display: "-webkit-box",
                  WebkitBoxOrient: "vertical",
                  WebkitLineClamp: prefs.previewLines,
                  overflow: "hidden",
                  whiteSpace: prefs.previewLines === 1 ? "nowrap" : r.mono ? "pre" : "pre-wrap",
                  textOverflow: "ellipsis",
                  fontSize: (r.mono ? 12.5 : 14) * k,
                  fontFamily: r.mono ? "ui-monospace, monospace" : "inherit",
                  fontWeight: 500,
                  lineHeight: 1.3,
                  color: colors.detailLabel,
                }}
              >
                {prefs.previewLines === 1 ? r.text.replace(/\s+/g, " ") : r.text}
              </div>
              <div
                style={{
                  marginTop: 4,
                  fontSize: 11 * k,
                  fontWeight: 500,
                  color: r.copied ? accent : colors.detailValue,
                }}
              >
                {r.meta}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Grupo de filas: caja con canto de `track` y separadores entre filas. */
function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <section style={{ marginTop: title ? 22 : 0 }}>
      {title && (
        <div
          style={{
            margin: "0 0 8px 4px",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 0.6,
            textTransform: "uppercase",
            color: colors.detailValue,
          }}
        >
          {title}
        </div>
      )}
      {/* La raya de arriba de la primera fila se esconde bajo el canto de la caja. */}
      <div style={{ borderRadius: 12, border: `1px solid ${colors.track}`, padding: "0 16px", overflow: "hidden" }}>
        <div style={{ marginTop: -1 }}>{children}</div>
      </div>
    </section>
  );
}

/** Nombre y pista a la izquierda, control a la derecha. */
function Row({
  label,
  hint,
  disabled,
  children,
}: {
  label: string;
  hint?: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <div
      aria-disabled={disabled}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        minHeight: 58,
        padding: "10px 0",
        borderTop: `1px solid ${colors.track}`,
      }}
    >
      <div style={{ minWidth: 0, opacity: disabled ? 0.4 : 1, transition: "opacity 140ms ease" }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: colors.detailLabel }}>{label}</div>
        {hint && <div style={{ marginTop: 3, fontSize: 11.5, color: colors.detailValue }}>{hint}</div>}
      </div>
      <div
        style={{
          flex: "none",
          opacity: disabled ? 0.4 : 1,
          pointerEvents: disabled ? "none" : "auto",
          transition: "opacity 140ms ease",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function Reset() {
  const { colors } = useTheme();
  const { tr } = useI18n();
  return (
    <button
      type="button"
      onClick={resetClipboardPrefs}
      style={{
        ...bare,
        marginTop: 18,
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 4px",
        fontSize: 12,
        fontWeight: 600,
        color: colors.detailValue,
      }}
    >
      <RotateCcw size={13} strokeWidth={2} />
      {tr("Restablecer valores", "Reset to defaults")}
    </button>
  );
}

/** Anillo de seleccion, separado de la muestra para que se lea sobre cualquier color. */
function useRing() {
  const { colors } = useTheme();
  const { accent } = useClipboardPrefs();
  return (on: boolean) => ({
    outline: `2px solid ${on ? (accent ?? colors.detailLabel) : "transparent"}`,
    outlineOffset: 2,
    transition: "outline-color 120ms ease",
  });
}

/**
 * Muestras redondas: las opciones especiales (`extra`, sin color = "ninguno")
 * y despues la `PALETTE`. El nombre va en la pista de la fila y en el tooltip.
 */
function Swatches<V extends string | null>({
  value,
  extra,
  onChange,
}: {
  value: V | string;
  extra: { id: V; label: string; color?: string }[];
  onChange: (v: V | string) => void;
}) {
  const { colors } = useTheme();
  const ring = useRing();
  const label = useLabel();
  const options = [...extra, ...PALETTE.map((p) => ({ id: p.color, label: label(p), color: p.color }))];
  return (
    <div role="radiogroup" style={{ display: "flex", gap: 7 }}>
      {options.map((o, i) => {
        const on = value === o.id;
        return (
          <button
            key={String(o.id)}
            type="button"
            role="radio"
            title={o.label}
            aria-label={o.label}
            aria-checked={on}
            onClick={() => onChange(o.id)}
            style={{
              ...bare,
              width: 22,
              height: 22,
              borderRadius: 11,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              // Un hueco tras las especiales las separa de la paleta.
              marginRight: i === extra.length - 1 ? 6 : 0,
              background: o.color ?? "transparent",
              boxShadow: `inset 0 0 0 1px ${colors.track}`,
              ...ring(on),
            }}
          >
            {!o.color && <Ban size={14} strokeWidth={1.8} color={colors.detailValue} />}
          </button>
        );
      })}
    </div>
  );
}

/** Control segmentado: una pastilla de `track` con la opcion elegida resaltada. */
function Segmented<T extends number | string>({
  options,
  value,
  onChange,
  render,
}: {
  options: Option<T>[];
  value: T;
  onChange: (v: T) => void;
  render?: (o: Option<T>) => React.ReactNode;
}) {
  const { colors } = useTheme();
  const label = useLabel();
  return (
    <div role="radiogroup" style={{ display: "inline-flex", padding: 3, gap: 2, borderRadius: 9, background: colors.track }}>
      {options.map((o) => ({ ...o, label: label(o) })).map((o) => {
        const on = o.id === value;
        return (
          <button
            key={String(o.id)}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.id)}
            style={{
              ...bare,
              minWidth: 36,
              padding: "6px 11px",
              borderRadius: 7,
              display: "flex",
              justifyContent: "center",
              fontSize: 12,
              fontWeight: 600,
              background: on ? colors.surface : "transparent",
              color: on ? colors.detailLabel : colors.detailValue,
              transition: "background 120ms ease, color 120ms ease",
            }}
          >
            {render ? render(o) : o.label}
          </button>
        );
      })}
    </div>
  );
}

function Switch({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  const { colors } = useTheme();
  const { accent } = useClipboardPrefs();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      style={{
        ...bare,
        position: "relative",
        width: 40,
        height: 24,
        borderRadius: 12,
        background: on ? (accent ?? "#30D158") : colors.track,
        transition: "background 160ms ease",
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 3,
          left: on ? 19 : 3,
          width: 18,
          height: 18,
          borderRadius: 9,
          background: "#FFFFFF",
          boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
          transition: "left 160ms ease",
        }}
      />
    </button>
  );
}

/** Comillas de shell solo si la ruta las necesita (una AppImage en `~/Mis apps`). */
const shellQuote = (s: string) => (/^[\w./-]+$/.test(s) ? s : `'${s.replace(/'/g, "'\\''")}'`);

/* ── Atajos ─────────────────────────────────────────────────────────────── */

/** Modificadores de Qt: el atajo viaja a KGlobalAccel como `modificadores | tecla`. */
const QT_MODS = [
  { flag: 0x10000000, name: "Meta", on: (e: KeyboardEvent | React.KeyboardEvent) => e.metaKey },
  { flag: 0x04000000, name: "Ctrl", on: (e: KeyboardEvent | React.KeyboardEvent) => e.ctrlKey },
  { flag: 0x08000000, name: "Alt", on: (e: KeyboardEvent | React.KeyboardEvent) => e.altKey },
  { flag: 0x02000000, name: "Shift", on: (e: KeyboardEvent | React.KeyboardEvent) => e.shiftKey },
];
const MOD_MASK = QT_MODS.reduce((m, x) => m | x.flag, 0);

/** `KeyboardEvent.code` -> [tecla de Qt, nombre de Qt]. Por `code`, no `key`: con Shift, `key` ya es otro caracter. */
const QT_KEYS: Record<string, [number, string]> = {
  ...Object.fromEntries(
    Array.from({ length: 26 }, (_, i) => [`Key${String.fromCharCode(65 + i)}`, [65 + i, String.fromCharCode(65 + i)]]),
  ),
  ...Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`Digit${i}`, [48 + i, String(i)]])),
  ...Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`F${i + 1}`, [0x01000030 + i, `F${i + 1}`]])),
  Space: [0x20, "Space"],
  Insert: [0x01000006, "Ins"],
  Delete: [0x01000007, "Del"],
  Home: [0x01000010, "Home"],
  End: [0x01000011, "End"],
  PageUp: [0x01000016, "PgUp"],
  PageDown: [0x01000017, "PgDown"],
  ArrowLeft: [0x01000012, "Left"],
  ArrowUp: [0x01000013, "Up"],
  ArrowRight: [0x01000014, "Right"],
  ArrowDown: [0x01000015, "Down"],
  Comma: [0x2c, ","],
  Period: [0x2e, "."],
  Slash: [0x2f, "/"],
  Minus: [0x2d, "-"],
  Equal: [0x3d, "="],
  Semicolon: [0x3b, ";"],
};

/** Texto de Qt de un atajo (`Meta+Shift+V`), el que entiende `X-KDE-Shortcuts`. */
function qtLabel(key: number): string {
  const base = key & ~MOD_MASK;
  const name = Object.values(QT_KEYS).find(([k]) => k === base)?.[1] ?? "?";
  return [...QT_MODS.filter((m) => key & m.flag).map((m) => m.name), name].join("+");
}

/** Nombres para pintar: Qt dice `Del`, el teclado español dice `Supr`. */
const ARROWS: Record<string, string> = { Up: "↑", Down: "↓", Left: "←", Right: "→" };
const KEY_CAPS = {
  es: { ...ARROWS, Del: "Supr", Ins: "Insert", PgUp: "RePág", PgDown: "AvPág", Space: "Espacio" },
  en: { ...ARROWS, Del: "Delete", Ins: "Insert", PgUp: "PgUp", PgDown: "PgDn", Space: "Space" },
} satisfies Record<string, Record<string, string>>;

function Kbd({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <kbd
      style={{
        minWidth: 24,
        height: 24,
        padding: "0 7px",
        borderRadius: 6,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "inherit",
        fontSize: 11.5,
        fontWeight: 600,
        background: colors.track,
        color: colors.detailLabel,
        // Canto inferior de tecla: se lee como tecla y no como etiqueta.
        boxShadow: `inset 0 -2px 0 rgba(0,0,0,0.35)`,
      }}
    >
      {children}
    </kbd>
  );
}

function Keys({ label }: { label: string }) {
  const { lang } = useI18n();
  const caps: Record<string, string> = KEY_CAPS[lang];
  return (
    <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
      {label.split("+").map((k, i) => (
        <Kbd key={i}>{caps[k] ?? k}</Kbd>
      ))}
    </span>
  );
}

const CARD_KEYS: [Pair, string][] = [
  [["Moverse por la lista", "Move through the list"], "Up+Down"],
  [["Copiar el seleccionado", "Copy the selected item"], "Enter"],
  [["Copiar del 1.º al 9.º", "Copy the 1st to 9th"], "Alt+1…9"],
  [["Cambiar entre Recientes y Fijados", "Switch between Recent and Pinned"], "Tab"],
  [["Fijar o desfijar", "Pin or unpin"], "Ctrl+P"],
  [["Eliminar el seleccionado", "Delete the selected item"], "Shift+Del"],
  [["Buscar", "Search"], "Ctrl+F"],
  [["Cerrar", "Close"], "Esc"],
];

const SUGGESTED = [0x10000000 | 0x02000000 | 0x56, 0x04000000 | 0x08000000 | 0x56]; // Meta+Shift+V, Ctrl+Alt+V

type Recording =
  | { phase: "idle" }
  | { phase: "listening"; held: string[] }
  | { phase: "conflict"; key: number; owner: string }
  | { phase: "saving" }
  | { phase: "error"; message: string };

function Shortcuts() {
  const { colors } = useTheme();
  const { tr } = useI18n();
  const [state, setState] = useState<{ supported: boolean; key: number } | null>(null);
  const [rec, setRec] = useState<Recording>({ phase: "idle" });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!inTauri) return setState({ supported: true, key: 0 });
    void call<{ supported: boolean; key: number }>("global_shortcut").then((s) => s && setState(s));
  }, []);

  const listening = rec.phase === "listening";
  // Mientras se graba, KDE no ejecuta sus atajos (si no, Meta+V abriria Klipper
  // antes de llegar aqui). Se suelta siempre: al terminar, al perder el foco la
  // ventana, y a los 10 s por si acaso, que un bloqueo olvidado deja el escritorio sin atajos.
  useEffect(() => {
    if (!listening) return;
    void call("block_global_shortcuts", { block: true });
    const stop = () => setRec({ phase: "idle" });
    const timer = setTimeout(stop, 10000);
    window.addEventListener("blur", stop);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("blur", stop);
      void call("block_global_shortcuts", { block: false });
    };
  }, [listening]);

  const apply = async (key: number, steal = false) => {
    if (key && !steal) {
      const owner = await call<string | null>("global_shortcut_owner", { key });
      if (owner) return setRec({ phase: "conflict", key, owner });
    }
    setRec({ phase: "saving" });
    try {
      await call("set_global_shortcut", { key, label: key ? qtLabel(key) : "", steal });
      setState((s) => s && { ...s, key });
      setRec({ phase: "idle" });
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } catch (err) {
      setRec({ phase: "error", message: String(err) });
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!listening) return;
    // Nada de lo que se pulse aqui llega a la ventana: Esc no la cierra.
    e.preventDefault();
    e.stopPropagation();
    if (e.key === "Escape") return setRec({ phase: "idle" });
    const held = QT_MODS.filter((m) => m.on(e)).map((m) => m.name);
    const base = QT_KEYS[e.code];
    if (!base) return setRec({ phase: "listening", held });
    const isF = /^F\d+$/.test(base[1]);
    // Una letra sola (o con Shift) se comeria la escritura en cualquier app.
    if (!isF && !held.some((m) => m !== "Shift")) {
      return setRec({ phase: "listening", held: [tr("Ctrl, Alt o Meta + tecla", "Ctrl, Alt or Meta + key")] });
    }
    const key = QT_MODS.filter((m) => m.on(e)).reduce((k, m) => k | m.flag, base[0]);
    void apply(key);
  };

  const onKeyUp = (e: React.KeyboardEvent) => {
    if (listening) setRec({ phase: "listening", held: QT_MODS.filter((m) => m.on(e)).map((m) => m.name) });
  };

  const ring = useRing();

  return (
    <>
      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: colors.detailValue }}>
        {tr(
          "Abre el portapapeles desde cualquier aplicación y muévete por él sin tocar el ratón.",
          "Open the clipboard from any app and move through it without touching the mouse.",
        )}
      </p>

      <Card title="Global">
        {state && !state.supported ? (
          <div style={{ padding: "14px 0", display: "flex", gap: 8, fontSize: 12.5, lineHeight: 1.5, color: colors.detailValue }}>
            <Info size={15} strokeWidth={2} style={{ flex: "none", marginTop: 2 }} />
            <span>
              {tr(
                "Los atajos globales solo están disponibles en KDE Plasma. Puedes asignar la orden",
                "Global shortcuts are only available on KDE Plasma. You can bind the command",
              )}
              <code style={{ color: colors.detailLabel }}> rimarc --clipboard </code>
              {tr("desde los ajustes de tu escritorio.", "from your desktop settings.")}
            </span>
          </div>
        ) : (
          <>
            <Row
              label={tr("Abrir el portapapeles", "Open the clipboard")}
              hint={
                listening
                  ? tr("Esc para cancelar", "Esc to cancel")
                  : rec.phase === "saving"
                    ? tr("Registrando en KDE…", "Registering with KDE…")
                    : saved
                      ? tr("Guardado", "Saved")
                      : tr("Desde cualquier aplicación", "From any app")
              }
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setRec(listening ? { phase: "idle" } : { phase: "listening", held: [] })}
                  onKeyDown={onKeyDown}
                  onKeyUp={onKeyUp}
                  disabled={!state || rec.phase === "saving"}
                  aria-label={tr("Grabar atajo", "Record shortcut")}
                  style={{
                    ...bare,
                    minWidth: 150,
                    height: 36,
                    padding: "0 12px",
                    borderRadius: 9,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    fontSize: 12.5,
                    fontWeight: 600,
                    background: listening ? "transparent" : colors.surface,
                    color: colors.detailValue,
                    boxShadow: `inset 0 0 0 1px ${colors.track}`,
                    ...ring(listening),
                  }}
                >
                  {listening ? (
                    rec.held.length ? (
                      <span style={{ color: colors.detailLabel }}>{rec.held.join(" + ")} + …</span>
                    ) : (
                      <span className="shortcut-listening">{tr("Pulsa la combinación…", "Press the combination…")}</span>
                    )
                  ) : saved ? (
                    <span style={{ display: "flex", alignItems: "center", gap: 6, color: "#30D158" }}>
                      <Check size={14} strokeWidth={2.4} /> <Keys label={qtLabel(state!.key)} />
                    </span>
                  ) : state?.key ? (
                    <Keys label={qtLabel(state.key)} />
                  ) : (
                    tr("Asignar atajo", "Set shortcut")
                  )}
                </button>
                {!!state?.key && !listening && (
                  <button
                    type="button"
                    title={tr("Quitar atajo", "Remove shortcut")}
                    aria-label={tr("Quitar atajo", "Remove shortcut")}
                    onClick={() => void apply(0)}
                    style={{ ...bare, padding: 6, borderRadius: 8, color: colors.detailValue, display: "flex" }}
                  >
                    <X size={15} strokeWidth={2} />
                  </button>
                )}
              </div>
            </Row>

            {rec.phase === "conflict" && (
              <Notice tone="warn">
                <span style={{ flex: 1 }}>
                  <Keys label={qtLabel(rec.key)} /> {tr("ya lo usa", "is already used by")} <b style={{ color: colors.detailLabel }}>{rec.owner}</b>.
                </span>
                <SmallButton onClick={() => void apply(rec.key, true)} primary>
                  {tr("Reasignar", "Reassign")}
                </SmallButton>
                <SmallButton onClick={() => setRec({ phase: "idle" })}>{tr("Cancelar", "Cancel")}</SmallButton>
              </Notice>
            )}
            {rec.phase === "error" && (
              <Notice tone="error">
                <span style={{ flex: 1 }}>{rec.message}</span>
                <SmallButton onClick={() => setRec({ phase: "idle" })}>OK</SmallButton>
              </Notice>
            )}

            {!state?.key && rec.phase === "idle" && (
              <Row label={tr("Sugerencias", "Suggestions")} hint={tr("Un clic y listo", "One click and done")}>
                <div style={{ display: "flex", gap: 8 }}>
                  {SUGGESTED.map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => void apply(key)}
                      style={{ ...bare, padding: 3, borderRadius: 8, boxShadow: `inset 0 0 0 1px ${colors.track}` }}
                    >
                      <Keys label={qtLabel(key)} />
                    </button>
                  ))}
                </div>
              </Row>
            )}
          </>
        )}
      </Card>

      <Card title={tr("En la carta", "In the card")}>
        {CARD_KEYS.map(([pair, keys]) => (
          <div
            key={keys}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              minHeight: 42,
              borderTop: `1px solid ${colors.track}`,
              fontSize: 13,
              color: colors.detailLabel,
            }}
          >
            {tr(...pair)}
            <Keys label={keys} />
          </div>
        ))}
      </Card>
    </>
  );
}

function Notice({ tone, children }: { tone: "warn" | "error"; children: React.ReactNode }) {
  const { colors } = useTheme();
  const color = tone === "warn" ? "#FF9F0A" : "#FF453A";
  return (
    <div
      role="alert"
      style={{
        margin: "0 0 12px",
        padding: "10px 12px",
        borderRadius: 9,
        display: "flex",
        alignItems: "center",
        gap: 10,
        fontSize: 12.5,
        lineHeight: 1.6,
        color: colors.detailValue,
        background: `${color}1f`,
        boxShadow: `inset 0 0 0 1px ${color}55`,
      }}
    >
      <AlertTriangle size={15} strokeWidth={2} color={color} style={{ flex: "none" }} />
      {children}
    </div>
  );
}

function SmallButton({ primary, onClick, children }: { primary?: boolean; onClick: () => void; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...bare,
        flex: "none",
        padding: "5px 11px",
        borderRadius: 7,
        fontSize: 12,
        fontWeight: 600,
        background: primary ? colors.detailLabel : colors.track,
        color: primary ? colors.surface : colors.detailLabel,
      }}
    >
      {children}
    </button>
  );
}

type Agent = "claude" | "codex" | "json";

/** Los mismos colores que el canto de `.rainbow-button` (index.css). */
const RAINBOW = "linear-gradient(115deg, #4fcf70, #fad648, #a767e5, #12bcfe)";

/**
 * Como conectar el servidor MCP del portapapeles (`rimarc --mcp`). La ruta la da
 * el backend: es la de este mismo binario, asi que lo copiado funciona tal cual.
 * Primero la via que sirve para casi todos (el prompt); a mano, despues.
 */
function Mcp() {
  const { colors } = useTheme();
  const { lang, tr } = useI18n();
  const [bin, setBin] = useState("rimarc");
  const [agent, setAgent] = useState<Agent>("claude");
  const [copied, setCopied] = useState<string | null>(null);
  useEffect(() => {
    void call<string>("mcp_command").then((p) => p && setBin(p));
  }, []);

  // Un prompt que se pega en cualquier agente y el agente se configura solo:
  // no hace falta saber donde guarda cada uno su configuracion MCP.
  const prompt = (
    lang === "es"
      ? [
          "Añade a tu configuración un servidor MCP por stdio:",
          "- nombre: rimarc-clipboard",
          `- comando: ${bin}`,
          "- argumentos: --mcp",
          "Da acceso al historial del portapapeles, imágenes incluidas (herramienta clipboard_history).",
          "Si tienes CLI para añadir servidores MCP, úsalo; si no, edita tu fichero de configuración MCP.",
          "Cuando termines, dime si tengo que reiniciar la sesión para que cargue.",
        ]
      : [
          "Add a stdio MCP server to your configuration:",
          "- name: rimarc-clipboard",
          `- command: ${bin}`,
          "- arguments: --mcp",
          "It gives access to the clipboard history, images included (tool clipboard_history).",
          "If you have a CLI to add MCP servers, use it; otherwise edit your MCP configuration file.",
          "When you are done, tell me whether I need to restart the session for it to load.",
        ]
  ).join("\n");
  const example = tr("Mira las últimas 3 imágenes de mi portapapeles", "Look at the last 3 images in my clipboard");

  const manual: Record<Agent, { label: string; hint: string; code: string }> = {
    claude: {
      label: "Claude Code",
      hint: tr("Ejecútalo en tu terminal.", "Run it in your terminal."),
      code: `claude mcp add -s user rimarc-clipboard -- ${shellQuote(bin)} --mcp`,
    },
    codex: {
      label: "Codex",
      hint: tr("Añádelo a ~/.codex/config.toml.", "Add it to ~/.codex/config.toml."),
      code: `[mcp_servers.rimarc-clipboard]\ncommand = ${JSON.stringify(bin)}\nargs = ["--mcp"]`,
    },
    json: {
      label: tr("Otros", "Others"),
      hint: tr("Cursor, Gemini CLI, Claude Desktop: en su fichero de configuración MCP.", "Cursor, Gemini CLI, Claude Desktop: in their MCP configuration file."),
      code: JSON.stringify({ mcpServers: { "rimarc-clipboard": { command: bin, args: ["--mcp"] } } }, null, 2),
    },
  };

  const copy = async (key: string, text: string) => {
    await call("set_clipboard_content", { text });
    setCopied(key);
    setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
  };

  return (
    <>
      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: colors.detailValue }}>
        {tr(
          "Deja que tu agente de IA lea el historial del portapapeles, imágenes incluidas.",
          "Let your AI agent read the clipboard history, images included.",
        )}
      </p>

      <Card title={tr("Recomendado", "Recommended")}>
        <div style={{ padding: "16px 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span
              style={{
                flex: "none",
                width: 38,
                height: 38,
                borderRadius: 11,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: RAINBOW,
                color: "#FFFFFF",
              }}
            >
              <Sparkles size={18} strokeWidth={2.2} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: colors.detailLabel }}>{tr("Configuración automática", "Automatic setup")}</div>
              <div style={{ marginTop: 3, fontSize: 12, color: colors.detailValue }}>
                {tr("Sirve para casi cualquier agente", "Works with almost any agent")}
              </div>
            </div>
            <button
              type="button"
              className="rainbow-button"
              onClick={() => copy("prompt", prompt)}
              style={{ flex: "none", ["--rainbow-fill" as string]: colors.surface }}
            >
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: copied === "prompt" ? "#30D158" : colors.detailLabel,
                }}
              >
                {copied === "prompt" ? <Check size={15} strokeWidth={2.4} /> : <Copy size={15} strokeWidth={2} />}
                {copied === "prompt" ? tr("Copiado", "Copied") : tr("Copiar prompt", "Copy prompt")}
              </span>
            </button>
          </div>

          {/* Pasos en linea, numerados: se leen de un vistazo sin ocupar tres filas. */}
          <ol
            style={{
              margin: "16px 0 0",
              padding: "12px 0 0",
              listStyle: "none",
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 12,
              borderTop: `1px solid ${colors.track}`,
            }}
          >
            {[
              tr("Copia el prompt", "Copy the prompt"),
              tr("Pégalo en tu agente", "Paste it into your agent"),
              tr("Reinicia si te lo pide", "Restart if it asks"),
            ].map((step, i) => (
              <li key={step} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: colors.detailValue }}>
                <span
                  style={{
                    flex: "none",
                    width: 20,
                    height: 20,
                    borderRadius: 10,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 11,
                    fontWeight: 700,
                    background: colors.track,
                    color: colors.detailLabel,
                  }}
                >
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </div>
      </Card>

      <Card title={tr("Manual", "Manual")}>
        <div style={{ padding: "14px 0 16px" }}>
          <Segmented
            options={(Object.keys(manual) as Agent[]).map((id) => ({ id, label: manual[id].label }))}
            value={agent}
            onChange={setAgent}
          />
          <div style={{ margin: "12px 0 8px", fontSize: 12, color: colors.detailValue }}>{manual[agent].hint}</div>
          <CodeBlock code={manual[agent].code} copied={copied === agent} onCopy={() => copy(agent, manual[agent].code)} />
        </div>
      </Card>

      <Card title={tr("Pruébalo", "Try it")}>
        <Row label={tr(`«${example}»`, `“${example}”`)} hint={tr("Pídeselo a tu agente cuando esté conectado", "Ask your agent once it is connected")}>
          <CopyChip copied={copied === "example"} onCopy={() => copy("example", example)} />
        </Row>
      </Card>

      <div style={{ marginTop: 16, display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12, lineHeight: 1.5, color: colors.detailValue }}>
        <Info size={14} strokeWidth={2} style={{ flex: "none", marginTop: 2 }} />
        {tr(
          "Lee el historial de Klipper (KDE Plasma 6). Funciona aunque Rimarc esté cerrado.",
          "Reads the Klipper history (KDE Plasma 6). Works even when Rimarc is closed.",
        )}
      </div>
    </>
  );
}

/** Codigo con su boton de copiar a la vista: antes habia que adivinar que el bloque entero era clicable. */
function CodeBlock({ code, copied, onCopy }: { code: string; copied: boolean; onCopy: () => void }) {
  const { colors } = useTheme();
  return (
    <div style={{ position: "relative" }}>
      <pre
        style={{
          margin: 0,
          padding: "12px 96px 12px 14px",
          borderRadius: 9,
          background: colors.track,
          color: colors.detailLabel,
          fontFamily: "ui-monospace, monospace",
          fontSize: 12,
          lineHeight: 1.55,
          whiteSpace: "pre-wrap",
          wordBreak: "break-all",
          userSelect: "text",
        }}
      >
        {code}
      </pre>
      <div style={{ position: "absolute", top: 8, right: 8 }}>
        <CopyChip copied={copied} onCopy={onCopy} />
      </div>
    </div>
  );
}

function CopyChip({ copied, onCopy }: { copied: boolean; onCopy: () => void }) {
  const { colors } = useTheme();
  const { tr } = useI18n();
  return (
    <button
      type="button"
      onClick={onCopy}
      style={{
        ...bare,
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "5px 10px",
        borderRadius: 7,
        fontSize: 12,
        fontWeight: 600,
        background: colors.surface,
        color: copied ? "#30D158" : colors.detailLabel,
        boxShadow: `inset 0 0 0 1px ${colors.track}`,
      }}
    >
      {copied ? <Check size={13} strokeWidth={2.4} /> : <Copy size={13} strokeWidth={2} />}
      {copied ? tr("Copiado", "Copied") : tr("Copiar", "Copy")}
    </button>
  );
}

const bare = {
  border: "none",
  background: "transparent",
  cursor: "pointer",
  fontFamily: "inherit",
  textAlign: "left",
} as const;

