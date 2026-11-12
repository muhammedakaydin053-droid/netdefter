/**
 * Yedekleme testleri — JSON zarfı, görsel round-trip, bozuk dosya koruması.
 *
 * `vite` ile yüklenir (uzantısız göreli import'lar + `@/data` takma adı).
 */
import "fake-indexeddb/auto";
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type ViteDevServer } from "vite";

let server: ViteDevServer;
let B: any;

before(async () => {
  server = await createServer({ server: { middlewareMode: true }, logLevel: "silent" });
  B = await server.ssrLoadModule("/src/lib/notes/backup.ts");
});

after(async () => {
  await server?.close();
});

const doc = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "x" }] }] };

function sampleNote(over: Record<string, unknown> = {}) {
  return {
    id: "n1",
    title: "Not",
    exam: "TYT",
    subject: "Matematik",
    topics: ["Türev"],
    content: doc,
    imageIds: ["i1"],
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
    ...over,
  };
}

function sampleImage() {
  return {
    id: "i1",
    noteId: "n1",
    name: "a.png",
    mime: "image/png",
    size: 12,
    blob: new Blob([new Uint8Array([...new Array(12).fill(9)])], { type: "image/png" }),
    caption: "açıklama",
    alt: null,
    width: 100,
    height: 50,
    revision: 1,
    baseRevision: 0,
    contentHash: "ih",
    createdAt: "2026-11-01T00:00:00.000Z",
  };
}

describe("blobToDataUrl / dataUrlToBlob", () => {
  it("round-trip içeriği korur", async () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4, 5]);
    const blob = new Blob([bytes], { type: "image/png" });
    const url = await B.blobToDataUrl(blob);
    assert.ok(url.startsWith("data:image/png;base64,"));
    const back = B.dataUrlToBlob(url);
    const backBytes = new Uint8Array(await back.arrayBuffer());
    assert.deepEqual([...backBytes], [...bytes]);
  });
});

describe("buildNotesBackup / parseNotesBackup", () => {
  it("not + görselleri eksiksiz serileştirir", async () => {
    const file = await B.buildNotesBackup([sampleNote()], [sampleImage()]);
    assert.equal(file.format, "netdefter-notes-backup");
    assert.equal(file.version, 1);
    assert.equal(file.app, "NetDefter");
    assert.equal(file.data.notes.length, 1);
    assert.equal(file.data.images.length, 1);
    assert.ok(file.data.images[0].dataUrl.startsWith("data:image/png"));
  });

  it("geçerli yedeği ayrıştırır", async () => {
    const file = await B.buildNotesBackup([sampleNote()], [sampleImage()]);
    const parsed = B.parseNotesBackup(JSON.parse(JSON.stringify(file)));
    assert.equal(parsed.ok, true);
    assert.equal(parsed.data.notes.length, 1);
    assert.equal(parsed.data.images.length, 1);
  });

  it("yanlış formatı reddeder (veriye dokunulmaz)", () => {
    const r = B.parseNotesBackup({ format: "baska", version: 1, data: { notes: [] } });
    assert.equal(r.ok, false);
    assert.ok(r.error);
  });

  it("desteklenmeyen sürümü reddeder", () => {
    const r = B.parseNotesBackup({ format: "netdefter-notes-backup", version: 99, data: { notes: [] } });
    assert.equal(r.ok, false);
  });

  it("bozuk notu atlar (skippedNotes), süreci çökertmez", async () => {
    const file = await B.buildNotesBackup([sampleNote()], []);
    (file.data.notes as unknown[]).push({ id: "bad", title: "x", exam: "TYT", subject: "y", topics: [], content: { type: "evil" } });
    const parsed = B.parseNotesBackup(JSON.parse(JSON.stringify(file)));
    assert.equal(parsed.ok, true);
    assert.equal(parsed.data.notes.length, 1);
    assert.equal(parsed.skippedNotes, 1);
  });

  it("dizi/nesne olmayan değerleri güvenle eler", () => {
    assert.equal(B.parseNotesBackup(null).ok, false);
    assert.equal(B.parseNotesBackup([]).ok, false);
    assert.equal(B.parseNotesBackup("metin").ok, false);
  });
});
