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
 * Planlanan tam deneme sınavı — TAKVİME bağlı, sonuç kaydından BAĞIMSIZ.
 *
 * Tam deneme dağılımının TEMELİ budur. Kullanıcının hangi sınavın sonucunu
 * girip hangisini girmediği bu dağılımı değiştirmez; sonuç verileri yalnızca
 * hazırbulunuşluk (kapı/kapsam) ve zayıflık kararlarını etkiler.
 *
 * TYT önceliği iki düzeyde korunur:
 *  - TYT ilk turu sürerken (veya TYT sınavına ≤ 60 gün kala) 2:1 dönüşüm
 *    (TYT, TYT, AYT): çekirdek sınav daha sık ölçülür.
 *  - İlk tur bittikten sonra ve son iki ayda 1:1 (TYT, AYT): her iki sınav da
 *    düzenli tekrar gerektirir.
 *
 * `rotationIndex` deneme FIRSATI sayacıdır (program başından bugüne kaç deneme
 * günü geçtiği). Böylece art arda gelen deneme günleri farklı sınav türü alır ve
 * iki sınav da açlıkta kalmaz. Sabit bir oran DEĞİL, kadanslı bir dönüşümdür.
 */
export function plannedMockExam(
  rotationIndex: number,
  opts: { tytRound1Done: boolean; daysToTytExam: number },
): "TYT" | "AYT" {
  // Son iki ayda (≤ 60 gün) veya TYT ilk turu bitince 1:1'e geç.
  const balanced = opts.tytRound1Done || opts.daysToTytExam <= 60;
  const cycle = balanced ? 2 : 3;
  const idx = ((rotationIndex % cycle) + cycle) % cycle;
  // 3'lü çevrimde üçüncü slot AYT: TYT, TYT, AYT (TYT önceliği).
  if (cycle === 3) return idx === 2 ? "AYT" : "TYT";
  // 2'li çevrimde dönüşümlü: TYT, AYT.
  return idx === 0 ? "TYT" : "AYT";
}

/**
 * Deneme günü için tür seçimi.
 *
 * İki karar AYRI verilir:
 *  1. Bu deneme günü TAM deneme günü mü (`fullMockDue`)? Bu TAKVİME bağlıdır
 *     (faz yoğunluğu + deneme günü sayacı), sonuç kaydına değil.
 *  2. Tam deneme günüyse hangi sınav (TYT/AYT)? Bu da TAKVİM dönüşümüyle
 *     belirlenir (`plannedMockExam`), sonuç kaydına göre değil.
 *
 * Böylece "yalnız TYT sonucu girilince TYT denemeleri bastırılır" sorunu
 * giderilir: kayıt girilse de girilmese de temel TYT–AYT dağılımı aynı kalır.
 * Kayıt verileri yalnızca HAZIRBULUNUŞLUĞU (kapı/kapsam → `tytReady`/`aytReady`)
 * ve zayıflık kararlarını (branş dersi seçimi) etkiler.
 *
 * Sıra:
 *  1. Tam deneme günü ve en az bir sınav hazırsa → takvim dönüşümüne göre tam.
 *  2. Aksi hâlde branş (kapsamı ≥ %50 en uygun ders) veya mini (kapsam ≥ %30).
 *     Deneme günü boş geçmez; branş/mini günleri korunur.
 *  3. Hiçbiri uygun değilse deneme konmaz.
 *
 * `isMockDay` false ise her zaman null: tam denemeler yalnızca deneme gününde
 * yerleşir (bitişik blok ve o gün yeni konu açılmaması buna bağlıdır).
 */
export function chooseMock(opts: {
  isMockDay: boolean;
  /** Bu gün tam deneme günü mü (takvim kadansı)? */
  fullMockDue: boolean;
  tytReady: boolean;
  aytReady: boolean;
  /** Kapsamı ≥ %50 olan derslerin EN ZAYIFI; yoksa null. */
  branchSubject: string | null;
  /** Sınav geneli kapsam (0–1). */
  overallCoverage: number;
  /** Deneme fırsatı sayacı (program başından bugüne geçen deneme günü sayısı). */
  rotationIndex: number;
  /** TYT sınavına kalan gün. */
  daysToTytExam: number;
  /** TYT ilk turu bitti mi? Bitince tam deneme dengesi 1:1'e kayar. */
  tytRound1Done: boolean;
}): MockChoice | null {
  if (!opts.isMockDay) return null;

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

  if (opts.fullMockDue) {
    // Tam deneme sınavı: takvim dönüşümü (sonuç kaydından bağımsız).
    const exam: "TYT" | "AYT" | null =
      opts.tytReady && opts.aytReady
        ? plannedMockExam(opts.rotationIndex, {
            tytRound1Done: opts.tytRound1Done,
            daysToTytExam: opts.daysToTytExam,
          })
        : opts.tytReady
          ? "TYT"
          : opts.aytReady
            ? "AYT"
            : null;
    if (exam === "TYT") return tytFull;
    if (exam === "AYT") return aytFull;
  }

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
