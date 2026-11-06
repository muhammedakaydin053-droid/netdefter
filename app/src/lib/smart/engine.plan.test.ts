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

/** İki ISO tarih arasındaki tam gün sayısı (b - a). */
const daysBetweenISO = (a: string, b: string) =>
  Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 86400000);

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

describe("tamamlanmış konu ve pratik döngüsü", () => {
  /** Bir konuyu "Çalışıyorum" yapıp günlük planı üretir. */
  function withStarted(topicName: string, status = "Çalışıyorum", correct = 5) {
    return seed().map((t) =>
      t.topic === topicName && t.exam === "TYT"
        ? { ...t, status, total: 10, correct, wrong: 10 - correct, lastStudy: "2026-11-05" }
        : t,
    );
  }

  it("başlanmış konu tekrar veya soru çözümü alır (kalıcı dışlanmaz)", () => {
    // Regresyon: `avoid` kümesi, geçmişte anlatımı verilen her konuyu kalıcı
    // olarak dışlıyordu; konu ne soru çözümü ne tekrar alıyor, hiç "Bitti"
    // olamıyor ve AYT kapıları hiç açılmıyordu.
    const topics = withStarted("Kimya Bilimi");
    let got = false;
    for (let i = 0; i < 10 && !got; i++) {
      const date = addDays(S.programStart, i);
      const { slots } = E.buildDailyPlan(topics, [], [], [], [], S, [], date, new Set());
      got = slots.some(
        (s: any) =>
          s.topic === "Kimya Bilimi" && (s.kind === "Soru çözümü" || s.kind === "Tekrar"),
      );
    }
    assert.ok(got, "başlanmış konu 10 günde hiç pratik/tekrar almadı");
  });

  it("tamamlanmış (Bitti) konuya yeni soru çözümü görevi yazmaz", () => {
    // Regresyon: Bitti konular her gün "Soru çözümü" görevi alıp yeni konuların
    // slotlarını tüketiyordu.
    const topics = withStarted("Kimya Bilimi", "Bitti");
    const { slots } = E.buildDailyPlan(topics, [], [], [], [], S, [], "2026-11-10", new Set());
    const practice = slots.find(
      (s: any) => s.topic === "Kimya Bilimi" && s.kind === "Soru çözümü",
    );
    assert.equal(practice, undefined, "Bitti konuya soru çözümü verildi");
  });
});

describe("kapasite eğrisi (330/390/480)", () => {
  it("artan kapasite günlük yeni konu sayısını artırır", () => {
    const cap = (d: string) => (d < "2026-12-01" ? 330 : d < "2027-01-01" ? 390 : 480);
    const nov = E.planPace(seed(), { ...S, studyMinutes: cap("2026-11-10") }, "2026-11-10");
    const jan = E.planPace(seed(), { ...S, studyMinutes: cap("2027-01-10") }, "2027-01-10");
    assert.ok(jan.perDay >= nov.perDay, `Ocak perDay ${jan.perDay} < Kasım ${nov.perDay}`);
    assert.ok(jan.capacity > nov.capacity, "Ocak kapasitesi Kasım'dan büyük olmalı");
  });

  it("480 dakika 450'den daha fazla slot üretmez (doygunluk)", () => {
    // budget.ts formülü: (dk − 100) / 65. 450 ve 480 aynı slotu verir.
    const b = E.planPace(seed(), { ...S, studyMinutes: 450 }, "2027-01-10");
    const c = E.planPace(seed(), { ...S, studyMinutes: 480 }, "2027-01-10");
    assert.equal(b.perDay, c.perDay);
  });
});

describe("AYT ders dengesi (uçtan uca)", () => {
  /** Motoru gün gün ilerletip her dersin ilk anlatım tarihini döndürür. */
  function simulate(days: number) {
    let topics = seed();
    const first: Record<string, string> = {};
    for (let i = 0; i < days; i++) {
      const date = addDays(S.programStart, i);
      const { slots } = E.buildDailyPlan(topics, [], [], [], [], S, [], date, new Set());
      for (const sl of slots) {
        if (!sl.exam || sl.kind === "Deneme" || sl.kind === "Yanlış analizi") continue;
        const key = `${sl.exam}|${sl.subject}|${sl.topic}`;
        if (sl.kind === "Konu anlatımı") {
          if (sl.exam === "AYT") first[key] ??= date;
          topics = topics.map((t) =>
            t.exam === sl.exam && t.subject === sl.subject && t.topic === sl.topic && t.status === "Başlamadım"
              ? { ...t, status: "Çalışıyorum", lastStudy: date }
              : t,
          );
        } else if (sl.kind === "Soru çözümü" || sl.kind === "Tekrar") {
          // Tekrar da soru çözümüdür: öğrenilme şartını besler.
          topics = topics.map((t) => {
            if (!(t.exam === sl.exam && t.subject === sl.subject && t.topic === sl.topic)) return t;
            if (t.status === "Başlamadım") return t;
            const q = Math.max(15, sl.targetQ || 15);
            const total = (t.total ?? 0) + q;
            const correct = (t.correct ?? 0) + Math.round(q * 0.78);
            return { ...t, total, correct, lastStudy: date, status: total >= 15 && correct / total >= 0.7 ? "Bitti" : t.status };
          });
        }
      }
    }
    return { first, topics };
  }

  it("TYT bitince AYT'nin tüm dersleri en geç 45 gün içinde başlar", () => {
    // Regresyon: öncelik skoru yüksek Matematik diğer derslerin önüne geçiyor,
    // ya da ilk başlayan ders (Kimya) AYT bütçesini tüketip Fizik/Geometri'yi
    // aylarca bekletiyordu. Her ders kapı açıldıktan sonra makul sürede başlamalı.
    const { first } = simulate(230);
    const subjects = ["Matematik", "Geometri", "Fizik", "Kimya", "Biyoloji"];
    const starts = subjects.map((s) => {
      const dates = Object.entries(first)
        .filter(([k]) => k.startsWith(`AYT|${s}|`))
        .map(([, d]) => d);
      return { s, d: dates.sort()[0] };
    });
    const last = starts.map((x) => x.d).sort().at(-1)!;
    for (const { s, d } of starts) {
      assert.ok(d, `AYT ${s} hiç başlamadı`);
      assert.ok(
        daysBetweenISO(d, last) <= 45,
        `AYT ${s} (${d}) son başlayan dersten 45 günden fazla önce`,
      );
    }
  });
});

describe("TYT ders kapsama garantisi", () => {
  /** Motoru gün gün ilerletip her konunun ilk anlatım tarihini döndürür. */
  function firstStarts(days: number) {
    let topics = seed();
    const first: Record<string, string> = {};
    for (let i = 0; i < days; i++) {
      const date = addDays(S.programStart, i);
      const { slots } = E.buildDailyPlan(topics, [], [], [], [], S, [], date, new Set());
      for (const sl of slots) {
        if (!sl.exam || sl.kind === "Deneme" || sl.kind === "Yanlış analizi") continue;
        if (sl.kind === "Konu anlatımı") {
          first[`${sl.exam}|${sl.subject}|${sl.topic}`] ??= date;
          topics = topics.map((t) =>
            t.exam === sl.exam && t.subject === sl.subject && t.topic === sl.topic && t.status === "Başlamadım"
              ? { ...t, status: "Çalışıyorum", lastStudy: date }
              : t,
          );
        } else {
          topics = topics.map((t) => {
            if (!(t.exam === sl.exam && t.subject === sl.subject && t.topic === sl.topic)) return t;
            if (t.status === "Başlamadım") return t;
            const q = Math.max(15, sl.targetQ || 15);
            const total = (t.total ?? 0) + q;
            const correct = (t.correct ?? 0) + Math.round(q * 0.78);
            return { ...t, total, correct, lastStudy: date, status: total >= 15 && correct / total >= 0.7 ? "Bitti" : t.status };
          });
        }
      }
    }
    return first;
  }

  it("10 TYT dersi de programın ilk iki haftasında başlar", () => {
    // Regresyon: tek sıralı round-robin yüzünden Coğrafya 16 Aralık'a (6 hafta)
    // kayıyordu. Kapsama garantisi ile her ders ilk haftalarda başlamalı.
    const first = firstStarts(30);
    const subjects = [...new Set(curriculum.filter((t: any) => t.exam === "TYT").map((t: any) => t.subject))];
    const limit = addDays(S.programStart, 14);
    for (const s of subjects) {
      const starts = Object.entries(first)
        .filter(([k]) => k.startsWith(`TYT|${s}|`))
        .map(([, d]) => d)
        .sort();
      assert.ok(starts.length > 0, `TYT ${s} hiç başlamadı`);
      assert.ok(starts[0] <= limit, `TYT ${s} ilk iki haftada başlamadı: ${starts[0]}`);
    }
  });

  it("Kimya Bilimi ilk hafta içinde başlar (Ocak'a sarkmaz)", () => {
    const first = firstStarts(30);
    const start = first["TYT|Kimya|Kimya Bilimi"];
    assert.ok(start, "Kimya Bilimi hiç başlamadı");
    assert.ok(start <= addDays(S.programStart, 7), `Kimya Bilimi çok geç: ${start}`);
  });
});
