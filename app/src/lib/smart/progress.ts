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

import { countsIssue, sanitizeCounts } from "../calc.ts";

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
  wrong?: number | null;
}): LearningStage {
  if (row.status === "Tekrar Gerekli") return "tekrar-gerekli";
  // Geçersiz veri (negatif, toplamdan fazla doğru, toplam yokken doğru,
  // doğru+yanlış toplamı aşan) "öğrenildi" sayılmaz; kırpılmış değer
  // üzerinden eşik geçilmiş gibi görünemez. `wrong` verilmezse eski
  // davranış korunur.
  const invalid = countsIssue(row.total, row.correct, row.wrong ?? null) != null;
  const { total, correct } = sanitizeCounts(row.total, row.correct, row.wrong ?? null);
  const t = total ?? 0;
  const c = correct ?? 0;
  if (row.status === "Bitti") {
    // "Bitti" tek başına öğrenildi demek değil: temel soru çözümü şart.
    if (!invalid && t >= MIN_QUESTIONS_FOR_MASTERED && t > 0 && c / t >= MASTERY_RATIO) {
      return "ogrenildi";
    }
    return t > 0 ? "temel-soru" : "anlatim";
  }
  if (row.status === "Çalışıyorum") return t > 0 ? "temel-soru" : "anlatim";
  return t > 0 ? "temel-soru" : "gorulmedi";
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
  /** Ham veri geçersiz mi (negatif, toplamdan fazla doğru vb.). */
  invalid: boolean;
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
  wrong?: number | null;
}): StageExplanation {
  const issue = countsIssue(row.total, row.correct, row.wrong ?? null);
  const invalid = issue != null;
  // Açıklama kırpılmış (güvenli) değerler üzerinden yazılır; böylece "41/40"
  // gibi imkânsız bir ifade ekrana çıkmaz.
  const { total: st, correct: sc } = sanitizeCounts(row.total, row.correct, row.wrong ?? null);
  const total = st ?? 0;
  const correct = sc ?? 0;
  const ratio = total > 0 ? correct / total : 0;
  const completed = row.status === "Bitti";
  const enoughQuestions = total >= MIN_QUESTIONS_FOR_MASTERED;
  const enoughSuccess = total > 0 && ratio >= MASTERY_RATIO;
  // Geçersiz veri asla "öğrenildi" sayılmaz; `learningStage` ile tutarlı kalır.
  const mastered = !invalid && completed && enoughQuestions && enoughSuccess;

  const pct = Math.round(ratio * 100);
  const targetPct = Math.round(MASTERY_RATIO * 100);
  const needsReview = row.status === "Tekrar Gerekli";
  const missing: string[] = [];
  // "Tekrar Gerekli" konular çalışılmıştır; eksik olan tamamlanma değil, tekrardır.
  // Bu yüzden "tamamlanmadı" yerine tekrara özgü gerekçe yazılır.
  if (invalid) missing.push(`geçersiz soru verisi: ${issue}`);
  else if (needsReview) missing.push("tekrar gerekli olarak işaretlendi");
  else if (!completed) missing.push("konu tamamlandı olarak işaretlenmedi");
  if (!enoughQuestions) missing.push(`yeterli soru verisi yok (${total}/${MIN_QUESTIONS_FOR_MASTERED})`);
  if (!enoughSuccess) missing.push(`başarı oranı düşük (%${pct} < %${targetPct})`);

  let summary: string;
  if (invalid) {
    summary = `Geçersiz soru verisi (${issue}). Düzeltilmeden öğrenildi sayılmaz; kırpılmış değer: ${correct}/${total} (%${pct}).`;
  } else if (mastered) {
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
    invalid,
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
