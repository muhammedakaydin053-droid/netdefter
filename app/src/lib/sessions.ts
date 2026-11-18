/**
 * Bağlı çalışma oturumları — doğrulama ve saf delta yardımcıları.
 *
 * SORUN: Konularım'daki kümülatif soru sayıları (`topics.total/correct/wrong`) ile
 * Günlük'teki oturum kayıtları (`daily`) iki ayrı yerde elle giriliyordu. Aynı
 * çalışma iki kez kaydedilebiliyor ve iki istatistik tutarsız kalıyordu.
 *
 * ÇÖZÜM: Konularım'dan üretilen her oturum `daily`'ye yazılırken kümülatife
 * eklediği GERÇEK delta (`applied`) da kaydedilir. Böylece:
 *   - kümülatif = serbest taban + Σ(bağlı oturumların `applied`)
 *   - oturum silinince yalnızca kendi `applied`'ı çıkarılır (kesin tersine çevirme)
 *   - kümülatif elle düzeltilecekse önce oturumların bağı çözülür (kilit).
 *
 * Bu modül SAF ve DETERMİNİSTİKTİR: store'a veya UI'a bağlı değildir; yalnızca
 * "bu kayıt geçerli bağlı oturum mu?" sorusunu ve delta matematiğini bilir.
 */
import { clampTopicPatch, n } from "@/lib/calc";
import type { DailyRow, StudyType, TopicRow } from "@/lib/types";

/** Kümülatif üçlü (delta veya taban). */
export interface Counts3 {
  total: number;
  correct: number;
  wrong: number;
}

/** Bağlı oturum sayılabilmesi için gereken en küçük kayıt şekli. */
type SessionLike = Pick<DailyRow, "origin" | "topicId" | "applied" | "questions" | "correct" | "wrong">;

function isNonNegInt(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && Number.isInteger(v) && v >= 0;
}

/**
 * `row` geçerli bir BAĞLI oturum mu?
 *
 * Tüm koşullar birlikte sağlanmalıdır:
 *   - `origin === "session"`
 *   - `topicId` boş olmayan string
 *   - `applied` nesnesi; üç değeri sonlu, tam sayı, >= 0
 *   - `applied.correct + applied.wrong <= applied.total`
 *   - `applied` değerleri ilgili oturum değerlerini aşmaz
 *   - hedef konu `topics` veya `archivedTopics` içinde bulunur
 *
 * Eksik/tutarsız kayıtlar bağlı sayılmaz ve hiçbir koşulda kümülatife otomatik
 * katkı sağlamaz.
 */
export function isBoundSession(
  row: SessionLike,
  topics: TopicRow[],
  archived: TopicRow[] = [],
): boolean {
  if (row.origin !== "session") return false;
  if (typeof row.topicId !== "string" || row.topicId === "") return false;

  const a = row.applied;
  if (!a || typeof a !== "object") return false;
  if (!isNonNegInt(a.total) || !isNonNegInt(a.correct) || !isNonNegInt(a.wrong)) return false;
  if (a.correct + a.wrong > a.total) return false;

  // `applied` oturumun kendi değerlerini aşamaz (kırpma yalnız azaltır).
  if (a.total > n(row.questions)) return false;
  if (a.correct > n(row.correct)) return false;
  if (a.wrong > n(row.wrong)) return false;

  return topics.some((t) => t.id === row.topicId) || archived.some((t) => t.id === row.topicId);
}

/**
 * Orphan: bağlı oturum ALANLARI geçerli (origin/topicId/applied tutarlı) ama
 * hedef konu artık bulunamıyor. Bu kaydın kümülatif katkısı güvenle geri
 * alınamaz; işlemler açık onay gerektirir.
 */
export function isOrphanSession(
  row: SessionLike,
  topics: TopicRow[],
  archived: TopicRow[] = [],
): boolean {
  if (row.origin !== "session") return false;
  if (typeof row.topicId !== "string" || row.topicId === "") return false;

  const a = row.applied;
  if (!a || typeof a !== "object") return false;
  if (!isNonNegInt(a.total) || !isNonNegInt(a.correct) || !isNonNegInt(a.wrong)) return false;
  if (a.correct + a.wrong > a.total) return false;
  if (a.total > n(row.questions)) return false;
  if (a.correct > n(row.correct)) return false;
  if (a.wrong > n(row.wrong)) return false;

  return !(topics.some((t) => t.id === row.topicId) || archived.some((t) => t.id === row.topicId));
}

/**
 * Bir günlük kaydının oturum sınıflandırması. Tek merkezi yardımcı; tüm store
 * işlemleri aynı sınıflandırmayı kullanır ki koruma mantığı zamanla ayrışmasın.
 *
 *  - `independent`: bağlantı alanı taşımayan gerçek bağımsız kayıt. Mevcut
 *    serbest davranışı aynen korur. (`unlockTopic` sonrası `applied` kalabilir;
 *    bağlantı alanları temizlendiği için satır bağımsızdır.)
 *  - `bound`: geçerli bağlı oturum — hedef konu mevcut, `applied` tutarlı.
 *  - `orphan`: oturum alanları geçerli ama hedef konu bulunamıyor.
 *  - `malformed`: `origin` veya `topicId` (bağlantı alanı) taşıyor ama ne bağlı
 *    ne orphan doğrulamasından geçiyor. Yanlışlıkla bağımsız sayılmamalı;
 *    korumalı davranır.
 */
export type SessionClass = "independent" | "bound" | "orphan" | "malformed";

/**
 * Kayıt bir BAĞLANTI alanı (`origin`/`topicId`) taşıyor mu? Malformed tespitinin
 * temeli budur. Yalnız `applied` taşımak bağ iddiası değildir: `unlockTopic`
 * sonrası kalan `applied` satırı bağımsız yapar.
 */
export function carriesSessionLink(row: SessionLike): boolean {
  return row.origin != null || row.topicId != null;
}

/** Kaydı tek merkezi kurala göre sınıflandırır. */
export function classifyDaily(
  row: SessionLike,
  topics: TopicRow[],
  archived: TopicRow[] = [],
): SessionClass {
  if (isBoundSession(row, topics, archived)) return "bound";
  if (isOrphanSession(row, topics, archived)) return "orphan";
  return carriesSessionLink(row) ? "malformed" : "independent";
}

/** Konuda geçerli bağlı oturum var mı? (kümülatif kilitli mi?) */
export function topicLocked(
  topicId: string,
  daily: DailyRow[],
  topics: TopicRow[],
  archived: TopicRow[] = [],
): boolean {
  return daily.some((d) => d.topicId === topicId && isBoundSession(d, topics, archived));
}

/** `applied`'ı hedef konunun kümülatifine ekler. */
export function applyToTopic(topic: TopicRow, applied: Counts3): Partial<TopicRow> {
  return {
    total: n(topic.total) + applied.total,
    correct: n(topic.correct) + applied.correct,
    wrong: n(topic.wrong) + applied.wrong,
  };
}

/**
 * Oturumun `base` tabanına ekleyeceği GERÇEK deltayı hesaplar (kırpma sonrası).
 * `session` değerleri ÖNCEDEN normalize edilmiş (sanitizeCounts) olmalıdır.
 * Soru girilmemişse (total null) delta {0,0,0} olur: oturum geçerlidir (ör. konu
 * anlatımı) ama kümülatife katkısı yoktur.
 */
export function sessionApplied(
  base: { total: number | null; correct: number | null; wrong: number | null },
  session: { total: number | null; correct: number | null; wrong: number | null },
): Counts3 {
  const next = clampTopicPatch(base, {
    total: n(base.total) + n(session.total),
    correct: n(base.correct) + n(session.correct),
    wrong: n(base.wrong) + n(session.wrong),
  });
  return {
    total: n(next.total) - n(base.total),
    correct: n(next.correct) - n(base.correct),
    wrong: n(next.wrong) - n(base.wrong),
  };
}

/**
 * Oturum girdisi geçersiz mi? Negatif veya sonlu olmayan bir sayı (null değil)
 * girilmişse geçersizdir ve işlem reddedilir. `null` = "girilmedi" (geçerli).
 */
export function sessionInputInvalid(session: {
  questions: number | null;
  correct: number | null;
  wrong: number | null;
}): boolean {
  const bad = (v: number | null | undefined) =>
    v != null && (typeof v !== "number" || !Number.isFinite(v) || v < 0);
  return bad(session.questions) || bad(session.correct) || bad(session.wrong);
}

/** Kümülatiften bağlı oturum katkısını düşerek serbest tabanı verir. */
export function baseOf(topic: TopicRow, applied: Counts3): Counts3 {
  return {
    total: Math.max(0, n(topic.total) - applied.total),
    correct: Math.max(0, n(topic.correct) - applied.correct),
    wrong: Math.max(0, n(topic.wrong) - applied.wrong),
  };
}

/**
 * Konunun SERBEST tabanı: kümülatiften konuya ait TÜM geçerli bağlı oturumların
 * `applied`'ı düşülür. Yeni bir oturumun gerçek katkısı bu tabana göre hesaplanır;
 * böylece aynı konuda birden fazla oturum olsa da kırpma doğru çalışır.
 */
export function freeBase(
  topic: TopicRow,
  daily: DailyRow[],
  topics: TopicRow[],
  archived: TopicRow[] = [],
): Counts3 {
  let total = n(topic.total);
  let correct = n(topic.correct);
  let wrong = n(topic.wrong);
  for (const d of daily) {
    if (d.topicId !== topic.id || !isBoundSession(d, topics, archived)) continue;
    total -= d.applied!.total;
    correct -= d.applied!.correct;
    wrong -= d.applied!.wrong;
  }
  return { total: Math.max(0, total), correct: Math.max(0, correct), wrong: Math.max(0, wrong) };
}

/** İki delta arasındaki fark (`yeni - eski`). */
export function deltaOf(next: Counts3, prev: Counts3): Counts3 {
  return {
    total: next.total - prev.total,
    correct: next.correct - prev.correct,
    wrong: next.wrong - prev.wrong,
  };
}

/**
 * Kümülatif bir alana delta ekler. Delta 0 ise mevcut değer (null dahil) AYNEN
 * korunur: "soru girilmedi" (null) ile "0 soru girildi" (0) ayrımı bozulmaz.
 */
export function addCounts(current: number | null, delta: number): number | null {
  if (delta === 0) return current;
  return n(current) + delta;
}

/** Oturum türleri (UI seçer; kümülatif düzenlemesinden TAHMİN EDİLMEZ). */
export const SESSION_KINDS: StudyType[] = ["Konu anlatımı", "Soru çözümü", "Tekrar", "Yanlış analizi"];

/** `addSession` girdisi. `id` form açılışında üretilir (idempotans için). */
export interface SessionInput {
  id: string;
  topicId: string;
  kind: StudyType;
  questions: number | null;
  correct: number | null;
  wrong: number | null;
  minutes?: number | null;
  date?: string;
  note?: string;
}

/** `updateSession` yaması. Yalnız bu alanlar değiştirilebilir. */
export interface SessionPatch {
  questions?: number | null;
  correct?: number | null;
  wrong?: number | null;
  minutes?: number | null;
  note?: string;
  date?: string;
}

/** "Çalışma ekle" formunun ham değerleri. `null` = "girilmedi" (0'dan ayrıdır). */
export interface SessionFormState {
  kind: StudyType;
  questions: number | null;
  correct: number | null;
  wrong: number | null;
  minutes: number | null;
  note: string;
  date: string;
}

/**
 * Form durumunu `addSession` girdisine çeviren SAF eşleyici (react'siz; test
 * edilebilir). Kurallar:
 *  - `null` değerler aynen `null` kalır (boş ≠ 0).
 *  - Dakika girilmediyse `null` kalır; tahmin/varsayılan üretilmez.
 *  - `id` form açılışında üretilir; buraya dışarıdan verilir (idempotans).
 *  - Not boşsa `""`; aksi hâlde kullanıcının yazdığı metin korunur.
 */
export function sessionInputFromForm(
  formId: string,
  topicId: string,
  f: SessionFormState,
): SessionInput {
  return {
    id: formId,
    topicId,
    kind: f.kind,
    questions: f.questions,
    correct: f.correct,
    wrong: f.wrong,
    minutes: f.minutes,
    note: f.note.trim() ? f.note : "",
    date: f.date,
  };
}

/**
 * Kilit çözme onay metni — tek kaynakta tutulur ki UI ve test ayrışmasın.
 * Anlamı: bağ kalıcı kaldırılır; soru sonuçları ve kümülatif korunur; kayıt
 * bundan sonra bağımsız günlük kaydı sayılır; işlem geri alınamaz.
 */
export const UNLOCK_WARNING =
  "Bu işlem oturum ile konu arasındaki bağlantıyı kalıcı olarak kaldırır. " +
  "Oturumun soru sonuçları ve mevcut kümülatif konu değerleri korunur; " +
  "bundan sonra bu kayıt bağımsız günlük kaydı olarak değerlendirilir. İşlem geri alınamaz.";
