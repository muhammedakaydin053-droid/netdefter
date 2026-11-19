/**
 * Dondurulmuş program penceresi — STORE ENTEGRASYON testleri.
 *
 * NEDEN AYRI DOSYA: `frozen.test.ts` yalnızca `ensureFrozen` saf fonksiyonunu
 * sınar. Aşama 1 denetiminde görüldü ki asıl hata store'un `ensurePlan`
 * aksiyonundaydı: `planPace.from` her gün ilerlediği için `frozenPlanFrom` ile
 * karşılaştırma "pencere geçersiz" sanılıyor ve her gün geçişinde gelecek
 * görevler yeniden üretiliyordu. Bu dosya GERÇEK store aksiyonunu (`ensurePlan`,
 * `updateSettings`, `resetAll`, `restoreBackup`, `importData`, `updateTopic`,
 * `addDaily`, `addWrong`) çalıştırır; böylece aynı hata bir daha gizlenemez.
 *
 * Zaman, `Date` globali sarmalanarak kontrol edilir; `todayISO()` bu sarmalayıcıyı
 * okur. Böylece "ertesi gün uygulamayı açma" gerçekçi biçimde simüle edilir.
 *
 * `vite` ile yüklenir çünkü store `@/` takma adı ve JSON importu kullanır.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type ViteDevServer } from "vite";

let server: ViteDevServer;
let S: any, T: any, DEFAULT_SETTINGS: any;

/** Sahte "bugün". `todayISO()` bunu okur. */
let FAKE_TODAY = "2026-11-17";
const RealDate = Date;
class FakeDate extends RealDate {
  constructor(...args: any[]) {
    if (args.length === 0) super(FAKE_TODAY + "T12:00:00");
    else super(args[0]);
  }
  static now() {
    return new RealDate(FAKE_TODAY + "T12:00:00").getTime();
  }
}

before(async () => {
  (globalThis as any).Date = FakeDate as any;
  server = await createServer({ server: { middlewareMode: true }, logLevel: "silent" });
  S = await server.ssrLoadModule("/src/lib/store.ts");
  T = await server.ssrLoadModule("/src/lib/smart/types.ts");
  DEFAULT_SETTINGS = T.DEFAULT_SETTINGS;
});

after(async () => {
  (globalThis as any).Date = RealDate;
  await server?.close();
});

const st = () => S.useAppStore.getState();
const DAY = 86400000;
const addDays = (d: string, n: number) =>
  new RealDate(Date.parse(d + "T12:00:00Z") + n * DAY).toISOString().slice(0, 10);

/** Store'u temiz bir başlangıç durumuna getirir; aksiyonlar korunur. */
function resetStore(programStart: string) {
  S.useAppStore.setState({
    topics: S.seedTopics(),
    archivedTopics: [],
    wrongs: [],
    tytExams: [],
    aytExams: [],
    daily: [],
    settings: { ...DEFAULT_SETTINGS, programStart },
    carry: [],
    analyzedWrongs: {},
    branchMockHistory: {},
    frozenPlan: {},
    frozenPlanFrom: "",
    backup: null,
    lastAiComment: null,
  });
}

/** Bir günün dondurulmuş görevlerini (kimlik + içerik) imzaya çevirir. */
const daySig = (plan: any, date: string) =>
  (plan[date]?.slots ?? [])
    .map((s: any) => `${s.id}::${s.exam}|${s.subject}|${s.topic}|${s.kind}|${s.minutes}`)
    .join(" > ");

/** Pencerenin örtüşen günlerinde kaç günün değiştiğini döndürür. */
function overlapDiff(before: any, after: any) {
  let changed = 0;
  let overlap = 0;
  for (const d of Object.keys(before)) {
    if (!after[d]) continue;
    overlap++;
    if (daySig(before, d) !== daySig(after, d)) changed++;
  }
  return { changed, overlap };
}

/**
 * Aynı görev kimliğinin farklı içerikle kullanılıp kullanılmadığını denetler.
 * İki planda da görünen bir `id`, her zaman AYNI görevi temsil etmelidir.
 */
function idContentMismatches(a: any, b: any) {
  const seen = new Map<string, string>();
  let mismatches = 0;
  for (const plan of [a, b]) {
    for (const d of Object.keys(plan)) {
      for (const s of plan[d]?.slots ?? []) {
        const content = `${s.exam}|${s.subject}|${s.topic}|${s.kind}`;
        if (seen.has(s.id) && seen.get(s.id) !== content) mismatches++;
        else seen.set(s.id, content);
      }
    }
  }
  return mismatches;
}

const TYT = (subject: string) => (t: any) => t.exam === "TYT" && t.subject === subject;
const AYT = (subject: string) => (t: any) => t.exam === "AYT" && t.subject === subject;

/** Store aksiyonuyla bir konuyu günceller (gerçek kod yolu). */
function setTopic(predicate: (t: any) => boolean, patch: any) {
  const row = st().topics.find(predicate);
  assert.ok(row, "hedef konu bulunamadı");
  st().updateTopic(row.id, patch);
  return row;
}

// ── 1. Gün geçişi kararlılığı (K1'in doğrudan regresyon testi) ──────────────

for (const start of ["2026-11-17", "2026-12-03"]) {
  describe(`store.ensurePlan — gün geçişi kararlılığı (başlangıç ${start})`, () => {
    it("1/2/7/14/30/31/45/60 gün ilerlemede örtüşen görevler DEĞİŞMEZ", () => {
      resetStore(start);
      FAKE_TODAY = start;
      st().ensurePlan();
      const base = JSON.parse(JSON.stringify(st().frozenPlan));
      assert.equal(Object.keys(base).length, 30, "ilk pencere 30 gün olmalı");

      for (const g of [1, 2, 7, 14, 30, 31, 45, 60]) {
        FAKE_TODAY = addDays(start, g);
        st().ensurePlan();
        const now = st().frozenPlan;
        const { changed, overlap } = overlapDiff(base, now);
        assert.equal(changed, 0, `Gün+${g}: ${overlap} örtüşen günden ${changed} tanesi değişti`);
        assert.equal(idContentMismatches(base, now), 0, `Gün+${g}: görev kimliği farklı içerikle kullanıldı`);
      }
    });

    it("pencere ileri kayar: yeni günler eklenir, geçmiş korunur", () => {
      resetStore(start);
      FAKE_TODAY = start;
      st().ensurePlan();
      const base = JSON.parse(JSON.stringify(st().frozenPlan));
      const baseLast = Object.keys(base).sort().at(-1)!;

      FAKE_TODAY = addDays(start, 3);
      st().ensurePlan();
      const now = st().frozenPlan;
      const nowLast = Object.keys(now).sort().at(-1)!;
      assert.ok(nowLast > baseLast, "pencere ileri kaymadı");
      // Kullanıcı verisi hiç girilmediyse eski günler birebir korunmalı.
      assert.equal(overlapDiff(base, now).changed, 0, "örtüşen günler değişti");
    });
  });
}

// ── 2. Kullanıcı verisi girişi planı kaydırmamalı ──────────────────────────

describe("store — kullanıcı verisi girişi geleceği değiştirmez", () => {
  const start = "2026-11-17";

  const scenarios: [string, () => void][] = [
    ["(1) yeni konuya Çalışıyorum", () => setTopic(TYT("Coğrafya"), { status: "Çalışıyorum" })],
    ["(2) soru sonuçları kaydet", () => setTopic(TYT("Tarih"), { status: "Çalışıyorum", total: 40, correct: 30, wrong: 10 })],
    ["(3) konuyu Bitti yap", () => setTopic(TYT("Kimya"), { status: "Bitti", total: 60, correct: 52, wrong: 8 })],
    ["(4) Tekrar Gerekli durumu", () => setTopic(TYT("Fizik"), { status: "Tekrar Gerekli", total: 30, correct: 12, wrong: 18 })],
    [
      "(5) yeni tekrar ihtiyacı (düşük başarı)",
      () => setTopic(TYT("Biyoloji"), { status: "Çalışıyorum", total: 20, correct: 9, wrong: 11 }),
    ],
    [
      "(6) TYT dersini tamamen bitir",
      () => {
        for (const t of st().topics.filter(TYT("Felsefe"))) {
          st().updateTopic(t.id, { status: "Bitti", total: 20, correct: 17, wrong: 3 });
        }
      },
    ],
    [
      "(7) AYT konusuna ilerleme kaydet",
      () => setTopic(AYT("Kimya"), { status: "Çalışıyorum", total: 25, correct: 19, wrong: 6 }),
    ],
    [
      "(8) günlük kaydı (soru)",
      () => st().addDaily({ date: start, exam: "TYT", subject: "Türkçe", topic: "Paragraf", kind: "Soru çözümü", minutes: 60, questions: 40, correct: 32, wrong: 8 }),
    ],
    [
      "(9) yanlış kaydı",
      () => st().addWrong({ date: start, exam: "TYT", subject: "Matematik", topic: "Temel Kavramlar", subtopic: "", source: "", questionNo: "5", reason: "Dikkatsizlik", note: "", reviewDate: "", result: "" }),
    ],
  ];

  for (const [label, mutate] of scenarios) {
    it(`${label} → aynı gün ve ertesi gün örtüşen görevler değişmez`, () => {
      resetStore(start);
      FAKE_TODAY = start;
      st().ensurePlan();
      const base = JSON.parse(JSON.stringify(st().frozenPlan));

      // Gerçek store aksiyonuyla veri gir.
      mutate();

      // Aynı gün: pencere hiç değişmemeli.
      st().ensurePlan();
      const sameDay = st().frozenPlan;
      assert.equal(overlapDiff(base, sameDay).changed, 0, "aynı gün planı kaydı");
      assert.equal(idContentMismatches(base, sameDay), 0, "aynı gün: kimlik-içerik uyuşmazlığı");

      // Ertesi gün: örtüşen günler yine değişmemeli (K1 regresyonu).
      FAKE_TODAY = addDays(start, 1);
      st().ensurePlan();
      const nextDay = st().frozenPlan;
      assert.equal(overlapDiff(base, nextDay).changed, 0, "ertesi gün örtüşen görevler kaydı");
      assert.equal(idContentMismatches(base, nextDay), 0, "ertesi gün: kimlik-içerik uyuşmazlığı");
    });
  }
});

// ── 3. Sayfa yenileme / JSON kaydet-yükle ─────────────────────────────────

describe("store — kalıcılık ve yeniden yükleme", () => {
  const start = "2026-11-17";

  it("JSON round-trip sonrası pencere aynen korunur", () => {
    resetStore(start);
    FAKE_TODAY = start;
    st().ensurePlan();
    const base = JSON.parse(JSON.stringify(st().frozenPlan));
    const from = st().frozenPlanFrom;

    // Kalıcılık: kaydet → yeniden yükle (aynı çıpa).
    const saved = JSON.parse(JSON.stringify(st().frozenPlan));
    S.useAppStore.setState({ frozenPlan: saved, frozenPlanFrom: from });
    st().ensurePlan();

    assert.equal(overlapDiff(base, st().frozenPlan).changed, 0, "yeniden yükleme sonrası pencere değişti");
    assert.equal(idContentMismatches(base, st().frozenPlan), 0);
  });

  it("yeniden yükleme sonrası ERTESİ gün açılışta örtüşen görevler değişmez", () => {
    resetStore(start);
    FAKE_TODAY = start;
    st().ensurePlan();
    const base = JSON.parse(JSON.stringify(st().frozenPlan));
    const from = st().frozenPlanFrom;

    // Uygulama kapanıp ertesi gün açılmış gibi: pencere kaydedilmiş hâliyle yüklenir.
    S.useAppStore.setState({ frozenPlan: JSON.parse(JSON.stringify(base)), frozenPlanFrom: from });
    FAKE_TODAY = addDays(start, 1);
    st().ensurePlan();

    assert.equal(overlapDiff(base, st().frozenPlan).changed, 0, "yeniden açılışta görevler kaydı");
  });

  it("aynı girdiyle iki kez ensurePlan aynı pencereyi üretir (deterministik)", () => {
    resetStore(start);
    FAKE_TODAY = start;
    st().ensurePlan();
    const a = JSON.parse(JSON.stringify(st().frozenPlan));
    st().ensurePlan();
    const b = JSON.parse(JSON.stringify(st().frozenPlan));
    assert.deepEqual(a, b);
  });
});

// ── 4. Ayar değişikliği ve durum tutarlılığı (Y1) ─────────────────────────

describe("store — ayar değişikliği ve frozenPlan/frozenPlanFrom tutarlılığı", () => {
  const start = "2026-11-17";

  it("planı ETKİLEYEN ayar pencereyi ve çıpayı birlikte temizler", () => {
    resetStore(start);
    FAKE_TODAY = start;
    st().ensurePlan();
    assert.ok(Object.keys(st().frozenPlan).length > 0);

    st().updateSettings({ studyMinutes: 300 });
    assert.deepEqual(st().frozenPlan, {}, "plan etkileyen ayarda pencere temizlenmedi");
    assert.equal(st().frozenPlanFrom, "", "plan etkileyen ayarda çıpa temizlenmedi (Y1)");

    // Bir sonraki ensurePlan pencereyi yeniden kurmalı.
    st().ensurePlan();
    assert.ok(Object.keys(st().frozenPlan).length > 0, "pencere yeniden kurulmadı");
  });

  it("planı ETKİLEMEYEN ayar pencereyi KORUR (gereksiz sıfırlama yok)", () => {
    resetStore(start);
    FAKE_TODAY = start;
    st().ensurePlan();
    const before = JSON.parse(JSON.stringify(st().frozenPlan));
    const from = st().frozenPlanFrom;

    st().updateSettings({ wake: "05:00" });
    assert.deepEqual(st().frozenPlan, before, "gün içi ayar pencereyi gereksiz sıfırladı");
    assert.equal(st().frozenPlanFrom, from, "gün içi ayar çıpayı gereksiz değiştirdi");
  });

  it("planAffectingChange doğru sınıflandırır", () => {
    assert.equal(S.planAffectingChange({ studyMinutes: 300 }), true);
    assert.equal(S.planAffectingChange({ programStart: "2026-11-20" }), true);
    assert.equal(S.planAffectingChange({ examDate: "2027-06-20" }), true);
    assert.equal(S.planAffectingChange({ wake: "05:00" }), false);
    assert.equal(S.planAffectingChange({ sportDays: [1, 3] }), false);
    assert.equal(S.planAffectingChange({ meals: [] }), false);
  });

  it("resetAll / restoreBackup / importData pencereyi ve çıpayı birlikte sıfırlar", () => {
    // resetAll
    resetStore(start);
    FAKE_TODAY = start;
    st().ensurePlan();
    st().resetAll();
    assert.deepEqual(st().frozenPlan, {}, "resetAll pencereyi temizlemedi");
    assert.equal(st().frozenPlanFrom, "", "resetAll çıpayı temizlemedi");

    // restoreBackup
    resetStore(start);
    FAKE_TODAY = start;
    st().ensurePlan();
    const backup = JSON.parse(JSON.stringify(st().backup ?? null));
    // resetAll bir yedek bırakır; geri yükle.
    st().resetAll();
    st().restoreBackup();
    assert.deepEqual(st().frozenPlan, {}, "restoreBackup pencereyi temizlemedi");
    assert.equal(st().frozenPlanFrom, "", "restoreBackup çıpayı temizlemedi");

    // importData
    resetStore(start);
    FAKE_TODAY = start;
    st().ensurePlan();
    st().importData({
      topics: S.seedTopics(),
      archivedTopics: [],
      wrongs: [],
      tytExams: [],
      aytExams: [],
      daily: [],
      settings: { ...DEFAULT_SETTINGS, programStart: start },
      carry: [],
      analyzedWrongs: {},
      branchMockHistory: {},
    });
    assert.deepEqual(st().frozenPlan, {}, "importData pencereyi temizlemedi");
    assert.equal(st().frozenPlanFrom, "", "importData çıpayı temizlemedi");
    void backup;
  });

  it("replanProgram pencereyi ve çıpayı birlikte temizler", () => {
    resetStore(start);
    FAKE_TODAY = start;
    st().ensurePlan();
    st().replanProgram("2026-11-20");
    assert.deepEqual(st().frozenPlan, {}, "replanProgram pencereyi temizlemedi");
    assert.equal(st().frozenPlanFrom, "", "replanProgram çıpayı temizlemedi");
  });
});

// ── 5. Kullanıcı verisi korunması ─────────────────────────────────────────

describe("store — dondurma kullanıcı verisini DEĞİŞTİRMEZ", () => {
  const start = "2026-11-17";

  it("ensurePlan konu/yanlış/deneme/günlük verisine dokunmaz", () => {
    resetStore(start);
    FAKE_TODAY = start;
    setTopic(TYT("Tarih"), { status: "Bitti", total: 50, correct: 40, wrong: 10 });
    st().addDaily({ date: start, exam: "TYT", subject: "Türkçe", topic: "Paragraf", kind: "Soru çözümü", minutes: 60, questions: 40, correct: 32, wrong: 8 });
    st().addWrong({ date: start, exam: "TYT", subject: "Matematik", topic: "Temel Kavramlar", subtopic: "", source: "", questionNo: "5", reason: "Dikkatsizlik", note: "", reviewDate: "", result: "" });

    const snapshot = {
      topics: JSON.stringify(st().topics),
      daily: JSON.stringify(st().daily),
      wrongs: JSON.stringify(st().wrongs),
      tytExams: JSON.stringify(st().tytExams),
      aytExams: JSON.stringify(st().aytExams),
    };

    st().ensurePlan();
    FAKE_TODAY = addDays(start, 1);
    st().ensurePlan();

    assert.equal(JSON.stringify(st().topics), snapshot.topics, "konular değişti");
    assert.equal(JSON.stringify(st().daily), snapshot.daily, "günlük değişti");
    assert.equal(JSON.stringify(st().wrongs), snapshot.wrongs, "yanlışlar değişti");
    assert.equal(JSON.stringify(st().tytExams), snapshot.tytExams, "TYT denemeleri değişti");
    assert.equal(JSON.stringify(st().aytExams), snapshot.aytExams, "AYT denemeleri değişti");
  });
});
