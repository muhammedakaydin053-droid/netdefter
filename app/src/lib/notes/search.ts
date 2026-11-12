/**
 * Not arama, filtreleme ve sıralama — SAF fonksiyonlar.
 *
 * Ağır IndexedDB'ye bağımlı değildir; birim testte doğrudan çalışır.
 */
import type { Note } from "./types";

export type NoteView = "active" | "favorite" | "pinned" | "archived" | "trash";

export interface NoteFilter {
  /** Görünüm: aktif / favori / sabit / arşiv / çöp. */
  view: NoteView;
  /** Serbest metin araması (başlık + ders + konu). */
  query: string;
  exam: "TYT" | "AYT" | "all";
  subject: string | "all";
}

export const DEFAULT_FILTER: NoteFilter = {
  view: "active",
  query: "",
  exam: "all",
  subject: "all",
};

/** Tiptap JSON'dan düz metin çıkarır (arama için). */
export function docToText(doc: unknown): string {
  const parts: string[] = [];
  function walk(node: unknown): void {
    if (!node || typeof node !== "object") return;
    const n = node as { type?: string; text?: string; content?: unknown[] };
    if (typeof n.text === "string") parts.push(n.text);
    if (Array.isArray(n.content)) for (const c of n.content) walk(c);
  }
  walk(doc);
  return parts.join(" ");
}

function matchesView(note: Note, view: NoteView): boolean {
  if (view === "trash") return note.deletedAt !== null;
  if (note.deletedAt !== null) return false; // çöp dışındaki görünümlerde çöp görünmez
  if (view === "archived") return note.archived;
  if (note.archived) return false; // arşiv yalnızca arşiv görünümünde
  if (view === "favorite") return note.favorite;
  if (view === "pinned") return note.pinned;
  return true; // active
}

/** Notları filtreleyip sıralar. Sabitlenmiş notlar her zaman üstte. */
export function filterAndSortNotes(notes: Note[], filter: NoteFilter): Note[] {
  const q = filter.query.trim().toLocaleLowerCase("tr");

  const filtered = notes.filter((n) => {
    if (!matchesView(n, filter.view)) return false;
    if (filter.exam !== "all" && n.exam !== filter.exam) return false;
    if (filter.subject !== "all" && n.subject !== filter.subject) return false;
    if (q) {
      const hay = `${n.title} ${n.subject} ${n.topics.join(" ")} ${docToText(n.content)}`
        .toLocaleLowerCase("tr");
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  return filtered.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}

/** Not sayıları (rozetler için). */
export function noteCounts(notes: Note[]): {
  active: number;
  favorite: number;
  pinned: number;
  archived: number;
  trash: number;
} {
  const live = notes.filter((n) => n.deletedAt === null);
  return {
    active: live.filter((n) => !n.archived).length,
    favorite: live.filter((n) => !n.archived && n.favorite).length,
    pinned: live.filter((n) => !n.archived && n.pinned).length,
    archived: live.filter((n) => n.archived).length,
    trash: notes.filter((n) => n.deletedAt !== null).length,
  };
}
