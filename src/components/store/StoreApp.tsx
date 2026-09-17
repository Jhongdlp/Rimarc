import { useState, useEffect, useMemo } from "react";
import { Minus, Search, Settings, X } from "lucide-react";
import { inTauri, call } from "../../lib/tauri";
import { useActiveToolId, setActiveTool, getAllTools } from "../../lib/toolStore";
import type { NotchTool, ToolCategory } from "../../tools/types";
import { clipboardTool } from "../../tools/clipboard";
import { FONT_FAMILY } from "../../design/tokens";
import { useTheme, type ThemeMode } from "../../lib/theme";
import { LANGS, setLang, useI18n } from "../../lib/i18n";
import rimarcLogo from "../../../assets/logo.png";

export interface StoreAppProps {
  onToggleView?: () => void;
}

export function StoreApp({ onToggleView = () => {} }: StoreAppProps) {
  const [isNotchActive, setIsNotchActive] = useState(false);
  const { colors } = useTheme();
  const { lang, tr } = useI18n();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [category, setCategory] = useState<ToolCategory | "all">("all");
  const activeId = useActiveToolId();
  const [isClipboardActive, setIsClipboardActive] = useState(false);
  // El portapapeles no ocupa el notch (vive en la bandeja): tiene su propio switch.
  const tools = [...getAllTools(), clipboardTool];

  // Consultar visibilidad real del notch y escuchar cambios
  useEffect(() => {
    void call<boolean>("get_clipboard_enabled").then((on) => {
      if (on !== null) setIsClipboardActive(on);
    });
  }, []);

  const handleToggleClipboard = async () => {
    const next = await call<boolean>("set_clipboard_enabled", { enabled: !isClipboardActive });
    if (next !== null) setIsClipboardActive(next);
  };

  useEffect(() => {
    void call<boolean>("get_notch_visibility").then((vis) => {
      if (vis !== null) setIsNotchActive(vis);
    });

    if (inTauri) {
      let unlisten: (() => void) | null = null;
      import("@tauri-apps/api/event")
        .then(({ listen }) => {
          listen<boolean>("notch_visibility_changed", (event) => {
            setIsNotchActive(Boolean(event.payload));
          })
            .then((fn) => {
              unlisten = fn;
            })
            .catch(() => {});
        })
        .catch(() => {});

      return () => {
        if (unlisten) unlisten();
      };
    }
  }, []);

  // Cada tarjeta enciende/apaga su componente: encendido = es el activo y el notch se ve.
  const handleToggleTool = async (id: string) => {
    if (id !== activeId) {
      setActiveTool(id);
      if (isNotchActive) return;
    }
    const next = await call<boolean>("toggle_notch_state");
    if (next !== null) {
      setIsNotchActive(next);
    } else {
      setIsNotchActive((prev) => !prev);
      onToggleView();
    }
  };

  const handleMinimize = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    e?.preventDefault();
    try {
      await call("minimize_store_window");
    } catch {}
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().minimize();
    } catch {}
  };

  const handleClose = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    e?.preventDefault();
    try {
      await call("close_store_window");
    } catch {}
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().hide();
    } catch {}
  };

  // Filtrado de herramientas por buscador
  const filteredTools = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return tools;
    return tools.filter((tool) => {
      const text = lang === "en" ? tool.en : tool;
      return text.name.toLowerCase().includes(q) || tool.id.toLowerCase().includes(q) || text.tagline.toLowerCase().includes(q);
    });
  }, [tools, searchQuery, lang]);

  const visibleTools = category === "all" ? filteredTools : filteredTools.filter((t) => t.category === category);
  const categories = CATEGORIES.filter((c) => c.id === "all" || tools.some((t) => t.category === c.id));

  return (
    <div
      className="rimarc-store-app"
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        // La ventana es transparente: las esquinas las pone este recorte, como en
        // los ajustes del portapapeles.
        borderRadius: 16,
        overflow: "hidden",
        border: `1px solid ${colors.track}`,
        background: colors.surface,
        color: colors.detailLabel,
        fontFamily: FONT_FAMILY,
        userSelect: "none",
      }}
    >
      <header
        data-tauri-drag-region
        style={{
          flex: "none",
          height: 68,
          padding: "0 16px 0 24px",
          display: "flex",
          alignItems: "center",
          gap: 14,
        }}
      >
        <img
          src={rimarcLogo}
          alt=""
          data-tauri-drag-region
          style={{ width: 32, height: 32, borderRadius: 9, objectFit: "contain", boxShadow: `inset 0 0 0 1px ${colors.track}` }}
        />
        <div data-tauri-drag-region style={{ minWidth: 0 }}>
          <div data-tauri-drag-region style={{ fontSize: 16, fontWeight: 600, color: colors.title }}>
            {tr("Componentes", "Components")}
          </div>
          <div data-tauri-drag-region style={{ marginTop: 2, fontSize: 12, color: colors.detailValue }}>
            {tr("Elige qué vive en tu notch", "Choose what lives in your notch")}
          </div>
        </div>

        <div data-tauri-drag-region style={{ flex: 1, alignSelf: "stretch" }} />

        <label
          style={{
            width: 240,
            height: 36,
            padding: "0 10px 0 12px",
            borderRadius: 10,
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: colors.track,
            cursor: "text",
          }}
        >
          <Search size={15} strokeWidth={2} color={colors.detailValue} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={tr("Buscar", "Search")}
            spellCheck={false}
            style={{
              flex: 1,
              minWidth: 0,
              border: "none",
              outline: "none",
              background: "transparent",
              color: colors.detailLabel,
              caretColor: colors.detailLabel,
              fontFamily: "inherit",
              fontSize: 13,
              fontWeight: 500,
            }}
          />
          {searchQuery && (
            <button
              type="button"
              aria-label={tr("Limpiar búsqueda", "Clear search")}
              onClick={() => setSearchQuery("")}
              style={{ ...bare, display: "flex", padding: 2, borderRadius: 10, color: colors.detailValue }}
            >
              <X size={14} strokeWidth={2} />
            </button>
          )}
        </label>

        <div style={{ display: "flex", gap: 6, marginLeft: 6 }}>
          <WindowButton title={tr("Ajustes", "Settings")} onClick={() => setSettingsOpen((o) => !o)}>
            <Settings size={15} strokeWidth={2} />
          </WindowButton>
          <WindowButton title={tr("Minimizar", "Minimize")} onClick={handleMinimize}>
            <Minus size={15} strokeWidth={2.2} />
          </WindowButton>
          <WindowButton title={tr("Cerrar a la bandeja", "Close to tray")} onClick={handleClose}>
            <X size={15} strokeWidth={2.2} />
          </WindowButton>
        </div>
      </header>

      {settingsOpen && <StoreSettings onClose={() => setSettingsOpen(false)} />}

      {/* Filtros por categoria: solo las que tienen algun componente. */}
      <nav style={{ flex: "none", padding: "4px 24px 16px", display: "flex", gap: 6 }}>
        {categories.map((c) => {
          const on = category === c.id;
          const count = c.id === "all" ? filteredTools.length : filteredTools.filter((t) => t.category === c.id).length;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategory(c.id)}
              style={{
                ...bare,
                height: 30,
                padding: "0 12px",
                borderRadius: 15,
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12.5,
                fontWeight: 600,
                background: on ? colors.detailLabel : "transparent",
                color: on ? colors.surface : colors.detailValue,
                boxShadow: on ? "none" : `inset 0 0 0 1px ${colors.track}`,
                transition: "background 120ms ease, color 120ms ease",
              }}
            >
              {tr(c.label, c.en)}
              <span style={{ opacity: 0.6, fontVariantNumeric: "tabular-nums" }}>{count}</span>
            </button>
          );
        })}
      </nav>

      <main style={{ flex: 1, overflowY: "auto", padding: "0 24px 24px", scrollbarWidth: "thin" }}>
        {visibleTools.length === 0 ? (
          <div
            style={{
              height: 260,
              borderRadius: 16,
              border: `1px dashed ${colors.track}`,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              color: colors.detailValue,
            }}
          >
            <Search size={26} strokeWidth={1.6} />
            <div style={{ fontSize: 13, fontWeight: 600, color: colors.detailLabel }}>
              {searchQuery
                ? tr(`Nada para «${searchQuery}»`, `Nothing for “${searchQuery}”`)
                : tr("Nada en esta categoría", "Nothing in this category")}
            </div>
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setCategory("all");
              }}
              style={{
                ...bare,
                marginTop: 4,
                padding: "7px 14px",
                borderRadius: 9,
                fontSize: 12.5,
                fontWeight: 600,
                background: colors.track,
                color: colors.detailLabel,
              }}
            >
              {tr("Ver todos", "Show all")}
            </button>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
            {visibleTools.map((tool) => {
              const isClipboard = tool.id === clipboardTool.id;
              const isActive = isClipboard ? isClipboardActive : isNotchActive && tool.id === activeId;
              return (
                <ComponentCard
                  key={tool.id}
                  tool={tool}
                  isActive={isActive}
                  onActivate={() => void (isClipboard ? handleToggleClipboard() : handleToggleTool(tool.id))}
                />
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

const CATEGORIES: { id: ToolCategory | "all"; label: string; en: string }[] = [
  { id: "all", label: "Todos", en: "All" },
  { id: "ai", label: "IA", en: "AI" },
  { id: "productivity", label: "Productividad", en: "Productivity" },
  { id: "utilities", label: "Utilidades", en: "Utilities" },
  { id: "system", label: "Sistema", en: "System" },
];

/**
 * Ajustes de la tienda, desplegados bajo la cabecera. El tema es solo de esta
 * ventana; el idioma es global y lo difunde `setLang` al resto.
 */
function StoreSettings({ onClose }: { onClose: () => void }) {
  const { colors, theme, setTheme } = useTheme();
  const { lang, t } = useI18n();
  return (
    <>
      {/* Fondo invisible: pulsar fuera cierra el panel. */}
      <div onMouseDown={onClose} style={{ position: "absolute", inset: 0, zIndex: 10 }} />
      <section
        style={{
          position: "absolute",
          top: 60,
          right: 16,
          zIndex: 11,
          width: 280,
          padding: 16,
          borderRadius: 14,
          display: "flex",
          flexDirection: "column",
          gap: 14,
          background: colors.surface,
          boxShadow: `0 12px 32px rgba(0,0,0,0.3), inset 0 0 0 1px ${colors.track}`,
        }}
      >
        <Segmented
          label={t.theme}
          options={[
            { id: "light", label: t.themeLight },
            { id: "dark", label: t.themeDark },
            { id: "system", label: t.themeSystem },
          ]}
          selected={theme}
          onSelect={(id) => setTheme(id as ThemeMode)}
        />
        <Segmented label={t.language} options={LANGS} selected={lang} onSelect={(id) => setLang(id as "es" | "en")} />
      </section>
    </>
  );
}

function Segmented({
  label,
  options,
  selected,
  onSelect,
}: {
  label: string;
  options: { id: string; label: string }[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  const { colors } = useTheme();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: colors.detailValue }}>{label}</span>
      <div style={{ display: "flex", padding: 3, gap: 3, borderRadius: 10, background: colors.track }}>
        {options.map((o) => {
          const on = o.id === selected;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => onSelect(o.id)}
              style={{
                ...bare,
                flex: 1,
                height: 28,
                borderRadius: 7,
                textAlign: "center",
                fontSize: 12.5,
                fontWeight: 600,
                background: on ? colors.surface : "transparent",
                color: on ? colors.detailLabel : colors.detailValue,
                transition: "background 120ms ease, color 120ms ease",
              }}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const bare = {
  border: "none",
  background: "transparent",
  cursor: "pointer",
  fontFamily: "inherit",
  textAlign: "left",
} as const;

/** Botones de ventana redondos y siempre con fondo, como el cierre de los ajustes. */
function WindowButton({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  const { colors } = useTheme();
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      // El `data-tauri-drag-region` de la cabecera se quedaria con la pulsacion.
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={onClick}
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
        background: hover ? colors.detailValue : colors.track,
        color: hover ? colors.surface : colors.detailLabel,
        transition: "background 120ms ease, color 120ms ease",
      }}
    >
      {children}
    </button>
  );
}

/**
 * Tarjeta de componente: escenario con la miniatura, nombre con su etiqueta, lema
 * y un interruptor. Encendido, el canto se ilumina en verde en lugar de cambiar
 * todo el bloque de color.
 */
function ComponentCard({
  tool,
  isActive,
  onActivate,
}: {
  tool: NotchTool<any>;
  isActive: boolean;
  onActivate: () => void;
}) {
  const { colors, isDark } = useTheme();
  const { lang, tr } = useI18n();
  const text = lang === "en" ? tool.en : tool;
  const [hover, setHover] = useState(false);
  const Icon = tool.icon;
  return (
    <article
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: 10,
        borderRadius: 18,
        display: "flex",
        flexDirection: "column",
        background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
        boxShadow: `inset 0 0 0 1px ${isActive ? "rgba(48,209,88,0.55)" : hover ? colors.detailValue : colors.track}`,
        transform: hover ? "translateY(-2px)" : "none",
        transition: "box-shadow 160ms ease, transform 160ms ease",
      }}
    >
      <div
        style={{
          height: 140,
          borderRadius: 12,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          background: isDark
            ? "radial-gradient(120% 90% at 50% 0%, #1c1c20 0%, #0a0a0b 100%)"
            : "radial-gradient(120% 90% at 50% 0%, #f5f5f7 0%, #e9e9ee 100%)",
        }}
      >
        <img src={tool.thumbnail} alt="" draggable={false} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </div>

      <div style={{ padding: "14px 6px 4px", display: "flex", gap: 12, alignItems: "flex-start" }}>
        <span
          style={{
            flex: "none",
            width: 34,
            height: 34,
            borderRadius: 10,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: colors.track,
          }}
        >
          <Icon size={17} color={colors.detailLabel} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <h3
              title={text.name}
              style={{
                margin: 0,
                fontSize: 14,
                fontWeight: 600,
                color: colors.detailLabel,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {text.name}
            </h3>
            {text.badge && (
              <span
                style={{
                  flex: "none",
                  padding: "2px 7px",
                  borderRadius: 6,
                  fontSize: 10.5,
                  fontWeight: 600,
                  background: colors.track,
                  color: colors.detailValue,
                }}
              >
                {text.badge}
              </span>
            )}
          </div>
          <p
            title={text.description}
            style={{
              margin: "4px 0 0",
              fontSize: 12,
              lineHeight: 1.45,
              color: colors.detailValue,
              display: "-webkit-box",
              WebkitBoxOrient: "vertical",
              WebkitLineClamp: 2,
              overflow: "hidden",
            }}
          >
            {text.tagline}
          </p>
        </div>
      </div>

      <div
        style={{
          margin: "10px 6px 4px",
          paddingTop: 12,
          borderTop: `1px solid ${colors.track}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, fontWeight: 600 }}>
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: 4,
              background: isActive ? "#30D158" : colors.track,
              boxShadow: isActive ? "0 0 0 3px rgba(48,209,88,0.2)" : "none",
            }}
          />
          <span style={{ color: isActive ? colors.detailLabel : colors.detailValue }}>
            {isActive ? tr("Activo", "Active") : tr("Inactivo", "Inactive")}
          </span>
        </span>
        <Switch on={isActive} onChange={onActivate} />
      </div>
    </article>
  );
}

/** Interruptor de la tienda; el de los ajustes del portapapeles sigue su acento y este no. */
function Switch({ on, onChange }: { on: boolean; onChange: () => void }) {
  const { colors } = useTheme();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onChange}
      style={{
        ...bare,
        position: "relative",
        width: 40,
        height: 24,
        borderRadius: 12,
        background: on ? "#30D158" : colors.track,
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
