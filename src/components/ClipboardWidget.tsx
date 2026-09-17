import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Check, ExternalLink, Pencil, Settings, X } from "lucide-react";
import { POPOVER } from "../design/tokens";
import { Popover, PopoverHeader } from "./Popover";
import { borderColorFor, useClipboardPrefs, useTheme } from "../lib/theme";
import { call } from "../lib/tauri";
import { useI18n, type Lang } from "../lib/i18n";
import { useClipboard } from "../tools/clipboard/useClipboard";
import type { ClipboardItem } from "../tools/clipboard/types";
import type { Anchor } from "../lib/placement";

/** La ventana `clipboard` mide 460 x 620 (tauri.conf.json y `setup_clipboard_geometry`). */
const WIN_W = 460;
const WIN_H = 620;
/** Cuerpo de la carta: lo que queda de la ventana tras cola y hueco. */
const CARD_H = WIN_H - POPOVER.tail.length - POPOVER.gap - 2;
const T = { name: 14, meta: 11, value: 12 };
/** `T` a la escala de letra elegida en ajustes. */
function useText() {
  const { fontScale: k } = useClipboardPrefs();
  return { name: T.name * k, meta: T.meta * k, value: T.value * k };
}
/** Rojo de las acciones que borran; se lee igual sobre la carta clara y la oscura. */
const DANGER = "#FF453A";
const TABS_TOP = 50;
const SEARCH_TOP = 84;
const LIST_TOP = 124;
/** Lo que tarda la carta en recogerse antes de ocultar la ventana. */
const CLOSE_MS = 180;

/**
 * Portapapeles con el lenguaje del notch: una carta negra sin bordes ni cajas,
 * la cola apuntando al icono de la bandeja y la jerarquia hecha solo con
 * opacidad. Cada fila se cierra con una raya de `track` que hace de separador,
 * como las barras del reparto de agentes.
 */
export function ClipboardWidget() {
  const { colors, isDark } = useTheme();
  const prefs = useClipboardPrefs();
  const t = useText();
  const { tr } = useI18n();
  const clipboard = useClipboard();
  const [confirmClear, setConfirmClear] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const [tab, setTab] = useState<"recent" | "pinned">("recent");
  const searchRef = useRef<HTMLInputElement>(null);
  /** Arrastrando un clip hacia otra app: ni perder el foco ni soltar cierran la carta a destiempo. */
  const dragging = useRef(false);
  /** Carta fijada: perder el foco o copiar ya no la ocultan (Esc y la bandeja si). */
  const [pinned, setPinned] = useState(false);
  const pinnedRef = useRef(false);
  pinnedRef.current = pinned;

  // La carta se vacia (remonte cerrado, sin animacion) *antes* de ocultar la
  // ventana: el webview oculto conserva su ultimo frame y, si era la carta
  // abierta, al volver a mostrarse asomaba un instante antes de la animacion.
  const [gen, setGen] = useState(0);
  const [open, setOpen] = useState(false);
  /** Sube en cada apertura: un cierre pendiente de otra vuelta ya no oculta nada. */
  const visit = useRef(0);
  const hide = () => {
    setOpen(false);
    setGen((g) => g + 1);
    // Dos frames: uno para que React pinte vacio y otro para que llegue a pantalla.
    // Si el backend oculta antes (clic en la bandeja), los frames quedan congelados
    // y se soltarian al reabrir, cerrando la carta recien abierta.
    const mine = visit.current;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (visit.current === mine) void call("close_clipboard_window");
      }),
    );
  };
  const close = () => {
    setOpen(false);
    setTimeout(hide, CLOSE_MS);
  };
  useEffect(() => {
    const enter = () => {
      visit.current++;
      dragging.current = false;
      requestAnimationFrame(() => {
        setOpen(true);
        searchRef.current?.focus();
      });
    };
    const leave = () => {
      if (!dragging.current && !pinnedRef.current) hide();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else keys.current(e);
    };
    if (document.hasFocus()) enter();
    window.addEventListener("focus", enter);
    window.addEventListener("blur", leave);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("focus", enter);
      window.removeEventListener("blur", leave);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  /**
   * Atajos de la carta (la lista esta en Ajustes > Atajos). La seleccion es la
   * misma que el hover, asi que teclado y raton se turnan sin dos resaltados.
   * Va por ref: el listener se registra una vez y tiene que ver la lista actual.
   */
  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  keys.current = (e) => {
    // Editando un clip, las teclas son del cuadro de texto.
    if (e.target instanceof HTMLTextAreaElement) return;
    const at = list.findIndex((it) => it.id === hovered);
    const select = (i: number) => {
      const item = list[Math.max(0, Math.min(list.length - 1, i))];
      if (!item) return;
      setHovered(item.id);
      document.querySelector(`[data-clip-id="${CSS.escape(item.id)}"]`)?.scrollIntoView({ block: "nearest" });
    };
    const selected = list[at];
    const mod = e.ctrlKey || e.metaKey;
    let handled = true;
    if (e.key === "ArrowDown") select(at + 1);
    else if (e.key === "ArrowUp") select(at <= 0 ? 0 : at - 1);
    else if (e.key === "Enter" && !mod) (selected ?? list[0]) && void copy(selected ?? list[0]);
    else if (e.altKey && /^Digit[1-9]$/.test(e.code)) {
      const item = list[Number(e.code.slice(5)) - 1];
      if (item) void copy(item);
    } else if (e.key === "Tab") setTab((t) => (t === "recent" ? "pinned" : "recent"));
    else if (mod && e.key.toLowerCase() === "p" && selected) clipboard.togglePin(selected.id);
    else if (e.shiftKey && e.key === "Delete" && selected) {
      select(at + 1 < list.length ? at + 1 : at - 1);
      clipboard.deleteItem(selected.id);
    } else if (mod && e.key.toLowerCase() === "f") searchRef.current?.focus();
    else handled = false;
    if (handled) e.preventDefault();
  };

  const copy = async (item: ClipboardItem) => {
    await clipboard.copyItem(item);
    if (prefs.closeOnCopy && !pinned) setTimeout(close, 200);
  };

  const clear = async () => {
    if (!confirmClear) {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 3000);
      return;
    }
    await clipboard.clearAll();
    setConfirmClear(false);
  };

  // Cola hacia abajo, al centro: el backend centra la ventana sobre el icono.
  const anchor: Anchor = { dir: "up", along: WIN_W / 2, inner: WIN_H, alongMax: WIN_W };
  const pinnedCount = clipboard.items.filter((it) => it.pinned).length;
  const list =
    tab === "pinned" ? clipboard.filteredItems.filter((it) => it.pinned) : clipboard.filteredItems;

  const rows = () =>
    list.map((item, i) => (
      <Row
        key={item.id}
        item={item}
        order={i}
        copied={clipboard.copiedId === item.id}
        dim={hovered !== null && hovered !== item.id}
        onHover={() => setHovered(item.id)}
        onCopy={() => copy(item)}
        onPin={() => clipboard.togglePin(item.id)}
        onDelete={() => clipboard.deleteItem(item.id)}
        onEdit={async (text) => {
          // Editar = el texto nuevo pasa al portapapeles y sustituye al viejo en
          // el historial (un fijado se conserva: el fijado guarda su copia).
          await clipboard.copyItem({ ...item, text });
          if (!item.pinned) clipboard.deleteItem(item.id);
        }}
        onDrag={() => {
          // Perder el foco al arrastrar no cierra la carta; el arrastre nativo se
          // encarga de ocultarla al soltar en otra app.
          dragging.current = true;
          void call(
            "start_clipboard_drag",
            item.kind === "image" ? { path: item.text } : { text: item.text },
          );
        }}
      />
    ));

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      {/* 4 px menos de ancho: el contorno sobresale 1 px del path y a ras de ventana se cortaba. */}
      <Popover
        key={gen}
        anchor={anchor}
        width={WIN_W - 4}
        height={CARD_H}
        open={open}
        stroke={borderColorFor(prefs, isDark)}
        strokeWidth={prefs.borderWidth}
        fillOpacity={prefs.surfaceOpacity}
      >
        {/* Margen extra sobre el `padX` de la carta, que a este ancho se queda justo. */}
        <div style={{ position: "absolute", inset: "0 12px" }}>
          <PopoverHeader icon={<ClipGlyph color={colors.icon} />} title={tr("Portapapeles", "Clipboard")} />

          {/* Fijar la carta: a la izquierda de Ajustes. */}
          {!confirmClear && <button
            type="button"
            onClick={() => setPinned((p) => !p)}
            title={pinned ? tr("Desfijar portapapeles", "Unpin clipboard") : tr("Fijar portapapeles", "Pin clipboard")}
            style={{
              ...bare,
              position: "absolute",
              top: POPOVER.headerTop,
              right: 60,
              height: POPOVER.icon,
              display: "flex",
              alignItems: "center",
            }}
          >
            <PinGlyph color={pinned ? (prefs.accent ?? colors.detailLabel) : colors.detailLabel} filled={pinned} />
          </button>}

          {/* Ajustes: cierra la carta y abre su propia ventana, centrada. Se aparta
              mientras "¿Vaciar?" ocupa su sitio. */}
          {!confirmClear && <button
            type="button"
            onClick={() => void call("open_clipboard_settings")}
            title={tr("Ajustes", "Settings")}
            style={{
              ...bare,
              position: "absolute",
              top: POPOVER.headerTop,
              right: 30,
              height: POPOVER.icon,
              display: "flex",
              alignItems: "center",
            }}
          >
            {/* Mas grande que el resto de glifos: es la puerta a los ajustes y tiene que encontrarse. */}
            <Settings size={19} strokeWidth={1.8} color={colors.detailLabel} />
          </button>}

          <button
            type="button"
            onClick={clear}
            title={tr("Vaciar historial", "Clear history")}
            style={{
              ...bare,
              position: "absolute",
              top: POPOVER.headerTop,
              right: 0,
              height: POPOVER.icon,
              display: "flex",
              alignItems: "center",
              fontSize: t.value,
              fontWeight: 600,
              lineHeight: 1,
              color: DANGER,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {confirmClear ? tr("¿Vaciar?", "Clear?") : <TrashGlyph color={DANGER} size={19} />}
          </button>

          {/* Pestañas: solo texto; la activa se subraya con una raya que se desliza. */}
          <div style={{ position: "absolute", top: TABS_TOP, left: 0, display: "flex", gap: 18 }}>
            {(
              [
                ["recent", tr("Recientes", "Recent"), clipboard.totalCount],
                ["pinned", tr("Fijados", "Pinned"), pinnedCount],
              ] as const
            ).map(([id, label, count]) => {
              const active = tab === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  style={{
                    ...bare,
                    position: "relative",
                    paddingBottom: 7,
                    fontSize: t.value + 1,
                    fontWeight: 600,
                    lineHeight: 1,
                    color: active ? colors.detailLabel : colors.detailValue,
                    transition: "color 140ms ease",
                  }}
                >
                  {label}
                  {count > 0 && (
                    <span style={{ marginLeft: 5, fontWeight: 500, opacity: 0.6, fontVariantNumeric: "tabular-nums" }}>
                      {count}
                    </span>
                  )}
                  {active && (
                    <motion.span
                      layoutId="clipboard-tab"
                      transition={{ type: "spring", stiffness: 420, damping: 36 }}
                      style={{
                        position: "absolute",
                        left: 0,
                        right: 0,
                        bottom: 0,
                        height: 2,
                        borderRadius: 1,
                        background: prefs.accent ?? colors.detailLabel,
                      }}
                    />
                  )}
                </button>
              );
            })}
          </div>

          {/* Buscador: sin caja, solo la raya de debajo. */}
          <input
            ref={searchRef}
            value={clipboard.searchQuery}
            onChange={(e) => clipboard.setSearchQuery(e.target.value)}
            placeholder={tr("Buscar", "Search")}
            spellCheck={false}
            style={{
              position: "absolute",
              top: SEARCH_TOP,
              left: 0,
              right: 0,
              height: 28,
              padding: 0,
              border: "none",
              borderBottom: `1px solid ${colors.track}`,
              background: "transparent",
              outline: "none",
              color: colors.detailLabel,
              caretColor: prefs.accent ?? colors.detailLabel,
              fontFamily: "inherit",
              fontSize: t.name,
              fontWeight: 500,
            }}
          />

          <div
            onMouseLeave={() => setHovered(null)}
            style={{
              position: "absolute",
              top: LIST_TOP,
              left: 0,
              right: 0,
              bottom: POPOVER.padBottom,
              overflowY: "auto",
              scrollbarWidth: "none",
            }}
          >
            {list.length === 0 ? (
              <div
                style={{
                  paddingTop: 40,
                  textAlign: "center",
                  fontSize: t.meta,
                  fontWeight: 500,
                  color: colors.detailValue,
                }}
              >
                {clipboard.searchQuery
                  ? tr("Sin coincidencias", "No matches")
                  : tab === "pinned"
                    ? tr("Nada fijado", "Nothing pinned")
                    : tr("Vacío", "Empty")}
              </div>
            ) : (
              rows()
            )}
          </div>
        </div>
      </Popover>
    </div>
  );
}

function Row({
  item,
  order,
  copied,
  dim,
  onHover,
  onCopy,
  onPin,
  onDelete,
  onEdit,
  onDrag,
}: {
  item: ClipboardItem;
  order: number;
  copied: boolean;
  dim: boolean;
  onHover: () => void;
  onCopy: () => void;
  onPin: () => void;
  onDelete: () => void;
  onEdit: (text: string) => void;
  onDrag: () => void;
}) {
  const { colors } = useTheme();
  const t = useText();
  const { lang, tr } = useI18n();
  const { accent, density, previewLines } = useClipboardPrefs();
  const [over, setOver] = useState(false);
  /** Texto en edicion; `null` = la fila normal. */
  const [draft, setDraft] = useState<string | null>(null);
  const editing = draft !== null;
  const save = () => {
    if (draft !== null && draft.trim() && draft !== item.text) onEdit(draft);
    setDraft(null);
  };
  const t0 = item.text.trim();
  // "Abrir": enlaces, imagenes (su PNG) y rutas de una linea. El backend
  // comprueba que la ruta exista antes de abrir nada.
  const openLabel =
    item.kind === "url"
      ? tr("Abrir en el navegador", "Open in browser")
      : item.kind === "image"
        ? tr("Abrir imagen", "Open image")
        : item.line_count <= 1 && /^(\/|~\/|file:\/\/)/.test(t0)
          ? tr("Abrir ubicación", "Open location")
          : null;
  const mono = item.kind === "code" || item.kind === "url";
  const meta = copied
    ? tr("Copiado", "Copied")
    : item.kind === "image"
      ? `${KIND[lang].image}  ·  ${item.preview}`
      : [KIND[lang][item.kind], `${item.char_count} ${tr("car.", "chars")}`, item.line_count > 1 && `${item.line_count} ${tr("lín.", "lines")}`]
          .filter(Boolean)
          .join("  ·  ");

  // Arrastrar fuera de la ventana pega en la app de destino: el texto tal cual y
  // la imagen como fichero. Todo va por un arrastre nativo de GTK (ver
  // `start_clipboard_drag`): el de HTML lo rechazan apps como Warp y de icono
  // arrastra la fila entera con sus botones.
  const onDragStart = (e: React.DragEvent) => {
    e.preventDefault();
    onDrag();
  };

  const delay = Math.min(order, 8) * 0.025;

  return (
    // Envoltorio plano para el arrastre: framer-motion reserva `onDragStart`
    // para sus propios gestos, no para el drag & drop nativo.
    <div
      role="button"
      tabIndex={0}
      data-clip-id={item.id}
      draggable={!editing}
      onDragStart={onDragStart}
      onClick={editing ? undefined : onCopy}
      onMouseEnter={() => {
        setOver(true);
        onHover();
      }}
      onMouseLeave={() => setOver(false)}
      style={{ cursor: editing ? "auto" : "pointer", outline: "none", WebkitUserDrag: editing ? "none" : "element" } as React.CSSProperties}
    >
      <motion.div
        // Cascada corta tras la carta; solo las primeras filas, las demas ya no se ven.
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: dim ? POPOVER.drawer.dim : 1, y: 0 }}
        transition={{
          opacity: { duration: 0.14, delay: dim ? 0 : delay },
          y: { type: "spring", stiffness: 320, damping: 30, delay },
        }}
        style={{
          position: "relative",
          // Hueco para el pin de un fijado; el resto de acciones flota encima al pasar.
          // Editando, los dos botones se quedan fijos y el cuadro no pasa por debajo.
          padding: `${density === "compact" ? 7 : 12}px ${editing ? 92 : 44}px ${density === "compact" ? 7 : 12}px 0`,
          borderBottom: `1px solid ${colors.track}`,
        }}
      >
        {editing ? (
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // Sin propagar: Escape en la ventana cierra la carta entera.
              e.stopPropagation();
              if (e.key === "Escape") setDraft(null);
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) save();
            }}
            spellCheck={false}
            rows={Math.min(8, Math.max(2, item.line_count))}
            style={{
              display: "block",
              width: "100%",
              boxSizing: "border-box",
              padding: "8px 10px",
              borderRadius: 8,
              border: `1px solid ${colors.track}`,
              background: "transparent",
              outline: "none",
              resize: "none",
              color: colors.detailLabel,
              caretColor: colors.detailLabel,
              fontFamily: mono ? "ui-monospace, monospace" : "inherit",
              fontSize: t.name - 1,
              lineHeight: 1.35,
              userSelect: "text",
            }}
          />
        ) : item.kind === "image" && item.image ? (
          <img
            src={item.image}
            alt=""
            draggable={false}
            style={{
              display: "block",
              maxWidth: "100%",
              maxHeight: 140,
              borderRadius: 10,
              boxShadow: `0 0 0 1px ${colors.track}`,
            }}
          />
        ) : (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: mono ? t.name - 1.5 : t.name,
              fontFamily: mono ? "ui-monospace, monospace" : "inherit",
              fontWeight: 500,
              lineHeight: 1.1,
              color: colors.detailLabel,
              whiteSpace: "nowrap",
              overflow: "hidden",
            }}
          >
            {item.kind === "color" && (
              <span
                style={{
                  flex: "none",
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  background: item.text.trim(),
                  boxShadow: `0 0 0 1px ${colors.track}`,
                }}
              />
            )}
            {previewLines === 1 ? (
              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                {item.preview.replace(/\s+/g, " ")}
              </span>
            ) : (
              // Varias lineas: el texto real con sus saltos, no el `preview` aplanado.
              <span
                style={{
                  display: "-webkit-box",
                  WebkitBoxOrient: "vertical",
                  WebkitLineClamp: previewLines,
                  minWidth: 0,
                  overflow: "hidden",
                  whiteSpace: mono ? "pre" : "pre-wrap",
                  wordBreak: "break-word",
                  lineHeight: 1.3,
                }}
              >
                {item.text.slice(0, 400)}
              </span>
            )}
          </div>
        )}

        <div
          style={{
            marginTop: 7,
            fontSize: t.meta,
            fontWeight: 500,
            lineHeight: 1,
            color: copied ? (accent ?? colors.detailLabel) : colors.detailValue,
            whiteSpace: "nowrap",
          }}
        >
          {editing ? "Ctrl + Enter guarda  ·  Esc cancela" : meta}
        </div>

        {/* Acciones: solo el pin de un fijado se queda a la vista. Al pasar, flotan
            en una pastilla sobre el texto, como en Klipper. */}
        <span
          style={{
            position: "absolute",
            top: editing ? 8 : 0,
            right: 0,
            bottom: editing ? "auto" : 0,
            display: "flex",
            alignItems: "center",
            gap: 6,
            paddingLeft: over || editing ? 8 : 0,
            background: over || editing ? colors.surface : "transparent",
            borderRadius: 20,
          }}
        >
          {editing ? (
            <>
              <IconButton title={tr("Cancelar (Esc)", "Cancel (Esc)")} onClick={() => setDraft(null)} glyph={(c) => <X size={18} color={c} strokeWidth={1.8} />} />
              <IconButton title={tr("Guardar (Ctrl + Enter)", "Save (Ctrl + Enter)")} onClick={save} glyph={(c) => <Check size={18} color={c} strokeWidth={2} />} />
            </>
          ) : (
          <>
          {over && openLabel && (
            <IconButton
              title={openLabel}
              onClick={() => void call("open_clipboard_item", { text: item.text })}
              glyph={(c) => <ExternalLink size={17} color={c} strokeWidth={1.8} />}
            />
          )}
          {over && item.kind !== "image" && (
            <IconButton title={tr("Editar", "Edit")} onClick={() => setDraft(item.text)} glyph={(c) => <Pencil size={17} color={c} strokeWidth={1.8} />} />
          )}
          {(over || item.pinned) && (
            <IconButton
              title={item.pinned ? tr("Desfijar", "Unpin") : tr("Fijar", "Pin")}
              onClick={onPin}
              active={item.pinned}
              glyph={(c) => <PinGlyph color={c} filled={item.pinned} />}
            />
          )}
          {over && <IconButton title={tr("Eliminar", "Delete")} onClick={onDelete} glyph={() => <TrashGlyph color={DANGER} size={18} />} />}
          </>
          )}
        </span>
      </motion.div>
    </div>
  );
}

const KIND: Record<Lang, Record<ClipboardItem["kind"], string>> = {
  es: { code: "Código", url: "Enlace", color: "Color", text: "Texto", image: "Imagen" },
  en: { code: "Code", url: "Link", color: "Color", text: "Text", image: "Image" },
};

const bare = {
  padding: 0,
  border: "none",
  background: "transparent",
  cursor: "pointer",
  fontFamily: "inherit",
} as const;

/** Boton de glifo: apagado en reposo, y al pasar un disco de `track` detras. */
function IconButton({
  title,
  onClick,
  glyph,
  active = false,
}: {
  title: string;
  onClick: () => void;
  glyph: (color: string) => React.ReactNode;
  active?: boolean;
}) {
  const { colors } = useTheme();
  const { accent } = useClipboardPrefs();
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        ...bare,
        // Disco siempre visible: sin el, sobre una miniatura el glifo se perdia.
        width: 34,
        height: 34,
        borderRadius: 17,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: colors.track,
        boxShadow: `0 0 0 1px ${colors.surface}`,
        transform: hover ? "scale(1.08)" : "none",
        transition: "transform 120ms ease",
      }}
    >
      {glyph(active ? (accent ?? colors.detailLabel) : colors.detailLabel)}
    </button>
  );
}

/* Glifos al trazo del chevron del cajon: 1.6 de grosor y remates redondos. */

function ClipGlyph({ color }: { color: string }) {
  const s = POPOVER.icon;
  return (
    <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="10" height="11.5" rx="2" />
      <path d="M6 1.5h4v3H6z" fill={color} />
    </svg>
  );
}

/** Chincheta vista de frente: cabeza, cuerpo acampanado y la punta. */
function PinGlyph({ color, filled }: { color: string; filled?: boolean }) {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path
        d="M9 4h6M10 4v5.5L6.5 13.5V15h11v-1.5L14 9.5V4"
        fill={filled ? color : "none"}
      />
      <path d="M12 15v6" />
    </svg>
  );
}

function TrashGlyph({ color, size = 15 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6.5h16M9.5 6.5V4.5h5v2M6.5 6.5l.9 12.6a1.5 1.5 0 0 0 1.5 1.4h6.2a1.5 1.5 0 0 0 1.5-1.4l.9-12.6" />
    </svg>
  );
}
