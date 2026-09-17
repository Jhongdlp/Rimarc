import { useState, useEffect, useMemo } from "react";
import { Search, X, Check, Power } from "lucide-react";
import { inTauri, call } from "../../lib/tauri";
import { useActiveToolId, setActiveTool, getAllTools } from "../../lib/toolStore";
import type { NotchTool } from "../../tools/types";
import { clipboardTool } from "../../tools/clipboard";
import { FONT_FAMILY } from "../../design/tokens";
import rimarcLogo from "../../../assets/logo.png";

export interface StoreAppProps {
  onToggleView?: () => void;
}

export function StoreApp({ onToggleView = () => {} }: StoreAppProps) {
  const [isNotchActive, setIsNotchActive] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
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

  return (
    <div
      className="rimarc-store-app"
      style={{
        width: "100vw",
        height: "100vh",
        backgroundColor: "#000000",
        color: "#ffffff",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        userSelect: "none",
        border: "none",
        position: "relative",
        fontFamily: FONT_FAMILY,
      }}
    >
      {/* Capa de fondo SVG: geometría arquitectónica en negro puro y rejilla de precisión técnica */}
      <svg
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
          zIndex: 0,
        }}
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width="100%" height="100%" fill="#000000" />
        <defs>
          <pattern id="store-arch-grid" width="48" height="48" patternUnits="userSpaceOnUse">
            <path
              d="M 48 0 L 0 0 0 48"
              fill="none"
              stroke="rgba(255, 255, 255, 0.025)"
              strokeWidth="1"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#store-arch-grid)" />
        {/* Retículas de alineación técnica en las esquinas */}
        <g stroke="rgba(255, 255, 255, 0.12)" strokeWidth="1">
          <path d="M 12 26 L 22 26 M 17 21 L 17 31" />
          <path d="M 12 580 L 22 580 M 17 575 L 17 585" />
        </g>
      </svg>

      {/* Barra de título nativa minimalista en negro puro */}
      <header
        style={{
          height: 48,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 24px",
          backgroundColor: "#000000",
          borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
          zIndex: 50,
          cursor: "default",
          flexShrink: 0,
        }}
      >
        {/* Logo Rimarc + Título técnico (área arrastrable) */}
        <div
          data-tauri-drag-region
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            cursor: "default",
          }}
        >
          <img
            src={rimarcLogo}
            alt="Rimarc"
            data-tauri-drag-region
            style={{
              width: 22,
              height: 22,
              borderRadius: 4,
              objectFit: "contain",
              border: "1px solid rgba(255, 255, 255, 0.15)",
            }}
          />
          <div data-tauri-drag-region style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span
              data-tauri-drag-region
              style={{
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: "0.22em",
                color: "#ffffff",
              }}
            >
              RIMARC
            </span>
            <span
              data-tauri-drag-region
              style={{
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "0.16em",
                color: "rgba(255, 255, 255, 0.4)",
                textTransform: "uppercase",
              }}
            >
              TIENDA DE COMPONENTES
            </span>
          </div>
        </div>

        {/* Espacio arrastrable intermedio */}
        <div data-tauri-drag-region style={{ flex: 1, height: "100%", minWidth: 20 }} />

        {/* Espacio arrastrable intermedio derecho */}
        <div data-tauri-drag-region style={{ flex: 1, height: "100%", minWidth: 20 }} />

        {/* Controles de ventana monócromos */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            zIndex: 60,
          }}
        >
          {/* Minimizar */}
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={handleMinimize}
            onClick={handleMinimize}
            title="Minimizar"
            style={{
              width: 30,
              height: 30,
              borderRadius: 4,
              background: "#000000",
              border: "1px solid rgba(255, 255, 255, 0.12)",
              color: "#ffffff",
              display: "grid",
              placeItems: "center",
              cursor: "pointer",
              outline: "none",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.4)";
              e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.08)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.12)";
              e.currentTarget.style.backgroundColor = "#000000";
            }}
          >
            <svg width={10} height={2} viewBox="0 0 10 2" fill="none">
              <rect width={10} height={2} fill="#ffffff" />
            </svg>
          </button>

          {/* Cerrar a la bandeja */}
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={handleClose}
            onClick={handleClose}
            title="Cerrar a la bandeja"
            style={{
              width: 30,
              height: 30,
              borderRadius: 4,
              background: "#000000",
              border: "1px solid rgba(255, 255, 255, 0.12)",
              color: "#ffffff",
              display: "grid",
              placeItems: "center",
              cursor: "pointer",
              outline: "none",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "#ffffff";
              e.currentTarget.style.backgroundColor = "#ffffff";
              const path = e.currentTarget.querySelector("path");
              if (path) path.setAttribute("stroke", "#000000");
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.12)";
              e.currentTarget.style.backgroundColor = "#000000";
              const path = e.currentTarget.querySelector("path");
              if (path) path.setAttribute("stroke", "#ffffff");
            }}
          >
            <svg width={10} height={10} viewBox="0 0 10 10" fill="none">
              <path
                d="M1.5 1.5L8.5 8.5M8.5 1.5L1.5 8.5"
                stroke="#ffffff"
                strokeWidth={1.5}
                strokeLinecap="square"
              />
            </svg>
          </button>
        </div>
      </header>

      {/* Buscador superior de alta precisión */}
      <section
        style={{
          padding: "20px 24px 16px 24px",
          display: "flex",
          alignItems: "center",
          gap: 16,
          backgroundColor: "#000000",
          zIndex: 10,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            gap: 12,
            backgroundColor: "#000000",
            borderRadius: 6,
            padding: "10px 14px",
            border: "1px solid rgba(255, 255, 255, 0.15)",
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = "#ffffff";
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.15)";
          }}
        >
          <Search size={15} color="rgba(255, 255, 255, 0.5)" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="BUSCAR COMPONENTES..."
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              color: "#ffffff",
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: "0.08em",
              fontFamily: FONT_FAMILY,
            }}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                padding: 2,
                display: "grid",
                placeItems: "center",
                color: "rgba(255, 255, 255, 0.6)",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#ffffff")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255, 255, 255, 0.6)")}
            >
              <X size={13} />
            </button>
          )}
        </div>

        <span
          style={{
            fontSize: 11,
            color: "rgba(255, 255, 255, 0.4)",
            fontWeight: 700,
            letterSpacing: "0.12em",
            whiteSpace: "nowrap",
          }}
        >
          {filteredTools.length} {filteredTools.length === 1 ? "COMPONENTE" : "COMPONENTES"}
        </span>
      </section>

      {/* Grid de componentes en blanco y negro puro */}
      <main
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "0 24px 32px 24px",
          zIndex: 10,
        }}
      >
        {filteredTools.length === 0 ? (
          <div
            style={{
              height: 240,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
              color: "rgba(255, 255, 255, 0.4)",
              border: "1px dashed rgba(255, 255, 255, 0.12)",
              borderRadius: 8,
              margin: "20px 0",
            }}
          >
            <Search size={28} strokeWidth={1.2} />
            <p style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.05em" }}>
              SIN RESULTADOS PARA "{searchQuery.toUpperCase()}"
            </p>
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))",
              gap: 16,
            }}
          >
            {filteredTools.map((tool) => {
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

/**
 * Tarjeta de componente con silueta de precisión, fondo negro puro y contraste estricto.
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
  return (
    <div
      style={{
        backgroundColor: isActive ? "#1a1a20" : "#131316",
        borderRadius: 8,
        padding: 14,
        border: isActive
          ? "1px solid #ffffff"
          : "1px solid rgba(255, 255, 255, 0.14)",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        position: "relative",
      }}
      onMouseEnter={(e) => {
        if (!isActive) {
          e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.4)";
          e.currentTarget.style.backgroundColor = "#18181d";
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.14)";
          e.currentTarget.style.backgroundColor = "#131316";
        }
      }}
    >
      {/* Escenario del componente (Miniatura monocroma de alta fidelidad) */}
      <div
        style={{
          width: "100%",
          height: 130,
          borderRadius: 6,
          backgroundColor: "#000000",
          border: "1px solid rgba(255, 255, 255, 0.1)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <ComponentDupeThumbnail toolId={tool.id} Icon={tool.icon} />
      </div>

      {/* Identificador del componente */}
      <div style={{ padding: "0 2px" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
          <h3
            style={{
              margin: 0,
              fontSize: 13,
              fontWeight: 700,
              color: "#ffffff",
              letterSpacing: "0.06em",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
            title={tool.name}
          >
            {tool.name.toUpperCase()}
          </h3>
          <span
            style={{
              fontSize: 9,
              fontWeight: 700,
              color: isActive ? "#ffffff" : "rgba(255, 255, 255, 0.3)",
              letterSpacing: "0.1em",
            }}
          >
            {tool.id}
          </span>
        </div>
      </div>

      {/* Botón de acción monócromo sin animación de resorte */}
      <button
        type="button"
        onClick={onActivate}
        style={{
          width: "100%",
          height: 34,
          borderRadius: 4,
          border: isActive ? "1px solid #ffffff" : "1px solid rgba(255, 255, 255, 0.2)",
          backgroundColor: isActive ? "#ffffff" : "rgba(255, 255, 255, 0.05)",
          color: isActive ? "#000000" : "#ffffff",
          fontWeight: 700,
          fontSize: 11,
          letterSpacing: "0.14em",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          outline: "none",
          fontFamily: FONT_FAMILY,
        }}
        onMouseEnter={(e) => {
          if (!isActive) {
            e.currentTarget.style.borderColor = "#ffffff";
            e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.12)";
          }
        }}
        onMouseLeave={(e) => {
          if (!isActive) {
            e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.2)";
            e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.05)";
          }
        }}
      >
        {isActive ? (
          <>
            <Check size={13} strokeWidth={2.5} />
            ACTIVO · APAGAR
          </>
        ) : (
          <>
            <Power size={12} />
            ACTIVAR
          </>
        )}
      </button>
    </div>
  );
}

/**
 * Miniaturas de componentes en riguroso blanco y negro (sin colores, sin animaciones).
 */
function ComponentDupeThumbnail({
  toolId,
  Icon,
}: {
  toolId: string;
  Icon: NotchTool<any>["icon"];
}) {
  if (toolId === "ai-agents") {
    return (
      <div
        style={{
          width: "88%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 12,
        }}
      >
        {/* Notch Capsule Simulado en negro puro */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "8px 16px",
            borderRadius: 999,
            backgroundColor: "#000000",
            border: "1px solid rgba(255, 255, 255, 0.2)",
          }}
        >
          {/* Anillo 1 - 73% (Blanco sólido) */}
          <div style={{ position: "relative", width: 28, height: 28, display: "grid", placeItems: "center" }}>
            <svg width={28} height={28} viewBox="0 0 28 28">
              <circle cx={14} cy={14} r={11} fill="none" stroke="rgba(255, 255, 255, 0.15)" strokeWidth={2.5} />
              <circle
                cx={14}
                cy={14}
                r={11}
                fill="none"
                stroke="#ffffff"
                strokeWidth={2.5}
                strokeDasharray={69}
                strokeDashoffset={18}
                strokeLinecap="round"
              />
            </svg>
            <span style={{ position: "absolute", fontSize: 8, fontWeight: 800, color: "#ffffff" }}>73</span>
          </div>

          {/* Anillo 2 - 21% (Blanco 75%) */}
          <div style={{ position: "relative", width: 28, height: 28, display: "grid", placeItems: "center" }}>
            <svg width={28} height={28} viewBox="0 0 28 28">
              <circle cx={14} cy={14} r={11} fill="none" stroke="rgba(255, 255, 255, 0.15)" strokeWidth={2.5} />
              <circle
                cx={14}
                cy={14}
                r={11}
                fill="none"
                stroke="rgba(255, 255, 255, 0.75)"
                strokeWidth={2.5}
                strokeDasharray={69}
                strokeDashoffset={50}
                strokeLinecap="round"
              />
            </svg>
            <span style={{ position: "absolute", fontSize: 8, fontWeight: 800, color: "rgba(255, 255, 255, 0.75)" }}>21</span>
          </div>

          {/* Anillo 3 - 52% (Blanco 50%) */}
          <div style={{ position: "relative", width: 28, height: 28, display: "grid", placeItems: "center" }}>
            <svg width={28} height={28} viewBox="0 0 28 28">
              <circle cx={14} cy={14} r={11} fill="none" stroke="rgba(255, 255, 255, 0.15)" strokeWidth={2.5} />
              <circle
                cx={14}
                cy={14}
                r={11}
                fill="none"
                stroke="rgba(255, 255, 255, 0.5)"
                strokeWidth={2.5}
                strokeDasharray={69}
                strokeDashoffset={33}
                strokeLinecap="round"
              />
            </svg>
            <span style={{ position: "absolute", fontSize: 8, fontWeight: 800, color: "rgba(255, 255, 255, 0.5)" }}>52</span>
          </div>
        </div>

        {/* Leyenda monócroma técnica */}
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ width: 4, height: 4, borderRadius: "50%", backgroundColor: "#ffffff" }} />
          <span style={{ width: 4, height: 4, borderRadius: "50%", backgroundColor: "rgba(255, 255, 255, 0.75)" }} />
          <span style={{ width: 4, height: 4, borderRadius: "50%", backgroundColor: "rgba(255, 255, 255, 0.5)" }} />
          <span style={{ fontSize: 9, fontWeight: 700, color: "rgba(255, 255, 255, 0.4)", letterSpacing: "0.14em" }}>
            3 AGENTES CONECTADOS
          </span>
        </div>
      </div>
    );
  }

  if (toolId === "clipboard-manager") {
    return (
      <div
        style={{
          width: "84%",
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "5px 8px",
            borderRadius: 4,
            backgroundColor: "#000000",
            border: "1px solid rgba(255, 255, 255, 0.25)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Icon size={12} color="#ffffff" />
            <span style={{ fontSize: 9, fontWeight: 700, color: "#ffffff", letterSpacing: "0.08em" }}>
              PORTAPAPELES
            </span>
          </div>
          <span style={{ fontSize: 8, fontWeight: 800, color: "rgba(255, 255, 255, 0.5)" }}>KDE</span>
        </div>

        <div
          style={{
            padding: "4px 8px",
            borderRadius: 4,
            backgroundColor: "rgba(255, 255, 255, 0.06)",
            border: "1px solid rgba(255, 255, 255, 0.12)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span style={{ fontSize: 8.5, fontFamily: "monospace", color: "rgba(255, 255, 255, 0.85)" }}>
            pnpm dev:tauri
          </span>
          <span style={{ width: 4, height: 4, borderRadius: "50%", backgroundColor: "#ffffff" }} />
        </div>

        <div
          style={{
            padding: "4px 8px",
            borderRadius: 4,
            backgroundColor: "rgba(255, 255, 255, 0.03)",
            border: "1px solid rgba(255, 255, 255, 0.06)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span style={{ fontSize: 8.5, fontFamily: "monospace", color: "rgba(255, 255, 255, 0.5)" }}>
            https://kde.org/plasma
          </span>
        </div>
      </div>
    );
  }

  // Miniatura genérica monócroma
  return (
    <div
      style={{
        width: 44,
        height: 44,
        borderRadius: 6,
        backgroundColor: "#000000",
        border: "1px solid rgba(255, 255, 255, 0.2)",
        display: "grid",
        placeItems: "center",
      }}
    >
      <Icon size={20} color="#ffffff" />
    </div>
  );
}
