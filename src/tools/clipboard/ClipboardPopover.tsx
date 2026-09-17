import { useState, useMemo } from "react";
import {
  ClipboardList,
  Search,
  X,
  Check,
  Pin,
  Trash2,
  RefreshCw,
  Code,
  ExternalLink,
  Palette,
  FileText,
  Copy,
} from "lucide-react";
import { POPOVER } from "../../design/tokens";
import { Popover } from "../../components/Popover";
import { useTheme } from "../../lib/theme";
import type { ToolPopoverProps } from "../types";
import type { ClipboardData, ClipboardItem, ClipboardFilter, ClipboardKind } from "./types";
import { CLIPBOARD_COLORS } from "./ClipboardBar";

const POPOVER_WIDTH = 295;
const POPOVER_HEIGHT = 410;
const CONTENT_W = POPOVER_WIDTH - POPOVER.padX * 2;

export function ClipboardPopover({
  data,
  anchor,
  open,
  onHoverStart,
  onHoverEnd,
}: ToolPopoverProps<ClipboardData>) {
  const { colors, isDark } = useTheme();
  const [confirmClear, setConfirmClear] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsRefreshing(true);
    await data.refresh();
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const handleClear = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirmClear) {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 3000);
      return;
    }
    await data.clearAll();
    setConfirmClear(false);
  };

  const kindIcon = (kind: ClipboardKind) => {
    switch (kind) {
      case "code":
        return <Code size={11} color="#a78bfa" />;
      case "url":
        return <ExternalLink size={11} color="#38bdf8" />;
      case "color":
        return <Palette size={11} color="#34d399" />;
      default:
        return <FileText size={11} color="rgba(255,255,255,0.6)" />;
    }
  };

  const kindLabel = (kind: ClipboardKind) => {
    switch (kind) {
      case "code":
        return "Código";
      case "url":
        return "Enlace";
      case "color":
        return "Color";
      default:
        return "Texto";
    }
  };

  const filterTabs: { id: ClipboardFilter; label: string }[] = useMemo(
    () => [
      { id: "all", label: `Todos (${data.totalCount})` },
      { id: "code", label: "Código" },
      { id: "url", label: "Enlaces" },
      { id: "text", label: "Texto" },
    ],
    [data.totalCount],
  );

  return (
    <Popover
      anchor={anchor}
      width={POPOVER_WIDTH}
      height={POPOVER_HEIGHT}
      open={open}
      onHoverStart={onHoverStart}
      onHoverEnd={onHoverEnd}
    >
      <div
        style={{
          width: CONTENT_W,
          height: "100%",
          display: "flex",
          flexDirection: "column",
          paddingTop: POPOVER.padTop - 4,
          boxSizing: "border-box",
          userSelect: "none",
        }}
      >
        {/* Cabecera */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 10,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <div
              style={{
                width: 24,
                height: 24,
                borderRadius: 6,
                background: "rgba(56, 189, 248, 0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <ClipboardList size={14} color={CLIPBOARD_COLORS.primary} />
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span
                  style={{
                    fontSize: 13.5,
                    fontWeight: 700,
                    letterSpacing: "0.02em",
                    color: colors.title,
                  }}
                >
                  Portapapeles
                </span>
                {data.isKde && (
                  <span
                    style={{
                      fontSize: 8.5,
                      fontWeight: 700,
                      padding: "1.5px 5px",
                      borderRadius: 4,
                      background: "rgba(56, 189, 248, 0.15)",
                      color: "#38bdf8",
                      letterSpacing: "0.02em",
                    }}
                  >
                    KDE Klipper
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Acciones de cabecera */}
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <button
              type="button"
              onClick={handleRefresh}
              title="Actualizar portapapeles"
              style={{
                background: "transparent",
                border: "none",
                color: colors.detailCaption,
                padding: 4,
                borderRadius: 5,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "all 0.15s ease",
              }}
            >
              <RefreshCw
                size={12.5}
                style={{
                  transform: isRefreshing ? "rotate(180deg)" : "none",
                  transition: "transform 0.4s ease",
                }}
              />
            </button>

            <button
              type="button"
              onClick={handleClear}
              title={confirmClear ? "¿Confirmar vaciar?" : "Limpiar historial"}
              style={{
                background: confirmClear ? "#ef4444" : "transparent",
                border: confirmClear ? "none" : "none",
                color: confirmClear ? "#ffffff" : colors.detailCaption,
                padding: confirmClear ? "2px 7px" : "4px",
                borderRadius: 5,
                fontSize: 10,
                fontWeight: 600,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 3,
                transition: "all 0.15s ease",
              }}
            >
              <Trash2 size={12.5} />
              {confirmClear && <span>Vaciar</span>}
            </button>
          </div>
        </div>

        {/* Buscador */}
        <div
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            marginBottom: 8,
          }}
        >
          <Search
            size={12}
            color="rgba(255,255,255,0.4)"
            style={{ position: "absolute", left: 8, pointerEvents: "none" }}
          />
          <input
            type="text"
            value={data.searchQuery}
            onChange={(e) => data.setSearchQuery(e.target.value)}
            placeholder="Buscar en el portapapeles..."
            style={{
              width: "100%",
              padding: "5px 24px 5px 26px",
              background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)",
              border: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`,
              borderRadius: 6,
              color: colors.label,
              fontSize: 11,
              outline: "none",
              fontFamily: "inherit",
              boxSizing: "border-box",
            }}
          />
          {data.searchQuery && (
            <button
              type="button"
              onClick={() => data.setSearchQuery("")}
              style={{
                position: "absolute",
                right: 6,
                background: "none",
                border: "none",
                color: "rgba(255,255,255,0.4)",
                cursor: "pointer",
                padding: 2,
                display: "flex",
              }}
            >
              <X size={11} />
            </button>
          )}
        </div>

        {/* Filtros rápidos */}
        <div
          style={{
            display: "flex",
            gap: 4,
            marginBottom: 8,
            overflowX: "auto",
            scrollbarWidth: "none",
          }}
        >
          {filterTabs.map((tab) => {
            const active = data.filter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => data.setFilter(tab.id)}
                style={{
                  padding: "2.5px 8px",
                  borderRadius: 4,
                  border: "none",
                  background: active
                    ? "rgba(56, 189, 248, 0.2)"
                    : isDark
                      ? "rgba(255,255,255,0.04)"
                      : "rgba(0,0,0,0.04)",
                  color: active ? "#38bdf8" : colors.detailCaption,
                  fontSize: 10,
                  fontWeight: active ? 700 : 500,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  transition: "all 0.15s ease",
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Lista de Clips */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            overflowX: "hidden",
            display: "flex",
            flexDirection: "column",
            gap: 5,
            paddingRight: 2,
            maxHeight: 280,
          }}
        >
          {data.filteredItems.length === 0 ? (
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "30px 10px",
                textAlign: "center",
                color: colors.detailCaption,
              }}
            >
              <ClipboardList size={28} color="rgba(255,255,255,0.2)" style={{ marginBottom: 8 }} />
              <span style={{ fontSize: 11.5, fontWeight: 600, color: colors.label }}>
                {data.searchQuery ? "Sin coincidencias" : "Portapapeles vacío"}
              </span>
              <span style={{ fontSize: 10, marginTop: 3, opacity: 0.7 }}>
                {data.searchQuery
                  ? "Prueba con otra palabra clave"
                  : "Copia texto o comandos y aparecerán aquí"}
              </span>
            </div>
          ) : (
            data.filteredItems.map((item, index) => (
              <ClipRow
                key={item.id}
                item={item}
                index={index}
                isCopied={data.copiedId === item.id}
                isDark={isDark}
                colors={colors}
                kindIcon={kindIcon(item.kind)}
                kindLabel={kindLabel(item.kind)}
                onCopy={() => data.copyItem(item)}
                onTogglePin={(e) => {
                  e.stopPropagation();
                  data.togglePin(item.id);
                }}
                onDelete={(e) => {
                  e.stopPropagation();
                  data.deleteItem(item.id);
                }}
              />
            ))
          )}
        </div>

        {/* Pie de estado */}
        <div
          style={{
            marginTop: 6,
            paddingTop: 5,
            borderTop: `1px solid ${isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: 9.5,
            color: colors.detailCaption,
          }}
        >
          <span>Clic en cualquier clip para copiar</span>
          <span>{data.filteredItems.length} visibles</span>
        </div>
      </div>
    </Popover>
  );
}

interface ClipRowProps {
  item: ClipboardItem;
  index: number;
  isCopied: boolean;
  isDark: boolean;
  colors: any;
  kindIcon: React.ReactNode;
  kindLabel: string;
  onCopy: () => void;
  onTogglePin: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
}

function ClipRow({
  item,
  isCopied,
  isDark,
  colors,
  kindIcon,
  kindLabel,
  onCopy,
  onTogglePin,
  onDelete,
}: ClipRowProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onCopy}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: "6px 8px",
        borderRadius: 6,
        background: isCopied
          ? "rgba(16, 185, 129, 0.14)"
          : item.pinned
            ? isDark
              ? "rgba(234, 179, 8, 0.08)"
              : "rgba(234, 179, 8, 0.12)"
            : hovered
              ? isDark
                ? "rgba(255,255,255,0.07)"
                : "rgba(0,0,0,0.05)"
              : isDark
                ? "rgba(255,255,255,0.03)"
                : "rgba(0,0,0,0.02)",
        border: `1px solid ${
          isCopied
            ? "rgba(16, 185, 129, 0.4)"
            : item.pinned
              ? "rgba(234, 179, 8, 0.3)"
              : hovered
                ? isDark
                  ? "rgba(255,255,255,0.12)"
                  : "rgba(0,0,0,0.1)"
                : isDark
                  ? "rgba(255,255,255,0.05)"
                  : "rgba(0,0,0,0.04)"
        }`,
        cursor: "pointer",
        transition: "all 0.12s ease",
        display: "flex",
        flexDirection: "column",
        gap: 3.5,
      }}
    >
      {/* Fila superior: Tipo, Contador y Acciones */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: 9.5,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {kindIcon}
          <span style={{ fontWeight: 600, color: colors.detailCaption }}>{kindLabel}</span>
          <span style={{ color: "rgba(255,255,255,0.3)" }}>•</span>
          <span style={{ color: "rgba(255,255,255,0.4)" }}>
            {item.char_count} car.{item.line_count > 1 ? ` · ${item.line_count} lín.` : ""}
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
          {isCopied ? (
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: 2,
                color: "#10b981",
                fontWeight: 700,
                fontSize: 9.5,
              }}
            >
              <Check size={11} strokeWidth={2.5} />
              Copiado
            </span>
          ) : (
            <>
              {hovered && (
                <button
                  type="button"
                  onClick={onCopy}
                  title="Copiar clip"
                  style={{
                    background: "none",
                    border: "none",
                    color: colors.detailCaption,
                    padding: 1,
                    cursor: "pointer",
                    display: "flex",
                  }}
                >
                  <Copy size={11} />
                </button>
              )}

              <button
                type="button"
                onClick={onTogglePin}
                title={item.pinned ? "Desfijar" : "Fijar al inicio"}
                style={{
                  background: "none",
                  border: "none",
                  color: item.pinned ? "#eab308" : colors.detailCaption,
                  padding: 1,
                  cursor: "pointer",
                  display: "flex",
                  opacity: item.pinned || hovered ? 1 : 0,
                  transition: "opacity 0.15s ease",
                }}
              >
                <Pin size={11} fill={item.pinned ? "#eab308" : "none"} />
              </button>

              {hovered && (
                <button
                  type="button"
                  onClick={onDelete}
                  title="Eliminar de la lista"
                  style={{
                    background: "none",
                    border: "none",
                    color: "rgba(239, 68, 68, 0.7)",
                    padding: 1,
                    cursor: "pointer",
                    display: "flex",
                  }}
                >
                  <X size={11} />
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Contenido / Preview del texto */}
      <div
        style={{
          fontFamily: item.kind === "code" || item.kind === "url" ? "monospace" : "inherit",
          fontSize: 10.5,
          lineHeight: 1.35,
          color: colors.label,
          wordBreak: "break-all",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
          opacity: 0.92,
        }}
      >
        {item.preview}
      </div>
    </div>
  );
}
