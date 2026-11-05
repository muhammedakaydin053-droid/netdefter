/**
 * Ders programının omurgası: konu sırası + faz takvimi.
 *
 * Faz matematiği `timeline.ts` içinde (saf, test edilebilir). Burada ona
 * `curriculum.json` sırası ve AYT kapı bilgisi eklenir.
 *
 * Faz mantığı: TYT çekirdeği önce, AYT kapılar açıldıkça paralel, son dönem
 * deneme + genel tekrar. Pazar her fazda hafif kalır (motor ayrıca kısar).
 */

import curriculum from "@/data/curriculum.json";
import { BIO_SKIP_FOR_FAST, FIZ_AYT_GATE, KIM_AYT_GATE, MAT_AYT_GATE } from "@/data/roadmap";

export { buildTimeline, phaseFor, teachingDays, type Phase, type PhaseId } from "@/data/timeline";

type TopicJson = { exam: "TYT" | "AYT"; subject: string; topic: string; subtopic: string };

/** curriculum.json'daki yazım sırasını koruyarak ders ders konu dizisi üretir. */
function buildOrder(): Record<string, string[]> {
  const order: Record<string, string[]> = {};
  for (const row of curriculum as TopicJson[]) {
    const key = `${row.exam}|${row.subject}`;
    const list = order[key] ?? (order[key] = []);
    if (!list.includes(row.topic)) list.push(row.topic);
  }
  return order;
}

export const studyOrder = buildOrder();

export function orderOf(exam: "TYT" | "AYT", subject: string): string[] {
  return studyOrder[`${exam}|${subject}`] ?? [];
}

/** Konunun ders içindeki sırası; bilinmeyen konu listenin sonuna düşer. */
export function orderIndex(exam: string, subject: string, topic: string): number {
  const list = studyOrder[`${exam}|${subject}`];
  if (!list) return 999;
  const i = list.indexOf(topic);
  return i < 0 ? 999 : i;
}


/**
 * Konunun hangi fazda çalışılması gerektiğini söyler.
 * AYT konuları kapı açılana kadar "beklemede" sayılır.
 */
export function isCoreTopic(exam: string, subject: string, topic: string): boolean {
  if (exam !== "TYT") return false;
  if (subject === "Matematik") return MAT_AYT_GATE.includes(topic);
  if (subject === "Fizik") return FIZ_AYT_GATE.includes(topic);
  if (subject === "Kimya") return KIM_AYT_GATE.includes(topic);
  if (subject === "Biyoloji") return !BIO_SKIP_FOR_FAST.includes(topic);
  return false;
}

/**
 * Sıra baskısı: ders içinde sırası gelen konuya küçük ama sürekli bir avantaj.
 * `lead` kadar konu geride kalanlar ceza alır, sırası gelmiş olan ödül alır.
 */
export function orderBoost(exam: string, subject: string, topic: string, finished: Set<string>, lead = 3): number {
  const list = studyOrder[`${exam}|${subject}`];
  if (!list) return 0;
  const idx = list.indexOf(topic);
  if (idx < 0) return 0;
  let doneBefore = 0;
  for (let i = 0; i < idx; i++) if (finished.has(`${exam}|${subject}|${list[i]}`)) doneBefore += 1;
  const remaining = idx - doneBefore;
  if (remaining <= 0) return 0.14;
  if (remaining <= lead) return 0.1;
  return -Math.min(0.35, (remaining - lead) * 0.02);
}

/** Ders içinde sırası gelen ilk bitmemiş konu; yoksa null. */
export function nextInOrder(exam: string, subject: string, finished: Set<string>): string | null {
  for (const topic of studyOrder[`${exam}|${subject}`] ?? []) {
    if (!finished.has(`${exam}|${subject}|${topic}`)) return topic;
  }
  return null;
}

/**
 * Sürekli pratik konuları: "konu anlatımı" olarak hiç açılmaz, her gün soru
 * çözümü olarak yapılır (motorun `ONGOING` listesi).
 *
 * İki yerde birden gerekir:
 *  - Sert sıra kontrolünde "başlanmış" sayılmalı, yoksa arkalarındaki konular
 *    (ör. Paragraf'tan sonraki Türkçe konuları) asla açılamaz.
 *  - Kalan konu sayısından düşülmeli, yoksa sayaç hiç sıfırlanmaz ve motor
 *    "TYT bitmedi" sanıp AYT'yi hiç açmaz.
 */
const ONGOING_KEYS = new Set(["TYT|Türkçe|Paragraf", "TYT|Matematik|Problemler"]);

/** Bu konu günlük pratik olarak mı yapılıyor (konu anlatımı olarak açılmaz)? */
export function isOngoingTopic(exam: string, subject: string, topic: string): boolean {
  return ONGOING_KEYS.has(`${exam}|${subject}|${topic}`);
}

/**
 * Sert sıra kontrolü: konunun başlatılabilmesi için ders içinde kendinden önceki
 * bütün konuların başlanmış olması gerekir.
 *
 * `started` — bitmiş konular + bugün plana girmiş yeni konular. Aynı gün ardışık
 * iki konu alınabilmesi için bugünün planı da buraya katılır.
 *
 * Neden sert: `orderBoost` yalnızca yumuşak bir puan avantajıydı; motor sıradaki
 * konuları atlayıp ilerideki bir konuyu (ör. AYT Matematik'te Fonksiyonlar'ı,
 * Mantık/Kümeler dururken) açabiliyordu. Kullanıcı sıranın kesin korunmasını
 * istedi.
 */
export function orderAllowed(exam: string, subject: string, topic: string, started: Set<string>): boolean {
  const list = studyOrder[`${exam}|${subject}`];
  if (!list) return true;
  const idx = list.indexOf(topic);
  if (idx < 0) return true;
  for (let i = 0; i < idx; i++) {
    const key = `${exam}|${subject}|${list[i]}`;
    if (ONGOING_KEYS.has(key)) continue;
    if (!started.has(key)) return false;
  }
  return true;
}
