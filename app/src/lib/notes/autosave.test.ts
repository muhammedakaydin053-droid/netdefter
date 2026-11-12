/**
 * Autosave testleri — sıralı kuyruk, hata izolasyonu, "skipped" ≠ "saved".
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Autosave, attachLifecycleFlush } from "./autosave.ts";

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

describe("attachLifecycleFlush — sekme yaşam döngüsü (O1)", () => {
  function makeTarget() {
    const listeners = new Map<string, Set<() => void>>();
    return {
      addEventListener: (t: string, fn: () => void) => {
        if (!listeners.has(t)) listeners.set(t, new Set());
        listeners.get(t)!.add(fn);
      },
      removeEventListener: (t: string, fn: () => void) => {
        listeners.get(t)?.delete(fn);
      },
      dispatch: (t: string) => {
        for (const fn of listeners.get(t) ?? []) fn();
      },
      count: (t: string) => listeners.get(t)?.size ?? 0,
    };
  }

  it("sekme gizlenince bekleyen yazmayı flush eder", async () => {
    const doc = makeTarget();
    const win = makeTarget();
    (globalThis as any).document = { visibilityState: "hidden", ...doc };
    (globalThis as any).window = win;
    try {
      let calls = 0;
      const a = new Autosave({
        delayMs: 10000,
        save: async () => {
          calls++;
          return { status: "written" };
        },
      });
      const detach = attachLifecycleFlush(a);
      a.schedule(); // debounce'u kur, hemen yazma
      doc.dispatch("visibilitychange");
      await a.idle();
      assert.equal(calls, 1, "gizlenince hemen yazılmalı");
      detach();
    } finally {
      delete (globalThis as any).document;
      delete (globalThis as any).window;
    }
  });

  it("sekme görünürken flush TETİKLENMEZ", async () => {
    const doc = makeTarget();
    const win = makeTarget();
    (globalThis as any).document = { visibilityState: "visible", ...doc };
    (globalThis as any).window = win;
    try {
      let calls = 0;
      const a = new Autosave({
        delayMs: 10000,
        save: async () => {
          calls++;
          return { status: "written" };
        },
      });
      const detach = attachLifecycleFlush(a);
      a.schedule();
      doc.dispatch("visibilitychange");
      await a.idle();
      assert.equal(calls, 0, "görünürken yazma olmamalı");
      detach();
    } finally {
      delete (globalThis as any).document;
      delete (globalThis as any).window;
    }
  });

  it("pagehide bekleyen yazmayı flush eder", async () => {
    const doc = makeTarget();
    const win = makeTarget();
    (globalThis as any).document = { visibilityState: "visible", ...doc };
    (globalThis as any).window = win;
    try {
      let calls = 0;
      const a = new Autosave({
        delayMs: 10000,
        save: async () => {
          calls++;
          return { status: "written" };
        },
      });
      const detach = attachLifecycleFlush(a);
      a.schedule();
      win.dispatch("pagehide");
      await a.idle();
      assert.equal(calls, 1, "pagehide'da yazılmalı");
      detach();
    } finally {
      delete (globalThis as any).document;
      delete (globalThis as any).window;
    }
  });

  it("detach sonrası dinleyiciler kaldırılır (bellek sızıntısı yok)", () => {
    const doc = makeTarget();
    const win = makeTarget();
    (globalThis as any).document = { visibilityState: "visible", ...doc };
    (globalThis as any).window = win;
    try {
      const a = new Autosave({ delayMs: 10, save: async () => ({ status: "written" }) });
      const detach = attachLifecycleFlush(a);
      assert.equal(doc.count("visibilitychange"), 1);
      assert.equal(win.count("pagehide"), 1);
      detach();
      assert.equal(doc.count("visibilitychange"), 0);
      assert.equal(win.count("pagehide"), 0);
    } finally {
      delete (globalThis as any).document;
      delete (globalThis as any).window;
    }
  });
});
