/**
 * "Notlarım" veri modeli — ana NetDefter store'undan TAM İZOLE.
 *
 * Bu tipler mevcut `@/lib/types` ile hiçbir şey paylaşmaz; notlar kendi
 * IndexedDB veritabanında (`netdefter-notes`) tutulur ve localStorage'a
 * yazılmaz. Böylece konu/yanlış/deneme verisi riske girmez.
 */

export type Exam = "TYT" | "AYT";

export type NoteTag = "formül" | "önemli" | "püf noktası" | "dikkat";

export const NOTE_TAGS: readonly NoteTag[] = ["formül", "önemli", "püf noktası", "dikkat"];

/** İzin verilen görsel MIME türleri (magic-byte doğrulamasıyla birlikte). */
export const IMAGE_MIME_TYPES: readonly string[] = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
];

/** Tek görsel için üst sınır (byte). */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Tiptap belgesi — serbest JSON, ama `schema.ts` ile doğrulanır. */
export interface TiptapDoc {
  type: "doc";
  content?: unknown[];
}

/**
 * Not kaydı.
 *
 * `revision`/`baseRevision` çakışma denetimi için; `contentHash` içeriğin
 * (title + konu + Tiptap JSON) kısa özeti. Görsel blob'ları hash'e KATILMAZ
 * (write-once).
 */
export interface Note {
  id: string;
  title: string;
  exam: Exam;
  subject: string;
  /** İlk sürümde tek konu; dizi olması ileride çoklu konuya göçsüz izin verir. */
  topics: string[];
  content: TiptapDoc;
  /** `images` store'a sıralı referans. */
  imageIds: string[];
  tags: NoteTag[];
  favorite: boolean;
  pinned: boolean;
  archived: boolean;
  /** Çöp kutusu (soft delete). Doluysa kayıt çöptedir. */
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  revision: number;
  baseRevision: number;
  contentHash: string;
  schemaVersion: number;
}

/**
 * Görsel kaydı — ayrı `images` store.
 *
 * Dosya alanları (`blob`, `name`, `mime`, `size`) WRITE-ONCE: yalnızca
 * `createImage` (`add()`) yazar; `updateImageMeta` yalnızca 4 meta alanı
 * (caption/alt/width/height) `put()` ile günceller.
 */
export interface NoteImage {
  id: string;
  noteId: string;
  name: string;
  mime: string;
  size: number;
  blob: Blob;
  caption: string | null;
  alt: string | null;
  width: number | null;
  height: number | null;
  revision: number;
  baseRevision: number;
  contentHash: string;
  createdAt: string;
}

/** `updateImageMeta` yaması — `undefined`=koru, `null`=temizle. */
export interface ImageMetaPatch {
  caption?: string | null;
  alt?: string | null;
  width?: number | null;
  height?: number | null;
}

/** Yedek zarfındaki görsel: blob yerine base64 `dataUrl`. */
export interface BackupImage {
  id: string;
  noteId: string;
  name: string;
  mime: string;
  size: number;
  caption: string | null;
  alt: string | null;
  width: number | null;
  height: number | null;
  dataUrl: string;
}

export interface NotesBackupData {
  notes: Note[];
  images: BackupImage[];
}

export interface NotesBackupFile {
  format: "netdefter-notes-backup";
  version: number;
  exportedAt: string;
  app: "NetDefter";
  data: NotesBackupData;
}

/** Yazma sonucu — "skipped" ≠ "saved" ayrımı için. */
export type WriteStatus = "written" | "skipped" | "conflict" | "missing" | "identical" | "error";
