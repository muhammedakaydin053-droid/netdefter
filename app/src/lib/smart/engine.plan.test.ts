/**
 * Program motoru regresyon testleri.
 *
 * Buradaki asıl amaç, "motor programı üretir ama konuları hiç açmaz" sınıfı
 * hataları yakalamak. Daha önce üç ayrı sebeple program 9. günde duruyordu:
 *   1. 3 tekrar + paragraf + problem = 265 dk, 240 dk bütçeyi aşıyordu,
 *   2. yeni konu görevi listenin sonuna eklenip saat dilimi bulamıyordu,
 *   3. planPace kapasiteyi pazar/deneme/sabit görevleri saymadan hesaplıyordu.
 *
 * Bu testler `vite` ile yüklenir çünkü motor `@/` takma adı ve JSON importu
 * kullanır; `node --test` bunları doğrudan çözemez.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type ViteDevServer } from "vite";

let server: ViteDevServer;
let E: any, S: any, curriculum: any[], isOngoing: any;

before(async () => {
  server = await createServer({ server: { middlewareMode: true }, logLevel: "silent" });
  E = await server.ssrLoadModule("/src/lib/smart/engine.ts");
  S = (await server.ssrLoadModule("/src/lib/smart/types.ts")).DEFAULT_SETTINGS;
  curriculum = (await server.ssrLoadModule("/src/data/curriculum.json")).default;
  isOngoing = (await server.ssrLoadModule("/src/data/sequence.ts")).isOngoingTopic;
});

after(async () => {
  await server?.close();
});

const addDays = (iso: string, n: number) =>
  new Date(Date.parse(iso + "T12:00:00Z") + n * 86400000).toISOString().slice(0, 10);

function seed() {
  return curriculum.map((t) => ({
    id: `${t.exam}|${t.subject}|${t.topic}|${t.subtopic}`,
    ...t,
    status: "Başlamadım",
    total: null,
    correct: null,
    wrong: null,
    lastStudy: "",
    reviewDate: "",
    source: "",
    note: "",
  }));
}

/** Müfredattaki benzersiz konu anahtarları (exam|subject|topic). */
const topicKeys = () => [...new Set(curriculum.map((t) => `${t.exam}|${t.subject}|${t.topic}`))];

/** Günlük pratik konuları hariç, motorun açması gereken konu sayısı. */
const expectedLeftTopics = () =>
  topicKeys().filter((k) => {
    const [exam, subject, topic] = k.split("|");
    return !isOngoing(exam, subject, topic);
  }).length;

/** Aynı beklenti, yalnızca TYT için. */
const expectedTytLeft = () =>
  topicKeys()
    .filter((k) => k.startsWith("TYT|"))
    .filter((k) => {
      const [, subject, topic] = k.split("|");
      return !isOngoing("TYT", subject, topic);
    }).length;

/** Programı gün gün işletir; "Konu anlatımı" görevlerini tamamlanmış sayar. */
function runProgram(days = 250) {
  let topics = seed();
  const taught = new Map<string, string>();
  const empty = new Set<string>();
  for (let i = 0; i < days; i++) {
    const date = addDays(S.programStart, i);
    const { slots } = E.buildDailyPlan(topics, [], [], [], [], S, [], date, empty);
    for (const sl of slots) {
      if (sl.kind === "Deneme" || sl.topic === "Yanlış analizi") continue;
      if (sl.kind === "Konu anlatımı") {
        const key = `${sl.exam}|${sl.subject}|${sl.topic}`;
        if (!taught.has(key)) taught.set(key, date);
        topics = topics.map((t) =>
          t.exam === sl.exam && t.subject === sl.subject && t.topic === sl.topic && t.status !== "Bitti"
            ? { ...t, status: "Bitti", lastStudy: date, total: 30, correct: 24, wrong: 6 }
            : t,
        );
      } else {
        topics = topics.map((t) =>
          t.exam === sl.exam && t.subject === sl.subject && t.topic === sl.topic
            ? { ...t, lastStudy: date, total: t.total ?? 30, correct: t.correct ?? 24, wrong: t.wrong ?? 6 }
            : t,
        );
      }
    }
  }
  return { taught, topics };
}

describe("planPace kapasite", () => {
  it("müfredattaki tüm konuları program penceresine sığdırır", () => {
    const pace = E.planPace(seed(), S, S.programStart);
    // Beklenti müfredattan türetilir: günlük pratik konuları (Paragraf/
    // Problemler) yeni konu sayılmaz. Sabit sayı yok; müfredat büyüyünce test
    // kendiliğinden uyum sağlar.
    const expected = expectedLeftTopics();
    assert.equal(pace.leftTopics, expected, "kalan konu sayısı müfredatla uyuşmuyor");
    assert.ok(pace.fits, `program sığmıyor: kapasite ${pace.capacity} < ${expected}`);
  });

  it("günlük pratik konularını yeni konu saymaz", () => {
    const pace = E.planPace(seed(), S, S.programStart);
    // TYT sayacında da Paragraf/Problemler olmamalı, yoksa AYT hiç açılmaz.
    const expected = expectedTytLeft();
    assert.equal(pace.tytLeft, expected, "TYT kalan konu sayısı müfredatla uyuşmuyor");
    // Dışlama gerçekten oldu mu? Olmasaydı sayı TYT'nin tüm konularına eşit olurdu.
    const tytTotal = new Set(
      curriculum.filter((t) => t.exam === "TYT").map((t) => `${t.subject}|${t.topic}`),
    ).size;
    assert.ok(expected < tytTotal, "TYT sayacı günlük pratik konularını dışlamıyor");
  });

  it("TYT tur 1 hedefine yetişecek tempoyu hesaplar", () => {
    const pace = E.planPace(seed(), S, S.programStart);
    assert.ok(pace.tytPerDay >= 1, `tytPerDay ${pace.tytPerDay}`);
    assert.ok(pace.tytPerDay <= pace.perDay);
    // TYT önce gelir; AYT ancak TYT hedefte kalıyorsa slot alır.
    assert.ok(pace.tytPerDay + pace.aytPerDay <= pace.perDay);
  });

  it("pazar ve deneme günlerini kapasiteden düşer", () => {
    const pace = E.planPace(seed(), S, S.programStart);
    // Öğretim penceresi takvim günlerinden (studyDays) küçük olmalı: pazar ve
    // cumartesi denemeleri düşülür.
    assert.ok(
      pace.teachingDays < pace.studyDays,
      `öğretim günü (${pace.teachingDays}) takvim gününden (${pace.studyDays}) az olmalı`,
    );
    assert.ok(pace.teachingDays >= 120, `öğretim günü çok az: ${pace.teachingDays}`);
  });

  it("günde en az 1 yeni konu planlar", () => {
    const pace = E.planPace(seed(), S, S.programStart);
    assert.ok(pace.perDay >= 1, `perDay ${pace.perDay}`);
  });
});

describe("program gerçekten ilerliyor", () => {
  it("ilk 30 günün her hafta içi gününde en az bir yeni konu açar", () => {
    let topics = seed();
    const empty = new Set<string>();
    const emptyWeekdays: string[] = [];
    for (let i = 0; i < 30; i++) {
      const date = addDays(S.programStart, i);
      const wd = new Date(date + "T12:00:00").getDay();
      const { slots } = E.buildDailyPlan(topics, [], [], [], [], S, [], date, empty);
      const hasMock = slots.some((s: { kind: string }) => s.kind === "Deneme");
      const news = slots.filter((s: { kind: string }) => s.kind === "Konu anlatımı");
      // Pazar hafif gün, cumartesi deneme günü; ikisinde yeni konu beklenmez.
      if (wd !== 0 && !hasMock && news.length === 0) emptyWeekdays.push(date);
      for (const sl of news) {
        topics = topics.map((t) =>
          t.exam === sl.exam && t.subject === sl.subject && t.topic === sl.topic && t.status !== "Bitti"
            ? { ...t, status: "Bitti", lastStudy: date, total: 30, correct: 24, wrong: 6 }
            : t,
        );
      }
    }
    assert.deepEqual(emptyWeekdays, [], `yeni konu açılmayan günler: ${emptyWeekdays.join(", ")}`);
  });

  it("program boyunca konuların tamamına yakınını açar", () => {
    const { taught } = runProgram();
    // Paragraf ve Problemler zaten günlük soru çözümü olarak yapılıyor,
    // "Konu anlatımı" olarak hiç açılmaz. Dışlama, adı elle yazmak yerine
    // motorun kendi kuralından (isOngoingTopic) alınır.
    const expected = topicKeys().filter((k) => {
      const [exam, subject, topic] = k.split("|");
      return !isOngoing(exam, subject, topic);
    });
    const missing = expected.filter((k) => !taught.has(k));
    assert.deepEqual(missing, [], `hiç açılmayan konular: ${missing.join(", ")}`);
  });

  it("AYT'yi TYT bitmeden başlatır (kapı mantığı)", () => {
    const { taught } = runProgram();
    const firstAyt = [...taught.entries()].filter(([k]) => k.startsWith("AYT|")).map(([, d]) => d).sort()[0];
    assert.ok(firstAyt, "AYT hiç başlamamış");
    assert.ok(firstAyt < S.examDate, `AYT çok geç başlıyor: ${firstAyt}`);
    // Kapı mantığı gereği AYT, TYT'nin son konusundan önce başlamalı.
    const lastTyt = [...taught.entries()].filter(([k]) => k.startsWith("TYT|")).map(([, d]) => d).sort().at(-1)!;
    assert.ok(firstAyt <= lastTyt, "AYT, TYT bittikten sonra başlıyor");
  });

  it("son konuyu sınavdan önce bitirir", () => {
    const { taught } = runProgram();
    const last = [...taught.values()].sort().at(-1)!;
    assert.ok(last < S.examDate, `son konu sınavdan sonra: ${last}`);
  });
});

describe("zayıf konu önceliği", () => {
  it("yanlış birikmiş bir konuyu hiç başlanmamış konuların gerisine atmaz", () => {
    // Regresyon: yalnızca `weakness` payı varken, 12 yanlış birikmiş "kritik"
    // bir konu sıralamada 25. sıraya düşüyordu; hiç başlanmamış konular
    // `notStarted` + `coreBoost` alıp üstte kalıyordu. Yani en çok tekrar
    // gereken konu, programın sonuna öteleniyordu.
    const topics = seed().map((t) =>
      t.topic === "Üslü Sayılar"
        ? { ...t, status: "Bitti", total: 20, correct: 8, wrong: 12, lastStudy: "2026-11-05" }
        : t,
    );
    const ranked = E.rankTopics(topics, [], [], "2026-11-10");
    const idx = ranked.findIndex((r: any) => r.exam === "TYT" && r.topic === "Üslü Sayılar");
    assert.ok(idx >= 0, "konu sıralamada yok");
    assert.ok(idx < 20, `zayıf konu çok geride: ${idx}. sıra`);
    assert.equal(ranked[idx].health, "kritik");
  });

  it("zayıf konuya 'kritik' ve 'yanlış birikmiş' gerekçesi yazar", () => {
    const topics = seed().map((t) =>
      t.topic === "Üslü Sayılar"
        ? { ...t, status: "Bitti", total: 20, correct: 8, wrong: 12, lastStudy: "2026-11-05" }
        : t,
    );
    const ranked = E.rankTopics(topics, [], [], "2026-11-10");
    const row = ranked.find((r: any) => r.exam === "TYT" && r.topic === "Üslü Sayılar");
    assert.ok(row.reasons.some((s: string) => s.includes("kritik")), row.reasons.join(", "));
    assert.ok(row.reasons.some((s: string) => s.includes("12 yanlış")), row.reasons.join(", "));
  });
});
