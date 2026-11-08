import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  BRANCH_MOCK_SPEC,
  FULL_AYT_SPEC,
  FULL_TYT_SPEC,
  MINI_MOCK_SPEC,
  chooseMock,
  fullMockSpec,
  mockSpec,
} from "./mock-model.ts";

const base = {
  isMockDay: true,
  tytReady: false,
  tytOverdueDays: Infinity,
  tytInterval: 7,
  aytReady: false,
  aytOverdueDays: Infinity,
  aytInterval: 14,
  branchSubject: null,
  overallCoverage: 0,
};

describe("deneme süreleri (tür ayrımı)", () => {
  it("gerçek sınav sürelerini kullanır", () => {
    assert.deepEqual(fullMockSpec("TYT"), FULL_TYT_SPEC);
    assert.deepEqual(fullMockSpec("AYT"), FULL_AYT_SPEC);
    assert.equal(FULL_TYT_SPEC.minutes, 165);
    assert.equal(FULL_TYT_SPEC.targetQ, 120);
    assert.equal(FULL_AYT_SPEC.minutes, 180);
    assert.equal(FULL_AYT_SPEC.targetQ, 80);
  });

  it("türler farklı sürelere sahiptir; hepsine 165 dk verilmez", () => {
    assert.equal(mockSpec("tam", "TYT").minutes, 165);
    assert.equal(mockSpec("tam", "AYT").minutes, 180);
    assert.equal(mockSpec("brans").minutes, 40);
    assert.equal(mockSpec("mini").minutes, 25);
    const mins = new Set([
      mockSpec("tam", "TYT").minutes,
      mockSpec("tam", "AYT").minutes,
      mockSpec("brans").minutes,
      mockSpec("mini").minutes,
    ]);
    assert.equal(mins.size, 4, "dört türün süreleri birbirinden farklı olmalı");
  });
});

describe("chooseMock", () => {
  it("deneme günü değilse hiç deneme koymaz", () => {
    assert.equal(chooseMock({ ...base, isMockDay: false, tytReady: true }), null);
  });

  it("tam deneme zamanı gelmişse TYT tam denemesi seçer", () => {
    const m = chooseMock({ ...base, tytReady: true, tytOverdueDays: 10 });
    assert.equal(m?.type, "tam");
    assert.equal(m?.exam, "TYT");
    assert.equal(m?.minutes, 165);
  });

  it("AYT hazır ve gecikmişse AYT tam denemesi seçer (180 dk)", () => {
    const m = chooseMock({ ...base, aytReady: true, aytOverdueDays: 20 });
    assert.equal(m?.type, "tam");
    assert.equal(m?.exam, "AYT");
    assert.equal(m?.minutes, 180);
  });

  it("TYT ve AYT birlikte hazırsa en çok gecikmiş olanı seçer (denge)", () => {
    // AYT daha gecikmiş → AYT.
    const aytFirst = chooseMock({
      ...base,
      tytReady: true, tytOverdueDays: 8,
      aytReady: true, aytOverdueDays: 40,
    });
    assert.equal(aytFirst?.exam, "AYT");
    // TYT daha gecikmiş → TYT.
    const tytFirst = chooseMock({
      ...base,
      tytReady: true, tytOverdueDays: 40,
      aytReady: true, aytOverdueDays: 20,
    });
    assert.equal(tytFirst?.exam, "TYT");
    // Eşitlikte TYT (çekirdek korunur).
    const tie = chooseMock({
      ...base,
      tytReady: true, tytOverdueDays: 20,
      aytReady: true, aytOverdueDays: 20,
    });
    assert.equal(tie?.exam, "TYT");
  });

  it("zamanı gelmediyse branş denemesi koyar", () => {
    const m = chooseMock({
      ...base,
      tytReady: true, tytOverdueDays: 1, // aralık 7, gelmedi
      branchSubject: "Fizik",
    });
    assert.equal(m?.type, "brans");
    assert.equal(m?.subject, "Fizik");
    assert.equal(m?.minutes, 40);
  });

  it("branş için kapsam yoksa mini deneme koyar", () => {
    const m = chooseMock({ ...base, overallCoverage: 0.4 });
    assert.equal(m?.type, "mini");
    assert.equal(m?.minutes, 25);
  });

  it("kapsam çok düşükse hiç deneme koymaz", () => {
    assert.equal(chooseMock({ ...base, overallCoverage: 0.1 }), null);
  });

  it("tam deneme aralığı dolmadan tam deneme seçilmez", () => {
    // TYT aralığı 7: 6 gün geçmişse tam değil, branş/mini.
    const m = chooseMock({ ...base, tytReady: true, tytOverdueDays: 6, branchSubject: "Kimya" });
    assert.equal(m?.type, "brans");
  });
});

describe("mockSpec süreleri sabitleriyle tutarlı", () => {
  it("branş ve mini sabitleri eşleşir", () => {
    assert.deepEqual(mockSpec("brans"), BRANCH_MOCK_SPEC);
    assert.deepEqual(mockSpec("mini"), MINI_MOCK_SPEC);
  });
});
