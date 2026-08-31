import { motion } from "framer-motion";
import { POPOVER, SETTINGS, SETTINGS_HEIGHT, COLOR } from "../design/tokens";
import { Popover, PopoverHeader } from "./Popover";
import { GearIcon } from "./icons/AgentIcon";
import { LANGS, setLang, useI18n } from "../lib/i18n";
import { AUTO_HIDE_OPTIONS, setAutoHide, useAutoHide } from "../lib/prefs";

const CONTENT_W = POPOVER.width - POPOVER.padX * 2;

export interface SettingsPanelProps {
  /** Y del centro del boton de ajustes: la cola apunta ahi. */
  anchorY: number;
  notchLeft: number;
  open: boolean;
  onHoverStart: () => void;
  onHoverEnd: () => void;
}

/**
 * Ajustes. Misma concha que el panel de detalle para que el notch tenga una
 * sola forma de hablar. Cada fila nueva suma un `SETTINGS.rowPitch` y hay que
 * subir `SETTINGS.rows`, que es de donde sale `SETTINGS_HEIGHT`.
 */
export function SettingsPanel({ anchorY, notchLeft, open, onHoverStart, onHoverEnd }: SettingsPanelProps) {
  const { lang, t } = useI18n();
  const autoHide = useAutoHide();

  return (
    <Popover
      anchorY={anchorY}
      notchLeft={notchLeft}
      height={SETTINGS_HEIGHT}
      open={open}
      onHoverStart={onHoverStart}
      onHoverEnd={onHoverEnd}
    >
      <PopoverHeader icon={<GearIcon size={POPOVER.icon} />} title={t.settings} />

      <Row
        index={0}
        label={t.language}
        layoutId="settings-language-pill"
        options={LANGS.map((o) => ({ id: o.id, label: o.label }))}
        selected={lang}
        onSelect={(id) => setLang(id as "es" | "en")}
      />

      <Row
        index={1}
        label={t.autoHide}
        layoutId="settings-autohide-pill"
        options={AUTO_HIDE_OPTIONS.map((o) => ({ id: o.id, label: o.label ?? t.pinned }))}
        selected={autoHide.id}
        onSelect={setAutoHide}
      />
    </Popover>
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
  layoutId,
  onSelect,
}: {
  index: number;
  label: string;
  options: Option[];
  selected: string;
  layoutId: string;
  onSelect: (id: string) => void;
}) {
  const labelY = SETTINGS.labelY + index * SETTINGS.rowPitch;

  return (
    <>
      <span
        style={{
          position: "absolute",
          top: labelY,
          left: 0,
          transform: "translateY(-50%)",
          fontSize: POPOVER.text.label,
          fontWeight: 600,
          lineHeight: 1,
          color: COLOR.detailLabel,
        }}
      >
        {label}
      </span>

      <div
        style={{
          position: "absolute",
          top: labelY + SETTINGS.labelToControl,
          left: 0,
          width: CONTENT_W,
          height: SETTINGS.control,
          display: "flex",
          background: COLOR.track,
          borderRadius: SETTINGS.control / 2,
        }}
      >
        {options.map((option) => (
          <Segment
            key={option.id}
            option={option}
            selected={option.id === selected}
            layoutId={layoutId}
            onSelect={onSelect}
          />
        ))}
      </div>
    </>
  );
}

/** Una opcion del segmentado. La pastilla seleccionada se desliza entre ellas. */
function Segment({
  option,
  selected,
  layoutId,
  onSelect,
}: {
  option: Option;
  selected: boolean;
  layoutId: string;
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
      {selected && (
        <motion.span
          layoutId={layoutId}
          transition={{ type: "spring", stiffness: 420, damping: 34 }}
          style={{
            position: "absolute",
            inset: 0,
            background: COLOR.label,
            borderRadius: SETTINGS.control / 2,
          }}
        />
      )}
      <span
        style={{
          position: "relative",
          fontSize: POPOVER.text.caption,
          fontWeight: 600,
          lineHeight: 1,
          color: selected ? COLOR.surface : COLOR.detailValue,
        }}
      >
        {option.label}
      </span>
    </button>
  );
}
