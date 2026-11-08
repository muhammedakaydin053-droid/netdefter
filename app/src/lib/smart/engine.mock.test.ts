/**
 * Deneme, yanlış analizi ve günlük plan düzeltmelerinin regresyon testleri.
 *
 * Beş sorun kapsanır:
 *   1. Branş denemesi seçimi (rotasyon + zayıflık + kapsam).
 *   2. Yanlış analizinin gerçek konuya bağlanması + mükerrer kontrolü.
 *   3. Görev dakikalarının yerleştirmede korunması.
 *   4. AYT denemelerinin TYT net kaydına bağımlı olmaması.
 *   5. Branş/mini deneme günlerinde yeni konu yükünün sınırlanması.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type ViteDevServer } from "vite";

let server: ViteDevServer;
let E: any, S: any, curriculum: any[];

before(async () => {
  server = await createServer({ server: { middlewareMode: true }, logLevel: "silent" });
  E = await server.ssrLoadModule("/src/lib/smart/engine.ts");
  S = (await server.ssrLoadModule("/src/lib/smart/types.ts")).DEFAULT_SETTINGS;
  curriculum = (await server.ssrLoadModule("/src/data/curriculum.json")).default;
});

after(async () => {
  await server?.close();
});

const addDays = (iso: string, n: number) =>
  new Date(Date.parse(iso + "T12:00:00Z") + n * 86400000).toISOString().slice(0, 10);

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

const tytFull = (date: string, id: string) => ({
  id,
  date,
  name: "TYT",
  turD: 35,
  turY: 5,
  matD: 30,
  matY: 5,
  sosD: 15,
  sosY: 2,
  fenD: 15,
  fenY: 2,
  note: "",
});
const aytFull = (date: string, id: string) => ({
  id,
  date,
  name: "AYT",
  matD: 25,
  matY: 5,
  fizD: 10,
  fizY: 2,
  kimD: 8,
  kimY: 2,
  bioD: 8,
  bioY: 2,
  note: "",
});

/** Dönemi gerçek uygulama çağrısıyla işletir; verilen geri çağrıyla durum güncellenir. */
function runPeriod(opts: {
  end: string;
  recordExams: boolean;
  onDay?: (date: string, slots: any[]) => void;
}) {
  let topics = seed();
  const tytExams: any[] = [];
  const aytExams: any[] = [];
  const branchHistory: Record<string, string> = {};
  const mockSubjects: string[] = [];
  let fullTyt = 0;
  let fullAyt = 0;
  let branchMini = 0;
  let branchMiniWithLectures = 0;
  let fullMockWithLectures = 0;
  let maxLectOnShortMockDay = 0;
  const minuteMismatch: string[] = [];
  for (let i = 0; ; i++) {
    const date = addDays(S.programStart, i);
    if (date > opts.end) break;
    const { slots, branchMockSubject } = E.buildDailyPlan(
      topics, [], [], tytExams, aytExams, S, [], date, undefined, undefined, branchHistory,
    );
    if (branchMockSubject) branchHistory[`TYT|${branchMockSubject}`] = date;
    opts.onDay?.(date, slots);
    const lectures = slots.filter((s: any) => s.kind === "Konu anlatımı").length;
    for (const sl of slots) {
      const dur =
        (Date.parse("2000-01-01T" + sl.end + "Z") - Date.parse("2000-01-01T" + sl.start + "Z")) / 60000;
      if (Math.abs(dur - sl.minutes) > 0.001) minuteMismatch.push(`${date} ${sl.kind} ${sl.minutes}≠${dur}`);
    }
    const mocks = slots.filter((s: any) => s.kind === "Deneme");
    for (const mk of mocks) {
      if (mk.minutes >= 150) {
        if (mk.exam === "TYT") {
          fullTyt += 1;
          if (opts.recordExams) tytExams.push(tytFull(date, "t" + date));
        } else {
          fullAyt += 1;
          if (opts.recordExams) aytExams.push(aytFull(date, "a" + date));
        }
        if (lectures > 0) fullMockWithLectures += 1;
      } else {
        branchMini += 1;
        mockSubjects.push(mk.subject);
        if (lectures > 0) branchMiniWithLectures += 1;
        maxLectOnShortMockDay = Math.max(maxLectOnShortMockDay, lectures);
      }
    }
    for (const sl of slots) {
      if (!sl.exam || sl.kind === "Deneme" || sl.kind === "Yanlış analizi") continue;
      if (sl.kind === "Konu anlatımı") {
        topics = topics.map((t) =>
          t.exam === sl.exam && t.subject === sl.subject && t.topic === sl.topic && t.status === "Başlamadım"
            ? { ...t, status: "Çalışıyorum", lastStudy: date }
            : t,
        );
      } else {
        topics = topics.map((t) => {
          if (!(t.exam === sl.exam && t.subject === sl.subject && t.topic === sl.topic)) return t;
          if (t.status === "Başlamadım") return t;
          const q = Math.max(15, sl.targetQ || 15);
          const total = (t.total ?? 0) + q;
          const correct = (t.correct ?? 0) + Math.round(q * 0.78);
          return {
            ...t,
            total,
            correct,
            lastStudy: date,
            status: total >= 15 && correct / total >= 0.7 ? "Bitti" : t.status,
          };
        });
      }
    }
  }
  return {
    mockSubjects,
    fullTyt,
    fullAyt,
    branchMini,
    branchMiniWithLectures,
    fullMockWithLectures,
    maxLectOnShortMockDay,
    minuteMismatch,
    topics,
  };
}

describe("deneme ve yanlış analizi düzeltmeleri", () => {
  // ---- #3 Görev dakikaları ----
  it("görev süreleri yerleştirmede bozulmaz (yanlış analizi 40, anlatım 55, rutin 50)", () => {
    const wrongs = [
      { id: "w1", date: "2026-11-20", exam: "TYT", subject: "Matematik", topic: "Problemler", subtopic: "Hız", reason: "işlem", wrong: 3, note: "" },
      { id: "w2", date: "2026-11-20", exam: "TYT", subject: "Fizik", topic: "Kuvvet ve Hareket", subtopic: "Sürtünme", reason: "kavram", wrong: 2, note: "" },
    ];
    const { slots } = E.buildDailyPlan(seed(), [], wrongs, [], [], S, [], "2026-11-21", new Set());
    for (const sl of slots) {
      const dur = (Date.parse("2000-01-01T" + sl.end + "Z") - Date.parse("2000-01-01T" + sl.start + "Z")) / 60000;
      assert.equal(dur, sl.minutes, `${sl.kind} start/end (${dur}) ile minutes (${sl.minutes}) uyuşmuyor`);
      if (sl.kind === "Yanlış analizi") assert.equal(sl.minutes, 40, "yanlış analizi 40 dk olmalı");
      if (sl.kind === "Konu anlatımı") assert.equal(sl.minutes, 55, "konu anlatımı 55 dk olmalı");
      if (sl.kind === "Soru çözümü" && (sl.topic === "Paragraf" || sl.topic === "Problemler")) assert.equal(sl.minutes, 50, "rutin görev 50 dk olmalı");
    }
  });

  it("tüm dönemde start/end ile minutes tutarlı kalır", () => {
    const r = runPeriod({ end: "2027-06-19", recordExams: true });
    assert.equal(r.minuteMismatch.length, 0, `süre uyuşmazlığı: ${r.minuteMismatch.slice(0, 3).join(" | ")}`);
  });

  // ---- #1 Branş denemesi dağılımı ----
  it("branş denemeleri tek derse yığılmaz", () => {
    const r = runPeriod({ end: "2027-06-19", recordExams: true });
    assert.ok(r.branchMini >= 3, `branş/mini denemesi çok az: ${r.branchMini}`);
    const distinct = new Set(r.mockSubjects);
    assert.ok(distinct.size >= 3, `branş denemesi ${distinct.size} farklı derse dağıldı: ${[...distinct].join(", ")}`);
    // Hiçbir ders toplamın yarısından fazlasını almamalı.
    const counts = new Map<string, number>();
    for (const s of r.mockSubjects) counts.set(s, (counts.get(s) ?? 0) + 1);
    const max = Math.max(...counts.values());
    assert.ok(max <= Math.ceil(r.branchMini / 2), `bir ders branş denemelerinin çoğunu aldı: ${[...counts].join(", ")}`);
  });

  // ---- #4 AYT denemesi sonuçsuz senaryoda ----
  it("sonuç girilmese de TYT ve AYT tam denemeleri oluşur", () => {
    const r = runPeriod({ end: "2027-06-19", recordExams: false });
    assert.ok(r.fullTyt >= 10, `TYT tam denemesi çok az: ${r.fullTyt}`);
    assert.ok(r.fullAyt >= 5, `AYT tam denemesi oluşmadı/yok: ${r.fullAyt}`);
  });

  it("düşük TYT neti AYT denemesini tamamen kapatmaz", () => {
    // TYT neti düşük (30) kaydedilmiş olsa da AYT kapsamı oluşunca AYT denemesi açılır.
    let topics = seed();
    const tytExams: any[] = [];
    const aytExams: any[] = [];
    let fullAyt = 0;
    for (let i = 0; ; i++) {
      const date = addDays(S.programStart, i);
      if (date > "2027-06-19") break;
      const { slots } = E.buildDailyPlan(topics, [], [], tytExams, aytExams, S, [], date);
      for (const mk of slots.filter((s: any) => s.kind === "Deneme")) {
        if (mk.minutes >= 150 && mk.exam === "AYT") {
          fullAyt += 1;
          aytExams.push(aytFull(date, "a" + date));
        } else if (mk.minutes >= 150 && mk.exam === "TYT") {
          tytExams.push({ ...tytFull(date, "t" + date), turD: 10, matD: 8, sosD: 6, fenD: 6 });
        }
      }
      for (const sl of slots) {
        if (!sl.exam || sl.kind === "Deneme" || sl.kind === "Yanlış analizi") continue;
        if (sl.kind === "Konu anlatımı") {
          topics = topics.map((t) =>
            t.exam === sl.exam && t.subject === sl.subject && t.topic === sl.topic && t.status === "Başlamadım"
              ? { ...t, status: "Çalışıyorum", lastStudy: date }
              : t,
          );
        } else {
          topics = topics.map((t) => {
            if (!(t.exam === sl.exam && t.subject === sl.subject && t.topic === sl.topic)) return t;
            if (t.status === "Başlamadım") return t;
            const q = Math.max(15, sl.targetQ || 15);
            const total = (t.total ?? 0) + q;
            const correct = (t.correct ?? 0) + Math.round(q * 0.78);
            return { ...t, total, correct, lastStudy: date, status: total >= 15 && correct / total >= 0.7 ? "Bitti" : t.status };
          });
        }
      }
    }
    assert.ok(fullAyt >= 5, `düşük nette AYT denemesi kapatıldı: ${fullAyt}`);
  });

  // ---- #5 Branş/mini deneme günü konu yükü ----
  it("branş/mini deneme gününde en fazla 1 yeni konu, tam deneme gününde 0", () => {
    const r = runPeriod({ end: "2027-06-19", recordExams: true });
    assert.ok(r.maxLectOnShortMockDay <= 1, `kısa deneme gününde ${r.maxLectOnShortMockDay} yeni konu açıldı`);
    assert.equal(r.fullMockWithLectures, 0, "tam deneme gününde yeni konu açıldı");
  });

  // ---- #2 Yanlış analizi konu bağı ve mükerrer kontrolü ----
  it("yanlış analizi gerçek konuya bağlanır ve hedefli çalışma üretir", () => {
    const wrongs = [
      { id: "w1", date: "2026-11-20", exam: "TYT", subject: "Fizik", topic: "Kuvvet ve Hareket", subtopic: "Sürtünme", reason: "kavram", wrong: 3, note: "" },
      { id: "w2", date: "2026-11-20", exam: "TYT", subject: "Fizik", topic: "Kuvvet ve Hareket", subtopic: "Sürtünme", reason: "kavram", wrong: 2, note: "" },
    ];
    const day = "2026-11-21";
    const { slots, analyzedWrongIds } = E.buildDailyPlan(seed(), [], wrongs, [], [], S, [], day, new Set());
    const wa = slots.find((s: any) => s.kind === "Yanlış analizi");
    assert.ok(wa, "yanlış analizi görevi üretilmedi");
    assert.equal(wa.topic, "Kuvvet ve Hareket", `görev konusu gerçek konu olmalı, bulunan: ${wa.topic}`);
    assert.ok(Array.isArray(wa.wrongIds) && wa.wrongIds.length === 2, "wrongIds yanlış kayıtlarına bağlanmadı");
    // Görev ÜRETİLDİ ama kullanıcı henüz tamamlamadı → analiz edilmiş sayılmaz.
    assert.equal(analyzedWrongIds.length, 0, "görev üretmek tek başına analiz sayılmamalı");
    // Hedefli çalışma: aynı konuya bağlı soru çözümü.
    const targeted = slots.find((s: any) => s.kind === "Soru çözümü" && s.topic === "Kuvvet ve Hareket" && s.reason?.includes("hedefli"));
    assert.ok(targeted, "yanlış analizi sonrası hedefli çalışma görevi yok");
    // Kullanıcı görevi tamamladığında (günlük "Yanlış analizi" kaydı) işaretlenir.
    const done = [{ id: "d1", date: day, subject: "Fizik", topic: "Kuvvet ve Hareket", kind: "Yanlış analizi", minutes: 40, questions: null, correct: null, wrong: null, note: "" }];
    const r2 = E.buildDailyPlan(seed(), done, wrongs, [], [], S, [], day, new Set());
    assert.deepEqual([...r2.analyzedWrongIds].sort(), ["w1", "w2"], "tamamlanan görevin yanlışları işaretlenmedi");
  });

  it("iki farklı konunun yanlışı ayrı kimliklerle korunur", () => {
    const wrongs = [
      { id: "w1", date: "2026-11-20", exam: "TYT", subject: "Matematik", topic: "Problemler", subtopic: "", reason: "işlem", wrong: 2, note: "" },
      { id: "w2", date: "2026-11-20", exam: "TYT", subject: "Fizik", topic: "Kuvvet ve Hareket", subtopic: "", reason: "kavram", wrong: 2, note: "" },
    ];
    const { slots } = E.buildDailyPlan(seed(), [], wrongs, [], [], S, [], "2026-11-21", new Set());
    const was = slots.filter((s: any) => s.kind === "Yanlış analizi");
    const topics = was.map((s: any) => s.topic).sort();
    assert.deepEqual(topics, ["Kuvvet ve Hareket", "Problemler"], `konu kimlikleri ayrı korunmalı: ${topics}`);
  });

  it("tamamlanan yanlış sonraki gün yeniden analiz edilmez", () => {
    const wrongs = [
      { id: "w1", date: "2026-11-20", exam: "TYT", subject: "Matematik", topic: "Problemler", subtopic: "", reason: "işlem", wrong: 2, note: "" },
      { id: "w2", date: "2026-11-20", exam: "TYT", subject: "Fizik", topic: "Kuvvet ve Hareket", subtopic: "", reason: "kavram", wrong: 2, note: "" },
    ];
    const day1 = "2026-11-21";
    // Kullanıcı 1. gün her iki görevi de tamamladı.
    const done1 = [
      { id: "d1", date: day1, subject: "Matematik", topic: "Problemler", kind: "Yanlış analizi", minutes: 40, questions: null, correct: null, wrong: null, note: "" },
      { id: "d2", date: day1, subject: "Fizik", topic: "Kuvvet ve Hareket", kind: "Yanlış analizi", minutes: 40, questions: null, correct: null, wrong: null, note: "" },
    ];
    const r1 = E.buildDailyPlan(seed(), done1, wrongs, [], [], S, [], day1, new Set());
    assert.deepEqual([...r1.analyzedWrongIds].sort(), ["w1", "w2"], "tamamlanan görevler işaretlenmedi");
    const marks: Record<string, string> = {};
    for (const id of r1.analyzedWrongIds) marks[id] = day1;
    // Aynı gün: işaretli olsa bile görev görünür (ekran yenilenince kaybolmaz).
    const sameDay = E.buildDailyPlan(seed(), done1, wrongs, [], [], S, [], day1, new Set(), marks);
    assert.ok(sameDay.slots.some((s: any) => s.kind === "Yanlış analizi"), "aynı gün görev kayboldu");
    // Ertesi gün: işaretli yanlışlar için görev üretilmez.
    const nextDay = "2026-11-22";
    const r2 = E.buildDailyPlan(seed(), [], wrongs, [], [], S, [], nextDay, new Set(), marks);
    assert.equal(r2.slots.filter((s: any) => s.kind === "Yanlış analizi").length, 0, "ertesi gün mükerrer analiz üretildi");
  });
});
