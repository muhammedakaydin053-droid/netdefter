/**
 * Müfredat türetme — `curriculum.json`'dan SALT OKUNUR.
 *
 * Mevcut müfredat dosyası değiştirilmez, kopyalanmaz; yalnızca TYT/AYT →
 * ders → konu bağımlı seçimleri için türetilir. Böylece planlama motorunun
 * kullandığı tek kaynak ile birebir tutarlı kalır.
 */
import curriculum from "@/data/curriculum.json";

interface CurriculumRow {
  exam: "TYT" | "AYT";
  subject: string;
  topic: string;
  subtopic: string;
}

const ROWS = curriculum as CurriculumRow[];

export type ExamName = "TYT" | "AYT";

/** Verilen sınav için dersler (müfredat sırasına göre, tekilleştirilmiş). */
export function subjectsFor(exam: ExamName): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of ROWS) {
    if (r.exam !== exam) continue;
    if (seen.has(r.subject)) continue;
    seen.add(r.subject);
    out.push(r.subject);
  }
  return out;
}

/** Verilen sınav + ders için konular (müfredat sırasına göre). */
export function topicsFor(exam: ExamName, subject: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of ROWS) {
    if (r.exam !== exam || r.subject !== subject) continue;
    if (seen.has(r.topic)) continue;
    seen.add(r.topic);
    out.push(r.topic);
  }
  return out;
}

/** Bir (sınav, ders, konu) üçlüsü müfredatta var mı? */
export function isValidTriple(exam: string, subject: string, topic: string): boolean {
  return ROWS.some((r) => r.exam === exam && r.subject === subject && r.topic === topic);
}

/** Verilen sınav+ders için tüm alt konular (opsiyonel kullanım). */
export function subtopicsFor(exam: ExamName, subject: string, topic: string): string[] {
  return ROWS.filter((r) => r.exam === exam && r.subject === subject && r.topic === topic).map(
    (r) => r.subtopic,
  );
}
