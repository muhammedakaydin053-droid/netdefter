import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { learningStage, stageCredit, weightedProgress } from "./progress.ts";

describe("learningStage", () => {
  it("treats 'Bitti' without question data as lecture-only", () => {
    // Kullanıcı şartı: konu anlatımı tek başına yeterli değil.
    assert.equal(learningStage({ status: "Bitti", total: null, correct: null }), "anlatim");
    assert.equal(learningStage({ status: "Bitti", total: 0, correct: 0 }), "anlatim");
  });

  it("treats 'Bitti' with weak question performance as basic-practice", () => {
    assert.equal(learningStage({ status: "Bitti", total: 20, correct: 8 }), "temel-soru");
  });

  it("treats 'Bitti' with strong question performance as mastered", () => {
    assert.equal(learningStage({ status: "Bitti", total: 20, correct: 15 }), "ogrenildi");
    assert.equal(learningStage({ status: "Bitti", total: 30, correct: 30 }), "ogrenildi");
  });

  it("marks 'Tekrar Gerekli' regardless of question data", () => {
    assert.equal(learningStage({ status: "Tekrar Gerekli", total: 30, correct: 28 }), "tekrar-gerekli");
  });

  it("reports not-started correctly", () => {
    assert.equal(learningStage({ status: "Başlamadım", total: null, correct: null }), "gorulmedi");
    assert.equal(learningStage({ status: "Çalışıyorum", total: null, correct: null }), "anlatim");
    assert.equal(learningStage({ status: "Çalışıyorum", total: 10, correct: 6 }), "temel-soru");
  });

  /**
   * Sınır durumları. İki eşik de (15 soru, %70) burada sabitlenir: eşiklerden
   * biri değişirse bu testler kırmızıya düşer. Önceden yalnızca eşiklerin
   * güvenli içindeki örnekler test ediliyordu, sınırın kendisi değil.
   */
  it("sınır: 14/14 öğrenilmiş sayılmaz (soru sayısı yetersiz)", () => {
    // Başarı %100 ama 15 soruluk alt sınır karşılanmıyor.
    assert.equal(learningStage({ status: "Bitti", total: 14, correct: 14 }), "temel-soru");
  });

  it("sınır: 14/20 öğrenilmiş sayılır (iki eşik de karşılanır)", () => {
    assert.equal(learningStage({ status: "Bitti", total: 20, correct: 14 }), "ogrenildi");
  });

  it("sınır: 15/15 öğrenilmiş sayılır (tam başarı, sınırda soru sayısı)", () => {
    assert.equal(learningStage({ status: "Bitti", total: 15, correct: 15 }), "ogrenildi");
  });

  it("sınır: 13/20 öğrenilmiş sayılmaz (başarı %65, eşik altı)", () => {
    assert.equal(learningStage({ status: "Bitti", total: 20, correct: 13 }), "temel-soru");
  });

  it("sınır: eşikler tam sınırda kapsayıcıdır (15 ve %70 dahil)", () => {
    // 15 soru, %70 tam → geçer. 14 soru, %100 → geçmez.
    assert.equal(learningStage({ status: "Bitti", total: 10, correct: 7 }), "temel-soru");
    assert.equal(learningStage({ status: "Bitti", total: 20, correct: 14 }), "ogrenildi");
    assert.equal(learningStage({ status: "Bitti", total: 15, correct: 10 }), "temel-soru");
  });
});

describe("weightedProgress", () => {
  it("is zero when nothing is mastered", () => {
    const r = weightedProgress([
      { weight: 10, stage: "gorulmedi" },
      { weight: 5, stage: "gorulmedi" },
    ]);
    assert.equal(r.progress, 0);
    assert.equal(r.weighted, true);
    assert.equal(r.mastered, 0);
  });

  it("counts a heavy topic more than a light one", () => {
    // Paragraf (ağır) bitmiş, hafif konu bitmemiş → ilerleme hafif konunun
    // bitmiş hâlinden DAHA yüksek olmalı.
    const heavyDone = weightedProgress([
      { weight: 26, stage: "ogrenildi" },
      { weight: 1, stage: "gorulmedi" },
    ]);
    const lightDone = weightedProgress([
      { weight: 26, stage: "gorulmedi" },
      { weight: 1, stage: "ogrenildi" },
    ]);
    assert.ok(heavyDone.progress > lightDone.progress);
  });

  it("gives full progress only when everything is mastered", () => {
    const r = weightedProgress([
      { weight: 3, stage: "ogrenildi" },
      { weight: 7, stage: "ogrenildi" },
    ]);
    assert.equal(r.progress, 1);
  });

  it("does not invent weights: falls back to equal weighting and reports it", () => {
    const r = weightedProgress([
      { weight: 10, stage: "ogrenildi" },
      { weight: null, stage: "gorulmedi" },
    ]);
    assert.equal(r.weighted, false);
    // Eşit ağırlık: 1 / 2 = 0.5
    assert.equal(r.progress, 0.5);
  });

  it("credits lecture-only and review-needed partially", () => {
    assert.ok(stageCredit("anlatim") > 0);
    assert.ok(stageCredit("anlatim") < stageCredit("ogrenildi"));
    assert.ok(stageCredit("tekrar-gerekli") < stageCredit("ogrenildi"));
  });
});
