import { ClipboardList } from "lucide-react";
import { notchHeight } from "../../lib/notchGeometry";
import type { NotchTool } from "../types";
import { useClipboard } from "./useClipboard";
import { ClipboardBar, CLIPBOARD_COLORS } from "./ClipboardBar";
import { ClipboardPopover } from "./ClipboardPopover";
import type { ClipboardData } from "./types";

export const clipboardTool: NotchTool<ClipboardData> = {
  id: "clipboard-manager",
  name: "Portapapeles Dinámico",
  tagline: "Historial de portapapeles integrado con KDE Plasma",
  description:
    "Herramienta de portapapeles tipo dock para tu barra de tareas. Abre al pasar el mouse por encima con animación SVG fluida, permitiéndote copiar, buscar y fijar clips de KDE Klipper con un solo clic.",
  version: "1.0.0",
  author: "Rimarc Core",
  category: "utilities",
  badge: "KDE Plasma",
  icon: ClipboardList,

  useData: useClipboard,

  getNotchHeight: () => notchHeight(1),

  getDots: (data) => [
    data.copiedId ? CLIPBOARD_COLORS.success : data.totalCount > 0 ? CLIPBOARD_COLORS.primary : "#64748b",
  ],

  isEmpty: (data) => data.totalCount === 0,

  getPopoverHeight: () => 410,

  renderBar: (props) => <ClipboardBar {...props} />,

  renderPopover: (props) => <ClipboardPopover {...props} />,
};
