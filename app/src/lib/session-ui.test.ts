/**
 * 1.5.4-B UI davranış testleri.
 *
 * Sınanan katmanlar:
 *  1. `sessionInputFromForm` saf eşleyicisi — form → `addSession` girdisi dönüşümü,
 *     "boş ≠ 0", dakika tahmini yok, not/id korunumu.
 *  2. `UNLOCK_WARNING` onay metni sözleşmesi (kilit çözme UX'i).
 *  3. "Çalışma ekle" akışının store semantiği (gerçek store): idempotans, kümülatif
 *     ekleme, boş oturum geçerliliği.
 *  4. `gunluk` sınıflandırmasına göre satır davranışı (gerçek store): bağlı/orphan/
 *     malformed salt-okunurluk ve silme yolları; bağımsız davranışın korunması.
 *
 * NOT: React bileşenleri bu ortamda render EDİLMEDİ. `vite.ssrLoadModule("react")`
 * "module is not defined" hatası veriyor (ortam sınırı) ve Playwright Chromium
 * ikilisi kurulu değil; ayrıca port 12000'e dokunmak yasak. Bu yüzden bileşenlerin
 * sözleşmesi (metinler, dönüşümler, store çağrıları) saf ve store düzeyinde
 * doğrulanır. Gerçek tarayıcı akışı DOĞRULANAMADI.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type ViteDevServer } from "vite";

let server: ViteDevServer;
let S: any;
let SS: any;

function st() {
  return S.useAppStore.getState();
}

before(async () => {
  server = await createServer({ server: { middlewareMode: true }, logLevel: "silent" });
  S = await server.ssrLoadModule("/src/lib/store.ts");
  SS = await server.ssrLoadModule("/src/lib/sessions.ts");
});

after(async () => {
  await server?.close();
});

const base = { kind: "Soru çözümü" as const, questions: null, correct: null, wrong: null, minutes: null, note: "", date: "2026-11-17" };

describe("sessionInputFromForm — saf eşleyici", () => {
  it("boş (null) alanlar null kalır; 0 ayrı korunur", () => {
    const empty = SS.sessionInputFromForm("id1", "T", base);
    assert.equal(empty.questions, null);
    assert.equal(empty.correct, null);
    assert.equal(empty.wrong, null);
    assert.equal(empty.minutes, null);

    const zero = SS.sessionInputFromForm("id1", "T", { ...base, questions: 0, correct: 0 });
    assert.equal(zero.questions, 0);
    assert.equal(zero.correct, 0);
  });

  it("dakika girilmezse null; tahmin/varsayılan üretilmez", () => {
    const out = SS.sessionInputFromForm("id1", "T", { ...base, questions: 10, correct: 8, wrong: 2 });
    assert.equal(out.minutes, null);
  });

  it("id ve topicId aynen geçer; not boşsa '' olur, doluysa korunur", () => {
    const out = SS.sessionInputFromForm("FORM-7", "TYT|Matematik|Temel Kavramlar|Alt", { ...base, note: "  " });
    assert.equal(out.id, "FORM-7");
    assert.equal(out.topicId, "TYT|Matematik|Temel Kavramlar|Alt");
    assert.equal(out.note, "");
    assert.equal(SS.sessionInputFromForm("FORM-7", "T", { ...base, note: "iyi geçti" }).note, "iyi geçti");
  });

  it("tür, soru/doğru/yanlış, dakika ve tarih aktarılır", () => {
    const out = SS.sessionInputFromForm("id", "T", { kind: "Tekrar", questions: 20, correct: 18, wrong: 2, minutes: 45, note: "", date: "2026-11-20" });
    assert.equal(out.kind, "Tekrar");
    assert.equal(out.questions, 20);
    assert.equal(out.correct, 18);
    assert.equal(out.wrong, 2);
    assert.equal(out.minutes, 45);
    assert.equal(out.date, "2026-11-20");
  });
});

describe("UNLOCK_WARNING — kilit çözme onay metni sözleşmesi", () => {
  it("bağın kalıcı kaldırıldığını, kümülatifin korunduğunu ve geri alınamazlığı taşır", () => {
    const w = SS.UNLOCK_WARNING;
    assert.ok(w.includes("kalıcı olarak kaldırır"));
    assert.ok(w.includes("kümülatif konu değerleri korunur"));
    assert.ok(w.includes("bağımsız günlük kaydı"));
    assert.ok(w.includes("geri alınamaz"));
  });
});

describe("Çalışma ekle akışı — store semantiği", () => {
  function reset() {
    S.useAppStore.setState({ topics: S.seedTopics(), archivedTopics: [], daily: [], wrongs: [] });
    return st().topics.find((t: any) => t.exam === "TYT" && t.subject === "Matematik" && t.topic === "Temel Kavramlar").id as string;
  }

  it("form eşleyicisiyle üretilen girdi kümülatifi doğru artırır", () => {
    const id = reset();
    st().updateTopic(id, { total: 40, correct: 34, wrong: 6 });
    const input = SS.sessionInputFromForm("UI-1", id, { kind: "Soru çözümü", questions: 30, correct: 25, wrong: 5, minutes: null, note: "", date: "2026-11-17" });
    assert.equal(st().addSession(input), true);
    const t = st().topics.find((x: any) => x.id === id);
    assert.equal(t.total, 70);
    assert.equal(t.correct, 59);
    assert.equal(t.wrong, 11);
    assert.equal(st().daily[0].minutes, null, "dakika tahmin edilmemeli");
  });

  it("aynı form id'si ile ikinci gönderim çift kayıt oluşturmaz (idempotans)", () => {
    const id = reset();
    const input = SS.sessionInputFromForm("UI-2", id, { kind: "Soru çözümü", questions: 10, correct: 8, wrong: 2, minutes: 30, note: "", date: "2026-11-17" });
    assert.equal(st().addSession(input), true);
    assert.equal(st().addSession(input), false);
    assert.equal(st().daily.length, 1);
    const t = st().topics.find((x: any) => x.id === id);
    assert.equal(t.total, 10, "kümülatif ikinci kez artmamalı");
  });

  it("boş soru alanlı 'Konu anlatımı' oturumu geçerlidir; kümülatifi değiştirmez", () => {
    const id = reset();
    const input = SS.sessionInputFromForm("UI-3", id, { kind: "Konu anlatımı", questions: null, correct: null, wrong: null, minutes: 40, note: "özet", date: "2026-11-17" });
    assert.equal(st().addSession(input), true);
    const t = st().topics.find((x: any) => x.id === id);
    assert.equal(t.total, null);
    assert.equal(st().daily[0].minutes, 40);
    assert.deepEqual(st().daily[0].applied, { total: 0, correct: 0, wrong: 0 });
  });

  it("başarısız gönderim (negatif) state'i değiştirmez", () => {
    const id = reset();
    const before = JSON.stringify({ d: st().daily, t: st().topics });
    const input = SS.sessionInputFromForm("UI-4", id, { kind: "Soru çözümü", questions: -5, correct: 1, wrong: 0, minutes: null, note: "", date: "2026-11-17" });
    assert.equal(st().addSession(input), false);
    assert.equal(JSON.stringify({ d: st().daily, t: st().topics }), before);
  });
});

describe("gunluk — sınıflandırmaya göre satır davranışı (gerçek store)", () => {
  function reset() {
    S.useAppStore.setState({ topics: S.seedTopics(), archivedTopics: [], daily: [], wrongs: [] });
    return st().topics.find((t: any) => t.exam === "TYT" && t.subject === "Matematik" && t.topic === "Temel Kavramlar").id as string;
  }

  it("bağlı satır: soru alanı updateDaily ile değişmez, silme kümülatifi geri alır", () => {
    const id = reset();
    st().updateTopic(id, { total: 40, correct: 34, wrong: 6 });
    st().addSession({ id: "s1", topicId: id, kind: "Soru çözümü", questions: 10, correct: 8, wrong: 2 });
    assert.equal(SS.classifyDaily(st().daily[0], st().topics, st().archivedTopics), "bound");
    const before = JSON.stringify(st().daily);
    st().updateDaily("s1", { questions: 99, date: "2030-01-01" });
    assert.equal(JSON.stringify(st().daily), before, "bağlı satırda soru/tarih değişmemeli");
    st().removeSession("s1");
    assert.equal(st().daily.length, 0);
    assert.equal(st().topics.find((t: any) => t.id === id).total, 40);
  });

  it("orphan satır: silme onay ister; onayla yalnız satır gider", () => {
    const id = reset();
    st().updateTopic(id, { total: 40, correct: 34, wrong: 6 });
    S.useAppStore.setState({
      daily: [{ id: "o", date: "2026-11-17", subject: "Matematik", topic: "Temel Kavramlar", kind: "Soru çözümü", minutes: null, questions: 10, correct: 8, wrong: 2, note: "", topicId: "YOK|D|K|A", origin: "session", applied: { total: 10, correct: 8, wrong: 2 } }],
    });
    assert.equal(SS.classifyDaily(st().daily[0], st().topics, st().archivedTopics), "orphan");
    const topicsBefore = JSON.stringify(st().topics);
    st().removeDaily("o"); // onaysız → gitmez
    assert.equal(st().daily.length, 1);
    st().removeDaily("o", { confirm: true });
    assert.equal(st().daily.length, 0);
    assert.equal(JSON.stringify(st().topics), topicsBefore);
  });

  it("bağımsız satır: serbest davranış korunur", () => {
    reset();
    st().addDaily({ id: "legacy", subject: "Matematik", topic: "X", questions: 5, correct: 5, wrong: 0 });
    assert.equal(SS.classifyDaily(st().daily[0], st().topics, st().archivedTopics), "independent");
    st().updateDaily("legacy", { questions: 9 });
    assert.equal(st().daily[0].questions, 9);
    st().removeDaily("legacy");
    assert.equal(st().daily.length, 0);
  });
});
