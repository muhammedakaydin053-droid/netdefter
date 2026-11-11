/**
 * Tam dönem simülasyonu — 11.11.2026 → 20.06.2027.
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
  fullByExam: { TYT: number; AYT: number };
  /** Tam denemeler, tarih ve sınav türüyle (dönemsel dağılım analizi için). */
  fullMocks: { date: string; exam: "TYT" | "AYT" }[];
  branchBySubject: Record<string, number>;
  emptyDays: number;
  overCapacityDays: number;
  avgCapacity: number;
  wrongsCreated: number;
  wrongsScheduled: number;
  wrongsAnalyzed: number;
  /** AYT dersi → ilk/son anlatım tarihi ve en uzun anlatım arası (gün). */
  aytLecture: Record<string, { first: string; last: string; maxGap: number; gapAt: string }>;
  /** Kapı açılış tarihinde ön koşulu tamamlanmış mı (ders → bool). */
  gatePrereqReady: Record<string, boolean>;
}

const AYT_SUBJECTS = ["Fizik", "Kimya", "Biyoloji", "Matematik", "Geometri"];
/** Sınav günleri: akademik görev atanmaz (H1). Boş gün sayımından hariçtir. */
const EXAM_DAYS = new Set(["2027-06-19", "2027-06-20"]);
/** Kapasite eğrisi (`budget.ts` ile aynı): 330/390/480. */
const MONTH_CAP: Record<string, number> = {
  "2026-11": 330, "2026-12": 390,
  "2027-01": 480, "2027-02": 480, "2027-03": 480, "2027-04": 480, "2027-05": 480, "2027-06": 480,
};

function runPeriod(opts: { withData: boolean | "both" }): Metrics {
  const recordTyt = opts.withData === true || opts.withData === "both";
  const recordAyt = opts.withData === "both";
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
  const fullByExam = { TYT: 0, AYT: 0 };
  const fullMocks: { date: string; exam: "TYT" | "AYT" }[] = [];
  const branchBySubject: Record<string, number> = {};
  const capUsage: number[] = [];
  const scheduledWrongIds = new Set<string>();
  const lectureDates: Record<string, string[]> = {};
  const gatePrereqReady: Record<string, boolean> = {};
  let emptyDays = 0;
  let overCapacityDays = 0;
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
    // Sınav günleri (19–20.06.2027) tasarım gereği boştur; boş gün sayımaz.
    if (academic.length === 0 && !EXAM_DAYS.has(date)) emptyDays += 1;
    const dayMinutes = r.slots.filter((s: any) => !s.life).reduce((a: number, s: any) => a + s.minutes, 0);
    capUsage.push(dayMinutes);
    if (dayMinutes > MONTH_CAP[date.slice(0, 7)]) overCapacityDays += 1;

    for (const sl of r.slots) {
      kinds[sl.kind] = (kinds[sl.kind] ?? 0) + 1;
      if (sl.kind === "Deneme") {
        const kind = classifyMock(sl);
        mockType[kind] += 1;
        if (kind === "tam") {
          fullByExam[sl.exam as "TYT" | "AYT"] += 1;
          fullMocks.push({ date, exam: sl.exam as "TYT" | "AYT" });
        }
      }
      if (sl.exam === "AYT" && sl.kind === "Konu anlatımı") {
        (lectureDates[sl.subject] ??= []).push(date);
      }
      if (sl.exam === "AYT" && sl.kind === "Konu anlatımı" && GATE_SUBJECTS.includes(sl.subject) && !gateOpen[sl.subject]) {
        gateOpen[sl.subject] = date;
        // Kapı açılırken ön koşul gerçekten tamamlanmış mı? Öğrenilmiş sayılan
        // (Bitti + 15 soru + %70) konulara bakılır; aksi hâlde kapı erken açılmış.
        const rows = topics.filter(
          (t: any) => t.exam === "TYT" && t.subject === sl.subject,
        );
        const gateNames: Record<string, string[]> = {
          Matematik: ["Temel Kavramlar", "Sayı Basamakları", "Bölme ve Bölünebilme", "EBOB – EKOK", "Rasyonel Sayılar", "Basit Eşitsizlikler", "Mutlak Değer", "Üslü Sayılar", "Köklü Sayılar", "Çarpanlara Ayırma", "Oran – Orantı", "Denklem Çözme"],
          Fizik: ["Fizik Bilimine Giriş", "Madde ve Özellikleri", "Hareket ve Kuvvet", "İş, Güç ve Enerji"],
          Kimya: ["Kimya Bilimi", "Atom ve Periyodik Sistem", "Kimyasal Türler Arası Etkileşimler", "Kimyanın Temel Kanunları", "Mol ve Kimyasal Hesaplamalar"],
        };
        const names = gateNames[sl.subject];
        if (names) {
          gatePrereqReady[sl.subject] = names.every((name) => {
            const rows2 = rows.filter((t: any) => t.topic === name);
            return rows2.length > 0 && rows2.every((t: any) => t.status === "Bitti" && (t.total ?? 0) >= 15 && (t.correct ?? 0) / (t.total ?? 1) >= 0.7);
          });
        }
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

    if (recordTyt && new Date(date + "T12:00:00").getDay() === 6 && date >= "2026-11-21" && !EXAM_DAYS.has(date)) {
      const subj = ["Matematik", "Fizik", "Kimya", "Biyoloji", "Türkçe"][i % 5];
      wrongs = [...wrongs, { id: `w${wrongsCreated++}`, date, exam: "TYT", subject: subj, topic: "Kuvvet ve Hareket", subtopic: "", reason: "kavram", wrong: 2, note: "" }];
      if (date <= "2027-05-01") {
        tytExams = [...tytExams, { id: `t${i}`, date, name: "T", turD: 20, turY: 5, matD: 18, matY: 7, sosD: 15, sosY: 5, fenD: 12, fenY: 8, note: "" }];
      }
    }
    // "both" senaryosunda planlanan AYT tam denemesi sonucu da girilir.
    if (recordAyt) {
      const aytMock = r.slots.find((s: any) => s.kind === "Deneme" && s.exam === "AYT");
      if (aytMock) {
        aytExams.push({ id: `a${i}`, date, name: "A", matD: 12, matY: 6, fizD: 8, fizY: 4, kimD: 7, kimY: 3, bioD: 8, bioY: 2, note: "" });
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

  const aytLecture: Record<string, { first: string; last: string; maxGap: number; gapAt: string }> = {};
  for (const subject of AYT_SUBJECTS) {
    const dates = [...new Set(lectureDates[subject] ?? [])].sort();
    if (!dates.length) continue;
    let maxGap = 0;
    let gapAt = "";
    for (let j = 1; j < dates.length; j++) {
      const gap = Math.round(
        (Date.parse(dates[j] + "T12:00:00Z") - Date.parse(dates[j - 1] + "T12:00:00Z")) / DAY,
      );
      if (gap > maxGap) {
        maxGap = gap;
        gapAt = `${dates[j - 1]}→${dates[j]}`;
      }
    }
    aytLecture[subject] = { first: dates[0], last: dates[dates.length - 1], maxGap, gapAt };
  }

  return {
    gateOpen,
    lastLecture: { TYT: lastTYT, AYT: lastAYT },
    remaining: { TYT: tytLeft, AYT: aytLeft },
    kinds,
    mockType,
    fullByExam,
    fullMocks,
    branchBySubject,
    emptyDays,
    overCapacityDays,
    avgCapacity: Math.round(capUsage.reduce((a, b) => a + b, 0) / capUsage.length),
    wrongsCreated: wrongs.length,
    wrongsScheduled: scheduledWrongIds.size,
    wrongsAnalyzed: Object.keys(analyzedWrongs).length,
    aytLecture,
    gatePrereqReady,
  };
}

describe("tam dönem simülasyonu (11.11.2026 – 20.06.2027)", () => {
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
    assert.ok(A.lastLecture.TYT! <= "2027-02-15", `TYT ilk tur ${A.lastLecture.TYT} (hedef 15.02.2027)`);
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
    assert.ok(B.lastLecture.TYT! <= "2027-02-15", `TYT ilk tur ${B.lastLecture.TYT} (hedef 15.02.2027)`);
    assert.ok(B.lastLecture.AYT! <= "2027-04-23", `AYT ilk tur ${B.lastLecture.AYT} (hedef 23.04.2027)`);
    assert.ok(B.lastLecture.AYT! >= B.lastLecture.TYT!, "AYT TYT'den önce bitti (dengesizlik)");
  });

  it("rapor — kapı açılışları ve tur bitişleri (bilgi amaçlı)", () => {
    // Bu test sayıları doğrulamaz; rapor için konsola yazar.
    console.log("SENARYO 1:", JSON.stringify({ gate: A.gateOpen, last: A.lastLecture, mock: A.mockType, full: A.fullByExam, kinds: A.kinds, cap: A.avgCapacity }));
    console.log("SENARYO 2:", JSON.stringify({ gate: B.gateOpen, last: B.lastLecture, mock: B.mockType, full: B.fullByExam, kinds: B.kinds, branch: B.branchBySubject, cap: B.avgCapacity }));
    assert.ok(true);
  });
});

describe("AYT ders devamlılığı (maksimum bekleme)", () => {
  let A: Metrics;
  let B: Metrics;
  before(() => {
    A = runPeriod({ withData: false });
    B = runPeriod({ withData: true });
  });

  // Eşik: kapı açıldıktan sonra bir AYT dersi en fazla bu kadar gün yeni konu
  // anlatımı almadan bekleyebilir. Motor `AYT_MAX_WAIT_DAYS = 10` kullanır;
  // gün döngüsü nedeniyle gözlenen boşluk birkaç gün daha büyük olabilir.
  const MAX_GAP = 14;

  it("AYT Fizik 46 gün beklemez; maksimum anlatım arası sınırda kalır", () => {
    for (const [label, m] of [["senaryo 1", A], ["senaryo 2", B]] as const) {
      const f = m.aytLecture.Fizik;
      assert.ok(f, `${label}: AYT Fizik anlatımı yok`);
      assert.ok(f.maxGap <= MAX_GAP, `${label}: AYT Fizik ${f.maxGap} gün bekledi (${f.gapAt})`);
      assert.ok(f.maxGap < 46, `${label}: AYT Fizik eski 46 günlük boşluğa döndü (${f.gapAt})`);
    }
  });

  it("kapısı açık ve tamamlanmamış tüm AYT dersleri maksimum beklemeye uyar", () => {
    for (const [label, m] of [["senaryo 1", A], ["senaryo 2", B]] as const) {
      for (const subject of AYT_SUBJECTS) {
        const s = m.aytLecture[subject];
        assert.ok(s, `${label}: AYT ${subject} anlatımı yok`);
        assert.ok(
          s.maxGap <= MAX_GAP,
          `${label}: AYT ${subject} ${s.maxGap} gün bekledi (${s.gapAt})`,
        );
      }
    }
  });

  it("kapısı açılmamış dersler erkenden başlamaz", () => {
    for (const [label, m] of [["senaryo 1", A], ["senaryo 2", B]] as const) {
      const g = m.gateOpen;
      assert.ok(g.Fizik && g.Kimya && g.Matematik, `${label}: kapı açılışları eksik`);
      // Fizik kapısı en erken açılan AYT dersidir; ondan önce hiçbir AYT dersi
      // anlatılmamış olmalı (TYT önceliği).
      for (const subject of AYT_SUBJECTS) {
        const first = m.aytLecture[subject]?.first;
        if (!first) continue;
        assert.ok(
          first >= g.Fizik,
          `${label}: AYT ${subject} ilk anlatımı ${first}, ilk kapı ${g.Fizik}'den önce`,
        );
      }
      assert.ok(g.Fizik < g.Kimya, `${label}: Fizik ${g.Fizik} >= Kimya ${g.Kimya}`);
      assert.ok(g.Kimya < g.Matematik, `${label}: Kimya ${g.Kimya} >= Matematik ${g.Matematik}`);
    }
  });

  it("kapı açılırken ön koşul konuları gerçekten öğrenilmiş olur", () => {
    for (const [label, m] of [["senaryo 1", A], ["senaryo 2", B]] as const) {
      for (const subject of ["Fizik", "Kimya", "Matematik"]) {
        assert.equal(
          m.gatePrereqReady[subject],
          true,
          `${label}: AYT ${subject} kapısı ön koşulu tamamlanmadan açıldı`,
        );
      }
    }
  });

  it("tamamlanan dersler yeniden anlatılmaz (her konu bir kez anlatılır)", () => {
    for (const [label, m] of [["senaryo 1", A], ["senaryo 2", B]] as const) {
      assert.equal(
        m.kinds["Konu anlatımı"],
        184,
        `${label}: konu anlatımı sayısı 184 değil (${m.kinds["Konu anlatımı"]}) — tekrar anlatım olabilir`,
      );
    }
  });

  it("TYT ilerlemesi bozulmaz (hedefe yetişir, AYT'den önce biter)", () => {
    for (const [label, m] of [["senaryo 1", A], ["senaryo 2", B]] as const) {
      assert.ok(
        m.lastLecture.TYT! <= "2027-02-15",
        `${label}: TYT ilk tur ${m.lastLecture.TYT} (hedef 15.02.2027)`,
      );
      assert.equal(m.remaining.TYT, 0, `${label}: TYT'de ${m.remaining.TYT} konu kaldı`);
      assert.ok(
        m.lastLecture.AYT! >= m.lastLecture.TYT!,
        `${label}: AYT TYT'den önce bitti`,
      );
    }
  });

  it("kapasite aşılmaz, boş akademik gün olmaz", () => {
    for (const [label, m] of [["senaryo 1", A], ["senaryo 2", B]] as const) {
      assert.equal(m.overCapacityDays, 0, `${label}: ${m.overCapacityDays} günde kapasite aşıldı`);
      assert.equal(m.emptyDays, 0, `${label}: ${m.emptyDays} boş akademik gün`);
    }
  });
});

describe("TYT–AYT tam deneme dengesi (sonuç kaydından bağımsız)", () => {
  // Üç senaryo AYNI dönem ve temel ayarlarla koşulur; tek değişken hangi sınavın
  // sonucunun girildiğidir. Temel TYT–AYT tam deneme dağılımı bu değişkene göre
  // tersine dönmemelidir.
  let noResult: Metrics;
  let onlyTyt: Metrics;
  let both: Metrics;
  before(() => {
    noResult = runPeriod({ withData: false });
    onlyTyt = runPeriod({ withData: true });
    both = runPeriod({ withData: "both" } as never);
  });

  it("üç senaryoda da TYT tam denemesi AYT'den fazladır (TYT önceliği)", () => {
    for (const [label, m] of [["sonuç yok", noResult], ["yalnız TYT", onlyTyt], ["TYT+AYT", both]] as const) {
      assert.ok(
        m.fullByExam.TYT > m.fullByExam.AYT,
        `${label}: TYT ${m.fullByExam.TYT} <= AYT ${m.fullByExam.AYT} (TYT önceliği bozuldu)`,
      );
    }
  });

  it("hiçbir senaryoda AYT tam denemesi bastırılmaz", () => {
    for (const [label, m] of [["sonuç yok", noResult], ["yalnız TYT", onlyTyt], ["TYT+AYT", both]] as const) {
      assert.ok(m.fullByExam.AYT >= 5, `${label}: AYT tam denemesi çok az (${m.fullByExam.AYT})`);
      assert.ok(m.fullByExam.TYT >= 5, `${label}: TYT tam denemesi çok az (${m.fullByExam.TYT})`);
    }
  });

  it("rapor — üç senaryonun tam deneme sayıları (bilgi amaçlı)", () => {
    console.log(
      "DENEME DAĞILIMI:",
      JSON.stringify({
        sonucYok: noResult.fullByExam,
        yalnizTyt: onlyTyt.fullByExam,
        tytAyt: both.fullByExam,
      }),
    );
    assert.ok(true);
  });
});

// Dönem sınırları: 2:1 fazı (TYT ilk turu), 1:1 fazı (ilk tur sonrası) ve son
// 60 gün. 1:1 kuralı 06.02.2027'de (round1Done) ve 20.04.2027'de (≤60 gün)
// devreye girer; ikinci dönem round1Done ile, üçüncü dönem her iki koşulla da
// kapsanır.
const PERIODS = [
  { id: "P1", label: "11.11.2026–05.02.2027 (2:1 fazı)", from: "2026-11-11", to: "2027-02-05", rule: "2:1" as const },
  { id: "P2", label: "06.02.2027–20.04.2027 (round1 sonrası 1:1)", from: "2027-02-06", to: "2027-04-20", rule: "1:1" as const },
  { id: "P3", label: "21.04.2027–20.06.2027 (son 60 gün 1:1)", from: "2027-04-21", to: "2027-06-20", rule: "1:1" as const },
];

function periodCounts(m: Metrics, p: (typeof PERIODS)[number]) {
  const rows = m.fullMocks.filter((f) => f.date >= p.from && f.date <= p.to);
  const tyt = rows.filter((r) => r.exam === "TYT").length;
  const ayt = rows.filter((r) => r.exam === "AYT").length;
  return { tyt, ayt, rows };
}

describe("dönemsel tam deneme dağılımı (tarih bazlı)", () => {
  let noResult: Metrics;
  let onlyTyt: Metrics;
  let both: Metrics;
  before(() => {
    noResult = runPeriod({ withData: false });
    onlyTyt = runPeriod({ withData: true });
    both = runPeriod({ withData: "both" } as never);
  });

  it("P1 (2:1 fazı) — TYT ağırlıklı, AYT tamamen bastırılmaz", () => {
    for (const [label, m] of [["sonuç yok", noResult], ["yalnız TYT", onlyTyt], ["TYT+AYT", both]] as const) {
      const { tyt, ayt } = periodCounts(m, PERIODS[0]);
      assert.ok(tyt > 0, `${label}: P1'de TYT tam denemesi yok`);
      assert.ok(tyt >= ayt, `${label}: P1 TYT ${tyt} < AYT ${ayt} (2:1 fazı TYT ağırlıklı olmalı)`);
    }
  });

  it("P2 (round1 sonrası 1:1) — AYT tam denemesi gerçekten üretilir, TYT'ye kaymaz", () => {
    // Regresyon: kadans ile dönüşüm aynı sayaca bağlıyken bu dönem 5 TYT / 0 AYT
    // üretiyordu (1:1 kuralı aktif ama etkisizdi).
    for (const [label, m] of [["sonuç yok", noResult], ["yalnız TYT", onlyTyt], ["TYT+AYT", both]] as const) {
      const { tyt, ayt } = periodCounts(m, PERIODS[1]);
      assert.ok(tyt + ayt >= 4, `${label}: P2'de yeterli tam deneme yok (${tyt + ayt})`);
      assert.ok(ayt >= 2, `${label}: P2'de AYT tam denemesi yetersiz (${ayt}) — 1:1 uygulanmıyor`);
      // Sistematik TYT kayması yok: oran 2:1'i aşmamalı.
      assert.ok(tyt <= ayt + 1, `${label}: P2 TYT ${tyt} / AYT ${ayt} — TYT lehine sistematik kayma`);
    }
  });

  it("P3 (son 60 gün 1:1) — dağılım dengeli (oran 1:1 civarı)", () => {
    for (const [label, m] of [["sonuç yok", noResult], ["yalnız TYT", onlyTyt], ["TYT+AYT", both]] as const) {
      const { tyt, ayt } = periodCounts(m, PERIODS[2]);
      assert.ok(tyt + ayt >= 10, `${label}: P3'te yeterli tam deneme yok (${tyt + ayt})`);
      assert.ok(ayt >= 5, `${label}: P3'te AYT tam denemesi yetersiz (${ayt})`);
      const ratio = tyt / ayt;
      assert.ok(ratio >= 0.75 && ratio <= 1.33, `${label}: P3 TYT/AYT oranı ${ratio.toFixed(2)} (1:1 olmalı)`);
    }
  });

  it("1:1 dönemleri (P2+P3) toplamda 1:1'e oturur", () => {
    for (const [label, m] of [["sonuç yok", noResult], ["yalnız TYT", onlyTyt], ["TYT+AYT", both]] as const) {
      const p2 = periodCounts(m, PERIODS[1]);
      const p3 = periodCounts(m, PERIODS[2]);
      const tyt = p2.tyt + p3.tyt;
      const ayt = p2.ayt + p3.ayt;
      assert.ok(Math.abs(tyt - ayt) <= 2, `${label}: 1:1 dönemleri TYT ${tyt} / AYT ${ayt} — dengesiz`);
    }
  });

  it("sonuç kaydı dönemsel dağılımı değiştirmez (üç senaryo tutarlı)", () => {
    for (const p of PERIODS) {
      const counts = [noResult, onlyTyt, both].map((m) => periodCounts(m, p));
      const tytValues = counts.map((c) => c.tyt);
      const aytValues = counts.map((c) => c.ayt);
      assert.ok(
        Math.max(...tytValues) - Math.min(...tytValues) <= 2,
        `${p.label}: TYT sayıları senaryolar arası savruluyor (${tytValues.join(", ")})`,
      );
      assert.ok(
        Math.max(...aytValues) - Math.min(...aytValues) <= 2,
        `${p.label}: AYT sayıları senaryolar arası savruluyor (${aytValues.join(", ")})`,
      );
    }
  });

  it("deneme kadansı bozulmaz (branş/mini gereksiz artmaz, boş deneme günü olmaz)", () => {
    for (const [label, m] of [["sonuç yok", noResult], ["yalnız TYT", onlyTyt], ["TYT+AYT", both]] as const) {
      assert.equal(m.mockType.mini, 0, `${label}: mini deneme beklenmiyordu (${m.mockType.mini})`);
      assert.ok(m.mockType.brans <= 14, `${label}: branş denemesi arttı (${m.mockType.brans})`);
      assert.ok(m.mockType.tam >= 24, `${label}: tam deneme azaldı (${m.mockType.tam})`);
      assert.equal(m.emptyDays, 0, `${label}: boş akademik gün`);
      assert.equal(m.overCapacityDays, 0, `${label}: kapasite aşımı`);
    }
  });

  it("rapor — dönemsel dağılım (bilgi amaçlı)", () => {
    for (const [label, m] of [["sonuç yok", noResult], ["yalnız TYT", onlyTyt], ["TYT+AYT", both]] as const) {
      const parts = PERIODS.map((p) => {
        const c = periodCounts(m, p);
        return `${p.id} ${c.tyt}/${c.ayt}`;
      });
      console.log(`DÖNEM DAĞILIMI (${label}):`, parts.join(" | "));
    }
    assert.ok(true);
  });
});
