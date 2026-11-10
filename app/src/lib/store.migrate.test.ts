/**
 * Persist migrasyonu testleri — program başlangıcı takvim kaydırması.
 *
 * `migratePersistedState`, eski kayıtlı durumdaki varsayılan `programStart`
 * değerlerini (v0 `2026-11-01`, v1 `2026-11-04`, v2 `2026-11-05`,
 * v3 `2026-11-09`, v4 `2026-11-10`) yeni varsayılana (`2026-11-11` Çarşamba)
 * taşır. Kritik sınır:
 * kullanıcının ELLE ayarladığı başka bir tarihe dokunulmamalı ve kullanıcı
 * verisi (konular, yanlışlar, denemeler, arşiv, diğer ayarlar) hiç değişmemeli.
 *
 * `vite` ile yüklenir çünkü store `@/` takma adı ve JSON importu kullanır.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type ViteDevServer } from "vite";

let server: ViteDevServer;
let S: any;

/** Eski (v0) kayıtlı durum: takvim kaydırmasından önceki varsayılan başlangıç. */
function legacyState(over: Record<string, unknown> = {}) {
  return {
    topics: [
      { id: "TYT|Matematik|Temel Kavramlar|Sayı kümeleri", exam: "TYT", subject: "Matematik",
        topic: "Temel Kavramlar", subtopic: "Sayı kümeleri", status: "Bitti", total: 40,
        correct: 34, wrong: 6, lastStudy: "2026-10-30", reviewDate: "2026-11-06",
        source: "MEB", note: "kullanıcı-notu" },
    ],
    archivedTopics: [
      { id: "TYT|Eski Ders|Kaldırılmış Konu|Alt", exam: "TYT", subject: "Eski Ders",
        topic: "Kaldırılmış Konu", subtopic: "Alt", status: "Bitti", total: 25, correct: 20,
        wrong: 5, lastStudy: "2026-09-15", reviewDate: "", source: "X", note: "arşiv-notu" },
    ],
    wrongs: [{ id: "w1", date: "2026-10-28", exam: "TYT", subject: "Matematik",
      topic: "Temel Kavramlar", subtopic: "Sayı kümeleri", source: "3D", questionNo: "12",
      reason: "Dikkat hatası", note: "", reviewDate: "", result: "" }],
    tytExams: [{ id: "t1", date: "2026-10-20", name: "D1", turD: 20, turY: 5, matD: 18, matY: 7,
      sosD: 15, sosY: 5, fenD: 12, fenY: 8, note: "" }],
    aytExams: [{ id: "a1", date: "2026-10-21", name: "A1", matD: 15, matY: 5, fizD: 10, fizY: 4,
      kimD: 8, kimY: 2, bioD: 9, bioY: 1, note: "zor" }],
    daily: [{ id: "d1", date: "2026-10-29", subject: "Matematik", topic: "Türev",
      kind: "Soru çözümü", minutes: 60, questions: 30, correct: 25, wrong: 5, note: "" }],
    settings: { programStart: "2026-11-01", examDate: "2027-06-19", studyMinutes: 240, weeklyHours: 26 },
    carry: [{ id: "c1", title: "Kaçırılan gün", minutes: 240, created: "2026-11-01" }],
    ...over,
  };
}

before(async () => {
  server = await createServer({ server: { middlewareMode: true }, logLevel: "silent" });
  S = await server.ssrLoadModule("/src/lib/store.ts");
});

after(async () => {
  await server?.close();
});

describe("migratePersistedState — eski programStart taşınır", () => {
  it("(1) eski varsayılan '2026-11-01' -> güncel varsayılan '2026-11-11'", () => {
    const out: any = S.migratePersistedState(legacyState(), 0);
    assert.equal(out.settings.programStart, "2026-11-11");
  });

  it("(1b) v1 varsayılanı '2026-11-04' -> güncel '2026-11-11'", () => {
    const out: any = S.migratePersistedState(legacyState({ settings: { programStart: "2026-11-04" } }), 1);
    assert.equal(out.settings.programStart, "2026-11-11");
  });

  it("(1c) v2 varsayılanı '2026-11-05' -> güncel '2026-11-11'", () => {
    const out: any = S.migratePersistedState(legacyState({ settings: { programStart: "2026-11-05" } }), 2);
    assert.equal(out.settings.programStart, "2026-11-11");
  });

  it("(1d) v3 varsayılanı '2026-11-09' -> güncel '2026-11-11'", () => {
    const out: any = S.migratePersistedState(legacyState({ settings: { programStart: "2026-11-09" } }), 3);
    assert.equal(out.settings.programStart, "2026-11-11");
  });

  it("(1e) v4 varsayılanı '2026-11-10' -> güncel '2026-11-11'", () => {
    const out: any = S.migratePersistedState(legacyState({ settings: { programStart: "2026-11-10" } }), 4);
    assert.equal(out.settings.programStart, "2026-11-11");
  });

  it("(2) sürüm PERSIST_VERSION'a eşitse dokunulmaz (tek seferlik)", () => {
    const out: any = S.migratePersistedState(legacyState(), S.PERSIST_VERSION);
    assert.equal(out.settings.programStart, "2026-11-01", "yeni sürümde migrasyon çalıştı");
  });

  it("(3) idempotent: ikinci kez çağrılınca sonuç değişmez", () => {
    const once: any = S.migratePersistedState(legacyState(), 0);
    const twice: any = S.migratePersistedState(once, 0);
    assert.equal(twice.settings.programStart, "2026-11-11");
    assert.deepEqual(twice.settings, once.settings);
  });

  it("(3b) v3 kaydı iki kez migrasyondan geçse tarih tekrar kaymaz", () => {
    const once: any = S.migratePersistedState(legacyState({ settings: { programStart: "2026-11-09" } }), 3);
    const twice: any = S.migratePersistedState(once, 3);
    assert.equal(twice.settings.programStart, "2026-11-11", "tarih tekrar kaydı");
  });

  it("(4) sabitler doğru değerleri taşır", () => {
    assert.equal(S.LEGACY_PROGRAM_START, "2026-11-01");
    assert.equal(S.V1_PROGRAM_START, "2026-11-04");
    assert.equal(S.V2_PROGRAM_START, "2026-11-05");
    assert.equal(S.V3_PROGRAM_START, "2026-11-09");
    assert.equal(S.V4_PROGRAM_START, "2026-11-10");
    assert.equal(S.MIGRATED_PROGRAM_START, "2026-11-11");
    assert.equal(S.PERSIST_VERSION, 5);
  });
});

describe("migratePersistedState — elle ayarlanan tarihe dokunmaz", () => {
  it("(5) farklı bir programStart korunur", () => {
    const out: any = S.migratePersistedState(legacyState({ settings: { programStart: "2026-12-01" } }), 0);
    assert.equal(out.settings.programStart, "2026-12-01", "elle ayarlanan tarih bozuldu");
  });

  it("(6) güncel varsayılan zaten ayarlıysa aynen kalır", () => {
    const out: any = S.migratePersistedState(legacyState({ settings: { programStart: "2026-11-11" } }), 0);
    assert.equal(out.settings.programStart, "2026-11-11");
  });

  it("(7) programStart yoksa hata vermez, diğer ayarlar korunur", () => {
    const out: any = S.migratePersistedState(legacyState({ settings: { examDate: "2027-06-19", studyMinutes: 300 } }), 0);
    assert.equal(out.settings.programStart, undefined);
    assert.equal(out.settings.examDate, "2027-06-19");
    assert.equal(out.settings.studyMinutes, 300);
  });
});

describe("migratePersistedState — kullanıcı verisi değişmez", () => {
  it("(8) konular, yanlışlar, denemeler, günlük, arşiv, carry aynen korunur", () => {
    const src = legacyState();
    const out: any = S.migratePersistedState(src, 0);
    assert.deepEqual(out.topics, src.topics);
    assert.deepEqual(out.wrongs, src.wrongs);
    assert.deepEqual(out.tytExams, src.tytExams);
    assert.deepEqual(out.aytExams, src.aytExams);
    assert.deepEqual(out.daily, src.daily);
    assert.deepEqual(out.archivedTopics, src.archivedTopics);
    assert.deepEqual(out.carry, src.carry);
  });

  it("(9) diğer ayar alanları (examDate, studyMinutes) korunur", () => {
    const src = legacyState();
    const out: any = S.migratePersistedState(src, 0);
    assert.equal(out.settings.examDate, src.settings.examDate);
    assert.equal(out.settings.studyMinutes, src.settings.studyMinutes);
    assert.equal(out.settings.weeklyHours, src.settings.weeklyHours);
  });

  it("(10) girdi mutasyona uğramaz (kaynak nesne değişmez)", () => {
    const src = legacyState();
    const snapshotBefore = JSON.stringify(src);
    S.migratePersistedState(src, 0);
    assert.equal(JSON.stringify(src), snapshotBefore, "girdi mutasyona uğradı");
    assert.equal(src.settings.programStart, "2026-11-01", "kaynak nesnenin değeri değişti");
  });

  it("(11) boş / null / bozuk girdi güvenle ele alınır", () => {
    assert.doesNotThrow(() => S.migratePersistedState(undefined, 0));
    assert.doesNotThrow(() => S.migratePersistedState(null, 0));
    assert.doesNotThrow(() => S.migratePersistedState("metin", 0));
    assert.doesNotThrow(() => S.migratePersistedState({ settings: null }, 0));
    assert.doesNotThrow(() => S.migratePersistedState({ settings: "x" }, 0));
  });
});

describe("migratePersistedState + merge — gerçek akış", () => {
  it("(12) migrasyon sonrası varsayılanlarla birleşince programStart 2026-11-11 olur", async () => {
    const D = (await server.ssrLoadModule("/src/lib/smart/types.ts")).DEFAULT_SETTINGS;
    const migrated: any = S.migratePersistedState(legacyState(), 0);
    // store.ts içindeki merge ile aynı kural:
    const mergedSettings = { ...D, ...migrated.settings };
    assert.equal(mergedSettings.programStart, "2026-11-11");
    assert.equal(mergedSettings.examDate, "2027-06-19");
  });

  it("(13) migrasyon kullanıcı konusunu koruyup planlamaya doğru verir", () => {
    // Gerçek bir müfredat kimliği kullanılır; aksi hâlde mergeTopicsWithArchive
    // kaydı (doğru biçimde) arşive taşır ve aktif listede bulunamaz.
    const real = S.seedTopics()[0];
    const saved = { ...real, status: "Bitti", total: 40, correct: 34, wrong: 6, note: "kullanıcı-notu" };
    const migrated: any = S.migratePersistedState(legacyState({ topics: [saved] }), 0);
    const merged = S.mergeTopicsWithArchive(migrated.topics, migrated.archivedTopics);
    const live = merged.topics.find((t: any) => t.id === real.id);
    assert.ok(live, "kullanıcı konusu aktif listede bulunamadı");
    assert.equal(live.total, 40, "kullanıcı verisi kayboldu");
    assert.equal(live.note, "kullanıcı-notu");
    assert.equal(merged.archivedTopics.length, 1, "arşiv kayboldu");
  });
});

/**
 * Zincir sürekliliği ve veri bütünlüğü — her eski sürüm TEK çağrıda v5'e ulaşır
 * ve kullanıcı verisi hiçbir adımda kaybolmaz. `programStart` dışındaki tüm
 * alanlar (konu, yanlış, deneme, günlük, arşiv, carry, diğer ayarlar) korunur.
 */
describe("migratePersistedState — zincir sürekliliği (v0..v5 → v5)", () => {
  const STARTS: [number, string, string][] = [
    [0, "2026-11-01", "v0"],
    [1, "2026-11-04", "v1"],
    [2, "2026-11-05", "v2"],
    [3, "2026-11-09", "v3"],
    [4, "2026-11-10", "v4"],
  ];

  for (const [fromVersion, start, label] of STARTS) {
    it(`${label} (programStart ${start}) tek çağrıda v5'e ulaşır, veri korunur`, () => {
      const src = legacyState({ settings: { programStart: start, examDate: "2027-06-19", studyMinutes: 240, weeklyHours: 26 } });
      const out: any = S.migratePersistedState(src, fromVersion);
      assert.equal(out.settings.programStart, "2026-11-11", `${label}: hedefe ulaşmadı`);
      // Kullanıcı verisi hiçbir adımda kaybolmaz.
      assert.deepEqual(out.topics, src.topics, `${label}: konular kayboldu`);
      assert.deepEqual(out.wrongs, src.wrongs, `${label}: yanlışlar kayboldu`);
      assert.deepEqual(out.tytExams, src.tytExams, `${label}: TYT denemeleri kayboldu`);
      assert.deepEqual(out.aytExams, src.aytExams, `${label}: AYT denemeleri kayboldu`);
      assert.deepEqual(out.daily, src.daily, `${label}: günlük kayıtlar kayboldu`);
      assert.deepEqual(out.archivedTopics, src.archivedTopics, `${label}: arşiv kayboldu`);
      assert.deepEqual(out.carry, src.carry, `${label}: carry kayboldu`);
      assert.equal(out.settings.examDate, "2027-06-19", `${label}: examDate bozuldu`);
      assert.equal(out.settings.studyMinutes, 240, `${label}: studyMinutes bozuldu`);
      assert.equal(out.settings.weeklyHours, 26, `${label}: weeklyHours bozuldu`);
    });
  }

  it("v5 kaydı yeniden açılışta veri kaybı olmadan aynen korunur", () => {
    const src = legacyState({ settings: { programStart: "2026-11-11", examDate: "2027-06-19" } });
    const out: any = S.migratePersistedState(src, 5);
    // Hiçbir alan değişmemeli: programStart dahil tüm veri aynen kalır.
    assert.deepEqual(out.settings, src.settings, "v5 yeniden açılışta ayarlar değişti");
    assert.deepEqual(out.topics, src.topics);
    assert.deepEqual(out.wrongs, src.wrongs);
    assert.deepEqual(out.daily, src.daily);
    assert.deepEqual(out.carry, src.carry);
  });

  it("daha yeni sürüm (v6+) girdisi de dokunulmadan bırakılır", () => {
    const src = legacyState({ settings: { programStart: "2026-11-01" } });
    const out: any = S.migratePersistedState(src, 6);
    assert.equal(out.settings.programStart, "2026-11-01", "gelecek sürüm yanlışlıkla migre edildi");
  });

  it("zincirin tüm ara değerleri tek çağrıda atlanır (v0 → v5, ara adımlar kalmaz)", () => {
    const out: any = S.migratePersistedState(legacyState(), 0);
    for (const s of ["2026-11-04", "2026-11-05", "2026-11-09", "2026-11-10"]) {
      assert.notEqual(out.settings.programStart, s, `ara değerde takıldı: ${s}`);
    }
    assert.equal(out.settings.programStart, "2026-11-11");
  });
});

/**
 * Eksik yeni alanların GÜVENLİ VARSAYILANLARLA oluşturulması.
 *
 * `analyzedWrongs` ve `branchMockHistory` v4'te eklendi. `migratePersistedState`
 * bu alanları EKLEMEZ (yalnızca programStart'ı taşır); güvenli varsayılan store
 * `merge` katmanında uygulanır (`?? {}`). Bu blok, eski kayıtlarda alanlar
 * yokken birleştirmenin boş nesneyle güvenle sonuçlandığını kilitler.
 */
describe("eksik yeni alanlar güvenli varsayılanla oluşturulur", () => {
  it("eski kayıtta analyzedWrongs/branchMockHistory yoksa birleştirme boş nesne verir", async () => {
    const D = (await server.ssrLoadModule("/src/lib/smart/types.ts")).DEFAULT_SETTINGS;
    // v0 kaydında bu alanlar yoktur.
    const migrated: any = S.migratePersistedState(legacyState(), 0);
    assert.equal(migrated.analyzedWrongs, undefined, "migrasyon beklenmedik alan ekledi");
    assert.equal(migrated.branchMockHistory, undefined, "migrasyon beklenmedik alan ekledi");
    // store.ts `merge` ile aynı kural:
    const merged = {
      ...D,
      analyzedWrongs: migrated.analyzedWrongs ?? {},
      branchMockHistory: migrated.branchMockHistory ?? {},
    };
    assert.deepEqual(merged.analyzedWrongs, {});
    assert.deepEqual(merged.branchMockHistory, {});
  });

  it("kayıtta alanlar varsa aynen korunur (varsayılan ezmez)", () => {
    const src = legacyState({ analyzedWrongs: { w1: "2026-11-02" }, branchMockHistory: { "TYT|Fizik": "2026-11-01" } });
    const out: any = S.migratePersistedState(src, 0);
    assert.deepEqual(out.analyzedWrongs, { w1: "2026-11-02" });
    assert.deepEqual(out.branchMockHistory, { "TYT|Fizik": "2026-11-01" });
  });
});
