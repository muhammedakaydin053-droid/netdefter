/**
 * JSON yedekleme testleri — dışa/içe aktarma.
 *
 * `vite` ile yüklenir çünkü store `@/` takma adı ve JSON importu kullanır.
 * Saf yardımcıları (`backup.ts`) ve store entegrasyonunu (`importData`)
 * birlikte doğrular. En kritik iddia: bozuk/eksik/uyumsuz bir dosya mevcut
 * veriyi ASLA değiştirmemelidir.
 */
import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createServer, type ViteDevServer } from "vite";

let server: ViteDevServer;
let S: any;
let B: any;

/** Aktif konu: gerçek bir müfredat satırı (id müfredatta olmalı). */
function activeTopic() {
  const fresh = S.seedTopics()[0];
  return { ...fresh, status: "Bitti", total: 40, correct: 34, wrong: 6, lastStudy: "2026-11-01", reviewDate: "2026-11-08", source: "MEB", note: "not-1" };
}

/** Müfredatta bulunmayan, kaldırılmış bir konu (arşive ait). */
function ghostRow() {
  return {
    id: "TYT|Kaldırılan Ders|Eski Konu|Alt",
    exam: "TYT",
    subject: "Kaldırılan Ders",
    topic: "Eski Konu",
    subtopic: "Alt",
    status: "Bitti",
    total: 60,
    correct: 50,
    wrong: 10,
    lastStudy: "2026-10-01",
    reviewDate: "2026-10-10",
    source: "MEB",
    note: "arsiv-notu",
  };
}

function sampleData() {
  return {
    topics: [activeTopic()],
    archivedTopics: [ghostRow()],
    wrongs: [
      { id: "w1", date: "2026-11-02", exam: "TYT", subject: "Matematik", topic: "Temel Kavramlar", subtopic: "Sayı kümeleri", source: "3D", questionNo: "12", reason: "İşlem hatası", note: "işaret hatası", reviewDate: "2026-11-09", result: "Hâlâ yanlış" },
    ],
    tytExams: [
      { id: "t1", date: "2026-10-20", name: "D1", turD: 20, turY: 5, matD: 18, matY: 7, sosD: 15, sosY: 5, fenD: 12, fenY: 8, note: "" },
    ],
    aytExams: [
      { id: "a1", date: "2026-10-21", name: "A1", matD: 15, matY: 5, fizD: 10, fizY: 4, kimD: 8, kimY: 2, bioD: 9, bioY: 1, note: "zor" },
    ],
    daily: [
      { id: "d1", date: "2026-11-02", subject: "Matematik", topic: "Türev", kind: "Soru çözümü", minutes: 60, questions: 30, correct: 25, wrong: 5, note: "" },
    ],
    settings: {
      wake: "07:00", sleep: "23:30", studyMinutes: 300, weeklyHours: 30,
      examDate: "2027-06-19", programStart: "2026-11-01",
      mockWeekdays: [6], sportDays: [3], sportStart: "17:00", sportEnd: "18:30",
      meals: [{ name: "Kahvaltı", start: "08:00", end: "08:40" }],
      leisure: [{ name: "Dinlenme", days: [0], start: "21:30", end: "22:20" }],
      paragraphTarget: 40, problemTarget: 20,
    },
    carry: [{ id: "c1", title: "Kaçırılan gün", minutes: 240, created: "2026-11-01" }],
  };
}

/** Ham yedek zarfı üretir (belirli alanı bozmak için). */
function envelope(data: unknown, over: Record<string, unknown> = {}) {
  return JSON.stringify({ format: "netdefter-yks-backup", version: 1, exportedAt: "2026-11-03T00:00:00.000Z", app: "NetDefter", data, ...over });
}

before(async () => {
  server = await createServer({ server: { middlewareMode: true }, logLevel: "silent" });
  S = await server.ssrLoadModule("/src/lib/store.ts");
  B = await server.ssrLoadModule("/src/lib/backup.ts");
});

after(async () => {
  await server?.close();
});

describe("JSON dışa aktarma — tüm alanlar", () => {
  it("(1) zarf format ve sürüm bilgisi taşır", () => {
    const file = B.buildBackupFile(sampleData(), "2026-11-03T00:00:00.000Z");
    assert.equal(file.format, "netdefter-yks-backup");
    assert.equal(file.version, 1);
    assert.equal(file.app, "NetDefter");
    assert.equal(file.exportedAt, "2026-11-03T00:00:00.000Z");
  });

  it("(2) dosya adı tarih içerir", () => {
    assert.equal(B.backupFilename(new Date("2026-11-03T12:00:00")), "netdefter-yedek-2026-11-03.json");
  });

  it("(3) tüm veri alanlarını eksiksiz serileştirir", () => {
    const d = sampleData();
    const parsed = B.parseBackup(B.serializeBackup(d));
    assert.equal(parsed.ok, true);
    for (const key of ["topics", "archivedTopics", "wrongs", "tytExams", "aytExams", "daily", "carry"]) {
      assert.deepEqual((parsed.data as any)[key], (d as any)[key], `${key} alanı eksik/farklı`);
    }
    assert.deepEqual(parsed.data.settings, d.settings, "settings alanı eksik/farklı");
  });

  it("(4) dışa aktarma mevcut durumu değiştirmez", () => {
    const st = S.useAppStore.getState();
    S.useAppStore.setState({ topics: [...st.topics], archivedTopics: [ghostRow()] });
    const before = JSON.stringify(S.useAppStore.getState().archivedTopics);
    B.serializeBackup(B.toBackupData(S.useAppStore.getState()));
    const after = JSON.stringify(S.useAppStore.getState().archivedTopics);
    assert.equal(after, before, "dışa aktarma durumu değiştirdi");
  });
});

describe("JSON içe aktarma — round-trip", () => {
  beforeEach(() => {
    S.useAppStore.setState({ backup: null });
  });

  it("(5) dışa aktarılan veri tekrar içe aktarılınca eşit olur", () => {
    const d = sampleData();
    const parsed = B.parseBackup(B.serializeBackup(d));
    assert.equal(parsed.ok, true);
    S.useAppStore.getState().importData(parsed.data);
    const s = S.useAppStore.getState();

    assert.equal(s.topics.length, S.seedTopics().length);
    const got = s.topics.find((t: any) => t.id === d.topics[0].id);
    assert.ok(got, "aktif konu bulunamadı");
    assert.equal(got.status, "Bitti");
    assert.equal(got.total, 40);
    assert.equal(got.correct, 34);
    assert.equal(got.note, "not-1");

    assert.equal(s.archivedTopics.length, 1);
    assert.equal(s.archivedTopics[0].id, d.archivedTopics[0].id);
    assert.equal(s.archivedTopics[0].total, 60);
    const liveIds = new Set(s.topics.map((t: any) => t.id));
    for (const a of s.archivedTopics) assert.equal(liveIds.has(a.id), false, "arşiv aktif listeye sızdı");

    assert.deepEqual(s.wrongs, d.wrongs);
    assert.deepEqual(s.tytExams, d.tytExams);
    assert.deepEqual(s.aytExams, d.aytExams);
    assert.deepEqual(s.daily, d.daily);
    assert.deepEqual(s.carry, d.carry);
    assert.equal(s.settings.studyMinutes, 300);
  });

  it("(6) içe aktarma öncesi mevcut durum yedeğe alınır", () => {
    const target = S.seedTopics()[0].id;
    S.useAppStore.setState({ topics: S.seedTopics(), archivedTopics: [], backup: null });
    S.useAppStore.getState().updateTopic(target, { status: "Bitti", total: 99 });
    S.useAppStore.getState().importData(sampleData());
    const b = S.useAppStore.getState().backup;
    assert.ok(b, "içe aktarma yedeği oluşmadı");
    assert.equal(b.topics.find((t: any) => t.id === target).total, 99, "yedek eski durumu tutmuyor");
    S.useAppStore.getState().restoreBackup();
    assert.equal(S.useAppStore.getState().topics.find((t: any) => t.id === target).total, 99);
  });
});

describe("bozuk / uyumsuz dosya — mevcut veri korunur", () => {
  it("(7) bozuk JSON reddedilir", () => {
    assert.equal(B.parseBackup("{ bu json degil ").ok, false);
  });

  it("(8) yanlış format reddedilir", () => {
    assert.equal(B.parseBackup(JSON.stringify({ format: "baska-uygulama", version: 1, data: { topics: [] } })).ok, false);
  });

  it("(9) daha yeni sürüm reddedilir", () => {
    const r = B.parseBackup(envelope({ topics: [] }, { version: 99 }));
    assert.equal(r.ok, false);
    assert.match(r.error, /sürüm/i);
  });

  it("(10) eksik data reddedilir", () => {
    assert.equal(B.parseBackup(JSON.stringify({ format: "netdefter-yks-backup", version: 1 })).ok, false);
  });

  it("(11) topics alanı eksikse reddedilir", () => {
    assert.equal(B.parseBackup(envelope({ archivedTopics: [] })).ok, false);
  });

  it("(12) archivedTopics eksikse tolere edilir (eski yedek)", () => {
    const r = B.parseBackup(envelope({ topics: sampleData().topics }));
    assert.equal(r.ok, true);
    assert.deepEqual(r.data.archivedTopics, []);
  });

  it("(13) başarısız içe aktarma mevcut veriyi değiştirmez", () => {
    const seed = S.seedTopics();
    S.useAppStore.setState({ topics: seed, archivedTopics: [], backup: null });
    S.useAppStore.getState().updateTopic(seed[0].id, { status: "Bitti", total: 77 });
    const snapshotBefore = JSON.stringify({
      topics: S.useAppStore.getState().topics,
      archivedTopics: S.useAppStore.getState().archivedTopics,
      backup: S.useAppStore.getState().backup,
    });

    const r = B.parseBackup("bozuk");
    assert.equal(r.ok, false);
    if (r.ok) S.useAppStore.getState().importData(r.data);

    const snapshotAfter = JSON.stringify({
      topics: S.useAppStore.getState().topics,
      archivedTopics: S.useAppStore.getState().archivedTopics,
      backup: S.useAppStore.getState().backup,
    });
    assert.equal(snapshotAfter, snapshotBefore, "başarısız içe aktarma veriyi değiştirdi");
  });

  it("(14) importData geçersiz girdiyle çağrılırsa durumu değiştirmez", () => {
    const seed = S.seedTopics();
    S.useAppStore.setState({ topics: seed, archivedTopics: [], backup: null });
    const before = JSON.stringify(S.useAppStore.getState().topics);
    S.useAppStore.getState().importData({ topics: null });
    assert.equal(JSON.stringify(S.useAppStore.getState().topics), before);
  });
});

describe("arşiv — içe aktarmada korunur", () => {
  it("(15) arşivlenen konu aktif listeye karışmaz", () => {
    S.useAppStore.setState({ topics: S.seedTopics(), archivedTopics: [], backup: null });
    S.useAppStore.getState().importData(sampleData());
    const s = S.useAppStore.getState();
    const liveIds = new Set(s.topics.map((t: any) => t.id));
    assert.equal(liveIds.has(ghostRow().id), false);
    assert.equal(s.archivedTopics.some((a: any) => a.id === ghostRow().id), true);
  });

  it("(16) tekrarlı içe aktarmada arşivde kopya birikmez", () => {
    S.useAppStore.setState({ topics: S.seedTopics(), archivedTopics: [], backup: null });
    S.useAppStore.getState().importData(sampleData());
    S.useAppStore.getState().importData(sampleData());
    assert.equal(S.useAppStore.getState().archivedTopics.length, 1);
  });
});

/**
 * Arşiv birleşimi (Öneri A) — `importData` mevcut arşivi SİLMEZ, BİRLEŞTİRİR.
 *
 * Regresyon: eskiden `archivedTopics` alanı olmayan (veya boş) eski formatlı
 * bir yedek, elde duran arşiv kayıtlarını siliyordu. Artık yedekteki arşiv
 * mevcut arşivle birleşir; aynı kimlikte mevcut kayıt korunur ve hiçbir alanı
 * kaybolmaz. Müfredata dönen konu aktif listeye bağlanır, arşivde kopya kalmaz.
 */
describe("arşiv birleşimi — importData mevcut arşivi korur", () => {
  /** İkinci, farklı kimlikli kaldırılmış konu (mevcut arşivde duracak). */
  function ghostB() {
    return {
      id: "TYT|Başka Kaldırılan Ders|Diğer Eski Konu|Alt B",
      exam: "TYT",
      subject: "Başka Kaldırılan Ders",
      topic: "Diğer Eski Konu",
      subtopic: "Alt B",
      status: "Çalışıyorum",
      total: 25,
      correct: 20,
      wrong: 5,
      lastStudy: "2026-09-15",
      reviewDate: "2026-09-22",
      source: "Kaynak-B",
      note: "mevcut-arşiv-notu",
    };
  }

  /** Eski formatlı yedek verisi: `archivedTopics` alanı hiç yok. */
  function dataWithoutArchive(over: Record<string, unknown> = {}) {
    const { archivedTopics: _drop, ...rest } = sampleData() as any;
    return { ...rest, ...over };
  }

  it("(17) eski formatlı (arşivsiz) yedek mevcut arşivi korur", () => {
    S.useAppStore.setState({ topics: S.seedTopics(), archivedTopics: [ghostB()], backup: null });
    S.useAppStore.getState().importData(dataWithoutArchive());
    const s = S.useAppStore.getState();
    assert.equal(s.archivedTopics.length, 1, "mevcut arşiv silindi");
    assert.equal(s.archivedTopics[0].id, ghostB().id);
  });

  it("(18) eski formatlı yedek mevcut arşivin hiçbir alanını kaybetmez", () => {
    S.useAppStore.setState({ topics: S.seedTopics(), archivedTopics: [ghostB()], backup: null });
    S.useAppStore.getState().importData(dataWithoutArchive());
    const kept = S.useAppStore.getState().archivedTopics[0];
    const src = ghostB();
    for (const k of ["status", "total", "correct", "wrong", "lastStudy", "reviewDate", "source", "note", "subject", "topic", "subtopic"]) {
      assert.equal(kept[k], (src as any)[k], `${k} alanı kayboldu`);
    }
  });

  it("(19) boş arşivli yedek de mevcut arşivi korur", () => {
    S.useAppStore.setState({ topics: S.seedTopics(), archivedTopics: [ghostB()], backup: null });
    S.useAppStore.getState().importData({ ...sampleData(), archivedTopics: [] });
    assert.equal(S.useAppStore.getState().archivedTopics.length, 1, "boş arşiv mevcut kaydı sildi");
    assert.equal(S.useAppStore.getState().archivedTopics[0].id, ghostB().id);
  });

  it("(20) parseBackup ile eski formatlı JSON uçtan uca arşivi korur", () => {
    S.useAppStore.setState({ topics: S.seedTopics(), archivedTopics: [ghostB()], backup: null });
    const r = B.parseBackup(envelope({ topics: sampleData().topics }));
    assert.equal(r.ok, true);
    if (r.ok) S.useAppStore.getState().importData(r.data);
    assert.equal(S.useAppStore.getState().archivedTopics.length, 1, "uçtan uca akışta arşiv silindi");
    assert.equal(S.useAppStore.getState().archivedTopics[0].id, ghostB().id);
  });

  it("(21) yeni formatlı yedekte arşivler birleşir (union)", () => {
    S.useAppStore.setState({ topics: S.seedTopics(), archivedTopics: [ghostB()], backup: null });
    S.useAppStore.getState().importData(sampleData()); // arşivinde ghostRow() var
    const ids = S.useAppStore.getState().archivedTopics.map((a: any) => a.id).sort();
    assert.deepEqual(ids, [ghostB().id, ghostRow().id].sort(), "arşiv birleşmedi");
  });

  it("(22) aynı kimlik çakışırsa mevcut kaydın alanları korunur, kopya oluşmaz", () => {
    const current = { ...ghostB(), note: "guncel-not", total: 99 };
    const fromBackup = { ...ghostB(), note: "yedek-not", total: 1 };
    S.useAppStore.setState({ topics: S.seedTopics(), archivedTopics: [current], backup: null });
    S.useAppStore.getState().importData({ ...sampleData(), archivedTopics: [fromBackup] });
    const arch = S.useAppStore.getState().archivedTopics;
    assert.equal(arch.length, 1, "çift kayıt oluştu");
    assert.equal(arch[0].note, "guncel-not", "mevcut kaydın alanı kayboldu");
    assert.equal(arch[0].total, 99);
  });

  it("(23) müfredata dönen konu arşivden aktif listeye geçer, arşivde kopya kalmaz", () => {
    const back = { ...S.seedTopics()[1], status: "Bitti", total: 42, correct: 40, wrong: 2, note: "geri-gelen" };
    S.useAppStore.setState({ topics: S.seedTopics(), archivedTopics: [back], backup: null });
    S.useAppStore.getState().importData(dataWithoutArchive());
    const s = S.useAppStore.getState();
    const live = s.topics.find((t: any) => t.id === back.id);
    assert.ok(live, "konu aktif listeye dönmedi");
    assert.equal(live.total, 42);
    assert.equal(live.note, "geri-gelen");
    assert.equal(s.topics.filter((t: any) => t.id === back.id).length, 1, "aktif listede çift kayıt");
    assert.equal(s.archivedTopics.some((a: any) => a.id === back.id), false, "arşivde kopya kaldı");
  });

  it("(24) tekrarlı içe aktarmada arşiv birleşimi kopya üretmez", () => {
    S.useAppStore.setState({ topics: S.seedTopics(), archivedTopics: [ghostB()], backup: null });
    S.useAppStore.getState().importData(sampleData());
    S.useAppStore.getState().importData(sampleData());
    S.useAppStore.getState().importData(sampleData());
    assert.equal(S.useAppStore.getState().archivedTopics.length, 2, "kopya birikti");
  });

  it("(25) eski formatlı yedek, müfredata dönen konuyu yine bağlar", () => {
    const back = { ...S.seedTopics()[2], status: "Bitti", total: 33, note: "eski-yedek-geri" };
    S.useAppStore.setState({ topics: S.seedTopics(), archivedTopics: [back], backup: null });
    S.useAppStore.getState().importData(dataWithoutArchive());
    const live = S.useAppStore.getState().topics.find((t: any) => t.id === back.id);
    assert.ok(live, "konu geri bağlanmadı");
    assert.equal(live.total, 33);
    assert.equal(live.note, "eski-yedek-geri");
    assert.equal(S.useAppStore.getState().archivedTopics.some((a: any) => a.id === back.id), false);
  });
});
