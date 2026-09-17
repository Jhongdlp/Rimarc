import { useState, useEffect, useCallback, useMemo } from "react";
import { call, inTauri } from "../../lib/tauri";
import { useClipboardPrefs } from "../../lib/theme";
import type { ClipboardItem, ClipboardFilter, ClipboardData } from "./types";

/**
 * Los fijados se guardan enteros, no por id: un clip fijado tiene que seguir ahi
 * aunque Klipper ya lo haya sacado de su historial.
 */
const PINNED_STORAGE_KEY = "agentnotch.clipboard.pins.v2";

function loadPins(): ClipboardItem[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(PINNED_STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function savePins(pins: ClipboardItem[]) {
  try {
    localStorage.setItem(PINNED_STORAGE_KEY, JSON.stringify(pins));
  } catch {}
}

export function useClipboard(): ClipboardData {
  const { historyLimit } = useClipboardPrefs();
  const [rawItems, setRawItems] = useState<ClipboardItem[]>([]);
  const [pins, setPins] = useState<ClipboardItem[]>(loadPins);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<ClipboardFilter>("all");

  const isKde = useMemo(() => {
    return rawItems.some((it) => it.id.startsWith("klipper-"));
  }, [rawItems]);

  const fetchHistory = useCallback(async () => {
    if (inTauri) {
      const data = await call<ClipboardItem[]>("get_clipboard_history", { limit: historyLimit });
      if (data && Array.isArray(data)) {
        setRawItems(data);
        return;
      }
    }

    // Fallback en navegador dev o si no hay backend
    if (!inTauri && rawItems.length === 0) {
      setRawItems([
        {
          id: "mock-1",
          text: "pnpm dev:tauri",
          preview: "pnpm dev:tauri",
          kind: "code",
          char_count: 14,
          line_count: 1,
          timestamp: Date.now() - 30000,
        },
        {
          id: "mock-2",
          text: "https://github.com/Jhongdlp/Rimarc",
          preview: "https://github.com/Jhongdlp/Rimarc",
          kind: "url",
          char_count: 35,
          line_count: 1,
          timestamp: Date.now() - 120000,
        },
        {
          id: "mock-3",
          text: "qdbus6 org.kde.klipper /klipper",
          preview: "qdbus6 org.kde.klipper /klipper",
          kind: "code",
          char_count: 31,
          line_count: 1,
          timestamp: Date.now() - 300000,
        },
      ]);
    }
  }, [rawItems.length, historyLimit]);

  useEffect(() => {
    void fetchHistory();
    const timer = window.setInterval(() => {
      void fetchHistory();
    }, 2000);
    return () => window.clearInterval(timer);
  }, [fetchHistory]);

  const copyItem = useCallback(
    async (item: ClipboardItem) => {
      try {
        if (item.kind === "image") {
          await call("set_clipboard_image", { path: item.text });
          setCopiedId(item.id);
          window.setTimeout(() => setCopiedId((curr) => (curr === item.id ? null : curr)), 1600);
          return;
        }
        if (inTauri) {
          await call("set_clipboard_content", { text: item.text });
        }
        if (typeof navigator !== "undefined" && navigator.clipboard) {
          await navigator.clipboard.writeText(item.text).catch(() => {});
        }
      } catch (err) {
        console.error("Fallo al copiar:", err);
      }

      setCopiedId(item.id);
      window.setTimeout(() => {
        setCopiedId((curr) => (curr === item.id ? null : curr));
      }, 1600);

      // Mover el elemento al principio
      setRawItems((prev) => {
        const without = prev.filter((it) => it.id !== item.id);
        return [item, ...without];
      });
    },
    [],
  );

  const togglePin = useCallback(
    (id: string) => {
      setPins((prev) => {
        const without = prev.filter((p) => p.id !== id);
        const item = rawItems.find((it) => it.id === id);
        const next =
          without.length < prev.length || !item ? without : [{ ...item, pinned: undefined }, ...without];
        savePins(next);
        return next;
      });
    },
    [rawItems],
  );

  const deleteItem = useCallback((id: string) => {
    void call("delete_clipboard_item", { id });
    setRawItems((prev) => prev.filter((it) => it.id !== id));
    setPins((prev) => {
      if (!prev.some((p) => p.id === id)) return prev;
      const next = prev.filter((p) => p.id !== id);
      savePins(next);
      return next;
    });
  }, []);

  const clearAll = useCallback(async () => {
    if (inTauri) {
      await call("clear_clipboard_history");
    }
    setRawItems([]);
    setPins([]);
    savePins([]);
  }, []);

  const items = useMemo(() => {
    const pinnedIds = new Set(pins.map((p) => p.id));
    const rawIds = new Set(rawItems.map((it) => it.id));
    return [
      ...rawItems.map((item) => ({ ...item, pinned: pinnedIds.has(item.id) })),
      ...pins.filter((p) => !rawIds.has(p.id)).map((p) => ({ ...p, pinned: true })),
    ];
  }, [rawItems, pins]);

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let result = items;

    if (filter !== "all") {
      result = result.filter((it) => it.kind === filter);
    }

    if (q) {
      result = result.filter(
        (it) =>
          it.text.toLowerCase().includes(q) ||
          it.preview.toLowerCase().includes(q) ||
          it.kind.toLowerCase().includes(q),
      );
    }

    // Ordenar: primero anclados/fijados, luego por orden
    return [...result].sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return b.timestamp - a.timestamp;
    });
  }, [items, searchQuery, filter]);

  return {
    items,
    filteredItems,
    latestItem: items[0] ?? null,
    totalCount: items.length,
    copiedId,
    searchQuery,
    filter,
    isKde,
    setSearchQuery,
    setFilter,
    copyItem,
    togglePin,
    deleteItem,
    clearAll,
    refresh: fetchHistory,
  };
}
