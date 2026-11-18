import { create } from "zustand";
import { persist } from "zustand/middleware";
import curriculum from "@/data/curriculum.json";
import { uid, todayISO } from "@/lib/utils";
import { clampTopicPatch, n, sanitizeCounts } from "@/lib/calc";
import type { TopicRow, WrongRow, TytExam, AytExam, DailyRow, Status } from "@/lib/types";
import {
  addCounts,
  classifyDaily,
  deltaOf,
  freeBase,
  isBoundSession,
  sessionApplied,
  sessionInputInvalid,
  topicLocked,
  type SessionInput,
  type SessionPatch,
} from "@/lib/sessions";
import {
  DEFAULT_SETTINGS,
  EXAM_TARGETS,
  type CarryItem,
  type ScheduleSettings,
} from "@/lib/smart/types";
import { suggestedReviewDate, toMin } from "@/lib/smart/engine";
import {
  ensureFrozen,
  frozenWindowStart,
  refreezeIntraday,
  type FrozenPlan,
  type PlanInputs,
} from "@/lib/smart/frozen";
import type { BackupData } from "@/lib/backup";

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

/**
 * Kayıtlı konu verisini aktif müfredatla birleştirir ve müfredatta artık
 * bulunmayan kayıtları ayrı arşiv listesine taşır.
 *
 * Eşleştirme yalnızca TAM kimlik (`id`) eşitliğiyle yapılır. Benzer ad, ders
 * veya alt konu tahminiyle birleştirme yapılmaz: yanlış konuya bağlanmak,
 * kaydı arşivde tutmaktan daha kötüdür.
 *
 * Aktif `topics` yalnızca `seedTopics()` kimliklerinden üretilir; bu yüzden
 * arşiv kayıtları planlama motoruna, günlük plana veya istatistiğe sızamaz.
 * Arşiv, girdi sırasıyla tekilleştirilir (aynı id iki kez birleşse de kopya
 * oluşmaz) ve her zaman müfredat dışı kayıtlarla sınırlıdır.
 */
export function mergeTopicsWithArchive(
  existing: TopicRow[],
  archived: TopicRow[] = [],
): { topics: TopicRow[]; archivedTopics: TopicRow[] } {
  const liveIds = new Set(seedTopics().map((t) => t.id));
  const existingMap = new Map(existing.map((t) => [t.id, t]));
  const archivedMap = new Map(archived.map((t) => [t.id, t]));

  const topics = seedTopics().map((fresh) => {
    const old = existingMap.get(fresh.id) ?? archivedMap.get(fresh.id);
    return old
      ? {
          ...fresh,
          ...old,
          id: fresh.id,
          exam: fresh.exam,
          subject: fresh.subject,
          topic: fresh.topic,
          subtopic: fresh.subtopic,
        }
      : fresh;
  });

  // Girdiler sırayla birleştirilir; aynı id ikinci kez gelirse son kayıt kazanır.
  // Böylece kayıt tekrar tekrar birleştirilse de arşivde kopya birikmez.
  const archivedById = new Map<string, TopicRow>();
  for (const t of [...existing, ...archived]) {
    if (!liveIds.has(t.id)) archivedById.set(t.id, t);
  }

  return { topics, archivedTopics: [...archivedById.values()] };
}

/** Geriye dönük uyumlu sarmalayıcı: yalnızca aktif konu listesini döndürür. */
export function mergeTopics(existing: TopicRow[]): TopicRow[] {
  return mergeTopicsWithArchive(existing).topics;
}

/**
 * Ayar nesnesini güvenli varsayılanlarla doldurur ve SINAV TARİHİNİ projenin
 * değişmez hedefine sabitler.
 *
 * `examDate` kullanıcı ayarı gibi görünse de planın geri sayım çapasıdır;
 * yanlışlıkla değişirse tüm program sessizce kayar. Hangi yoldan gelirse gelsin
 * (kayıtlı veri, içe aktarma, geri yükleme) sabit değere çekilir. DİKKAT:
 * `programStart` bilerek DOKUNULMAZ — o kullanıcı tarafından ayarlanabilir.
 */
export function sanitizeSettings(
  settings: Partial<ScheduleSettings> | undefined | null,
): ScheduleSettings {
  return { ...DEFAULT_SETTINGS, ...settings, examDate: EXAM_TARGETS.tyt };
}

export interface DataSnapshot {
  at: string;
  topics: TopicRow[];
  archivedTopics: TopicRow[];
  wrongs: WrongRow[];
  tytExams: TytExam[];
  aytExams: AytExam[];
  daily: DailyRow[];
  settings: ScheduleSettings;
  carry: CarryItem[];
  /** Yanlış kaydı kimliği → analiz edildiği tarih. */
  analyzedWrongs: Record<string, string>;
  /** `exam|subject` → son branş denemesi tarihi. */
  branchMockHistory: Record<string, string>;
}

export interface AppState {
  topics: TopicRow[];
  archivedTopics: TopicRow[];
  wrongs: WrongRow[];
  tytExams: TytExam[];
  aytExams: AytExam[];
  daily: DailyRow[];
  settings: ScheduleSettings;
  carry: CarryItem[];
  /** Yanlış kaydı kimliği → analiz edildiği tarih. Mükerrer analizi önler. */
  analyzedWrongs: Record<string, string>;
  /** `exam|subject` → son branş denemesi tarihi. Branş rotasyonunu yönetir. */
  branchMockHistory: Record<string, string>;
  /**
   * Dondurulmuş program penceresi (`tarih` → günün görevleri). Bir kez üretilir ve
   * konu/soru verisi değişince YENİDEN HESAPLANMAZ; böylece kaydetmek geleceği
   * sessizce değiştirmez. Takvim ilerledikçe pencere YALNIZCA ileri kayar: örtüşen
   * günler ve görev kimlikleri aynen korunur, yalnızca yeni günler üretilir.
   * Bkz. `lib/smart/frozen.ts`.
   */
  frozenPlan: FrozenPlan;
  /**
   * `frozenPlan`'ın üretildiği çıpa (`planPace.from`), yalnızca izleme/teşhis
   * amaçlıdır. Normal gün geçişinde ilerler ve pencereyi GEÇERSİZ KILMAZ;
   * pencerenin gerçekten yeniden kurulması `frozenPlan: {}` ile yapılır.
   */
  frozenPlanFrom: string;
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
  /**
   * Günlük kaydını siler. Bağlı oturumda `applied` çıkarılır (negatifse reddedilir);
   * orphan/malformed kayıt yalnız `confirm: true` ile ve kümülatife dokunmadan silinir.
   * Bağımsız kayıt mevcut davranışla silinir.
   */
  removeDaily: (id: string, opts?: { confirm?: boolean }) => void;
  /**
   * Konularım'dan yeni bir bağlı çalışma oturumu ekler: hem `daily` kaydını
   * oluşturur hem konunun kümülatifine gerçek deltayı ekler (tek atomik işlem).
   * `id` form açılışında üretilir; aynı ID varsa işlem reddedilir (idempotans).
   */
  addSession: (input: SessionInput) => boolean;
  /** Geçerli bağlı oturumu düzenler; yalnız delta uygular. Reddedilirse `false`. */
  updateSession: (id: string, patch: SessionPatch) => boolean;
  /**
   * Geçerli bağlı oturumu siler ve `applied` katkısını kümülatiften çıkarır.
   * Negatif sonuç oluşacaksa işlem reddedilir (sessiz kırpma yapılmaz).
   * Orphan/malformed silme yalnız `confirmOrphan: true` ile ve kümülatife dokunmadan yapılır.
   */
  removeSession: (id: string, opts?: { confirmOrphan?: boolean }) => boolean;
  /**
   * Bir konuya bağlı oturumların bağını çözer (kalıcı, geri alınamaz). Kümülatif
   * DEĞİŞMEZ; `applied` korunur; `origin`/`topicId` temizlenir. Yalnız geçerli
   * bağlı oturumlar çözülür; açık onay (`confirm`) şarttır. Başarılıysa `true`.
   */
  unlockTopic: (topicId: string, opts?: { confirm?: boolean }) => boolean;
  updateSettings: (patch: Partial<ScheduleSettings>) => void;
  missYesterday: () => void;
  clearCarry: () => void;
  /** Yanlış analizi yapılan kayıtları (id → tarih) işaretler. */
  markWrongsAnalyzed: (ids: string[], date: string) => void;
  /** Bir derse branş denemesi verildiğini (ders → tarih) işaretler. */
  markBranchMock: (subject: string, date: string) => void;
  /**
   * Dondurulmuş program penceresini tamamlar. Henüz dondurulmamış günleri üretir;
   * dolu günlere DOKUNMAZ (kayma önleyici). Takvim ilerlemesi pencereyi baştan
   * kurmaz; yeniden kurulum yalnızca pencere `{}` yapıldığında (ayar değişikliği,
   * sıfırlama, geri yükleme, içe aktarma, yeniden planlama) olur.
   */
  ensurePlan: () => void;
  /**
   * Gün içi ayarları (uyanma/uyuma/yemek/spor/serbest zaman) uygular ve
   * dondurulmuş pencerenin YALNIZCA saatlerini günceller. Görev kimliği, tarihi,
   * sırası, konusu, türü ve süresi korunur; sığmayan görevler silinmez, `unplaced`
   * olarak işaretlenir ve taşma `frozenPlan` günlerinden türetilir.
   */
  applyIntradaySettings: (patch: Partial<ScheduleSettings>) => void;
  replanProgram: (from?: string) => void;
  resetAll: () => void;
  restoreBackup: () => void;
  importData: (data: BackupData) => void;
  setAiComment: (text: string) => void;
}

/**
 * Değiştiğinde dondurulmuş program penceresini geçersiz kılan ayar alanları.
 * Uyanma/uyku gibi yalnızca gün içi blokları etkileyen alanlar burada DEĞİLDİR;
 * onlar pencereyi baştan kurmayı gerektirmez (kayma yaratmasın diye).
 */
const planAffectingKeys: (keyof ScheduleSettings)[] = [
  "programStart",
  "examDate",
  "studyMinutes",
  "weeklyHours",
  "mockWeekdays",
];

/**
 * Bir ayar yamasının dondurulmuş program penceresini yeniden kurmayı gerektirip
 * gerektirmediği. Arayüz, planı etkileyen bir ayar değiştiğinde kullanıcıyı
 * uyarabilmek için bunu kullanır (bkz. `program.tsx` `SettingsForm`). Uyanma/uyku
 * gibi yalnızca gün içi blokları etkileyen ayarlar burada SAYILMAZ.
 */
export function planAffectingChange(patch: Partial<ScheduleSettings>): boolean {
  return planAffectingKeys.some((k) => k in patch);
}

/**
 * Yalnızca gün içi yaşam bloklarını ve görev saatlerini etkileyen ayar alanları.
 * Bunlar dondurulmuş pencereyi baştan KURMAZ; yalnızca `refreezeIntraday` ile
 * saatler yeniden hesaplanır (kimlik/tarih/sıra/içerik korunur).
 */
export const intradayKeys: (keyof ScheduleSettings)[] = [
  "wake",
  "sleep",
  "sportDays",
  "sportStart",
  "sportEnd",
  "meals",
  "leisure",
];

/**
 * Bir ayar yamasının gün içi yeniden yerleştirmeyi gerektirip gerektirmediği.
 * Arayüz, bu ayarlar değiştiğinde kullanıcıdan onay ister (bkz. `program.tsx`).
 * Planı tamamen etkileyen alanlar (`planAffectingChange`) burada SAYILMAZ.
 */
export function intradayChange(patch: Partial<ScheduleSettings>): boolean {
  return intradayKeys.some((k) => k in patch);
}

/** Gün içi yeniden yerleştirme sonucu taşan günler (arayüz uyarısı için). */
export interface IntradayOverflow {
  /** Gün → yeni aralıklara sığmayan görev sayısı. */
  byDate: Record<string, number>;
  total: number;
}

/**
 * Dondurulmuş pencereden gün içi taşma özetini türetir. Görevler silinmediği
 * için taşma kalıcı bir durumdur; arayüz bunu her açılışta `frozenPlan`'dan
 * hesaplar, ayrı bir state tutulmaz.
 *
 * Yalnızca `from` (varsayılan: bugün) ve sonrası sayılır: geçmiş günler
 * kullanıcı tarafından değiştirilemez, dolayısıyla uyarıya dahil edilmezler.
 */
export function intradayOverflow(plan: FrozenPlan, from = todayISO()): IntradayOverflow | null {
  const byDate: Record<string, number> = {};
  let total = 0;
  for (const [date, day] of Object.entries(plan)) {
    if (date < from) continue;
    const n = day.slots.filter((s) => s.unplaced).length;
    if (n > 0) {
      byDate[date] = n;
      total += n;
    }
  }
  return total > 0 ? { byDate, total } : null;
}

function snapshot(s: AppState): DataSnapshot {
  return {
    at: new Date().toISOString(),
    topics: s.topics,
    archivedTopics: s.archivedTopics,
    wrongs: s.wrongs,
    tytExams: s.tytExams,
    aytExams: s.aytExams,
    daily: s.daily,
    settings: s.settings,
    carry: s.carry,
    analyzedWrongs: s.analyzedWrongs,
    branchMockHistory: s.branchMockHistory,
  };
}

/**
 * Kayıtlı (persist) ayarların sürümü. Bir kayıtta bu sürümden eski bir `version`
 * görülürse `migratePersistedState` çalışır.
 */
export const PERSIST_VERSION = 8;

/**
 * `merge` ile `onRehydrateStorage` arasındaki tek seferlik onarım sinyali.
 * `merge` ham kayıtta bozuk `examDate` görürse `true` yapar; geri çağrı bunu
 * okuyup düzeltilmiş değeri diske yazar ve sıfırlar. Modül düzeyinde tutulur
 * çünkü `merge` dönüş değeri persist tarafından tüketilir, bu bilgi taşınamaz.
 */
let hydrateExamDateRepair = false;

/** v0 varsayılanı: takvim kaydırmasından önceki program başlangıcı. */
export const LEGACY_PROGRAM_START = "2026-11-01";
/** v1 varsayılanı (artık eski): şartnameyle uyuşmayan 1 gün gerideki başlangıç. */
export const V1_PROGRAM_START = "2026-11-04";
/** v2 varsayılanı (artık eski): 05.11.2026 program başlangıcı. */
export const V2_PROGRAM_START = "2026-11-05";
/** v3 varsayılanı (artık eski): 09.11.2026 Pazartesi program başlangıcı. */
export const V3_PROGRAM_START = "2026-11-09";
/** v4 varsayılanı (artık eski): 10.11.2026 Salı program başlangıcı. */
export const V4_PROGRAM_START = "2026-11-10";
/** v5 varsayılanı (artık eski): 11.11.2026 Çarşamba program başlangıcı. */
export const V5_PROGRAM_START = "2026-11-11";
/** v6 varsayılanı (artık eski): 13.11.2026 Cuma program başlangıcı. */
export const V6_PROGRAM_START = "2026-11-13";
/** v7 varsayılanı (artık eski): 16.11.2026 Pazartesi program başlangıcı. */
export const V7_PROGRAM_START = "2026-11-16";
/** Güncel varsayılan: 17.11.2026 Salı program başlangıcı. */
export const MIGRATED_PROGRAM_START = "2026-11-17";

/**
 * Eski kayıtlı durumu güncel şemaya taşır — SAF ve tek seferlik.
 *
 * Sürümlü zincir, `programStart` TAM OLARAK eski bir varsayılana eşitse
 * ilerletilir: v0 (`2026-11-01`) → v1 (`2026-11-04`) → v2 (`2026-11-05`)
 * → v3 (`2026-11-09`) → v4 (`2026-11-10`) → v5 (`2026-11-11`) → v6 (`2026-11-13`)
 * → v7 (`2026-11-16`) → v8 (`2026-11-17`).
 * Kullanıcı başka bir tarihe elle ayarladıysa DOKUNULMAZ; aksi hâlde kişisel plan
 * bozulurdu.
 *
 * Girdi mutasyona uğratılmaz (sığ kopya alınır); `topics`, `wrongs`, `tytExams`,
 * `aytExams`, `daily`, `archivedTopics`, `carry` ve diğer ayar alanları aynen
 * korunur. Fonksiyon idempotenttir: aynı girdiyle tekrar çağrılsa sonuç değişmez
 * (zincir yalnızca TAM varsayılan eşleşmesinde ilerler, uç değere ulaşınca durur).
 */
export function migratePersistedState(persisted: unknown, fromVersion: number): unknown {
  const p =
    persisted && typeof persisted === "object"
      ? { ...(persisted as Record<string, unknown>) }
      : ({} as Record<string, unknown>);

  if (fromVersion >= PERSIST_VERSION) return p;

  const rawSettings = p.settings;
  if (rawSettings && typeof rawSettings === "object") {
    const settings = { ...(rawSettings as Record<string, unknown>) };
    // v0 -> v1: 3 günlük kaydırma.
    if (settings.programStart === LEGACY_PROGRAM_START) settings.programStart = V1_PROGRAM_START;
    // v1 -> v2: şartnameyle hizalama (05.11.2026).
    if (settings.programStart === V1_PROGRAM_START) settings.programStart = V2_PROGRAM_START;
    // v2 -> v3: önceki program başlangıcı (09.11.2026 Pazartesi).
    if (settings.programStart === V2_PROGRAM_START) settings.programStart = V3_PROGRAM_START;
    // v3 -> v4: önceki program başlangıcı (10.11.2026 Salı).
    if (settings.programStart === V3_PROGRAM_START) settings.programStart = V4_PROGRAM_START;
    // v4 -> v5: önceki program başlangıcı (11.11.2026 Çarşamba).
    if (settings.programStart === V4_PROGRAM_START) settings.programStart = V5_PROGRAM_START;
    // v5 -> v6: önceki program başlangıcı (13.11.2026 Cuma).
    if (settings.programStart === V5_PROGRAM_START) settings.programStart = V6_PROGRAM_START;
    // v6 -> v7: önceki program başlangıcı (16.11.2026 Pazartesi).
    if (settings.programStart === V6_PROGRAM_START) settings.programStart = V7_PROGRAM_START;
    // v7 -> v8: yeni program başlangıcı (17.11.2026 Salı).
    if (settings.programStart === V7_PROGRAM_START) settings.programStart = MIGRATED_PROGRAM_START;
    p.settings = settings;
  }
  return p;
}

/**
 * Bir günlük kaydını silmenin TEK ortak politikası. `removeDaily` ve `removeSession`
 * aynı mantığı kullanır ki koruma zamanla ayrışmasın.
 *
 *  - `bound`: `applied` kümülatiften çıkarılır (hedef canlı `topics` veya
 *    `archivedTopics` içinde olabilir). Hedef ARŞİVLENMİŞSE açık onay (`confirm`)
 *    gerekir. Negatif sonuç oluşacaksa REDDEDİLİR (sessiz `Math.max(0, …)` YOK).
 *  - `orphan` / `malformed`: açık onay (`confirm`) yoksa REDDEDİLİR. Onaylıysa
 *    yalnız `daily` satırı silinir; kümülatife DOKUNULMAZ (tahmin/düzeltme yok).
 *  - `independent`: mevcut serbest silme davranışı (onay gerekmez).
 *
 * Dönüş: `{ ok, reason }`. `reason`, UI'nin kullanıcıya göstereceği kısa nedendir.
 * Reddedilen işlemde `daily` ve `topics` HİÇ değişmez.
 */
export function removeDailyEntry(
  s: Pick<AppState, "topics" | "daily" | "archivedTopics">,
  id: string,
  opts?: { confirm?: boolean },
): {
  ok: boolean;
  reason?: string;
  daily?: DailyRow[];
  topics?: TopicRow[];
  archivedTopics?: TopicRow[];
} {
  const row = s.daily.find((d) => d.id === id);
  if (!row) return { ok: false, reason: "Kayıt bulunamadı." };

  const cls = classifyDaily(row, s.topics, s.archivedTopics);

  if (cls === "bound") {
    // Hedef konu CANLI (`topics`) veya ARŞİVLENMİŞ (`archivedTopics`) olabilir.
    // `isBoundSession` her ikisini de bağlı sayar; silme de aynı kapsamı görmelidir
    // ki arşivlenmiş hedefe bağlı oturum kilitli kalmasın. Katkı YALNIZ kaydın
    // gerçek hedefinden düşülür; diğer konu ve katmanlar değişmez.
    const inTopics = s.topics.some((t) => t.id === row.topicId);
    // Arşivlenmiş hedef artık canlı listede görünmediği için silme AÇIK ONAY ister;
    // onay verilirse katkı YALNIZ o arşiv kaydından düşülür, diğer katmanlar değişmez.
    if (!inTopics && !opts?.confirm) {
      return {
        ok: false,
        reason: "Arşivlenmiş konuya bağlı oturum; silme kümülatif katkıyı geri alır. Onay ister.",
      };
    }
    const topic = (inTopics ? s.topics : s.archivedTopics).find((t) => t.id === row.topicId);
    if (!topic) return { ok: false, reason: "Bağlı konu bulunamadı." };
    const a = row.applied!;
    if (
      n(topic.total) - a.total < 0 ||
      n(topic.correct) - a.correct < 0 ||
      n(topic.wrong) - a.wrong < 0
    ) {
      return {
        ok: false,
        reason: "Bu oturumun katkısı mevcut toplamdan büyük; silme toplamı negatife düşürürdü.",
      };
    }
    const dec = (t: TopicRow): TopicRow => ({
      ...t,
      total: addCounts(t.total, -a.total),
      correct: addCounts(t.correct, -a.correct),
      wrong: addCounts(t.wrong, -a.wrong),
      // `lastStudy` silmede GERİ ALINMAZ (elle girilmiş olabilir).
    });
    return {
      ok: true,
      daily: s.daily.filter((d) => d.id !== id),
      // Yalnız hedef katman değişir; diğeri referans olarak aynen korunur.
      ...(inTopics
        ? { topics: s.topics.map((t) => (t.id === topic.id ? dec(t) : t)) }
        : { archivedTopics: s.archivedTopics.map((t) => (t.id === topic.id ? dec(t) : t)) }),
    };
  }

  if (cls === "orphan" || cls === "malformed") {
    if (!opts?.confirm) {
      return {
        ok: false,
        reason:
          cls === "orphan"
            ? "Konu bulunamadı; kümülatif katkı güvenle geri alınamaz. Silme onay ister."
            : "Bağlantı alanları tutarsız; silme onay ister.",
      };
    }
    // Yalnız `daily`'den çıkar; kümülatif değişmez.
    return { ok: true, daily: s.daily.filter((d) => d.id !== id) };
  }

  // Bağımsız kayıt: mevcut davranış.
  return { ok: true, daily: s.daily.filter((d) => d.id !== id) };
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      topics: seedTopics(),
      archivedTopics: [],
      wrongs: [],
      tytExams: [],
      aytExams: [],
      daily: [],
      settings: DEFAULT_SETTINGS,
      carry: [],
      analyzedWrongs: {},
      branchMockHistory: {},
      frozenPlan: {},
      frozenPlanFrom: "",
      backup: null,
      lastAiComment: null,
      updateTopic: (id, patch) =>
        set({
          topics: get().topics.map((t) => {
            if (t.id !== id) return t;
            // KİMLİK ALANLARI her zaman reddedilir: `subtopic` kimliğin parçasıdır
            // (`exam|subject|topic|subtopic`) ve `merge` bunları müfredattan zorlar.
            // Değiştirilirse `id` ile çelişir ve bağlı oturum bağı kopar.
            const {
              id: _id,
              exam: _exam,
              subject: _subject,
              topic: _topic,
              subtopic: _subtopic,
              ...safePatch
            } = patch;
            void _id;
            void _exam;
            void _subject;
            void _topic;
            void _subtopic;

            const touchesCounts =
              "total" in safePatch || "correct" in safePatch || "wrong" in safePatch;
            // KİLİT: konuda geçerli bağlı oturum varsa kümülatif salt-okunurdur.
            // Kümülatifi değiştirmek için önce oturumların bağı çözülmelidir.
            if (
              touchesCounts &&
              topicLocked(t.id, get().daily, get().topics, get().archivedTopics)
            ) {
              return t;
            }

            // Yazma tarafı güvencesi: geçersiz soru sayıları (negatif,
            // toplamdan fazla doğru, toplam yokken doğru) kaydedilmez.
            // Yalnızca düzenlenen alanlar kırpılır; ilgisiz bir güncelleme
            // mevcut kaydı sessizce değiştirmez.
            const counts = clampTopicPatch(t, safePatch);
            const next = { ...t, ...safePatch, ...counts };
            if (
              (safePatch.lastStudy ||
                safePatch.total != null ||
                safePatch.correct != null ||
                safePatch.status) &&
              !next.reviewDate
            ) {
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
        set((s) => {
          const row = s.daily.find((t) => t.id === id);
          if (!row) return {};
          // BAĞLI / ORPHAN / MALFORMED: yalnızca `minutes` ve `note` değiştirilebilir.
          // Soru sonuçları/kimlik/tarih yalnız `updateSession` üzerinden değişir; aksi
          // hâlde kümülatif ile oturum desenkron olur. Malformed kayıtlar da yanlışlıkla
          // bağımsız gibi serbest bırakılmaz.
          if (classifyDaily(row, s.topics, s.archivedTopics) !== "independent") {
            const next: Partial<DailyRow> = {};
            if ("minutes" in patch) next.minutes = patch.minutes ?? null;
            if ("note" in patch) next.note = patch.note ?? "";
            if (Object.keys(next).length === 0) return {};
            return { daily: s.daily.map((t) => (t.id === id ? { ...t, ...next } : t)) };
          }
          // Bağımsız kayıt: mevcut serbest davranış korunur.
          return { daily: s.daily.map((t) => (t.id === id ? { ...t, ...patch } : t)) };
        }),
      removeDaily: (id, opts) =>
        set((s) => {
          const res = removeDailyEntry(s, id, opts);
          if (!res.ok) return {};
          // Hedef canlı (`topics`) veya arşiv (`archivedTopics`) olabilir; yalnız
          // dönen katmanlar yazılır, diğeri korunur.
          const patch: Partial<AppState> = {};
          if (res.daily) patch.daily = res.daily;
          if (res.topics) patch.topics = res.topics;
          if (res.archivedTopics) patch.archivedTopics = res.archivedTopics;
          return patch;
        }),
      /**
       * Konularım'dan yeni bağlı çalışma oturumu ekler. Tek `set()` içinde hem
       * `daily` kaydı hem konunun kümülatifi güncellenir (atomik).
       *
       * Reddetme koşulları: ID zaten var (idempotans), hedef konu yok, geçersiz
       * soru sayısı (kümülatif katkısı yok). Reddedilirse HİÇBİR katman yazılmaz.
       */
      addSession: (input) => {
        const s = get();
        if (!input || !input.id) return false;
        if (s.daily.some((d) => d.id === input.id)) return false; // çift gönderim
        const topic = s.topics.find((t) => t.id === input.topicId);
        if (!topic) return false; // hedef konu yok
        if (sessionInputInvalid(input)) return false; // negatif/geçersiz sayı

        const counts = sanitizeCounts(input.questions, input.correct, input.wrong);
        const applied = sessionApplied(
          freeBase(topic, s.daily, s.topics, s.archivedTopics),
          counts,
        );

        const date = input.date ?? todayISO();
        const minutes = input.minutes == null ? null : input.minutes;
        const row: DailyRow = {
          id: input.id,
          date,
          subject: topic.subject,
          topic: topic.topic,
          kind: input.kind,
          minutes,
          questions: counts.total,
          correct: counts.correct,
          wrong: counts.wrong,
          note: input.note ?? "",
          topicId: topic.id,
          origin: "session",
          applied,
        };

        set({
          topics: s.topics.map((t) => {
            if (t.id !== topic.id) return t;
            const next = {
              ...t,
              total: addCounts(t.total, applied.total),
              correct: addCounts(t.correct, applied.correct),
              wrong: addCounts(t.wrong, applied.wrong),
              // `lastStudy` YALNIZ ileri taşınır; geriye alınmaz.
              lastStudy: t.lastStudy && t.lastStudy > date ? t.lastStudy : date,
            };
            if (!next.reviewDate) next.reviewDate = suggestedReviewDate(next);
            return next;
          }),
          daily: [row, ...s.daily],
        });
        return true;
      },
      /**
       * Geçerli bağlı oturumu düzenler. Yalnızca eski `applied` ile yeni `applied`
       * arasındaki fark kümülatife uygulanır; diğer oturumların katkısı etkilenmez.
       * Geçersiz/tutarsız durumda hiçbir yazma yapılmaz.
       */
      updateSession: (id, patch) => {
        const s = get();
        const row = s.daily.find((d) => d.id === id);
        if (!row || !isBoundSession(row, s.topics, s.archivedTopics)) return false;
        const topic = s.topics.find((t) => t.id === row.topicId);
        if (!topic) return false;

        const prev = row.applied!;
        const base = freeBase(topic, s.daily, s.topics, s.archivedTopics);
        const newQuestions = "questions" in patch ? (patch.questions ?? null) : row.questions;
        const newCorrect = "correct" in patch ? (patch.correct ?? null) : row.correct;
        const newWrong = "wrong" in patch ? (patch.wrong ?? null) : row.wrong;
        if (
          sessionInputInvalid({ questions: newQuestions, correct: newCorrect, wrong: newWrong })
        ) {
          return false; // negatif/geçersiz sayı → reddet
        }
        const counts = sanitizeCounts(newQuestions, newCorrect, newWrong);
        const newApplied = sessionApplied(base, counts);

        const delta = deltaOf(newApplied, prev);
        const date = "date" in patch ? (patch.date ?? row.date) : row.date;

        // Kümülatif negatife düşecekse reddet (sessiz kırpma yok).
        if (
          n(topic.total) + delta.total < 0 ||
          n(topic.correct) + delta.correct < 0 ||
          n(topic.wrong) + delta.wrong < 0
        ) {
          return false;
        }

        set({
          topics: s.topics.map((t) => {
            if (t.id !== topic.id) return t;
            const next = {
              ...t,
              total: addCounts(t.total, delta.total),
              correct: addCounts(t.correct, delta.correct),
              wrong: addCounts(t.wrong, delta.wrong),
              lastStudy: t.lastStudy && t.lastStudy > date ? t.lastStudy : date,
            };
            if (!next.reviewDate) next.reviewDate = suggestedReviewDate(next);
            return next;
          }),
          daily: s.daily.map((d) =>
            d.id === id
              ? {
                  ...d,
                  questions: counts.total,
                  correct: counts.correct,
                  wrong: counts.wrong,
                  applied: newApplied,
                  date,
                  ...("minutes" in patch ? { minutes: patch.minutes ?? null } : {}),
                  ...("note" in patch ? { note: patch.note ?? "" } : {}),
                }
              : d,
          ),
        });
        return true;
      },
      /**
       * Geçerli bağlı oturumu siler; `applied` katkısını kümülatiften çıkarır.
       *
       * - Negatif sonuç oluşacaksa REDDEDİLİR (sessiz `Math.max(0, …)` YOK).
       * - Orphan (hedef konu yok): yalnız `confirmOrphan: true` ile ve kümülatife
       *   DOKUNMADAN silinir; aksi hâlde reddedilir.
       * - Bağımsız/tutarsız eski kayıtlar bu işlemle kümülatiften düşülmez.
       */
      removeSession: (id, opts) => {
        const s = get();
        const row = s.daily.find((d) => d.id === id);
        if (!row) return false;
        // Oturum işlemi yalnız oturum kayıtları içindir; bağımsız kayıt `removeDaily`'ye aittir.
        if (classifyDaily(row, s.topics, s.archivedTopics) === "independent") return false;
        // `removeDaily` ile AYNI politika: bağlı → applied çıkar (negatifse reddet);
        // orphan/malformed → onay ister, yalnız daily'den çıkar, kümülatife dokunmaz.
        const res = removeDailyEntry(s, id, { confirm: opts?.confirmOrphan });
        if (!res.ok) return false;
        const patch: Partial<AppState> = {};
        if (res.daily) patch.daily = res.daily;
        if (res.topics) patch.topics = res.topics;
        if (res.archivedTopics) patch.archivedTopics = res.archivedTopics;
        set(patch);
        return true;
      },
      /**
       * Bir konuya bağlı oturumların bağını çözer (kalıcı). Kümülatif DEĞİŞMEZ;
       * `applied` korunur; `origin` ve `topicId` temizlenir; kullanıcı notuna
       * dokunulmaz. Yalnızca geçerli bağlı oturumlar çözülebilir; orphan/malformed
       * kayıtlar bu API ile çözülemez. Açık onay (`confirm`) şarttır; işlem geri
       * alınamaz. Başarılı çözmede `true` döner (aksi hâlde hiçbir şey yapılmadı).
       */
      unlockTopic: (topicId, opts) => {
        if (!opts?.confirm) return false;
        const s = get();
        const targets = s.daily.filter(
          (d) => d.topicId === topicId && isBoundSession(d, s.topics, s.archivedTopics),
        );
        if (targets.length === 0) return false;
        const ids = new Set(targets.map((d) => d.id));
        set({
          daily: s.daily.map((d) =>
            ids.has(d.id) ? { ...d, topicId: undefined, origin: undefined } : d,
          ),
        });
        return true;
      },
      updateSettings: (patch) =>
        set((s) => {
          // Planı etkileyen bir ayar değiştiyse dondurulmuş pencere GEÇERSİZ olur.
          // Pencere ile çıpası TEK BİRİM olarak temizlenir (bkz. `resetAll`,
          // `restoreBackup`, `importData`); aksi hâlde tutarsız bir ara durum kalır.
          // Sınav tarihi sabit hedeftir; UI ya da başka bir çağrı gönderse bile
          // yok sayılır ve her zaman `EXAM_TARGETS.tyt` olarak yazılır.
          const safePatch: Partial<ScheduleSettings> = { ...patch };
          delete safePatch.examDate;
          const invalidate = planAffectingChange(safePatch);
          return {
            settings: { ...s.settings, ...safePatch, examDate: EXAM_TARGETS.tyt },
            frozenPlan: invalidate ? {} : s.frozenPlan,
            frozenPlanFrom: invalidate ? "" : s.frozenPlanFrom,
          };
        }),
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
      ensurePlan: () => {
        const s = get();
        const inputs: PlanInputs = {
          topics: s.topics,
          daily: s.daily,
          wrongs: s.wrongs,
          tytExams: s.tytExams,
          aytExams: s.aytExams,
          settings: s.settings,
          carry: s.carry,
        };
        // Takvim ilerlemesi (gün geçişi) NORMAL bir pencere kaymasıdır; pencereyi
        // baştan kurma sebebi DEĞİLDİR. `ensureFrozen` mevcut günleri aynen korur
        // ve yalnızca henüz üretilmemiş yeni tarihleri ekler. Pencereyi gerçekten
        // yeniden kurmak gerektiğinde (`updateSettings`, `replanProgram`,
        // `resetAll`, `restoreBackup`, `importData`) `frozenPlan` zaten `{}`
        // yapılır; burada `stale` benzeri bir çıpa karşılaştırması YAPILMAZ, aksi
        // hâlde her gün geçişinde gelecekteki görevler yeniden üretilip kayardı.
        const from = frozenWindowStart(inputs);
        const next = ensureFrozen(inputs, s.frozenPlan, from);
        if (next === s.frozenPlan && s.frozenPlanFrom === from) return;
        set({ frozenPlan: next, frozenPlanFrom: from });
      },
      markWrongsAnalyzed: (ids, date) =>
        set((s) => {
          const next = { ...s.analyzedWrongs };
          for (const id of ids) next[id] = date;
          return { analyzedWrongs: next };
        }),
      markBranchMock: (subject, date) =>
        set((s) => ({ branchMockHistory: { ...s.branchMockHistory, [`TYT|${subject}`]: date } })),
      /**
       * Gün içi ayarları uygular ve dondurulmuş pencerenin YALNIZCA saatlerini
       * günceller (bkz. `refreezeIntraday`).
       *
       * - Ayarlar yeni hâliyle kaydedilir.
       * - Geçmiş günler, bugünün tamamlanmış/başlamış görevleri ve bu görevlerin
       *   saatleri korunur.
       * - Bugünün başlamamış görevleri ile gelecek 30 gün yeni aralıklara yerleşir.
       * - Henüz üretilmemiş günler normal `ensureFrozen` akışıyla eklenir.
       * - Sığmayan görevler silinmez; `unplaced` işaretlenir ve günün `overflow`
       *   sayacı artar (arayüz uyarısı buradan türetilir).
       */
      applyIntradaySettings: (patch) =>
        set((s) => {
          const settings = { ...s.settings, ...patch };
          const inputs: PlanInputs = {
            topics: s.topics,
            daily: s.daily,
            wrongs: s.wrongs,
            tytExams: s.tytExams,
            aytExams: s.aytExams,
            settings,
            carry: s.carry,
          };
          const today = todayISO();
          const from = frozenWindowStart(inputs);
          // Bugünün tamamlanmış/başlamış görevleri korunur. Tamamlanmış görev, bugün
          // girilmiş günlük kaydıyla eşleşen (ders|konu) görevdir; başlamış görev ise
          // saati bugünkü ana göre geçmiş olan görevdir.
          const completedKeys = new Set(
            s.daily
              .filter((d) => d.date === today && d.subject && d.topic)
              .map((d) => `${d.subject}|${d.topic}`),
          );
          const now = new Date();
          const nowMin = now.getHours() * 60 + now.getMinutes();
          const protectedIds = new Set<string>();
          for (const slot of s.frozenPlan[today]?.slots ?? []) {
            if (completedKeys.has(`${slot.subject}|${slot.topic}`)) protectedIds.add(slot.id);
            else if (toMin(slot.start) < nowMin) protectedIds.add(slot.id);
          }
          // Bugün de yeniden yerleşir: tamamlanmış/başlamış görevler korunur,
          // kalanlar "şimdi"den sonraki boş aralıklara konur. Geçmiş günler
          // (çıpadan önce) dokunulmadan kalır.
          const floorByDate = { [today]: nowMin };
          const reflowed = refreezeIntraday(
            inputs,
            s.frozenPlan,
            from,
            new Set(),
            protectedIds,
            floorByDate,
          );
          // Henüz üretilmemiş günler normal akışla eklenir (mevcut günlere dokunmaz).
          const next = ensureFrozen(inputs, reflowed, from);
          return { settings, frozenPlan: next, frozenPlanFrom: from };
        }),

      /** Programı bugünden yeniden planlar: konu/deneme verisi korunur, takvim yeniden çapalanır. */
      replanProgram: (from) =>
        set({
          settings: { ...get().settings, programStart: from ?? todayISO() },
          // Takvim yeniden çapalanınca eski dondurulmuş pencere geçersizdir.
          frozenPlan: {},
          frozenPlanFrom: "",
        }),
      resetAll: () => {
        const s = get();
        set({
          backup: snapshot(s),
          topics: seedTopics(),
          // Arşiv kullanıcı verisidir; sıfırlama yalnızca aktif çalışma
          // durumunu temizler, geçmiş kayıtları silmez.
          archivedTopics: s.archivedTopics,
          wrongs: [],
          tytExams: [],
          aytExams: [],
          daily: [],
          carry: [],
          // Yanlışlar ve denemeler silindiğine göre bunlara bağlı analiz/rotasyon
          // işaretleri de temizlenir; aksi hâlde yeni kayıtlar eski işaretlere
          // takılırdı. `backup` sayesinde geri alınabilir.
          analyzedWrongs: {},
          branchMockHistory: {},
          // Takvim bugüne çapalanır; eski dondurulmuş pencere geçersizdir.
          frozenPlan: {},
          frozenPlanFrom: "",
          lastAiComment: null,
          settings: { ...s.settings, programStart: todayISO(), examDate: EXAM_TARGETS.tyt },
        });
      },
      restoreBackup: () => {
        const b = get().backup;
        if (!b) return;
        const merged = mergeTopicsWithArchive(b.topics, b.archivedTopics ?? []);
        set({
          topics: merged.topics,
          archivedTopics: merged.archivedTopics,
          wrongs: b.wrongs,
          tytExams: b.tytExams,
          aytExams: b.aytExams,
          daily: b.daily,
          settings: sanitizeSettings(b.settings),
          carry: b.carry,
          // Yedek, işaretleri de taşır. Eski (alanı olmayan) bir yedekten
          // dönülüyorsa güvenli varsayılan: boş nesne. Böylece geri yükleme
          // sonrası eski kayıtlardan kalan işaretler yeni duruma sızmaz.
          analyzedWrongs: b.analyzedWrongs ?? {},
          branchMockHistory: b.branchMockHistory ?? {},
          // Yedekteki veriyle program yeniden kurulur; eski pencere geçersizdir.
          frozenPlan: {},
          frozenPlanFrom: "",
        });
      },

      /**
       * JSON yedeğinden veri yükler. Çağıran yalnızca doğrulanmış
       * (`parseBackup` ok:true) veri geçmelidir.
       *
       * Önce mevcut durum `backup` alanına alınır (sıfırlamadaki ile aynı
       * mekanizma); böylece içe aktarma sonrası "Yedeği geri al" çalışır.
       *
       * Arşiv BİRLEŞTİRİLİR, değiştirilmez: yedekteki arşiv kayıtları mevcut
       * arşivle birleşir. Böylece `archivedTopics` alanı olmayan (veya boş)
       * eski formatlı bir yedek, elde duran arşiv kayıtlarını silmez. Aynı
       * kimlik iki tarafta da varsa mevcut kayıt korunur; kayıt hiçbir alanını
       * yitirmez. Konular da `mergeTopicsWithArchive` ile birleştirilir: aktif
       * liste yalnızca müfredat kimliklerinden üretilir, arşiv aktif listeye
       * karışmaz ve müfredata dönen konu eski verisini geri alır.
       */
      importData: (data) => {
        if (!data || !Array.isArray(data.topics)) return;
        const s = get();
        // Mevcut arşiv sona eklenir; aynı kimlikte mevcut kayıt kazanır ve
        // hiçbir alanı kaybolmaz (merge girdileri sırayla, son kayıt geçerli).
        const archived = [...(data.archivedTopics ?? []), ...s.archivedTopics];
        const merged = mergeTopicsWithArchive(data.topics, archived);
        set({
          backup: snapshot(s),
          topics: merged.topics,
          archivedTopics: merged.archivedTopics,
          wrongs: data.wrongs ?? [],
          tytExams: data.tytExams ?? [],
          aytExams: data.aytExams ?? [],
          daily: data.daily ?? [],
          settings: sanitizeSettings(data.settings),
          carry: data.carry ?? [],
          // Eski sürüm yedeklerinde bu alanlar yoktur; güvenli varsayılan boş
          // nesnedir. Yedekte varsa aynen geri yüklenir, yoksa eski işaretler
          // taşınmaz (yeni yedek üzerine eski durum sızmaz).
          analyzedWrongs: data.analyzedWrongs ?? {},
          branchMockHistory: data.branchMockHistory ?? {},
          // İçe aktarılan veriyle program yeniden kurulur; eski pencere geçersizdir.
          frozenPlan: {},
          frozenPlanFrom: "",
        });
      },
      setAiComment: (text) => set({ lastAiComment: { at: new Date().toISOString(), text } }),
    }),
    {
      name: "netdefter-yks-v1",
      version: PERSIST_VERSION,
      skipHydration: true,
      // Eski kayıtlardaki `programStart: "2026-11-01"` değerini yeni takvime
      // taşır; kullanıcının elle girdiği tarihlere dokunmaz (bkz. fonksiyon).
      migrate: migratePersistedState,
      // `merge` sınav tarihini bellekte sabitler ama Zustand hidrasyon sırasında
      // diske geri YAZMAZ; bu yüzden bozuk ham kayıt (örn. 1999) diskte kalırdı.
      // `merge` onarım gerektiğini aşağıdaki bayrağa yazar; bu geri çağrı yalnızca
      // gerektiğinde (tek seferlik) düzeltilmiş değeri diske yazar.
      onRehydrateStorage: () => (state) => {
        const needsRepair = hydrateExamDateRepair;
        hydrateExamDateRepair = false;
        if (needsRepair && state) {
          useAppStore.setState((s) => ({
            settings: { ...s.settings, examDate: EXAM_TARGETS.tyt },
          }));
        }
      },
      partialize: (s) => ({
        topics: s.topics,
        archivedTopics: s.archivedTopics,
        wrongs: s.wrongs,
        tytExams: s.tytExams,
        aytExams: s.aytExams,
        daily: s.daily,
        settings: s.settings,
        carry: s.carry,
        analyzedWrongs: s.analyzedWrongs,
        branchMockHistory: s.branchMockHistory,
        frozenPlan: s.frozenPlan,
        frozenPlanFrom: s.frozenPlanFrom,
        backup: s.backup,
        lastAiComment: s.lastAiComment,
      }),
      merge: (persisted, current) => {
        const p =
          (persisted as Partial<
            Pick<
              AppState,
              | "topics"
              | "archivedTopics"
              | "wrongs"
              | "tytExams"
              | "aytExams"
              | "daily"
              | "settings"
              | "carry"
              | "analyzedWrongs"
              | "branchMockHistory"
              | "frozenPlan"
              | "frozenPlanFrom"
              | "backup"
              | "lastAiComment"
            >
          >) ?? {};
        // Eski yedeklerde `archivedTopics` yoktur; boş arşivle güvenle devam edilir.
        const merged = mergeTopicsWithArchive(p.topics ?? [], p.archivedTopics ?? []);
        // Ham kayıtta tarih VARSA ve hedeften farklıysa onarım gerekir. Alan hiç
        // yoksa ya da `settings` yoksa yazma yapılmaz (eksik alan zaten
        // `sanitizeSettings` ile bellekte tamamlanır; diskte kalması zararsızdır).
        const rawSettings = p.settings as { examDate?: unknown } | undefined;
        hydrateExamDateRepair =
          !!rawSettings &&
          rawSettings.examDate !== undefined &&
          rawSettings.examDate !== EXAM_TARGETS.tyt;
        return {
          ...current,
          ...p,
          topics: merged.topics,
          archivedTopics: merged.archivedTopics,
          settings: sanitizeSettings(p.settings),
          carry: p.carry ?? [],
          analyzedWrongs: p.analyzedWrongs ?? {},
          branchMockHistory: p.branchMockHistory ?? {},
          // Eski kayıtlarda `frozenPlan` yoktur; boş pencere güvenlidir ve
          // uygulama açılışında `ensurePlan` ile doldurulur.
          frozenPlan: p.frozenPlan ?? {},
          frozenPlanFrom: p.frozenPlanFrom ?? "",
          backup: p.backup ?? null,
        };
      },
    },
  ),
);
