/**
 * Görsel katmanı — write-once depolama + ObjectURL referans sayacı.
 *
 * Rev.9 kararları (gerçek testlerle doğrulandı):
 *  - `createImage` `add()` kullanır: atomik write-once; aynı id varsa
 *    `ConstraintError` → `exists`, mevcut kayıt DOKUNULMAZ.
 *  - Dosya boyutu `blob.size` ile okunur (`Blob.byteLength` `undefined`!).
 *  - `updateImageMeta` `put()` ile YALNIZCA 4 meta alanı yazar; dosya
 *    alanları asla değişmez.
 *  - Alan politikası: `undefined`=koru, `null`=temizle, geçersiz tip=reddet.
 *  - Revision guard EŞİTLİK (`!==`) esaslı.
 *  - ObjectURL ref sayacı: aynı görsel N yerde → 1 URL, N refs.
 */
import { openNotesDb } from "./db";
import { imageMetaHash } from "./hash";
import type { ImageMetaPatch, NoteImage, WriteStatus } from "./types";
import { IMAGE_MIME_TYPES, MAX_IMAGE_BYTES } from "./types";

export interface CreateImageInput {
  noteId: string;
  name: string;
  mime: string;
  blob: Blob;
  caption?: string | null;
  alt?: string | null;
  width?: number | null;
  height?: number | null;
}

/** İlk baytlardan MIME tespiti — beyan edilen türe güvenmeyiz. */
export async function sniffMime(blob: Blob): Promise<string | null> {
  const head = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  const b = (i: number) => head[i];
  if (b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47) return "image/png";
  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return "image/jpeg";
  if (b(0) === 0x47 && b(1) === 0x49 && b(2) === 0x46) return "image/gif";
  // RIFF....WEBP
  if (b(0) === 0x52 && b(1) === 0x49 && b(2) === 0x46 && b(3) === 0x46 && b(8) === 0x57 && b(9) === 0x45 && b(10) === 0x42 && b(11) === 0x50) return "image/webp";
  return null;
}

export interface CreateImageResult {
  status: "created" | "exists" | "invalid" | "error";
  id?: string;
  error?: string;
}

/**
 * Yeni görsel yazar (write-once). `add()` kullanır — atomik; bölünemez.
 */
export async function createImage(input: CreateImageInput): Promise<CreateImageResult> {
  if (!(input.blob instanceof Blob)) {
    return { status: "invalid", error: "blob Blob değil" };
  }
  if (input.blob.size > MAX_IMAGE_BYTES) {
    return { status: "invalid", error: "boyut sınırı aşıldı" };
  }
  const sniffed = await sniffMime(input.blob);
  if (!sniffed || !IMAGE_MIME_TYPES.includes(sniffed)) {
    return { status: "invalid", error: "desteklenmeyen görsel türü" };
  }

  const id = crypto.randomUUID();
  const caption = input.caption ?? null;
  const alt = input.alt ?? null;
  const width = input.width ?? null;
  const height = input.height ?? null;
  const contentHash = await imageMetaHash({ caption, alt, width, height });

  const record: NoteImage = {
    id,
    noteId: input.noteId,
    name: input.name,
    mime: sniffed,
    size: input.blob.size,
    blob: input.blob,
    caption,
    alt,
    width,
    height,
    revision: 1,
    baseRevision: 0,
    contentHash,
    createdAt: new Date().toISOString(),
  };

  const db = await openNotesDb();
  const tx = db.transaction("images", "readwrite");
  let settled = false;
  try {
    await tx.store.add(record);
    await tx.done;
    settled = true;
    return { status: "created", id };
  } catch (e) {
    if (!settled) {
      try {
        tx.abort();
      } catch {
        /* yut */
      }
    }
    try {
      await tx.done;
    } catch {
      /* yut */
    }
    const name = (e as { name?: string })?.name;
    return { status: name === "ConstraintError" ? "exists" : "error", id, error: name };
  }
}

/** Meta yamasını mevcut değer üzerine uygular (saf; test edilebilir). */
export function applyImagePatch(
  existing: Pick<NoteImage, "caption" | "alt" | "width" | "height">,
  patch: ImageMetaPatch,
): { out: Pick<NoteImage, "caption" | "alt" | "width" | "height">; errors: string[] } {
  const out = {
    caption: existing.caption,
    alt: existing.alt,
    width: existing.width,
    height: existing.height,
  };
  const errors: string[] = [];

  for (const f of ["caption", "alt"] as const) {
    if (!(f in patch)) continue; // yok/undefined → KORU
    const v = patch[f];
    if (v === undefined) continue;
    if (v === null) {
      out[f] = null;
      continue;
    }
    if (typeof v !== "string" || v.length > 500) {
      errors.push(f);
      continue;
    }
    out[f] = v;
  }

  for (const f of ["width", "height"] as const) {
    if (!(f in patch)) continue;
    const v = patch[f];
    if (v === undefined) continue;
    if (v === null) {
      out[f] = null;
      continue;
    }
    if (!Number.isInteger(v) || v <= 0 || v > 20000) {
      errors.push(f);
      continue;
    }
    out[f] = v;
  }

  return { out, errors };
}

/**
 * Görsel meta güncellemesi — dosya alanlarına DOKUNMAZ.
 */
export async function updateImageMeta(
  id: string,
  patch: ImageMetaPatch,
  baseRevision: number,
): Promise<{ status: WriteStatus | "invalid"; revision?: number; dbRevision?: number; fields?: string[] }> {
  const db = await openNotesDb();

  // Faz 1: mevcut kaydı oku + doğrula (tx dışı okuma, sonra tek tx yazma)
  const existing = await db.get("images", id);
  if (!existing) return { status: "missing" };

  const { out, errors } = applyImagePatch(existing, patch);
  if (errors.length) return { status: "invalid", fields: errors };

  const incomingHash = await imageMetaHash(out);

  const tx = db.transaction("images", "readwrite");
  const store = tx.objectStore("images");
  let settled = false;
  try {
    const current = await store.get(id);
    if (!current) {
      await tx.done;
      settled = true;
      return { status: "missing" };
    }
    if (current.revision !== baseRevision) {
      await tx.done;
      settled = true;
      return { status: "conflict", dbRevision: current.revision };
    }
    if (current.contentHash === incomingHash) {
      await tx.done;
      settled = true;
      return { status: "identical", revision: current.revision };
    }
    const next: NoteImage = {
      ...current,
      ...out,
      revision: current.revision + 1,
      baseRevision: current.revision,
      contentHash: incomingHash,
    };
    await store.put(next);
    await tx.done;
    settled = true;
    return { status: "written", revision: next.revision };
  } catch {
    if (!settled) {
      try {
        tx.abort();
      } catch {
        /* yut */
      }
    }
    try {
      await tx.done;
    } catch {
      /* yut */
    }
    return { status: "error" };
  }
}

export async function getImage(id: string): Promise<NoteImage | undefined> {
  const db = await openNotesDb();
  return db.get("images", id);
}

export async function getImagesByNote(noteId: string): Promise<NoteImage[]> {
  const db = await openNotesDb();
  return db.getAllFromIndex("images", "noteId", noteId);
}

export async function deleteImage(id: string): Promise<{ status: WriteStatus }> {
  const db = await openNotesDb();
  try {
    await db.delete("images", id);
    releaseObjectURL(id);
    return { status: "written" };
  } catch {
    return { status: "error" };
  }
}

/** Yetim görselleri (hiçbir notta referansı olmayan) bulur. */
export async function findOrphanImageIds(validNoteIds: Set<string>): Promise<string[]> {
  const db = await openNotesDb();
  const all = await db.getAll("images");
  return all.filter((img) => !validNoteIds.has(img.noteId)).map((img) => img.id);
}

// ── ObjectURL referans sayacı ──────────────────────────────────────────────

const urlCache = new Map<string, { url: string; refs: number }>();

/** Görsel için ObjectURL alır (varsa paylaşır, refs artırır). */
export async function acquireObjectURL(imageId: string): Promise<string | null> {
  const entry = urlCache.get(imageId);
  if (entry) {
    entry.refs++;
    return entry.url;
  }
  const img = await getImage(imageId);
  if (!img) return null;
  const url = URL.createObjectURL(img.blob);
  urlCache.set(imageId, { url, refs: 1 });
  return url;
}

/** ObjectURL bırakır; yalnızca SON kullanıcı revoke eder. */
export function releaseObjectURL(imageId: string): void {
  const entry = urlCache.get(imageId);
  if (!entry) return;
  entry.refs--;
  if (entry.refs <= 0) {
    URL.revokeObjectURL(entry.url);
    urlCache.delete(imageId);
  }
}

/** Test için önbellek durumu. */
export function _urlCacheSize(): number {
  return urlCache.size;
}
