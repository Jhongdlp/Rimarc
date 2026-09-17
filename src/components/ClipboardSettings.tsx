import { useEffect, useState } from "react";
import { Ban, Check, Copy, Info, List, Monitor, Moon, Palette, Plug, RotateCcw, Sparkles, Sun, X } from "lucide-react";
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
import { call } from "../lib/tauri";

type Section = "appearance" | "list" | "mcp";

const SECTIONS: { id: Section; label: string; title: string; icon: typeof Plug }[] = [
  { id: "appearance", label: "Apariencia", title: "Apariencia", icon: Palette },
  { id: "list", label: "Lista", title: "Lista", icon: List },
  { id: "mcp", label: "Conectar", title: "Conectar a un agente", icon: Plug },
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
          Portapapeles
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
              {label}
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
            {SECTIONS.find((x) => x.id === section)!.title}
          </h1>
          <CloseButton />
        </header>
        <main key={section} style={{ flex: 1, overflowY: "auto", padding: "0 28px 20px", scrollbarWidth: "thin" }}>
          {section === "appearance" ? <Appearance /> : section === "list" ? <ListPrefs /> : <Mcp />}
        </main>
      </div>
    </div>
  );
}

function CloseButton() {
  const { colors } = useTheme();
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      title="Cerrar (Esc)"
      aria-label="Cerrar"
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
const THEMES: { id: ThemeMode; label: string; icon: typeof Sun; swatch: string; ink: string }[] = [
  { id: "light", label: "Claro", icon: Sun, swatch: "#FFFFFF", ink: "#1C1C1E" },
  { id: "dark", label: "Oscuro", icon: Moon, swatch: "#000000", ink: "#FFFFFF" },
  // El glifo en blanco con `difference` sale negro sobre la mitad blanca y blanco sobre la negra.
  { id: "system", label: "Sistema", icon: Monitor, swatch: "linear-gradient(135deg, #FFFFFF 50%, #000000 50%)", ink: "#FFFFFF" },
];

const WIDTHS: { id: ClipboardPrefs["borderWidth"]; label: string }[] = [
  { id: 1, label: "Fino" },
  { id: 2, label: "Medio" },
  { id: 3, label: "Grueso" },
];

const FONT_SCALES = [
  { id: 0.9, label: "Pequeña" },
  { id: 1, label: "Normal" },
  { id: 1.15, label: "Grande" },
];

const OPACITIES = [
  { id: 1, label: "100 %" },
  { id: 0.9, label: "90 %" },
  { id: 0.8, label: "80 %" },
  { id: 0.65, label: "65 %" },
];

const DENSITIES: { id: ClipboardPrefs["density"]; label: string }[] = [
  { id: "compact", label: "Compacta" },
  { id: "comfy", label: "Cómoda" },
];

const LINES: { id: ClipboardPrefs["previewLines"]; label: string }[] = [
  { id: 1, label: "1" },
  { id: 2, label: "2" },
  { id: 3, label: "3" },
];

const LIMITS: { id: ClipboardPrefs["historyLimit"]; label: string }[] = [
  { id: 25, label: "25" },
  { id: 50, label: "50" },
  { id: 100, label: "100" },
];

const paletteName = (color: string) => PALETTE.find((p) => p.color === color)?.label ?? color;

function Appearance() {
  const { colors, theme, setTheme, isDark } = useTheme();
  const prefs = useClipboardPrefs();
  const ring = useRing();

  return (
    <>
      <Preview />

      <Card>
        <Row label="Tema" hint={THEMES.find((t) => t.id === theme)?.label}>
          <div role="radiogroup" style={{ display: "flex", gap: 10 }}>
            {THEMES.map(({ id, label, icon: Icon, swatch, ink }) => (
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

        <Row label="Acento" hint={prefs.accent ? paletteName(prefs.accent) : "Automático"}>
          <Swatches
            value={prefs.accent}
            extra={[{ id: null, label: "Automático", color: colors.detailLabel }]}
            onChange={(accent) => setClipboardPrefs({ accent })}
          />
        </Row>
      </Card>

      <Card title="Carta">
        <Row
          label="Borde"
          hint={
            prefs.border === "none" ? "Sin borde" : prefs.border === "auto" ? "Según el tema" : paletteName(prefs.borderColor)
          }
        >
          <Swatches
            value={prefs.border === "custom" ? prefs.borderColor : prefs.border}
            extra={[
              { id: "none", label: "Sin borde" },
              { id: "auto", label: "Según el tema", color: borderColorFor({ ...prefs, border: "auto" }, isDark) },
            ]}
            onChange={(v) =>
              setClipboardPrefs(v === "none" || v === "auto" ? { border: v } : { border: "custom", borderColor: v })
            }
          />
        </Row>

        {/* Sin borde el grosor no significa nada: se queda, pero apagado. */}
        <Row label="Grosor del borde" disabled={prefs.border === "none"}>
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

        <Row label="Opacidad del fondo" hint="Deja ver el escritorio a través">
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
  return (
    <>
      <Preview />

      <Card title="Texto">
        <Row label="Tamaño de letra">
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
        <Row label="Líneas de vista previa" hint="Cuánto texto enseña cada elemento">
          <Segmented options={LINES} value={prefs.previewLines} onChange={(previewLines) => setClipboardPrefs({ previewLines })} />
        </Row>
        <Row label="Densidad" hint="Espacio entre elementos">
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

      <Card title="Comportamiento">
        <Row label="Elementos en el historial" hint="Los fijados se guardan aparte">
          <Segmented options={LIMITS} value={prefs.historyLimit} onChange={(historyLimit) => setClipboardPrefs({ historyLimit })} />
        </Row>
        <Row label="Cerrar al copiar" hint="Desactívalo para copiar varios seguidos">
          <Switch on={prefs.closeOnCopy} onChange={(closeOnCopy) => setClipboardPrefs({ closeOnCopy })} />
        </Row>
      </Card>

      <Reset />
    </>
  );
}

const SAMPLE = [
  { text: "pnpm dev:tauri\ncargo check --manifest-path src-tauri/Cargo.toml\ngit status", meta: "Copiado", mono: true },
  { text: "La reunión se mueve al jueves a las 10:00.\nTraed la demo del portapapeles.", meta: "Texto  ·  74 car.", mono: false },
];

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
            <span style={{ paddingBottom: 5, color: colors.detailLabel, borderBottom: `2px solid ${accent}` }}>Recientes</span>
            <span style={{ color: colors.detailValue }}>Fijados</span>
          </div>
          {SAMPLE.map((r) => (
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
                  color: r.meta === "Copiado" ? accent : colors.detailValue,
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
      Restablecer valores
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
  const options = [...extra, ...PALETTE.map((p) => ({ id: p.color, label: p.label, color: p.color }))];
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
  options: { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  render?: (o: { id: T; label: string }) => React.ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <div role="radiogroup" style={{ display: "inline-flex", padding: 3, gap: 2, borderRadius: 9, background: colors.track }}>
      {options.map((o) => {
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
  const [bin, setBin] = useState("rimarc");
  const [agent, setAgent] = useState<Agent>("claude");
  const [copied, setCopied] = useState<string | null>(null);
  useEffect(() => {
    void call<string>("mcp_command").then((p) => p && setBin(p));
  }, []);

  // Un prompt que se pega en cualquier agente y el agente se configura solo:
  // no hace falta saber donde guarda cada uno su configuracion MCP.
  const prompt = [
    "Añade a tu configuración un servidor MCP por stdio:",
    "- nombre: rimarc-clipboard",
    `- comando: ${bin}`,
    "- argumentos: --mcp",
    "Da acceso al historial del portapapeles, imágenes incluidas (herramienta clipboard_history).",
    "Si tienes CLI para añadir servidores MCP, úsalo; si no, edita tu fichero de configuración MCP.",
    "Cuando termines, dime si tengo que reiniciar la sesión para que cargue.",
  ].join("\n");
  const example = "Mira las últimas 3 imágenes de mi portapapeles";

  const manual: Record<Agent, { label: string; hint: string; code: string }> = {
    claude: {
      label: "Claude Code",
      hint: "Ejecútalo en tu terminal.",
      code: `claude mcp add -s user rimarc-clipboard -- ${shellQuote(bin)} --mcp`,
    },
    codex: {
      label: "Codex",
      hint: "Añádelo a ~/.codex/config.toml.",
      code: `[mcp_servers.rimarc-clipboard]\ncommand = ${JSON.stringify(bin)}\nargs = ["--mcp"]`,
    },
    json: {
      label: "Otros",
      hint: "Cursor, Gemini CLI, Claude Desktop: en su fichero de configuración MCP.",
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
        Deja que tu agente de IA lea el historial del portapapeles, imágenes incluidas.
      </p>

      <Card title="Recomendado">
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
              <div style={{ fontSize: 14, fontWeight: 600, color: colors.detailLabel }}>Configuración automática</div>
              <div style={{ marginTop: 3, fontSize: 12, color: colors.detailValue }}>
                Sirve para casi cualquier agente
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
                {copied === "prompt" ? "Copiado" : "Copiar prompt"}
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
            {["Copia el prompt", "Pégalo en tu agente", "Reinicia si te lo pide"].map((step, i) => (
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

      <Card title="Manual">
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

      <Card title="Pruébalo">
        <Row label={`«${example}»`} hint="Pídeselo a tu agente cuando esté conectado">
          <CopyChip copied={copied === "example"} onCopy={() => copy("example", example)} />
        </Row>
      </Card>

      <div style={{ marginTop: 16, display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12, lineHeight: 1.5, color: colors.detailValue }}>
        <Info size={14} strokeWidth={2} style={{ flex: "none", marginTop: 2 }} />
        Lee el historial de Klipper (KDE Plasma 6). Funciona aunque Rimarc esté cerrado.
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
      {copied ? "Copiado" : "Copiar"}
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

