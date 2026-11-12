/**
 * "Notlarım" zustand store'u — UI için in-memory önbellek.
 *
 * Kalıcı veri IndexedDB'de; bu store yalnızca ekrandaki durumu tutar ve
 * yazmaları repository'ye devreder. Ana NetDefter store'undan TAM AYRI.
 */
import { create } from "zustand";
import type { Note, NoteImage } from "./types";
import { filterAndSortNotes, noteCounts, DEFAULT_FILTER, type NoteFilter, type NoteView } from "./search";
import * as repo from "./repository";
import * as images from "./images";

export interface NotesState {
  hydrated: boolean;
  loading: boolean;
  error: string | null;
  notes: Note[];
  images: NoteImage[];
  filter: NoteFilter;
  /** Açık notun id'si (editör). */
  activeNoteId: string | null;

  hydrate: () => Promise<void>;
  setFilter: (patch: Partial<NoteFilter>) => void;
  setView: (view: NoteView) => void;
  setActiveNote: (id: string | null) => void;

  create: (input: repo.NoteInput) => Promise<Note>;
  update: (note: Note) => Promise<{ status: string }>;
  remove: (id: string) => Promise<void>;
  restore: (id: string) => Promise<void>;
  purge: (id: string) => Promise<void>;
  toggleFavorite: (id: string) => Promise<void>;
  togglePinned: (id: string) => Promise<void>;
  toggleArchived: (id: string) => Promise<void>;

  /** Çakışma: yerel değişiklikleri koru (DB sürümü arşiv kopyası olur). */
  resolveKeepLocal: (local: Note) => Promise<{ status: string; revision?: number }>;
  /** Çakışma: veritabanındaki sürümü yükle (yerel arşiv kopyası olur). */
  resolveKeepDb: (local: Note) => Promise<{ status: string }>;

  refreshImages: () => Promise<void>;
}

async function loadAll(): Promise<{ notes: Note[]; images: NoteImage[] }> {
  const notes = await repo.listNotes();
  const images = await (await import("./db")).openNotesDb().then((db) => db.getAll("images"));
  return { notes, images };
}

export const useNotesStore = create<NotesState>((set, get) => ({
  hydrated: false,
  loading: false,
  error: null,
  notes: [],
  images: [],
  filter: DEFAULT_FILTER,
  activeNoteId: null,

  hydrate: async () => {
    set({ loading: true, error: null });
    try {
      const { notes, images } = await loadAll();
      set({ notes, images, hydrated: true, loading: false });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  setFilter: (patch) => set((s) => ({ filter: { ...s.filter, ...patch } })),
  setView: (view) => set((s) => ({ filter: { ...s.filter, view } })),
  setActiveNote: (id) => set({ activeNoteId: id }),

  create: async (input) => {
    const { note } = await repo.createNote(input);
    await get().hydrate();
    return note;
  },

  update: async (note) => {
    const res = await repo.saveNote(note, note.revision);
    await get().hydrate();
    return res;
  },

  remove: async (id) => {
    await repo.softDeleteNote(id);
    await get().hydrate();
  },

  restore: async (id) => {
    await repo.restoreNote(id);
    await get().hydrate();
  },

  purge: async (id) => {
    await repo.purgeNote(id);
    await get().hydrate();
  },

  toggleFavorite: async (id) => {
    const n = get().notes.find((x) => x.id === id);
    if (!n) return;
    await repo.saveNote({ ...n, favorite: !n.favorite }, n.revision);
    await get().hydrate();
  },

  togglePinned: async (id) => {
    const n = get().notes.find((x) => x.id === id);
    if (!n) return;
    await repo.saveNote({ ...n, pinned: !n.pinned }, n.revision);
    await get().hydrate();
  },

  toggleArchived: async (id) => {
    const n = get().notes.find((x) => x.id === id);
    if (!n) return;
    await repo.saveNote({ ...n, archived: !n.archived }, n.revision);
    await get().hydrate();
  },

  // Not: yalnızca BAŞARIDA hydrate edilir. `missing`/`error` durumunda
  // hydrate, silinmiş notu listeden düşürüp editörü unmount ettirir ve
  // kullanıcının yerel içeriğiyle çakışma banner'ı kaybolurdu.
  resolveKeepLocal: async (local) => {
    const res = await repo.resolveConflictKeepLocal(local);
    if (res.status === "written") await get().hydrate();
    return res;
  },

  resolveKeepDb: async (local) => {
    const res = await repo.resolveConflictKeepDb(local);
    if (res.status === "written") await get().hydrate();
    return res;
  },

  refreshImages: async () => {
    const db = await (await import("./db")).openNotesDb();
    set({ images: await db.getAll("images") });
  },
}));

/** Filtrelenmiş + sıralanmış notlar (türetilmiş). */
export function selectVisibleNotes(s: NotesState): Note[] {
  return filterAndSortNotes(s.notes, s.filter);
}

/** Rozet sayıları (türetilmiş). */
export function selectCounts(s: NotesState) {
  return noteCounts(s.notes);
}
