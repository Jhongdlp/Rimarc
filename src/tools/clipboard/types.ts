export type ClipboardKind = "url" | "code" | "color" | "text" | "image";
export type ClipboardFilter = "all" | "code" | "url" | "text";

export interface ClipboardItem {
  id: string;
  text: string;
  preview: string;
  kind: ClipboardKind;
  char_count: number;
  line_count: number;
  timestamp: number;
  /** Miniatura `data:` de las imagenes; en ellas `text` es la ruta del PNG. */
  image?: string;
  pinned?: boolean;
}

export interface ClipboardData {
  items: ClipboardItem[];
  filteredItems: ClipboardItem[];
  latestItem: ClipboardItem | null;
  totalCount: number;
  copiedId: string | null;
  searchQuery: string;
  filter: ClipboardFilter;
  isKde: boolean;
  setSearchQuery: (query: string) => void;
  setFilter: (filter: ClipboardFilter) => void;
  copyItem: (item: ClipboardItem) => Promise<void>;
  togglePin: (id: string) => void;
  deleteItem: (id: string) => void;
  clearAll: () => Promise<void>;
  refresh: () => Promise<void>;
}
