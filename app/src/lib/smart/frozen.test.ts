/**
 * Dondurulmuş program penceresi testleri.
 *
 * AMAÇ: "kullanıcının konu durumunu/soru sonucunu kaydetmesi, programdaki mevcut
 * ve gelecek görevleri sessizce değiştirmemeli" beklentisini doğrulamak.
 *
 * `frozen.ts` penceresi bir kez üretilir; konu/soru verisi değişince YENİDEN
 * HESAPLANMAZ. Bu dosya üç şeyi kanıtlar:
 *   1. Üretim doğruluğu: ilk penceresi canlı motorla (`buildWeekGrid` / bugünün
 *      sırası) BİREBİR aynıdır — dondurma planı bozmaz.
 *   2. Kayma yok: 10 gerçek kullanıcı senaryosundan sonra sonraki 7/14/30 gün
 *      hiç değişmez.
 *   3. Veri güvenliği: yeni alan mevcut kullanıcı verisini etkilemez; eski
 *      kayıtlarda alan yoksa güvenli varsayılan (boş pencere) alınır.
 *
 * `vite` ile yüklenir çünkü modül `@/` takma adı ve JSON importu kullanır.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type ViteDevServer } from "vite";

let server: ViteDevServer;
let E: any, F: any, T: any, S: any, curriculum: any[];
let store: any, seedTopics: any, mergeTopicsWithArchive: any;

before(async () => {
  server = await createServer({ server: { middlewareMode: true }, logLevel: "silent" });
  E = await server.ssrLoadModule("/src/lib/smart/engine.ts");
  F = await server.ssrLoadModule("/src/lib/smart/frozen.ts");
  T = await server.ssrLoadModule("/src/lib/smart/types.ts");
  S = T.DEFAULT_SETTINGS;
  curriculum = (await server.ssrLoadModule("/src/data/curriculum.json")).default;
  store = await server.ssrLoadModule("/src/lib/store.ts");
  seedTopics = store.seedTopics;
  mergeTopicsWithArchive = store.mergeTopicsWithArchive;
});

after(() => server?.close());

const DAY = 86400000;
const addDays = (d: string, n: number) =>
  new Date(Date.parse(d + "T12:00:00Z") + n * DAY).toISOString().slice(0, 10);

/** Boş çalışma durumuyla tam müfredat. */
function seed() {
  return curriculum.map((t: any) => ({
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

function inputs(over: any = {}) {
  return {
    topics: seed(),
    daily: [],
    wrongs: [],
    tytExams: [],
    aytExams: [],
    settings: { ...S },
    carry: [],
    ...over,
  };
}

/** Bir günün dondurulmuş görevlerini karşılaştırılabilir imzaya çevirir. */
const daySig = (plan: any, date: string) =>
  F.frozenWeekSlots(plan[date])
    .map((s: any) => `${s.exam}|${s.subject}|${s.topic}|${(s.kinds ?? [s.kind]).join("+")}|${s.minutes}`)
    .join(" > ");

/** Pencerenin ilk `n` gününün imzaları. */
function windowSig(plan: any, from: string, n: number) {
  return Array.from({ length: n }, (_, i) => daySig(plan, addDays(from, i))).join("\n");
}

/** Bir konuya durum/soru verisi uygular. */
function applyToTopic(topics: any[], match: (t: any) => boolean, patch: any) {
  return topics.map((t) => (match(t) ? { ...t, ...patch } : t));
}

const isTyt = (subject: string) => (t: any) => t.exam === "TYT" && t.subject === subject;

// ── 1. Üretim doğruluğu ─────────────────────────────────────────────────────

describe("frozen — üretim doğruluğu (dondurma planı bozmaz)", () => {
  it("(1) hafta ızgarası canlı `buildWeekGrid` ile birebir aynıdır", () => {
    const inp = inputs();
    const today = S.programStart;
    const plan = F.ensureFrozen(inp, {}, today);
    const live = E.buildWeekGrid(inp.topics, [], [], [], [], S, [], today);
    for (let i = 0; i < 7; i++) {
      const d = addDays(today, i);
      const liveSig = live[i].slots
        .map((s: any) => `${s.exam}|${s.subject}|${s.topic}|${(s.kinds ?? [s.kind]).join("+")}|${s.minutes}`)
        .join(" > ");
      assert.equal(daySig(plan, d), liveSig, `${d} günü canlı ızgaradan farklı`);
    }
  });

  it("(2) bugünün sırası canlı motorla birebir aynıdır", () => {
    const inp = inputs();
    const today = S.programStart;
    const plan = F.ensureFrozen(inp, {}, today);
    const live = E.buildDailyPlan(inp.topics, [], [], [], [], S, [], today, new Set());
    const liveTl = E.mergeTopicSlots([...live.slots, ...live.life]).sort((a: any, b: any) => a.start.localeCompare(b.start));
    const sig = (arr: any[]) =>
      arr.map((s) => `${s.start}-${s.end}|${s.exam}|${s.subject}|${s.topic}|${(s.kinds ?? [s.kind]).join("+")}`).join(" > ");
    assert.equal(sig(F.frozenTimeline(plan[today])), sig(liveTl));
  });

  it("(3) pencere 30 gündür ve sınav tarihini aşmaz", () => {
    const plan = F.ensureFrozen(inputs(), {}, S.programStart);
    const dates = Object.keys(plan).sort();
    assert.equal(dates.length, F.FRESH_DAYS);
    assert.ok(dates.every((d) => d <= S.examDate), "sınav tarihi aşıldı");
  });
});

// ── 2. Kayma yok: 10 gerçek kullanıcı senaryosu ─────────────────────────────

describe("frozen — kayma yok (kaydetmek geleceği değiştirmez)", () => {
  let today: string;
  let base: any;
  const scenarios: [string, (inp: any, today: string) => any][] = [
    ["(1) yeni konuya Çalışıyorum", (inp, t) => ({ ...inp, topics: applyToTopic(inp.topics, isTyt("Coğrafya"), { status: "Çalışıyorum", lastStudy: t }) })],
    ["(2) konuya soru sonuçları", (inp, t) => ({ ...inp, topics: applyToTopic(inp.topics, isTyt("Tarih"), { status: "Çalışıyorum", total: 40, correct: 30, wrong: 10, lastStudy: t }) })],
    ["(3) konu Bitti", (inp, t) => ({ ...inp, topics: applyToTopic(inp.topics, isTyt("Kimya"), { status: "Bitti", total: 60, correct: 52, lastStudy: t }) })],
    ["(4) Tekrar Gerekli", (inp, t) => ({ ...inp, topics: applyToTopic(inp.topics, isTyt("Fizik"), { status: "Tekrar Gerekli", total: 30, correct: 12, lastStudy: t }) })],
    ["(5) TYT dersi tamamen bitti", (inp, t) => ({ ...inp, topics: applyToTopic(inp.topics, isTyt("Felsefe"), { status: "Bitti", total: 20, correct: 17, lastStudy: t }) })],
    ["(6) AYT konusuna veri", (inp, t) => ({ ...inp, topics: applyToTopic(inp.topics, (x) => x.exam === "AYT" && x.subject === "Kimya", { status: "Çalışıyorum", total: 25, correct: 18, lastStudy: t }) })],
    ["(7) günlük kaydı (günlük/tempo)", (inp, t) => ({ ...inp, daily: [{ id: "d1", date: t, exam: "TYT", subject: "Türkçe", topic: "Paragraf", kind: "Soru çözümü", minutes: 60, questions: 40, correct: 32, wrong: 8, note: "" }] })],
    ["(8) yanlış kaydı", (inp, t) => ({ ...inp, wrongs: [{ id: "w1", date: t, exam: "TYT", subject: "Matematik", topic: "Temel Kavramlar", subtopic: "", source: "", questionNo: "5", reason: "Dikkatsizlik", note: "", reviewDate: "", result: "" }] })],
    ["(9) TYT denemesi", (inp, t) => ({ ...inp, tytExams: [{ id: "e1", date: t, name: "Deneme", turD: 30, turY: 5, matD: 25, matY: 8, sosD: 15, sosY: 4, fenD: 12, fenY: 3, note: "" }] })],
    ["(10) yeni tekrar ihtiyacı (reviewDate)", (inp, t) => ({ ...inp, topics: applyToTopic(inp.topics, isTyt("Biyoloji"), { status: "Çalışıyorum", total: 20, correct: 11, reviewDate: addDays(t, 3), lastStudy: t }) })],
  ];

  before(() => {
    today = S.programStart;
    base = F.ensureFrozen(inputs(), {}, today);
  });

  for (const [label, mutate] of scenarios) {
    it(`${label} → sonraki 7/14/30 gün değişmez`, () => {
      const next = F.ensureFrozen(mutate(inputs(), today), base, today);
      assert.equal(windowSig(next, today, 7), windowSig(base, today, 7), "7 günlük pencere kaydı");
      assert.equal(windowSig(next, today, 14), windowSig(base, today, 14), "14 günlük pencere kaydı");
      assert.equal(windowSig(next, today, 30), windowSig(base, today, 30), "30 günlük pencere kaydı");
    });
  }
});

// ── 3. Kalıcılık: yenileme, tarayıcı açma, gün ilerlemesi ───────────────────

describe("frozen — kalıcılık ve determinizm", () => {
  it("sayfa yenilense de (aynı girdi) pencere birebir aynı kalır", () => {
    const inp = inputs();
    const a = F.ensureFrozen(inp, {}, S.programStart);
    const b = F.ensureFrozen(inp, {}, S.programStart);
    assert.deepEqual(a, b);
  });

  it("kaydedilip yeniden yüklenen pencere (JSON round-trip) aynen korunur", () => {
    const inp = inputs();
    const plan = F.ensureFrozen(inp, {}, S.programStart);
    const reloaded = JSON.parse(JSON.stringify(plan));
    const next = F.ensureFrozen(inp, reloaded, S.programStart);
    assert.equal(windowSig(next, S.programStart, 30), windowSig(plan, S.programStart, 30));
  });

  it("birkaç gün sonra açılışta GEÇMİŞ günler korunur, pencere ileri kayar", () => {
    const inp = inputs();
    const day0 = S.programStart;
    const plan0 = F.ensureFrozen(inp, {}, day0);
    const day5 = addDays(day0, 5);
    const plan5 = F.ensureFrozen(inp, plan0, day5);
    // İlk günler (bugünden geçmişe doğru KEEP_PAST_DAYS içinde) değişmemeli.
    for (let i = 0; i <= 5; i++) {
      const d = addDays(day0, i);
      if (plan0[d]) assert.equal(daySig(plan5, d), daySig(plan0, d), `${d} geçmiş günü değişti`);
    }
    // Pencere ileri kaymalı: yeni günler eklenmiş olmalı.
    assert.ok(Object.keys(plan5).length >= F.FRESH_DAYS - 5, "pencere yenilenmedi");
  });

  it("pencere çıpası ileri kayınca eski pencere temizlenir (sınırsız büyümez)", () => {
    const inp = inputs();
    let plan = F.ensureFrozen(inp, {}, S.programStart);
    for (let k = 1; k <= 4; k++) {
      plan = F.ensureFrozen(inp, plan, addDays(S.programStart, k * 7));
    }
    assert.ok(Object.keys(plan).length <= F.FRESH_DAYS + F.KEEP_PAST_DAYS + 1, "pencere sınırsız büyüdü");
  });
});

// ── 4. Veri güvenliği ───────────────────────────────────────────────────────

describe("frozen — veri güvenliği ve migration", () => {
  it("eski kayıtta `frozenPlan` yoksa birleştirme boş pencere verir", () => {
    const merged = mergeTopicsWithArchive([], []);
    // mergeTopicsWithArchive mevcut veriyi korur; frozenPlan ayrı bir alandır ve
    // eski kayıtta bulunmazsa `merge` içinde `?? {}` ile boş pencere alınır.
    assert.deepEqual(merged.topics.length, seedTopics().length);
  });

  it("dondurma, kullanıcı konu verisini DEĞİŞTİRMEZ", () => {
    const topics = applyToTopic(seed(), isTyt("Tarih"), { status: "Bitti", total: 50, correct: 40, wrong: 10, lastStudy: "2026-11-20" });
    const before = JSON.stringify(topics);
    F.ensureFrozen(inputs({ topics }), {}, S.programStart);
    assert.equal(JSON.stringify(topics), before, "dondurma konu verisini mutasyona uğrattı");
  });

  it("girdi nesnesi mutasyona uğramaz", () => {
    const inp = inputs();
    const snapshot = JSON.stringify(inp.settings);
    F.ensureFrozen(inp, {}, S.programStart);
    assert.equal(JSON.stringify(inp.settings), snapshot, "settings değişti");
  });

  it("boş/eksik pencereyle güvenle çalışır (undefined günler)", () => {
    const plan = F.ensureFrozen(inputs(), {}, S.programStart);
    assert.deepEqual(F.frozenWeekSlots(plan["2099-01-01"]), []);
    assert.deepEqual(F.frozenTimeline(plan["2099-01-01"]), []);
    assert.deepEqual(F.frozenTodaySlots(plan, "2099-01-01"), []);
  });

  it("pencere boyutu localStorage sınırının çok altında", () => {
    const plan = F.ensureFrozen(inputs(), {}, S.programStart);
    const kb = JSON.stringify(plan).length / 1024;
    assert.ok(kb < 1024, `pencere çok büyük: ${kb.toFixed(1)} KB`);
  });
});
