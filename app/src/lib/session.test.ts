/**
 * Bağlı çalışma oturumu testleri (Aşama 1.5.3).
 *
 * Amaç: Konularım'daki kümülatif (`topics`) ile Günlük'teki oturum (`daily`)
 * katmanını tek kaynaktan beslemek. Bir oturum eklenince kümülatife GERÇEK delta
 * (`applied`) eklenir; silinince kesin geri alınır; elle kümülatif düzeltmesi
 * bağlı oturum varken kilitlidir.
 *
 * Testler `vite` ile yüklenir çünkü store `@/` takma adı ve JSON importu kullanır.
 * Her testte store bilinen bir duruma sıfırlanır.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type ViteDevServer } from "vite";

let server: ViteDevServer;
let S: any;
let SS: any;
let B: any;

const T0 = "2026-11-17";

/** İki katmanın (topics + daily) derin anlık görüntüsü — atomiklik kontrolü. */
function snap() {
  const s = S.useAppStore.getState();
  return JSON.stringify({ topics: s.topics, daily: s.daily });
}

/** Store'u temiz duruma getirir; hedef konu id'sini döner. */
function reset() {
  S.useAppStore.setState({
    topics: S.seedTopics(),
    archivedTopics: [],
    wrongs: [],
    tytExams: [],
    aytExams: [],
    daily: [],
    carry: [],
    analyzedWrongs: {},
    branchMockHistory: {},
    frozenPlan: {},
    frozenPlanFrom: "",
    backup: null,
    lastAiComment: null,
  });
  const t = S.useAppStore.getState().topics.find(
    (x: any) => x.exam === "TYT" && x.subject === "Matematik" && x.topic === "Temel Kavramlar",
  );
  return t.id as string;
}

function topicOf(id: string) {
  return S.useAppStore.getState().topics.find((t: any) => t.id === id);
}
function daily() {
  return S.useAppStore.getState().daily;
}
function st() {
  return S.useAppStore.getState();
}

/** Test için ham bir günlük satırı üretir (sınıflandırma testlerinde kullanılır). */
function rawRow(over: Record<string, unknown>) {
  return {
    id: "r", date: T0, subject: "Matematik", topic: "Temel Kavramlar", kind: "Soru çözümü",
    minutes: null, questions: 10, correct: 8, wrong: 2, note: "", ...over,
  };
}

before(async () => {
  server = await createServer({ server: { middlewareMode: true }, logLevel: "silent" });
  S = await server.ssrLoadModule("/src/lib/store.ts");
  SS = await server.ssrLoadModule("/src/lib/sessions.ts");
  B = await server.ssrLoadModule("/src/lib/backup.ts");
});

after(async () => {
  await server?.close();
});

describe("bağlı oturum — ekleme ve applied", () => {
  it("yeni oturum kümülatife gerçek deltayı ekler (tek atomik işlem)", () => {
    const id = reset();
    st().updateTopic(id, { total: 40, correct: 34, wrong: 6 });
    const before = snap();

    const ok = st().addSession({
      id: "s1", topicId: id, kind: "Soru çözümü",
      questions: 30, correct: 25, wrong: 5, date: T0,
    });
    assert.equal(ok, true);
    assert.equal(daily().length, 1);
    const t = topicOf(id);
    assert.equal(t.total, 70);
    assert.equal(t.correct, 59);
    assert.equal(t.wrong, 11);
    const row = daily()[0];
    assert.deepEqual(row.applied, { total: 30, correct: 25, wrong: 5 });
    assert.equal(row.topicId, id);
    assert.equal(row.origin, "session");
    assert.equal(row.subject, t.subject);
    assert.equal(row.topic, t.topic);
    assert.notEqual(snap(), before);
  });

  it("aynı ID ile ikinci gönderim reddedilir (idempotans)", () => {
    const id = reset();
    st().addSession({ id: "dup", topicId: id, kind: "Soru çözümü", questions: 10, correct: 8, wrong: 2 });
    const after = snap();
    const ok = st().addSession({ id: "dup", topicId: id, kind: "Soru çözümü", questions: 10, correct: 8, wrong: 2 });
    assert.equal(ok, false);
    assert.equal(snap(), after, "reddedilen işlem state'i değiştirmemeli");
    assert.equal(daily().length, 1);
  });

  it("hedef konu yoksa hiçbir yazma yapılmaz", () => {
    reset();
    const before = snap();
    const ok = st().addSession({ id: "x", topicId: "YOK|Yok|Yok|Yok", kind: "Soru çözümü", questions: 5, correct: 5, wrong: 0 });
    assert.equal(ok, false);
    assert.equal(snap(), before);
  });

  it("negatif/geçersiz sayı reddedilir; state değişmez", () => {
    const id = reset();
    const before = snap();
    assert.equal(st().addSession({ id: "n1", topicId: id, kind: "Soru çözümü", questions: -5, correct: 1, wrong: 0 }), false);
    assert.equal(st().addSession({ id: "n2", topicId: id, kind: "Soru çözümü", questions: 10, correct: -1, wrong: 0 }), false);
    assert.equal(snap(), before);
  });

  it("boş (null) ile sıfır (0) ayrı anlam taşır, ikisi de geçerli oturumdur", () => {
    const id = reset();
    assert.equal(st().addSession({ id: "b1", topicId: id, kind: "Konu anlatımı", questions: null, correct: null, wrong: null }), true);
    assert.equal(st().addSession({ id: "b2", topicId: id, kind: "Soru çözümü", questions: 0, correct: null, wrong: null }), true);
    const [b2, b1] = daily(); // en yeni başta
    assert.equal(b1.questions, null);
    assert.equal(b2.questions, 0);
    assert.deepEqual(b1.applied, { total: 0, correct: 0, wrong: 0 });
    assert.deepEqual(b2.applied, { total: 0, correct: 0, wrong: 0 });
    assert.equal(topicOf(id).total, null, "soru girilmeyen oturum kümülatifi değiştirmez");
  });

  it("dakika isteğe bağlıdır; girilmezse null kalır (tahmin yok)", () => {
    const id = reset();
    st().addSession({ id: "m1", topicId: id, kind: "Soru çözümü", questions: 10, correct: 8, wrong: 2 });
    assert.equal(daily()[0].minutes, null);
  });

  it("applied kırpılmış gerçek deltayı yazar (doğru+yanlış > soru)", () => {
    const id = reset();
    // 20 soru, 18 doğru, 5 yanlış → yanlış 2'ye kırpılır
    st().addSession({ id: "c1", topicId: id, kind: "Soru çözümü", questions: 20, correct: 18, wrong: 5 });
    const row = daily()[0];
    assert.deepEqual(row.applied, { total: 20, correct: 18, wrong: 2 });
    assert.deepEqual(row.wrong, 2);
  });
});

describe("bağlı oturum — düzenleme ve delta", () => {
  it("düzenleme yalnızca farkı uygular; taban+applied tutarlı", () => {
    const id = reset();
    st().updateTopic(id, { total: 40, correct: 34, wrong: 6 });
    st().addSession({ id: "s1", topicId: id, kind: "Soru çözümü", questions: 30, correct: 25, wrong: 5, date: T0 });
    assert.equal(topicOf(id).total, 70);

    const ok = st().updateSession("s1", { questions: 20, correct: 18, wrong: 2 });
    assert.equal(ok, true);
    const t = topicOf(id);
    assert.equal(t.total, 60);
    assert.equal(t.correct, 52);
    assert.equal(t.wrong, 8);
    assert.deepEqual(daily()[0].applied, { total: 20, correct: 18, wrong: 2 });
    assert.equal(daily()[0].questions, 20);
  });

  it("bağlı olmayan/olmayan kayıt düzenlenemez; state değişmez", () => {
    const id = reset();
    st().addDaily({ id: "legacy", subject: "Matematik", topic: "X", questions: 5, correct: 5, wrong: 0 });
    const before = snap();
    assert.equal(st().updateSession("legacy", { questions: 99 }), false);
    assert.equal(st().updateSession("yok", { questions: 99 }), false);
    assert.equal(snap(), before);
    void id;
  });

  it("negatif sonuç oluşturacak düzenleme reddedilir", () => {
    const id = reset();
    st().addSession({ id: "s1", topicId: id, kind: "Soru çözümü", questions: 10, correct: 8, wrong: 2 });
    const before = snap();
    // 10 → -5 gibi negatif giriş: doğrudan geçersiz
    assert.equal(st().updateSession("s1", { questions: -5 }), false);
    assert.equal(snap(), before);
  });

  it("tarih değişikliği lastStudy'yi yalnız ileri taşır", () => {
    const id = reset();
    st().addSession({ id: "s1", topicId: id, kind: "Soru çözümü", questions: 10, correct: 8, wrong: 2, date: "2026-11-20" });
    assert.equal(topicOf(id).lastStudy, "2026-11-20");
    st().updateSession("s1", { date: "2026-11-10" }); // geriye
    assert.equal(topicOf(id).lastStudy, "2026-11-20", "lastStudy geriye alınmaz");
    st().updateSession("s1", { date: "2026-11-25" }); // ileri
    assert.equal(topicOf(id).lastStudy, "2026-11-25");
  });
});

describe("bağlı oturum — silme ve geri dönüş", () => {
  it("silme applied katkısını çıkarır; serbest tabana döner", () => {
    const id = reset();
    st().updateTopic(id, { total: 40, correct: 34, wrong: 6 });
    st().addSession({ id: "s1", topicId: id, kind: "Soru çözümü", questions: 30, correct: 25, wrong: 5 });
    const ok = st().removeSession("s1");
    assert.equal(ok, true);
    const t = topicOf(id);
    assert.equal(t.total, 40);
    assert.equal(t.correct, 34);
    assert.equal(t.wrong, 6);
    assert.equal(daily().length, 0);
  });

  it("negatif sonuç oluşturacak silme reddedilir (sessiz kırpma yok)", () => {
    const id = reset();
    // Tutarsız ama bağlı-şekilli kayıt: applied 50, topic toplamı 10
    const t = topicOf(id);
    S.useAppStore.setState({
      topics: st().topics.map((x: any) => (x.id === id ? { ...x, total: 10, correct: 5, wrong: 5 } : x)),
      daily: [{
        id: "bad", date: T0, subject: t.subject, topic: t.topic, kind: "Soru çözümü",
        minutes: null, questions: 50, correct: 25, wrong: 25, note: "",
        topicId: id, origin: "session", applied: { total: 50, correct: 25, wrong: 25 },
      }],
    });
    const before = snap();
    assert.equal(st().removeSession("bad"), false);
    assert.equal(snap(), before);
    assert.equal(daily().length, 1, "kayıt silinmemeli");
  });

  it("bağımsız kayıt removeSession ile kümülatiften düşülmez", () => {
    const id = reset();
    st().updateTopic(id, { total: 40, correct: 34, wrong: 6 });
    st().addDaily({ id: "legacy", subject: "Matematik", topic: "Temel Kavramlar", questions: 30, correct: 25, wrong: 5 });
    const before = snap();
    assert.equal(st().removeSession("legacy"), false);
    assert.equal(snap(), before);
  });
});

describe("çoklu oturum — sıra bağımsızlığı", () => {
  it("üç oturum eklenir; ortadaki düzenlenip silinince diğerleri etkilenmez", () => {
    const id = reset();
    st().updateTopic(id, { total: 10, correct: 8, wrong: 2 });
    st().addSession({ id: "a", topicId: id, kind: "Soru çözümü", questions: 10, correct: 8, wrong: 2, date: "2026-11-15" });
    st().addSession({ id: "b", topicId: id, kind: "Soru çözümü", questions: 20, correct: 15, wrong: 5, date: "2026-11-16" });
    st().addSession({ id: "c", topicId: id, kind: "Soru çözümü", questions: 30, correct: 25, wrong: 5, date: "2026-11-17" });
    assert.equal(topicOf(id).total, 70);

    // ortadaki (b) düzenle: 20 → 12
    assert.equal(st().updateSession("b", { questions: 12, correct: 10, wrong: 2 }), true);
    assert.equal(topicOf(id).total, 62);
    // a ve c değişmedi
    assert.equal(daily().find((d: any) => d.id === "a").applied.total, 10);
    assert.equal(daily().find((d: any) => d.id === "c").applied.total, 30);

    // ortadaki (b) sil
    assert.equal(st().removeSession("b"), true);
    assert.equal(topicOf(id).total, 50);
    assert.equal(daily().length, 2);
  });

  it("silme sırası toplamı değiştirmez (ilk/son/ters)", () => {
    const id = reset();
    st().addSession({ id: "a", topicId: id, kind: "Soru çözümü", questions: 10, correct: 8, wrong: 2 });
    st().addSession({ id: "b", topicId: id, kind: "Soru çözümü", questions: 20, correct: 15, wrong: 5 });
    st().addSession({ id: "c", topicId: id, kind: "Soru çözümü", questions: 30, correct: 25, wrong: 5 });
    const total3 = topicOf(id).total;
    assert.equal(total3, 60);
    st().removeSession("c"); // son
    st().removeSession("a"); // ilk
    st().removeSession("b");
    // Tüm gerçek oturumlar silindiğinde kümülatif 0'a iner (eklenen sorular geri alındı).
    assert.equal(topicOf(id).total, 0);
    assert.equal(daily().length, 0);
  });
});

describe("kilit — elle kümülatif düzeltmesi", () => {
  it("bağlı oturum varken total/correct/wrong değişiklikleri reddedilir", () => {
    const id = reset();
    st().updateTopic(id, { total: 40, correct: 34, wrong: 6 });
    st().addSession({ id: "s1", topicId: id, kind: "Soru çözümü", questions: 30, correct: 25, wrong: 5 });
    const before = snap();
    st().updateTopic(id, { total: 999 });
    st().updateTopic(id, { correct: 1 });
    st().updateTopic(id, { wrong: 1 });
    assert.equal(snap(), before, "kilitli kümülatif değişmemeli");
    assert.equal(topicOf(id).total, 70);
  });

  it("kilitliyken diğer alanlar (status/source/note/lastStudy/reviewDate) serbesttir", () => {
    const id = reset();
    st().addSession({ id: "s1", topicId: id, kind: "Soru çözümü", questions: 10, correct: 8, wrong: 2 });
    st().updateTopic(id, { status: "Bitti", source: "MEB", note: "not", reviewDate: "2026-12-01" });
    const t = topicOf(id);
    assert.equal(t.status, "Bitti");
    assert.equal(t.source, "MEB");
    assert.equal(t.note, "not");
    assert.equal(t.reviewDate, "2026-12-01");
  });

  it("kimlik alanları her zaman reddedilir", () => {
    const id = reset();
    const before = topicOf(id);
    st().updateTopic(id, { subtopic: "DEĞİŞTİ", exam: "AYT", subject: "X", topic: "Y" } as any);
    const after = topicOf(id);
    assert.equal(after.subtopic, before.subtopic);
    assert.equal(after.exam, before.exam);
    assert.equal(after.subject, before.subject);
    assert.equal(after.topic, before.topic);
    assert.equal(after.id, id);
  });

  it("serbest konuda mevcut kümülatif düzenleme korunur", () => {
    const id = reset();
    st().updateTopic(id, { total: 40, correct: 34, wrong: 6 });
    assert.equal(topicOf(id).total, 40);
  });
});

describe("updateDaily beyaz liste", () => {
  it("bağlı satırda yalnız minutes ve note değişir", () => {
    const id = reset();
    st().addSession({ id: "s1", topicId: id, kind: "Soru çözümü", questions: 10, correct: 8, wrong: 2 });
    st().updateDaily("s1", { minutes: 45, note: "iyi geçti" });
    assert.equal(daily()[0].minutes, 45);
    assert.equal(daily()[0].note, "iyi geçti");

    const before = snap();
    st().updateDaily("s1", { questions: 999, correct: 999, wrong: 999, topic: "X", subject: "Y", date: "2030-01-01" });
    assert.equal(snap(), before, "soru/kimlik/tarih alanları reddedilmeli");
  });

  it("bağlı satır removeDaily ile de silinir ve kümülatif geri alınır (ortak politika)", () => {
    const id = reset();
    st().updateTopic(id, { total: 40, correct: 34, wrong: 6 });
    st().addSession({ id: "s1", topicId: id, kind: "Soru çözümü", questions: 10, correct: 8, wrong: 2 });
    assert.equal(topicOf(id).total, 50);
    st().removeDaily("s1");
    assert.equal(daily().length, 0);
    assert.equal(topicOf(id).total, 40, "removeDaily de applied katkısını geri almalı");
  });

  it("bağımsız satırın mevcut serbest davranışı korunur", () => {
    reset();
    st().addDaily({ id: "legacy", subject: "Matematik", topic: "X", questions: 5, correct: 5, wrong: 0 });
    st().updateDaily("legacy", { questions: 9, topic: "Y" });
    assert.equal(daily()[0].questions, 9);
    assert.equal(daily()[0].topic, "Y");
    st().removeDaily("legacy");
    assert.equal(daily().length, 0);
  });
});

describe("eksik/bozuk applied ve orphan", () => {
  it("origin var ama applied yok → bağlı sayılmaz, kümülatif dokunulmaz", () => {
    const id = reset();
    st().updateTopic(id, { total: 40, correct: 34, wrong: 6 });
    S.useAppStore.setState({
      daily: [{
        id: "half", date: T0, subject: "Matematik", topic: "Temel Kavramlar", kind: "Soru çözümü",
        minutes: null, questions: 10, correct: 8, wrong: 2, note: "", topicId: id, origin: "session",
        // applied YOK
      }],
    });
    assert.equal(SS.isBoundSession(st().daily[0], st().topics, st().archivedTopics), false);
    const before = snap();
    assert.equal(st().updateSession("half", { questions: 5 }), false);
    assert.equal(st().removeSession("half"), false);
    assert.equal(snap(), before);
  });

  it("applied oturum değerlerini aşıyorsa bağlı sayılmaz", () => {
    const id = reset();
    const row = {
      id: "over", date: T0, subject: "Matematik", topic: "Temel Kavramlar", kind: "Soru çözümü",
      minutes: null, questions: 10, correct: 8, wrong: 2, note: "", topicId: id, origin: "session",
      applied: { total: 30, correct: 8, wrong: 2 }, // total > questions
    };
    assert.equal(SS.isBoundSession(row, st().topics, st().archivedTopics), false);
  });

  it("orphan: hedef konu yok → onaysız silme reddedilir, onaylı silme kümülatife dokunmaz", () => {
    const id = reset();
    st().updateTopic(id, { total: 40, correct: 34, wrong: 6 });
    const orphan = {
      id: "orph", date: T0, subject: "Matematik", topic: "Temel Kavramlar", kind: "Soru çözümü",
      minutes: null, questions: 10, correct: 8, wrong: 2, note: "", topicId: "SİLİNMİŞ|Ders|Konu|Alt",
      origin: "session", applied: { total: 10, correct: 8, wrong: 2 },
    };
    S.useAppStore.setState({ daily: [orphan] });
    assert.equal(SS.isOrphanSession(st().daily[0], st().topics, st().archivedTopics), true);
    assert.equal(SS.isBoundSession(st().daily[0], st().topics, st().archivedTopics), false);

    const topicsBefore = JSON.stringify(st().topics);
    assert.equal(st().removeSession("orph"), false, "onaysız reddedilmeli");
    assert.equal(daily().length, 1);
    assert.equal(st().removeSession("orph", { confirmOrphan: true }), true);
    assert.equal(daily().length, 0);
    assert.equal(JSON.stringify(st().topics), topicsBefore, "orphan silme kümülatife dokunmamalı");
  });
});

describe("orphan politikası — removeDaily ve updateDaily (ortak koruma)", () => {
  const ORPHAN = {
    id: "orph", date: T0, subject: "Matematik", topic: "Temel Kavramlar", kind: "Soru çözümü",
    minutes: null, questions: 10, correct: 8, wrong: 2, note: "", topicId: "SİLİNMİŞ|Ders|Konu|Alt",
    origin: "session", applied: { total: 10, correct: 8, wrong: 2 },
  };
  function seedOrphan() {
    const id = reset();
    st().updateTopic(id, { total: 40, correct: 34, wrong: 6 });
    S.useAppStore.setState({ daily: [ORPHAN] });
    return id;
  }

  it("removeDaily orphan'ı onaysız SİLMEZ", () => {
    seedOrphan();
    const before = snap();
    st().removeDaily("orph");
    assert.equal(snap(), before, "onaysız orphan silme state'i değiştirmemeli");
    assert.equal(daily().length, 1);
  });

  it("removeDaily orphan'ı onayla siler, kümülatife dokunmaz", () => {
    seedOrphan();
    const topicsBefore = JSON.stringify(st().topics);
    st().removeDaily("orph", { confirm: true });
    assert.equal(daily().length, 0);
    assert.equal(JSON.stringify(st().topics), topicsBefore);
  });

  it("updateDaily orphan'da yalnız minutes/note değiştirir; sayı ve kimlik reddedilir", () => {
    seedOrphan();
    st().updateDaily("orph", { minutes: 30, note: "not" });
    assert.equal(daily()[0].minutes, 30);
    assert.equal(daily()[0].note, "not");
    const before = snap();
    st().updateDaily("orph", {
      questions: 99, correct: 99, wrong: 99, topic: "X", subject: "Y", topicId: "Z", origin: "session",
      applied: { total: 1, correct: 1, wrong: 0 }, date: "2030-01-01",
    });
    assert.equal(snap(), before, "orphan'da soru/kimlik/bağlantı alanları reddedilmeli");
  });

  it("updateSession ve removeSession orphan'ı reddeder (onaysız)", () => {
    seedOrphan();
    const before = snap();
    assert.equal(st().updateSession("orph", { questions: 5 }), false);
    assert.equal(st().removeSession("orph"), false);
    assert.equal(snap(), before);
  });
});

describe("malformed oturum kayıtları — korumalı sınıf", () => {
  /** Bağlantı alanı taşıyan bozuk kayıt kurar; hedef konu id'sini döner. */
  function seedMalformed(row: Record<string, unknown>) {
    const id = reset();
    st().updateTopic(id, { total: 40, correct: 34, wrong: 6 });
    S.useAppStore.setState({ daily: [rawRow({ topicId: id, ...row })] });
    return id;
  }

  it("origin var ama applied yok → malformed; kümülatife katkı yok", () => {
    const id = seedMalformed({ id: "m", origin: "session" });
    assert.equal(SS.classifyDaily(st().daily[0], st().topics, st().archivedTopics), "malformed");
    const before = snap();
    st().updateTopic(id, { total: 999 }); // malformed kilit oluşturmaz
    assert.equal(topicOf(id).total, 999, "malformed kayıt kümülatifi kilitlememeli");
    assert.notEqual(snap(), before);
  });

  it("topicId var ama origin/applied yok → malformed", () => {
    seedMalformed({ id: "m2" });
    assert.equal(SS.classifyDaily(st().daily[0], st().topics, st().archivedTopics), "malformed");
  });

  it("applied tutarsız (correct+wrong>total) → malformed", () => {
    seedMalformed({ id: "m3", origin: "session", applied: { total: 5, correct: 4, wrong: 4 } });
    assert.equal(SS.classifyDaily(st().daily[0], st().topics, st().archivedTopics), "malformed");
  });

  it("negatif applied → malformed", () => {
    seedMalformed({ id: "m4", origin: "session", applied: { total: 10, correct: -1, wrong: 2 } });
    assert.equal(SS.classifyDaily(st().daily[0], st().topics, st().archivedTopics), "malformed");
  });

  it("ondalık applied → malformed", () => {
    seedMalformed({ id: "m5", origin: "session", applied: { total: 10.5, correct: 8, wrong: 2 } });
    assert.equal(SS.classifyDaily(st().daily[0], st().topics, st().archivedTopics), "malformed");
  });

  it("applied oturum değerini aşıyor → malformed", () => {
    seedMalformed({ id: "m6", origin: "session", questions: 10, correct: 8, wrong: 2, applied: { total: 20, correct: 8, wrong: 2 } });
    assert.equal(SS.classifyDaily(st().daily[0], st().topics, st().archivedTopics), "malformed");
  });

  it("malformed: soru/kimlik düzenlenemez; minutes/note serbest", () => {
    seedMalformed({ id: "m7", origin: "session" });
    st().updateDaily("m7", { minutes: 20, note: "ok" });
    assert.equal(daily()[0].minutes, 20);
    assert.equal(daily()[0].note, "ok");
    const before = snap();
    st().updateDaily("m7", { questions: 99, correct: 99, topic: "X", topicId: "Y", origin: "session" });
    assert.equal(snap(), before);
  });

  it("malformed: removeDaily onaysız reddeder, onayla kümülatife dokunmadan siler", () => {
    seedMalformed({ id: "m8", origin: "session" });
    const topicsBefore = JSON.stringify(st().topics);
    const before = snap();
    st().removeDaily("m8");
    assert.equal(snap(), before);
    st().removeDaily("m8", { confirm: true });
    assert.equal(daily().length, 0);
    assert.equal(JSON.stringify(st().topics), topicsBefore);
  });

  it("malformed: updateSession/removeSession reddeder (onaylı silme kümülatife dokunmaz)", () => {
    seedMalformed({ id: "m9", origin: "session" });
    assert.equal(st().updateSession("m9", { questions: 5 }), false);
    assert.equal(st().removeSession("m9"), false);
    assert.equal(daily().length, 1);
    const topicsBefore = JSON.stringify(st().topics);
    assert.equal(st().removeSession("m9", { confirmOrphan: true }), true);
    assert.equal(daily().length, 0);
    assert.equal(JSON.stringify(st().topics), topicsBefore);
  });

  it("gerçek bağımsız kayıt (bağlantı alanı yok) → independent, serbest davranış", () => {
    reset();
    st().addDaily({ id: "legacy", subject: "Matematik", topic: "X", questions: 5, correct: 5, wrong: 0 });
    assert.equal(SS.classifyDaily(st().daily[0], st().topics, st().archivedTopics), "independent");
    st().updateDaily("legacy", { questions: 9, topic: "Y" });
    assert.equal(daily()[0].questions, 9);
    st().removeDaily("legacy");
    assert.equal(daily().length, 0);
  });

  it("yalnız applied taşıyan (bağlantısız) kayıt independent sayılır", () => {
    reset();
    st().addDaily({ id: "only-applied", subject: "Matematik", topic: "X", questions: 5, correct: 5, wrong: 0 });
    S.useAppStore.setState({ daily: [{ ...daily()[0], applied: { total: 5, correct: 5, wrong: 0 } }] });
    assert.equal(SS.classifyDaily(st().daily[0], st().topics, st().archivedTopics), "independent");
  });
});

describe("arşivlenmiş konuya bağlı oturum — çıkmaz giderildi", () => {
  /** topics + archivedTopics + daily derin anlık görüntüsü (atomiklik). */
  function snapArch() {
    const s = st();
    return JSON.stringify({ topics: s.topics, archivedTopics: s.archivedTopics, daily: s.daily });
  }

  /** Canlı konuyu arşive taşır; arşiv kümülatifini ayarlar; hedef id döner. */
  function seedArchived(arch?: { total?: number; correct?: number; wrong?: number }) {
    reset();
    const live = st().topics.find((t: any) => t.subject === "Matematik" && t.topic === "Temel Kavramlar");
    S.useAppStore.setState({
      topics: st().topics.filter((t: any) => t.id !== live.id),
      archivedTopics: [{ ...live, total: 40, correct: 34, wrong: 6, ...arch }],
      daily: [],
    });
    return live.id as string;
  }
  function archTopic(id: string) {
    return st().archivedTopics.find((t: any) => t.id === id);
  }

  it("sınıflandırma: arşiv hedefi bağlı sayılır; kilit kurar; addSession canlı konu ister", () => {
    const id = seedArchived();
    // Arşivde konu var ama `topics`'te yok: addSession canlı konu ister → eklenemez.
    assert.equal(st().addSession({ id: "a1", topicId: id, kind: "Soru çözümü", questions: 10, correct: 8, wrong: 2 }), false);
    S.useAppStore.setState({ daily: [rawRow({ id: "a2", origin: "session", topicId: id, applied: { total: 10, correct: 8, wrong: 2 } })] });
    assert.equal(SS.classifyDaily(daily()[0], st().topics, st().archivedTopics), "bound");
    assert.equal(SS.topicLocked(id, st().daily, st().topics, st().archivedTopics), true);
  });

  it("1) onaysız silme reddedilir; state birebir korunur", () => {
    const id = seedArchived();
    S.useAppStore.setState({ daily: [rawRow({ id: "a2", origin: "session", topicId: id, applied: { total: 10, correct: 8, wrong: 2 } })] });
    const before = snapArch();
    assert.equal(st().removeSession("a2"), false, "removeSession onaysız reddetmeli");
    st().removeDaily("a2");
    assert.equal(daily().length, 1);
    assert.equal(snapArch(), before);
  });

  it("2) onaylı silme: yalnız arşiv hedefinin applied katkısı çıkar", () => {
    const id = seedArchived(); // arşiv 40/34/6
    S.useAppStore.setState({ daily: [rawRow({ id: "a2", origin: "session", topicId: id, applied: { total: 10, correct: 8, wrong: 2 } })] });
    const topicsBefore = JSON.stringify(st().topics);
    st().removeDaily("a2", { confirm: true });
    assert.equal(daily().length, 0);
    const a = archTopic(id);
    assert.equal(a.total, 30);
    assert.equal(a.correct, 26);
    assert.equal(a.wrong, 4);
    assert.equal(JSON.stringify(st().topics), topicsBefore, "canlı topics dokunulmamalı");
  });

  it("3) negatif sonuç oluşturacak silme reddedilir; state birebir aynı", () => {
    const id = seedArchived({ total: 5, correct: 4, wrong: 1 });
    S.useAppStore.setState({ daily: [rawRow({ id: "b2", origin: "session", topicId: id, applied: { total: 10, correct: 8, wrong: 2 } })] });
    const before = snapArch();
    assert.equal(st().removeSession("b2"), false);
    st().removeDaily("b2", { confirm: true });
    assert.equal(daily().length, 1);
    assert.equal(snapArch(), before);
  });

  it("4) arşiv hedefinde unlockTopic onaysız çözmez", () => {
    const id = seedArchived();
    S.useAppStore.setState({ daily: [rawRow({ id: "c2", origin: "session", topicId: id, applied: { total: 10, correct: 8, wrong: 2 } })] });
    const before = snapArch();
    assert.equal(st().unlockTopic(id), false);
    assert.equal(st().unlockTopic(id, { confirm: false }), false);
    assert.equal(snapArch(), before);
  });

  it("5) onaylı kilit çözme: bağ alanları temizlenir; applied ve kümülatifler korunur", () => {
    const id = seedArchived();
    S.useAppStore.setState({ daily: [rawRow({ id: "c2", origin: "session", topicId: id, applied: { total: 10, correct: 8, wrong: 2 } })] });
    const archBefore = JSON.stringify(st().archivedTopics);
    const topicsBefore = JSON.stringify(st().topics);
    const appliedBefore = JSON.stringify(daily()[0].applied);
    assert.equal(st().unlockTopic(id, { confirm: true }), true);
    const row = daily()[0];
    assert.equal(row.origin, undefined);
    assert.equal(row.topicId, undefined);
    assert.equal(JSON.stringify(row.applied), appliedBefore, "applied korunmalı");
    assert.equal(JSON.stringify(st().archivedTopics), archBefore, "arşiv kümülatifi değişmemeli");
    assert.equal(JSON.stringify(st().topics), topicsBefore, "canlı topics değişmemeli");
  });

  it("6) kilit çözme sonrası kayıt bağımsız davranır", () => {
    const id = seedArchived();
    S.useAppStore.setState({ daily: [rawRow({ id: "c2", origin: "session", topicId: id, applied: { total: 10, correct: 8, wrong: 2 } })] });
    st().unlockTopic(id, { confirm: true });
    assert.equal(SS.classifyDaily(daily()[0], st().topics, st().archivedTopics), "independent");
    st().updateDaily("c2", { questions: 99 });
    assert.equal(daily()[0].questions, 99);
    st().removeDaily("c2");
    assert.equal(daily().length, 0);
  });

  it("7) aynı arşiv konuya birden çok oturum: her biri kendi applied'ını çıkarır", () => {
    const id = seedArchived(); // 40/34/6
    S.useAppStore.setState({
      daily: [
        rawRow({ id: "s1", origin: "session", topicId: id, applied: { total: 10, correct: 8, wrong: 2 } }),
        rawRow({ id: "s2", origin: "session", topicId: id, applied: { total: 6, correct: 5, wrong: 1 } }),
      ],
    });
    st().removeDaily("s1", { confirm: true });
    assert.equal(archTopic(id).total, 30);
    assert.equal(daily().length, 1);
    st().removeDaily("s2", { confirm: true });
    assert.equal(archTopic(id).total, 24);
    assert.equal(archTopic(id).correct, 21);
    assert.equal(archTopic(id).wrong, 3);
    assert.equal(daily().length, 0);
  });

  it("8) başarısız işlem atomik; başarılı işlem yalnız kendi satırını etkiler", () => {
    const id = seedArchived({ total: 5, correct: 4, wrong: 1 });
    S.useAppStore.setState({
      daily: [
        rawRow({ id: "good", origin: "session", topicId: id, questions: 3, correct: 3, wrong: 0, applied: { total: 3, correct: 3, wrong: 0 } }),
        rawRow({ id: "bad", origin: "session", topicId: id, questions: 10, correct: 8, wrong: 2, applied: { total: 10, correct: 8, wrong: 2 } }),
      ],
    });
    // Reddedilen işlem: `bad` negatife düşürür → state birebir aynı.
    const before = snapArch();
    assert.equal(st().removeSession("bad"), false);
    st().removeDaily("bad", { confirm: true });
    assert.equal(snapArch(), before);
    // Başarılı işlem: yalnız `good` ve arşiv hedefi etkilenir; `bad` aynen kalır.
    const badBefore = JSON.stringify(daily().find((d: any) => d.id === "bad"));
    st().removeDaily("good", { confirm: true });
    assert.equal(JSON.stringify(daily().find((d: any) => d.id === "bad")), badBefore);
    assert.equal(archTopic(id).total, 2);
    assert.equal(archTopic(id).correct, 1);
    assert.equal(archTopic(id).wrong, 1);
  });
});

describe("unlockTopic — kalıcı bağ çözme", () => {
  it("onaysız çözmez", () => {
    const id = reset();
    st().updateTopic(id, { total: 40, correct: 34, wrong: 6 });
    st().addSession({ id: "s1", topicId: id, kind: "Soru çözümü", questions: 30, correct: 25, wrong: 5 });
    const before = snap();
    assert.equal(st().unlockTopic(id), false);
    assert.equal(st().unlockTopic(id, { confirm: false }), false);
    assert.equal(snap(), before);
  });

  it("onayla çözer: origin/topicId temizlenir, applied ve kümülatif korunur", () => {
    const id = reset();
    st().updateTopic(id, { total: 40, correct: 34, wrong: 6 });
    st().addSession({ id: "s1", topicId: id, kind: "Soru çözümü", questions: 30, correct: 25, wrong: 5 });
    const topicBefore = JSON.stringify(topicOf(id));
    const appliedBefore = JSON.stringify(daily()[0].applied);
    const noteBefore = daily()[0].note;

    assert.equal(st().unlockTopic(id, { confirm: true }), true);
    const row = daily()[0];
    assert.equal(row.origin, undefined);
    assert.equal(row.topicId, undefined);
    assert.equal(JSON.stringify(row.applied), appliedBefore, "applied korunmalı");
    assert.equal(row.note, noteBefore, "not değişmemeli");
    assert.equal(JSON.stringify(topicOf(id)), topicBefore, "kümülatif değişmemeli");
  });

  it("çözülen kayıt artık bağımsız: serbest düzenlenir ve onaysız silinir", () => {
    const id = reset();
    st().addSession({ id: "s1", topicId: id, kind: "Soru çözümü", questions: 10, correct: 8, wrong: 2 });
    st().unlockTopic(id, { confirm: true });
    assert.equal(SS.classifyDaily(daily()[0], st().topics, st().archivedTopics), "independent");
    st().updateDaily("s1", { questions: 99 });
    assert.equal(daily()[0].questions, 99);
    st().removeDaily("s1");
    assert.equal(daily().length, 0);
  });

  it("bağlı oturum yoksa çözmez", () => {
    const id = reset();
    st().updateTopic(id, { total: 10 });
    assert.equal(st().unlockTopic(id, { confirm: true }), false);
  });

  it("orphan/malformed kayıtlar unlockTopic ile çözülemez", () => {
    reset();
    S.useAppStore.setState({
      daily: [
        rawRow({ id: "o", origin: "session", topicId: "YOK|D|K|A", applied: { total: 10, correct: 8, wrong: 2 } }),
        rawRow({ id: "m", origin: "session" }), // malformed: topicId/applied yok
      ],
    });
    const before = snap();
    assert.equal(st().unlockTopic("YOK|D|K|A", { confirm: true }), false);
    assert.equal(snap(), before, "orphan çözülemez");
  });
});

describe("lastStudy ve eski kayıtların korunması", () => {
  it("lastStudy ekleme ile ileri taşınır; silmede geri alınmaz", () => {
    const id = reset();
    st().updateTopic(id, { lastStudy: "2026-11-01" });
    st().addSession({ id: "s1", topicId: id, kind: "Soru çözümü", questions: 10, correct: 8, wrong: 2, date: "2026-11-15" });
    assert.equal(topicOf(id).lastStudy, "2026-11-15");
    st().removeSession("s1");
    assert.equal(topicOf(id).lastStudy, "2026-11-15", "silmede geri alınmaz");
  });

  it("eski bağımsız kayıtlar addSession sonrası değişmeden kalır", () => {
    const id = reset();
    st().addDaily({ id: "legacy", date: "2026-10-01", subject: "Fizik", topic: "Vektörler", kind: "Soru çözümü", minutes: 60, questions: 20, correct: 15, wrong: 5, note: "eski" });
    const legacyBefore = JSON.stringify(daily().find((d: any) => d.id === "legacy"));
    st().addSession({ id: "s1", topicId: id, kind: "Soru çözümü", questions: 10, correct: 8, wrong: 2 });
    assert.equal(JSON.stringify(daily().find((d: any) => d.id === "legacy")), legacyBefore);
    assert.equal(SS.isBoundSession(daily().find((d: any) => d.id === "legacy"), st().topics, st().archivedTopics), false);
  });
});

describe("atomiklik — reddedilen işlemler", () => {
  it("her reddedilen işlem topics+daily'yi birebir korur", () => {
    const id = reset();
    st().updateTopic(id, { total: 40, correct: 34, wrong: 6 });
    st().addSession({ id: "s1", topicId: id, kind: "Soru çözümü", questions: 30, correct: 25, wrong: 5 });
    // Tutarsız bağlı kayıt: `applied` konu toplamından büyük → silme negatife düşer, reddedilir.
    S.useAppStore.setState({
      daily: [
        ...st().daily,
        {
          id: "neg", date: T0, subject: "Matematik", topic: "Temel Kavramlar", kind: "Soru çözümü",
          minutes: null, questions: 500, correct: 400, wrong: 100, note: "", topicId: id,
          origin: "session", applied: { total: 500, correct: 400, wrong: 100 },
        },
      ],
    });

    const before = snap();
    const rejected: [string, () => boolean | void][] = [
      ["dup add", () => st().addSession({ id: "s1", topicId: id, kind: "Soru çözümü", questions: 1, correct: 1, wrong: 0 })],
      ["bad topic", () => st().addSession({ id: "z", topicId: "YOK", kind: "Soru çözümü", questions: 1, correct: 1, wrong: 0 })],
      ["negative", () => st().addSession({ id: "z2", topicId: id, kind: "Soru çözümü", questions: -1, correct: 0, wrong: 0 })],
      ["locked topic", () => st().updateTopic(id, { total: 1 })],
      ["identity", () => st().updateTopic(id, { subtopic: "X" } as any)],
      ["daily soru", () => st().updateDaily("s1", { questions: 5 })],
      ["removeSession bound negative", () => st().removeSession("neg")],
      ["updateSession missing", () => st().updateSession("yok", { questions: 5 })],
      ["unlockTopic no confirm", () => st().unlockTopic(id)],
    ];
    for (const [name, fn] of rejected) {
      fn();
      assert.equal(snap(), before, `reddedilen işlem state'i değiştirdi: ${name}`);
    }
  });
});

describe("yedek uyumluluğu", () => {
  it("bağlı oturum alanları yedek round-trip'inde korunur", () => {
    const id = reset();
    st().addSession({ id: "s1", topicId: id, kind: "Soru çözümü", questions: 10, correct: 8, wrong: 2 });
    const s = st();
    const raw = B.serializeBackup({
      topics: s.topics, archivedTopics: s.archivedTopics, wrongs: s.wrongs,
      tytExams: s.tytExams, aytExams: s.aytExams, daily: s.daily, settings: s.settings,
      carry: s.carry, analyzedWrongs: s.analyzedWrongs, branchMockHistory: s.branchMockHistory,
    });
    const parsed = B.parseBackup(raw);
    assert.equal(parsed.ok, true);
    const row = parsed.data.daily[0];
    assert.equal(row.topicId, id);
    assert.equal(row.origin, "session");
    assert.deepEqual(row.applied, { total: 10, correct: 8, wrong: 2 });
  });

  it("eski (alanlar yok) yedek sorunsuz okunur ve kayıtlar bağımsız kalır", () => {
    const raw = JSON.stringify({
      format: "netdefter-yks-backup", version: 1, exportedAt: "2026-01-01T00:00:00Z", app: "NetDefter",
      data: {
        topics: [{ id: "TYT|Matematik|Temel Kavramlar|Alt", exam: "TYT", subject: "Matematik", topic: "Temel Kavramlar", subtopic: "Alt", status: "Bitti", total: 10, correct: 8, wrong: 2, lastStudy: "", reviewDate: "", source: "", note: "" }],
        daily: [{ id: "old", date: "2026-01-01", subject: "Matematik", topic: "Temel Kavramlar", kind: "Soru çözümü", minutes: 30, questions: 10, correct: 8, wrong: 2, note: "" }],
      },
    });
    const parsed = B.parseBackup(raw);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.data.daily[0].topicId, undefined);
    assert.equal(parsed.data.daily[0].origin, undefined);
  });
});
