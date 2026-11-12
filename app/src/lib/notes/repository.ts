/**
 * Not deposu — atomik yazma ve çakışma yönetimi.
 *
 * Tasarım kuralları (Rev.7–9, gerçek testlerle doğrulandı):
 *  - Hash hesaplaması transaction DIŞINDA (crypto.subtle tx'i kapatır).
 *  - Yazma TEK `readwrite` transaction içinde: oku → karşılaştır → yaz.
 *    IndexedDB aynı store üzerinde readwrite tx'leri serileştirir, bu yüzden
 *    iki sekme asla iç içe geçemez.
 *  - Revision guard EŞİTLİK (`!==`) esaslı; `>` yalnızca olsaydı DB rev <
 *    baseRev durumunu kaçırıp yanlışlıkla yazardı.
 *  - `tx.abort()` `settled` bayrağıyla sarılır; aksi hâlde abort'un kendi
 *    hatası asıl hatayı maskeler.
 */
import { openNotesDb } from "./db";
import { noteHash } from "./hash";
import type { Note, WriteStatus } from "./types";

export const NOTE_SCHEMA_VERSION = 1;

export interface NoteInput {
  title: string;
  exam: "TYT" | "AYT";
  subject: string;
  topics: string[];
  content: Note["content"];
  imageIds?: string[];
  tags?: Note["tags"];
  favorite?: boolean;
  pinned?: boolean;
  archived?: boolean;
}

function nowIso(): string {
  return new Date().toISOString();
}

function newId(): string {
  return crypto.randomUUID();
}

/** Not gövdesini (hash kaynağı) verilen alanlardan üretir. */
function bodyOf(n: {
  title: string;
  exam: string;
  subject: string;
  topics: string[];
  content: unknown;
}) {
  return { title: n.title, exam: n.exam, subject: n.subject, topics: n.topics, content: n.content };
}

/**
 * İki kaydın kullanıcıya görünen tüm alanlarda aynı olup olmadığı.
 *
 * Hash yalnızca içeriği kapsar; favori/arşiv/çöp gibi meta değişiklikleri
 * hash'i değiştirmez. Bu yüzden "identical" kararı için meta da karşılaştırılır.
 */
function isSameRecord(a: Note, b: Note): boolean {
  return (
    a.title === b.title &&
    a.exam === b.exam &&
    a.subject === b.subject &&
    JSON.stringify(a.topics) === JSON.stringify(b.topics) &&
    JSON.stringify(a.content) === JSON.stringify(b.content) &&
    JSON.stringify(a.imageIds) === JSON.stringify(b.imageIds) &&
    JSON.stringify(a.tags) === JSON.stringify(b.tags) &&
    a.favorite === b.favorite &&
    a.pinned === b.pinned &&
    a.archived === b.archived &&
    a.deletedAt === b.deletedAt
  );
}

/** Yeni not nesnesi (henüz yazılmadı). `id` verilmezse yeni UUID üretilir. */
export async function buildNote(input: NoteInput, id: string = newId()): Promise<Note> {
  const base = {
    id,
    title: input.title,
    exam: input.exam,
    subject: input.subject,
    topics: [...input.topics],
    content: input.content,
    imageIds: [...(input.imageIds ?? [])],
    tags: [...(input.tags ?? [])],
    favorite: input.favorite ?? false,
    pinned: input.pinned ?? false,
    archived: input.archived ?? false,
    deletedAt: null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    revision: 1,
    baseRevision: 0,
    contentHash: "",
    schemaVersion: NOTE_SCHEMA_VERSION,
  } satisfies Note;
  base.contentHash = await noteHash(bodyOf(base));
  return base;
}

/**
 * Notu yazar (varsa günceller). Tek atomik transaction.
 *
 * `expectedRevision` verilirse eşitlik guard'ı uygulanır; DB'deki revision
 * farklıysa `conflict` döner ve HİÇBİR alan değişmez.
 */
export async function saveNote(
  note: Note,
  expectedRevision?: number,
): Promise<{ status: WriteStatus; revision?: number; dbRevision?: number }> {
  // ═══ FAZ 1: tx DIŞINDA — hash hesapları ═══
  const incomingHash = await noteHash(bodyOf(note));
  const record: Note = { ...note, contentHash: incomingHash, updatedAt: nowIso() };

  const db = await openNotesDb();
  const tx = db.transaction("notes", "readwrite");
  const store = tx.objectStore("notes");
  let settled = false;
  try {
    const current = await store.get(note.id);

    if (expectedRevision !== undefined && current && current.revision !== expectedRevision) {
      await tx.done;
      settled = true;
      return { status: "conflict", dbRevision: current.revision };
    }
    // "identical" yalnızca içerik VE tüm meta alanları aynıysa; aksi hâlde
    // soft delete / favori / arşiv gibi meta değişiklikleri yazılmazdı.
    if (current && current.contentHash === incomingHash && isSameRecord(current, record)) {
      await tx.done;
      settled = true;
      return { status: "identical", revision: current.revision };
    }

    const nextRevision = current ? current.revision + 1 : 1;
    const finalRecord: Note = {
      ...record,
      revision: nextRevision,
      baseRevision: current ? current.revision : 0,
    };
    await store.put(finalRecord);
    await tx.done;
    settled = true;
    return { status: "written", revision: nextRevision };
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
    return { status: "error" };
  }
}

/**
 * Yeni not ekler — `add()` ile (atomik; aynı id varsa yazmaz).
 */
export async function createNote(input: NoteInput): Promise<{ status: WriteStatus; note: Note }> {
  const note = await buildNote(input);
  const db = await openNotesDb();
  const tx = db.transaction("notes", "readwrite");
  let settled = false;
  try {
    await tx.store.add(note);
    await tx.done;
    settled = true;
    return { status: "written", note };
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
    return { status: name === "ConstraintError" ? "conflict" : "error", note };
  }
}

export async function getNote(id: string): Promise<Note | undefined> {
  const db = await openNotesDb();
  return db.get("notes", id);
}

export async function listNotes(): Promise<Note[]> {
  const db = await openNotesDb();
  return db.getAll("notes");
}

/** Soft delete — `deletedAt` damgası + yeni revision. */
export async function softDeleteNote(id: string): Promise<{ status: WriteStatus }> {
  return patchNote(id, (n) => ({ ...n, deletedAt: nowIso() }));
}

/** Çöp kutusundan geri al. */
export async function restoreNote(id: string): Promise<{ status: WriteStatus }> {
  return patchNote(id, (n) => ({ ...n, deletedAt: null }));
}

/**
 * Kalıcı sil — notu ve bağlı görsellerini TEK transaction'da siler
 * (yetim blob kalmaz).
 */
export async function purgeNote(id: string): Promise<{ status: WriteStatus }> {
  const db = await openNotesDb();
  const tx = db.transaction(["notes", "images"], "readwrite");
  let settled = false;
  try {
    const images = await tx.objectStore("images").index("noteId").getAllKeys(id);
    for (const key of images) await tx.objectStore("images").delete(key);
    await tx.objectStore("notes").delete(id);
    await tx.done;
    settled = true;
    return { status: "written" };
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

/** Notu id ile bulup bir dönüştürücü uygular; atomik yazar. */
async function patchNote(
  id: string,
  mutate: (n: Note) => Note,
): Promise<{ status: WriteStatus }> {
  const db = await openNotesDb();
  const existing = await db.get("notes", id);
  if (!existing) return { status: "missing" };
  const mutated = mutate(existing);
  const res = await saveNote(mutated, existing.revision);
  return { status: res.status };
}

/**
 * Çakışma çözümü — "yereli koru" (Rev.8).
 *
 * DB'deki (diğer sekmenin) sürümü YENİ UUID ile arşiv kopyası olarak saklanır;
 * yerel sürüm orijinal id ile ilerletilir. İkisi de tek transaction'da.
 */
export async function resolveConflictKeepLocal(
  local: Note,
): Promise<{ status: WriteStatus; backupId?: string; revision?: number }> {
  const localHash = await noteHash(bodyOf(local));

  const db = await openNotesDb();
  const tx = db.transaction("notes", "readwrite");
  const store = tx.objectStore("notes");
  let settled = false;
  try {
    const existing = await store.get(local.id);
    if (!existing) {
      await tx.done;
      settled = true;
      return { status: "missing" };
    }

    const backupId = newId();
    const backup: Note = {
      ...existing,
      id: backupId,
      title: `[Çakışma kopyası] ${existing.title}`,
      archived: true,
      deletedAt: null,
      revision: 1,
      baseRevision: 0,
      updatedAt: nowIso(),
    };
    const localRecord: Note = {
      ...local,
      revision: existing.revision + 1,
      baseRevision: existing.revision,
      contentHash: localHash,
      updatedAt: nowIso(),
    };

    await store.put(backup);
    await store.put(localRecord);
    await tx.done;
    settled = true;
    return { status: "written", backupId, revision: localRecord.revision };
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

/**
 * Çakışma çözümü — "DB sürümünü yükle" (yereli bırak).
 *
 * Yerel değişiklik bir kopya olarak arşivlenir; DB sürümü dokunulmadan kalır.
 */
export async function resolveConflictKeepDb(
  local: Note,
): Promise<{ status: WriteStatus; backupId?: string }> {
  const localHash = await noteHash(bodyOf(local));

  const db = await openNotesDb();
  const tx = db.transaction("notes", "readwrite");
  const store = tx.objectStore("notes");
  let settled = false;
  try {
    const existing = await store.get(local.id);
    if (!existing) {
      await tx.done;
      settled = true;
      return { status: "missing" };
    }
    const backupId = newId();
    const localCopy: Note = {
      ...local,
      id: backupId,
      title: `[Çakışma kopyası] ${local.title}`,
      archived: true,
      deletedAt: null,
      revision: 1,
      baseRevision: 0,
      contentHash: localHash,
      updatedAt: nowIso(),
    };
    await store.put(localCopy);
    await tx.done;
    settled = true;
    return { status: "written", backupId };
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
