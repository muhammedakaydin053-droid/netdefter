/**
 * Deneme sıklık bantları ve yuvarlanan ortalama — saf, veriye bağlı değil.
 *
 * Ayrı dosyada tutulmasının nedeni test edilebilirlik: burada `@/` takma adı
 * veya JSON importu yok, `node --test` doğrudan yükleyebilir. Konu verisine
 * bakan kararlar `mock-plan.ts` içindedir.
 *
 * ÖNEMLİ — bu bantlar kaynaklarda kesin baraj olarak geçmiyor:
 * Saruhan Kurs "tek bir yüzdesi veya kesin kuralı yoktur" diyor, Aile ve
 * Eğitim kendi tablosunu "editoryal öneri" sayıyor, YKSMax net aralıklarının
 * bilimsel baraj olmadığını belirtiyor. Aşağıdakiler bu program için üretilmiş
 * yaklaşık planlama önerileridir; net eşiği altında kalan öğrenci denemeden
 * mahrum bırakılmaz, yalnızca sıklık düşürülür.
 */

export interface MockStage {
  id: string;
  label: string;
  minCoverage: number;
  maxCoverage: number;
  /** Yaklaşık net aralığı — yalnızca planlama/gösterim amaçlı, baraj değil. */
  nets: [number, number] | null;
  /** Önerilen haftalık deneme sayısı. */
  perWeek: number;
}

export const TYT_MOCK_STAGES: MockStage[] = [
  { id: "seviye", label: "İlk seviye belirleme", minCoverage: 0, maxCoverage: 0.35, nets: null, perWeek: 0.35 },
  { id: "seyrek", label: "İlk seyrek denemeler", minCoverage: 0.35, maxCoverage: 0.5, nets: [25, 40], perWeek: 0.4 },
  { id: "rutin", label: "Düzenli deneme rutini", minCoverage: 0.5, maxCoverage: 0.7, nets: [40, 55], perWeek: 1 },
  { id: "sik", label: "Sıklığı artırma", minCoverage: 0.7, maxCoverage: 0.85, nets: [55, 70], perWeek: 1.5 },
  { id: "son", label: "Son dönem", minCoverage: 0.85, maxCoverage: 1.01, nets: null, perWeek: 2 },
];

export const AYT_MOCK_STAGES: MockStage[] = [
  { id: "seviye", label: "İlk seviye belirleme", minCoverage: 0, maxCoverage: 0.35, nets: null, perWeek: 0.25 },
  { id: "seyrek", label: "İlk genel denemeler", minCoverage: 0.35, maxCoverage: 0.5, nets: [10, 20], perWeek: 0.4 },
  { id: "rutin", label: "Düzenli deneme rutini", minCoverage: 0.5, maxCoverage: 0.7, nets: [20, 30], perWeek: 1 },
  { id: "sik", label: "Sıklığı artırma", minCoverage: 0.7, maxCoverage: 0.85, nets: [30, 45], perWeek: 1.5 },
  { id: "son", label: "Son dönem", minCoverage: 0.85, maxCoverage: 1.01, nets: null, perWeek: 2 },
];

export function stageFor(stages: MockStage[], coverage: number): MockStage {
  // Kapsam 0–1 aralığına kırpılır: negatif veya 1'den büyük değerler yanlış banda düşmesin.
  const c = Math.max(0, Math.min(1, coverage));
  return stages.find((s) => c >= s.minCoverage && c < s.maxCoverage) ?? stages.at(-1)!;
}

/**
 * Son N denemenin ortalaması ve eğilimi.
 *
 * Tek denemeye göre karar vermemek için (YKSMax: "Tek denemedeki yükseliş veya
 * düşüş büyük kararlar için yeterli değildir").
 */
export function rollingAverage<T>(
  exams: T[],
  netOf: (e: T) => number | null,
  window = 3,
): { avg: number | null; count: number; trend: number } {
  const withNet = exams.filter((e) => netOf(e) != null);
  const sorted = [...withNet].sort((a, b) =>
    String((a as { date?: string }).date ?? "").localeCompare(String((b as { date?: string }).date ?? "")),
  );
  const last = sorted.slice(-window).map((e) => netOf(e) as number);
  if (!last.length) return { avg: null, count: 0, trend: 0 };
  const avg = last.reduce((a, b) => a + b, 0) / last.length;
  const trend = last.length >= 2 ? last[last.length - 1] - last[0] : 0;
  return { avg, count: last.length, trend };
}
