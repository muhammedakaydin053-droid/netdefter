/**
 * Deneme türleri, süreleri ve seçimi — saf, veriye bağlı değil.
 *
 * Ayrı dosyada tutulmasının nedeni test edilebilirlik: burada `@/` takma adı
 * veya JSON importu yok, `node --test` doğrudan yükleyebilir. Konu verisine
 * bakan kararlar `mock-plan.ts` ve `engine.ts` içindedir.
 *
 * Dört tür vardır ve dördü farklı iş yapar:
 *  - TAM TYT: gerçek sınav koşulu, 165 dk / 120 soru. Bitişik blok ister,
 *    günün omurgasıdır; o gün yeni konu açılmaz.
 *  - TAM AYT: 180 dk / 80 soru. Aynı kurallar, süre AYT'nin gerçek süresidir.
 *  - BRANŞ: tek dersin denemesi, 40 dk / 20 soru. Tam deneme zamanı gelmediği
 *    deneme günlerinde en zayıf dersi ölçer; kısa olduğu için o gün yeni konu
 *    açılabilir.
 *  - MİNİ: 25 dk / 12 soru. Kapsam henüz branş denemesine yetmediğinde bile
 *    deneme ritmini korur.
 *
 * ÖNEMLİ: bütün denemelere 165 dk vermek yanlıştı. Süreler gerçek sınav
 * sürelerinden ve görevin işlevinden gelir.
 */

export type MockType = "tam" | "brans" | "mini";

export interface MockSpec {
  minutes: number;
  targetQ: number;
}

/** Tam TYT denemesi: gerçek sınav süresi. */
export const FULL_TYT_SPEC: MockSpec = { minutes: 165, targetQ: 120 };

/** Tam AYT denemesi: gerçek sınav süresi. */
export const FULL_AYT_SPEC: MockSpec = { minutes: 180, targetQ: 80 };

/** Branş denemesi: tek ders, kısa. */
export const BRANCH_MOCK_SPEC: MockSpec = { minutes: 40, targetQ: 20 };

/** Mini deneme: en kısa ölçüm. */
export const MINI_MOCK_SPEC: MockSpec = { minutes: 25, targetQ: 12 };

export function fullMockSpec(exam: "TYT" | "AYT"): MockSpec {
  return exam === "AYT" ? FULL_AYT_SPEC : FULL_TYT_SPEC;
}

export function mockSpec(type: MockType, exam: "TYT" | "AYT" = "TYT"): MockSpec {
  if (type === "tam") return fullMockSpec(exam);
  if (type === "brans") return BRANCH_MOCK_SPEC;
  return MINI_MOCK_SPEC;
}

export interface MockChoice {
  type: MockType;
  exam: "TYT" | "AYT";
  subject: string;
  topic: string;
  minutes: number;
  targetQ: number;
}

/**
 * Deneme günü için tür seçimi.
 *
 * Sıra ve DENGE önemli:
 *  1. Tam denemeler yalnızca deneme gününde ve zamanı geldiğinde (`overdueDays`
 *     ≥ aralık) seçilir. TYT ve AYT AYNI gün için hazırsa EN ÇOK GECİKMİŞ olan
 *     kazanır; eşitlikte TYT seçilir (çekirdek korunur). Bu denge olmadan AYT
 *     hazır olduğu anda bütün deneme günlerini AYT alıyor, TYT tam denemesi
 *     hiç yapılmıyordu (ölçüm: 140 günde 17 AYT, 0 TYT).
 *  2. Tam deneme zamanı gelmediyse ama deneme günüyse branş denemesi konur
 *     (gün denemesiz geçmez, en zayıf ders ölçülür).
 *  3. Branş için bile kapsam yetmiyorsa mini deneme.
 *  4. Hiçbiri uygun değilse deneme konmaz.
 *
 * `isMockDay` false ise her zaman null: tam denemeler yalnızca deneme gününde
 * yerleşir (bitişik blok ve o gün yeni konu açılmaması buna bağlıdır).
 */
export function chooseMock(opts: {
  isMockDay: boolean;
  tytReady: boolean;
  /** Son TYT tam denemesinden bu yana gün; hiç yoksa Infinity. */
  tytOverdueDays: number;
  tytInterval: number;
  aytReady: boolean;
  /** Son AYT tam denemesinden bu yana gün; hiç yoksa Infinity. */
  aytOverdueDays: number;
  aytInterval: number;
  /** Kapsamı ≥ %50 olan derslerin EN ZAYIFI; yoksa null. */
  branchSubject: string | null;
  /** Sınav geneli kapsam (0–1). */
  overallCoverage: number;
}): MockChoice | null {
  if (!opts.isMockDay) return null;
  const tytDue = opts.tytReady && opts.tytOverdueDays >= opts.tytInterval;
  const aytDue = opts.aytReady && opts.aytOverdueDays >= opts.aytInterval;

  const tytFull: MockChoice = {
    type: "tam",
    exam: "TYT",
    subject: "Deneme",
    topic: "TYT denemesi",
    ...FULL_TYT_SPEC,
  };
  const aytFull: MockChoice = {
    type: "tam",
    exam: "AYT",
    subject: "Deneme",
    topic: "AYT sayısal denemesi",
    ...FULL_AYT_SPEC,
  };

  if (tytDue && aytDue) {
    // En çok gecikmiş tam deneme; eşitlikte TYT.
    const tytExcess = opts.tytOverdueDays - opts.tytInterval;
    const aytExcess = opts.aytOverdueDays - opts.aytInterval;
    return aytExcess > tytExcess ? aytFull : tytFull;
  }
  if (aytDue) return aytFull;
  if (tytDue) return tytFull;

  if (opts.branchSubject) {
    return {
      type: "brans",
      exam: "TYT",
      subject: opts.branchSubject,
      topic: `${opts.branchSubject} branş denemesi`,
      ...BRANCH_MOCK_SPEC,
    };
  }
  if (opts.overallCoverage >= 0.3) {
    return {
      type: "mini",
      exam: "TYT",
      subject: "Deneme",
      topic: "Mini deneme",
      ...MINI_MOCK_SPEC,
    };
  }
  return null;
}
