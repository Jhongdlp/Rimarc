import type { ReactNode, ComponentType } from "react";
import type { ThemeColors } from "../design/tokens";
import type { Anchor } from "../lib/placement";

export type ToolCategory = "ai" | "system" | "productivity" | "utilities";

export interface ToolBarProps<TState> {
  data: TState;
  angle: number;
  colors: ThemeColors;
  isDark: boolean;
  activeDetailIndex: number;
  onOpenDetail: (index: number) => void;
  onCloseDetail: () => void;
}

export interface ToolPopoverProps<TState> {
  data: TState;
  anchor: Anchor;
  open: boolean;
  detailIndex: number;
  onHoverStart: () => void;
  onHoverEnd: () => void;
}

export interface NotchTool<TState = unknown> {
  /** Identificador único del notch / herramienta (ej: 'ai-agents', 'clipboard-manager') */
  id: string;
  /** Nombre visible en la galería y selector */
  name: string;
  /** Subtítulo o lema breve */
  tagline: string;
  /** Descripción detallada */
  description: string;
  /** Versión del módulo (ej: '1.0.0') */
  version: string;
  /** Autor o creador */
  author: string;
  /** Categoría */
  category: ToolCategory;
  /** Icono representativo para la galería */
  icon: ComponentType<{ size?: number; color?: string }>;
  /** Miniatura de la tarjeta en la tienda, servida desde public/ */
  thumbnail: string;
  /** Etiqueta destacada (ej: 'Oficial', 'Nuevo', 'Beta') */
  badge?: string;
  /** Textos de la galeria en ingles; los de arriba son los de español. */
  en: { name: string; tagline: string; description: string; badge?: string };

  /** Hook que provee el estado reactivo en tiempo real de la herramienta */
  useData: () => TState;

  /** Calcula la altura requerida para la silueta del notch según su estado */
  getNotchHeight: (data: TState) => number;

  /** Colores de los puntos cuando el notch está en modo recogido (peek) */
  getDots: (data: TState, isDark: boolean) => string[];

  /** Si la herramienta está inactiva o sin elementos (astilla dormida / estado idle) */
  isEmpty: (data: TState) => boolean;

  /** Centro Y en px para apuntar la cola del popover (por defecto ringCenterY(detailIndex)) */
  getDetailAnchorY?: (data: TState, index: number) => number;

  /** Altura personalizada del popover (opcional) */
  getPopoverHeight?: (data: TState, index: number) => number;

  /** Renderizado dentro de la silueta del notch cuando está desplegado */
  renderBar: (props: ToolBarProps<TState>) => ReactNode;

  /** Renderizado del popover de detalle al hacer hover o clic */
  renderPopover: (props: ToolPopoverProps<TState>) => ReactNode;
}
