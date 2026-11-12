/**
 * Not store testleri — çakışma çözüm aksiyonlarının UI'ya bağlanması (O2).
 *
 * `resolveKeepLocal` / `resolveKeepDb`, editördeki iki çakışma seçeneğinin
 * çağırdığı store aksiyonlarıdır. Burada bu aksiyonların repository'ye doğru
 * devredildiği ve veri kaybı olmadan sonuçlandığı doğrulanır.
 */
import "fake-indexeddb/auto";
import { describe, it, beforeEach, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type ViteDevServer } from "vite";

let server: ViteDevServer;
let DB: any;
let repo: any;
let store: any;
let schema: any;
let conflict: any;

before(async () => {
  server = await createServer({ server: { middlewareMode: true }, logLevel: "silent" });
  DB = await server.ssrLoadModule("/src/lib/notes/db.ts");
  repo = await server.ssrLoadModule("/src/lib/notes/repository.ts");
  store = await server.ssrLoadModule("/src/lib/notes/store.ts");
  schema = await server.ssrLoadModule("/src/lib/notes/schema.ts");
  conflict = await server.ssrLoadModule("/src/lib/notes/conflict.ts");
});

after(async () => {
  await server?.close();
});

async function freshDb() {
  const handle = await DB.openNotesDb();
  const tx = handle.transaction(["notes", "images", "meta"], "readwrite");
  tx.objectStore("notes").clear();
  tx.objectStore("images").clear();
  tx.objectStore("meta").clear();
  await tx.done;
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

describe("notes store — çakışma çözümü (O2)", () => {
  beforeEach(async () => {
    await freshDb();
    await store.useNotesStore.getState().hydrate();
  });

  it("resolveKeepLocal: yerel sürüm kazanır, DB sürümü arşiv kopyası olur", async () => {
    const { note } = await repo.createNote(baseInput());
    // Başka sekme güncelledi → DB rev 2.
    await repo.saveNote({ ...note, title: "diğer sekme" }, note.revision);

    const local = { ...note, title: "yerel düzenleme", revision: 1 };
    const res = await store.useNotesStore.getState().resolveKeepLocal(local);
    assert.equal(res.status, "written");

    const all = await repo.listNotes();
    assert.equal(all.length, 2, "yerel + arşiv kopyası");
    const kept = all.find((n: any) => n.id === note.id);
    assert.equal(kept?.title, "yerel düzenleme");
    assert.ok(all.some((n: any) => /Çakışma kopyası/.test(n.title)));

    // Store hidrasyonu yeni durumu yansıtmalı.
    const st = store.useNotesStore.getState();
    assert.equal(st.notes.find((n: any) => n.id === note.id)?.title, "yerel düzenleme");
  });

  it("resolveKeepDb: DB sürümü korunur, yerel arşiv kopyası olur", async () => {
    const { note } = await repo.createNote(baseInput());
    await repo.saveNote({ ...note, title: "diğer sekme" }, note.revision);

    const local = { ...note, title: "yerel düzenleme", revision: 1 };
    const res = await store.useNotesStore.getState().resolveKeepDb(local);
    assert.equal(res.status, "written");

    const all = await repo.listNotes();
    const kept = all.find((n: any) => n.id === note.id);
    assert.equal(kept?.title, "diğer sekme", "DB sürümü korunmalı");
    assert.ok(all.some((n: any) => /Çakışma kopyası/.test(n.title)), "yerel yedeklenmeli");

    const st = store.useNotesStore.getState();
    assert.equal(st.notes.find((n: any) => n.id === note.id)?.title, "diğer sekme");
  });

  it("resolveKeepLocal: hiçbir sürüm sessizce silinmez (DB arşivlenir)", async () => {
    const { note } = await repo.createNote(baseInput());
    await repo.saveNote({ ...note, title: "diğer sekme" }, note.revision);

    const local = { ...note, title: "yerel", revision: 1 };
    await store.useNotesStore.getState().resolveKeepLocal(local);

    const all = await repo.listNotes();
    const titles = all.map((n: any) => n.title);
    assert.ok(titles.includes("yerel"));
    assert.ok(titles.some((t: string) => t.includes("diğer sekme")), "DB sürümü kaybolmamalı");
  });

  it("resolveKeepDb: hiçbir sürüm sessizce silinmez (yerel arşivlenir)", async () => {
    const { note } = await repo.createNote(baseInput());
    await repo.saveNote({ ...note, title: "diğer sekme" }, note.revision);

    const local = { ...note, title: "yerel", revision: 1 };
    await store.useNotesStore.getState().resolveKeepDb(local);

    const all = await repo.listNotes();
    const titles = all.map((n: any) => n.title);
    assert.ok(titles.includes("diğer sekme"), "DB sürümü korunmalı");
    assert.ok(titles.some((t: string) => t.includes("yerel")), "yerel sürüm kaybolmamalı");
  });

  it("resolveKeepLocal: not yoksa 'missing' döner, hiçbir kayıt oluşmaz", async () => {
    const { note } = await repo.createNote(baseInput());
    await repo.purgeNote(note.id);

    const local = { ...note, title: "yerel", revision: 1 };
    const res = await store.useNotesStore.getState().resolveKeepLocal(local);
    assert.equal(res.status, "missing");
    assert.equal((await repo.listNotes()).length, 0, "hayalet kayıt oluşmamalı");
  });

  it("resolveKeepDb: not yoksa 'missing' döner, hiçbir kayıt oluşmaz", async () => {
    const { note } = await repo.createNote(baseInput());
    await repo.purgeNote(note.id);

    const local = { ...note, title: "yerel", revision: 1 };
    const res = await store.useNotesStore.getState().resolveKeepDb(local);
    assert.equal(res.status, "missing");
    assert.equal((await repo.listNotes()).length, 0, "hayalet kayıt oluşmamalı");
  });
});

describe("notes store — missing sonrası otomatik yeniden oluşturma engeli", () => {
  beforeEach(async () => {
    await freshDb();
    await store.useNotesStore.getState().hydrate();
  });

  // Editörün gerçek akışını taklit eder: draft'ı store kaydıyla birleştirip
  // `update` çağırır. `guardedSave` ile sarılıdır (bileşendeki gibi).
  function editorSave(noteId: string, blockedRef: { current: boolean }) {
    return conflict.guardedSave(
      () => blockedRef.current,
      async () => {
        const current = store.useNotesStore.getState().notes.find((n: any) => n.id === noteId);
        if (!current) return { status: "missing" };
        return await store.useNotesStore.getState().update({ ...current, title: "yazılan" });
      },
    );
  }

  it("missing sonrası yazma: not YENİDEN OLUŞMAZ, içerik kaybolmaz", async () => {
    const { note } = await repo.createNote(baseInput());
    await repo.purgeNote(note.id);
    await store.useNotesStore.getState().hydrate();

    // Çakışma çözümü missing döndü → kilit açılır (resolveConflictUi kararı).
    const decision = conflict.resolveConflictUi("missing", undefined);
    const blockedRef = { current: decision.blockAutosave };
    assert.equal(blockedRef.current, true);

    // Kullanıcı yazmaya devam ediyor → autosave tetiklenir.
    const res = await editorSave(note.id, blockedRef)();
    assert.equal(res.status, "conflict", "kilitliyken yazma denenmemeli");

    const all = await repo.listNotes();
    assert.equal(all.length, 0, "silinen not kendiliğinden yeniden oluşmamalı");
  });

  it("başarılı Keep Local sonrası autosave normal çalışır", async () => {
    const { note } = await repo.createNote(baseInput());
    await repo.saveNote({ ...note, title: "diğer sekme" }, note.revision);
    await store.useNotesStore.getState().hydrate();

    const local = { ...note, title: "yerel", revision: 1 };
    const res = await store.useNotesStore.getState().resolveKeepLocal(local);
    assert.equal(res.status, "written");

    // Başarı → kilit kapalı (resolveConflictUi kararı).
    const current = store.useNotesStore.getState().notes.find((n: any) => n.id === note.id);
    const decision = conflict.resolveConflictUi(res.status, current);
    assert.equal(decision.action, "synced");
    const blockedRef = { current: decision.blockAutosave };
    assert.equal(blockedRef.current, false);

    const saveRes = await editorSave(note.id, blockedRef)();
    assert.equal(saveRes.status, "written", "başarı sonrası yazma çalışmalı");
    const kept = await repo.getNote(note.id);
    assert.equal(kept?.title, "yazılan");
  });

  it("normal autosave (kilit yokken) hâlâ yazar", async () => {
    const { note } = await repo.createNote(baseInput());
    await store.useNotesStore.getState().hydrate();

    const blockedRef = { current: false };
    const res = await editorSave(note.id, blockedRef)();
    assert.equal(res.status, "written");
    assert.equal((await repo.getNote(note.id))?.title, "yazılan");
  });

  // H1: stale sekme, not başka sekmede kalıcı silindikten SONRA yazarsa
  // `store.update` `missing` döner ve kayıt yeniden OLUŞMAZ. (Daha önce
  // `saveNote` `expectedRevision` verilse bile yeni kayıt yaratıyordu.)
  it("H1: kalıcı silinmiş nota yazma → missing, not dirilmez", async () => {
    const { note } = await repo.createNote(baseInput());
    await store.useNotesStore.getState().hydrate();

    await repo.purgeNote(note.id);

    const stale = { ...note };
    const res = await store.useNotesStore.getState().update(stale);
    assert.equal(res.status, "missing");
    assert.equal((await repo.listNotes()).length, 0, "silinen not dirilmemeli");
  });

  it("H1: missing sonrası store silinen notu hâlâ listede tutar (banner için)", async () => {
    const { note } = await repo.createNote(baseInput());
    await store.useNotesStore.getState().hydrate();
    await repo.purgeNote(note.id);

    await store.useNotesStore.getState().update({ ...note });
    // hydrate edilmediği için not listede kalır → editör unmount olmaz.
    assert.ok(
      store.useNotesStore.getState().notes.some((n: any) => n.id === note.id),
      "missing sonrası not listede kalmalı (editör korunur)",
    );
  });
});
