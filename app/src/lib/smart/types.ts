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
  /** Yanlış analizi görevinin bağlı olduğu yanlış kayıtlarının kimlikleri. */
  wrongIds?: string[];
  life?: boolean;
  /** Birleştirilmiş satırda gösterilen görev türleri (görünüm amaçlı). */
  kinds?: StudyType[];
  /** Birleştirilmiş satırın gerçek saat aralıkları; ör. ["09:30–11:20"]. */
  ranges?: string[];
  /**
   * Gün içi ayar değişikliği sonrası yeniden yerleştirmede bu görev yeni boş
   * aralıklara sığmadı. Görev SİLİNMEZ; eski saati korunur ama artık yeni ayarla
   * uyumlu değildir ve arayüzde "sığmadı" olarak işaretlenir (bkz. `frozen.ts`).
   */
  unplaced?: boolean;
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
  programStart: "2026-11-17",
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

/**
 * Sınav tarihleri — projenin DEĞİŞMEZ hedefleri, kullanıcı ayarı DEĞİLDİR.
 *
 * TYT 19.06.2027 Cumartesi, AYT 20.06.2027 Pazar (ÖSYM 2027-YKS takvimi).
 * `data/targets.ts` `TARGETS.tytExam`/`aytExam` ile birebir aynıdır ve planlama
 * motorunun geri sayım çapasıdır. UI'da salt okunur gösterilir; store
 * `updateSettings` bu alanı yok sayar; eski/hatalı kayıtlı veri `merge`,
 * `importData` ve `restoreBackup` sırasında sessizce sabit değere çekilir.
 */
export const EXAM_TARGETS = {
  /** TYT sınav günü. */
  tyt: "2027-06-19",
  /** AYT sınav günü. */
  ayt: "2027-06-20",
} as const;

export const HEALTH_LABEL: Record<Health, string> = {
  iyi: "İyi",
  orta: "Orta",
  zayif: "Zayıf",
  kritik: "Kritik",
  bos: "Veri yok",
};
