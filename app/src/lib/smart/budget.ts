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

/**
 * Dönemsel günlük planlama kapasitesi (dakika).
 *
 * Varsayılan `studyMinutes` (240) bu eğriyi geçersiz kılamaz: program başlangıcı
 * bu dönemlerin içinde olduğundan etkin kapasite her zaman eğriden gelir.
 * Değerler zorunlu doldurulacak süre değil, motorun görev yoğunluğunu
 * belirlerken dikkate aldığı üst sınırdır.
 */
export const CAPACITY_CURVE: { from: string; minutes: number }[] = [
  { from: "2026-11-01", minutes: 330 },
  { from: "2026-12-01", minutes: 390 },
  { from: "2027-01-01", minutes: 480 },
];

/** Verilen gün için etkin günlük kapasite. Eğri kapsamı dışında `fallback`. */
export function dailyCapacity(date: string, fallback = 240): number {
  let minutes = fallback;
  for (const point of CAPACITY_CURVE) {
    if (date >= point.from) minutes = point.minutes;
  }
  return Math.max(fallback, minutes);
}

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
  {
    sunday = false,
    protectReviews = false,
    practiceSlots = 0,
  }: { sunday?: boolean; protectReviews?: boolean; practiceSlots?: number } = {},
): BudgetSplit {
  // Pazar günü yeni konu açılmaz; kalan her şey tekrara gider.
  if (sunday) return { newTopicReserve: 0, reviewCap: Math.max(0, budget - fixedMinutes) };
  const room = Math.max(0, budget - fixedMinutes);
  let newTopicReserve = Math.min(perDay * TOPIC_MINUTES, room);
  if (protectReviews && newTopicReserve > TOPIC_MINUTES) newTopicReserve -= TOPIC_MINUTES;
  // Tekrarların bütçeyi tamamen doldurup başlanmış konuların soru çözümünü
  // (pratik) açlığa itmesini engelle. Pratik payı tekrar tavanından düşülür;
  // aksi hâlde yeni konu + tekrar `room`u bitirir ve hiçbir konu "Bitti" olamaz.
  const practiceReserve = Math.min(practiceSlots * TOPIC_MINUTES, Math.max(0, room - newTopicReserve));
  return { newTopicReserve, reviewCap: Math.max(0, room - newTopicReserve - practiceReserve) };
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
