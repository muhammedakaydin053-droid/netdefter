/**
 * Çakışma çözümü UI kararı + yeniden giriş koruması testleri (O2).
 *
 * Bu testler, editör bileşeninin çakışma çözümünde GERÇEKTEN kullandığı saf
 * karar mantığını doğrular: hangi `status` değerinin senkron/banner-koru
 * ürettiği ve eşzamanlı çağrıların engellendiği.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  resolveConflictUi,
  createSingleFlight,
  guardedSave,
  CONFLICT_ERROR_MESSAGE,
  CONFLICT_MISSING_MESSAGE,
} from "./conflict.ts";
import type { Note } from "./types";

function fakeNote(over: Partial<Note> = {}): Note {
  return {
    id: "n1",
    title: "yerel",
    exam: "TYT",
    subject: "Matematik",
    topics: [],
    content: { type: "doc", content: [] },
    imageIds: [],
    tags: [],
    favorite: false,
    pinned: false,
    archived: false,
    deletedAt: null,
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
    revision: 2,
    baseRevision: 1,
    contentHash: "h",
    schemaVersion: 1,
    ...over,
  };
}

describe("resolveConflictUi — durum yorumu", () => {
  it("'written' + kayıt varsa senkronlar (banner kalkar)", () => {
    const n = fakeNote();
    const d = resolveConflictUi("written", n);
    assert.equal(d.action, "synced");
    assert.equal(d.blockAutosave, false);
    if (d.action === "synced") assert.equal(d.note, n);
  });

  it("'written' ama kayıt yoksa senkronlamaz, banner korunur", () => {
    const d = resolveConflictUi("written", undefined);
    assert.equal(d.action, "keep-banner");
    if (d.action === "keep-banner") assert.equal(d.message, CONFLICT_ERROR_MESSAGE);
  });

  it("'missing' → banner korunur + autosave kilitlenir", () => {
    const d = resolveConflictUi("missing", undefined);
    assert.equal(d.action, "keep-banner");
    assert.equal(d.blockAutosave, true, "missing'de autosave kilitlenmeli");
    if (d.action === "keep-banner") assert.equal(d.message, CONFLICT_MISSING_MESSAGE);
  });

  it("'error' → banner korunur + hata mesajı, autosave serbest kalır", () => {
    const d = resolveConflictUi("error", fakeNote());
    assert.equal(d.action, "keep-banner");
    assert.equal(d.blockAutosave, false, "geçici hata autosave'i kilitlememeli");
    if (d.action === "keep-banner") assert.equal(d.message, CONFLICT_ERROR_MESSAGE);
  });

  it("bilinmeyen durum güvenli biçimde başarısız sayılır", () => {
    const d = resolveConflictUi("çok-tuhaf", fakeNote());
    assert.equal(d.action, "keep-banner");
    if (d.action === "keep-banner") assert.equal(d.message, CONFLICT_ERROR_MESSAGE);
  });
});

describe("guardedSave — missing sonrası autosave kilidi", () => {
  it("kilit açıkken yazmaz, 'conflict' döner (not yeniden oluşmaz)", async () => {
    const blocked = true;
    let writes = 0;
    const save = guardedSave(
      () => blocked,
      async () => {
        writes++;
        return { status: "written" };
      },
    );
    const res = await save();
    assert.equal(res.status, "conflict", "kilitliyken 'conflict' dönmeli");
    assert.equal(writes, 0, "IndexedDB'ye yazma denenmemeli");
  });

  it("kilit kapalıyken normal yazar", async () => {
    const blocked = false;
    let writes = 0;
    const save = guardedSave(
      () => blocked,
      async () => {
        writes++;
        return { status: "written" };
      },
    );
    const res = await save();
    assert.equal(res.status, "written");
    assert.equal(writes, 1);
  });

  it("kilit kaldırılınca yazma yeniden çalışır", async () => {
    let blocked = true;
    let writes = 0;
    const save = guardedSave(
      () => blocked,
      async () => {
        writes++;
        return { status: "written" };
      },
    );
    await save();
    blocked = false; // kullanıcı açıkça yeni bir işlem yaptı
    await save();
    assert.equal(writes, 1);
  });
});

describe("createSingleFlight — yeniden giriş koruması", () => {
  function deferred() {
    let release!: () => void;
    const promise = new Promise<void>((r) => {
      release = r;
    });
    return { promise, release };
  }

  it("ilk çağrı sürerken ikinci çağrı çalışmaz", async () => {
    const lock = createSingleFlight();
    const gate = deferred();
    let calls = 0;
    const first = lock.run(async () => {
      calls++;
      await gate.promise;
    });
    const second = lock.run(async () => {
      calls++;
    });
    await second; // kilit dolu → hemen döner, gövde çalışmaz
    assert.equal(calls, 1, "ikinci çağrı engellenmeli");
    assert.equal(lock.busy, true);
    gate.release();
    await first;
    assert.equal(calls, 1);
    assert.equal(lock.busy, false, "kilit serbest bırakılmalı");
  });

  it("işlem bittikten sonra tekrar çalıştırılabilir", async () => {
    const lock = createSingleFlight();
    let calls = 0;
    await lock.run(async () => {
      calls++;
    });
    await lock.run(async () => {
      calls++;
    });
    assert.equal(calls, 2, "sıralı çağrılar çalışmalı");
    assert.equal(lock.busy, false);
  });

  it("gövde hata fırlatsa bile kilit serbest bırakılır", async () => {
    const lock = createSingleFlight();
    await assert.rejects(() =>
      lock.run(async () => {
        throw new Error("patladı");
      }),
    );
    assert.equal(lock.busy, false, "hata sonrası kilit açık kalmalı");
    let ran = false;
    await lock.run(async () => {
      ran = true;
    });
    assert.equal(ran, true, "hata sonrası yeni çözüm yapılabilmeli");
  });
});
