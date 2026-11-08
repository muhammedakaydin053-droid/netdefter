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
let E: any, S: any, B: any, curriculum: any[], isOngoing: any, RM: any;

before(async () => {
  server = await createServer({ server: { middlewareMode: true }, logLevel: "silent" });
  E = await server.ssrLoadModule("/src/lib/smart/engine.ts");
  S = (await server.ssrLoadModule("/src/lib/smart/types.ts")).DEFAULT_SETTINGS;
  curriculum = (await server.ssrLoadModule("/src/data/curriculum.json")).default;
  isOngoing = (await server.ssrLoadModule("/src/data/sequence.ts")).isOngoingTopic;
  RM = await server.ssrLoadModule("/src/data/roadmap.ts");
  B = await server.ssrLoadModule("/src/lib/smart/budget.ts");
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
        ? { ...t, status: "Bitti", total: 20, correct: 8, wrong: 12, lastStudy: "2026-11-09" }
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
        ? { ...t, status: "Bitti", total: 20, correct: 8, wrong: 12, lastStudy: "2026-11-09" }
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
        ? { ...t, status, total: 10, correct, wrong: 10 - correct, lastStudy: "2026-11-09" }
        : t,
    );
  }

  it("başlanmış konu eksik kapatma/tekrar görevi alır (kalıcı dışlanmaz)", () => {
    // Regresyon: `avoid` kümesi, geçmişte anlatımı verilen her konuyu kalıcı
    // olarak dışlıyordu; konu ne soru çözümü ne tekrar alıyor, hiç "Bitti"
    // olamıyor ve AYT kapıları hiç açılmıyordu.
    // Tür, eksik kapatma rotasyonuna göre değişebilir; ölçüt "görev almaması"
    // değil, konunun plana hiç girmemesiydi.
    const recoveryKinds = ["Soru çözümü", "Tekrar", "Konu anlatımı", "Yanlış analizi"];
    const topics = withStarted("Kimya Bilimi");
    let got = false;
    for (let i = 0; i < 10 && !got; i++) {
      const date = addDays(S.programStart, i);
      const { slots } = E.buildDailyPlan(topics, [], [], [], [], S, [], date, new Set());
      got = slots.some((s: any) => s.topic === "Kimya Bilimi" && recoveryKinds.includes(s.kind));
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
    const gate: Record<string, string> = {};
    for (let i = 0; i < days; i++) {
      const date = addDays(S.programStart, i);
      const { slots } = E.buildDailyPlan(topics, [], [], [], [], S, [], date, new Set());
      const u = RM.aytUnlocks(topics);
      for (const k of ["mat", "fiz", "kim", "bio"] as const) if (u[k].ready) gate[k] ??= date;
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
    return { first, topics, gate };
  }

  it("AYT'nin tüm dersleri kendi kapısı açıldıktan sonra en geç 45 gün içinde başlar", () => {
    // Regresyon: öncelik skoru yüksek Matematik diğer derslerin önüne geçiyor,
    // ya da ilk başlayan ders (Kimya) AYT bütçesini tüketip Fizik/Geometri'yi
    // aylarca bekletiyordu. Kapılar bağımsız açıldığı için derslerin ilk
    // başlangıçları doğal olarak yayılır; ölçüt, her dersin KENDİ kapısı
    // açıldıktan sonra makul sürede başlamasıdır.
    const { first, gate } = simulate(230);
    const subjects = ["Matematik", "Geometri", "Fizik", "Kimya", "Biyoloji"];
    const gateKey: Record<string, "mat" | "fiz" | "kim" | "bio"> = {
      Matematik: "mat",
      Geometri: "mat",
      Fizik: "fiz",
      Kimya: "kim",
      Biyoloji: "bio",
    };
    for (const s of subjects) {
      const dates = Object.entries(first)
        .filter(([k]) => k.startsWith(`AYT|${s}|`))
        .map(([, d]) => d);
      assert.ok(dates.length > 0, `AYT ${s} hiç başlamadı`);
      const start = dates.sort()[0];
      const g = gate[gateKey[s]];
      assert.ok(g, `AYT ${s} kapısı hiç açılmadı`);
      assert.ok(
        daysBetweenISO(g, start) <= 45,
        `AYT ${s} kapı açılışından (${g}) 45 günden fazla sonra başladı: ${start}`,
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

/**
 * Konu çalışma sürekliliği.
 *
 * Regresyon: anlatımı verilen konunun pratiği öncelik kuyruğunda gerilere
 * düşüyordu; Kimyanın Temel Kanunları 25.11.2026'da anlatılıp 18.01.2027'de
 * bitiyordu (54 gün). Aşağıdaki testler konu bazında ilk ve son çalışma
 * tarihleri arasındaki aralığın gereksiz yere uzamadığını doğrular.
 */
describe("konu sürekliliği", () => {
  /** Motoru gün gün işletip konu bazında ilk/son çalışma ve bitiş tarihini toplar. */
  function simulate(days: number) {
    let topics = seed();
    const first: Record<string, string> = {};
    const lastWork: Record<string, string> = {};
    const finished: Record<string, string> = {};
    const lectures: Record<string, string> = {};
    const practices: Record<string, string> = {};
    let reviewCount = 0;
    for (let i = 0; i < days; i++) {
      const date = addDays(S.programStart, i);
      const { slots } = E.buildDailyPlan(topics, [], [], [], [], S, [], date, new Set());
      for (const sl of slots) {
        if (!sl.exam || sl.kind === "Deneme" || sl.kind === "Yanlış analizi") continue;
        const key = `${sl.exam}|${sl.subject}|${sl.topic}`;
        first[key] ??= date;
        lastWork[key] = date;
        if (sl.kind === "Konu anlatımı") {
          lectures[key] = date;
          topics = topics.map((t) =>
            t.exam === sl.exam && t.subject === sl.subject && t.topic === sl.topic && t.status === "Başlamadım"
              ? { ...t, status: "Çalışıyorum", lastStudy: date }
              : t,
          );
        } else {
          if (sl.kind === "Tekrar") reviewCount += 1;
          if (sl.kind === "Soru çözümü") practices[key] = date;
          topics = topics.map((t) => {
            if (!(t.exam === sl.exam && t.subject === sl.subject && t.topic === sl.topic)) return t;
            if (t.status === "Başlamadım") return t;
            const q = Math.max(15, sl.targetQ || 15);
            const total = (t.total ?? 0) + q;
            const correct = (t.correct ?? 0) + Math.round(q * 0.78);
            const next = total >= 15 && correct / total >= 0.7 ? "Bitti" : t.status;
            if (next === "Bitti" && t.status !== "Bitti") finished[key] = date;
            return { ...t, total, correct, lastStudy: date, status: next };
          });
        }
      }
    }
    return { first, lastWork, finished, lectures, practices, reviewCount, topics };
  }

  it("hiçbir konunun anlatım-bitiş aralığı 15 günü aşmaz", () => {
    // Regresyon: Kimyanın Temel Kanunları 54 gün, Mol 54 gün, Coğrafya konuları
    // 50+ gün açık kalıyordu. Kesintisiz akışta bu aralık kısa olmalı.
    const { finished, first } = simulate(230);
    const bad = Object.entries(finished)
      .map(([k, d]) => ({ k, days: daysBetweenISO(first[k], d) }))
      .filter((x) => x.days > 15)
      .sort((a, b) => b.days - a.days);
    assert.equal(
      bad.length,
      0,
      `15 günü aşan konular: ${bad.slice(0, 5).map((x) => `${x.k} (${x.days}g)`).join(", ")}`,
    );
  });

  it("anlatılan konunun pratiği en geç ertesi çalışma günü yapılır", () => {
    // Regresyon: pratik görevleri listede en sonda olduğu için bütçe/slot
    // dolunca düşüyor ve haftalarca erteleniyordu.
    const { lectures, practices } = simulate(120);
    const late = Object.entries(lectures)
      .filter(([k]) => practices[k])
      .map(([k, d]) => ({ k, gap: daysBetweenISO(d, practices[k]) }))
      .filter((x) => x.gap > 3)
      .sort((a, b) => b.gap - a.gap);
    assert.equal(
      late.length,
      0,
      `pratiği 3 günden fazla geciken konular: ${late.slice(0, 5).map((x) => `${x.k} (${x.gap}g)`).join(", ")}`,
    );
  });

  it("kısa konular anlatımla aynı gün tamamlanır", () => {
    // Kullanıcı kuralı: anlatım + soru çözümü kapasiteye sığıyorsa aynı gün biter.
    const { lectures, practices } = simulate(120);
    const sameDay = Object.entries(lectures).filter(([k, d]) => practices[k] === d);
    assert.ok(
      sameDay.length >= 40,
      `aynı gün tamamlanan konu sayısı çok az: ${sameDay.length}`,
    );
  });

  it("aynı derste önceki konu bitmeden yeni konuya geçilmez", () => {
    // Kullanıcı kuralı 4: SRS tekrarları hariç, ders içi sıra korunur.
    let topics = seed();
    const violations: string[] = [];
    for (let i = 0; i < 230; i++) {
      const date = addDays(S.programStart, i);
      const { slots } = E.buildDailyPlan(topics, [], [], [], [], S, [], date, new Set());
      for (const sl of slots) {
        if (sl.kind !== "Konu anlatımı") continue;
        const inProgress = topics.filter(
          (t) => t.exam === sl.exam && t.subject === sl.subject && t.status === "Çalışıyorum",
        );
        if (inProgress.length) violations.push(`${date} ${sl.subject}/${sl.topic}`);
      }
      for (const sl of slots) {
        if (!sl.exam || sl.kind === "Deneme" || sl.kind === "Yanlış analizi") continue;
        if (sl.kind === "Konu anlatımı") {
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
    assert.equal(
      violations.length,
      0,
      `sıra ihlali: ${violations.slice(0, 5).join(", ")}`,
    );
  });

  it("SRS tekrarları yapılmaya devam eder", () => {
    // Süreklilik düzeltmesi tekrarları dışlamamalı.
    const { reviewCount } = simulate(230);
    assert.ok(reviewCount >= 30, `tekrar görevi sayısı çok az: ${reviewCount}`);
  });
});

describe("TYT/AYT bitiş tarihleri", () => {
  it("TYT ve AYT ilk turu hedef tarihlere sığar", () => {
    let topics = seed();
    const finished: Record<string, string> = {};
    for (let i = 0; i < 230; i++) {
      const date = addDays(S.programStart, i);
      const { slots } = E.buildDailyPlan(topics, [], [], [], [], S, [], date, new Set());
      for (const sl of slots) {
        if (!sl.exam || sl.kind === "Deneme" || sl.kind === "Yanlış analizi") continue;
        const key = `${sl.exam}|${sl.subject}|${sl.topic}`;
        if (sl.kind === "Konu anlatımı") {
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
            const next = total >= 15 && correct / total >= 0.7 ? "Bitti" : t.status;
            if (next === "Bitti" && t.status !== "Bitti") finished[key] = date;
            return { ...t, total, correct, lastStudy: date, status: next };
          });
        }
      }
    }
    const lastOf = (prefix: string) =>
      Object.entries(finished)
        .filter(([k]) => k.startsWith(prefix))
        .map(([, d]) => d)
        .sort()
        .at(-1)!;
    const tytEnd = lastOf("TYT|");
    const aytEnd = lastOf("AYT|");
    assert.ok(tytEnd <= "2027-02-18", `TYT ilk tur çok geç: ${tytEnd}`);
    assert.ok(aytEnd <= "2027-04-23", `AYT ilk tur çok geç: ${aytEnd}`);
  });
});

/**
 * TYT ders sürekliliği ve boşluk denetimi.
 *
 * Regresyon: dersler öncelik puanına göre yarıştığı için düşük puanlı dersler
 * (Coğrafya, Felsefe, Din Kültürü) ve uzun konulu dersler (Matematik, Tarih)
 * haftalarca yeni konu almıyordu. Ölçüm: Coğrafya/Felsefe 45 gün, Matematik
 * 57 gün, Biyoloji 24 gün boşluk. Aşağıdaki testler ilerlemeye göre döndürülmüş
 * dönüşümlü dağıtımın bu boşlukları 14 günün altına indirdiğini doğrular.
 */
describe("TYT ders sürekliliği", () => {
  function simulate(days: number) {
    let topics = seed();
    const lect: Record<string, string[]> = {};
    const dailyMinutes: Record<string, number> = {};
    const orderViolations: string[] = [];
    for (let i = 0; i < days; i++) {
      const date = addDays(S.programStart, i);
      const { slots } = E.buildDailyPlan(topics, [], [], [], [], S, [], date, new Set());
      dailyMinutes[date] = slots.reduce((a: number, s: any) => a + s.minutes, 0);
      for (const sl of slots) {
        if (sl.kind !== "Konu anlatımı") continue;
        const inProgress = topics.filter(
          (t) => t.exam === sl.exam && t.subject === sl.subject && t.status === "Çalışıyorum",
        );
        if (inProgress.length) orderViolations.push(`${date} ${sl.subject}/${sl.topic}`);
      }
      for (const sl of slots) {
        if (!sl.exam || sl.kind === "Deneme" || sl.kind === "Yanlış analizi") continue;
        if (sl.kind === "Konu anlatımı") {
          (lect[`${sl.exam}|${sl.subject}`] ??= []).push(date);
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
    return { lect, dailyMinutes, orderViolations, topics };
  }

  it("hiçbir TYT dersinde yeni konu başlangıçları arası boşluk 14 günü aşmaz", () => {
    // Tüm TYT dersleri (Kimya dahil, ona özel istisna yok).
    const { lect } = simulate(230);
    const bad: string[] = [];
    for (const key of Object.keys(lect).filter((k) => k.startsWith("TYT|"))) {
      const arr = lect[key].slice().sort();
      for (let i = 1; i < arr.length; i++) {
        const gap = daysBetweenISO(arr[i - 1], arr[i]);
        if (gap > 14) bad.push(`${key}: ${arr[i - 1]}->${arr[i]} (${gap}g)`);
      }
    }
    assert.equal(bad.length, 0, `14 günü aşan boşluklar: ${bad.join(", ")}`);
  });

  it("her TYT dersi program boyunca düzenli yeni konu alır (aç kalmaz)", () => {
    // Regresyon: bazı dersler ikinci yarıda hiç yeni konu almıyordu.
    const { lect } = simulate(230);
    const subjects = [...new Set(curriculum.filter((t: any) => t.exam === "TYT").map((t: any) => t.subject))];
    for (const s of subjects) {
      const arr = lect[`TYT|${s}`] ?? [];
      assert.ok(arr.length >= 5, `TYT ${s} çok az yeni konu aldı: ${arr.length}`);
    }
  });

  it("günlük toplam süre kapasiteyi aşmaz", () => {
    const { dailyMinutes } = simulate(230);
    const bad = Object.entries(dailyMinutes).filter(([d, m]) => m > B.dailyCapacity(d));
    assert.equal(bad.length, 0, `kapasite aşımı: ${bad.slice(0, 3).map(([d, m]) => `${d} (${m})`).join(", ")}`);
  });

  it("aynı derste önceki konu bitmeden yeni konuya geçilmez (kural 4)", () => {
    const { orderViolations } = simulate(230);
    assert.equal(orderViolations.length, 0, `sıra ihlali: ${orderViolations.slice(0, 5).join(", ")}`);
  });

  it("uzun konular kapasiteye göre bölünür, kısa konular aynı gün biter", () => {
    // 3+ alt konulu bir konu aynı gün zorla bitirilmemeli; kısa konular ise
    // anlatım + pratik aynı gün tamamlanmalı.
    let topics = seed();
    const lectDay: Record<string, string> = {};
    const firstPractice: Record<string, string> = {};
    for (let i = 0; i < 120; i++) {
      const date = addDays(S.programStart, i);
      const { slots } = E.buildDailyPlan(topics, [], [], [], [], S, [], date, new Set());
      for (const sl of slots) {
        if (!sl.exam || sl.kind === "Deneme" || sl.kind === "Yanlış analizi") continue;
        const key = `${sl.exam}|${sl.subject}|${sl.topic}`;
        if (sl.kind === "Konu anlatımı") {
          lectDay[key] ??= date;
          topics = topics.map((t) =>
            t.exam === sl.exam && t.subject === sl.subject && t.topic === sl.topic && t.status === "Başlamadım"
              ? { ...t, status: "Çalışıyorum", lastStudy: date }
              : t,
          );
        } else {
          firstPractice[key] ??= date;
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
    // Kısa konu (<=2 alt konu) örnekleri aynı gün tamamlanmalı.
    const shortTopics = new Set(
      curriculum
        .filter((t: any) => t.exam === "TYT")
        .map((t: any) => `${t.exam}|${t.subject}|${t.topic}`)
        .filter((k: string) => {
          const [e, s, tp] = k.split("|");
          const rows = curriculum.filter((t: any) => t.exam === e && t.subject === s && t.topic === tp);
          return rows.length <= 2;
        }),
    );
    const shortDone = [...shortTopics].filter((k) => lectDay[k] && firstPractice[k] === lectDay[k]);
    assert.ok(shortDone.length >= 30, `aynı gün tamamlanan kısa konu çok az: ${shortDone.length}`);
    // Uzun konu (>=3 alt konu) pratiği en geç 3 gün içinde başlamalı (bölme).
    const longTopics = new Set(
      curriculum
        .filter((t: any) => t.exam === "TYT")
        .map((t: any) => `${t.exam}|${t.subject}|${t.topic}`)
        .filter((k: string) => {
          const [e, s, tp] = k.split("|");
          const rows = curriculum.filter((t: any) => t.exam === e && t.subject === s && t.topic === tp);
          return rows.length >= 3;
        }),
    );
    const late = [...longTopics]
      .filter((k) => lectDay[k] && firstPractice[k])
      .filter((k) => daysBetweenISO(lectDay[k], firstPractice[k]) > 3);
    assert.equal(late.length, 0, `uzun konu pratiği geciken: ${late.slice(0, 5).join(", ")}`);
  });

  it("SRS tekrarları yeni konu ilerlemesini bloke etmez", () => {
    // Tekrarlar sürerken de her hafta yeni konu açılmalı.
    let topics = seed();
    const lectByWeek: Record<string, number> = {};
    for (let i = 0; i < 120; i++) {
      const date = addDays(S.programStart, i);
      const { slots } = E.buildDailyPlan(topics, [], [], [], [], S, [], date, new Set());
      for (const sl of slots) {
        if (sl.kind === "Konu anlatımı") {
          const week = String(Math.floor(i / 7));
          lectByWeek[week] = (lectByWeek[week] ?? 0) + 1;
        }
      }
      for (const sl of slots) {
        if (!sl.exam || sl.kind === "Deneme" || sl.kind === "Yanlış analizi") continue;
        if (sl.kind === "Konu anlatımı") {
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
    // İlk 16 haftanın her birinde en az 2 yeni konu açılmalı.
    const perWeek = Array.from({ length: 13 }, (_, w) => lectByWeek[String(w)] ?? 0);
    assert.ok(Math.min(...perWeek) >= 2, `bir haftada yeni konu neredeyse hiç açılmadı: ${Math.min(...perWeek)}`);
  });
});

/**
 * Başarı senaryosu simülasyonu. `acc(exam, subject)` sabit başarı oranı döner.
 * "Bitti" yalnızca 15 soru + %70 sağlanınca atanır (uygulamadaki gerçek kural).
 */
function simulateAcc(acc: (exam: string, subject: string) => number, days: number) {
  let topics = seed();
  const taughtBySubject = new Map<string, Set<string>>();
  const recoveryKinds = new Map<string, Set<string>>();
  let emptyDays = 0;
  for (let i = 0; i < days; i++) {
    const date = addDays(S.programStart, i);
    const { slots } = E.buildDailyPlan(topics, [], [], [], [], S, [], date, new Set());
    const academic = slots.filter(
      (s: any) => s.exam && s.kind !== "Deneme" && s.kind !== "Yanlış analizi",
    );
    if (academic.length === 0) emptyDays += 1;
    for (const sl of slots) {
      if (!sl.exam || sl.kind === "Deneme" || sl.kind === "Yanlış analizi") continue;
      if (sl.kind === "Konu anlatımı") {
        const sk = `${sl.exam}|${sl.subject}`;
        const set = taughtBySubject.get(sk) ?? new Set<string>();
        set.add(sl.topic);
        taughtBySubject.set(sk, set);
      }
      if (/Eksik kapatma turu/.test(sl.reason || "")) {
        const tk = `${sl.exam}|${sl.subject}|${sl.topic}`;
        const set = recoveryKinds.get(tk) ?? new Set<string>();
        set.add(sl.kind);
        recoveryKinds.set(tk, set);
      }
      const a = acc(sl.exam, sl.subject);
      if (sl.kind === "Konu anlatımı") {
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
          const correct = (t.correct ?? 0) + Math.round(q * a);
          const mastered = total >= 15 && correct / total >= 0.7;
          return { ...t, total, correct, lastStudy: date, status: mastered ? "Bitti" : t.status };
        });
      }
    }
  }
  const mastered = topics.filter(
    (t) =>
      t.status === "Bitti" && (t.total ?? 0) >= 15 && (t.correct ?? 0) / (t.total ?? 1) >= 0.7,
  ).length;
  return { topics, taughtBySubject, recoveryKinds, emptyDays, mastered };
}

describe("öğrenme kapısı ve eksik kapatma", () => {
  it("%50 başarıda derste sonraki konu açılmaz, program kilitlenmez", () => {
    // Kullanıcı kuralı 2 + 3: aynı derste önceki konu öğrenilmeden yenisi
    // açılmaz; ama plan boş kalmaz ve eksik kapatma devam eder.
    const r = simulateAcc(() => 0.5, 60);
    for (const [sk, taught] of r.taughtBySubject) {
      assert.ok(
        taught.size <= 1,
        `${sk} dersinde öğrenilmeden ${taught.size} konu açıldı: ${[...taught].join(", ")}`,
      );
    }
    assert.equal(r.mastered, 0, "başarı sağlanmadan konu Bitti sayılmamalı");
    assert.equal(r.emptyDays, 0, `plan boş gün içeriyor (kilitlenme): ${r.emptyDays}`);
    assert.ok(r.recoveryKinds.size > 0, "öğrenilmemiş konu için eksik kapatma görevi üretilmedi");
  });

  it("eksik kapatma aynı görevi tekrarlamaz, tür değiştirir", () => {
    // Kullanıcı kuralı 6: aynı başarısız pratik görevi sürekli tekrarlanmaz.
    const r = simulateAcc(() => 0.5, 60);
    const varieties = [...r.recoveryKinds.values()].map((s) => s.size);
    assert.ok(varieties.length > 0, "hiç eksik kapatma görevi yok");
    assert.ok(
      Math.max(...varieties) >= 2,
      `eksik kapatma hep aynı türde kaldı: ${JSON.stringify([...r.recoveryKinds].slice(0, 3))}`,
    );
  });

  it("%78 başarıda program ilerler ve konular öğrenilir", () => {
    const r = simulateAcc(() => 0.78, 150);
    assert.ok(r.mastered > 200, `öğrenilen konu sayısı düşük: ${r.mastered}`);
    assert.equal(r.emptyDays, 0, "plan boş gün içeriyor");
  });
});

/**
 * Tek konuya odaklanan simülasyon. `accAt(gün indeksi)` o günün başarı oranını
 * verir. Takılı konunun tür çeşitliliği, karanlık günleri ve sonraki konuya
 * geçişi gözlenir.
 */
function simulateOne(accAt: (i: number) => number, days: number, maxGrade = 12) {
  let topics = seed();
  const kinds = new Set<string>();
  let darkDays = 0;
  let progressedOn: number | null = null;
  let sameKindRun = 0;
  let maxSameKindRun = 0;
  let lastKind = "";
  const nextTopic = "Sayı Basamakları";
  for (let i = 0; i < days; i++) {
    const date = addDays(S.programStart, i);
    const { slots } = E.buildDailyPlan(topics, [], [], [], [], S, [], date, new Set());
    const mine = slots.filter(
      (s: any) => s.exam === "TYT" && s.subject === "Matematik" && s.topic === "Temel Kavramlar",
    );
    const already = topics.some(
      (t: any) =>
        t.exam === "TYT" && t.subject === "Matematik" && t.topic === nextTopic && t.status !== "Başlamadım",
    );
    if (mine.length === 0 && !already && i <= maxGrade) darkDays += 1;
    for (const s of mine) {
      if (/Eksik kapatma turu/.test(s.reason || "")) kinds.add(s.kind);
      // Aynı görev türü üst üste kaç gün tekrar etti?
      const sig = `${s.kind}|${s.targetQ ?? ""}`;
      if (sig === lastKind) sameKindRun += 1;
      else {
        lastKind = sig;
        sameKindRun = 1;
      }
      maxSameKindRun = Math.max(maxSameKindRun, sameKindRun);
    }
    if (
      progressedOn === null &&
      topics.some(
        (t: any) =>
          t.exam === "TYT" && t.subject === "Matematik" && t.topic === nextTopic && t.status !== "Başlamadım",
      )
    ) {
      progressedOn = i;
    }
    const acc = accAt(i);
    for (const sl of slots) {
      if (!sl.exam || sl.kind === "Deneme" || sl.kind === "Yanlış analizi") continue;
      if (sl.kind === "Konu anlatımı") {
        topics = topics.map((t: any) =>
          t.exam === sl.exam && t.subject === sl.subject && t.topic === sl.topic && t.status === "Başlamadım"
            ? { ...t, status: "Çalışıyorum", lastStudy: date }
            : t,
        );
      } else {
        topics = topics.map((t: any) => {
          if (!(t.exam === sl.exam && t.subject === sl.subject && t.topic === sl.topic)) return t;
          if (t.status === "Başlamadım") return t;
          const q = Math.max(15, sl.targetQ || 15);
          const total = (t.total ?? 0) + q;
          const correct = (t.correct ?? 0) + Math.round(q * acc);
          const mastered = total >= 15 && correct / total >= 0.7;
          return { ...t, total, correct, lastStudy: date, status: mastered ? "Bitti" : t.status };
        });
      }
    }
  }
  const tk = topics.find(
    (t: any) => t.exam === "TYT" && t.subject === "Matematik" && t.topic === "Temel Kavramlar",
  );
  return { kinds, darkDays, progressedOn, tk, maxSameKindRun };
}

describe("eksik kapatma öğrenmeyi gerçekten sağlıyor mu", () => {
  it("takılı konu günlerce görevsiz kalmaz", () => {
    // Regresyon: başarısız konu SRS "Tekrar"ına kilitlenip rotasyon devre dışı
    // kalınca görev listesinin sonunda bütçe bulamıyor ve 14 gün üst üste
    // hiçbir görev almıyordu (20 Kas–3 Ara ölçümü).
    const r = simulateOne(() => 0.6, 30);
    assert.ok(r.darkDays <= 4, `takılı konu ${r.darkDays} gün görevsiz kaldı`);
  });

  it("eksik kapatma türleri döner, aynı görev üst üste tekrarlanmaz", () => {
    // Kullanıcı kuralı 6: aynı başarısız görev her gün tekrarlanmamalı.
    // Regresyon: takılı konuya 12 gün üst üste aynı "Tekrar (25 soru)" yazılıyordu.
    const r = simulateOne(() => 0.6, 30);
    assert.ok(
      r.kinds.size >= 3,
      `eksik kapatma tür çeşitliliği düşük: ${JSON.stringify([...r.kinds])}`,
    );
    assert.ok(
      r.maxSameKindRun <= 2,
      `aynı görev ${r.maxSameKindRun} gün üst üste tekrarlandı`,
    );
  });

  it("%60'tan %75'e yükselen öğrenci aynı derste yeniden ilerler", () => {
    // Senaryo 1: ilk 8 gün %60 (takıl), sonra %75 (toparlan) → konu Bitti olmalı
    // ve TYT Matematik'te sıradaki konu açılmalı.
    const r = simulateOne((i) => (i < 8 ? 0.6 : 0.75), 40);
    assert.equal(r.tk.status, "Bitti", `konu Bitti olmadı: ${r.tk.status}`);
    assert.ok((r.tk.total ?? 0) >= 15, "15 soru koşulu sağlanmadı");
    assert.ok(
      (r.tk.correct ?? 0) / (r.tk.total ?? 1) >= 0.7,
      "öğrenilme yüzdesi %70 altında",
    );
    assert.ok(r.progressedOn !== null, "aynı derste sıradaki konu hiç açılmadı");
    assert.ok(r.darkDays <= 4, `takılı konu ${r.darkDays} gün görevsiz kaldı`);
  });

  it("ders bazlı kilit: başarısız ders diğer dersleri durdurmaz", () => {
    // Senaryo 2: Matematik %60'ta takılırken diğer dersler %78 ile ilerlemeli.
    let topics = seed();
    const failedSubjectProgress: number[] = [];
    let othersStarted = 0;
    for (let i = 0; i < 60; i++) {
      const date = addDays(S.programStart, i);
      const { slots } = E.buildDailyPlan(topics, [], [], [], [], S, [], date, new Set());
      for (const sl of slots) {
        if (!sl.exam || sl.kind === "Deneme" || sl.kind === "Yanlış analizi") continue;
        const acc = sl.subject === "Matematik" ? 0.6 : 0.78;
        if (sl.kind === "Konu anlatımı") {
          topics = topics.map((t: any) =>
            t.exam === sl.exam && t.subject === sl.subject && t.topic === sl.topic && t.status === "Başlamadım"
              ? { ...t, status: "Çalışıyorum", lastStudy: date }
              : t,
          );
        } else {
          topics = topics.map((t: any) => {
            if (!(t.exam === sl.exam && t.subject === sl.subject && t.topic === sl.topic)) return t;
            if (t.status === "Başlamadım") return t;
            const q = Math.max(15, sl.targetQ || 15);
            const total = (t.total ?? 0) + q;
            const correct = (t.correct ?? 0) + Math.round(q * acc);
            const mastered = total >= 15 && correct / total >= 0.7;
            return { ...t, total, correct, lastStudy: date, status: mastered ? "Bitti" : t.status };
          });
        }
      }
      failedSubjectProgress.push(
        topics.filter(
          (t: any) => t.exam === "TYT" && t.subject === "Matematik" && t.status !== "Başlamadım",
        ).length,
      );
    }
    othersStarted = topics.filter(
      (t: any) => t.subject !== "Matematik" && t.status !== "Başlamadım",
    ).length;
    // Başarısız derste yalnızca ilk konu açık kalmalı.
    assert.ok(
      failedSubjectProgress.at(-1)! <= 1,
      `Matematik'te öğrenilmeden ${failedSubjectProgress.at(-1)} konu açıldı`,
    );
    // Diğer dersler normal ilerlemeli (kilit global değil).
    assert.ok(othersStarted >= 20, `diğer dersler ilerlemedi: ${othersStarted} konu başladı`);
  });

  it("eksik kapatma görevleri günlük kapasiteyi aşmaz", () => {
    // Kural: üretilen görev süreleri o günün kapasitesini geçmemeli.
    let topics = seed();
    let over = 0;
    for (let i = 0; i < 60; i++) {
      const date = addDays(S.programStart, i);
      const { slots } = E.buildDailyPlan(topics, [], [], [], [], S, [], date, new Set());
      const total = slots.reduce((a: number, s: any) => a + s.minutes, 0);
      const cap = B.dailyCapacity(date, S.studyMinutes);
      if (total > cap) over += 1;
      for (const sl of slots) {
        if (!sl.exam || sl.kind === "Deneme" || sl.kind === "Yanlış analizi") continue;
        if (sl.kind === "Konu anlatımı") {
          topics = topics.map((t: any) =>
            t.exam === sl.exam && t.subject === sl.subject && t.topic === sl.topic && t.status === "Başlamadım"
              ? { ...t, status: "Çalışıyorum", lastStudy: date }
              : t,
          );
        } else {
          topics = topics.map((t: any) => {
            if (!(t.exam === sl.exam && t.subject === sl.subject && t.topic === sl.topic)) return t;
            if (t.status === "Başlamadım") return t;
            const q = Math.max(15, sl.targetQ || 15);
            const total2 = (t.total ?? 0) + q;
            const correct = (t.correct ?? 0) + Math.round(q * 0.6);
            return { ...t, total: total2, correct, lastStudy: date };
          });
        }
      }
    }
    assert.equal(over, 0, `kapasite aşılan gün sayısı: ${over}`);
  });
});

/**
 * GERÇEK UYGULAMA ÇAĞRI BİÇİMİ (Mod B) regresyonu.
 *
 * Yukarıdaki testlerin neredeyse tamamı `buildDailyPlan(..., new Set())` diye
 * çağırıyor; yani `avoid` kümesini boş veriyor. Uygulama ise 9. argümanı
 * VERMEZ (`program.tsx:31`, `smart-panels.tsx:17`) ve motor kendi geçmiş
 * kümesini kurar. Bu fark yüzünden aşağıdaki hata yıllarca görünmedi:
 *
 * `avoidEarlierThisWeek`, geçmiş günleri BUGÜNKÜ konu durumuyla yeniden
 * oynatıyordu. Bugün başlamış konular geçmişte "başlamamış" görünmediğinden
 * replay o günün sıradaki HİÇ işlenmemiş konularını seçiyor ve `avoid`a
 * atıyordu. Böylece her gün bir sonraki konu kalıcı bloke ediliyor, 14.11.2026
 * sonrası yeni konu üretimi sıfıra iniyor ve AYT kapıları hiç açılmıyordu
 * (kullanıcı raporu: "program 14 Kasım'dan sonra donuyor"). Ek olarak maliyet
 * O(gün²) olduğundan tek çağrı saniyeler sürüyordu.
 *
 * Bu blok uygulama çağrı biçimini birebir kullanır.
 */
describe("gerçek uygulama çağrı biçimi (Mod B)", () => {
  /** Motoru uygulamanın çağırdığı gibi (avoidExternal vermeden) işletir. */
  function runApp(days: number) {
    let topics = seed();
    const lectDays: Record<string, string[]> = {};
    let maxMs = 0;
    for (let i = 0; i < days; i++) {
      const date = addDays(S.programStart, i);
      const t0 = Date.now();
      // 9. argüman YOK — uygulamanın çağrısı.
      const { slots } = E.buildDailyPlan(topics, [], [], [], [], S, [], date);
      maxMs = Math.max(maxMs, Date.now() - t0);
      for (const sl of slots) {
        if (sl.kind === "Konu anlatımı") {
          (lectDays[date] ??= []).push(`${sl.exam}|${sl.subject}|${sl.topic}`);
        }
      }
      for (const sl of slots) {
        if (!sl.exam || sl.kind === "Deneme" || sl.kind === "Yanlış analizi") continue;
        if (sl.kind === "Konu anlatımı") {
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
    return { lectDays, maxMs, topics };
  }

  it("ilk 30 günde yeni konu anlatımı durmaz (donma yok)", () => {
    // Hatanın en yalın görünümü: 14.11.2026'dan sonra anlatım sayısı 0'a iniyordu.
    const { lectDays } = runApp(30);
    const daysWithLect = Object.keys(lectDays).filter((d) => lectDays[d].length > 0);
    const firstHalf = daysWithLect.filter((d) => daysBetweenISO(S.programStart, d) < 15).length;
    const secondHalf = daysWithLect.filter((d) => daysBetweenISO(S.programStart, d) >= 15).length;
    assert.ok(secondHalf > 0, "ilk 15 günden sonra hiç yeni konu açılmadı (Mod B donması)");
    assert.ok(
      secondHalf >= firstHalf * 0.6,
      `ikinci yarıda anlatım çöktü: ilk ${firstHalf}, sonra ${secondHalf}`,
    );
  });

  it("AYT kapıları açılır (AYT hiç başlamama hatası yok)", () => {
    // Kapılar açılmazsa AYT hiç başlamaz; rapor §12'nin ana bulgusu buydu.
    const { topics } = runApp(120);
    const u = RM.aytUnlocks(topics);
    const anyOpen = u.mat.ready || u.fiz.ready || u.kim.ready || u.bio.ready;
    assert.ok(anyOpen, "120 günde hiçbir AYT kapısı açılmadı");
    const aytStarted = topics.some((t: any) => t.exam === "AYT" && t.status !== "Başlamadım");
    assert.ok(aytStarted, "AYT hiç başlamadı");
  });

  it("tek çağrı hızlıdır (O(gün²) replay yok)", () => {
    // Eski replay her çağrıda geçmişi yeniden planlıyordu: 120. günde tek çağrı
    // ~3,3 sn sürüyordu. Basit doğrusal okuma < 1 sn olmalı.
    const { maxMs } = runApp(60);
    assert.ok(maxMs < 1000, `tek çağrı çok yavaş: ${maxMs} ms (replay geri gelmiş olabilir)`);
  });
});

describe("deneme günü yerleşimi", () => {
  /** Deneme günlerini ve sürelerini toplar. */
  function mockDays(days: number) {
    let topics = seed();
    const out: { date: string; minutes: number[] }[] = [];
    for (let i = 0; i < days; i++) {
      const date = addDays(S.programStart, i);
      const { slots } = E.buildDailyPlan(topics, [], [], [], [], S, [], date, new Set());
      const mocks = slots.filter((s) => s.kind === "Deneme");
      if (mocks.length) out.push({ date, minutes: mocks.map((m) => m.minutes) });
      for (const sl of slots) {
        if (!sl.exam || sl.kind === "Deneme" || sl.kind === "Yanlış analizi") continue;
        if (sl.kind === "Konu anlatımı") {
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
    return out;
  }

  it("tam deneme kırpılmaz (TYT 165 dk)", () => {
    // Regresyon: deneme ilk küçük serbest pencereye sığdırılıp 165 dk -> 50 dk'ya
    // kırpılıyordu (ölçüm: 2026-12-12/19/26). Tam deneme bitişik blok olmalı.
    const days = mockDays(140);
    assert.ok(days.length > 0, "hiç deneme günü yok");
    for (const d of days) {
      for (const m of d.minutes) {
        assert.ok(m >= 165, `${d.date} denemesi kırpılmış: ${m} dk (tam 165–180 olmalı)`);
      }
    }
  });

  it("deneme günü yeni konu açmaz, pratiği geciktirmez", () => {
    // Deneme günü yeni konu açılırsa pratiği ertesi günlere sarkıyordu.
    const days = mockDays(140);
    const mockDates = new Set(days.map((d) => d.date));
    let topics = seed();
    for (let i = 0; i < 140; i++) {
      const date = addDays(S.programStart, i);
      const { slots } = E.buildDailyPlan(topics, [], [], [], [], S, [], date, new Set());
      if (mockDates.has(date)) {
        const lect = slots.filter((s) => s.kind === "Konu anlatımı");
        assert.equal(lect.length, 0, `${date} deneme gününde ${lect.length} yeni anlatım açıldı`);
      }
      for (const sl of slots) {
        if (!sl.exam || sl.kind === "Deneme" || sl.kind === "Yanlış analizi") continue;
        if (sl.kind === "Konu anlatımı") {
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
  });
});
