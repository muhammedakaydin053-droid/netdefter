/**
 * İçe aktarma testleri — kimlik yenileme ve görsel referans eşlemesi.
 *
 * Kanıtlanan davranış: içe aktarmada notlar yeni UUID alır; görsellerin
 * `noteId` bağı ve notların `imageIds` referansları yeni kimliklere eşlenir;
 * yetim görsel alınmaz; doğrulanamayan görsel alınmaz.
 *
 * `vite` ile yüklenir (uzantısız göreli import'lar + `@/` takma adı).
 */
import "fake-indexeddb/auto";
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type ViteDevServer } from "vite";

let server: ViteDevServer;
let I: any;
let R: any;
let IMG: any;

before(async () => {
  server = await createServer({ server: { middlewareMode: true }, logLevel: "silent" });
  I = await server.ssrLoadModule("/src/lib/notes/import.ts");
  R = await server.ssrLoadModule("/src/lib/notes/repository.ts");
  IMG = await server.ssrLoadModule("/src/lib/notes/images.ts");
});

after(async () => {
  await server?.close();
});

const doc = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "x" }] }] };

function backupNote(id: string, imageIds: string[]) {
  return {
    id,
    title: "Not",
    exam: "TYT",
    subject: "Matematik",
    topics: ["Türev"],
    content: doc,
    imageIds,
    tags: [],
    favorite: false,
    pinned: false,
    archived: false,
    deletedAt: null,
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
    revision: 1,
    baseRevision: 0,
    contentHash: "h",
    schemaVersion: 1,
  };
}

const PNG_HEAD = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
function pngBlob(): Blob {
  return new Blob([new Uint8Array([...PNG_HEAD, 1, 2, 3, 4])], { type: "image/png" });
}

function backupImage(id: string, noteId: string, blob: Blob = pngBlob()) {
  return { id, noteId, name: `${id}.png`, mime: "image/png", blob };
}

describe("importNotesBackup — kimlik yenileme + referans eşleme", () => {
  it("notlara yeni UUID verir, görsel bağlarını ve imageIds'i yeniden eşler", async () => {
    const res = await I.importNotesBackup({
      notes: [backupNote("old-note", ["old-img-1", "old-img-2"])],
      images: [backupImage("old-img-1", "old-note"), backupImage("old-img-2", "old-note")],
    });

    assert.equal(res.notes, 1);
    assert.equal(res.images, 2);
    assert.equal(res.orphanImages, 0);

    const notes = await R.listNotes();
    assert.equal(notes.length, 1);
    const note = notes[0];
    assert.notEqual(note.id, "old-note", "yedekteki ID kullanılmamalı");

    // Not iki görsele referans vermeli; referanslar DB'de GERÇEKTEN var olmalı.
    assert.equal(note.imageIds.length, 2, "imageIds eşlenmeli (kaybolmamalı)");
    const byNote = await IMG.getImagesByNote(note.id);
    assert.equal(byNote.length, 2, "görseller yeni not kimliğine bağlanmalı");
    const dbIds = new Set(byNote.map((i: any) => i.id));
    for (const iid of note.imageIds) {
      assert.ok(dbIds.has(iid), `imageIds öğesi ${iid} gerçek görsele işaret etmeli`);
    }
  });

  it("yetim görseli (notu yok) içe almaz ve sayar", async () => {
    const res = await I.importNotesBackup({
      notes: [backupNote("n2", [])],
      images: [backupImage("orphan-img", "bilinmeyen-not")],
    });
    assert.equal(res.notes, 1);
    assert.equal(res.images, 0);
    assert.equal(res.orphanImages, 1);
  });

  it("doğrulanamayan görseli içe almaz ve sayar", async () => {
    const bad = new Blob([new Uint8Array([1, 2, 3, 4])], { type: "image/png" });
    const res = await I.importNotesBackup({
      notes: [backupNote("n3", ["bad-img"])],
      images: [backupImage("bad-img", "n3", bad)],
    });
    assert.equal(res.images, 0);
    assert.equal(res.failedImages, 1);
  });
});
