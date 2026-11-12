/**
 * Autosave testleri — sıralı kuyruk, hata izolasyonu, "skipped" ≠ "saved".
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Autosave } from "./autosave.ts";

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

describe("Autosave", () => {
  it("yazma başarılıysa 'saved' olur", async () => {
    const states: string[] = [];
    const a = new Autosave({
      delayMs: 10,
      save: async () => ({ status: "written" }),
      onState: (s) => states.push(s),
    });
    a.schedule();
    await delay(40);
    await a.idle();
    assert.ok(states.includes("saved"));
    assert.equal(a.getState(), "saved");
  });

  it("'skipped'/'identical' → 'saved' göstermez, 'idle' olur", async () => {
    const a = new Autosave({
      delayMs: 10,
      save: async () => ({ status: "skipped" }),
    });
    await a.flush();
    assert.equal(a.getState(), "idle");
  });

  it("conflict durumu bildirilir", async () => {
    const a = new Autosave({ delayMs: 10, save: async () => ({ status: "conflict" }) });
    await a.flush();
    assert.equal(a.getState(), "conflict");
  });

  it("hata → 'error', kuyruk kilitlenmez, sonraki yazma çalışır", async () => {
    let calls = 0;
    const errors: unknown[] = [];
    const a = new Autosave({
      delayMs: 5,
      save: async () => {
        calls++;
        if (calls === 1) throw new Error("boom");
        return { status: "written" };
      },
      onError: (e) => errors.push(e),
    });
    await a.flush();
    assert.equal(a.getState(), "error");
    assert.equal(errors.length, 1);
    // Zincir devam ediyor mu?
    await a.flush();
    assert.equal(a.getState(), "saved");
    assert.equal(calls, 2);
  });

  it("çok hızlı schedule → tek yazma (debounce)", async () => {
    let calls = 0;
    const a = new Autosave({
      delayMs: 20,
      save: async () => {
        calls++;
        return { status: "written" };
      },
    });
    a.schedule();
    a.schedule();
    a.schedule();
    await delay(60);
    assert.equal(calls, 1);
  });
});
