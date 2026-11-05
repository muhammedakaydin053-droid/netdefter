/**
 * Doğrulama ve değerlendirme düzeltmelerinin regresyon testleri.
 *
 * Saf modüller (`calc`, `progress`) `node --test` ile doğrudan yüklenir;
 * `@/` takma adı kullanan modüller (`stats`, `engine`, `roadmap`) `vite`
 * üzerinden yüklenir. Bu dosya ikisini birlikte çalıştırır.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type ViteDevServer } from "vite";
import {
  blankOf,
  countsIssue,
  netOf,
  pctOf,
  sanitizeCounts,
  clampTopicPatch,
} from "../calc.ts";
import { learningStage, explainStage } from "./progress.ts";

let server: ViteDevServer;
let S: any, E: any, R: any;

before(async () => {
  server = await createServer({ server: { middlewareMode: true }, logLevel: "silent" });
  S = await server.ssrLoadModule("/src/lib/stats.ts");
  E = await server.ssrLoadModule("/src/lib/smart/engine.ts");
  R = await server.ssrLoadModule("/src/data/roadmap.ts");
});
after(async () => { await server?.close(); });

const row = (o: any = {}) => ({
  id: "x", exam: "TYT", subject: "Matematik", topic: "T", subtopic: "S",
  status: "Çalışıyorum", total: null, correct: null, wrong: null,
  lastStudy: "", reviewDate: "", source: "", note: "", ...o,
});

describe("calc — güvenli sayı yardımcıları", () => {
  it("negatif ve sonsuz değerleri null'a indirger", () => {
    assert.deepEqual(sanitizeCounts(-5, 3, 2), { total: null, correct: null, wrong: null });
    assert.deepEqual(sanitizeCounts(Infinity, 3, 2), { total: null, correct: null, wrong: null });
  });

  it("total=0 iken doğru/yanlış tutmaz", () => {
    assert.deepEqual(sanitizeCounts(0, 5, 2), { total: 0, correct: null, wrong: null });
  });

  it("correct+wrong>total ise doğruya öncelik verip kırpar", () => {
    assert.deepEqual(sanitizeCounts(40, 41, 0), { total: 40, correct: 40, wrong: 0 });
    assert.deepEqual(sanitizeCounts(40, 30, 15), { total: 40, correct: 30, wrong: 10 });
  });

  it("pctOf asla %100'ü aşmaz", () => {
    assert.equal(pctOf(41, 40), 1);
    assert.equal(pctOf(100, 40), 1);
    assert.equal(pctOf(-3, 10), 0);
    assert.equal(pctOf(5, 0), null);
  });

  it("blankOf negatif olamaz", () => {
    assert.equal(blankOf(10, 8, 5), 0);
    assert.equal(blankOf(10, -3, 2), 8);
  });

  it("netOf negatif doğruyu 0 sayar", () => {
    assert.equal(netOf(-5, 2), -0.5);
    assert.equal(netOf(8, -2), 8);
  });

  it("countsIssue geçersiz durumları bildirir", () => {
    assert.ok(countsIssue(40, 41, 0));
    assert.ok(countsIssue(-1, 0, 0));
    assert.ok(countsIssue(0, 1, 0));
    assert.ok(countsIssue(null, 1, 0));
    assert.equal(countsIssue(40, 20, 0), null);
    assert.equal(countsIssue(40, 40, 0), null);
  });

  it("clampTopicPatch yalnızca düzenlenen alanı düzeltir", () => {
    // Sadece 'correct' girildi: wrong kırpılır, total'a dokunulmaz.
    assert.deepEqual(clampTopicPatch({ total: 40, correct: 20, wrong: 0 }, { correct: 41 }), { total: 40, correct: 40, wrong: 0 });
    // İlgisiz alan güncellemesi mevcut (geçersiz) kaydı değiştirmez.
    assert.deepEqual(clampTopicPatch({ total: 40, correct: 41, wrong: 0 }, { note: "x" } as any), { total: 40, correct: 41, wrong: 0 });
    // Negatif yeni değer null olur.
    assert.deepEqual(clampTopicPatch({ total: 40, correct: 20, wrong: 0 }, { correct: -3 }), { total: 40, correct: null, wrong: 0 });
  });
});

describe("İstenen senaryolar — topicDerived", () => {
  const cases: [number | null, number | null, number | null, number | null, number | null, number | null][] = [
    // total, correct, wrong, beklenen net, beklenen blank, beklenen pct
    [40, 20, 0, 20, 20, 0.5],
    [40, 40, 0, 40, 0, 1],
    [40, 41, 0, 40, 0, 1],          // geçersiz: 40'a kırpılır
    [40, 30, 15, 27.5, 0, 0.75],   // geçersiz: yanlış 10'a kırpılır
    [40, 0, 0, 0, 40, 0],
    [40, -5, 0, 0, 40, 0],          // negatif: 0
  ];
  for (const [total, correct, wrong, net, blank, pct] of cases) {
    it(`${total}/${correct}/${wrong} → net=${net}, boş=${blank}, yüzde=${pct}`, () => {
      const d = S.topicDerived(row({ total, correct, wrong }));
      assert.equal(d.net, net);
      assert.equal(d.blank, blank);
      assert.equal(d.pct, pct);
    });
  }
});

describe("Öğrenme aşaması — geçersiz veri", () => {
  it("40/41 'Bitti' öğrenildi SAYILMAZ", () => {
    assert.equal(learningStage({ status: "Bitti", total: 40, correct: 41 }), "temel-soru");
    assert.equal(explainStage({ status: "Bitti", total: 40, correct: 41 }).mastered, false);
  });
  it("40/40 'Bitti' öğrenildi sayılır (geçerli)", () => {
    assert.equal(learningStage({ status: "Bitti", total: 40, correct: 40 }), "ogrenildi");
  });
  it("negatif doğru öğrenildi sayılmaz", () => {
    assert.equal(learningStage({ status: "Bitti", total: 40, correct: -5 }), "temel-soru");
  });
  it("40/30/15 (doğru+yanlış>toplam) öğrenildi SAYILMAZ", () => {
    assert.equal(learningStage({ status: "Bitti", total: 40, correct: 30, wrong: 15 }), "temel-soru");
    assert.equal(explainStage({ status: "Bitti", total: 40, correct: 30, wrong: 15 }).mastered, false);
    assert.equal(explainStage({ status: "Bitti", total: 40, correct: 30, wrong: 15 }).invalid, true);
  });
  it("40/30/10 (doğru+yanlış=toplam) geçerlidir ve öğrenildi sayılır", () => {
    assert.equal(learningStage({ status: "Bitti", total: 40, correct: 30, wrong: 10 }), "ogrenildi");
  });
  it("explainStage.mastered her girdide learningStage ile tutarlı", () => {
    for (const total of [null, 0, 10, 15, 40, -5]) {
      for (const correct of [null, 0, 5, 15, 40, 41, -3]) {
        for (const status of ["Başlamadım", "Çalışıyorum", "Bitti", "Tekrar Gerekli"]) {
          const r = { status, total, correct };
          assert.equal(
            explainStage(r).mastered,
            learningStage(r) === "ogrenildi",
            `tutarsız: ${status} ${correct}/${total}`,
          );
        }
      }
    }
  });
  it("geçersiz açıklamada '41/40' ifadesi geçmez", () => {
    const ex = explainStage({ status: "Bitti", total: 40, correct: 41 });
    assert.ok(!ex.summary.includes("41/40"), ex.summary);
    assert.ok(ex.summary.includes("Geçersiz"));
  });
});

describe("Sağlık — boş lastStudy artık cezalandırılmaz", () => {
  it("lastStudy boş + %100 başarı → 'iyi' (önce 'zayif'ti)", () => {
    assert.equal(
      E.topicHealth({ total: 40, correct: 40, wrong: 0, lastStudy: "", status: "Çalışıyorum" }, []),
      "iyi",
    );
  });
  it("lastStudy eski + %100 başarı → tazelik cezası korunur", () => {
    assert.equal(
      E.topicHealth({ total: 40, correct: 40, wrong: 0, lastStudy: "2026-01-01", status: "Bitti" }, [], "2026-11-03"),
      "zayif",
    );
  });
  it("ilgisiz günlük kayıtları trendi etkilemez (topic eşleşmesi)", () => {
    const base = { total: 10, correct: 5, wrong: 5, lastStudy: "2026-11-02", status: "Çalışıyorum", topic: "Türev" };
    const unrelated = [
      { id: "d1", date: "2026-11-03", subject: "Fizik", topic: "Başka", kind: "Soru çözümü", minutes: 30, questions: 20, correct: 18, wrong: 2, note: "" },
      { id: "d2", date: "2026-11-02", subject: "Kimya", topic: "Yine", kind: "Soru çözümü", minutes: 30, questions: 20, correct: 2, wrong: 18, note: "" },
    ];
    assert.equal(E.topicHealth(base, unrelated, "2026-11-03"), E.topicHealth(base, [], "2026-11-03"));
  });
  it("geçersiz veri sağlığı 'iyi' yapamaz", () => {
    assert.notEqual(
      E.topicHealth({ total: 40, correct: 41, wrong: 0, lastStudy: "2026-11-02", status: "Bitti" }, [], "2026-11-03"),
      "iyi",
    );
  });
});

describe("AYT ön koşulu — geçersiz veri kapıyı AÇAMAZ", () => {
  const gate = (correct: number) =>
    R.MAT_AYT_GATE.map((name: string) => row({
      id: `TYT|Matematik|${name}|alt`, topic: name, status: "Bitti",
      total: 40, correct, wrong: 0, lastStudy: "2026-11-01",
    }));

  it("41/40 geçersiz veri kapıyı açmaz", () => {
    const u = R.aytUnlocks(gate(41));
    assert.equal(u.mat.ready, false, `41/40 ile kapı açıldı: ${u.mat.done}/${u.mat.total}`);
  });
  it("40/40 geçerli veri kapıyı açar", () => {
    assert.equal(R.aytUnlocks(gate(40)).mat.ready, true);
  });
  it("28/40 (%70 sınır) kapıyı açar", () => {
    assert.equal(R.aytUnlocks(gate(28)).mat.ready, true);
  });
  it("27/40 (%67.5, sınır altı) kapıyı açmaz", () => {
    assert.equal(R.aytUnlocks(gate(27)).mat.ready, false);
  });
  it("negatif doğru kapıyı açmaz", () => {
    assert.equal(R.aytUnlocks(gate(-5)).mat.ready, false);
  });
});
