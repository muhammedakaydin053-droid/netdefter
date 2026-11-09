/**
 * Tam dönem simülasyonu — 10.11.2026 → 20.06.2027.
 *
 * İki senaryo gerçek uygulama çağrısıyla (program.tsx biçimi) işletilir:
 *   1) hiç deneme/yanlış verisi yok,
 *   2) her cumartesi deneme sonucu + yanlış kaydı girilir ve planlanan yanlış
 *      analizi görevleri tamamlanır.
 *
 * Doğrulanan sözleşmeler:
 *   - boş akademik gün yok (görevler kaybolmaz),
 *   - TYT ve AYT ilk turu dönem içinde biter ve hedef tarihlere yakın kalır,
 *   - AYT ilk turu TYT'den ÖNCE bitmez (dengesizlik yok),
 *   - AYT kapıları sırayla açılır (Fizik < Kimya < Matematik),
 *   - tamamlanan yanlış analizleri kaydedilir ve tekrar üretilmez.
 *
 * `vite` ile yüklenir çünkü motor `@/` takma adı ve JSON importu kullanır.
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

const DAY = 86400000;
const addDays = (d: string, n: number) =>
  new Date(Date.parse(d + "T12:00:00Z") + n * DAY).toISOString().slice(0, 10);

const seed = () =>
  curriculum.map((t: any) => ({
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

const GATE_SUBJECTS = ["Fizik", "Kimya", "Matematik", "Biyoloji"];

function classifyMock(sl: any): "tam" | "brans" | "mini" {
  if (sl.topic === "Mini deneme") return "mini";
  if (typeof sl.topic === "string" && sl.topic.endsWith("branş denemesi")) return "brans";
  return "tam";
}

interface Metrics {
  gateOpen: Record<string, string>;
  lastLecture: { TYT: string | null; AYT: string | null };
  remaining: { TYT: number; AYT: number };
  kinds: Record<string, number>;
  mockType: Record<string, number>;
  branchBySubject: Record<string, number>;
  emptyDays: number;
  avgCapacity: number;
  wrongsCreated: number;
  wrongsScheduled: number;
  wrongsAnalyzed: number;
}

function runPeriod(opts: { withData: boolean }): Metrics {
  let topics = seed();
  let daily: any[] = [];
  let wrongs: any[] = [];
  let tytExams: any[] = [];
  const aytExams: any[] = [];
  const analyzedWrongs: Record<string, string> = {};
  const branchHistory: Record<string, string> = {};

  const gateOpen: Record<string, string> = {};
  const kinds: Record<string, number> = {};
  const mockType = { tam: 0, brans: 0, mini: 0 } as Record<string, number>;
  const branchBySubject: Record<string, number> = {};
  const capUsage: number[] = [];
  const scheduledWrongIds = new Set<string>();
  let emptyDays = 0;
  let wrongsCreated = 0;
  let lastTYT: string | null = null;
  let lastAYT: string | null = null;

  const END = "2027-06-20";
  for (let i = 0; ; i++) {
    const date = addDays(S.programStart, i);
    if (date > END) break;

    let r = E.buildDailyPlan(topics, daily, wrongs, tytExams, aytExams, S, [], date, new Set(), analyzedWrongs, branchHistory);

    // Kullanıcı, planlanan "Yanlış analizi" görevlerini tamamlar: bugünkü günlük
    // kaydı (mevcut tamamlama mekanizması) girilir ve ekran yeniden üretilir.
    const waSlots = r.slots.filter((s: any) => s.kind === "Yanlış analizi" && s.subject && s.topic);
    if (waSlots.length) {
      for (const sl of waSlots) {
        for (const id of sl.wrongIds ?? []) scheduledWrongIds.add(id);
        daily = [
          ...daily,
          { id: `d${daily.length}`, date, subject: sl.subject, topic: sl.topic, kind: "Yanlış analizi", minutes: sl.minutes, questions: 0, correct: 0, wrong: 0, note: "" },
        ];
      }
      r = E.buildDailyPlan(topics, daily, wrongs, tytExams, aytExams, S, [], date, new Set(), analyzedWrongs, branchHistory);
      for (const id of r.analyzedWrongIds) analyzedWrongs[id] = date;
    }
    if (r.branchMockSubject) {
      branchHistory[`TYT|${r.branchMockSubject}`] = date;
      branchBySubject[r.branchMockSubject] = (branchBySubject[r.branchMockSubject] ?? 0) + 1;
    }

    const academic = r.slots.filter((s: any) => s.exam && s.kind !== "Deneme" && s.kind !== "Yanlış analizi");
    if (academic.length === 0) emptyDays += 1;
    capUsage.push(r.slots.filter((s: any) => !s.life).reduce((a: number, s: any) => a + s.minutes, 0));

    for (const sl of r.slots) {
      kinds[sl.kind] = (kinds[sl.kind] ?? 0) + 1;
      if (sl.kind === "Deneme") mockType[classifyMock(sl)] += 1;
      if (sl.exam === "AYT" && sl.kind === "Konu anlatımı" && GATE_SUBJECTS.includes(sl.subject) && !gateOpen[sl.subject]) {
        gateOpen[sl.subject] = date;
      }
    }

    for (const sl of r.slots) {
      if (!sl.exam || sl.kind === "Deneme" || sl.kind === "Yanlış analizi") continue;
      if (sl.kind === "Konu anlatımı") {
        if (sl.exam === "TYT") lastTYT = date;
        else lastAYT = date;
        topics = topics.map((t: any) =>
          t.exam === sl.exam && t.subject === sl.subject && t.topic === sl.topic && t.status === "Başlamadım"
            ? { ...t, status: "Çalışıyorum", lastStudy: date }
            : t,
        );
      } else {
        topics = topics.map((t: any) => {
          if (!(t.exam === sl.exam && t.subject === sl.subject && t.topic === sl.topic)) return t;
          if (t.status === "Başlamadım") return t;
          const q = Math.max(15, sl.targetQ || 15);
          const total = (t.total ?? 0) + q;
          const correct = (t.correct ?? 0) + Math.round(q * 0.78);
          return { ...t, total, correct, lastStudy: date, status: total >= 15 && correct / total >= 0.7 ? "Bitti" : t.status };
        });
      }
    }

    if (opts.withData && new Date(date + "T12:00:00").getDay() === 6 && date >= "2026-11-21") {
      const subj = ["Matematik", "Fizik", "Kimya", "Biyoloji", "Türkçe"][i % 5];
      wrongs = [...wrongs, { id: `w${wrongsCreated++}`, date, exam: "TYT", subject: subj, topic: "Kuvvet ve Hareket", subtopic: "", reason: "kavram", wrong: 2, note: "" }];
      if (date <= "2027-05-01") {
        tytExams = [...tytExams, { id: `t${i}`, date, name: "T", turD: 20, turY: 5, matD: 18, matY: 7, sosD: 15, sosY: 5, fenD: 12, fenY: 8, note: "" }];
      }
    }
  }

  const ongoing = new Set(["Paragraf", "Problemler"]);
  const groups = new Map<string, any[]>();
  for (const t of topics) {
    const k = `${t.exam}|${t.subject}|${t.topic}`;
    groups.set(k, [...(groups.get(k) ?? []), t]);
  }
  let tytLeft = 0, aytLeft = 0;
  for (const rows of groups.values()) {
    if (ongoing.has(rows[0].topic)) continue;
    if (rows.every((r) => r.status === "Bitti")) continue;
    if (rows[0].exam === "TYT") tytLeft += 1;
    else aytLeft += 1;
  }

  return {
    gateOpen,
    lastLecture: { TYT: lastTYT, AYT: lastAYT },
    remaining: { TYT: tytLeft, AYT: aytLeft },
    kinds,
    mockType,
    branchBySubject,
    emptyDays,
    avgCapacity: Math.round(capUsage.reduce((a, b) => a + b, 0) / capUsage.length),
    wrongsCreated: wrongs.length,
    wrongsScheduled: scheduledWrongIds.size,
    wrongsAnalyzed: Object.keys(analyzedWrongs).length,
  };
}

describe("tam dönem simülasyonu (10.11.2026 – 20.06.2027)", () => {
  let A: Metrics;
  let B: Metrics;
  before(() => {
    A = runPeriod({ withData: false });
    B = runPeriod({ withData: true });
  });

  it("senaryo 1 — boş akademik gün yok, tüm konular işlenir", () => {
    assert.equal(A.emptyDays, 0, `${A.emptyDays} boş akademik gün`);
    assert.equal(A.remaining.TYT, 0, `TYT'de ${A.remaining.TYT} konu kaldı`);
    assert.equal(A.remaining.AYT, 0, `AYT'de ${A.remaining.AYT} konu kaldı`);
  });

  it("senaryo 1 — ilk tur hedeflerine yetişilir, AYT TYT'den önce bitmez", () => {
    assert.ok(A.lastLecture.TYT, "TYT anlatımı hiç yapılmadı");
    assert.ok(A.lastLecture.AYT, "AYT anlatımı hiç yapılmadı");
    assert.ok(A.lastLecture.TYT! <= "2027-02-08", `TYT ilk tur ${A.lastLecture.TYT} (hedef 08.02.2027)`);
    assert.ok(A.lastLecture.AYT! <= "2027-04-23", `AYT ilk tur ${A.lastLecture.AYT} (hedef 23.04.2027)`);
    assert.ok(A.lastLecture.AYT! >= A.lastLecture.TYT!, "AYT TYT'den önce bitti (dengesizlik)");
  });

  it("AYT kapıları sırayla açılır (Fizik < Kimya < Matematik)", () => {
    const g = A.gateOpen;
    assert.ok(g.Fizik, "AYT Fizik açılmadı");
    assert.ok(g.Kimya, "AYT Kimya açılmadı");
    assert.ok(g.Matematik, "AYT Matematik açılmadı");
    assert.ok(g.Fizik < g.Kimya, `Fizik ${g.Fizik} >= Kimya ${g.Kimya}`);
    assert.ok(g.Kimya < g.Matematik, `Kimya ${g.Kimya} >= Matematik ${g.Matematik}`);
  });

  it("senaryo 1 — deneme döngüsü çalışır", () => {
    assert.ok(A.mockType.tam >= 20, `tam deneme az: ${A.mockType.tam}`);
    assert.equal(A.kinds["Konu anlatımı"], 184, "öğretilebilir konu sayısı 184 olmalı");
  });

  it("senaryo 2 — girilen yanlışlar görevlendirilir ve tamamlanınca analiz edilir", () => {
    assert.ok(B.wrongsCreated > 0, "hiç yanlış üretilmedi");
    assert.ok(B.kinds["Yanlış analizi"] > 0, "yanlış analizi görevi üretilmedi");
    assert.equal(B.wrongsScheduled, B.wrongsCreated, "görevlendirilmeyen yanlış kaldı (kayboldu)");
    assert.equal(B.wrongsAnalyzed, B.wrongsCreated, "tamamlanan yanlış analiz edilmedi");
    assert.equal(B.emptyDays, 0, `${B.emptyDays} boş akademik gün`);
    assert.equal(B.remaining.TYT, 0, `TYT'de ${B.remaining.TYT} konu kaldı`);
    assert.equal(B.remaining.AYT, 0, `AYT'de ${B.remaining.AYT} konu kaldı`);
  });

  it("senaryo 2 — ilk tur hedeflerine yetişilir, AYT TYT'den önce bitmez", () => {
    assert.ok(B.lastLecture.TYT! <= "2027-02-08", `TYT ilk tur ${B.lastLecture.TYT} (hedef 08.02.2027)`);
    assert.ok(B.lastLecture.AYT! <= "2027-04-23", `AYT ilk tur ${B.lastLecture.AYT} (hedef 23.04.2027)`);
    assert.ok(B.lastLecture.AYT! >= B.lastLecture.TYT!, "AYT TYT'den önce bitti (dengesizlik)");
  });

  it("rapor — kapı açılışları ve tur bitişleri (bilgi amaçlı)", () => {
    // Bu test sayıları doğrulamaz; rapor için konsola yazar.
    console.log("SENARYO 1:", JSON.stringify({ gate: A.gateOpen, last: A.lastLecture, mock: A.mockType, kinds: A.kinds, cap: A.avgCapacity }));
    console.log("SENARYO 2:", JSON.stringify({ gate: B.gateOpen, last: B.lastLecture, mock: B.mockType, kinds: B.kinds, branch: B.branchBySubject, cap: B.avgCapacity }));
    assert.ok(true);
  });
});
