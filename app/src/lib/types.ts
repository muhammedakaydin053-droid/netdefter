export const STATUSES = ["Başlamadım", "Çalışıyorum", "Bitti", "Tekrar Gerekli"] as const;
export type Status = (typeof STATUSES)[number];

export const WRONG_REASONS = [
  "Dikkat hatası",
  "Bilgi eksikliği",
  "Yöntem eksikliği",
  "Soruyu yanlış okudum",
  "İşlem hatası",
  "İki şık arasında kaldım",
  "Diğer",
] as const;
export type WrongReason = (typeof WRONG_REASONS)[number];

export const REVIEW_RESULTS = ["Tekrar çözüldü", "Hâlâ yanlış", "Artık yapabiliyorum"] as const;
export type ReviewResult = (typeof REVIEW_RESULTS)[number];

export const STUDY_TYPES = [
  "Konu anlatımı",
  "Soru çözümü",
  "Tekrar",
  "Deneme",
  "Yanlış analizi",
] as const;
export type StudyType = (typeof STUDY_TYPES)[number];

export type Exam = "TYT" | "AYT";

export interface TopicRow {
  id: string;
  exam: Exam;
  subject: string;
  topic: string;
  subtopic: string;
  status: Status;
  total: number | null;
  correct: number | null;
  wrong: number | null;
  lastStudy: string;
  reviewDate: string;
  source: string;
  note: string;
}

export interface WrongRow {
  id: string;
  date: string;
  exam: Exam | "";
  subject: string;
  topic: string;
  subtopic: string;
  source: string;
  questionNo: string;
  reason: WrongReason | "";
  note: string;
  reviewDate: string;
  result: ReviewResult | "";
}

export interface TytExam {
  id: string;
  date: string;
  name: string;
  turD: number | null;
  turY: number | null;
  matD: number | null;
  matY: number | null;
  sosD: number | null;
  sosY: number | null;
  fenD: number | null;
  fenY: number | null;
  note: string;
}

export interface AytExam {
  id: string;
  date: string;
  name: string;
  matD: number | null;
  matY: number | null;
  fizD: number | null;
  fizY: number | null;
  kimD: number | null;
  kimY: number | null;
  bioD: number | null;
  bioY: number | null;
  note: string;
}

export interface DailyRow {
  id: string;
  date: string;
  subject: string;
  topic: string;
  kind: StudyType | "";
  minutes: number | null;
  questions: number | null;
  correct: number | null;
  wrong: number | null;
  note: string;
}

export const TYT_SUBJECTS = [
  "Türkçe",
  "Matematik",
  "Geometri",
  "Fizik",
  "Kimya",
  "Biyoloji",
  "Tarih",
  "Coğrafya",
  "Felsefe",
  "Din Kültürü",
] as const;

export const AYT_SUBJECTS = ["Matematik", "Geometri", "Fizik", "Kimya", "Biyoloji"] as const;

export const ALL_SUBJECTS = [
  "Türkçe",
  "Matematik",
  "Geometri",
  "Fizik",
  "Kimya",
  "Biyoloji",
  "Tarih",
  "Coğrafya",
  "Felsefe",
  "Din Kültürü",
] as const;
