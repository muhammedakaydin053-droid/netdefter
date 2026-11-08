/**
 * Yanlış analizi kalıcılığı — regresyon testleri.
 *
 * Kök neden: yanlışlar, görev ÜRETİLİRKEN "analiz edildi" işaretleniyordu.
 * Kapasite nedeniyle yerleşmeyen görevlerin yanlışları böylece kayboluyordu.
 *
 * Yeni sözleşme: bir yanlış YALNIZCA kullanıcı bugün o konu için
 * "Yanlış analizi" günlük kaydı girdiğinde (mevcut görev tamamlama mekanizması)
 * analiz edilmiş sayılır. Görev üretmek/yerleştirmek tek başına yetmez.
 *
 * Sekiz zorunlu senaryo kapsanır (bkz. describe blokları).
 */
import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createServer, type ViteDevServer } from "vite";

let server: ViteDevServer;
let E: any;
let S: any;
let STORE: any;
let B: any;
let curriculum: any[];

/**
 * Tarayıcı depolaması stub'ı. Zustand persist, `window.localStorage` yoksa
 * kendini devre dışı bırakır; "sayfa yenileme" senaryosunu gerçek persist
 * akışıyla (rehydrate) test edebilmek için modül yüklenmeden önce kurulur.
 * node --test her dosyayı ayrı süreçte çalıştırdığından bu stub sızmaz.
 */
const storage = new Map<string, string>();
const ls = {
  getItem: (k: string) => (storage.has(k) ? storage.get(k)! : null),
  setItem: (k: string, v: string) => { storage.set(k, String(v)); },
  removeItem: (k: string) => { storage.delete(k); },
  clear: () => storage.clear(),
  key: (i: number) => [...storage.keys()][i] ?? null,
  get length() { return storage.size; },
};
(globalThis as any).localStorage = ls;
(globalThis as any).window = { localStorage: ls };

before(async () => {
  server = await createServer({ server: { middlewareMode: true }, logLevel: "silent" });
  E = await server.ssrLoadModule("/src/lib/smart/engine.ts");
  S = (await server.ssrLoadModule("/src/lib/smart/types.ts")).DEFAULT_SETTINGS;
  STORE = await server.ssrLoadModule("/src/lib/store.ts");
  B = await server.ssrLoadModule("/src/lib/backup.ts");
  curriculum = (await server.ssrLoadModule("/src/data/curriculum.json")).default;
});

after(async () => {
  await server?.close();
});

function seed() {
  return curriculum.map((t) => ({
    id: `${t.exam}|${t.subject}|${t.topic}|${t.subtopic}`,
    ...t,
    status: "Başlamadım",
    total: null,
    correct: null,
    wrong: null,
    lastStudy: "",
    reviewDate: "",
    source: "",
    note: "",
  }));
}

/** Günlük "Yanlış analizi" tamamlama kaydı (mevcut tamamlama mekanizması). */
function done(date: string, subject: string, topic: string) {
  return {
    id: `done-${date}-${subject}-${topic}`,
    date,
    subject,
    topic,
    kind: "Yanlış analizi",
    minutes: 40,
    questions: null,
    correct: null,
    wrong: null,
    note: "",
  };
}

function waWrongIds(slots: any[]): string[] {
  return slots.filter((s) => s.kind === "Yanlış analizi").flatMap((s) => s.wrongIds ?? []);
}

const wrong = (id: string, date: string, subject: string, topic: string) => ({
  id,
  date,
  exam: "TYT",
  subject,
  topic,
  subtopic: "",
  reason: "kavram",
  wrong: 2,
  note: "",
});

describe("yanlış analizi — üretim vs tamamlama", () => {
  it("1) görev üretilir ama kapasite yetmezse yanlışlar analiz edilmiş sayılmaz", () => {
    // 22.11.2026 Pazar: bütçe düşük. İki konu grubu üretilir ama yalnızca biri
    // plana yerleşir; yerleşmeyen grubun yanlışları işaretlenmemelidir.
    const wrongs = [
      wrong("f1", "2026-11-21", "Fizik", "Kuvvet ve Hareket"),
      wrong("f2", "2026-11-21", "Fizik", "Kuvvet ve Hareket"),
      wrong("k1", "2026-11-21", "Kimya", "Atom"),
      wrong("k2", "2026-11-21", "Kimya", "Atom"),
    ];
    const r = E.buildDailyPlan(seed(), [], wrongs, [], [], S, [], "2026-11-22", new Set());
    const placed = waWrongIds(r.slots);
    assert.ok(placed.length > 0, "hiç yanlış analizi görevi yerleşmedi");
    assert.ok(placed.length < 4, `senaryo kurulamadı: tüm yanlışlar yerleşti (${placed})`);
    // Üretilen/yerleşen görevler yalnızca gerçek yanlışları taşır; hiçbiri işaretli değil.
    assert.equal(r.analyzedWrongIds.length, 0, "tamamlanmayan (hatta yerleşmeyen) görev analiz sayıldı");
    // Yerleşmeyen grubun yanlışları ertesi gün yine görevlendirilebilir.
    const r2 = E.buildDailyPlan(seed(), [], wrongs, [], [], S, [], "2026-11-23", new Set(), {});
    const next = new Set(waWrongIds(r2.slots));
    const dropped = placed.length < 4 ? ["f1", "f2", "k1", "k2"].filter((id) => !placed.includes(id)) : [];
    assert.ok(dropped.some((id) => next.has(id)), "ertelenen yanlış ertesi gün geri gelmedi (kayboldu)");
  });

  it("2) görev yerleşir ama kullanıcı tamamlamazsa ertesi gün yeniden görevlendirilir", () => {
    const wrongs = [wrong("w1", "2026-11-20", "Fizik", "Kuvvet ve Hareket"), wrong("w2", "2026-11-20", "Fizik", "Kuvvet ve Hareket")];
    const day1 = "2026-11-21";
    const r1 = E.buildDailyPlan(seed(), [], wrongs, [], [], S, [], day1, new Set());
    assert.ok(r1.slots.some((s: any) => s.kind === "Yanlış analizi"), "görev yerleşmedi");
    assert.equal(r1.analyzedWrongIds.length, 0, "tamamlanmadan işaretlendi");
    // Tamamlama yok → işaret yok → ertesi gün görev yine üretilir.
    const r2 = E.buildDailyPlan(seed(), [], wrongs, [], [], S, [], "2026-11-22", new Set(), {});
    assert.ok(r2.slots.some((s: any) => s.kind === "Yanlış analizi"), "tamamlanmayan görev ertesi gün kayboldu");
    assert.equal(r2.analyzedWrongIds.length, 0, "ertesi gün de işaret olmamalı");
  });

  it("3) kullanıcı tamamlayınca wrongIds kaydedilir ve gereksiz tekrar üretilmez", () => {
    const wrongs = [wrong("w1", "2026-11-20", "Matematik", "Problemler"), wrong("w2", "2026-11-20", "Matematik", "Problemler")];
    const day1 = "2026-11-21";
    const r1 = E.buildDailyPlan(seed(), [done(day1, "Matematik", "Problemler")], wrongs, [], [], S, [], day1, new Set());
    assert.deepEqual([...r1.analyzedWrongIds].sort(), ["w1", "w2"], "tamamlanan görev işaretlenmedi");
    // İşaretleri kalıcılaştır (çağıran tarafın yaptığı gibi) ve ertesi günü sor.
    const marks: Record<string, string> = {};
    for (const id of r1.analyzedWrongIds) marks[id] = day1;
    const r2 = E.buildDailyPlan(seed(), [], wrongs, [], [], S, [], "2026-11-22", new Set(), marks);
    assert.equal(r2.slots.filter((s: any) => s.kind === "Yanlış analizi").length, 0, "tamamlanan yanlış için tekrar görev üretildi");
  });

  it("3b) aynı gün tamamlanan görev ekran yenilenince kaybolmaz", () => {
    const wrongs = [wrong("w1", "2026-11-20", "Fizik", "Kuvvet ve Hareket"), wrong("w2", "2026-11-20", "Fizik", "Kuvvet ve Hareket")];
    const day1 = "2026-11-21";
    const r1 = E.buildDailyPlan(seed(), [done(day1, "Fizik", "Kuvvet ve Hareket")], wrongs, [], [], S, [], day1, new Set());
    const marks: Record<string, string> = {};
    for (const id of r1.analyzedWrongIds) marks[id] = day1;
    // Aynı gün, işaretler yüklü hâlde yeniden hesaplanır (sayfa yenilemesi).
    const again = E.buildDailyPlan(seed(), [done(day1, "Fizik", "Kuvvet ve Hareket")], wrongs, [], [], S, [], day1, new Set(), marks);
    assert.ok(again.slots.some((s: any) => s.kind === "Yanlış analizi"), "aynı gün görev kayboldu");
    assert.deepEqual([...again.analyzedWrongIds].sort(), ["w1", "w2"], "aynı gün işaret kayboldu");
  });

  it("8) farklı günler ve düşük bütçeli günlerde tamamlanmayan görev kaybolmaz", () => {
    // Yanlış 21.11'de oluştu; 7 günlük pencere içinde hiç tamamlanmadı.
    const wrongs = [wrong("w1", "2026-11-21", "Fizik", "Kuvvet ve Hareket")];
    let placedSomeDay = false;
    for (let i = 0; i <= 7; i++) {
      const date = new Date(Date.parse("2026-11-21T12:00:00Z") + i * 86400000).toISOString().slice(0, 10);
      const r = E.buildDailyPlan(seed(), [], wrongs, [], [], S, [], date, new Set(), {});
      assert.equal(r.analyzedWrongIds.length, 0, `${date}: tamamlanmayan görev işaretlendi`);
      if (waWrongIds(r.slots).includes("w1")) placedSomeDay = true;
    }
    assert.ok(placedSomeDay, "yanlış 7 günlük pencerede hiçbir gün plana yerleşmedi (kayboldu)");
  });
});

describe("yanlış analizi — kalıcılık (store + yedek)", () => {
  beforeEach(() => {
    STORE.useAppStore.setState({
      analyzedWrongs: {},
      branchMockHistory: {},
      backup: null,
      topics: STORE.seedTopics(),
      archivedTopics: [],
    });
  });

  it("4) sayfa yenilemesi (persist yazımı + merge) analiz ve branş kayıtlarını korur", async () => {
    const st = STORE.useAppStore.getState();
    st.markWrongsAnalyzed(["w1", "w2"], "2026-11-21");
    st.markBranchMock("Fizik", "2026-11-21");
    await new Promise((r) => setTimeout(r, 20));
    // Yazma yolu: kalıcı kayıt iki alanı da taşımalı.
    const raw = storage.get("netdefter-yks-v1");
    assert.ok(raw, "persist kaydı yazılmadı");
    const saved = JSON.parse(raw!);
    assert.deepEqual(saved.state.analyzedWrongs, { w1: "2026-11-21", w2: "2026-11-21" }, "analiz kayıtları diske yazılmadı");
    assert.deepEqual(saved.state.branchMockHistory, { "TYT|Fizik": "2026-11-21" }, "branş geçmişi diske yazılmadı");
    // Okuma yolu: sayfa yüklenirken `merge` bu kaydı başlangıç durumuyla birleştirir.
    const opts = STORE.useAppStore.persist.getOptions();
    const reloaded = opts.merge(saved.state, STORE.useAppStore.getInitialState());
    assert.deepEqual(reloaded.analyzedWrongs, { w1: "2026-11-21", w2: "2026-11-21" }, "analiz kayıtları yeniden yüklenmedi");
    assert.deepEqual(reloaded.branchMockHistory, { "TYT|Fizik": "2026-11-21" }, "branş geçmişi yeniden yüklenmedi");
  });

  it("5) snapshot ve geri alma analiz kayıtlarını ve branş geçmişini korur", () => {
    const st = STORE.useAppStore.getState();
    st.markWrongsAnalyzed(["w1"], "2026-11-21");
    st.markBranchMock("Kimya", "2026-11-21");
    // Sıfırlama öncesi durum yedeğe alınır; alanlar temizlenir.
    STORE.useAppStore.getState().resetAll();
    assert.deepEqual(STORE.useAppStore.getState().analyzedWrongs, {}, "sıfırlama analiz işaretlerini temizlemedi");
    assert.deepEqual(STORE.useAppStore.getState().branchMockHistory, {}, "sıfırlama branş geçmişini temizlemedi");
    // Geri alınca yedekteki işaretler geri gelir.
    STORE.useAppStore.getState().restoreBackup();
    assert.deepEqual(STORE.useAppStore.getState().analyzedWrongs, { w1: "2026-11-21" }, "geri alma analiz kayıtlarını döndürmedi");
    assert.deepEqual(STORE.useAppStore.getState().branchMockHistory, { "TYT|Kimya": "2026-11-21" }, "geri alma branş geçmişini döndürmedi");
  });

  it("6) JSON yedeği dışa/içe aktarılınca iki alan korunur", () => {
    const st = STORE.useAppStore.getState();
    st.markWrongsAnalyzed(["w1", "w2"], "2026-11-21");
    st.markBranchMock("Biyoloji", "2026-11-21");
    // Dışa aktar → içe aktar.
    const json = B.serializeBackup(B.toBackupData(STORE.useAppStore.getState()));
    const parsed = B.parseBackup(json);
    assert.equal(parsed.ok, true, `yedek ayrıştırılamadı: ${parsed.ok ? "" : parsed.error}`);
    STORE.useAppStore.getState().importData(parsed.data);
    const s = STORE.useAppStore.getState();
    assert.deepEqual(s.analyzedWrongs, { w1: "2026-11-21", w2: "2026-11-21" }, "içe aktarma analiz kayıtlarını korumadı");
    assert.deepEqual(s.branchMockHistory, { "TYT|Biyoloji": "2026-11-21" }, "içe aktarma branş geçmişini korumadı");
  });

  it("7) bu alanları içermeyen eski sürüm yedeği sorunsuz içe aktarılır", () => {
    const oldEnvelope = JSON.stringify({
      format: "netdefter-yks-backup",
      version: 1,
      exportedAt: "2026-11-03T00:00:00.000Z",
      app: "NetDefter",
      data: { topics: [], archivedTopics: [], wrongs: [], tytExams: [], aytExams: [], daily: [], settings: {}, carry: [] },
    });
    const parsed = B.parseBackup(oldEnvelope);
    assert.equal(parsed.ok, true, "eski yedek reddedildi");
    assert.deepEqual(parsed.data.analyzedWrongs, {}, "eksik alan boş nesne olmalı");
    assert.deepEqual(parsed.data.branchMockHistory, {}, "eksik alan boş nesne olmalı");
    // Eski işaretler yeni yedeğin üzerine sızmamalı.
    STORE.useAppStore.getState().markWrongsAnalyzed(["stale"], "2026-11-01");
    STORE.useAppStore.getState().importData(parsed.data);
    assert.deepEqual(STORE.useAppStore.getState().analyzedWrongs, {}, "eski işaretler yeni veriye sızdı");
  });
});

describe("gerçek uygulama akışı (program.tsx useEffect) — uçtan uca", () => {
  /**
   * program.tsx'in yaptığını birebir yapar: her gün planı üretir, dönen
   * `analyzedWrongIds`'i `markWrongsAnalyzed` ile kalıcılaştırır. Böylece
   * yalnızca tamamlanan görevlerin işaretlendiği ve ertelenenlerin
   * kaybolmadığı gerçek akışta doğrulanır.
   */
  function runDays(opts: {
    wrongs: any[];
    complete?: (date: string, slots: any[]) => any[];
    days: number;
    start?: string;
  }) {
    const store = STORE.useAppStore;
    const marks: Record<string, string> = {};
    let daily: any[] = [];
    const perDay: { date: string; waSlots: number; waWrongIds: string[] }[] = [];
    for (let i = 0; i < opts.days; i++) {
      const date = new Date(Date.parse((opts.start ?? "2026-11-21") + "T12:00:00Z") + i * 86400000)
        .toISOString()
        .slice(0, 10);
      let { slots, analyzedWrongIds } = E.buildDailyPlan(
        seed(), daily, opts.wrongs, [], [], S, [], date, new Set(), marks, {},
      );
      // Kullanıcı bugünün planını tamamlarsa (günlük kaydı) uygulama yeniden
      // render eder; işaretler AYNI gün bu ikinci geçişte oluşur.
      if (opts.complete) {
        const newDaily = opts.complete(date, slots);
        if (newDaily.length) {
          daily = newDaily;
          const again = E.buildDailyPlan(seed(), daily, opts.wrongs, [], [], S, [], date, new Set(), marks, {});
          slots = again.slots;
          analyzedWrongIds = again.analyzedWrongIds;
        }
      }
      // program.tsx useEffect ile aynı:
      if (analyzedWrongIds.length) for (const id of analyzedWrongIds) marks[id] = date;
      const waSlots = slots.filter((s: any) => s.kind === "Yanlış analizi");
      perDay.push({ date, waSlots: waSlots.length, waWrongIds: waSlots.flatMap((s: any) => s.wrongIds ?? []) });
    }
    return { marks, perDay, store };
  }

  it("ertelenen yanlış, kapasite açılınca yeniden görevlendirilir (kaybolmaz)", () => {
    const wrongs = [
      wrong("f1", "2026-11-21", "Fizik", "Kuvvet ve Hareket"),
      wrong("k1", "2026-11-21", "Kimya", "Atom"),
    ];
    // Hiçbir gün tamamlama yok; hiçbir yanlış işaretlenmemeli.
    const { marks, perDay } = runDays({ wrongs, days: 7 });
    assert.deepEqual(marks, {}, `tamamlanmayan yanlışlar işaretlendi: ${JSON.stringify(marks)}`);
    // İki yanlış da 7 günlük pencere içinde en az bir kez plana girmiş olmalı.
    const seen = new Set(perDay.flatMap((d) => d.waWrongIds));
    assert.ok(seen.has("f1"), "Fizik yanlışı pencere içinde hiç görevlendirilmedi");
    assert.ok(seen.has("k1"), "Kimya yanlışı pencere içinde hiç görevlendirilmedi");
  });

  it("tamamlanan yanlış bir kez işaretlenir ve sonraki günlerde tekrar etmez", () => {
    const wrongs = [
      wrong("f1", "2026-11-21", "Fizik", "Kuvvet ve Hareket"),
      wrong("f2", "2026-11-21", "Fizik", "Kuvvet ve Hareket"),
    ];
    // 1. gün kullanıcı Fizik/Kuvvet ve Hareket yanlış analizini tamamlar.
    const complete = (date: string, slots: any[]) => {
      const hasWa = slots.some((s: any) => s.kind === "Yanlış analizi" && s.topic === "Kuvvet ve Hareket");
      return hasWa && date === "2026-11-21" ? [done(date, "Fizik", "Kuvvet ve Hareket")] : [];
    };
    const { marks, perDay } = runDays({ wrongs, days: 7, complete });
    assert.deepEqual(Object.keys(marks).sort(), ["f1", "f2"], "tamamlanan yanlışlar işaretlenmedi");
    assert.equal(marks.f1, "2026-11-21");
    // 1. günden sonra bu yanlışlar için tekrar görev üretilmemeli.
    for (const d of perDay.slice(1)) {
      assert.equal(d.waWrongIds.includes("f1"), false, `${d.date}: tamamlanan yanlış tekrar görevlendirildi`);
    }
  });
});
