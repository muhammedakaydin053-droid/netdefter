# NetDefter — Denetim için Kritik Kaynak Dosyaları

GPT-6 bağımsız incelemesi için. Her dosya tam içeriğiyle. Denetim raporu: DENETIM-RAPORU.md

## FILE: app/src/lib/smart/progress.ts
```ts
/**
 * Ağırlıklı konu ilerlemesi ve öğrenme durumu — saf fonksiyonlar.
 *
 * Neden ağırlık: konu sayısını toplam konu sayısına bölmek yanıltıcı. TYT
 * Türkçe'de Paragraf tek başına ~26 soru, bazı konular 1 soru. İkisini eşit
 * saymak ilerlemeyi olduğundan hızlı gösterir.
 *
 * Ağırlık ÖSYM kitapçıklarından derlenen `distribution.ts` verisinden gelir.
 * Güvenilir dağılım yoksa ağırlık UYDURULMAZ; eşit ağırlığa düşülür ve bu
 * `weighted: false` ile bildirilir.
 */

export type LearningStage =
  | "gorulmedi"
  | "anlatim"
  | "temel-soru"
  | "ogrenildi"
  | "tekrar-gerekli";

export const STAGE_LABEL: Record<LearningStage, string> = {
  gorulmedi: "Görülmedi",
  anlatim: "Konu anlatımı görüldü",
  "temel-soru": "Temel soru çözümü yapıldı",
  ogrenildi: "Öğrenildi, karma soruda uygulanabiliyor",
  "tekrar-gerekli": "Tekrar gerekiyor",
};

/** Bir konu satırından öğrenme aşamasını çıkarır. */
export function learningStage(row: {
  status: string;
  total: number | null;
  correct: number | null;
}): LearningStage {
  if (row.status === "Tekrar Gerekli") return "tekrar-gerekli";
  const total = row.total ?? 0;
  const correct = row.correct ?? 0;
  if (row.status === "Bitti") {
    // "Bitti" tek başına öğrenildi demek değil: temel soru çözümü şart.
    if (total >= MIN_QUESTIONS_FOR_MASTERED && total > 0 && correct / total >= MASTERY_RATIO) {
      return "ogrenildi";
    }
    return total > 0 ? "temel-soru" : "anlatim";
  }
  if (row.status === "Çalışıyorum") return total > 0 ? "temel-soru" : "anlatim";
  return total > 0 ? "temel-soru" : "gorulmedi";
}

/**
 * "Öğrenildi" için gereken asgari soru sayısı ve başarı oranı.
 *
 * Tek kaynak: hem `learningStage` hem `explainStage` bu sabitleri kullanır, böylece
 * arayüzdeki açıklama ile hesaplanan aşama asla çelişemez. Değerler mevcut
 * davranıştan alındı, değiştirilmedi. Gerekçesi kodda belgelenmemişti; bu sayılar
 * "yeterli örnek görmeden öğrenilmiş sayma" tercihini yansıtır, doğrulanmış bir
 * pedagojik standart değildir.
 */
export const MIN_QUESTIONS_FOR_MASTERED = 15;
export const MASTERY_RATIO = 0.7;

export interface StageExplanation {
  /** Konu "Bitti" olarak işaretlenmiş mi. */
  completed: boolean;
  /** Asgari soru sayısı karşılandı mı. */
  enoughQuestions: boolean;
  /** Başarı oranı hedefi karşılandı mı. */
  enoughSuccess: boolean;
  /** `learningStage` ile birebir aynı sonuç: öğrenildi sayılıyor mu. */
  mastered: boolean;
  /** Soru sayısı / başarı oranı gibi sayısal ayrıntı. */
  total: number;
  correct: number;
  ratio: number;
  /** Kullanıcıya gösterilecek tek cümle. */
  summary: string;
  /** Karşılanmayan koşulların kısa listesi. */
  missing: string[];
}

/**
 * Bir konunun neden öğrenildi sayıldığını (veya sayılmadığını) açıklar.
 *
 * Bu fonksiyon HESAPLAMA YAPMAZ ve hiçbir şeyi değiştirmez; yalnızca mevcut
 * koşulları ayrı ayrı görünür kılar. `mastered` alanı `learningStage` ile
 * birebir tutarlıdır (test edilir).
 */
export function explainStage(row: {
  status: string;
  total: number | null;
  correct: number | null;
}): StageExplanation {
  const total = row.total ?? 0;
  const correct = row.correct ?? 0;
  const ratio = total > 0 ? correct / total : 0;
  const completed = row.status === "Bitti";
  const enoughQuestions = total >= MIN_QUESTIONS_FOR_MASTERED;
  const enoughSuccess = total > 0 && ratio >= MASTERY_RATIO;
  const mastered = completed && enoughQuestions && enoughSuccess;

  const pct = Math.round(ratio * 100);
  const targetPct = Math.round(MASTERY_RATIO * 100);
  const missing: string[] = [];
  if (!completed) missing.push("konu tamamlandı olarak işaretlenmedi");
  if (!enoughQuestions) missing.push(`yeterli soru verisi yok (${total}/${MIN_QUESTIONS_FOR_MASTERED})`);
  if (!enoughSuccess) missing.push(`başarı oranı düşük (%${pct} < %${targetPct})`);

  let summary: string;
  if (mastered) {
    summary = `Öğrenildi sayıldı: ${correct}/${total} doğru (%${pct}), asgari ${MIN_QUESTIONS_FOR_MASTERED} soru karşılandı.`;
  } else if (completed && enoughSuccess && !enoughQuestions) {
    // GPT-6'nın istediği ayrım: başarı yeterli, ama örnek az.
    summary = `Başarı oranı yeterli (%${pct}), ancak öğrenildi sayılmak için yeterli soru verisi yok (${total}/${MIN_QUESTIONS_FOR_MASTERED}).`;
  } else if (completed && enoughQuestions && !enoughSuccess) {
    summary = `Soru sayısı yeterli (${total}), ancak başarı oranı hedefin altında (%${pct} < %${targetPct}).`;
  } else if (completed) {
    summary = `Öğrenildi için iki koşul da eksik: soru ${total}/${MIN_QUESTIONS_FOR_MASTERED}, başarı %${pct}.`;
  } else if (row.status === "Tekrar Gerekli") {
    summary = "Tekrar gerekiyor; öğrenildi sayılmaz.";
  } else if (row.status === "Çalışıyorum") {
    summary = total > 0 ? "Çalışılıyor, temel soru çözümü var." : "Çalışılıyor, henüz soru verisi yok.";
  } else {
    summary = total > 0 ? "Başlanmadı olarak işaretli, soru verisi var." : "Henüz başlanmadı.";
  }

  return {
    completed,
    enoughQuestions,
    enoughSuccess,
    mastered,
    total,
    correct,
    ratio,
    summary,
    missing,
  };
}

/** Aşamanın ilerlemeye katkısı (0–1). Konu anlatımı tek başına tam sayılmaz. */
const STAGE_CREDIT: Record<LearningStage, number> = {
  gorulmedi: 0,
  anlatim: 0.35,
  "temel-soru": 0.6,
  ogrenildi: 1,
  "tekrar-gerekli": 0.5,
};

export function stageCredit(stage: LearningStage): number {
  return STAGE_CREDIT[stage];
}

export interface WeightInput {
  /** Konu için ağırlık; bilinmiyorsa null. */
  weight: number | null;
  stage: LearningStage;
}

export interface ProgressResult {
  /** 0–1 arası ilerleme. */
  progress: number;
  /** Ağırlıklı hesaplandı mı? false ise eşit ağırlık kullanıldı. */
  weighted: boolean;
  /** Öğrenilmiş sayılan konu sayısı (aşama = ogrenildi). */
  mastered: number;
  total: number;
}

/**
 * Ağırlıklı ilerleme.
 *
 * `weighted` yalnızca tüm girdilerde ağırlık varsa true olur. Eksik ağırlık
 * varsa uydurmak yerine eşit ağırlığa düşülür.
 */
export function weightedProgress(items: WeightInput[]): ProgressResult {
  const total = items.length;
  if (!total) return { progress: 0, weighted: false, mastered: 0, total: 0 };
  const mastered = items.filter((i) => i.stage === "ogrenildi").length;
  const hasAll = items.every((i) => i.weight != null && i.weight > 0);
  const weightOf = (i: WeightInput) => (hasAll ? (i.weight as number) : 1);
  const sum = items.reduce((a, i) => a + weightOf(i), 0);
  if (sum <= 0) return { progress: 0, weighted: false, mastered, total };
  const earned = items.reduce((a, i) => a + weightOf(i) * stageCredit(i.stage), 0);
  return { progress: earned / sum, weighted: hasAll, mastered, total };
}
```

## FILE: app/src/lib/smart/progress.test.ts
```ts
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
```

## FILE: app/src/lib/smart/explain.test.ts
```ts
/**
 * `explainStage` tutarlılık testleri.
 *
 * Arayüzdeki açıklama metinleri ile `learningStage` hesabı asla çelişmemeli.
 * En kritik kural: `explainStage(...).mastered` ile
 * `learningStage(...) === "ogrenildi"` her girdide aynı olmalı. Ayrıca
 * `gateBlockers`'ın döndürdüğü liste, `aytUnlocks`'un saydığı eksiklerle
 * uyuşmalı.
 *
 * `vite` ile yüklenir çünkü roadmap `@/` takma adı kullanır.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type ViteDevServer } from "vite";

let server: ViteDevServer;
let P: any, R: any;

before(async () => {
  server = await createServer({ server: { middlewareMode: true }, logLevel: "silent" });
  P = await server.ssrLoadModule("/src/lib/smart/progress.ts");
  R = await server.ssrLoadModule("/src/data/roadmap.ts");
});

after(async () => {
  await server?.close();
});

const STATUSES = ["Başlamadım", "Çalışıyorum", "Bitti", "Tekrar Gerekli"];

describe("explainStage — learningStage ile tutarlılık", () => {
  it("mastered alanı her girdide learningStage ile aynı", () => {
    const totals = [null, 0, 1, 5, 10, 13, 14, 15, 16, 20, 30];
    let checked = 0;
    for (const status of STATUSES) {
      for (const total of totals) {
        for (const correct of [null, 0, 1, Math.floor((total ?? 0) / 2), total ?? 0]) {
          if (correct != null && total != null && correct > total) continue;
          const row = { status, total, correct };
          const stage = P.learningStage(row);
          const ex = P.explainStage(row);
          assert.equal(
            ex.mastered,
            stage === "ogrenildi",
            `uyuşmazlık: ${JSON.stringify(row)} -> stage=${stage}, mastered=${ex.mastered}`,
          );
          checked++;
        }
      }
    }
    assert.ok(checked > 100, `yeterli örnek taranmadı: ${checked}`);
  });

  it("eşikler tek kaynaktan gelir ve beklenen değerlerdir", () => {
    assert.equal(P.MIN_QUESTIONS_FOR_MASTERED, 15);
    assert.equal(P.MASTERY_RATIO, 0.7);
  });

  it("14/14 için başarı yeterli ama soru yetersiz mesajı verir", () => {
    const ex = P.explainStage({ status: "Bitti", total: 14, correct: 14 });
    assert.equal(ex.completed, true);
    assert.equal(ex.enoughSuccess, true, "başarı yeterli olmalı");
    assert.equal(ex.enoughQuestions, false, "soru yetersiz olmalı");
    assert.equal(ex.mastered, false);
    assert.match(ex.summary, /yeterli soru verisi yok/);
    assert.ok(ex.missing.some((m: string) => m.includes("yeterli soru verisi yok")));
  });

  it("15/15 için öğrenildi mesajı verir", () => {
    const ex = P.explainStage({ status: "Bitti", total: 15, correct: 15 });
    assert.equal(ex.mastered, true);
    assert.match(ex.summary, /Öğrenildi sayıldı/);
    assert.equal(ex.missing.length, 0);
  });

  it("13/20 için başarı düşük mesajı verir", () => {
    const ex = P.explainStage({ status: "Bitti", total: 20, correct: 13 });
    assert.equal(ex.enoughQuestions, true);
    assert.equal(ex.enoughSuccess, false);
    assert.equal(ex.mastered, false);
    assert.match(ex.summary, /başarı oranı hedefin altında/);
  });

  it("soru verisi olmayan 'Bitti' konuyu anlatım aşamasında bırakır", () => {
    const ex = P.explainStage({ status: "Bitti", total: null, correct: null });
    assert.equal(ex.mastered, false);
    assert.equal(ex.enoughQuestions, false);
    assert.equal(ex.enoughSuccess, false);
    assert.equal(P.learningStage({ status: "Bitti", total: null, correct: null }), "anlatim");
  });
});

describe("gateBlockers — kapıyı kapatan konular", () => {
  it("kapı açıkken hiç engel döndürmez", () => {
    const curr = [
      ...R.MAT_AYT_GATE.map((topic: string) => ({
        exam: "TYT",
        subject: "Matematik",
        topic,
        subtopic: "alt",
        status: "Bitti",
        total: 20,
        correct: 18,
        wrong: 2,
      })),
    ];
    const blockers = R.gateBlockers(curr, "Matematik", R.MAT_AYT_GATE);
    assert.equal(blockers.length, 0, `beklenmeyen engel: ${blockers.map((b: any) => b.topic).join(", ")}`);
  });

  it("eksik konuları adlarıyla ve gerekçesiyle listeler", () => {
    const rows = [
      { exam: "TYT", subject: "Matematik", topic: "Temel Kavramlar", subtopic: "alt", status: "Bitti", total: 20, correct: 18, wrong: 2 },
      { exam: "TYT", subject: "Matematik", topic: "Sayı Basamakları", subtopic: "alt", status: "Bitti", total: 14, correct: 14, wrong: 0 },
    ];
    const blockers = R.gateBlockers(rows, "Matematik", R.MAT_AYT_GATE);
    // 1 konu tamam, 1 konu soru sayısı yetersiz, kalanı hiç yok.
    const names = blockers.map((b: any) => b.topic);
    assert.ok(!names.includes("Temel Kavramlar"), "tamamlanan konu engel olmamalı");
    assert.ok(names.includes("Sayı Basamakları"), "yetersiz konu engel olmalı");
    const sb = blockers.find((b: any) => b.topic === "Sayı Basamakları");
    assert.match(sb.reason, /yeterli soru verisi yok/);
    assert.equal(sb.total, 14);
  });

  it("engel sayısı aytUnlocks eksik sayısıyla tutarlı", () => {
    const rows = [
      { exam: "TYT", subject: "Matematik", topic: "Temel Kavramlar", subtopic: "alt", status: "Bitti", total: 20, correct: 18, wrong: 2 },
    ];
    const blockers = R.gateBlockers(rows, "Matematik", R.MAT_AYT_GATE);
    const unlocks = R.aytUnlocks(rows as any);
    assert.equal(
      blockers.length,
      unlocks.mat.total - unlocks.mat.done,
      `engel ${blockers.length}, aytUnlocks eksik ${unlocks.mat.total - unlocks.mat.done}`,
    );
  });

  it("müfredatta olmayan kapı konusunu bildirir", () => {
    const blockers = R.gateBlockers([], "Matematik", ["Temel Kavramlar"]);
    assert.equal(blockers.length, 1);
    assert.match(blockers[0].reason, /bulunamadı/);
  });
});
```

## FILE: app/src/lib/smart/budget.ts
```ts
/**
 * Günlük görev bütçesi matematiği — saf fonksiyonlar.
 *
 * Ayrı dosyada tutulmasının nedeni test edilebilirlik: burada `@/` takma adı
 * veya JSON importu yok, `node --test` doğrudan yükleyebilir.
 */

export interface BudgetSplit {
  /** Yeni konu anlatımına ayrılan asgari dakika. */
  newTopicReserve: number;
  /** Tekrarlara harcanabilecek en fazla dakika. */
  reviewCap: number;
}

/** Yeni konu anlatımı için gereken tipik dakika. */
export const TOPIC_MINUTES = 55;

/** İki görev arasında bırakılan mola; yerleştirme bütçesine de girer. */
export const SLOT_GAP_MINUTES = 10;

/** Her gün tekrar eden sabit görevler: paragraf (50) + problem (50). */
export const FIXED_DAILY_MINUTES = 100;

/** Deneme gününde sınav süresi; yeni konuya yer bırakmaz. */
export const MOCK_MINUTES = 165;

export interface DayLoad {
  isSunday: boolean;
  isMock: boolean;
}

/**
 * Bir günde yeni konu veya tekrar için kaç slot açılabileceği.
 *
 * Sabit görevler (paragraf + problem) ve slot araları düşülür. 240 dk'lık
 * varsayılan bütçede: (240 − 100) / (55 + 10) = 2 slot.
 */
export function slotsPerDay(studyMinutes: number, carryMinutes = 0): number {
  const usable = studyMinutes + carryMinutes - FIXED_DAILY_MINUTES;
  return Math.max(0, Math.floor(usable / (TOPIC_MINUTES + SLOT_GAP_MINUTES)));
}

/**
 * Yeni konuların tekrar ve sabit günlük görevler tarafından açlığa itilmesini
 * engeller.
 *
 * Bu kural olmadan 3 tekrar (3 × 55 = 165 dk) + paragraf (50) + problem (50)
 * = 265 dk, 240 dk'lık bütçeyi aşar. Görev listesi sırayla doldurulduğu için
 * yeni konu görevi hiç sıraya girmez ve program ilk haftadan sonra durur.
 *
 * `protectReviews` — gecikmiş kritik tekrar varsa ikinci yeni konudan feragat
 * edip tekrara bir slot bırakır.
 */
export function splitBudget(
  budget: number,
  perDay: number,
  fixedMinutes: number,
  { sunday = false, protectReviews = false }: { sunday?: boolean; protectReviews?: boolean } = {},
): BudgetSplit {
  // Pazar günü yeni konu açılmaz; kalan her şey tekrara gider.
  if (sunday) return { newTopicReserve: 0, reviewCap: Math.max(0, budget - fixedMinutes) };
  const room = Math.max(0, budget - fixedMinutes);
  let newTopicReserve = Math.min(perDay * TOPIC_MINUTES, room);
  if (protectReviews && newTopicReserve > TOPIC_MINUTES) newTopicReserve -= TOPIC_MINUTES;
  return { newTopicReserve, reviewCap: Math.max(0, room - newTopicReserve) };
}

/**
 * Yeni konu açılabilen gerçek gün sayısı ve gün başına kapasite.
 *
 * `planPace` eskiden kapasiteyi yalnızca takvim günü × perDay sanıyordu; pazar,
 * deneme günleri ve günlük sabit 100 dakika hesaba girmiyordu. Bu yüzden motor
 * "program sığar" diyor ama gerçekte onlarca konu hiç açılmıyordu.
 */
export function capacity(
  days: DayLoad[],
  studyMinutes: number,
  carryMinutes = 0,
): { teachDays: number; perDay: number; capacity: number } {
  const perDay = slotsPerDay(studyMinutes, carryMinutes);
  let teachDays = 0;
  for (const d of days) {
    // Pazar hafif gün, deneme gününde ise 165–180 dk sınav var; ikisinde de
    // yeni konu açılmaz.
    if (d.isSunday || d.isMock) continue;
    teachDays += 1;
  }
  return { teachDays, perDay, capacity: teachDays * perDay };
}
```

## FILE: app/src/lib/smart/mock-plan.ts
```ts
/**
 * Deneme planlama — konu kapsamı + öğrenme düzeyi + net ortalaması birlikte.
 *
 * Tasarım kararları ve dayanakları:
 *
 * 1) Branş denemesi konu ilerlemesine bağlı, takvime değil. Saruhan Kurs:
 *    "Başlangıç zamanını takvim belirleyemez... Bütün konular bitmeden branş
 *    denemesine dokunma yanlıştır." Aile ve Eğitim: kapsamdaki konular
 *    çalışılmadıysa sonuç konu eksikliğini değil işlenmemiş konuyu gösterir.
 *
 * 2) Genel deneme ilk turun bitmesini beklemez. Nettik: "İlk genel denemeyi
 *    çalışma döneminin ilk iki-üç haftasında çöz." MEB resmî MEBİ takvimi de
 *    ilk Türkiye geneli denemeyi 21-27 Eylül'de yapıyor.
 *
 * 3) Sıklık kararı tek denemeye değil, benzer koşullardaki son üç denemenin
 *    ortalamasına bakmalı. YKSMax: "Tek denemedeki yükseliş veya düşüş büyük
 *    kararlar için yeterli değildir."
 *
 * 4) Net eşikleri ve konu yüzdeleri KAYNAKLARDA KESİN BARAJ OLARAK YOK.
 *    Saruhan: "tek bir yüzdesi veya kesin kuralı yoktur." Aile ve Eğitim kendi
 *    tablosunu "editoryal öneri" sayıyor. Bu yüzden buradaki bantlar
 *    `PLANNING_BANDS_NOTE` ile işaretli yaklaşık önerilerdir ve net eşiği
 *    ALTINDA kalan öğrenci denemeden mahrum bırakılmaz.
 */

import type { AytExam, TopicRow, TytExam } from "@/lib/types";
import { aytNets, tytNets } from "@/lib/stats";
import { aytUnlocks } from "@/data/roadmap";
import { learningStage } from "@/lib/smart/progress";
import {
  AYT_MOCK_STAGES,
  TYT_MOCK_STAGES,
  rollingAverage,
  stageFor,
  type MockStage,
} from "@/lib/smart/mock-bands";

export { AYT_MOCK_STAGES, TYT_MOCK_STAGES, rollingAverage, stageFor };
export type { MockStage };

export type MockKind = "brans" | "genel";

export interface MockDecision {
  exam: "TYT" | "AYT";
  subject: string;
  kind: MockKind;
  /** Ölçülen konu kapsamı (0–1). */
  coverage: number;
  /** Kapsam ağırlıklı hesaplandı mı? */
  weighted: boolean;
  /** Karar gerekçesi. */
  reason: string;
  /** Net eşiği altında kaldığı için sıklık düşürüldü mü? */
  reduced: boolean;
}

/**
 * Deneme sıklık aşamaları `mock-bands.ts` içinde (saf, test edilebilir).
 * Bantlar kaynaklarda kesin baraj değildir; yaklaşık planlama önerisidir.
 */

/** Denemenin kapsadığı derslerdeki konu kapsamı (0–1). */
export function subjectCoverage(topics: TopicRow[], exam: "TYT" | "AYT", subject: string): number {
  const rows = topics.filter((t) => t.exam === exam && t.subject === subject);
  if (!rows.length) return 0;
  // Ders bazında eşit konu ağırlığı: alt konu satırları aynı konuya aitse tek say.
  const byTopic = new Map<string, TopicRow[]>();
  for (const r of rows) {
    const list = byTopic.get(r.topic) ?? [];
    list.push(r);
    byTopic.set(r.topic, list);
  }
  let mastered = 0;
  for (const list of byTopic.values()) {
    if (list.every((r) => learningStage(r) === "ogrenildi")) mastered += 1;
  }
  return mastered / byTopic.size;
}

/** Genel denemede ölçülen toplam kapsam (ders kapsamlarının ortalaması). */
export function overallCoverage(topics: TopicRow[], exam: "TYT" | "AYT"): number {
  const subjects = [...new Set(topics.filter((t) => t.exam === exam).map((t) => t.subject))];
  if (!subjects.length) return 0;
  return subjects.reduce((a, s) => a + subjectCoverage(topics, exam, s), 0) / subjects.length;
}

/**
 * Bir ders için branş denemesi kararı.
 *
 * Kapsam %50'yi geçince branş denemesi anlamlı (Saruhan: konuların anlamlı bir
 * bölümü öğrenilmişse yeterli). Kapı kapalıysa (ör. AYT Fizik) hiç başlamaz.
 */
export function branchMockDecision(topics: TopicRow[], exam: "TYT" | "AYT", subject: string): MockDecision | null {
  const coverage = subjectCoverage(topics, exam, subject);
  const stages = exam === "TYT" ? TYT_MOCK_STAGES : AYT_MOCK_STAGES;
  const stage = stageFor(stages, coverage);
  if (coverage < 0.5) {
    return {
      exam,
      subject,
      kind: "brans",
      coverage,
      weighted: false,
      reduced: false,
      reason:
        coverage < 0.3
          ? "Kapsam %30'un altında — konu anlatımı ve konu testleri daha doğru araç."
          : "Kapsam %30–50 — tamamlanan konulardan karma test uygun, branş denemesi için erken.",
    };
  }
  // Kapı kontrolü: AYT dersi açık mı?
  if (exam === "AYT") {
    const u = aytUnlocks(topics);
    const open =
      subject === "Matematik" || subject === "Geometri"
        ? u.mat.ready
        : subject === "Fizik"
          ? u.fiz.ready
          : subject === "Kimya"
            ? u.kim.ready
            : subject === "Biyoloji"
              ? u.bio.ready
              : true;
    if (!open) {
      return {
        exam,
        subject,
        kind: "brans",
        coverage,
        weighted: false,
        reduced: true,
        reason: "AYT ön koşul kapısı henüz kapalı — önce TYT çekirdeği.",
      };
    }
  }
  return {
    exam,
    subject,
    kind: "brans",
    coverage,
    weighted: false,
    reduced: false,
    reason: `${stage.label} — kapsam %${Math.round(coverage * 100)}, haftada ~${stage.perWeek}.`,
  };
}

/**
 * Genel deneme kararı.
 *
 * İlk seviye belirleme denemesi ilk 2–3 hafta içinde bir kez yapılır (Nettik).
 * Sonrasında kapsam bandı sıklığı belirler. Net, bandın altında kalırsa
 * öğrenci denemeden mahrum bırakılmaz; sıklık düşürülür (kullanıcı şartı).
 */
export function generalMockDecision(
  topics: TopicRow[],
  tytExams: TytExam[],
  aytExams: AytExam[],
  exam: "TYT" | "AYT",
): MockDecision {
  const coverage = overallCoverage(topics, exam);
  const stages = exam === "TYT" ? TYT_MOCK_STAGES : AYT_MOCK_STAGES;
  const stage = stageFor(stages, coverage);
  const exams = exam === "TYT" ? tytExams : aytExams;
  const netOf = exam === "TYT" ? (e: TytExam) => tytNets(e).total : (e: AytExam) => aytNets(e).total;
  const roll = rollingAverage(exams as never[], netOf as never);

  // İlk seviye belirleme: hiç deneme yoksa ve kapsam düşükse.
  if (roll.count === 0) {
    return {
      exam,
      subject: "Genel",
      kind: "genel",
      coverage,
      weighted: false,
      reduced: false,
      reason:
        exam === "TYT"
          ? "İlk seviye belirleme: net şartı yok. İlk 2–3 hafta içinde bir kez çöz, eksikleri haritala."
          : "İlk seviye belirleme: yeterli konu birikimi oluşunca seyrek. Net şartı yok.",
    };
  }

  let reduced = false;
  let reason = `${stage.label} — kapsam %${Math.round(coverage * 100)}`;
  if (stage.nets && roll.avg != null && roll.avg < stage.nets[0]) {
    reduced = true;
    reason += `. Ortalama net ${roll.avg.toFixed(1)}, bandın altında (${stage.nets[0]}–${stage.nets[1]}). Sıklık düşük tutulur, eksiklere daha çok süre ayrılır.`;
  } else if (roll.avg != null) {
    reason += `. Son ${roll.count} deneme ortalaması ${roll.avg.toFixed(1)} (${roll.trend >= 0 ? "↑" : "↓"} ${Math.abs(roll.trend).toFixed(1)}).`;
  }
  return { exam, subject: "Genel", kind: "genel", coverage, weighted: false, reduced, reason };
}

/** Öğrenciye gösterilecek deneme takvimi özeti. */
export function mockPlanSummary(topics: TopicRow[], tytExams: TytExam[], aytExams: AytExam[]) {
  const tyt = generalMockDecision(topics, tytExams, aytExams, "TYT");
  const ayt = generalMockDecision(topics, tytExams, aytExams, "AYT");
  const branches: MockDecision[] = [];
  for (const subject of ["Türkçe", "Matematik", "Fizik", "Kimya", "Biyoloji"]) {
    const d = branchMockDecision(topics, "TYT", subject);
    if (d) branches.push(d);
  }
  for (const subject of ["Matematik", "Fizik", "Kimya", "Biyoloji"]) {
    const d = branchMockDecision(topics, "AYT", subject);
    if (d) branches.push(d);
  }
  return { tyt, ayt, branches };
}
```

## FILE: app/src/data/roadmap.ts
```ts
import type { TopicRow, TytExam, AytExam } from "@/lib/types";
import { tytNets, aytNets } from "@/lib/stats";
import { learningStage, explainStage, STAGE_LABEL, type LearningStage } from "@/lib/smart/progress";
import { GARANTI_ROWS, STREAK_ROWS } from "@/data/guaranteed";

/**
 * TYT sayısal çekirdek — bitince AYT küme/fonksiyon açılır.
 *
 * Liste kullanıcının verdiği sırayla birebir aynıdır ve `curriculum.json`
 * yazımıyla eşleşir (ör. "EBOB – EKOK", "Oran – Orantı"). Ad uyuşmazlığı
 * kapıyı sessizce hiç açmaz hâle getirir; `references.test.ts` bunu denetler.
 */
export const MAT_AYT_GATE = [
  "Temel Kavramlar",
  "Sayı Basamakları",
  "Bölme ve Bölünebilme",
  "EBOB – EKOK",
  "Rasyonel Sayılar",
  "Basit Eşitsizlikler",
  "Mutlak Değer",
  "Üslü Sayılar",
  "Köklü Sayılar",
  "Çarpanlara Ayırma",
  "Oran – Orantı",
  "Denklem Çözme",
];

export const FIZ_AYT_GATE = [
  "Fizik Bilimine Giriş",
  "Madde ve Özellikleri",
  "Hareket ve Kuvvet",
  "İş, Güç ve Enerji",
];

export const KIM_AYT_GATE = [
  "Kimya Bilimi",
  "Atom ve Periyodik Sistem",
  "Kimyasal Türler Arası Etkileşimler",
  "Kimyanın Temel Kanunları",
  "Mol ve Kimyasal Hesaplamalar",
];

/**
 * Biyoloji: TYT bitirmek tercih; hızlı geçişte bu konular sonraya bırakılabilir.
 * Kullanıcı şartı: ertelense bile SİLİNMEZ, yalnızca geriye atılır.
 */
export const BIO_SKIP_FOR_FAST = ["Kalıtım", "Canlıların Sınıflandırılması"];

/** Rehberlik servisi / koçluk derlemeleri — “her sene garanti” iddiası; kesin ÖSYM tablosu değil. */
export const GARANTI_TOPICS: { exam: "TYT" | "AYT"; subject: string; topic: string }[] = [
  ...GARANTI_ROWS.map((r) => ({ exam: r.exam, subject: r.subject, topic: r.topic })),
  ...STREAK_ROWS.map((r) => ({ exam: r.exam, subject: r.subject, topic: r.topic })),
].filter((row, i, all) => all.findIndex((x) => x.exam === row.exam && x.subject === row.subject && x.topic === row.topic) === i);

/** AYT garanti listesi: koçluk derlemelerinden gelen AYT ağırlıklı konular. */
export const GARANTI_AYT_TOPICS: { exam: "AYT"; subject: string; topic: string }[] = [
  { exam: "AYT", subject: "Matematik", topic: "Fonksiyonlar" },
  { exam: "AYT", subject: "Matematik", topic: "Trigonometri" },
  { exam: "AYT", subject: "Matematik", topic: "Logaritma" },
  { exam: "AYT", subject: "Matematik", topic: "Türev" },
  { exam: "AYT", subject: "Matematik", topic: "İntegral" },
  { exam: "AYT", subject: "Fizik", topic: "Modern Fizik" },
  { exam: "AYT", subject: "Fizik", topic: "Elektrik Alan" },
  { exam: "AYT", subject: "Fizik", topic: "Manyetik Alan" },
  { exam: "AYT", subject: "Kimya", topic: "Gazlar" },
  { exam: "AYT", subject: "Kimya", topic: "Sıvı Çözeltiler" },
  { exam: "AYT", subject: "Kimya", topic: "Kimya ve Elektrik" },
  { exam: "AYT", subject: "Kimya", topic: "Organik Bileşikler" },
  { exam: "AYT", subject: "Biyoloji", topic: "Endokrin Sistem" },
  { exam: "AYT", subject: "Biyoloji", topic: "Dolaşım ve Bağışıklık" },
  { exam: "AYT", subject: "Biyoloji", topic: "Bitki Biyolojisi" },
  { exam: "AYT", subject: "Biyoloji", topic: "Komünite Ekolojisi" },
];

export const AYT_KIMYA_BIO_NOTE = {
  title: "AYT Kimya / Biyoloji konu-yıl tablosu",
  body: "Reyhanlı / ÖSYM kitapçık derlemesinde bu iki ders konu etiketine ayrılmadı. Yıllık kutu uydurulmadı. Öncelik, koçluk derlemelerinden (garanti net listeleri) gelir.",
};

export const SUBJECT_ORDER: { exam: "TYT" | "AYT"; subject: string }[] = [
  { exam: "TYT", subject: "Türkçe" },
  { exam: "TYT", subject: "Matematik" },
  { exam: "TYT", subject: "Geometri" },
  { exam: "TYT", subject: "Fizik" },
  { exam: "TYT", subject: "Kimya" },
  { exam: "TYT", subject: "Biyoloji" },
  { exam: "TYT", subject: "Tarih" },
  { exam: "TYT", subject: "Coğrafya" },
  { exam: "TYT", subject: "Felsefe" },
  { exam: "TYT", subject: "Din Kültürü" },
  { exam: "AYT", subject: "Matematik" },
  { exam: "AYT", subject: "Geometri" },
  { exam: "AYT", subject: "Fizik" },
  { exam: "AYT", subject: "Kimya" },
  { exam: "AYT", subject: "Biyoloji" },
];

/**
 * Bir konu "tamamlandı" sayılır mı?
 *
 * Kullanıcı şartı: yalnızca konu anlatımının izlenmiş olması yeterli değil;
 * temel soru çözümü de gerekir. `learningStage` bunu zaten uygular — "Bitti"
 * ama soru verisi yoksa aşama "anlatim" kalır ve kapı açılmaz.
 */
function topicDone(topics: TopicRow[], exam: "TYT" | "AYT", subject: string, name: string) {
  const rows = topics.filter((t) => t.exam === exam && t.subject === subject && t.topic === name);
  if (!rows.length) return false;
  return rows.every((t) => {
    const stage = learningStage(t);
    return stage === "ogrenildi";
  });
}

function gateReady(topics: TopicRow[], subject: string, names: string[]) {
  const done = names.filter((name) => topicDone(topics, "TYT", subject, name)).length;
  return { done, total: names.length, ready: done >= names.length };
}

export interface GateBlocker {
  /** Kapıyı kapatan konunun adı. */
  topic: string;
  /** Öğrenme aşaması. */
  stage: LearningStage;
  /** Aşamanın okunabilir etiketi. */
  stageLabel: string;
  /** Neden öğrenildi sayılmadığının kısa açıklaması. */
  reason: string;
  /** Soru verisi: doğru / toplam. */
  correct: number;
  total: number;
}

/**
 * Bir kapıyı kapatan konuları ve nedenlerini döndürür.
 *
 * `aytUnlocks` yalnızca `5/12` gibi bir sayı verir; kullanıcı hangi konunun
 * kapıyı kapattığını göremez. Bu fonksiyon mevcut hesaplamayı DEĞİŞTİRMEZ,
 * yalnızca aynı `topicDone` koşulunu kullanarak eksikleri listeler.
 */
export function gateBlockers(
  topics: TopicRow[],
  subject: string,
  names: string[],
): GateBlocker[] {
  const blockers: GateBlocker[] = [];
  for (const name of names) {
    const rows = topics.filter((t) => t.exam === "TYT" && t.subject === subject && t.topic === name);
    if (!rows.length) {
      blockers.push({
        topic: name,
        stage: "gorulmedi",
        stageLabel: "Müfredatta yok",
        reason: "Bu konu müfredat listesinde bulunamadı.",
        correct: 0,
        total: 0,
      });
      continue;
    }
    // Konunun alt konuları varsa hepsi öğrenilmiş olmalı (topicDone ile aynı kural).
    const notDone = rows.filter((t) => learningStage(t) !== "ogrenildi");
    if (!notDone.length) continue;
    const first = notDone[0];
    const stage = learningStage(first);
    const ex = explainStage(first);
    blockers.push({
      topic: name,
      stage,
      stageLabel: STAGE_LABEL[stage],
      reason: ex.summary,
      correct: ex.correct,
      total: ex.total,
    });
  }
  return blockers;
}

/** Kapı tanımları: arayüzde kapatan konuları listelemek için tek kaynak. */
export const GATE_DEFS: { key: "mat" | "fiz" | "kim"; subject: string; names: string[]; label: string }[] = [
  { key: "mat", subject: "Matematik", names: MAT_AYT_GATE, label: "AYT Mat / Geo" },
  { key: "fiz", subject: "Fizik", names: FIZ_AYT_GATE, label: "AYT Fizik" },
  { key: "kim", subject: "Kimya", names: KIM_AYT_GATE, label: "AYT Kimya" },
];

export function aytUnlocks(topics: TopicRow[]) {
  const mat = gateReady(topics, "Matematik", MAT_AYT_GATE);
  const fiz = gateReady(topics, "Fizik", FIZ_AYT_GATE);
  const kim = gateReady(topics, "Kimya", KIM_AYT_GATE);
  const bioRows = topics.filter((t) => t.exam === "TYT" && t.subject === "Biyoloji");
  const bioCore = bioRows.filter((t) => !BIO_SKIP_FOR_FAST.includes(t.topic));
  // Biyolojide "bitti" demek için de öğrenme aşaması şart (soru çözümü olmadan olmaz).
  const mastered = (t: TopicRow) => learningStage(t) === "ogrenildi";
  const bioAllDone = bioRows.length > 0 && bioRows.every(mastered);
  const bioFast =
    bioCore.length > 0 &&
    [...new Set(bioCore.map((t) => t.topic))].every((name) => topicDone(topics, "TYT", "Biyoloji", name));
  return {
    mat,
    fiz,
    kim,
    bio: { ready: bioAllDone || bioFast, allDone: bioAllDone, fast: bioFast && !bioAllDone },
  };
}

export function lastExamNet(tytExams: TytExam[], aytExams: AytExam[]) {
  const tyt = [...tytExams].filter((e) => e.date).sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  const ayt = [...aytExams].filter((e) => e.date).sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  return {
    tyt: tyt ? tytNets(tyt).total : null,
    ayt: ayt ? aytNets(ayt).total : null,
    tytDate: tyt?.date ?? "",
    aytDate: ayt?.date ?? "",
  };
}

/** TYT deneme: çekirdek matematiğin ~%40’ı bitince veya ilk deneme girilmişse. */
export function tytMockReady(topics: TopicRow[], tytExams: TytExam[]) {
  const mat = gateReady(topics, "Matematik", MAT_AYT_GATE);
  if (tytExams.some((e) => e.date && (e.turD != null || e.matD != null))) return true;
  return mat.done / mat.total >= 0.4;
}

/** AYT deneme: son TYT net ≥ 70 ve ilgili AYT kapısı açık. 70 altı AYT denemeyi şişirmez. */
export function aytMockReady(topics: TopicRow[], tytExams: TytExam[], aytExams: AytExam[]) {
  const nets = lastExamNet(tytExams, aytExams);
  if (nets.tyt == null || nets.tyt < 70) return false;
  const u = aytUnlocks(topics);
  return u.mat.ready || u.fiz.ready || u.kim.ready || u.bio.ready;
}

export function isGaranti(exam: string, subject: string, topic: string) {
  return (
    GARANTI_TOPICS.some((g) => g.exam === exam && g.subject === subject && g.topic === topic) ||
    GARANTI_AYT_TOPICS.some((g) => g.subject === subject && g.topic === topic)
  );
}

export const ROADMAP_PHASES = [
  {
    id: "tyt-core",
    title: "TYT çekirdek (4–8 hafta)",
    body: "Türkçe paragraf her gün. Matematikte 12 temel konu + problem. Fen kapı konularını paralel bitir. Sosyal’i ince dilimler halinde.",
  },
  {
    id: "ayt-open",
    title: "AYT erken açılış",
    body: "Mat kapısı bitince küme–fonksiyon. Fizik 4 konu, kimya 5 konu bitince AYT’ye geç. Biyoloji TYT’yi bitirmek daha sağlıklı; acelede kalıtım/sınıflandırma bekleyebilir.",
  },
  {
    id: "mocks",
    title: "Denemeler",
    body: "TYT deneme: çekirdek matematiğin ~%40’ı veya ilk deneme kaydı. AYT deneme: son TYT net 70+. Cumartesi deneme; pazar hafif (tekrar + paragraf, yeni konu yok).",
  },
  {
    id: "sustain",
    title: "Sürdürülebilir tempo",
    body: "Bitmiş konu silinmez. Paragraf ve problem hiç durmaz. Pazar diğer günlerden kısa tutulur.",
  },
];
```

## FILE: app/src/lib/store.ts
```ts
import { create } from "zustand";
import { persist } from "zustand/middleware";
import curriculum from "@/data/curriculum.json";
import { uid, todayISO } from "@/lib/utils";
import type {
  TopicRow,
  WrongRow,
  TytExam,
  AytExam,
  DailyRow,
  Status,
} from "@/lib/types";
import { DEFAULT_SETTINGS, type CarryItem, type ScheduleSettings } from "@/lib/smart/types";
import { suggestedReviewDate } from "@/lib/smart/engine";

type TopicJson = { exam: "TYT" | "AYT"; subject: string; topic: string; subtopic: string };

function topicId(t: TopicJson) {
  return `${t.exam}|${t.subject}|${t.topic}|${t.subtopic}`;
}

export function seedTopics(): TopicRow[] {
  return (curriculum as TopicJson[]).map((t) => ({
    id: topicId(t),
    exam: t.exam,
    subject: t.subject,
    topic: t.topic,
    subtopic: t.subtopic,
    status: "Başlamadım" as Status,
    total: null,
    correct: null,
    wrong: null,
    lastStudy: "",
    reviewDate: "",
    source: "",
    note: "",
  }));
}

export function mergeTopics(existing: TopicRow[]): TopicRow[] {
  const map = new Map(existing.map((t) => [t.id, t]));
  return seedTopics().map((fresh) => {
    const old = map.get(fresh.id);
    return old ? { ...fresh, ...old, id: fresh.id, exam: fresh.exam, subject: fresh.subject, topic: fresh.topic, subtopic: fresh.subtopic } : fresh;
  });
}

export interface DataSnapshot {
  at: string;
  topics: TopicRow[];
  wrongs: WrongRow[];
  tytExams: TytExam[];
  aytExams: AytExam[];
  daily: DailyRow[];
  settings: ScheduleSettings;
  carry: CarryItem[];
}

export interface AppState {
  topics: TopicRow[];
  wrongs: WrongRow[];
  tytExams: TytExam[];
  aytExams: AytExam[];
  daily: DailyRow[];
  settings: ScheduleSettings;
  carry: CarryItem[];
  backup: DataSnapshot | null;
  lastAiComment: { at: string; text: string } | null;
  updateTopic: (id: string, patch: Partial<TopicRow>) => void;
  addWrong: (row?: Partial<WrongRow>) => void;
  updateWrong: (id: string, patch: Partial<WrongRow>) => void;
  removeWrong: (id: string) => void;
  addTytExam: (row?: Partial<TytExam>) => void;
  updateTytExam: (id: string, patch: Partial<TytExam>) => void;
  removeTytExam: (id: string) => void;
  addAytExam: (row?: Partial<AytExam>) => void;
  updateAytExam: (id: string, patch: Partial<AytExam>) => void;
  removeAytExam: (id: string) => void;
  addDaily: (row?: Partial<DailyRow>) => void;
  updateDaily: (id: string, patch: Partial<DailyRow>) => void;
  removeDaily: (id: string) => void;
  updateSettings: (patch: Partial<ScheduleSettings>) => void;
  missYesterday: () => void;
  clearCarry: () => void;
  replanProgram: (from?: string) => void;
  resetAll: () => void;
  restoreBackup: () => void;
  setAiComment: (text: string) => void;
}

function snapshot(s: AppState): DataSnapshot {
  return {
    at: new Date().toISOString(),
    topics: s.topics,
    wrongs: s.wrongs,
    tytExams: s.tytExams,
    aytExams: s.aytExams,
    daily: s.daily,
    settings: s.settings,
    carry: s.carry,
  };
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      topics: seedTopics(),
      wrongs: [],
      tytExams: [],
      aytExams: [],
      daily: [],
      settings: DEFAULT_SETTINGS,
      carry: [],
      backup: null,
      lastAiComment: null,
      updateTopic: (id, patch) =>
        set({
          topics: get().topics.map((t) => {
            if (t.id !== id) return t;
            const next = { ...t, ...patch };
            if ((patch.lastStudy || patch.total != null || patch.correct != null || patch.status) && !next.reviewDate) {
              next.reviewDate = suggestedReviewDate(next);
            }
            return next;
          }),
        }),
      addWrong: (row) =>
        set({
          wrongs: [
            {
              id: uid(),
              date: todayISO(),
              exam: "TYT",
              subject: "",
              topic: "",
              subtopic: "",
              source: "",
              questionNo: "",
              reason: "",
              note: "",
              reviewDate: "",
              result: "",
              ...row,
            },
            ...get().wrongs,
          ],
        }),
      updateWrong: (id, patch) =>
        set({ wrongs: get().wrongs.map((t) => (t.id === id ? { ...t, ...patch } : t)) }),
      removeWrong: (id) => set({ wrongs: get().wrongs.filter((t) => t.id !== id) }),
      addTytExam: (row) =>
        set({
          tytExams: [
            {
              id: uid(),
              date: todayISO(),
              name: "",
              turD: null,
              turY: null,
              matD: null,
              matY: null,
              sosD: null,
              sosY: null,
              fenD: null,
              fenY: null,
              note: "",
              ...row,
            },
            ...get().tytExams,
          ],
        }),
      updateTytExam: (id, patch) =>
        set({ tytExams: get().tytExams.map((t) => (t.id === id ? { ...t, ...patch } : t)) }),
      removeTytExam: (id) => set({ tytExams: get().tytExams.filter((t) => t.id !== id) }),
      addAytExam: (row) =>
        set({
          aytExams: [
            {
              id: uid(),
              date: todayISO(),
              name: "",
              matD: null,
              matY: null,
              fizD: null,
              fizY: null,
              kimD: null,
              kimY: null,
              bioD: null,
              bioY: null,
              note: "",
              ...row,
            },
            ...get().aytExams,
          ],
        }),
      updateAytExam: (id, patch) =>
        set({ aytExams: get().aytExams.map((t) => (t.id === id ? { ...t, ...patch } : t)) }),
      removeAytExam: (id) => set({ aytExams: get().aytExams.filter((t) => t.id !== id) }),
      addDaily: (row) =>
        set({
          daily: [
            {
              id: uid(),
              date: todayISO(),
              subject: "",
              topic: "",
              kind: "Soru çözümü",
              minutes: null,
              questions: null,
              correct: null,
              wrong: null,
              note: "",
              ...row,
            },
            ...get().daily,
          ],
        }),
      updateDaily: (id, patch) =>
        set({ daily: get().daily.map((t) => (t.id === id ? { ...t, ...patch } : t)) }),
      removeDaily: (id) => set({ daily: get().daily.filter((t) => t.id !== id) }),
      updateSettings: (patch) => set({ settings: { ...get().settings, ...patch } }),
      missYesterday: () => {
        const s = get();
        set({
          carry: [
            ...s.carry,
            {
              id: uid(),
              title: "Kaçırılan gün — sonraki günlere yayılacak",
              minutes: s.settings.studyMinutes,
              created: todayISO(),
            },
          ],
        });
      },
      clearCarry: () => set({ carry: [] }),
      /** Programı bugünden yeniden planlar: konu/deneme verisi korunur, takvim yeniden çapalanır. */
      replanProgram: (from) =>
        set({ settings: { ...get().settings, programStart: from ?? todayISO() } }),
      resetAll: () => {
        const s = get();
        set({
          backup: snapshot(s),
          topics: seedTopics(),
          wrongs: [],
          tytExams: [],
          aytExams: [],
          daily: [],
          carry: [],
          lastAiComment: null,
          settings: { ...s.settings, programStart: todayISO() },
        });
      },
      restoreBackup: () => {
        const b = get().backup;
        if (!b) return;
        set({
          topics: mergeTopics(b.topics),
          wrongs: b.wrongs,
          tytExams: b.tytExams,
          aytExams: b.aytExams,
          daily: b.daily,
          settings: { ...DEFAULT_SETTINGS, ...b.settings },
          carry: b.carry,
        });
      },
      setAiComment: (text) => set({ lastAiComment: { at: new Date().toISOString(), text } }),
    }),
    {
      name: "netdefter-yks-v1",
      skipHydration: true,
      partialize: (s) => ({
        topics: s.topics,
        wrongs: s.wrongs,
        tytExams: s.tytExams,
        aytExams: s.aytExams,
        daily: s.daily,
        settings: s.settings,
        carry: s.carry,
        backup: s.backup,
        lastAiComment: s.lastAiComment,
      }),
      merge: (persisted, current) => {
        const p =
          (persisted as Partial<
            Pick<
              AppState,
              "topics" | "wrongs" | "tytExams" | "aytExams" | "daily" | "settings" | "carry" | "backup" | "lastAiComment"
            >
          >) ?? {};
        return {
          ...current,
          ...p,
          topics: mergeTopics(p.topics ?? []),
          settings: { ...DEFAULT_SETTINGS, ...p.settings },
          carry: p.carry ?? [],
          backup: p.backup ?? null,
        };
      },
    },
  ),
);
```

## FILE: app/src/lib/store.merge.test.ts
```ts
/**
 * Veri kaybı koruma testleri.
 *
 * mergeTopics, kayıtlı konu verisini yeni müfredatla birleştirir. Uygulamanın
 * en kritik fonksiyonu: hata yaparsa kullanıcı tüm çalışma geçmişini kaybeder.
 * Bu testler, fonksiyonun kullanıcı alanlarını koruduğunu doğrular.
 *
 * `vite` ile yüklenir çünkü store `@/` takma adı ve JSON importu kullanır;
 * `node --test` bunları doğrudan çözemez.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type ViteDevServer } from "vite";

let server: ViteDevServer;
let S: any;

before(async () => {
  server = await createServer({ server: { middlewareMode: true }, logLevel: "silent" });
  S = await server.ssrLoadModule("/src/lib/store.ts");
});

after(async () => {
  await server?.close();
});

describe("mergeTopics — veri kaybı koruması", () => {
  it("hiç kayıt yoksa tüm müfredatı üretir", () => {
    const fresh = S.seedTopics();
    const merged = S.mergeTopics([]);
    assert.equal(merged.length, fresh.length);
    assert.ok(merged.length > 0);
  });

  it("kullanıcının çalışma alanlarını korur", () => {
    const fresh = S.seedTopics();
    const target = fresh[0];
    const saved = {
      ...target,
      status: "Tamamlandı",
      total: 40,
      correct: 32,
      wrong: 8,
      lastStudy: "2026-11-05",
      reviewDate: "2026-11-12",
      source: "MEB",
      note: "zor konu",
    };
    const merged = S.mergeTopics([saved]);
    const got = merged.find((t: any) => t.id === target.id);
    assert.ok(got, "konu kayboldu");
    assert.equal(got.status, "Tamamlandı");
    assert.equal(got.total, 40);
    assert.equal(got.correct, 32);
    assert.equal(got.wrong, 8);
    assert.equal(got.lastStudy, "2026-11-05");
    assert.equal(got.reviewDate, "2026-11-12");
    assert.equal(got.source, "MEB");
    assert.equal(got.note, "zor konu");
  });

  it("müfredat değişse bile konu adını müfredattan alır", () => {
    // Kullanıcı eski sürümde konuyu farklı adla kaydetmiş olabilir; ad
    // müfredattan gelmeli ki liste ile arayüz çelişmesin.
    const fresh = S.seedTopics();
    const target = fresh[0];
    const stale = { ...target, topic: "ESKİ AD", subtopic: "ESKİ ALT", status: "Tamamlandı" };
    const merged = S.mergeTopics([stale]);
    const got = merged.find((t: any) => t.id === target.id);
    assert.equal(got.topic, target.topic);
    assert.equal(got.subtopic, target.subtopic);
    assert.equal(got.status, "Tamamlandı", "durum korunmalıydı");
  });

  it("müfredatta olmayan kaydı sessizce düşürür", () => {
    const ghost = {
      id: "TYT|Sahte Ders|Sahte Konu|Sahte Alt",
      exam: "TYT",
      subject: "Sahte Ders",
      topic: "Sahte Konu",
      subtopic: "Sahte Alt",
      status: "Tamamlandı",
      total: 10,
      correct: 10,
      wrong: 0,
      lastStudy: "2026-11-05",
      reviewDate: "",
      source: "",
      note: "",
    };
    const merged = S.mergeTopics([ghost]);
    assert.equal(
      merged.filter((t: any) => t.subject === "Sahte Ders").length,
      0,
      "müfredatta olmayan kayıt listeye sızdı",
    );
  });

  it("kayıt sayısı kadar konuyu eksiksiz döndürür", () => {
    const fresh = S.seedTopics();
    const saved = fresh.slice(0, 5).map((t: any) => ({ ...t, status: "Tamamlandı" }));
    const merged = S.mergeTopics(saved);
    assert.equal(merged.length, fresh.length);
    assert.equal(merged.filter((t: any) => t.status === "Tamamlandı").length, 5);
  });
});
```

## FILE: app/src/lib/calc.ts
```ts
export function n(v: number | null | undefined) {
  return v == null || Number.isNaN(v) ? 0 : v;
}

export function blankOf(total: number | null, correct: number | null, wrong: number | null) {
  if (total == null) return null;
  return Math.max(0, total - n(correct) - n(wrong));
}

export function netOf(correct: number | null, wrong: number | null) {
  if (correct == null && wrong == null) return null;
  return n(correct) - n(wrong) / 4;
}

export function pctOf(correct: number | null, total: number | null) {
  if (total == null || total === 0) return null;
  return n(correct) / total;
}
```

## FILE: app/src/lib/stats.ts
```ts
import { blankOf, netOf, n, pctOf } from "@/lib/calc";
import type { TopicRow, TytExam, AytExam, DailyRow, Status } from "@/lib/types";
import { AYT_SUBJECTS, TYT_SUBJECTS } from "@/lib/types";

export function topicDerived(t: TopicRow) {
  const blank = blankOf(t.total, t.correct, t.wrong);
  const net = t.total == null ? null : netOf(t.correct, t.wrong);
  const pct = pctOf(t.correct, t.total);
  return { blank, net, pct };
}

export function examBlock(topics: TopicRow[], exam: "TYT" | "AYT") {
  const rows = topics.filter((t) => t.exam === exam);
  const count = (s: Status) => rows.filter((t) => t.status === s).length;
  const totalQ = rows.reduce((a, t) => a + n(t.total), 0);
  const correct = rows.reduce((a, t) => a + n(t.correct), 0);
  const wrong = rows.reduce((a, t) => a + n(t.wrong), 0);
  const blank = rows.reduce((a, t) => a + (blankOf(t.total, t.correct, t.wrong) ?? 0), 0);
  const net = rows.reduce((a, t) => a + (t.total == null ? 0 : n(netOf(t.correct, t.wrong))), 0);
  const done = count("Bitti");
  return {
    total: rows.length,
    done,
    studying: count("Çalışıyorum"),
    notStarted: count("Başlamadım"),
    review: count("Tekrar Gerekli"),
    progress: rows.length ? done / rows.length : 0,
    totalQ,
    correct,
    wrong,
    blank,
    net,
    success: totalQ ? correct / totalQ : null,
  };
}

export function subjectProgress(topics: TopicRow[]) {
  const list: { exam: "TYT" | "AYT"; subject: string; total: number; done: number; progress: number; success: number | null }[] = [];
  const push = (exam: "TYT" | "AYT", subjects: readonly string[]) => {
    for (const subject of subjects) {
      const rows = topics.filter((t) => t.exam === exam && t.subject === subject);
      const done = rows.filter((t) => t.status === "Bitti").length;
      const totalQ = rows.reduce((a, t) => a + n(t.total), 0);
      const correct = rows.reduce((a, t) => a + n(t.correct), 0);
      list.push({
        exam,
        subject,
        total: rows.length,
        done,
        progress: rows.length ? done / rows.length : 0,
        success: totalQ ? correct / totalQ : null,
      });
    }
  };
  push("TYT", TYT_SUBJECTS);
  push("AYT", AYT_SUBJECTS);
  return list;
}

export function topicAggregates(topics: TopicRow[]) {
  const map = new Map<
    string,
    { exam: "TYT" | "AYT"; subject: string; topic: string; total: number; correct: number; wrong: number }
  >();
  for (const t of topics) {
    const key = `${t.exam}|${t.subject}|${t.topic}`;
    const cur = map.get(key) ?? { exam: t.exam, subject: t.subject, topic: t.topic, total: 0, correct: 0, wrong: 0 };
    cur.total += n(t.total);
    cur.correct += n(t.correct);
    cur.wrong += n(t.wrong);
    map.set(key, cur);
  }
  return [...map.values()].map((r) => ({
    ...r,
    blank: r.total ? Math.max(0, r.total - r.correct - r.wrong) : 0,
    net: r.total ? r.correct - r.wrong / 4 : 0,
    success: r.total ? r.correct / r.total : null,
  }));
}

export function tytNets(e: TytExam) {
  const tur = e.turD == null && e.turY == null ? null : netOf(e.turD, e.turY);
  const mat = e.matD == null && e.matY == null ? null : netOf(e.matD, e.matY);
  const sos = e.sosD == null && e.sosY == null ? null : netOf(e.sosD, e.sosY);
  const fen = e.fenD == null && e.fenY == null ? null : netOf(e.fenD, e.fenY);
  const total =
    tur == null && mat == null && sos == null && fen == null
      ? null
      : n(tur) + n(mat) + n(sos) + n(fen);
  return { tur, mat, sos, fen, total };
}

export function aytNets(e: AytExam) {
  const mat = e.matD == null && e.matY == null ? null : netOf(e.matD, e.matY);
  const fiz = e.fizD == null && e.fizY == null ? null : netOf(e.fizD, e.fizY);
  const kim = e.kimD == null && e.kimY == null ? null : netOf(e.kimD, e.kimY);
  const bio = e.bioD == null && e.bioY == null ? null : netOf(e.bioD, e.bioY);
  const total =
    mat == null && fiz == null && kim == null && bio == null
      ? null
      : n(mat) + n(fiz) + n(kim) + n(bio);
  return { mat, fiz, kim, bio, total };
}

export function dailyTotals(rows: DailyRow[], fromISO: string, toISO: string) {
  const slice = rows.filter((r) => r.date >= fromISO && r.date <= toISO);
  return {
    minutes: slice.reduce((a, r) => a + n(r.minutes), 0),
    questions: slice.reduce((a, r) => a + n(r.questions), 0),
    net: slice.reduce((a, r) => a + n(netOf(r.correct, r.wrong)), 0),
    count: slice.length,
  };
}
```

## FILE: app/src/lib/smart/types.ts
```ts
import type { Exam, StudyType } from "@/lib/types";

export type Health = "iyi" | "orta" | "zayif" | "kritik" | "bos";

export type FreqTier = "yuksek" | "orta" | "dusuk";

export interface ScheduleSettings {
  wake: string;
  sleep: string;
  studyMinutes: number;
  weeklyHours: number;
  examDate: string;
  programStart: string;
  mockWeekdays: number[];
  sportDays: number[];
  sportStart: string;
  sportEnd: string;
  meals: { name: string; start: string; end: string }[];
  leisure: { name: string; days: number[]; start: string; end: string }[];
  paragraphTarget: number;
  problemTarget: number;
}

export interface CarryItem {
  id: string;
  title: string;
  minutes: number;
  created: string;
}

export interface PlanSlot {
  id: string;
  start: string;
  end: string;
  exam: Exam | "";
  subject: string;
  topic: string;
  kind: StudyType;
  targetQ: number;
  minutes: number;
  priority: "yüksek" | "orta" | "düşük";
  reason: string;
  life?: boolean;
}

export interface ReviewRec {
  exam: Exam;
  subject: string;
  topic: string;
  health: Health;
  reason: string;
  suggestedQ: number;
  due: string;
}

export interface Insight {
  id: string;
  kind: "deneme" | "yanlis" | "tempo" | "oncelik" | "tekrar" | "pratik";
  title: string;
  body: string;
  evidence: string;
}

export const DEFAULT_SETTINGS: ScheduleSettings = {
  wake: "07:00",
  sleep: "23:30",
  studyMinutes: 240,
  weeklyHours: 26,
  examDate: "2027-06-19",
  programStart: "2026-11-01",
  mockWeekdays: [6],
  sportDays: [3],
  sportStart: "17:00",
  sportEnd: "18:30",
  meals: [
    { name: "Kahvaltı", start: "08:00", end: "08:40" },
    { name: "Öğle", start: "12:30", end: "13:20" },
    { name: "Akşam", start: "19:00", end: "19:45" },
  ],
  leisure: [
    { name: "Dinlenme", days: [0, 1, 2, 3, 4, 5, 6], start: "21:30", end: "22:20" },
    { name: "Oyun / dizi", days: [5, 6], start: "20:00", end: "21:15" },
    { name: "YouTube / serbest", days: [0, 1, 2, 3, 4], start: "22:20", end: "23:00" },
  ],
  paragraphTarget: 40,
  problemTarget: 20,
};

export const HEALTH_LABEL: Record<Health, string> = {
  iyi: "İyi",
  orta: "Orta",
  zayif: "Zayıf",
  kritik: "Kritik",
  bos: "Veri yok",
};
```

