/**
 * Faz takvimi matematiği — veriye bağlı değil, saf fonksiyonlar.
 *
 * `sequence.ts` bu modülü kullanır; ayrı tutulmasının nedeni test edilebilirlik:
 * burada `@/` takma adı veya JSON importu yok, düz göreli import yeter.
 */

import { TARGETS, type Targets } from "./targets.ts";

export type PhaseId = "tyt-core" | "ayt-open" | "sentez" | "deneme" | "final";

export interface Phase {
  id: PhaseId;
  title: string;
  from: string;
  to: string;
  /** Yeni konu açılır mı? */
  newTopics: boolean;
  /** Deneme yoğunluğu: 0 yok, 1 haftada bir, 2 haftada iki. */
  mockIntensity: number;
  body: string;
}

const DAY_MS = 86400000;

/** İki ISO tarih arasındaki gün sayısı (b − a). */
export function daysBetweenISO(a: string, b: string): number {
  return Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / DAY_MS);
}

/** ISO tarihe gün ekler. */
export function addDaysISO(date: string, days: number): string {
  return new Date(Date.parse(date + "T12:00:00Z") + days * DAY_MS).toISOString().slice(0, 10);
}

/** `start` ile `end` arasında `ratio` (0–1) konumundaki tarih. */
function atRatio(start: string, end: string, ratio: number): string {
  const a = Date.parse(start + "T12:00:00Z");
  const b = Date.parse(end + "T12:00:00Z");
  const t = a + Math.round((b - a) * ratio);
  return new Date(t).toISOString().slice(0, 10);
}

/**
 * Programı fazlara böler.
 *
 * Hedef tarihler verilirse (`targets`) fazlar bu çapalara oturur; verilmezse
 * eski oransal dağılım korunur (geriye dönük uyum).
 *
 * `reserveDays` — sınav öncesi yeni konu açılmayan gün sayısı. Varsayılan 14:
 * son iki hafta yalnızca tekrar, deneme ve eksik kapatma.
 */
export function buildTimeline(
  programStart: string,
  examDate: string,
  reserveDays = 14,
  targets: Targets = TARGETS,
): Phase[] {
  const total = Math.max(1, daysBetweenISO(programStart, examDate));

  // Hedef tarihleri programa göre kırp: program başlangıcından önce veya sınavdan
  // sonra kalan hedefler kullanılamaz, yoksa fazlar ters düşer.
  const clamp = (d: string) => (d < programStart ? programStart : d > examDate ? examDate : d);
  // Görünür faz sınırı kullanıcı hedefinden (`tytRound1`) gelir; motorun İÇ
  // tempo çapası (`tytPaceAnchor`) ayrıdır ve `planPace` içinde kullanılır.
  const t1 = clamp(targets.tytRound1);
  const t2 = clamp(targets.aytRound1);
  const t3 = clamp(targets.aytFlex);
  const t4 = clamp(targets.gapFill);

  const usable = Math.max(0, total - reserveDays);
  const r = (x: number) => Math.min(1, x / total);

  // Hedefler ileriyi gösteriyorsa çapa olarak kullan; aksi halde oransal dağılım.
  const ordered = t1 <= t2 && t2 <= t3 && t3 <= t4 && t4 <= examDate;
  const p1 = ordered ? t1 : atRatio(programStart, examDate, r(usable * 0.3));
  const p2 = ordered ? t2 : atRatio(programStart, examDate, r(usable * 0.62));
  const p3 = ordered ? t3 : atRatio(programStart, examDate, r(usable * 0.85));
  const p4 = ordered ? t4 : atRatio(programStart, examDate, r(usable));

  return [
    {
      id: "tyt-core",
      title: "TYT çekirdeği",
      from: programStart,
      to: p1,
      newTopics: true,
      mockIntensity: 1,
      body: "Türkçe paragraf her gün. Matematikte 12 temel konu + problem. Fen ve sosyal ince dilimler. AYT, bu faz bitmeden de açılabilir: matematik kapısı (12 konu), fizik kapısı (4) ve kimya kapısı (5) bitince ilgili AYT dersi başlar.",
    },
    {
      id: "ayt-open",
      title: "AYT açılışı",
      from: p1,
      to: p2,
      newTopics: true,
      mockIntensity: 1,
      body: "Kapı konuları bittikçe ilgili AYT dersi başlar. Matematik kapısı bitince küme–fonksiyon. Biyolojide TYT'yi bitirmek daha sağlıklı; Kalıtım ve Sınıflandırma geriye atılabilir ama silinmez.",
    },
    {
      id: "sentez",
      title: "AYT derinleşme + TYT koruma",
      from: p2,
      to: p3,
      newTopics: true,
      mockIntensity: 2,
      body: "AYT ana yük, TYT tekrarla korunur. Branş denemeleri düzenli hâle gelir. Eksik konular kapatılır.",
    },
    {
      id: "deneme",
      title: "Eksik kapatma ve pekiştirme",
      from: p3,
      to: p4,
      newTopics: false,
      mockIntensity: 2,
      body: "Yeni konu açılmaz. Deneme + yanlış analizi + zayıf konu tekrarı. Net artışı bu fazda gelir.",
    },
    {
      id: "final",
      title: "Son dönem: deneme ağırlıklı",
      from: p4,
      to: examDate,
      newTopics: false,
      mockIntensity: 2,
      body: "TYT ve AYT birlikte: genel deneme, branş denemesi, yanlış analizi, çıkmış sorular, süre yönetimi. TYT çalışması bırakılmaz. Son iki hafta hafif deneme ve uyku düzeni.",
    },
  ];
}

/** Tarihin düştüğü faz. Aralık öncesi ilk faza, aralık sonrası son faza düşer. */
export function phaseFor(timeline: Phase[], date: string): Phase {
  if (timeline.length === 0) throw new Error("timeline boş");
  if (date < timeline[0].from) return timeline[0];
  for (const p of timeline) {
    if (date >= p.from && date < p.to) return p;
  }
  return timeline[timeline.length - 1];
}

/**
 * Yeni konu açılabilen gün sayısı (pazar hariç), `from` ile `finalPhase.from` arası.
 * Sınav öncesi rezerv penceresi buraya girmez.
 */
export function teachingDays(from: string, finalFrom: string): number {
  const total = daysBetweenISO(from, finalFrom);
  if (total <= 0) return 0;
  return total - Math.floor(total / 7);
}
