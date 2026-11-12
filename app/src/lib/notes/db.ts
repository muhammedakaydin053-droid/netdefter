/**
 * "Notlarım" IndexedDB katmanı — ayrı veritabanı `netdefter-notes`.
 *
 * Ana NetDefter verisi localStorage'da yaşar; burada ayrı bir DB açılır ki
 * notlar ve görsel blob'ları (localStorage'ın ~5 MB sınırına sığmaz) tamamen
 * izole kalsın. Sunucuda (SSR) `indexedDB` yoktur; çağıranlar `openNotesDb`'yi
 * yalnızca tarayıcıda kullanmalı.
 */
import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Note, NoteImage } from "./types";

export const NOTES_DB_NAME = "netdefter-notes";
export const NOTES_DB_VERSION = 1;

interface NotesSchema extends DBSchema {
  notes: {
    key: string;
    value: Note;
    indexes: {
      updatedAt: string;
      exam: string;
      subject: string;
      deletedAt: string;
      favorite: string;
      pinned: string;
      archived: string;
    };
  };
  images: {
    key: string;
    value: NoteImage;
    indexes: { noteId: string };
  };
  meta: {
    key: string;
    value: { key: string; value: unknown };
  };
}

export type NotesDb = IDBPDatabase<NotesSchema>;

/** Tarayıcıda IndexedDB var mı? (SSR güvenliği) */
export function hasIndexedDb(): boolean {
  return typeof indexedDB !== "undefined";
}

let dbPromise: Promise<NotesDb> | null = null;

/**
 * Veritabanını açar (tek sefer; sonuç önbelleklenir).
 *
 * Şema tek yerde tanımlıdır; `upgrade` yalnızca ilk kurulumda çalışır.
 */
export function openNotesDb(): Promise<NotesDb> {
  if (!hasIndexedDb()) {
    return Promise.reject(new Error("IndexedDB bu ortamda yok (SSR)"));
  }
  if (!dbPromise) {
    dbPromise = openDB<NotesSchema>(NOTES_DB_NAME, NOTES_DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("notes")) {
          const notes = db.createObjectStore("notes", { keyPath: "id" });
          notes.createIndex("updatedAt", "updatedAt");
          notes.createIndex("exam", "exam");
          notes.createIndex("subject", "subject");
          notes.createIndex("deletedAt", "deletedAt");
          notes.createIndex("favorite", "favorite");
          notes.createIndex("pinned", "pinned");
          notes.createIndex("archived", "archived");
        }
        if (!db.objectStoreNames.contains("images")) {
          const images = db.createObjectStore("images", { keyPath: "id" });
          images.createIndex("noteId", "noteId");
        }
        if (!db.objectStoreNames.contains("meta")) {
          db.createObjectStore("meta", { keyPath: "key" });
        }
      },
    });
  }
  return dbPromise;
}

/** Test/yeniden kurulum için önbelleği sıfırlar. */
export function resetNotesDbCache(): void {
  dbPromise = null;
}
