/**
 * Sınav tarihleri — DEĞİŞMEZ ürün kuralı testleri.
 *
 * TYT 19.06.2027, AYT 20.06.2027 projenin sabit sınav hedefleridir; kullanıcı
 * ayarı değildir. Bu dosya tarihin HİÇBİR yoldan kaydırılamadığını doğrular:
 * store `updateSettings`, kalıcı kayıttan okuma (`merge`), içe aktarma
 * (`importData`) ve geri yükleme (`restoreBackup`). Ayrıca diğer ayarların
 * normal çalışmaya devam ettiğini ve kullanıcı verisinin bozulmadığını sınar.
 *
 * `vite` ile yüklenir çünkü store `@/` takma adı ve JSON importu kullanır.
 */
import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createServer, type ViteDevServer } from "vite";

let server: ViteDevServer;
let S: any;
let T: any;
let STORE: any;

/** Tarayıcı depolaması stub'ı; persist rehydrate senaryosu için modülden önce kurulur. */
const storage = new Map<string, string>();
const ls = {
  getItem: (k: string) => (storage.has(k) ? storage.get(k)! : null),
  setItem: (k: string, v: string) => {
    storage.set(k, String(v));
  },
  removeItem: (k: string) => {
    storage.delete(k);
  },
  clear: () => storage.clear(),
  key: (i: number) => [...storage.keys()][i] ?? null,
  get length() {
    return storage.size;
  },
};
(globalThis as any).localStorage = ls;
(globalThis as any).window = { localStorage: ls };

before(async () => {
  server = await createServer({ server: { middlewareMode: true }, logLevel: "silent" });
  S = await server.ssrLoadModule("/src/lib/store.ts");
  T = await server.ssrLoadModule("/src/lib/smart/types.ts");
  STORE = S.useAppStore;
});

after(async () => {
  await server?.close();
});

/** Bozuk sınav tarihi taşıyan yedek/snapshot zarfı üretir. */
function badSettings(over: Record<string, unknown> = {}) {
  return { ...T.DEFAULT_SETTINGS, examDate: "1999-01-01", ...over };
}

describe("sınav tarihi — sabit hedefin kaynağı", () => {
  it("(1) EXAM_TARGETS doğru günleri taşır", () => {
    assert.equal(T.EXAM_TARGETS.tyt, "2027-06-19");
    assert.equal(T.EXAM_TARGETS.ayt, "2027-06-20");
  });

  it("(2) varsayılan ayarlar sabit hedefle aynıdır", () => {
    assert.equal(T.DEFAULT_SETTINGS.examDate, T.EXAM_TARGETS.tyt);
  });
});

describe("updateSettings — sınav tarihi reddedilir", () => {
  beforeEach(() => {
    STORE.setState({ settings: { ...T.DEFAULT_SETTINGS }, frozenPlan: {}, frozenPlanFrom: "" });
  });

  it("(3) examDate doğrudan gönderilse bile sabit kalır", () => {
    STORE.getState().updateSettings({ examDate: "2030-01-01" });
    assert.equal(STORE.getState().settings.examDate, T.EXAM_TARGETS.tyt, "examDate değişti");
  });

  it("(4) examDate denemesi plan penceresini geçersiz KILMAZ", () => {
    const plan = { "2026-11-20": [{ id: "t1", kind: "Konu anlatımı" }] };
    STORE.setState({ frozenPlan: plan, frozenPlanFrom: "2026-11-20" });
    STORE.getState().updateSettings({ examDate: "2030-01-01" });
    assert.deepEqual(
      STORE.getState().frozenPlan,
      plan,
      "yalnız examDate denemesi pencereyi sıfırladı",
    );
    assert.equal(STORE.getState().frozenPlanFrom, "2026-11-20");
  });

  it("(5) diğer ayarlar normal çalışmaya devam eder", () => {
    STORE.getState().updateSettings({ examDate: "2030-01-01", studyMinutes: 300, wake: "05:00" });
    const s = STORE.getState().settings;
    assert.equal(s.studyMinutes, 300, "studyMinutes güncellenmedi");
    assert.equal(s.wake, "05:00", "wake güncellenmedi");
    assert.equal(s.examDate, T.EXAM_TARGETS.tyt, "examDate sızdı");
  });

  it("(6) program başlangıcı hâlâ kullanıcı tarafından ayarlanabilir", () => {
    STORE.getState().updateSettings({ programStart: "2027-01-04" });
    assert.equal(STORE.getState().settings.programStart, "2027-01-04", "programStart kilitlendi");
  });
});

describe("sanitizeSettings — hatalı kayıt sabitlenir", () => {
  it("(7) bozuk examDate'i sabit hedefe çeker, diğer alanları korur", () => {
    const out = S.sanitizeSettings(badSettings({ studyMinutes: 210 }));
    assert.equal(out.examDate, T.EXAM_TARGETS.tyt);
    assert.equal(out.studyMinutes, 210, "kullanıcı ayarı korunmadı");
  });

  it("(8) eksik ayar nesnesi güvenli varsayılana döner", () => {
    const out = S.sanitizeSettings(undefined);
    assert.equal(out.examDate, T.EXAM_TARGETS.tyt);
    assert.equal(out.studyMinutes, T.DEFAULT_SETTINGS.studyMinutes);
  });
});

describe("kalıcılık — sayfa yenilemesi ve yedek yolları", () => {
  beforeEach(() => {
    STORE.setState({
      topics: S.seedTopics(),
      archivedTopics: [],
      wrongs: [],
      tytExams: [],
      aytExams: [],
      daily: [],
      carry: [],
      backup: null,
      settings: { ...T.DEFAULT_SETTINGS },
    });
  });

  it("(9) merge eski/hatalı kayıtlı examDate'i sabitler", () => {
    const opts = STORE.persist.getOptions();
    const reloaded = opts.merge(
      { settings: badSettings({ studyMinutes: 180 }), topics: [], daily: [] },
      STORE.getInitialState(),
    );
    assert.equal(reloaded.settings.examDate, T.EXAM_TARGETS.tyt, "kayıtlı hatalı tarih yüklendi");
    assert.equal(reloaded.settings.studyMinutes, 180, "diğer ayar kayboldu");
  });

  it("(10) importData hatalı examDate içeren yedeği sabitler", () => {
    STORE.getState().importData({
      topics: S.seedTopics(),
      archivedTopics: [],
      wrongs: [],
      tytExams: [],
      aytExams: [],
      daily: [],
      carry: [],
      settings: badSettings({ weeklyHours: 30 }),
    });
    const s = STORE.getState().settings;
    assert.equal(s.examDate, T.EXAM_TARGETS.tyt, "içe aktarma tarihi kaydırdı");
    assert.equal(s.weeklyHours, 30, "diğer ayar kayboldu");
  });

  it("(11) restoreBackup hatalı examDate'i sabitler", () => {
    STORE.setState({
      backup: {
        at: "2026-11-18T00:00:00.000Z",
        topics: S.seedTopics(),
        archivedTopics: [],
        wrongs: [],
        tytExams: [],
        aytExams: [],
        daily: [],
        carry: [],
        settings: badSettings({ wake: "04:30" }),
        analyzedWrongs: {},
        branchMockHistory: {},
      },
    });
    STORE.getState().restoreBackup();
    const s = STORE.getState().settings;
    assert.equal(s.examDate, T.EXAM_TARGETS.tyt, "geri yükleme tarihi kaydırdı");
    assert.equal(s.wake, "04:30", "diğer ayar kayboldu");
  });

  it("(12) resetAll sınav tarihini korur", () => {
    STORE.getState().resetAll();
    assert.equal(
      STORE.getState().settings.examDate,
      T.EXAM_TARGETS.tyt,
      "sıfırlama tarihi kaydırdı",
    );
  });

  it("(13) diske yazılan kalıcı kayıt sabit tarihi taşır", async () => {
    STORE.getState().updateSettings({ examDate: "2030-01-01", studyMinutes: 260 });
    await new Promise((r) => setTimeout(r, 20));
    const raw = storage.get("netdefter-yks-v1");
    assert.ok(raw, "persist kaydı yazılmadı");
    const saved = JSON.parse(raw!);
    assert.equal(saved.state.settings.examDate, T.EXAM_TARGETS.tyt, "diske hatalı tarih yazıldı");
    assert.equal(saved.state.settings.studyMinutes, 260);
  });

  it("(14) tarih denemesi kullanıcı verisini bozmaz", () => {
    const topics = S.seedTopics();
    STORE.setState({ topics, daily: [] });
    const before = JSON.stringify(STORE.getState().topics);
    STORE.getState().updateSettings({ examDate: "2030-01-01" });
    assert.equal(JSON.stringify(STORE.getState().topics), before, "konu verisi değişti");
  });
});

/**
 * Hidrasyon onarımı — gerçek `persist.rehydrate()` yolu.
 *
 * `merge` tarihi yalnız bellekte sabitler; Zustand hidrasyon sırasında diske geri
 * YAZMAZ. Bu blok, bozuk ham kaydın İLK hidrasyonda (kullanıcı işlemi beklemeden)
 * diske de sabitlendiğini, doğru kaydın gereksiz yere değişmediğini ve eksik
 * ayarların güvenle ele alındığını doğrular.
 */
describe("hidrasyon onarımı — bozuk tarih diske sabitlenir", () => {
  const KEY = "netdefter-yks-v1";

  /** Ham persist kaydını (zarf) doğrudan yazar. */
  function seedRaw(settings: unknown) {
    storage.set(KEY, JSON.stringify({ state: { settings }, version: 8 }));
  }
  /** Diskteki ham kaydın ayarlarını döndürür. */
  function rawSettings(): any {
    const raw = storage.get(KEY);
    return raw ? JSON.parse(raw).state.settings : null;
  }

  beforeEach(() => {
    storage.clear();
    STORE.setState({
      topics: S.seedTopics(),
      archivedTopics: [],
      daily: [],
      settings: { ...T.DEFAULT_SETTINGS },
      frozenPlan: {},
      frozenPlanFrom: "",
    });
  });

  it("(15) bozuk examDate İLK hidrasyonda diske sabitlenir, diğer ayarlar korunur", async () => {
    seedRaw(badSettings({ studyMinutes: 210, programStart: "2026-12-01" }));
    await STORE.persist.rehydrate();
    assert.equal(STORE.getState().settings.examDate, T.EXAM_TARGETS.tyt, "bellek sabitlenmedi");
    const disk = rawSettings();
    assert.equal(disk.examDate, T.EXAM_TARGETS.tyt, "disk onarılmadı");
    assert.equal(disk.studyMinutes, 210, "studyMinutes korunmadı");
    assert.equal(disk.programStart, "2026-12-01", "programStart korunmadı");
  });

  it("(16) yalnız examDate bozuk olsa da diske yazılır", async () => {
    seedRaw(badSettings());
    await STORE.persist.rehydrate();
    assert.equal(rawSettings().examDate, T.EXAM_TARGETS.tyt, "yalnız-tarih senaryosu onarılmadı");
  });

  it("(17) doğru tarihli kayıt gereksiz yere değiştirilmez", async () => {
    seedRaw({ ...T.DEFAULT_SETTINGS });
    const before = storage.get(KEY);
    await STORE.persist.rehydrate();
    assert.equal(storage.get(KEY), before, "doğru kayıt gereksiz değiştirildi");
  });

  it("(18) eksik/boş ayar nesnesi güvenle ele alınır, yazma yapılmaz", async () => {
    storage.set(KEY, JSON.stringify({ state: {}, version: 8 }));
    const before = storage.get(KEY);
    await STORE.persist.rehydrate();
    assert.equal(STORE.getState().settings.examDate, T.EXAM_TARGETS.tyt, "bellek varsayılana dönmedi");
    assert.equal(storage.get(KEY), before, "eksik kayıt gereksiz yazıldı");
  });

  it("(19) onarım sonrası tekrar hidrasyon yazma döngüsü oluşturmaz", async () => {
    seedRaw(badSettings());
    await STORE.persist.rehydrate();
    const afterFirst = storage.get(KEY);
    assert.equal(rawSettings().examDate, T.EXAM_TARGETS.tyt);
    await STORE.persist.rehydrate();
    assert.equal(storage.get(KEY), afterFirst, "ikinci hidrasyon gereksiz yazdı");
  });
});
