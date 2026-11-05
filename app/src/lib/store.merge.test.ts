/**
 * Veri kaybı koruma testleri.
 *
 * `mergeTopicsWithArchive`, kayıtlı konu verisini yeni müfredatla birleştirir
 * ve müfredatta artık bulunmayan kayıtları kaybetmek yerine ayrı arşive taşır.
 * Uygulamanın en kritik fonksiyonu: hata yaparsa kullanıcı tüm çalışma
 * geçmişini kaybeder. Bu testler, kullanıcı alanlarının korunduğunu, arşivin
 * planlamaya sızmadığını ve yedek/geri yüklemenin arşivi koruduğunu doğrular.
 *
 * `vite` ile yüklenir çünkü store `@/` takma adı ve JSON importu kullanır;
 * `node --test` bunları doğrudan çözemez.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type ViteDevServer } from "vite";

let server: ViteDevServer;
let S: any;

/** Müfredatta bulunmayan, kaldırılmış bir konuya ait tipik kullanıcı kaydı. */
function ghostRow(over = {}) {
  return {
    id: "TYT|Sahte Ders|Kaldırılmış Konu|Alt Konu",
    exam: "TYT",
    subject: "Sahte Ders",
    topic: "Kaldırılmış Konu",
    subtopic: "Alt Konu",
    status: "Bitti",
    total: 60,
    correct: 50,
    wrong: 10,
    lastStudy: "2026-11-05",
    reviewDate: "2026-11-12",
    source: "MEB",
    note: "emek verilmiş konu",
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

describe("mergeTopics — veri kaybı koruması", () => {
  it("hiç kayıt yoksa tüm müfredatı üretir", () => {
    const fresh = S.seedTopics();
    const merged = S.mergeTopics([]);
    assert.equal(merged.length, fresh.length);
    assert.ok(merged.length > 0);
  });

  it("kullanıcının çalışma alanlarını korur", () => {
    const fresh = S.seedTopics();
    const target = fresh[0];
    const saved = {
      ...target,
      status: "Tamamlandı",
      total: 40,
      correct: 32,
      wrong: 8,
      lastStudy: "2026-11-05",
      reviewDate: "2026-11-12",
      source: "MEB",
      note: "zor konu",
    };
    const merged = S.mergeTopics([saved]);
    const got = merged.find((t: any) => t.id === target.id);
    assert.ok(got, "konu kayboldu");
    assert.equal(got.status, "Tamamlandı");
    assert.equal(got.total, 40);
    assert.equal(got.correct, 32);
    assert.equal(got.wrong, 8);
    assert.equal(got.lastStudy, "2026-11-05");
    assert.equal(got.reviewDate, "2026-11-12");
    assert.equal(got.source, "MEB");
    assert.equal(got.note, "zor konu");
  });

  it("müfredat değişse bile konu adını müfredattan alır", () => {
    // Kullanıcı eski sürümde konuyu farklı adla kaydetmiş olabilir; ad
    // müfredattan gelmeli ki liste ile arayüz çelişmesin.
    const fresh = S.seedTopics();
    const target = fresh[0];
    const stale = { ...target, topic: "ESKİ AD", subtopic: "ESKİ ALT", status: "Tamamlandı" };
    const merged = S.mergeTopics([stale]);
    const got = merged.find((t: any) => t.id === target.id);
    assert.equal(got.topic, target.topic);
    assert.equal(got.subtopic, target.subtopic);
    assert.equal(got.status, "Tamamlandı", "durum korunmalıydı");
  });

  it("müfredatta olmayan kaydı aktif listeye sokmaz (veri kaybı yok)", () => {
    // Eskiden bu kayıt sessizce siliniyordu. Artık aktif listede görünmez ama
    // arşive taşınır; bir sonraki describe bloğu korunduğunu doğrular.
    const merged = S.mergeTopics([ghostRow()]);
    assert.equal(
      merged.filter((t: any) => t.subject === "Sahte Ders").length,
      0,
      "müfredatta olmayan kayıt aktif listeye sızdı",
    );
  });

  it("kayıt sayısı kadar konuyu eksiksiz döndürür", () => {
    const fresh = S.seedTopics();
    const saved = fresh.slice(0, 5).map((t: any) => ({ ...t, status: "Tamamlandı" }));
    const merged = S.mergeTopics(saved);
    assert.equal(merged.length, fresh.length);
    assert.equal(merged.filter((t: any) => t.status === "Tamamlandı").length, 5);
  });
});

describe("arşiv — eski müfredat verisi korunur", () => {
  it("(1) müfredattan kaldırılan konuyu arşive taşır, aktif listeden çıkarır", () => {
    const ghost = ghostRow();
    const { topics, archivedTopics } = S.mergeTopicsWithArchive([ghost]);
    assert.equal(topics.some((t: any) => t.id === ghost.id), false, "arşiv kaydı aktif listede");
    assert.equal(archivedTopics.length, 1);
    assert.equal(archivedTopics[0].id, ghost.id);
  });

  it("(2) kullanıcı alanlarını arşivde eksiksiz korur", () => {
    const ghost = ghostRow();
    const { archivedTopics } = S.mergeTopicsWithArchive([ghost]);
    const kept = archivedTopics[0];
    assert.equal(kept.status, "Bitti");
    assert.equal(kept.total, 60);
    assert.equal(kept.correct, 50);
    assert.equal(kept.wrong, 10);
    assert.equal(kept.lastStudy, "2026-11-05");
    assert.equal(kept.reviewDate, "2026-11-12");
    assert.equal(kept.source, "MEB");
    assert.equal(kept.note, "emek verilmiş konu");
  });

  it("(3) arşivlenen kayıt aktif konulara ve planlamaya sızmaz", () => {
    const ghost = ghostRow();
    const { topics, archivedTopics } = S.mergeTopicsWithArchive([ghost]);
    // Aktif liste yalnızca müfredat uzunluğunda ve arşiv kimliklerini içermez.
    assert.equal(topics.length, S.seedTopics().length);
    const liveIds = new Set(topics.map((t: any) => t.id));
    for (const a of archivedTopics) {
      assert.equal(liveIds.has(a.id), false, `arşiv kimliği aktif listede: ${a.id}`);
    }
  });

  it("(4) aynı kimlikle geri eklenen konu eski verilerini geri alır (kopya kalmaz)", () => {
    const fresh = S.seedTopics();
    const target = fresh[0];
    const saved = { ...target, status: "Bitti", total: 42, correct: 40, wrong: 2, note: "geri gelen konu" };
    // Konu bir zamanlar arşive düşmüş, sonra aynı kimlikle müfredata dönmüş.
    const { topics, archivedTopics } = S.mergeTopicsWithArchive([], [saved]);
    const got = topics.find((t: any) => t.id === target.id);
    assert.ok(got, "konu geri bağlanmadı");
    assert.equal(got.status, "Bitti");
    assert.equal(got.total, 42);
    assert.equal(got.note, "geri gelen konu");
    assert.equal(archivedTopics.length, 0, "geri bağlanan kayıt arşivde kopya olarak kaldı");
  });

  it("(5) kimliği değişmiş konuyu yanlış konuyla eşleştirmez", () => {
    const fresh = S.seedTopics();
    const target = fresh[0];
    // Aynı ders ve konu adı, farklı alt konu -> farklı kimlik. Ad benzerliği
    // ile eşleştirme YAPILMAMALI; aksi hâlde veri yanlış konuya bağlanır.
    const renamed = { ...target, id: `${target.exam}|${target.subject}|${target.topic}|Bambaşka Alt Konu`, status: "Bitti", total: 99 };
    const { topics, archivedTopics } = S.mergeTopicsWithArchive([renamed]);
    const live = topics.find((t: any) => t.id === target.id);
    assert.equal(live.status, "Başlamadım", "yanlış konuya veri bağlandı");
    assert.equal(live.total, null, "yanlış konuya soru sayısı bağlandı");
    assert.equal(archivedTopics.length, 1, "güvenli eşleşme yokken kayıt arşivde tutulmadı");
    assert.equal(archivedTopics[0].id, renamed.id);
  });

  it("(6) yedek alma ve geri yükleme arşiv verisini korur", () => {
    const ghost = ghostRow();
    const st = S.useAppStore.getState();
    S.useAppStore.setState({ topics: [...st.topics], archivedTopics: [ghost] });

    S.useAppStore.getState().resetAll(); // yedek alınır
    assert.equal(S.useAppStore.getState().archivedTopics.length, 1, "sıfırlama arşivi sildi");

    S.useAppStore.getState().restoreBackup();
    const after = S.useAppStore.getState();
    assert.equal(after.archivedTopics.length, 1, "geri yükleme arşivi kaybetti");
    assert.equal(after.archivedTopics[0].id, ghost.id);
    assert.equal(after.archivedTopics[0].total, 60);
  });

  it("(7) archivedTopics içermeyen eski formatlı yedek güvenle çalışır", () => {
    const fresh = S.seedTopics();
    const saved = { ...fresh[0], status: "Bitti", total: 7 };
    // Eski yedek: arşiv alanı yok.
    const { topics, archivedTopics } = S.mergeTopicsWithArchive([saved], undefined as any);
    assert.equal(archivedTopics.length, 0);
    assert.equal(topics.length, fresh.length);
    assert.equal(topics.find((t: any) => t.id === saved.id).total, 7);
  });

  it("(8) aynı kayıt tekrar tekrar birleştirildiğinde arşivde kopya oluşmaz", () => {
    const ghost = ghostRow();
    const first = S.mergeTopicsWithArchive([ghost]);
    const second = S.mergeTopicsWithArchive(first.topics, first.archivedTopics);
    const third = S.mergeTopicsWithArchive(second.topics, second.archivedTopics);
    assert.equal(first.archivedTopics.length, 1);
    assert.equal(second.archivedTopics.length, 1, "ikinci birleştirmede kopya oluştu");
    assert.equal(third.archivedTopics.length, 1, "üçüncü birleştirmede kopya oluştu");
    // Aynı kayıt girdi içinde iki kez geçse de tek kalır.
    assert.equal(S.mergeTopicsWithArchive([ghost, ghost]).archivedTopics.length, 1);
  });
});
