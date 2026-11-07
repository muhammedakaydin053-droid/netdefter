import { create } from "zustand";
import { persist } from "zustand/middleware";
import curriculum from "@/data/curriculum.json";
import { uid, todayISO } from "@/lib/utils";
import { clampTopicPatch } from "@/lib/calc";
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
      ? { ...fresh, ...old, id: fresh.id, exam: fresh.exam, subject: fresh.subject, topic: fresh.topic, subtopic: fresh.subtopic }
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
  importData: (data: BackupData) => void;
  setAiComment: (text: string) => void;
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
  };
}

/**
 * Kayıtlı (persist) ayarların sürümü. Bir kayıtta bu sürümden eski bir `version`
 * görülürse `migratePersistedState` çalışır.
 */
export const PERSIST_VERSION = 3;

/** v0 varsayılanı: takvim kaydırmasından önceki program başlangıcı. */
export const LEGACY_PROGRAM_START = "2026-11-01";
/** v1 varsayılanı (artık eski): şartnameyle uyuşmayan 1 gün gerideki başlangıç. */
export const V1_PROGRAM_START = "2026-11-04";
/** v2 varsayılanı (artık eski): 05.11.2026 program başlangıcı. */
export const V2_PROGRAM_START = "2026-11-05";
/** Güncel varsayılan: 09.11.2026 Pazartesi program başlangıcı. */
export const MIGRATED_PROGRAM_START = "2026-11-09";

/**
 * Eski kayıtlı durumu güncel şemaya taşır — SAF ve tek seferlik.
 *
 * Sürümlü zincir, `programStart` TAM OLARAK eski bir varsayılana eşitse
 * ilerletilir: v0 (`2026-11-01`) → v1 (`2026-11-04`) → v2 (`2026-11-05`)
 * → v3 (`2026-11-09`). Kullanıcı başka bir tarihe elle ayarladıysa
 * DOKUNULMAZ; aksi hâlde kişisel plan bozulurdu.
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
    // v2 -> v3: yeni program başlangıcı (09.11.2026 Pazartesi).
    if (settings.programStart === V2_PROGRAM_START) settings.programStart = MIGRATED_PROGRAM_START;
    p.settings = settings;
  }
  return p;
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
      backup: null,
      lastAiComment: null,
      updateTopic: (id, patch) =>
        set({
          topics: get().topics.map((t) => {
            if (t.id !== id) return t;
            // Yazma tarafı güvencesi: geçersiz soru sayıları (negatif,
            // toplamdan fazla doğru, toplam yokken doğru) kaydedilmez.
            // Yalnızca düzenlenen alanlar kırpılır; ilgisiz bir güncelleme
            // mevcut kaydı sessizce değiştirmez.
            const counts = clampTopicPatch(t, patch);
            const next = { ...t, ...patch, ...counts };
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
          // Arşiv kullanıcı verisidir; sıfırlama yalnızca aktif çalışma
          // durumunu temizler, geçmiş kayıtları silmez.
          archivedTopics: s.archivedTopics,
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
        const merged = mergeTopicsWithArchive(b.topics, b.archivedTopics ?? []);
        set({
          topics: merged.topics,
          archivedTopics: merged.archivedTopics,
          wrongs: b.wrongs,
          tytExams: b.tytExams,
          aytExams: b.aytExams,
          daily: b.daily,
          settings: { ...DEFAULT_SETTINGS, ...b.settings },
          carry: b.carry,
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
          settings: { ...DEFAULT_SETTINGS, ...data.settings },
          carry: data.carry ?? [],
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
      partialize: (s) => ({
        topics: s.topics,
        archivedTopics: s.archivedTopics,
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
              "topics" | "archivedTopics" | "wrongs" | "tytExams" | "aytExams" | "daily" | "settings" | "carry" | "backup" | "lastAiComment"
            >
          >) ?? {};
        // Eski yedeklerde `archivedTopics` yoktur; boş arşivle güvenle devam edilir.
        const merged = mergeTopicsWithArchive(p.topics ?? [], p.archivedTopics ?? []);
        return {
          ...current,
          ...p,
          topics: merged.topics,
          archivedTopics: merged.archivedTopics,
          settings: { ...DEFAULT_SETTINGS, ...p.settings },
          carry: p.carry ?? [],
          backup: p.backup ?? null,
        };
      },
    },
  ),
);
