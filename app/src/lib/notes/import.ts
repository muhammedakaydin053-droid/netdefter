/**
 * Yedek içe aktarma — ATOMİK yazma, kimlik yenileme + referans eşleme.
 *
 * Tasarım (Rev.10):
 *  - Tüm yazmalar TEK `readwrite` transaction içinde yapılır: notlar, görseller
 *    ve not içeriğindeki `imageRef` bağlantıları ya hep birlikte yazılır ya da
 *    hiçbiri yazılmaz. Böylece bozuk bir yedek yarım kayıt bırakamaz.
 *  - İçe aktarmada her nota **yeni UUID** verilir (var olan notların üzerine
 *    yazılmaz, kopya olarak eklenir). Görsellerin `noteId` bağı, notların
 *    `imageIds` dizisi ve Tiptap içeriğindeki `imageRef.imageId` referansları
 *    yeni kimliklere yeniden eşlenir.
 *  - Hiçbir nota bağlı olmayan ("yetim") veya doğrulamayı geçemeyen görsel içe
 *    alınmaz; sayısı raporlanır.
 */
import { openNotesDb } from "./db";
import { buildNote } from "./repository";
import { noteHash, imageMetaHash } from "./hash";
import { remapImageRefIds } from "./schema";
import { sniffMime } from "./images";
import type { Note, NoteImage } from "./types";
import { IMAGE_MIME_TYPES, MAX_IMAGE_BYTES } from "./types";

/** İçe aktarılacak görsel — blob hazır (JSON base64'ten, ZIP ham bayttan çözülür). */
export interface ImportImage {
  /** Yedekteki eski görsel kimliği (eşleme anahtarı). */
  id: string;
  /** Yedekteki eski not kimliği (eşleme anahtarı). */
  noteId: string;
  name: string;
  mime: string;
  blob: Blob;
  caption?: string | null;
  alt?: string | null;
  width?: number | null;
  height?: number | null;
}

export interface ImportData {
  notes: Note[];
  images: ImportImage[];
}

export interface ImportResult {
  /** Eklenen not sayısı. */
  notes: number;
  /** Eklenen görsel sayısı. */
  images: number;
  /** Notu bulunmadığı için atlanan görsel sayısı. */
  orphanImages: number;
  /** Doğrulamayı geçemediği için atlanan görsel sayısı. */
  failedImages: number;
}

/** İçe aktarma girdisinin bütünlüğünü doğrular; eksik alan varsa hata fırlatır. */
function assertImportable(data: ImportData): void {
  if (!Array.isArray(data.notes)) throw new Error("notes dizisi yok");
  if (!Array.isArray(data.images)) throw new Error("images dizisi yok");
  for (const n of data.notes) {
    if (typeof n.id !== "string" || !n.id) throw new Error("not kimliği geçersiz");
    if (typeof n.title !== "string") throw new Error(`not başlığı geçersiz: ${n.id}`);
    if (n.exam !== "TYT" && n.exam !== "AYT") throw new Error(`sınav alanı geçersiz: ${n.id}`);
    if (typeof n.subject !== "string") throw new Error(`ders alanı geçersiz: ${n.id}`);
    if (!Array.isArray(n.topics)) throw new Error(`konular dizisi geçersiz: ${n.id}`);
    if (!Array.isArray(n.imageIds)) throw new Error(`imageIds dizisi geçersiz: ${n.id}`);
    if (!Array.isArray(n.tags)) throw new Error(`etiketler dizisi geçersiz: ${n.id}`);
  }
  for (const img of data.images) {
    if (typeof img.id !== "string" || !img.id) throw new Error("görsel kimliği geçersiz");
    if (typeof img.noteId !== "string") throw new Error(`görsel not bağı geçersiz: ${img.id}`);
    if (!(img.blob instanceof Blob)) throw new Error(`görsel blob geçersiz: ${img.id}`);
  }
}

/**
 * Doğrulanmış yedek verisini ATOMİK olarak içe aktarır.
 *
 * Her şey tek transaction'da yazılır; herhangi bir adım hata verirse
 * transaction iptal edilir ve DB hiç değişmez (yarım kayıt olmaz).
 */
export async function importNotesBackup(data: ImportData): Promise<ImportResult> {
  assertImportable(data);

  const db = await openNotesDb();

  // ═══ FAZ 1: tx DIŞINDA — hash/doğrulama (crypto.subtle tx'i kapatır) ═══
  const noteRecords: Note[] = [];
  const noteIdMap = new Map<string, string>();
  for (const n of data.notes) {
    const record = await buildNote(
      {
        title: n.title,
        exam: n.exam,
        subject: n.subject,
        topics: n.topics,
        content: n.content,
        imageIds: [],
        tags: n.tags,
        favorite: n.favorite,
        pinned: n.pinned,
        archived: n.archived,
      },
      crypto.randomUUID(),
    );
    noteRecords.push(record);
    noteIdMap.set(n.id, record.id);
  }

  const imageRecords: NoteImage[] = [];
  const imageIdMap = new Map<string, string>();
  let orphanImages = 0;
  let failedImages = 0;
  for (const img of data.images) {
    const newNoteId = noteIdMap.get(img.noteId);
    if (!newNoteId) {
      orphanImages++;
      continue;
    }
    if (img.blob.size > MAX_IMAGE_BYTES) {
      failedImages++;
      continue;
    }
    const sniffed = await sniffMime(img.blob);
    if (!sniffed || !IMAGE_MIME_TYPES.includes(sniffed)) {
      failedImages++;
      continue;
    }
    const id = crypto.randomUUID();
    const caption = img.caption ?? null;
    const alt = img.alt ?? null;
    const width = img.width ?? null;
    const height = img.height ?? null;
    imageRecords.push({
      id,
      noteId: newNoteId,
      name: img.name,
      mime: sniffed,
      size: img.blob.size,
      blob: img.blob,
      caption,
      alt,
      width,
      height,
      revision: 1,
      baseRevision: 0,
      contentHash: await imageMetaHash({ caption, alt, width, height }),
      createdAt: new Date().toISOString(),
    });
    imageIdMap.set(img.id, id);
  }

  // `imageIds` + içerikteki `imageRef` bağlarını yeni kimliklere göre kur.
  for (let i = 0; i < data.notes.length; i++) {
    const src = data.notes[i];
    const record = noteRecords[i];
    const mappedIds = src.imageIds
      .map((old) => imageIdMap.get(old))
      .filter((x): x is string => typeof x === "string");
    const mappedContent = remapImageRefIds(src.content, imageIdMap) as Note["content"];
    const remapped: Note = { ...record, imageIds: mappedIds, content: mappedContent };
    remapped.contentHash = await noteHash({
      title: remapped.title,
      exam: remapped.exam,
      subject: remapped.subject,
      topics: remapped.topics,
      content: remapped.content,
    });
    noteRecords[i] = remapped;
  }

  // ═══ FAZ 2: TEK transaction — ya hepsi ya hiçbiri ═══
  const tx = db.transaction(["notes", "images"], "readwrite");
  let settled = false;
  try {
    for (const rec of noteRecords) await tx.objectStore("notes").add(rec);
    for (const rec of imageRecords) await tx.objectStore("images").add(rec);
    await tx.done;
    settled = true;
  } catch (e) {
    if (!settled) {
      try {
        tx.abort();
      } catch {
        /* abort kendi hatası asıl hatayı maskelemesin */
      }
    }
    try {
      await tx.done;
    } catch {
      /* unhandled rejection yok */
    }
    throw e;
  }

  return {
    notes: noteRecords.length,
    images: imageRecords.length,
    orphanImages,
    failedImages,
  };
}
