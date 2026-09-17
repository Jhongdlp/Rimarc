import { useState, useEffect, useMemo } from "react";
import { Minus, Puzzle, Search, X } from "lucide-react";
import { inTauri, call } from "../../lib/tauri";
import { useActiveToolId, setActiveTool, getAllTools } from "../../lib/toolStore";
import type { NotchTool, ToolCategory } from "../../tools/types";
import type { AgentType } from "../../types";
import { clipboardTool } from "../../tools/clipboard";
import { FONT_FAMILY, agentColor } from "../../design/tokens";
import { useTheme } from "../../lib/theme";
import rimarcLogo from "../../../assets/logo.png";

export interface StoreAppProps {
  onToggleView?: () => void;
}

export function StoreApp({ onToggleView = () => {} }: StoreAppProps) {
  const [isNotchActive, setIsNotchActive] = useState(false);
  const { colors } = useTheme();
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
    return tools.filter(
      (tool) =>
        tool.name.toLowerCase().includes(q) ||
        tool.id.toLowerCase().includes(q) ||
        (tool.tagline && tool.tagline.toLowerCase().includes(q)),
    );
  }, [tools, searchQuery]);

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
            Componentes
          </div>
          <div data-tauri-drag-region style={{ marginTop: 2, fontSize: 12, color: colors.detailValue }}>
            Elige qué vive en tu notch
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
            placeholder="Buscar"
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
              aria-label="Limpiar búsqueda"
              onClick={() => setSearchQuery("")}
              style={{ ...bare, display: "flex", padding: 2, borderRadius: 10, color: colors.detailValue }}
            >
              <X size={14} strokeWidth={2} />
            </button>
          )}
        </label>

        <div style={{ display: "flex", gap: 6, marginLeft: 6 }}>
          <WindowButton title="Minimizar" onClick={handleMinimize}>
            <Minus size={15} strokeWidth={2.2} />
          </WindowButton>
          <WindowButton title="Cerrar a la bandeja" onClick={handleClose}>
            <X size={15} strokeWidth={2.2} />
          </WindowButton>
        </div>
      </header>

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
              {c.label}
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
              {searchQuery ? `Nada para «${searchQuery}»` : "Nada en esta categoría"}
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
              Ver todos
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

const CATEGORIES: { id: ToolCategory | "all"; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "ai", label: "IA" },
  { id: "productivity", label: "Productividad" },
  { id: "utilities", label: "Utilidades" },
  { id: "system", label: "Sistema" },
];

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
        <Thumbnail toolId={tool.id} />
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
              title={tool.name}
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
              {tool.name}
            </h3>
            {tool.badge && (
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
                {tool.badge}
              </span>
            )}
          </div>
          <p
            title={tool.description}
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
            {tool.tagline}
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
            {isActive ? "Activo" : "Inactivo"}
          </span>
        </span>
        <Switch on={isActive} onChange={onActivate} />
      </div>
    </article>
  );
}

/** Miniaturas vivas de cada componente, con el mismo trazo que el notch real. */
function Thumbnail({ toolId }: { toolId: string }) {
  const { colors, isDark } = useTheme();

  if (toolId === "ai-agents") {
    const rings: [AgentType, number][] = [
      ["claude", 73],
      ["codex", 21],
      ["antigravity", 52],
    ];
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
        <div
          style={{
            padding: "10px 16px",
            borderRadius: 999,
            display: "flex",
            gap: 14,
            background: colors.surface,
            boxShadow: `0 8px 24px rgba(0,0,0,${isDark ? 0.5 : 0.12}), inset 0 0 0 1px ${colors.track}`,
          }}
        >
          {rings.map(([agent, pct]) => {
            const c = 2 * Math.PI * 11;
            return (
              <div key={agent} style={{ position: "relative", width: 30, height: 30, display: "grid", placeItems: "center" }}>
                <svg width={30} height={30} viewBox="0 0 30 30" style={{ transform: "rotate(-90deg)" }}>
                  <circle cx={15} cy={15} r={11} fill="none" stroke={colors.track} strokeWidth={3} />
                  <circle
                    cx={15}
                    cy={15}
                    r={11}
                    fill="none"
                    stroke={agentColor(agent, isDark)}
                    strokeWidth={3}
                    strokeDasharray={c}
                    strokeDashoffset={c * (1 - pct / 100)}
                    strokeLinecap="round"
                  />
                </svg>
                <span style={{ position: "absolute", fontSize: 8.5, fontWeight: 700, color: colors.detailLabel }}>{pct}</span>
              </div>
            );
          })}
        </div>
        <span style={{ fontSize: 11, fontWeight: 500, color: colors.detailValue }}>3 agentes activos</span>
      </div>
    );
  }

  if (toolId === "clipboard-manager") {
    return (
      <div
        style={{
          width: "78%",
          padding: "10px 14px 4px",
          borderRadius: 14,
          background: colors.surface,
          boxShadow: `0 8px 24px rgba(0,0,0,${isDark ? 0.5 : 0.12}), inset 0 0 0 1px ${colors.track}`,
        }}
      >
        <div style={{ display: "flex", gap: 12, fontSize: 10.5, fontWeight: 600 }}>
          <span style={{ paddingBottom: 4, color: colors.detailLabel, borderBottom: `2px solid ${colors.detailLabel}` }}>
            Recientes
          </span>
          <span style={{ color: colors.detailValue }}>Fijados</span>
        </div>
        {[
          ["pnpm dev:tauri", "Copiado", true],
          ["https://kde.org/plasma", "Enlace  ·  22 car.", false],
        ].map(([text, meta, mono]) => (
          <div key={String(text)} style={{ padding: "7px 0", borderBottom: `1px solid ${colors.track}` }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 500,
                fontFamily: mono ? "ui-monospace, monospace" : "inherit",
                color: colors.detailLabel,
              }}
            >
              {text}
            </div>
            <div style={{ marginTop: 3, fontSize: 9.5, color: meta === "Copiado" ? "#30D158" : colors.detailValue }}>{meta}</div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <span
      style={{
        width: 52,
        height: 52,
        borderRadius: 14,
        display: "grid",
        placeItems: "center",
        background: colors.track,
      }}
    >
      <Puzzle size={22} color={colors.detailLabel} />
    </span>
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
