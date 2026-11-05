export function n(v: number | null | undefined) {
  return v == null || Number.isNaN(v) ? 0 : v;
}

/** Negatif, NaN veya sonsuz sayıyı null'a indirger. */
function nonNeg(v: number | null | undefined): number | null {
  if (v == null || Number.isNaN(v) || !Number.isFinite(v) || v < 0) return null;
  return v;
}

export interface Counts {
  total: number | null;
  correct: number | null;
  wrong: number | null;
}

/**
 * Soru sayılarını güvenli aralığa indirger — okuma tarafının tek kaynağı.
 *
 * Kurallar: negatif/sonsuz değer null; toplam yoksa veya 0 ise doğru/yanlış
 * tutulamaz; doğru ve yanlış toplamı aşamaz (doğruya öncelik verilir).
 */
export function sanitizeCounts(
  total: number | null | undefined,
  correct: number | null | undefined,
  wrong: number | null | undefined,
): Counts {
  const t = nonNeg(total);
  if (t == null || t === 0) return { total: t, correct: null, wrong: null };
  let c = nonNeg(correct);
  let w = nonNeg(wrong);
  if (c != null) c = Math.min(c, t);
  if (w != null) w = Math.min(w, t);
  if (c != null && w != null && c + w > t) w = Math.max(0, t - c);
  return { total: t, correct: c, wrong: w };
}

/**
 * Ham veri geçerli mi? Geçersizse kullanıcıya gösterilecek kısa nedeni döner.
 *
 * `sanitizeCounts` sessizce kırpar; bu fonksiyon kırpmanın nedenini görünür
 * kılar, böylece geçersiz bir kayıt "sessizce düzeltilmiş" olmaz.
 */
export function countsIssue(
  total: number | null | undefined,
  correct: number | null | undefined,
  wrong: number | null | undefined,
): string | null {
  const bad = (v: number | null | undefined) =>
    v != null && (Number.isNaN(v) || !Number.isFinite(v) || v < 0);
  if (bad(total) || bad(correct) || bad(wrong)) return "Negatif veya geçersiz sayı";
  if (total == null) {
    return correct != null || wrong != null ? "Toplam soru yokken doğru/yanlış girilmiş" : null;
  }
  if (total === 0) {
    return correct != null || wrong != null ? "Toplam 0 iken doğru/yanlış girilmiş" : null;
  }
  if (n(correct) + n(wrong) > total) return "Doğru + yanlış toplamdan fazla";
  return null;
}

export function blankOf(total: number | null, correct: number | null, wrong: number | null) {
  if (total == null) return null;
  return Math.max(0, Math.max(0, n(total)) - Math.max(0, n(correct)) - Math.max(0, n(wrong)));
}

export function netOf(correct: number | null, wrong: number | null) {
  if (correct == null && wrong == null) return null;
  return Math.max(0, n(correct)) - Math.max(0, n(wrong)) / 4;
}

export function pctOf(correct: number | null, total: number | null) {
  if (total == null || total <= 0) return null;
  return Math.min(1, Math.max(0, n(correct) / total));
}

/**
 * Yazma tarafı: yalnızca değiştirilen alanı düzeltir, dokunulmayan alanı
 * yeniden yazmaz. Böylece mevcut (geçersiz) bir kayıt, ilgisiz bir
 * güncellemede sessizce değişmez.
 */
export function clampTopicPatch(
  current: { total: number | null; correct: number | null; wrong: number | null },
  patch: Partial<{ total: number | null; correct: number | null; wrong: number | null }>,
): Counts {
  const touches = "total" in patch || "correct" in patch || "wrong" in patch;
  if (!touches) return { total: current.total, correct: current.correct, wrong: current.wrong };

  const total = "total" in patch ? nonNeg(patch.total) : current.total;
  let correct = "correct" in patch ? nonNeg(patch.correct) : current.correct;
  let wrong = "wrong" in patch ? nonNeg(patch.wrong) : current.wrong;

  if (total == null || total === 0) return { total, correct: null, wrong: null };

  if (correct != null) correct = Math.min(correct, total);
  if (wrong != null) wrong = Math.min(wrong, total);
  if (correct != null && wrong != null && correct + wrong > total) {
    // Son düzenlenen alana öncelik ver: hangisi "diğer" ise o kırpılır.
    if ("wrong" in patch && !("correct" in patch)) correct = Math.max(0, total - wrong);
    else wrong = Math.max(0, total - correct);
  }
  return { total, correct, wrong };
}
