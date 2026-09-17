import { useState, useEffect } from "react";
import { ClipboardList, Check } from "lucide-react";
import { NOTCH } from "../../design/tokens";
import { ringCenterY } from "../../lib/notchGeometry";
import type { ToolBarProps } from "../types";
import type { ClipboardData } from "./types";

export const CLIPBOARD_COLORS = {
  primary: "#38bdf8", // Sky / Cyan
  success: "#10b981", // Emerald
  accent: "#818cf8",  // Indigo
};

export function ClipboardBar({
  data,
  angle,
  colors,
  onOpenDetail,
  onCloseDetail,
}: ToolBarProps<ClipboardData>) {
  const upright = `rotate(${-angle}deg)`;
  const [justCopied, setJustCopied] = useState(false);

  useEffect(() => {
    if (data.copiedId) {
      setJustCopied(true);
      const timer = setTimeout(() => setJustCopied(false), 1600);
      return () => clearTimeout(timer);
    }
  }, [data.copiedId]);

  const activeColor = justCopied ? CLIPBOARD_COLORS.success : CLIPBOARD_COLORS.primary;

  return (
    <div
      style={{
        position: "absolute",
        top: ringCenterY(0) - NOTCH.ring.size / 2,
        left: 0,
        width: NOTCH.depth,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        pointerEvents: "none",
      }}
    >
      {/* Botón interactivo tipo dock / barra de tareas */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Abrir historial de portapapeles"
        style={{
          pointerEvents: "auto",
          transform: upright,
          cursor: "pointer",
          width: NOTCH.ring.size,
          height: NOTCH.ring.size,
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: justCopied ? "rgba(16, 185, 129, 0.2)" : "rgba(56, 189, 248, 0.12)",
          border: `1.5px solid ${activeColor}`,
          boxShadow: justCopied ? `0 0 12px ${CLIPBOARD_COLORS.success}` : "none",
          transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
          position: "relative",
        }}
        onMouseEnter={() => onOpenDetail(0)}
        onClick={() => onOpenDetail(0)}
        onMouseLeave={onCloseDetail}
      >
        {justCopied ? (
          <Check size={NOTCH.ring.icon - 2} color={CLIPBOARD_COLORS.success} strokeWidth={2.6} />
        ) : (
          <ClipboardList size={NOTCH.ring.icon - 3} color={activeColor} strokeWidth={2} />
        )}

        {/* Badge contador de elementos */}
        {data.totalCount > 0 && (
          <div
            style={{
              position: "absolute",
              top: -3,
              right: -3,
              minWidth: 14,
              height: 14,
              padding: "0 3px",
              borderRadius: 7,
              background: activeColor,
              color: "#000000",
              fontSize: 8.5,
              fontWeight: 800,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              lineHeight: 1,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {data.totalCount > 99 ? "99+" : data.totalCount}
          </div>
        )}
      </div>

      {/* Etiqueta textual debajo */}
      <span
        style={{
          position: "absolute",
          top: NOTCH.ring.size / 2 + NOTCH.labelOffset,
          left: "50%",
          transform: `translate(-50%, -50%) ${upright}`,
          fontFamily: NOTCH.label.family,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.04em",
          lineHeight: 1,
          color: justCopied ? CLIPBOARD_COLORS.success : colors.label,
          fontVariantNumeric: "tabular-nums",
          whiteSpace: "nowrap",
          textTransform: "uppercase",
        }}
      >
        {justCopied ? "¡Copiado!" : `${data.totalCount} clips`}
      </span>
    </div>
  );
}
