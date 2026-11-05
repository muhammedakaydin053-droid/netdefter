import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  AYT_MOCK_STAGES,
  TYT_MOCK_STAGES,
  rollingAverage,
  stageFor,
} from "./mock-bands.ts";

describe("stageFor", () => {
  it("picks the band containing the coverage", () => {
    assert.equal(stageFor(TYT_MOCK_STAGES, 0.1).id, "seviye");
    assert.equal(stageFor(TYT_MOCK_STAGES, 0.4).id, "seyrek");
    assert.equal(stageFor(TYT_MOCK_STAGES, 0.6).id, "rutin");
    assert.equal(stageFor(TYT_MOCK_STAGES, 0.75).id, "sik");
    assert.equal(stageFor(TYT_MOCK_STAGES, 0.95).id, "son");
  });

  it("clamps out-of-range coverage to the nearest band", () => {
    assert.equal(stageFor(TYT_MOCK_STAGES, -1).id, "seviye");
    assert.equal(stageFor(TYT_MOCK_STAGES, 2).id, "son");
  });

  it("increases frequency monotonically across bands", () => {
    const freqs = TYT_MOCK_STAGES.map((s) => s.perWeek);
    for (let i = 1; i < freqs.length; i++) {
      assert.ok(freqs[i] >= freqs[i - 1], `band ${i} must not be less frequent than ${i - 1}`);
    }
  });

  it("keeps AYT expectations lower than TYT at the same coverage", () => {
    // AYT konu bilgisine daha bağlı; aynı kapsamda daha az deneme mantıklı.
    const tytRutin = TYT_MOCK_STAGES.find((s) => s.id === "rutin")!;
    const aytRutin = AYT_MOCK_STAGES.find((s) => s.id === "rutin")!;
    assert.ok(aytRutin.nets![0] < tytRutin.nets![0]);
  });
});

describe("rollingAverage", () => {
  const mk = (date: string, net: number | null) => ({ date, net });

  it("averages the last N exams, not just the last one", () => {
    const exams = [mk("2027-01-01", 30), mk("2027-01-08", 40), mk("2027-01-15", 50)];
    const r = rollingAverage(exams, (e) => e.net);
    assert.equal(r.avg, 40);
    assert.equal(r.count, 3);
  });

  it("uses only the most recent window when more exams exist", () => {
    const exams = [mk("2027-01-01", 10), mk("2027-01-08", 40), mk("2027-01-15", 50), mk("2027-01-22", 60)];
    const r = rollingAverage(exams, (e) => e.net);
    // Son üç: 40, 50, 60 → 50
    assert.equal(r.avg, 50);
  });

  it("ignores exams without a net", () => {
    const exams = [mk("2027-01-01", null), mk("2027-01-08", 40), mk("2027-01-15", 50)];
    const r = rollingAverage(exams, (e) => e.net);
    assert.equal(r.count, 2);
    assert.equal(r.avg, 45);
  });

  it("reports the trend across the window", () => {
    const exams = [mk("2027-01-01", 30), mk("2027-01-08", 35), mk("2027-01-15", 45)];
    const r = rollingAverage(exams, (e) => e.net);
    assert.equal(r.trend, 15);
  });

  it("returns null average when there is no data", () => {
    const r = rollingAverage([mk("2027-01-01", null)], (e) => e.net);
    assert.equal(r.avg, null);
    assert.equal(r.count, 0);
  });
});
