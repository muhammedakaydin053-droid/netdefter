import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { addDaysISO, buildTimeline, daysBetweenISO, phaseFor, teachingDays } from "./timeline.ts";

describe("daysBetweenISO / addDaysISO", () => {
  it("counts calendar days across a month boundary", () => {
    assert.equal(daysBetweenISO("2026-10-28", "2026-11-03"), 6);
  });

  it("round-trips with addDaysISO", () => {
    assert.equal(addDaysISO("2026-10-28", 6), "2026-11-03");
    assert.equal(addDaysISO("2026-12-31", 1), "2027-01-01");
  });

  it("handles the leap day in 2028", () => {
    assert.equal(daysBetweenISO("2028-02-28", "2028-03-01"), 2);
  });
});

describe("buildTimeline", () => {
  const start = "2026-10-28";
  const exam = "2027-06-19";
  const timeline = buildTimeline(start, exam);

  it("produces five contiguous phases from start to exam", () => {
    assert.equal(timeline.length, 5);
    assert.equal(timeline[0].from, start);
    assert.equal(timeline.at(-1)?.to, exam);
    for (let i = 1; i < timeline.length; i++) {
      assert.equal(timeline[i].from, timeline[i - 1].to, `phase ${i} must start where ${i - 1} ends`);
    }
  });

  it("keeps the final period free of new topics", () => {
    const final = timeline.at(-1);
    assert.ok(final);
    assert.equal(final.newTopics, false);
    // Son dönem hedefi (gapFill) ile sınav arası: 13 Mayıs – 19 Haziran.
    assert.equal(final.from, "2027-05-13");
    // deneme fazı da yeni konu açmaz
    assert.equal(timeline.at(-2)?.newTopics, false);
  });

  it("anchors phase boundaries to the user's target dates", () => {
    assert.deepEqual(
      timeline.map((p) => p.from),
      ["2026-10-28", "2027-02-04", "2027-04-19", "2027-05-03", "2027-05-13"],
    );
  });

  it("opens new topics in the first three phases", () => {
    assert.deepEqual(timeline.slice(0, 3).map((p) => p.newTopics), [true, true, true]);
  });

  it("raises mock intensity as the exam approaches", () => {
    assert.deepEqual(timeline.map((p) => p.mockIntensity), [1, 1, 2, 2, 2]);
  });

  it("falls back to proportional phases when targets are out of order", () => {
    // Bozuk hedef: ters sıralı. Motor oransal dağılıma düşmeli, fazlar yine bitişik olmalı.
    const broken = buildTimeline("2026-10-28", "2027-06-19", 14, {
      programStart: "2026-10-28",
      tytRound1: "2027-05-01",
      aytRound1: "2027-02-01",
      aytFlex: "2027-03-01",
      gapFill: "2027-04-01",
      finalPeriod: "2027-04-01",
      tytExam: "2027-06-19",
      aytExam: "2027-06-20",
    });
    for (let i = 1; i < broken.length; i++) {
      assert.ok(broken[i].from <= broken[i].to, `phase ${i} must not invert`);
    }
  });

  it("collapses safely when the window is shorter than the reserve", () => {
    const short = buildTimeline("2027-06-10", "2027-06-19");
    assert.equal(short.length, 5);
    assert.equal(short[0].from, "2027-06-10");
    assert.equal(short.at(-1)?.to, "2027-06-19");
    for (const p of short) assert.ok(p.from <= p.to, `${p.id} must not invert`);
  });
});

describe("phaseFor", () => {
  const timeline = buildTimeline("2026-10-28", "2027-06-19");

  it("returns the phase containing the date", () => {
    assert.equal(phaseFor(timeline, "2026-10-28").id, "tyt-core");
    assert.equal(phaseFor(timeline, "2027-06-18").id, "final");
  });

  it("falls back to the last phase outside the range", () => {
    assert.equal(phaseFor(timeline, "2025-01-01").id, "tyt-core");
    assert.equal(phaseFor(timeline, "2030-01-01").id, "final");
  });
});

describe("teachingDays", () => {
  it("excludes one rest day per week", () => {
    // 14 gün = 2 hafta → 12 çalışma günü
    assert.equal(teachingDays("2026-10-28", "2026-11-11"), 12);
  });

  it("returns zero when the window is empty or inverted", () => {
    assert.equal(teachingDays("2026-10-28", "2026-10-28"), 0);
    assert.equal(teachingDays("2026-11-01", "2026-10-28"), 0);
  });
});
