/**
 * Not deposu testleri — gerçek IndexedDB davranışı (`fake-indexeddb`).
 *
 * `vite` ile yüklenir çünkü veri katmanı uzantısız göreli import'lar kullanır
 * (`./db`, `./hash`); `node --test` bunları doğrudan çözemez.
 *
 * Kritik iddialar: atomik yazma, `!==` revision guard, çakışmada veri
 * kaybının önlenmesi (yedek kopya) ve cascade silme.
 */
import "fake-indexeddb/auto";
import { describe, it, beforeEach, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type ViteDevServer } from "vite";

let server: ViteDevServer;
let db: any;
let repo: any;
let images: any;
let schema: any;

before(async () => {
  server = await createServer({ server: { middlewareMode: true }, logLevel: "silent" });
  db = await server.ssrLoadModule("/src/lib/notes/db.ts");
  repo = await server.ssrLoadModule("/src/lib/notes/repository.ts");
  images = await server.ssrLoadModule("/src/lib/notes/images.ts");
  schema = await server.ssrLoadModule("/src/lib/notes/schema.ts");
});

after(async () => {
  await server?.close();
});

async function freshDb() {
  // `deleteDatabase` açık bağlantıyı kapatmayı gerektirir ve idb'de sızan
  // AbortError üretir. Bunun yerine store'ları boşaltmak yeterli ve temiz.
  const handle = await db.openNotesDb();
  const tx = handle.transaction(["notes", "images", "meta"], "readwrite");
  tx.objectStore("notes").clear();
  tx.objectStore("images").clear();
  tx.objectStore("meta").clear();
  await tx.done;
  return handle;
}

function baseInput(over: Record<string, unknown> = {}) {
  return {
    title: "Türev notu",
    exam: "TYT" as const,
    subject: "Matematik",
    topics: ["Türev"],
    content: schema.emptyDoc(),
    ...over,
  };
}

describe("repository — temel CRUD", () => {
  beforeEach(async () => {
    await freshDb();
  });

  it("not oluşturur ve okur", async () => {
    const { status, note } = await repo.createNote(baseInput());
    assert.equal(status, "written");
    const got = await repo.getNote(note.id);
    assert.equal(got?.title, "Türev notu");
    assert.equal(got?.revision, 1);
    assert.ok(got?.contentHash);
  });

  it("aynı id ile ikinci add yazmaz (ConstraintError)", async () => {
    const { note } = await repo.createNote(baseInput());
    const handle = await db.openNotesDb();
    const direct = await new Promise<string>((resolve) => {
      const tx = handle.transaction("notes", "readwrite");
      // ConstraintError hem add'i hem tx.done'u reddeder; ikisini de yakala,
      // aksi hâlde tx.done unhandled rejection olur.
      tx.done.catch(() => {});
      tx.store.add({ ...note }).then(
        () => resolve("ok"),
        (e: { name?: string }) => resolve(e?.name ?? "err"),
      );
    });
    assert.equal(direct, "ConstraintError");
    const got = await repo.getNote(note.id);
    assert.equal(got?.title, "Türev notu");
  });

  it("saveNote revision'ı artırır", async () => {
    const { note } = await repo.createNote(baseInput());
    const r1 = await repo.saveNote({ ...note, title: "Güncellendi" }, note.revision);
    assert.equal(r1.status, "written");
    assert.equal(r1.revision, 2);
    const got = await repo.getNote(note.id);
    assert.equal(got?.title, "Güncellendi");
  });

  it("aynı içerik → identical (kaydetmez)", async () => {
    const { note } = await repo.createNote(baseInput());
    const r = await repo.saveNote(note, note.revision);
    assert.equal(r.status, "identical");
  });

  it("bayat revision → conflict ve HİÇBİR alan değişmez", async () => {
    const { note } = await repo.createNote(baseInput());
    await repo.saveNote({ ...note, title: "v2" }, note.revision); // rev 2
    const stale = { ...note, title: "bayat", revision: 1 };
    const r = await repo.saveNote(stale, 1);
    assert.equal(r.status, "conflict");
    assert.equal(r.dbRevision, 2);
    const got = await repo.getNote(note.id);
    assert.equal(got?.title, "v2");
    assert.equal(got?.revision, 2);
  });

  it("DB rev < baseRev → conflict (eşitlik guard'ı yakalar)", async () => {
    const { note } = await repo.createNote(baseInput());
    const r = await repo.saveNote({ ...note, title: "x" }, note.revision + 5);
    assert.equal(r.status, "conflict");
  });

  it("expectedRevision verilmiş ama kayıt yoksa 'missing' döner, YENİDEN OLUŞTURMAZ (H1)", async () => {
    const { note } = await repo.createNote(baseInput());
    // Başka bir sekme notu kalıcı olarak sildi.
    await repo.purgeNote(note.id);

    // Bu sekme hâlâ eski revision ile güncelleme deniyor.
    const r = await repo.saveNote({ ...note, title: "diriltme denemesi" }, note.revision);
    assert.equal(r.status, "missing", "güncelleme yolu silinen notu diriltmemeli");
    assert.equal(await repo.getNote(note.id), undefined, "kayıt oluşmamalı");
    assert.equal((await repo.listNotes()).length, 0, "hiç not kalmamalı");
  });

  it("expectedRevision verilmemişse yeni kayıt oluşturur (upsert korunur)", async () => {
    const { note } = await repo.createNote(baseInput());
    await repo.purgeNote(note.id);
    // create/upsert yolu (expectedRevision yok) hâlâ yazabilir.
    const r = await repo.saveNote({ ...note, title: "upsert" });
    assert.equal(r.status, "written");
    assert.equal((await repo.getNote(note.id))?.title, "upsert");
  });
});

describe("repository — soft delete / restore / purge", () => {
  beforeEach(async () => {
    await freshDb();
  });

  it("soft delete → deletedAt dolar, restore temizler", async () => {
    const { note } = await repo.createNote(baseInput());
    await repo.softDeleteNote(note.id);
    assert.ok((await repo.getNote(note.id))?.deletedAt);
    await repo.restoreNote(note.id);
    assert.equal((await repo.getNote(note.id))?.deletedAt, null);
  });

  it("purge notu ve bağlı görsellerini TEK işlemde siler", async () => {
    const { note } = await repo.createNote(baseInput());
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    const blob = new Blob([bytes], { type: "image/png" });
    await images.createImage({ noteId: note.id, name: "a.png", mime: "image/png", blob });
    assert.equal((await images.getImagesByNote(note.id)).length, 1);
    await repo.purgeNote(note.id);
    assert.equal(await repo.getNote(note.id), undefined);
    assert.equal((await images.getImagesByNote(note.id)).length, 0);
  });
});

describe("repository — çakışma çözümü (Rev.8)", () => {
  beforeEach(async () => {
    await freshDb();
  });

  it("keepLocal: DB sürümünü yeni UUID ile yedekler, yereli ilerletir", async () => {
    const { note } = await repo.createNote(baseInput());
    await repo.saveNote({ ...note, title: "diğer sekme" }, note.revision); // rev 2

    const local = { ...note, title: "yerel", revision: 1 };
    const r = await repo.resolveConflictKeepLocal(local);
    assert.equal(r.status, "written");
    // DB'deki sürüm (rev 2) korunur, yerel onun üzerine rev 3 olur.
    assert.equal(r.revision, 3);

    const all = await repo.listNotes();
    assert.equal(all.length, 2);
    const kept = all.find((n: any) => n.id === note.id);
    assert.equal(kept?.title, "yerel");
    const backup = all.find((n: any) => n.id === r.backupId);
    assert.match(backup?.title ?? "", /Çakışma kopyası/);
    assert.equal(backup?.archived, true);
  });

  it("keepDb: yereli arşiv kopyası yapar, DB sürümünü korur", async () => {
    const { note } = await repo.createNote(baseInput());
    await repo.saveNote({ ...note, title: "diğer sekme" }, note.revision);

    const local = { ...note, title: "yerel", revision: 1 };
    const r = await repo.resolveConflictKeepDb(local);
    assert.equal(r.status, "written");

    const all = await repo.listNotes();
    const kept = all.find((n: any) => n.id === note.id);
    assert.equal(kept?.title, "diğer sekme");
    assert.ok(all.some((n: any) => /Çakışma kopyası/.test(n.title)));
  });
});
