/**
 * Gün içi zaman ayarlarını güvenli güncelleme (Aşama 1.4) — STORE ENTEGRASYON testleri.
 *
 * NEDEN: Uyanma/uyuma/yemek/spor/serbest zaman ayarları değişince dondurulmuş
 * penceredeki görev SAATLERİ yeni düzene göre yeniden yerleşir. Ama görevlerin
 * kimliği, tarihi, sırası, konusu, türü ve süresi KORUNMALIDIR; sığmayan görev
 * silinmemelidir. Bu dosya GERÇEK store (`applyIntradaySettings`, `ensurePlan`)
 * ve GERÇEK motor üzerinden bu sözleşmeyi sınar.
 *
 * Zaman hem gün hem saat olarak kontrol edilir; "başlamış görev" ve "gün geçişi"
 * gerçekçi biçimde simüle edilir.
 *
 * `vite` ile yüklenir çünkü store `@/` takma adı ve JSON importu kullanır.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type ViteDevServer } from "vite";

let server: ViteDevServer;
let S: any, T: any, DEFAULT_SETTINGS: any, IntradayDialog: any, E: any, F: any;

/** Sahte "bugün" ve "şimdi". `todayISO()` ve `new Date()` bunları okur. */
let FAKE_DAY = "2026-11-17";
let FAKE_TIME = "00:00:00";
const RealDate = Date;
class FakeDate extends RealDate {
  constructor(...args: any[]) {
    if (args.length === 0) super(`${FAKE_DAY}T${FAKE_TIME}`);
    else super(args[0]);
  }
  static now() {
    return new RealDate(`${FAKE_DAY}T${FAKE_TIME}`).getTime();
  }
}

before(async () => {
  (globalThis as any).Date = FakeDate as any;
  server = await createServer({ server: { middlewareMode: true }, logLevel: "silent" });
  S = await server.ssrLoadModule("/src/lib/store.ts");
  T = await server.ssrLoadModule("/src/lib/smart/types.ts");
  DEFAULT_SETTINGS = T.DEFAULT_SETTINGS;
  IntradayDialog = (await server.ssrLoadModule("/src/components/intraday-dialog.tsx")).IntradayDialog;
  E = await server.ssrLoadModule("/src/lib/smart/engine.ts");
  F = await server.ssrLoadModule("/src/lib/smart/frozen.ts");
});

after(async () => {
  (globalThis as any).Date = RealDate;
  await server?.close();
});

const st = () => S.useAppStore.getState();
const DAY = 86400000;
const addDays = (d: string, n: number) =>
  new RealDate(Date.parse(d + "T12:00:00Z") + n * DAY).toISOString().slice(0, 10);
const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

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

const dayContent = (plan: any, d: string) =>
  (plan[d]?.slots ?? [])
    .map((s: any) => `${s.id}|${s.exam}|${s.subject}|${s.topic}|${s.kind}|${s.minutes}`)
    .join(" > ");
const dayIds = (plan: any, d: string) => (plan[d]?.slots ?? []).map((s: any) => s.id);
const windowContent = (plan: any) =>
  Object.keys(plan)
    .sort()
    .map((d) => `${d}:${dayContent(plan, d)}`)
    .join("\n");

const userSig = () => {
  const s = st();
  return JSON.stringify({
    topics: s.topics,
    wrongs: s.wrongs,
    tytExams: s.tytExams,
    aytExams: s.aytExams,
    daily: s.daily,
    carry: s.carry,
  });
};

/**
 * Bir günün GÖREV↔GÖREV ve GÖREV↔YAŞAM BLOĞU çakışma sayısı. Taşan görevler
 * (`unplaced`) hariç tutulur: eski saatlerini korurlar ve yeni bloklarla
 * çakışmaları beklenir; arayüz bunları "geçerli değil" diye işaretler. Yaşam
 * bloklarının kendi aralarında örtüşmesi (kullanıcı üç öğünü aynı saate koyabilir)
 * bir hata değildir, sayılmaz.
 */
function overlapCount(plan: any) {
  let count = 0;
  for (const d of Object.keys(plan)) {
    const slots = (plan[d].slots ?? []).filter((s: any) => !s.unplaced);
    const life = plan[d].life ?? [];
    for (let i = 0; i < slots.length; i++) {
      for (let j = i + 1; j < slots.length; j++) {
        const o =
          Math.min(toMin(slots[i].end), toMin(slots[j].end)) - Math.max(toMin(slots[i].start), toMin(slots[j].start));
        if (o > 0) count++;
      }
      for (const b of life) {
        const o = Math.min(toMin(slots[i].end), toMin(b.end)) - Math.max(toMin(slots[i].start), toMin(b.start));
        if (o > 0) count++;
      }
    }
  }
  return count;
}

/** Yerleşmiş (taşmayan) görevlerin uyuma saatini aşma sayısı. */
function sleepViolations(plan: any, sleep: string) {
  let count = 0;
  for (const d of Object.keys(plan)) {
    for (const s of plan[d].slots ?? []) {
      if (!s.unplaced && toMin(s.end) > toMin(sleep)) count++;
    }
  }
  return count;
}

/** Yeniden yerleştirme sonrası korunması gereken değişmezleri denetler. */
function assertInvariants(before: any, after: any, opts: { allowOverflow?: boolean } = {}) {
  const beforeDates = Object.keys(before).sort();
  const afterDates = Object.keys(after).sort();
  assert.deepEqual(afterDates, beforeDates, "gün tarihleri değişti");

  for (const d of beforeDates) {
    // İçerik (kimlik + konu + tür + süre) ve görev kümesi korunur.
    assert.equal(dayContent(after, d), dayContent(before, d), `${d}: görev içeriği/kimliği/süresi değişti`);
    const b = [...dayIds(before, d)].sort();
    const a = [...dayIds(after, d)].sort();
    assert.deepEqual(a, b, `${d}: görev kümesi değişti (görev eklendi/silindi)`);
    if (!opts.allowOverflow) {
      assert.deepEqual(dayIds(after, d), dayIds(before, d), `${d}: görev sırası değişti`);
    }
  }
  assert.equal(overlapCount(after), 0, "görev/blok çakışması var");
  assert.equal(sleepViolations(after, st().settings.sleep), 0, "uyuma saatini aşan görev var");
}

/** Ayarı uygular ve öncesi/sonrası pencereleri döndürür. */
function applyAndCapture(patch: any) {
  const before = JSON.parse(JSON.stringify(st().frozenPlan));
  const userBefore = userSig();
  st().applyIntradaySettings(patch);
  const after = JSON.parse(JSON.stringify(st().frozenPlan));
  assert.equal(userSig(), userBefore, "kullanıcı verisi değişti");
  return { before, after };
}

// ── 1-7. Zorunlu ayar senaryoları ────────────────────────────────────────────

describe("applyIntradaySettings — ayar senaryoları (kimlik/tarih/sıra/içerik korunur)", () => {
  const start = "2026-11-17";

  const scenarios: [string, () => any][] = [
    ["(1) uyanma saatini ERKENE alma", () => ({ wake: "05:00" })],
    ["(2) uyanma saatini GEÇE alma", () => ({ wake: "09:00" })],
    ["(3) uyuma saatini değiştirme", () => ({ sleep: "21:30" })],
    [
      "(4a) kahvaltı saatini değiştirme",
      () => ({ meals: DEFAULT_SETTINGS.meals.map((m: any) => (m.name === "Kahvaltı" ? { ...m, start: "09:00", end: "09:30" } : m)) }),
    ],
    [
      "(4b) tüm yemekleri aynı saate alma",
      () => ({ meals: DEFAULT_SETTINGS.meals.map((m: any) => ({ ...m, start: "12:00", end: "12:30" })) }),
    ],
    ["(5a) spor günlerini ARTIRMA", () => ({ sportDays: [0, 1, 2, 3, 4, 5, 6] })],
    ["(5b) spor günlerini AZALTMA", () => ({ sportDays: [] })],
    ["(6) spor saatlerini değiştirme", () => ({ sportStart: "16:00", sportEnd: "17:00" })],
    [
      "(7) birden fazla ayarı BİRLİKTE değiştirme",
      () => ({
        wake: "05:00",
        sleep: "22:30",
        sportDays: [0, 1, 2, 3, 4, 5, 6],
        meals: DEFAULT_SETTINGS.meals.map((m: any) => ({ ...m, start: "12:00", end: "12:30" })),
      }),
    ],
  ];

  for (const [label, make] of scenarios) {
    it(`${label} → görev kimliği/tarihi/sırası/içeriği/süresi korunur, çakışma yok`, () => {
      FAKE_DAY = start;
      FAKE_TIME = "00:00:00";
      resetStore(start);
      st().ensurePlan();
      const patch = make();
      const { before, after } = applyAndCapture(patch);
      assertInvariants(before, after);
      // Ayar gerçekten kaydedildi.
      for (const k of Object.keys(patch)) {
        assert.deepEqual((st().settings as any)[k], patch[k], `${k} kaydedilmedi`);
      }
    });
  }

  it("(ek) yeni ayar gelecek günlerin saatlerini gerçekten değiştirir", () => {
    FAKE_DAY = start;
    FAKE_TIME = "00:00:00";
    resetStore(start);
    st().ensurePlan();
    const d1 = addDays(start, 1);
    const beforeTimes = (st().frozenPlan[d1].slots as any[]).map((s) => s.start).join(",");
    const beforeContent = dayContent(st().frozenPlan, d1);
    st().applyIntradaySettings({ wake: "05:00" });
    const afterTimes = (st().frozenPlan[d1].slots as any[]).map((s) => s.start).join(",");
    assert.notEqual(afterTimes, beforeTimes, "gelecek günün saatleri güncellenmedi");
    assert.equal(dayContent(st().frozenPlan, d1), beforeContent, "gelecek günün içeriği değişti");
  });
});

// ── 8. Taşma ─────────────────────────────────────────────────────────────────

describe("applyIntradaySettings — taşma (görev silinmez)", () => {
  const start = "2026-11-17";

  it("(8) çok dar zaman aralığı: görevler korunur, taşanlar işaretlenir, hiçbiri silinmez", () => {
    FAKE_DAY = start;
    FAKE_TIME = "00:00:00";
    resetStore(start);
    st().ensurePlan();
    const before = JSON.parse(JSON.stringify(st().frozenPlan));
    st().applyIntradaySettings({
      wake: "10:00",
      sleep: "11:30",
      meals: DEFAULT_SETTINGS.meals.map((m: any) => ({ ...m, start: "10:00", end: "10:15" })),
    });
    const after = st().frozenPlan;

    // Hiçbir görev silinmedi: her günün görev kümesi aynı.
    for (const d of Object.keys(before)) {
      assert.deepEqual(
        [...dayIds(after, d)].sort(),
        [...dayIds(before, d)].sort(),
        `${d}: taşmada görev kayboldu`,
      );
    }
    // Taşma raporlandı ve taşan görevler işaretli.
    const overflow = S.intradayOverflow(after);
    assert.ok(overflow && overflow.total > 0, "taşma raporlanmadı");
    const unplaced = Object.values(after)
      .flatMap((day: any) => day.slots)
      .filter((s: any) => s.unplaced);
    assert.equal(unplaced.length, overflow.total, "taşan görev sayısı ile işaretli görev sayısı uyuşmuyor");
    // Çakışma yok; taşanlar eski saatini korur ama geçerli sayılmaz.
    assert.equal(overlapCount(after), 0, "taşmada çakışma oluştu");
  });
});

// ── 9. Arka arkaya 5 ayar değişikliği ────────────────────────────────────────

describe("applyIntradaySettings — ardışık değişiklikler", () => {
  it("(9) 5 ardışık değişiklikte her seferinde değişmezler korunur, bozulma birikmez", () => {
    const start = "2026-11-17";
    FAKE_DAY = start;
    FAKE_TIME = "00:00:00";
    resetStore(start);
    st().ensurePlan();
    const baseline = JSON.parse(JSON.stringify(st().frozenPlan));
    const baselineContent = windowContent(baseline);

    const seq: any[] = [
      { wake: "05:00" },
      { sleep: "22:30" },
      { sportDays: [0, 1, 2, 3, 4, 5, 6] },
      { meals: DEFAULT_SETTINGS.meals.map((m: any) => ({ ...m, start: "12:00", end: "12:30" })) },
      { wake: "07:00", sportDays: [3] },
    ];
    for (const patch of seq) {
      const { before, after } = applyAndCapture(patch);
      assertInvariants(before, after);
      // İçerik hiçbir aşamada bozulmaz.
      assert.equal(windowContent(after), baselineContent, "ardışık değişiklikte içerik bozuldu");
    }
  });
});

// ── 10. Sayfa yenileme / persist-rehydrate ───────────────────────────────────

describe("applyIntradaySettings — kalıcılık", () => {
  it("(10) kaydet-yükle (JSON round-trip) sonrası pencere aynen korunur", () => {
    const start = "2026-11-17";
    FAKE_DAY = start;
    FAKE_TIME = "00:00:00";
    resetStore(start);
    st().ensurePlan();
    st().applyIntradaySettings({ wake: "05:00" });
    const after = JSON.parse(JSON.stringify(st().frozenPlan));
    const settings = JSON.parse(JSON.stringify(st().settings));
    const from = st().frozenPlanFrom;

    // Uygulama kapanıp aynı gün yeniden açılmış gibi.
    S.useAppStore.setState({ settings, frozenPlan: after, frozenPlanFrom: from });
    st().ensurePlan();

    assert.equal(windowContent(st().frozenPlan), windowContent(after), "yeniden yüklemede pencere değişti");
  });
});

// ── 11. Gün değişimi ve yeni gün üretimi ─────────────────────────────────────

describe("applyIntradaySettings — gün değişimi", () => {
  it("(11) sonraki gün açılışta eski günler korunur, yeni gün üretilir", () => {
    const start = "2026-11-17";
    FAKE_DAY = start;
    FAKE_TIME = "00:00:00";
    resetStore(start);
    st().ensurePlan();
    st().applyIntradaySettings({ wake: "05:00" });
    const after = JSON.parse(JSON.stringify(st().frozenPlan));
    const lastBefore = Object.keys(after).sort().at(-1)!;

    FAKE_DAY = addDays(start, 1);
    st().ensurePlan();
    const now = st().frozenPlan;

    // Örtüşen günler değişmez.
    for (const d of Object.keys(after)) {
      if (now[d]) assert.equal(dayContent(now, d), dayContent(after, d), `${d} günü değişti`);
    }
    // Pencere ileri kayar.
    assert.ok(Object.keys(now).sort().at(-1)! > lastBefore, "pencere ileri kaymadı");
  });
});

// ── 12. Geçmiş günler değişmez ───────────────────────────────────────────────

describe("applyIntradaySettings — geçmiş günler", () => {
  it("(12) bugünden önceki günler hiç değişmez", () => {
    const start = "2026-11-17";
    FAKE_DAY = addDays(start, 7);
    FAKE_TIME = "00:00:00";
    resetStore(start);
    st().ensurePlan();
    const before = JSON.parse(JSON.stringify(st().frozenPlan));
    st().applyIntradaySettings({ wake: "05:00", sportDays: [0, 1, 2, 3, 4, 5, 6] });
    const after = st().frozenPlan;

    let pastChanged = 0;
    for (const d of Object.keys(before)) {
      if (d < FAKE_DAY) {
        if (dayContent(after, d) !== dayContent(before, d)) pastChanged++;
        // Geçmiş günler birebir (bloklar dahil) korunur.
        assert.deepEqual(after[d], before[d], `${d} geçmiş günü değişti`);
      }
    }
    assert.equal(pastChanged, 0, "geçmiş gün değişti");
  });
});

// ── 13-14. Bugün tamamlanmış / başlamış görevler ─────────────────────────────

describe("applyIntradaySettings — bugün tamamlanmış/başlamış görevler", () => {
  const start = "2026-11-17";

  it("(13) bugün tamamlanmış (günlük kaydı girilmiş) görev değişmez", () => {
    FAKE_DAY = start;
    FAKE_TIME = "00:00:00";
    resetStore(start);
    st().ensurePlan();
    const slots = st().frozenPlan[start].slots;
    assert.ok(slots.length > 0, "bugün görev üretilmeli");
    const target = slots[0];
    // Kullanıcı bu görev için günlük kaydı girer (tamamlanmış sayılır).
    st().addDaily({
      date: start,
      exam: target.exam || "TYT",
      subject: target.subject,
      topic: target.topic,
      kind: "Soru çözümü",
      minutes: 50,
      questions: 20,
      correct: 15,
      wrong: 5,
    });
    const beforeStart = target.start;
    st().applyIntradaySettings({ wake: "05:00" });
    const after = st().frozenPlan[start].slots.find((s: any) => s.id === target.id);
    assert.ok(after, "tamamlanmış görev kayboldu");
    assert.equal(after.start, beforeStart, "tamamlanmış görevin saati değişti");
    assert.ok(!after.unplaced, "tamamlanmış görev taşmış sayılmamalı");
  });

  it("(14) bugün başlamış (saati geçmiş) görev değişmez", () => {
    FAKE_DAY = start;
    FAKE_TIME = "00:00:00";
    resetStore(start);
    st().ensurePlan();
    // Görevler 07:00 civarında başlar; "şimdi" 10:00 olsun → 07:00 ve 08:40 başlamış.
    FAKE_TIME = "10:00:00";
    const startedBefore = st()
      .frozenPlan[start].slots.filter((s: any) => toMin(s.start) < 10 * 60)
      .map((s: any) => ({ id: s.id, start: s.start }));
    assert.ok(startedBefore.length > 0, "başlamış görev olmalı");

    st().applyIntradaySettings({ wake: "05:00" });
    const afterSlots = st().frozenPlan[start].slots;
    for (const b of startedBefore) {
      const a = afterSlots.find((s: any) => s.id === b.id);
      assert.ok(a, `başlamış görev ${b.id} kayboldu`);
      assert.equal(a.start, b.start, `başlamış görev ${b.id} saati değişti`);
    }
  });
});

// ── 15-16. Onay penceresi: vazgeçme / onaylama ───────────────────────────────

/** React eleman ağacındaki tüm düğüm metnini toplar. */
function textOf(node: any): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (typeof node === "object" && node.props) return textOf(node.props.children);
  return "";
}

/** Ağaçta `onClick` taşıyan elemanları (etiket metniyle) toplar. */
function buttons(node: any, out: { text: string; onClick: () => void }[] = []) {
  if (node == null || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    node.forEach((c) => buttons(c, out));
    return out;
  }
  const props = node.props ?? {};
  if (typeof props.onClick === "function") out.push({ text: textOf(props.children).trim(), onClick: props.onClick });
  buttons(props.children, out);
  return out;
}

describe("IntradayDialog — onay penceresi", () => {
  it("(15a) kapalıyken render etmez; açıkken iki düğme ve saat etkisi uyarısını gösterir", () => {
    assert.equal(IntradayDialog({ open: false, onCancel: () => {}, onConfirm: () => {} }), null);
    const el = IntradayDialog({ open: true, onCancel: () => {}, onConfirm: () => {} });
    assert.deepEqual(
      buttons(el).map((b) => b.text),
      ["Vazgeç", "Uygula"],
    );
    const text = textOf(el);
    assert.match(text, /saatlerini/);
    assert.match(text, /tarihi, sırası, konusu, türü ve süresi korunur/);
    assert.match(text, /Sığmayan görevler silinmez/);
    assert.equal(el.props.role, "dialog");
    assert.equal(el.props["aria-modal"], "true");
  });

  it("(15) vazgeçme: yalnızca onCancel çağrılır; ayar ve pencere değişmez", () => {
    const start = "2026-11-17";
    FAKE_DAY = start;
    FAKE_TIME = "00:00:00";
    resetStore(start);
    st().ensurePlan();
    const before = {
      settings: JSON.stringify(st().settings),
      frozen: JSON.stringify(st().frozenPlan),
    };

    let confirmed = 0;
    const el = IntradayDialog({ open: true, onCancel: () => {}, onConfirm: () => confirmed++ });
    buttons(el).find((b) => b.text === "Vazgeç")!.onClick();

    assert.equal(confirmed, 0, "vazgeçmede onay çağrıldı");
    assert.equal(JSON.stringify(st().settings), before.settings, "vazgeçmede ayar değişti");
    assert.equal(JSON.stringify(st().frozenPlan), before.frozen, "vazgeçmede pencere değişti");
  });

  it("(16) onaylama: yeni ayarlar ve yeni zaman çizelgesi birlikte uygulanır", () => {
    const start = "2026-11-17";
    FAKE_DAY = start;
    FAKE_TIME = "00:00:00";
    resetStore(start);
    st().ensurePlan();
    const before = JSON.parse(JSON.stringify(st().frozenPlan));
    const d1 = addDays(start, 1);
    const beforeTimes = before[d1].slots.map((s: any) => s.start).join(",");
    const pending = { wake: "05:00" };

    // program.tsx'teki onConfirm gövdesi.
    const el = IntradayDialog({
      open: true,
      onCancel: () => {},
      onConfirm: () => st().applyIntradaySettings(pending),
    });
    buttons(el).find((b) => b.text === "Uygula")!.onClick();

    assert.equal(st().settings.wake, "05:00", "onayda ayar uygulanmadı");
    const after = st().frozenPlan;
    assert.notEqual(after[d1].slots.map((s: any) => s.start).join(","), beforeTimes, "onayda saatler güncellenmedi");
    assertInvariants(before, after);
  });
});

// ── Sınıflandırma yardımcıları ───────────────────────────────────────────────

describe("intradayChange / planAffectingChange sınıflandırması", () => {
  it("gün içi anahtarlar intraday; plan anahtarları ayrı sınıflandırılır", () => {
    for (const patch of [
      { wake: "05:00" },
      { sleep: "21:00" },
      { sportDays: [1] },
      { sportStart: "16:00" },
      { meals: [] },
      { leisure: [] },
    ]) {
      assert.equal(S.intradayChange(patch), true, `${JSON.stringify(patch)} gün içi sayılmadı`);
      assert.equal(S.planAffectingChange(patch), false, `${JSON.stringify(patch)} plan etkileyen sayıldı`);
    }
    assert.equal(S.intradayChange({ studyMinutes: 300 }), false);
    assert.equal(S.planAffectingChange({ studyMinutes: 300 }), true);
    assert.equal(S.intradayChange({ programStart: "2026-11-20" }), false);
  });
});

// ── 1.4.2 regresyon: görev sırası korunumu ───────────────────────────────────

/** Bir günün YERLEŞMİŞ görevlerinin başlangıçları monoton artan mı? */
function placedMonotonic(plan: any) {
  for (const d of Object.keys(plan)) {
    const placed = (plan[d].slots ?? []).filter((s: any) => !s.unplaced);
    for (let i = 1; i < placed.length; i++) {
      if (toMin(placed[i - 1].start) > toMin(placed[i].start)) return false;
    }
  }
  return true;
}

/** Taşan görevler hariç görev↔görev çakışma sayısı. */
function placedOverlaps(plan: any) {
  let n = 0;
  for (const d of Object.keys(plan)) {
    const sl = (plan[d].slots ?? []).filter((s: any) => !s.unplaced);
    for (let i = 0; i < sl.length; i++)
      for (let j = i + 1; j < sl.length; j++) {
        const o = Math.min(toMin(sl[i].end), toMin(sl[j].end)) - Math.max(toMin(sl[i].start), toMin(sl[j].start));
        if (o > 0) n++;
      }
  }
  return n;
}

describe("1.4.2 — görev sırası korunumu (gerçek hata senaryosu)", () => {
  it("5 Aralık 2026: uyanma 05:00 → 06:30 kısa deneme görevini ÖNE ATLATMAZ", () => {
    const start = "2026-11-17";
    FAKE_DAY = start;
    FAKE_TIME = "00:00:00";
    resetStore(start);
    st().ensurePlan();
    st().applyIntradaySettings({ wake: "05:00" });
    const before = JSON.parse(JSON.stringify(st().frozenPlan));
    st().applyIntradaySettings({ wake: "06:30" });
    const after = st().frozenPlan;
    const d = "2026-12-05";

    // ID sırası birebir korunur (kısa deneme görevi öne geçmez).
    assert.deepEqual(dayIds(after, d), dayIds(before, d), "görev sırası değişti");
    // Deneme görevi hâlâ eski konumunda (5. sırada), 2. sıraya atlamadı.
    const idx = (plan: any) => (plan[d].slots as any[]).findIndex((s) => s.kind === "Deneme");
    assert.equal(idx(after), idx(before), "deneme görevi öne atladı");
    assert.ok(idx(after) > 1, "deneme görevi beklenmedik biçimde başa geçti");
    // Yerleşmiş görevler monoton artan ve çakışmasız.
    assert.ok(placedMonotonic(after), "yerleşmiş görevler monoton değil");
    assert.equal(placedOverlaps(after), 0, "görev-görev çakışması");
    // İçerik/kimlik/süre korunur.
    assert.equal(windowContent(after), windowContent(before), "içerik değişti");
  });

  it("40 rastgele ayar değişikliği: hiçbir günde sıra bozulmaz, monotonluk ve çakışmasızlık korunur", () => {
    const start = "2026-11-17";
    let seed = 99;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const hh = () => `${String(5 + Math.floor(rnd() * 18)).padStart(2, "0")}:${["00", "15", "30", "45"][Math.floor(rnd() * 4)]}`;
    for (let i = 0; i < 40; i++) {
      FAKE_DAY = start;
      FAKE_TIME = "00:00:00";
      resetStore(start);
      st().ensurePlan();
      const before = JSON.parse(JSON.stringify(st().frozenPlan));
      const patch: any = { wake: hh() };
      if (rnd() < 0.4) patch.sleep = hh();
      if (rnd() < 0.4) patch.sportDays = [0, 1, 2, 3, 4, 5, 6].filter(() => rnd() < 0.5);
      if (rnd() < 0.4) patch.meals = DEFAULT_SETTINGS.meals.map((m: any) => ({ ...m, start: hh(), end: hh() }));
      st().applyIntradaySettings(patch);
      const after = st().frozenPlan;
      assert.equal(windowContent(after), windowContent(before), `senaryo ${i + 1}: içerik/sıra değişti`);
      assert.ok(placedMonotonic(after), `senaryo ${i + 1}: monotonluk bozuldu`);
      assert.equal(placedOverlaps(after), 0, `senaryo ${i + 1}: çakışma`);
    }
  });

  it("12 ardışık ayar değişikliği: sıra ve içerik hiçbir adımda bozulmaz", () => {
    const start = "2026-11-17";
    FAKE_DAY = start;
    FAKE_TIME = "00:00:00";
    resetStore(start);
    st().ensurePlan();
    const baseline = JSON.parse(JSON.stringify(st().frozenPlan));
    const baseContent = windowContent(baseline);
    const seq: any[] = [
      { wake: "05:00" },
      { wake: "06:30" },
      { sleep: "22:00" },
      { sleep: "23:45" },
      { sportDays: [0, 1, 2] },
      { sportDays: [5, 6] },
      { sportStart: "15:00", sportEnd: "16:00" },
      { meals: DEFAULT_SETTINGS.meals.map((m: any) => (m.name === "Öğle" ? { ...m, start: "13:00", end: "13:40" } : m)) },
      { leisure: DEFAULT_SETTINGS.leisure.map((l: any) => ({ ...l, start: "21:00", end: "21:40" })) },
      { wake: "07:15", sleep: "23:15" },
      { sportDays: [0, 1, 2, 3, 4, 5, 6] },
      { meals: DEFAULT_SETTINGS.meals },
    ];
    for (const patch of seq) {
      st().applyIntradaySettings(patch);
      const after = st().frozenPlan;
      assert.equal(windowContent(after), baseContent, "ardışık değişiklikte içerik/sıra bozuldu");
      assert.ok(placedMonotonic(after), "ardışık değişiklikte monotonluk bozuldu");
    }
  });
});

// ── 1.4.2 regresyon: kısmi taşma işareti birleştirmede korunur ────────────────

describe("1.4.2 — kısmi taşmada 'sığmadı' işareti korunur", () => {
  it("mergeTopicSlots: parçalardan biri unplaced ise birleşik satır da unplaced", () => {
    const slots = [
      { id: "a", start: "09:00", end: "09:50", exam: "TYT", subject: "X", topic: "T", kind: "Konu anlatımı", targetQ: 0, minutes: 50, priority: "orta", reason: "" },
      { id: "b", start: "20:00", end: "20:55", exam: "TYT", subject: "X", topic: "T", kind: "Soru çözümü", targetQ: 0, minutes: 55, priority: "orta", reason: "", unplaced: true },
    ];
    const merged = E.mergeTopicSlots(slots);
    assert.equal(merged.length, 1, "parçalar birleşmedi");
    assert.equal(merged[0].unplaced, true, "birleşik satır taşma işaretini kaybetti");
  });

  it("kısmen yerleşmiş görev, birleşik görünümde 'sığmadı' olarak görünür (gerçek akış)", () => {
    const start = "2026-11-17";
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const f = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
    let partial = 0;
    for (let i = 0; i < 60; i++) {
      FAKE_DAY = start;
      FAKE_TIME = "00:00:00";
      resetStore(start);
      st().ensurePlan();
      const wakeM = 300 + Math.floor(rnd() * 900);
      const sleepM = Math.min(1439, wakeM + 45 + Math.floor(rnd() * 600));
      st().applyIntradaySettings({ wake: f(wakeM), sleep: f(sleepM) });
      const plan = st().frozenPlan;
      for (const d of Object.keys(plan)) {
        const raw = plan[d].slots as any[];
        const byTopic = new Map<string, any[]>();
        for (const s of raw) {
          const k = `${s.exam}|${s.subject}|${s.topic}`;
          byTopic.set(k, [...(byTopic.get(k) ?? []), s]);
        }
        for (const [k, g] of byTopic) {
          if (g.length < 2) continue;
          const anyU = g.some((s) => s.unplaced);
          const allU = g.every((s) => s.unplaced);
          if (!anyU || allU) continue;
          partial++;
          const row = F.frozenTodaySlots(plan, d).find((r: any) => `${r.exam}|${r.subject}|${r.topic}` === k);
          assert.ok(row && row.unplaced, `${d} ${k}: kısmi taşma birleşik görünümde gizlendi`);
        }
      }
    }
    assert.ok(partial > 0, "hiç kısmi taşma üretilemedi (test anlamsız)");
  });

  it("taşma sayacı gerçek taşan parça sayısını gösterir; yenilemede korunur", () => {
    const start = "2026-11-17";
    FAKE_DAY = start;
    FAKE_TIME = "00:00:00";
    resetStore(start);
    st().ensurePlan();
    st().applyIntradaySettings({
      wake: "10:00",
      sleep: "11:30",
      meals: DEFAULT_SETTINGS.meals.map((m: any) => ({ ...m, start: "10:00", end: "10:15" })),
    });
    const plan = JSON.parse(JSON.stringify(st().frozenPlan));
    const ov = S.intradayOverflow(plan);
    const marked = Object.values(plan)
      .flatMap((d: any) => d.slots)
      .filter((s: any) => s.unplaced).length;
    assert.ok(ov && ov.total > 0, "taşma raporlanmadı");
    assert.equal(ov.total, marked, "sayaç ile gerçek taşan parça sayısı uyuşmuyor");
    // Yenileme sonrası aynı kalır.
    const settings = JSON.parse(JSON.stringify(st().settings));
    const from = st().frozenPlanFrom;
    S.useAppStore.setState({ settings, frozenPlan: plan, frozenPlanFrom: from });
    const ov2 = S.intradayOverflow(st().frozenPlan);
    assert.equal(ov2?.total, ov.total, "yenilemede taşma sayısı değişti");
  });
});

// ── 1.4.4 regresyon: görünüm sıralama tutarlılığı ────────────────────────────

/** Birleşik görünüm satırının kimliği (merge sonrası satırı temsil eder). */
const mergedIds = (slots: any[]) => slots.map((s) => s.id);

describe("1.4.4 — taşan görevlerin görünüm sıralaması", () => {
  it("(a) sortSlotsForDisplay: yerleşikler kronolojik, unplaced'ler sonda, mantıksal sıra korunur", () => {
    const slots = [
      { id: "u1", start: "08:00", end: "08:40", unplaced: true },
      { id: "p2", start: "11:00", end: "11:50" },
      { id: "p1", start: "09:00", end: "09:50" },
      { id: "u2", start: "07:00", end: "07:40", unplaced: true },
    ];
    const out = F.sortSlotsForDisplay(slots).map((s: any) => s.id);
    assert.deepEqual(out, ["p1", "p2", "u1", "u2"], "sıralama kuralı yanlış");
  });

  it("(b) 18.11.2026 wake 13:37: Program ve Özet görünümü BİREBİR aynı sırada", () => {
    const start = "2026-11-17";
    FAKE_DAY = start;
    FAKE_TIME = "00:00:00";
    resetStore(start);
    st().ensurePlan();
    st().applyIntradaySettings({ wake: "13:37" });
    const d = "2026-11-18";
    const plan = st().frozenPlan;
    const program = F.frozenTimeline(plan[d]).filter((s: any) => !s.life);
    const ozet = F.frozenTodaySlots(plan, d);
    assert.deepEqual(mergedIds(ozet), mergedIds(program), "Program ve Özet sırası farklı");
    // Taşanlar sonda.
    const flags = ozet.map((s: any) => (s.unplaced ? 1 : 0));
    const firstUn = flags.indexOf(1);
    assert.ok(firstUn === -1 || flags.slice(firstUn).every((x: number) => x === 1), "unplaced'lar sonda değil");
  });

  it("(c) seed=2025, 40 senaryo: iki görünüm arasında sıralama farkı YOK", () => {
    const start = "2026-11-17";
    let seed = 2025;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const f = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
    let overflowDays = 0;
    let multiDays = 0;
    for (let i = 0; i < 40; i++) {
      FAKE_DAY = start;
      FAKE_TIME = "00:00:00";
      resetStore(start);
      st().ensurePlan();
      const w = 300 + Math.floor(rnd() * 900);
      const sl = Math.min(1439, w + 45 + Math.floor(rnd() * 600));
      st().applyIntradaySettings({ wake: f(w), sleep: f(sl) });
      const plan = st().frozenPlan;
      for (const d of Object.keys(plan)) {
        const raw = plan[d].slots as any[];
        if (!raw.some((s) => s.unplaced)) continue;
        overflowDays++;
        const program = mergedIds(F.frozenTimeline(plan[d]).filter((s: any) => !s.life));
        const ozet = mergedIds(F.frozenTodaySlots(plan, d));
        assert.deepEqual(ozet, program, `${d}: iki görünüm sırası farklı`);
        // Yerleşikler kronolojik; unplaced'ler sonda ve mantıksal sırada.
        const shown = F.frozenTodaySlots(plan, d);
        const placed = shown.filter((s: any) => !s.unplaced);
        for (let k = 1; k < placed.length; k++) {
          assert.ok(toMin(placed[k - 1].start) <= toMin(placed[k].start), `${d}: yerleşik sıra kronolojik değil`);
        }
        const flags = shown.map((s: any) => (s.unplaced ? 1 : 0));
        const firstUn = flags.indexOf(1);
        assert.ok(firstUn === -1 || flags.slice(firstUn).every((x: number) => x === 1), `${d}: unplaced sonda değil`);
        const logicalUn = E.mergeTopicSlots(raw).filter((s: any) => s.unplaced).map((s: any) => s.id);
        const shownUn = shown.filter((s: any) => s.unplaced).map((s: any) => s.id);
        assert.deepEqual(shownUn, logicalUn, `${d}: unplaced mantıksal sırası bozuldu`);
        if (raw.filter((s) => s.unplaced).length > 1) multiDays++;
      }
    }
    assert.ok(overflowDays > 0, "hiç taşma üretilemedi (test anlamsız)");
    assert.ok(multiDays > 0, "hiç çoklu taşma üretilemedi");
  });

  it("(d) taşan görevlerin eski saatleri ve verileri korunur; görünüm unplaced bayrağını taşır", () => {
    const start = "2026-11-17";
    FAKE_DAY = start;
    FAKE_TIME = "00:00:00";
    resetStore(start);
    st().ensurePlan();
    const before = JSON.parse(JSON.stringify(st().frozenPlan));
    st().applyIntradaySettings({ wake: "13:37" });
    const after = st().frozenPlan;
    // Ham dizi kimlik/sıra/içerik/süre korunur.
    for (const d of Object.keys(before)) {
      assert.deepEqual(dayIds(after, d), dayIds(before, d), `${d}: ham dizi sırası değişti`);
    }
    assert.equal(windowContent(after), windowContent(before), "içerik değişti");
    // Taşan görevlerin eski saatleri birebir korunur.
    let total = 0;
    for (const d of Object.keys(after)) {
      for (const s of after[d].slots as any[]) {
        if (!s.unplaced) continue;
        total++;
        const b = (before[d].slots as any[]).find((x) => x.id === s.id);
        assert.equal(s.start, b.start, `${d} ${s.id}: eski saat değişti`);
        assert.equal(s.end, b.end, `${d} ${s.id}: eski bitiş değişti`);
      }
    }
    assert.ok(total > 0, "hiç taşan görev yok");
    // Görünüm satırları bayrağı taşır (etiket bu bayrağa göre gösterilir).
    const shown = F.frozenTodaySlots(after, "2026-11-18");
    const shownUn = shown.filter((s: any) => s.unplaced);
    assert.ok(shownUn.length > 0, "görünümde unplaced bayrağı yok");
  });
});
