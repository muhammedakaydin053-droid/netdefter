import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { splitBudget, slotsPerDay, capacity, type DayLoad } from "./budget.ts";
import { DEFAULT_SETTINGS } from "./types.ts";

// Kapasitenin karşılaması gereken konu sayısı müfredattan okunur; elle yazılan
// bir sayı müfredat büyüyünce sessizce yanlış beklentiye dönüşür.
const curriculum = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "data", "curriculum.json"), "utf8"),
) as { exam: string; subject: string; topic: string }[];
const topicCount = new Set(curriculum.map((r) => `${r.exam}|${r.subject}|${r.topic}`)).size;

/** Verilen aralıktaki günleri takvimden üretir; pazar dinlenme, deneme günleri ayardan. */
function programDays(): DayLoad[] {
  const days: DayLoad[] = [];
  const end = Date.parse(DEFAULT_SETTINGS.examDate + "T12:00:00Z");
  for (let t = Date.parse(DEFAULT_SETTINGS.programStart + "T12:00:00Z"); t <= end; t += 86400000) {
    const wd = new Date(t).getUTCDay();
    days.push({ isSunday: wd === 0, isMock: DEFAULT_SETTINGS.mockWeekdays.includes(wd) });
  }
  return days;
}

describe("splitBudget", () => {
  it("yeni konuya en az 55 dakika ayırır", () => {
    const { newTopicReserve } = splitBudget(240, 1, 100);
    assert.ok(newTopicReserve >= 55, `rezerv 55'ten küçük: ${newTopicReserve}`);
  });

  it("240 dk bütçede tekrarlara yeni konuyu ezecek kadar pay bırakmaz", () => {
    // 3 tekrar × 55 dk = 165 dk; paragraf + problem = 100 dk.
    const { reviewCap } = splitBudget(240, 1, 100);
    assert.ok(
      reviewCap < 165,
      `tekrar payı hâlâ bütçeyi tek başına dolduruyor: ${reviewCap}`,
    );
    assert.ok(reviewCap + 55 + 100 <= 240, "rezerv + tekrar + sabit görevler bütçeyi aşıyor");
  });

  it("günde 2 ve 3 konu hedefinde rezervi büyütür", () => {
    const one = splitBudget(240, 1, 100).newTopicReserve;
    const two = splitBudget(240, 2, 100).newTopicReserve;
    const three = splitBudget(240, 3, 100).newTopicReserve;
    assert.ok(two > one && three > two, `rezerv tempoyla artmıyor: ${one}, ${two}, ${three}`);
  });

  it("rezervi günlük hedefe göre verir, bütçeyi aşmaz", () => {
    const { newTopicReserve } = splitBudget(240, 10, 0);
    assert.ok(newTopicReserve <= 240, `rezerv bütçeyi aştı: ${newTopicReserve}`);
    // Sabit görevler düşülünce kalan oda rezervin üst sınırıdır.
    assert.equal(splitBudget(240, 10, 100).newTopicReserve, 140);
  });

  it("pazar günü rezerv ayırmaz (yeni konu açılmıyor)", () => {
    const { newTopicReserve } = splitBudget(120, 1, 50, { sunday: true });
    assert.equal(newTopicReserve, 0);
  });

  it("sabit görevler bütçeyi aşarsa tekrar payı negatife düşmez", () => {
    const { reviewCap } = splitBudget(100, 1, 300);
    assert.equal(reviewCap, 0);
  });

  it("tekrar payı hiçbir durumda negatif olmaz", () => {
    for (const budget of [90, 120, 240, 480]) {
      for (const fixed of [0, 50, 100, 200]) {
        const { reviewCap } = splitBudget(budget, 1, fixed);
        assert.ok(reviewCap >= 0, `negatif tekrar payı: budget=${budget} fixed=${fixed} -> ${reviewCap}`);
      }
    }
  });

  it("yeni konu rezervi ile tekrar payı toplamı odayı aşmaz", () => {
    for (const budget of [90, 120, 240, 480]) {
      for (const fixed of [0, 50, 100]) {
        for (const perDay of [1, 2, 3]) {
          const { newTopicReserve, reviewCap } = splitBudget(budget, perDay, fixed);
          const room = Math.max(0, budget - fixed);
          assert.ok(
            newTopicReserve + reviewCap <= room,
            `paylar odayı aştı: budget=${budget} fixed=${fixed} perDay=${perDay}`,
          );
        }
      }
    }
  });

  it("gecikmiş kritik tekrar varsa bir yeni konudan feragat eder", () => {
    const plain = splitBudget(240, 2, 100);
    const protectedSplit = splitBudget(240, 2, 100, { protectReviews: true });
    assert.equal(protectedSplit.newTopicReserve, plain.newTopicReserve - 55);
    assert.ok(protectedSplit.reviewCap > plain.reviewCap);
  });
});

describe("slotsPerDay", () => {
  it("240 dk bütçede günde 2 slot verir", () => {
    // (240 − 100 sabit) / (55 konu + 10 ara) = 2
    assert.equal(slotsPerDay(240), 2);
  });

  it("sabit görevler bütçeyi yerse 0 döner", () => {
    assert.equal(slotsPerDay(90), 0);
  });

  it("taşıma (carry) dakikası slot açabilir", () => {
    assert.ok(slotsPerDay(170, 60) >= 1, "carry dakikası hesaba katılmıyor");
  });
});

describe("capacity", () => {
  const week = (opts: { sunday?: number[]; mock?: number[] } = {}): DayLoad[] => {
    const sundays = new Set(opts.sunday ?? []);
    const mocks = new Set(opts.mock ?? []);
    return Array.from({ length: 14 }, (_, i) => ({
      isSunday: sundays.has(i),
      isMock: mocks.has(i),
    }));
  };

  it("pazar ve deneme günlerini kapasiteden düşer", () => {
    const all = capacity(week(), 240);
    const withRest = capacity(week({ sunday: [0, 7], mock: [5, 12] }), 240);
    assert.equal(all.teachDays, 14);
    assert.equal(withRest.teachDays, 10, "pazar/deneme günleri düşülmedi");
    assert.equal(withRest.capacity, 10 * all.perDay);
  });

  it("müfredatın tamamını varsayılan program penceresinde karşılar", () => {
    // Günler ve süre ayarlardan, konu sayısı müfredattan türetilir.
    const cap = capacity(programDays(), DEFAULT_SETTINGS.studyMinutes);
    assert.equal(cap.perDay, 2);
    assert.ok(cap.capacity >= topicCount, `kapasite yetersiz: ${cap.capacity} < ${topicCount}`);
    // Öğretim günü, takvim günlerinden pazar + deneme günleri düşülerek bulunur.
    const calendarDays = programDays().length;
    assert.ok(cap.teachDays > 0 && cap.teachDays < calendarDays);
  });

  it("öğretim günü yoksa perDay 0 ve kapasite 0 olur", () => {
    const cap = capacity([{ isSunday: true, isMock: false }], 240);
    assert.equal(cap.teachDays, 0);
    assert.equal(cap.capacity, 0);
  });
});
