/**
 * Yedek içe aktarma — kimlik yenileme + referans eşleme.
 *
 * Tasarım (Rev.3/Rev.7): içe aktarmada her nota **yeni UUID** verilir (var olan
 * notların üzerine yazılmaz, kopya olarak eklenir). Bu yüzden:
 *  - görsellerin `noteId` bağı yeni not kimliğine,
 *  - notların `imageIds` referansları yeni görsel kimliklerine
 * yeniden eşlenir. Aksi hâlde görseller sahipsiz kalır ve notlardaki görsel
 * bağlantıları kopar.
 *
 * Hiçbir nota bağlı olmayan ("yetim") veya doğrulamayı geçemeyen görsel içe
 * alınmaz; sayısı raporlanır.
 */
import type { Note } from "./types";
import { createNote, getNote, saveNote } from "./repository";
import { createImage } from "./images";

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

/**
 * Doğrulanmış yedek verisini içe aktarır.
 *
 * Çağıran, "Değiştir" modunda ilgili store'ları ÖNCEDEN temizlemiş olmalıdır;
 * bu fonksiyon yalnızca ekler, silmez.
 */
export async function importNotesBackup(data: ImportData): Promise<ImportResult> {
  // 1) Notlar: yeni UUID ile ekle; eski → yeni kimlik haritasını kur.
  const noteIdMap = new Map<string, string>();
  for (const n of data.notes) {
    const { note } = await createNote({
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
    });
    noteIdMap.set(n.id, note.id);
  }

  // 2) Görseller: not bağı yeni kimliğe eşlenir; yetim görsel atlanır.
  const imageIdMap = new Map<string, string>();
  let orphanImages = 0;
  let failedImages = 0;
  for (const img of data.images) {
    const newNoteId = noteIdMap.get(img.noteId);
    if (!newNoteId) {
      orphanImages++;
      continue;
    }
    const res = await createImage({
      noteId: newNoteId,
      name: img.name,
      mime: img.mime,
      blob: img.blob,
      caption: img.caption ?? null,
      alt: img.alt ?? null,
      width: img.width ?? null,
      height: img.height ?? null,
    });
    if (res.status === "created" && res.id) imageIdMap.set(img.id, res.id);
    else failedImages++;
  }

  // 3) Notların `imageIds` referanslarını yeni görsel kimliklerine bağla.
  for (const n of data.notes) {
    if (n.imageIds.length === 0) continue;
    const newNoteId = noteIdMap.get(n.id);
    if (!newNoteId) continue;
    const mapped = n.imageIds
      .map((old) => imageIdMap.get(old))
      .filter((x): x is string => typeof x === "string");
    if (mapped.length === 0) continue;
    const current = await getNote(newNoteId);
    if (!current) continue;
    await saveNote({ ...current, imageIds: mapped }, current.revision);
  }

  return { notes: noteIdMap.size, images: imageIdMap.size, orphanImages, failedImages };
}
