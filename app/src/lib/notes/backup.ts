/**
 * Notlarım yedekleme — JSON zarfı (dışa/içe aktarma).
 *
 * Mevcut `@/lib/backup` desenini taklit eder: SAF modül, format+sürüm
 * doğrulaması, geçersizse `ok:false` döner ve MEVCUT VERİYE DOKUNULMAZ.
 *
 * Görseller base64 `dataUrl` olarak gömülür → tek dosyada taşınabilir.
 */
import type {
  BackupImage,
  Note,
  NoteImage,
  NotesBackupData,
  NotesBackupFile,
} from "./types";
import { validateTiptapDoc } from "./schema";

export const NOTES_BACKUP_FORMAT = "netdefter-notes-backup";
export const NOTES_BACKUP_VERSION = 1;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Blob → base64 dataUrl. */
export async function blobToDataUrl(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    bin += String.fromCharCode(...buf.subarray(i, i + chunk));
  }
  const b64 = btoa(bin);
  return `data:${blob.type || "application/octet-stream"};base64,${b64}`;
}

/** dataUrl → Blob. */
export function dataUrlToBlob(dataUrl: string): Blob {
  const [head, b64] = dataUrl.split(",");
  const mime = /data:([^;]+)/.exec(head)?.[1] ?? "application/octet-stream";
  const bin = atob(b64 ?? "");
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/** Not + görselleri yedek zarfına dönüştürür (görseller base64). */
export async function buildNotesBackup(
  notes: Note[],
  images: NoteImage[],
): Promise<NotesBackupFile> {
  const backupImages: BackupImage[] = [];
  for (const img of images) {
    backupImages.push({
      id: img.id,
      noteId: img.noteId,
      name: img.name,
      mime: img.mime,
      size: img.size,
      caption: img.caption,
      alt: img.alt,
      width: img.width,
      height: img.height,
      dataUrl: await blobToDataUrl(img.blob),
    });
  }
  return {
    format: NOTES_BACKUP_FORMAT,
    version: NOTES_BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    app: "NetDefter",
    data: { notes, images: backupImages },
  };
}

export interface ParseResult {
  ok: boolean;
  error?: string;
  data?: NotesBackupData;
  /** Doğrulanan ama atlanan not sayısı (bozuk içerik). */
  skippedNotes?: number;
}

function isNoteShape(v: unknown): v is Note {
  if (!isObject(v)) return false;
  return (
    typeof v.id === "string" &&
    typeof v.title === "string" &&
    (v.exam === "TYT" || v.exam === "AYT") &&
    typeof v.subject === "string" &&
    Array.isArray(v.topics) &&
    isObject(v.content)
  );
}

function isBackupImageShape(v: unknown): v is BackupImage {
  if (!isObject(v)) return false;
  return (
    typeof v.id === "string" &&
    typeof v.noteId === "string" &&
    typeof v.dataUrl === "string" &&
    typeof v.mime === "string"
  );
}

/**
 * Yedek dosyasını doğrular. Geçersizse `ok:false` — çağıran veriye dokunmaz.
 */
export function parseNotesBackup(raw: unknown): ParseResult {
  if (!isObject(raw)) return { ok: false, error: "dosya nesne değil" };
  if (raw.format !== NOTES_BACKUP_FORMAT) return { ok: false, error: "yanlış format" };
  if (typeof raw.version !== "number" || raw.version > NOTES_BACKUP_VERSION) {
    return { ok: false, error: "desteklenmeyen sürüm" };
  }
  const data = raw.data;
  if (!isObject(data)) return { ok: false, error: "data alanı yok" };
  if (!Array.isArray(data.notes)) return { ok: false, error: "notes dizisi yok" };

  let skipped = 0;
  const notes: Note[] = [];
  for (const n of data.notes) {
    if (!isNoteShape(n)) {
      skipped++;
      continue;
    }
    // Tiptap şeması geçmezse notu atla (sessiz kabul yok).
    if (validateTiptapDoc(n.content).length > 0) {
      skipped++;
      continue;
    }
    notes.push(n);
  }

  const images: BackupImage[] = Array.isArray(data.images)
    ? data.images.filter(isBackupImageShape)
    : [];

  return { ok: true, data: { notes, images }, skippedNotes: skipped };
}
