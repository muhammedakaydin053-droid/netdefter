/**
 * Notlarım ZIP yedekleme — fflate ile yazma/okuma.
 *
 * Güvenlik (Rev.3/Rev.6):
 *  - Arşiv AÇILMADAN önce metadata kontrol edilir (dosya sayısı, toplam
 *    açılmış boyut, sıkıştırma oranı, izinli yol).
 *  - `UnzipInflate` (senkron) sabittir; tüm `ondata` çağrıları `push`
 *    içinde tamamlanır.
 *  - Beyan edilen `originalSize`'a güvenilmez: gerçek birikmiş bayt sayacı
 *    beyanı aşarsa açma iptal edilir (zip bomb).
 *  - Kesin allow-list: `manifest.json`, `notes.json`, `images/<uuid>.<ext>`.
 */
import { Unzip, UnzipInflate, zipSync, strToU8, strFromU8, type Unzipped } from "fflate";
import type { NotesBackupFile } from "./types";

export const MAX_ZIP_FILES = 2000;
export const MAX_ZIP_UNCOMPRESSED = 200 * 1024 * 1024; // 200 MB
export const MAX_ZIP_RATIO = 1000; // sıkıştırma oranı üst sınırı

const ALLOWED_PATH = /^(manifest\.json|notes\.json|images\/[0-9a-f-]{36}\.(png|jpg|jpeg|webp|gif))$/;

/** Bir arşiv girdisinin yolu izinli mi? */
export function isAllowedPath(name: string): boolean {
  if (name.includes("..")) return false;
  if (name.startsWith("/")) return false;
  if (name.includes("\\")) return false;
  if (name.length > 200) return false;
  return ALLOWED_PATH.test(name);
}

/** Yedek zarfını ZIP'e çevirir (görseller base64 yerine binary). */
export function buildZip(
  manifest: Record<string, unknown>,
  notesJson: unknown,
  images: { name: string; bytes: Uint8Array }[],
): Uint8Array {
  const files: Record<string, Uint8Array> = {
    "manifest.json": strToU8(JSON.stringify(manifest, null, 2)),
    "notes.json": strToU8(JSON.stringify(notesJson, null, 2)),
  };
  for (const img of images) files[`images/${img.name}`] = img.bytes;
  return zipSync(files, { level: 6 });
}

export interface ZipReadResult {
  ok: boolean;
  error?: string;
  files?: Record<string, Uint8Array>;
}

/**
 * ZIP'i GÜVENLİ açılım: açmadan önce metadata, açarken gerçek bayt sayacı.
 */
export function readZipSecurely(data: Uint8Array): ZipReadResult {
  const out: Record<string, Uint8Array> = {};
  const active = new Set<unknown>();
  let fileCount = 0;
  let declaredTotal = 0;
  let actualTotal = 0;
  let aborted = false;
  let abortReason = "";

  const unzip = new Unzip((file) => {
    if (aborted) return;

    // ── AÇMADAN ÖNCE ──────────────────────────────────────────────
    fileCount++;
    if (fileCount > MAX_ZIP_FILES) {
      aborted = true;
      abortReason = "dosya sayısı aşıldı";
      return;
    }
    if (!isAllowedPath(file.name)) {
      aborted = true;
      abortReason = `izinsiz yol: ${file.name}`;
      return;
    }
    declaredTotal += file.originalSize ?? 0;
    if (declaredTotal > MAX_ZIP_UNCOMPRESSED) {
      aborted = true;
      abortReason = "açılmış boyut aşıldı";
      return;
    }
    // Beyan edilen oran yoksa (streaming arşiv) gerçek bayt sayacı korur.
    const declaredOriginal = file.originalSize;
    const declaredCompressed = file.size;
    if (
      declaredOriginal !== undefined &&
      declaredCompressed !== undefined &&
      declaredOriginal / Math.max(1, declaredCompressed) > MAX_ZIP_RATIO
    ) {
      aborted = true;
      abortReason = "sıkıştırma oranı şüpheli (zip bomb)";
      return;
    }

    // ── AÇARKEN: gerçek bayt sayacı ──────────────────────────────
    const chunks: Uint8Array[] = [];
    active.add(file);
    file.ondata = (err, chunk, final) => {
      if (aborted) return;
      if (err) {
        aborted = true;
        abortReason = String(err);
        active.delete(file);
        return;
      }
      chunks.push(chunk);
      actualTotal += chunk.length;
      if (actualTotal > MAX_ZIP_UNCOMPRESSED) {
        aborted = true;
        abortReason = "gerçek boyut beyanı aştı";
        active.delete(file);
        return;
      }
      if (final) {
        active.delete(file);
        let total = 0;
        for (const c of chunks) total += c.length;
        const merged = new Uint8Array(total);
        let off = 0;
        for (const c of chunks) {
          merged.set(c, off);
          off += c.length;
        }
        out[file.name] = merged;
      }
    };
    file.start();
  });

  unzip.register(UnzipInflate);
  unzip.push(data, true);

  if (aborted) return { ok: false, error: abortReason };
  if (active.size > 0) return { ok: false, error: "bekleyen akış (bozuk arşiv)" };
  if (fileCount === 0) return { ok: false, error: "arşiv boş veya geçersiz" };

  return { ok: true, files: out };
}

/** ZIP girdilerinden manifest + notes JSON'unu okur. */
export function parseZipFiles(files: Record<string, Uint8Array>): {
  ok: boolean;
  error?: string;
  manifest?: unknown;
  notes?: unknown;
  images?: { name: string; bytes: Uint8Array }[];
} {
  const manifestRaw = files["manifest.json"];
  const notesRaw = files["notes.json"];
  if (!manifestRaw || !notesRaw) return { ok: false, error: "manifest.json veya notes.json eksik" };

  let manifest: unknown;
  let notes: unknown;
  try {
    manifest = JSON.parse(strFromU8(manifestRaw));
    notes = JSON.parse(strFromU8(notesRaw));
  } catch {
    return { ok: false, error: "JSON ayrıştırılamadı" };
  }

  const images: { name: string; bytes: Uint8Array }[] = [];
  for (const [name, bytes] of Object.entries(files)) {
    if (name.startsWith("images/")) images.push({ name: name.slice("images/".length), bytes });
  }
  return { ok: true, manifest, notes, images };
}

export type { Unzipped };
export type { NotesBackupFile };
