/**
 * Program başlangıç tarihi ve hedef/sınav çapaları — regresyon testleri.
 *
 * Program başlangıcı 11.11.2026 Çarşamba'dan 13.11.2026 Cuma'ya alındı. Bu
 * dosya, tarih kaydırmasının yalnızca başlangıcı değiştirdiğini; sınav
 * tarihlerinin, tur hedeflerinin, kapasite basamaklarının ve AYT ön koşul
 * kapılarının DEĞİŞMEDİĞİNİ kilitler.
 *
 * `vite` ile yüklenir çünkü `roadmap.ts` `@/` takma adı kullanır.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type ViteDevServer } from "vite";

let server: ViteDevServer;
let TYPES: any;
let TARGETS: any;
let BUDGET: any;
let TIMELINE: any;
let RM: any;

before(async () => {
  server = await createServer({ server: { middlewareMode: true }, logLevel: "silent" });
  TYPES = await server.ssrLoadModule("/src/lib/smart/types.ts");
  TARGETS = (await server.ssrLoadModule("/src/data/targets.ts")).TARGETS;
  BUDGET = await server.ssrLoadModule("/src/lib/smart/budget.ts");
  TIMELINE = await server.ssrLoadModule("/src/data/timeline.ts");
  RM = await server.ssrLoadModule("/src/data/roadmap.ts");
});

after(async () => {
  await server?.close();
});

describe("program başlangıcı — yeni tarih", () => {
  it("varsayılan program başlangıcı 13.11.2026 (Cuma)", () => {
    assert.equal(TYPES.DEFAULT_SETTINGS.programStart, "2026-11-13");
    assert.equal(TARGETS.programStart, "2026-11-13");
    // 13.11.2026 Cuma olmalı (gün indeksi 5).
    assert.equal(new Date("2026-11-13T12:00:00").getDay(), 5);
  });

  it("sınav tarihleri DEĞİŞMEDİ", () => {
    assert.equal(TYPES.DEFAULT_SETTINGS.examDate, "2027-06-19");
    assert.equal(TARGETS.tytExam, "2027-06-19");
    assert.equal(TARGETS.aytExam, "2027-06-20");
  });

  it("ilk tur hedefleri: TYT 15.02.2027 (gösterilen), AYT 23.04.2027", () => {
    assert.equal(TARGETS.tytRound1, "2027-02-15");
    assert.equal(TARGETS.aytRound1, "2027-04-23");
    assert.equal(TARGETS.aytFlex, "2027-05-07");
    assert.equal(TARGETS.gapFill, "2027-05-17");
  });

  it("motorun TYT faz çapası ayrı tutulur (iç referans 08.02.2027)", () => {
    // Gösterilen hedef 15.02; motor tempo penceresi 08.02 çapasına göre kurulur.
    // Ayrım yapılmazsa bitiş 23.02'ye kayıyordu (bkz. targets.ts).
    assert.equal(TARGETS.tytPaceAnchor, "2027-02-08");
  });
});

describe("planlama kuralları — tarih kaydırmasında değişmedi", () => {
  it("günlük kapasite basamakları korundu (330 / 390 / 480)", () => {
    assert.deepEqual(BUDGET.CAPACITY_CURVE, [
      { from: "2026-11-01", minutes: 330 },
      { from: "2026-12-01", minutes: 390 },
      { from: "2027-01-01", minutes: 480 },
    ]);
    assert.equal(BUDGET.dailyCapacity("2026-11-13"), 330);
    assert.equal(BUDGET.dailyCapacity("2026-11-30"), 330);
    assert.equal(BUDGET.dailyCapacity("2026-12-01"), 390);
    assert.equal(BUDGET.dailyCapacity("2027-01-01"), 480);
    assert.equal(BUDGET.dailyCapacity("2027-06-20"), 480);
  });

  it("AYT ön koşul kapıları korundu (Mat 12 / Fiz 4 / Kim 5 / Bio hızlı geçiş)", () => {
    assert.equal(RM.MAT_AYT_GATE.length, 12);
    assert.equal(RM.FIZ_AYT_GATE.length, 4);
    assert.equal(RM.KIM_AYT_GATE.length, 5);
    assert.ok(RM.BIO_SKIP_FOR_FAST.includes("Kalıtım"));
  });

  it("faz takvimi yeni başlangıçtan başlar ve hedef çapalara oturur", () => {
    const tl = TIMELINE.buildTimeline("2026-11-13", "2027-06-19");
    assert.equal(tl[0].from, "2026-11-13");
    assert.equal(tl.at(-1).to, "2027-06-19");
    // Sınırlar görünür hedef tarihlere çapalı (TYT 15.02.2027).
    assert.deepEqual(
      tl.map((p: any) => p.from),
      ["2026-11-13", "2027-02-15", "2027-04-23", "2027-05-07", "2027-05-17"],
    );
  });
});
