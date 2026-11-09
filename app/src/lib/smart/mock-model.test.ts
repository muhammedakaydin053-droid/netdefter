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
  plannedMockExam,
} from "./mock-model.ts";

const base = {
  isMockDay: true,
  fullMockDue: true,
  tytReady: false,
  aytReady: false,
  branchSubject: null,
  overallCoverage: 0,
  rotationIndex: 0,
  daysToTytExam: 300,
  tytRound1Done: false,
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

  it("yalnız TYT hazırsa TYT tam denemesi seçer (165 dk)", () => {
    const m = chooseMock({ ...base, tytReady: true, aytReady: false });
    assert.equal(m?.type, "tam");
    assert.equal(m?.exam, "TYT");
    assert.equal(m?.minutes, 165);
  });

  it("yalnız AYT hazırsa AYT tam denemesi seçer (180 dk)", () => {
    const m = chooseMock({ ...base, tytReady: false, aytReady: true });
    assert.equal(m?.type, "tam");
    assert.equal(m?.exam, "AYT");
    assert.equal(m?.minutes, 180);
  });

  it("iki sınav da hazırsa seçim takvim dönüşümüyle belirlenir (sonuç kaydından bağımsız)", () => {
    // TYT öncelikli çevrim (ilk tur sürüyor, sınava uzak): TYT, TYT, AYT.
    const seq = [0, 1, 2, 3, 4, 5].map(
      (i) =>
        chooseMock({ ...base, tytReady: true, aytReady: true, rotationIndex: i })?.exam,
    );
    assert.deepEqual(seq, ["TYT", "TYT", "AYT", "TYT", "TYT", "AYT"]);
    // Aynı rotationIndex her zaman aynı sınavı verir (deterministik).
    const a = chooseMock({ ...base, tytReady: true, aytReady: true, rotationIndex: 5 });
    const b = chooseMock({ ...base, tytReady: true, aytReady: true, rotationIndex: 5 });
    assert.equal(a?.exam, b?.exam);
  });

  it("TYT ilk turu bitince tam deneme 1:1 dönüşüme geçer", () => {
    const seq = [0, 1, 2, 3].map(
      (i) =>
        chooseMock({ ...base, tytReady: true, aytReady: true, rotationIndex: i, tytRound1Done: true })
          ?.exam,
    );
    assert.deepEqual(seq, ["TYT", "AYT", "TYT", "AYT"]);
  });

  it("sınava ≤ 60 gün kala 1:1 dönüşüme geçer (sınav yaklaşınca denge)", () => {
    const seq = [0, 1, 2, 3].map(
      (i) =>
        chooseMock({ ...base, tytReady: true, aytReady: true, rotationIndex: i, daysToTytExam: 45 })
          ?.exam,
    );
    assert.deepEqual(seq, ["TYT", "AYT", "TYT", "AYT"]);
  });

  it("yalnız TYT hazırsa branş değil tam TYT denemesi koyar", () => {
    // Tam deneme hazır olduğunda branş denemesine düşülmez; branş yalnızca
    // iki tam deneme de hazır değilken devreye girer.
    const m = chooseMock({ ...base, tytReady: true, aytReady: false, branchSubject: "Fizik" });
    assert.equal(m?.type, "tam");
    assert.equal(m?.exam, "TYT");
  });

  it("tam deneme günü değilse (fullMockDue=false) tam deneme koymaz; branşa düşer", () => {
    const m = chooseMock({
      ...base,
      fullMockDue: false,
      tytReady: true,
      aytReady: true,
      branchSubject: "Fizik",
    });
    assert.equal(m?.type, "brans");
    assert.equal(m?.subject, "Fizik");
  });

  it("tam deneme günü değilse ve branş yoksa mini deneme koyar", () => {
    const m = chooseMock({ ...base, fullMockDue: false, tytReady: true, aytReady: true, overallCoverage: 0.4 });
    assert.equal(m?.type, "mini");
  });

  it("iki tam deneme de hazır değilse branş denemesi koyar", () => {
    const m = chooseMock({ ...base, tytReady: false, aytReady: false, branchSubject: "Fizik" });
    assert.equal(m?.type, "brans");
    assert.equal(m?.subject, "Fizik");
    assert.equal(m?.minutes, 40);
  });

  it("hiçbiri hazır değilse ve branş yoksa mini deneme koyar", () => {
    const m = chooseMock({ ...base, overallCoverage: 0.4 });
    assert.equal(m?.type, "mini");
    assert.equal(m?.minutes, 25);
  });

  it("kapsam çok düşükse hiç deneme koymaz", () => {
    assert.equal(chooseMock({ ...base, overallCoverage: 0.1 }), null);
  });
});

describe("plannedMockExam — TYT öncelikli takvim dönüşümü", () => {
  it("ilk tur sürerken 2:1 (TYT, TYT, AYT)", () => {
    const seq = [0, 1, 2, 3, 4, 5].map((i) =>
      plannedMockExam(i, { tytRound1Done: false, daysToTytExam: 300 }),
    );
    assert.deepEqual(seq, ["TYT", "TYT", "AYT", "TYT", "TYT", "AYT"]);
  });

  it("ilk tur bitince 1:1", () => {
    const seq = [0, 1, 2, 3].map((i) =>
      plannedMockExam(i, { tytRound1Done: true, daysToTytExam: 200 }),
    );
    assert.deepEqual(seq, ["TYT", "AYT", "TYT", "AYT"]);
  });

  it("TYT sınavına ≤ 60 gün kala 1:1", () => {
    const seq = [0, 1, 2, 3].map((i) =>
      plannedMockExam(i, { tytRound1Done: false, daysToTytExam: 30 }),
    );
    assert.deepEqual(seq, ["TYT", "AYT", "TYT", "AYT"]);
  });

  it("negatif/sıfır rotationIndex güvenli", () => {
    assert.equal(plannedMockExam(0, { tytRound1Done: false, daysToTytExam: 300 }), "TYT");
    assert.doesNotThrow(() => plannedMockExam(-1, { tytRound1Done: false, daysToTytExam: 300 }));
  });
});

describe("mockSpec süreleri sabitleriyle tutarlı", () => {
  it("branş ve mini sabitleri eşleşir", () => {
    assert.deepEqual(mockSpec("brans"), BRANCH_MOCK_SPEC);
    assert.deepEqual(mockSpec("mini"), MINI_MOCK_SPEC);
  });
});
