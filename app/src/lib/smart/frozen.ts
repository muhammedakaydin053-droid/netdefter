/**
 * Dondurulmuş program penceresi.
 *
 * SORUN: `buildDailyPlan` planı her açılışta sıfırdan üretir ve haftayı
 * ZİNCİRLEME kurar (bkz. `buildWeekGrid`). Kullanıcı bir konuya veri girince
 * havuz değişir, zincir baştan çözülür ve GELECEK günlerin görevleri kayar.
 * Ölçüm: ilgisiz bir konuya "Çalışıyorum" yazmak sonraki 7 günün 7'sini de
 * değiştiriyordu.
 *
 * ÇÖZÜM: program bir kez üretilip DONDURULUR ve her görev sabit bir kimlik
 * (`frozen-<tarih>-s<no>`) taşır. Konu durumu / soru sonucu değişince
 * dondurulmuş günler YENİDEN HESAPLANMAZ; yalnızca henüz dondurulmamış günler
 * üretilir. Böylece kaydetmek geleceği sessizce değiştirmez.
 *
 * Bir günün ham görevleri (`slots`) ve korunan blokları (`life`) saklanır; böylece
 * hem hafta ızgarası (`mergeTopicSlots(slots).slice(0,4)`) hem bugünün sırası
 * (`mergeTopicSlots([...slots, ...life])`) canlı motorla BİREBİR aynı üretilir.
 *
 * Geçmiş günler `KEEP_PAST_DAYS` boyunca saklanır, pencere dışı günler atılır.
 * `planPace` çıpası (`from`) kayarsa — program yeniden planlanınca — çağıran taraf
 * pencereyi temizler (bkz. `updateSettings`, `replanProgram`).
 *
 * Bu modül SAF ve DETERMİNİSTİKTİR: `today` dışarıdan verilir; aynı girdi aynı
 * pencereyi üretir. Ders dağılımı ve TYT/AYT önceliği motordan aynen gelir; bu
 * katman planı DEĞİŞTİRMEZ, yalnızca sabitler.
 */
import { buildDailyPlan, freeWindowsForReplan, fromMin, lifeBlocks, mergeTopicSlots, planPace, taughtTopics, toMin } from "@/lib/smart/engine";
import type { CarryItem, PlanSlot, ScheduleSettings } from "@/lib/smart/types";
import type { AytExam, DailyRow, TopicRow, TytExam, WrongRow } from "@/lib/types";
import { addDaysISO, todayISO } from "@/lib/utils";

export interface FrozenDay {
  /** Ham çalışma görevleri (`buildDailyPlan` çıktısı); hafta ızgarası buradan türetilir. */
  slots: PlanSlot[];
  /** Korunan bloklar (yemek/spor/serbest); bugünün sırasına girer. */
  life: PlanSlot[];
  /**
   * Gün içi ayar değişikliği sonrası yeniden yerleştirmede yeni aralıklara
   * sığmayan görev sayısı. Görevler `slots` içinde korunur (bkz. `unplaced`);
   * bu alan yalnızca kullanıcıya uyarı göstermek için tutulur.
   */
  overflow?: number;
}

/** `tarih` → dondurulmuş gün. */
export type FrozenPlan = Record<string, FrozenDay>;

/** Bugünden itibaren dondurulan gün sayısı. */
export const FRESH_DAYS = 30;
/** Pencereden çıktıktan sonra geçmişte saklanan gün sayısı. */
export const KEEP_PAST_DAYS = 7;
/** Hafta ızgarasında bir günde gösterilen en fazla görev (bkz. `buildWeekGrid`). */
export const WEEK_MAX_SLOTS = 4;

export interface PlanInputs {
  topics: TopicRow[];
  daily: DailyRow[];
  wrongs: WrongRow[];
  tytExams: TytExam[];
  aytExams: AytExam[];
  settings: ScheduleSettings;
  carry: CarryItem[];
}

const keyOf = (s: { exam: string; subject: string; topic: string }) => `${s.exam}|${s.subject}|${s.topic}`;

/** Dondurulmuş pencerenin başlangıcı; canlı ızgarayla aynı çıpa (bkz. `planPace`). */
export function frozenWindowStart(inputs: PlanInputs, today = todayISO()): string {
  return planPace(inputs.topics, inputs.settings, today).from;
}

/**
 * `from`'dan başlayarak `FRESH_DAYS` günlük pencereyi döndürür (sınav tarihini
 * aşmaz). `existing` içindeki dolu günler AYNEN korunur; yalnızca eksik günler
 * üretilir. Zincirleme tutarlılık için dolu günlerin anlatımları da zincire
 * uygulanır (bkz. `buildWeekGrid`).
 */
export function ensureFrozen(
  inputs: PlanInputs,
  existing: FrozenPlan = {},
  today = todayISO(),
): FrozenPlan {
  const from = frozenWindowStart(inputs, today);
  const exam = inputs.settings.examDate || from;
  const used = taughtTopics(inputs.topics, inputs.daily);
  let workingTopics = inputs.topics;
  const fresh: FrozenPlan = {};

  for (let i = 0; i < FRESH_DAYS; i++) {
    const date = addDaysISO(from, i);
    if (date > exam) break;
    const day = existing[date] ?? buildFrozenDay(inputs, workingTopics, used, date);
    fresh[date] = day;
    workingTopics = replayDay(day, used, workingTopics, date);
  }

  const pruned = prunePast({ ...existing, ...fresh }, from);
  // Hiçbir şey değişmediyse AYNI referansı döndür; çağıran taraf gereksiz state
  // güncellemesi (ve yeniden render) yapmasın.
  const nextKeys = Object.keys(pruned);
  const prevKeys = Object.keys(existing);
  if (nextKeys.length === prevKeys.length && nextKeys.every((k) => existing[k] === pruned[k])) {
    return existing;
  }
  return pruned;
}

/** Yaşam bloklarını (yemek/spor/serbest) dondurulmuş günle aynı şekle çevirir. */
function lifeFor(settings: ScheduleSettings, date: string): PlanSlot[] {
  const weekday = new Date(date + "T12:00:00").getDay();
  return lifeBlocks(settings, weekday).map((b, n) => ({
    id: `frozen-${date}-l${n}`,
    start: fromMin(b.start),
    end: fromMin(b.end),
    exam: "",
    subject: "",
    topic: b.label,
    kind: "Tekrar",
    targetQ: 0,
    minutes: b.end - b.start,
    priority: "düşük",
    reason: "Korunan yaşam bloğu",
    life: true,
  }));
}

/**
 * Gün içi yeniden yerleştirmede dolu aralıkları (sabit görevler, yaşam blokları,
 * rezerve edilmiş taşan görevler ve daha önce yerleşen görevler) düşerek kalan
 * boş çalışma aralıklarını üretir. Üst sınır uyuma saatidir; hiçbir aralık onu
 * geçmez.
 */
function freeRangesFor(
  settings: ScheduleSettings,
  weekday: number,
  occupied: { start: number; end: number }[],
  floorMinute = 0,
) {
  const out: { start: number; end: number }[] = [];
  for (const w of freeWindowsForReplan(settings, weekday, floorMinute)) {
    let segs = [{ start: w.start, end: w.end }];
    for (const o of occupied) {
      segs = segs.flatMap((sg) =>
        o.end <= sg.start || o.start >= sg.end
          ? [sg]
          : [
              ...(o.start > sg.start ? [{ start: sg.start, end: o.start }] : []),
              ...(o.end < sg.end ? [{ start: o.end, end: sg.end }] : []),
            ],
      );
    }
    out.push(...segs);
  }
  return out.sort((a, b) => a.start - b.start);
}

/**
 * Gün içi ayarlar (uyanma/uyuma/yemek/spor/serbest zaman) değiştiğinde dondurulmuş
 * pencerenin YALNIZCA saatlerini günceller.
 *
 * KORUNAN: görev kimliği, tarihi, sırası, konusu, türü ve süresi. Yalnızca
 * `start`/`end` yeniden hesaplanır.
 *
 * KAPSAM: `from` (pencere çıpası) ve sonrasındaki gelecek günler güncellenir;
 * geçmiş günler (çıpadan önce) ve `lockedDates` (ör. bugün tamamlanmış/başlamış
 * görevleri olan gün) aynen korunur. `protectedIds` içindeki görevlerin saati
 * değiştirilmez; bunlar yeni boş aralıkları da işgal eder.
 *
 * TAŞMA: Bir görev yeni aralıklara sığmazsa SİLİNMEZ. Eski saatiyle `slots`
 * içinde kalır, `unplaced: true` ile işaretlenir ve günün `overflow` sayacı artar.
 * Kullanıcıya "şu gün şu kadar görev sığmadı" bilgisi bu sayaçla verilir.
 */
export function refreezeIntraday(
  inputs: PlanInputs,
  existing: FrozenPlan,
  from: string,
  lockedDates: Set<string> = new Set(),
  protectedIds: Set<string> = new Set(),
  floorByDate: Record<string, number> = {},
): FrozenPlan {
  const plan: FrozenPlan = {};
  for (const [date, day] of Object.entries(existing)) {
    if (date < from || lockedDates.has(date)) {
      plan[date] = day;
      continue;
    }
    const weekday = new Date(date + "T12:00:00").getDay();
    const floorMinute = floorByDate[date] ?? 0;
    const life = lifeFor(inputs.settings, date);
    // Korunan (tamamlanmış/başlamış) görevler saatini ve yerini korur; yeni
    // yerleştirmede dolu sayılır ki üzerlerine görev yazılmasın.
    const fixed = day.slots.filter((s) => protectedIds.has(s.id));
    const movable = day.slots.filter((s) => !protectedIds.has(s.id));
    const fixedRanges = fixed.map((s) => ({ start: toMin(s.start), end: toMin(s.end) }));
    const lifeRanges = life.map((s) => ({ start: toMin(s.start), end: toMin(s.end) }));

    // Görevleri SIRAYI koruyarak yeni boş aralıklara paketler. Her görev, bir
    // öncekinin BAŞLANGICINDAN (`cursor`) önce başlayan bir boşluğa konmaz;
    // böylece kısa bir görev, önceki uzun görevlerin bıraktığı artık boşluğa
    // sıçrayıp öne geçemez. `reserve` sığmayan görevlerin korunacak eski
    // saatleridir; eski konumlar normalde yok sayılır, yalnızca sığmayanların
    // yerleri rezerve edilir ki yeni yerleşen bir görev onların üstüne yazmasın
    // (görev-görev çakışması olmaz).
    const pack = (reserve: { start: number; end: number }[]) => {
      const occupied = [...fixedRanges, ...lifeRanges, ...reserve];
      const out: ({ start: number; end: number } | null)[] = [];
      // Görevler kronolojik sırada gelir; imleç yalnızca ileri taşınır.
      let cursor = 0;
      for (const task of movable) {
        const need = task.minutes;
        const range = freeRangesFor(inputs.settings, weekday, occupied, floorMinute).find(
          (r) => r.start >= cursor && r.end - r.start >= need,
        );
        if (!range) {
          // Sığmayan görev eski saatini korur; mantıksal sıra için imleç en az
          // onun eski başlangıcına çekilir, sonraki görevler öne kaymaz.
          cursor = Math.max(cursor, toMin(task.start));
          out.push(null);
          continue;
        }
        const slot = { start: range.start, end: range.start + need };
        out.push(slot);
        occupied.push(slot);
        cursor = slot.start;
      }
      return out;
    };
    // Sabit nokta: sığmayanların eski yerlerini rezerve ederek yeniden paketle.
    let assignment = pack([]);
    for (let pass = 0; pass <= movable.length; pass++) {
      const reserve = movable
        .filter((_, i) => assignment[i] === null)
        .map((t) => ({ start: toMin(t.start), end: toMin(t.end) }));
      const next = pack(reserve);
      const stable = next.every(
        (v, i) => (v === null) === (assignment[i] === null) && (!v || v.start === assignment[i]!.start),
      );
      assignment = next;
      if (stable) break;
    }

    const finalById = new Map<string, PlanSlot>();
    for (const s of fixed) finalById.set(s.id, s);
    let unplacedCount = 0;
    movable.forEach((task, i) => {
      const range = assignment[i];
      if (!range) {
        unplacedCount++;
        finalById.set(task.id, { ...task, unplaced: true });
        return;
      }
      const rest = { ...task };
      delete rest.unplaced;
      finalById.set(task.id, { ...rest, start: fromMin(range.start), end: fromMin(range.end) });
    });
    // Mantıksal sıra korunur: görevler ESKİ dizideki yerlerinde kalır. Günü saatine
    // göre yeniden sıralamak, eski saatini koruyan taşan görevleri öne taşıyıp sırayı
    // bozardı; bu yüzden burada `sort` YAPILMAZ.
    const slots = day.slots
      .map((s) => finalById.get(s.id))
      .filter((s): s is PlanSlot => s !== undefined);
    plan[date] = {
      slots,
      life,
      ...(unplacedCount > 0 ? { overflow: unplacedCount } : {}),
    };
  }
  return plan;
}


function buildFrozenDay(
  inputs: PlanInputs,
  workingTopics: TopicRow[],
  used: Set<string>,
  date: string,
): FrozenDay {
  const { slots, life } = buildDailyPlan(
    workingTopics,
    inputs.daily,
    inputs.wrongs,
    inputs.tytExams,
    inputs.aytExams,
    inputs.settings,
    inputs.carry,
    date,
    used,
  );
  return {
    slots: slots.map((s, n) => ({ ...s, id: `frozen-${date}-s${n}` })),
    life: life.map((s, n) => ({ ...s, id: `frozen-${date}-l${n}` })),
  };
}

/** Dondurulmuş bir günün anlatılan konularını zincire uygular (bkz. `buildWeekGrid`). */
function replayDay(day: FrozenDay, used: Set<string>, topics: TopicRow[], date: string): TopicRow[] {
  const lectured = new Set<string>();
  for (const sl of day.slots) {
    if (sl.kind === "Konu anlatımı") {
      used.add(keyOf(sl));
      lectured.add(keyOf(sl));
    }
  }
  if (!lectured.size) return topics;
  return topics.map((t) =>
    lectured.has(keyOf(t)) && t.status !== "Bitti"
      ? { ...t, status: "Bitti", lastStudy: date, total: 30, correct: 24, wrong: 6 }
      : t,
  );
}

/** `from`'dan `KEEP_PAST_DAYS` gün öncesine kadarki günleri saklar, gerisini atar. */
function prunePast(plan: FrozenPlan, from: string): FrozenPlan {
  const cutoff = addDaysISO(from, -KEEP_PAST_DAYS);
  const out: FrozenPlan = {};
  for (const [date, day] of Object.entries(plan)) {
    if (date >= cutoff) out[date] = day;
  }
  return out;
}

/**
 * Görünüm sırası — TÜM ekranlar için tek kural: önce yerleşmiş görevler başlangıç
 * saatine göre kronolojik, sonra taşan (`unplaced`) görevler kendi mantıksal
 * sıralarında. Taşan görev eski saatini korur ama artık geçerli sayılmadığı için
 * "Bugünün sırası", "Bugünün planı" ve hafta ızgarasında her zaman EN SONDA
 * gösterilir; böylece bir ekranda başta, diğerinde sonda görünme tutarsızlığı
 * ortadan kalkar. Yerleşmiş görevlerin kendi arasındaki sırası değişmez.
 */
export function sortSlotsForDisplay<T extends { start: string; unplaced?: boolean }>(slots: T[]): T[] {
  const placed = slots.filter((s) => !s.unplaced).sort((a, b) => a.start.localeCompare(b.start));
  const unplaced = slots.filter((s) => s.unplaced);
  return [...placed, ...unplaced];
}

/** Hafta ızgarası için günün görevleri (canlı `buildWeekGrid` ile aynı kural). */
export function frozenWeekSlots(day: FrozenDay | undefined): PlanSlot[] {
  return day ? sortSlotsForDisplay(mergeTopicSlots(day.slots)).slice(0, WEEK_MAX_SLOTS) : [];
}

/** Bugünün sırası için günün tüm zaman çizelgesi (canlı `program.tsx` ile aynı kural). */
export function frozenTimeline(day: FrozenDay | undefined): PlanSlot[] {
  return day ? sortSlotsForDisplay(mergeTopicSlots([...day.slots, ...day.life])) : [];
}

/** Bugünün planı için günün birleştirilmiş görevleri (canlı `smart-panels` ile aynı kural). */
export function frozenTodaySlots(plan: FrozenPlan, today = todayISO()): PlanSlot[] {
  const day = plan[today];
  return day ? sortSlotsForDisplay(mergeTopicSlots(day.slots)) : [];
}

export interface FrozenWeekDay {
  date: string;
  weekday: number;
  light: boolean;
  today: boolean;
  startDay: boolean;
  slots: PlanSlot[];
}

/**
 * Dondurulmuş pencereden 7 günlük hafta ızgarası üretir.
 * Şekil, canlı `buildWeekGrid` ile birebir aynıdır (pazar hafif, bugün ve başlangıç
 * işaretleri dâhil); yalnızca kaynak dondurulmuş günlerdir.
 */
export function frozenWeekGrid(
  plan: FrozenPlan,
  from: string,
  start: string,
  today = todayISO(),
): FrozenWeekDay[] {
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDaysISO(from, i);
    const weekday = new Date(date + "T12:00:00").getDay();
    return {
      date,
      weekday,
      light: weekday === 0,
      today: date === today,
      startDay: date === start,
      slots: frozenWeekSlots(plan[date]),
    };
  });
}
