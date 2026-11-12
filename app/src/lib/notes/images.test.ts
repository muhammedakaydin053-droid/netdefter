/**
 * Görsel katmanı testleri — write-once, meta patch politikası, revision
 * guard ve ObjectURL ref sayacı.
 *
 * `vite` ile yüklenir (uzantısız göreli import'lar).
 */
import "fake-indexeddb/auto";
import { describe, it, beforeEach, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type ViteDevServer } from "vite";

let server: ViteDevServer;
let db: any;
let images: any;

before(async () => {
  server = await createServer({ server: { middlewareMode: true }, logLevel: "silent" });
  db = await server.ssrLoadModule("/src/lib/notes/db.ts");
  images = await server.ssrLoadModule("/src/lib/notes/images.ts");
});

after(async () => {
  await server?.close();
});

const PNG_HEAD = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
function pngBlob(extra = 4): Blob {
  const bytes = new Uint8Array([...PNG_HEAD, ...new Array(extra).fill(7)]);
  return new Blob([bytes], { type: "image/png" });
}

async function freshDb() {
  const handle = await db.openNotesDb();
  const tx = handle.transaction(["notes", "images", "meta"], "readwrite");
  tx.objectStore("notes").clear();
  tx.objectStore("images").clear();
  tx.objectStore("meta").clear();
  await tx.done;
  return handle;
}

describe("createImage — write-once", () => {
  beforeEach(async () => {
    await freshDb();
  });

  it("gerçek Blob'u kaydeder ve blob.size'ı doğru okur", async () => {
    const blob = pngBlob(100);
    const r = await images.createImage({ noteId: "n1", name: "a.png", mime: "image/png", blob });
    assert.equal(r.status, "created");
    const got = await images.getImage(r.id);
    assert.equal(got.size, blob.size);
    assert.ok(got.blob instanceof Blob);
    assert.equal(got.blob.size, blob.size);
  });

  it("magic-byte uyuşmazlığını reddeder", async () => {
    const fake = new Blob([new Uint8Array([1, 2, 3, 4])], { type: "image/png" });
    const r = await images.createImage({ noteId: "n1", name: "x.png", mime: "image/png", blob: fake });
    assert.equal(r.status, "invalid");
  });

  it("boyut sınırını aşan görseli reddeder", async () => {
    const big = new Blob([new Uint8Array([...PNG_HEAD])], { type: "image/png" });
    Object.defineProperty(big, "size", { value: 6 * 1024 * 1024 });
    const r = await images.createImage({ noteId: "n1", name: "big.png", mime: "image/png", blob: big });
    assert.equal(r.status, "invalid");
  });

  it("aynı id ile ikinci add → exists, orijinal dokunulmaz", async () => {
    const blob = pngBlob(10);
    const r1 = await images.createImage({ noteId: "n1", name: "a.png", mime: "image/png", blob });
    const handle = await db.openNotesDb();
    const direct = await new Promise<string>((resolve) => {
      const tx = handle.transaction("images", "readwrite");
      tx.done.catch(() => {});
      tx.store.add({
        id: r1.id,
        noteId: "hack",
        name: "hack.png",
        mime: "image/png",
        size: 999,
        blob: pngBlob(999),
        caption: null,
        alt: null,
        width: null,
        height: null,
        revision: 1,
        baseRevision: 0,
        contentHash: "x",
        createdAt: new Date().toISOString(),
      }).then(
        () => resolve("ok"),
        (e: { name?: string }) => resolve(e?.name ?? "err"),
      );
    });
    assert.equal(direct, "ConstraintError");
    const got = await images.getImage(r1.id);
    assert.equal(got.name, "a.png");
    assert.equal(got.noteId, "n1");
  });
});

describe("applyImagePatch — alan politikası", () => {
  it("undefined = KORU", () => {
    const r = images.applyImagePatch(
      { caption: "X", alt: "A", width: 10, height: 20 },
      { caption: undefined },
    );
    assert.equal(r.out.caption, "X");
    assert.equal(r.errors.length, 0);
  });

  it("null = TEMİZLE", () => {
    const r = images.applyImagePatch(
      { caption: "X", alt: "A", width: 10, height: 20 },
      { caption: null },
    );
    assert.equal(r.out.caption, null);
    assert.equal(r.errors.length, 0);
  });

  it("yok = KORU", () => {
    const r = images.applyImagePatch({ caption: "X", alt: null, width: null, height: null }, {});
    assert.equal(r.out.caption, "X");
  });

  it("geçersiz tip/aralık = REDDET", () => {
    assert.deepEqual(images.applyImagePatch({ caption: "X", alt: null, width: null, height: null }, { caption: 123 }).errors, ["caption"]);
    assert.deepEqual(images.applyImagePatch({ caption: null, alt: null, width: null, height: null }, { width: -5 }).errors, ["width"]);
    assert.deepEqual(images.applyImagePatch({ caption: null, alt: null, width: null, height: null }, { width: 1.5 }).errors, ["width"]);
  });
});

describe("updateImageMeta", () => {
  beforeEach(async () => {
    await freshDb();
  });

  it("meta güncellenir, blob DOKUNULMAZ, revision artar", async () => {
    const blob = pngBlob(50);
    const r = await images.createImage({ noteId: "n1", name: "a.png", mime: "image/png", blob, caption: "ilk" });
    const up = await images.updateImageMeta(r.id, { caption: "yeni" }, 1);
    assert.equal(up.status, "written");
    assert.equal(up.revision, 2);
    const got = await images.getImage(r.id);
    assert.equal(got.caption, "yeni");
    assert.equal(got.blob.size, blob.size);
  });

  it("bayat baseRevision → conflict, alan değişmez", async () => {
    const r = await images.createImage({ noteId: "n1", name: "a.png", mime: "image/png", blob: pngBlob(5) });
    await images.updateImageMeta(r.id, { caption: "v2" }, 1);
    const conflict = await images.updateImageMeta(r.id, { caption: "bayat" }, 1);
    assert.equal(conflict.status, "conflict");
    assert.equal(conflict.dbRevision, 2);
    assert.equal((await images.getImage(r.id)).caption, "v2");
  });

  it("DB rev < baseRev → conflict (eşitlik guard'ı)", async () => {
    const r = await images.createImage({ noteId: "n1", name: "a.png", mime: "image/png", blob: pngBlob(5) });
    const c = await images.updateImageMeta(r.id, { caption: "x" }, 9);
    assert.equal(c.status, "conflict");
  });

  it("geçersiz alan → invalid", async () => {
    const r = await images.createImage({ noteId: "n1", name: "a.png", mime: "image/png", blob: pngBlob(5) });
    const c = await images.updateImageMeta(r.id, { width: -1 }, 1);
    assert.equal(c.status, "invalid");
    assert.deepEqual(c.fields, ["width"]);
  });
});

describe("ObjectURL ref sayacı", () => {
  beforeEach(async () => {
    await freshDb();
  });

  it("aynı görsel iki kez alınınca tek URL, iki refs", async () => {
    const r = await images.createImage({ noteId: "n1", name: "a.png", mime: "image/png", blob: pngBlob(5) });
    const u1 = await images.acquireObjectURL(r.id);
    const u2 = await images.acquireObjectURL(r.id);
    assert.equal(u1, u2);
    images.releaseObjectURL(r.id);
    // Hâlâ bir kullanıcı var → revoke edilmemeli
    const u3 = await images.acquireObjectURL(r.id);
    assert.equal(u3, u1);
    images.releaseObjectURL(r.id);
    images.releaseObjectURL(r.id);
    assert.equal(images._urlCacheSize(), 0);
  });
});
