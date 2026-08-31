import type { MouseEvent as ReactMouseEvent } from "react";
import { motion } from "framer-motion";
import { GripHorizontal } from "lucide-react";
import { POPOVER, SETTINGS, SETTINGS_HEIGHT, type ThemeColors } from "../design/tokens";
import { Popover, PopoverHeader } from "./Popover";
import { GearIcon } from "./icons/AgentIcon";
import { LANGS, setLang, useI18n } from "../lib/i18n";
import type { Anchor } from "../lib/placement";
import { AUTO_HIDE_OPTIONS, setAutoHide, useAutoHide } from "../lib/prefs";
import { useTheme, type ThemeMode } from "../lib/theme";

const CONTENT_W = POPOVER.width - POPOVER.padX * 2;

export interface SettingsPanelProps {
  /** Boton de ajustes: la cola apunta ahi. */
  anchor: Anchor;
  open: boolean;
  /** Asa de posicion: al apretarla empieza el arrastre del notch. */
  onDragStart: (e: ReactMouseEvent) => void;
  dragging: boolean;
  onHoverStart: () => void;
  onHoverEnd: () => void;
}

/**
 * Ajustes. Misma concha que el panel de detalle para que el notch tenga una
 * sola forma de hablar. Cada fila nueva suma un `SETTINGS.rowPitch` y hay que
 * subir `SETTINGS.rows`, que es de donde sale `SETTINGS_HEIGHT`.
 */
export function SettingsPanel({
  anchor,
  open,
  onDragStart,
  dragging,
  onHoverStart,
  onHoverEnd,
}: SettingsPanelProps) {
  const { lang, t } = useI18n();
  const { theme, setTheme, colors } = useTheme();
  const autoHide = useAutoHide();

  return (
    <Popover
      anchor={anchor}
      height={SETTINGS_HEIGHT}
      open={open}
      onHoverStart={onHoverStart}
      onHoverEnd={onHoverEnd}
    >
      <PopoverHeader icon={<GearIcon size={POPOVER.icon} color={colors.icon} />} title={t.settings} />

      <Row
        index={0}
        label={t.language}
        options={LANGS.map((o) => ({ id: o.id, label: o.label }))}
        selected={lang}
        colors={colors}
        onSelect={(id) => setLang(id as "es" | "en")}
      />

      <Row
        index={1}
        label={t.theme}
        options={[
          { id: "light", label: t.themeLight },
          { id: "dark", label: t.themeDark },
          { id: "system", label: t.themeSystem },
        ]}
        selected={theme}
        colors={colors}
        onSelect={(id) => setTheme(id as ThemeMode)}
      />

      <Row
        index={2}
        label={t.autoHide}
        options={AUTO_HIDE_OPTIONS.map((o) => ({ id: o.id, label: o.label ?? t.pinned }))}
        selected={autoHide.id}
        colors={colors}
        onSelect={setAutoHide}
      />

      <GripRow index={3} label={t.position} colors={colors} dragging={dragging} onDragStart={onDragStart} />
    </Popover>
  );
}

/**
 * Asa de arrastre. Es la unica forma de mover el notch: los puntitos dicen "de
 * aqui se tira", que en la silueta no habia manera de insinuar sin que el notch
 * se moviera solo al rozarlo.
 */
function GripRow({
  index,
  label,
  colors,
  dragging,
  onDragStart,
}: {
  index: number;
  label: string;
  colors: ThemeColors;
  dragging: boolean;
  onDragStart: (e: ReactMouseEvent) => void;
}) {
  const labelY = SETTINGS.labelY + index * SETTINGS.rowPitch;

  return (
    <>
      <Label y={labelY} text={label} colors={colors} />
      <div
        onMouseDown={onDragStart}
        style={{
          position: "absolute",
          top: labelY + SETTINGS.labelToControl,
          left: 0,
          width: CONTENT_W,
          height: SETTINGS.control,
          display: "grid",
          placeItems: "center",
          background: dragging ? colors.label : colors.track,
          borderRadius: SETTINGS.control / 2,
          cursor: dragging ? "grabbing" : "grab",
          transition: "background 140ms ease",
        }}
      >
        <GripHorizontal size={SETTINGS.control - 6} color={dragging ? colors.surface : colors.detailValue} />
      </div>
    </>
  );
}

/** Etiqueta de fila. El ritmo vertical lo pone quien la coloca. */
function Label({ y, text, colors }: { y: number; text: string; colors: ThemeColors }) {
  return (
    <span
      style={{
        position: "absolute",
        top: y,
        left: 0,
        transform: "translateY(-50%)",
        fontSize: POPOVER.text.label,
        fontWeight: 600,
        lineHeight: 1,
        color: colors.detailLabel,
      }}
    >
      {text}
    </span>
  );
}

interface Option {
  id: string;
  label: string;
}

/** Etiqueta mas segmentado, al ritmo vertical del panel. */
function Row({
  index,
  label,
  options,
  selected,
  colors,
  onSelect,
}: {
  index: number;
  label: string;
  options: Option[];
  selected: string;
  colors: ThemeColors;
  onSelect: (id: string) => void;
}) {
  const labelY = SETTINGS.labelY + index * SETTINGS.rowPitch;
  const segment = CONTENT_W / options.length;
  const active = Math.max(0, options.findIndex((o) => o.id === selected));

  return (
    <>
      <Label y={labelY} text={label} colors={colors} />

      <div
        style={{
          position: "absolute",
          top: labelY + SETTINGS.labelToControl,
          left: 0,
          width: CONTENT_W,
          height: SETTINGS.control,
          display: "flex",
          background: colors.track,
          borderRadius: SETTINGS.control / 2,
        }}
      >
        {/*
          La pastilla se desliza por `x` dentro de la fila, no con `layoutId`.
          Compartir layout mide contra la ventana, asi que al moverse la carta
          entera —cambiar de borde, o deslizarse por el— framer lo leia como que
          la pastilla se habia movido y la animaba hasta alli: se quedaba atras
          persiguiendo al panel.
        */}
        <motion.span
          initial={false}
          animate={{ x: active * segment }}
          transition={{ type: "spring", stiffness: 420, damping: 34 }}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: segment,
            height: "100%",
            background: colors.label,
            borderRadius: SETTINGS.control / 2,
          }}
        />

        {options.map((option) => (
          <Segment
            key={option.id}
            option={option}
            selected={option.id === selected}
            colors={colors}
            onSelect={onSelect}
          />
        ))}
      </div>
    </>
  );
}

/** Una opcion del segmentado. */
function Segment({
  option,
  selected,
  colors,
  onSelect,
}: {
  option: Option;
  selected: boolean;
  colors: ThemeColors;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(option.id)}
      style={{
        position: "relative",
        flex: 1,
        height: "100%",
        border: "none",
        background: "transparent",
        padding: 0,
        cursor: "pointer",
        font: "inherit",
      }}
    >
      <span
        style={{
          position: "relative",
          fontSize: POPOVER.text.caption,
          fontWeight: 600,
          lineHeight: 1,
          color: selected ? colors.surface : colors.detailValue,
        }}
      >
        {option.label}
      </span>
    </button>
  );
}
