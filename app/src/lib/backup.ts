/**
 * JSON yedekleme — dışa/içe aktarma.
 *
 * Bu modül SAF'tır: `@/` takma adı, JSON importu veya store'a bağımlılığı
 * yoktur; bu yüzden `node --test` doğrudan yükleyebilir. Yalnızca yedek
 * dosyasının zarfını (format + sürüm + veri) ve doğrulamasını bilir.
 *
 * Uygulama içi `DataSnapshot` (store.ts) ve `backup` alanı DEĞİŞMEZ; dışa
 * aktarılan dosya ayrı bir zarftır. Böylece mevcut yedek/sıfırlama akışı
 * bozulmadan kalır ve eski yedekler okunmaya devam eder.
 */
import type { TopicRow, WrongRow, TytExam, AytExam, DailyRow } from "@/lib/types";
import type { CarryItem, ScheduleSettings } from "@/lib/smart/types";

/** Zarfın kimliği — yanlış dosyaları erken reddetmek için. */
export const BACKUP_FORMAT = "netdefter-yks-backup";
/** Bu uygulamanın anladığı en yüksek yedek sürümü. */
export const BACKUP_VERSION = 1;

/** Dışa aktarılan yedekteki kullanıcı verisi (DataSnapshot ile aynı şekil). */
export interface BackupData {
  topics: TopicRow[];
  archivedTopics: TopicRow[];
  wrongs: WrongRow[];
  tytExams: TytExam[];
  aytExams: AytExam[];
  daily: DailyRow[];
  settings: ScheduleSettings;
  carry: CarryItem[];
}

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  app: "NetDefter";
  data: BackupData;
}

/** Kaynak durumdan (store state veya DataSnapshot) yedek verisini çıkarır. */
export function toBackupData(s: BackupData): BackupData {
  return {
    topics: s.topics ?? [],
    archivedTopics: s.archivedTopics ?? [],
    wrongs: s.wrongs ?? [],
    tytExams: s.tytExams ?? [],
    aytExams: s.aytExams ?? [],
    daily: s.daily ?? [],
    settings: s.settings,
    carry: s.carry ?? [],
  };
}

/** İçe aktarılan veriyi store'a uygulanabilir `DataSnapshot` şekline çevirir. */
export function toSnapshot(data: BackupData, at = new Date().toISOString()) {
  return { at, ...toBackupData(data) };
}

export function buildBackupFile(s: BackupData, at = new Date().toISOString()): BackupFile {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: at,
    app: "NetDefter",
    data: toBackupData(s),
  };
}

export function serializeBackup(s: BackupData, at = new Date().toISOString()): string {
  return JSON.stringify(buildBackupFile(s, at), null, 2);
}

/** `netdefter-yedek-YYYY-MM-DD.json` — tarih yerel saate göre. */
export function backupFilename(at = new Date()): string {
  const y = at.getFullYear();
  const m = String(at.getMonth() + 1).padStart(2, "0");
  const d = String(at.getDate()).padStart(2, "0");
  return `netdefter-yedek-${y}-${m}-${d}.json`;
}

export type ParseResult =
  | { ok: true; data: BackupData; exportedAt: string }
  | { ok: false; error: string };

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Bir dizi alanı: dizi değilse boş dizi, dizi ise yalnızca nesne öğeleri. */
function asArray<T>(v: unknown): T[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x) => isObject(x)) as T[];
}

/**
 * Ham metni doğrular ve yedek verisine çevirir.
 *
 * Doğrulama geçmezse `ok: false` döner ve ÇAĞIRAN taraf store'a hiç
 * dokunmamalıdır — böylece bozuk bir dosya mevcut veriyi ezemez.
 *
 * Tolerans: `archivedTopics` gibi ikincil alanlar eksikse boş dizi kabul
 * edilir (eski yedek uyumluluğu). `topics` ve `data` zorunludur; asıl veri
 * bunlardır.
 */
export function parseBackup(raw: string): ParseResult {
  if (typeof raw !== "string" || raw.trim() === "") {
    return { ok: false, error: "Dosya boş." };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "Dosya geçerli JSON değil. Bozuk veya farklı bir dosya olabilir." };
  }

  if (!isObject(parsed)) {
    return { ok: false, error: "Yedek içeriği beklenen biçimde değil." };
  }

  if (parsed.format !== BACKUP_FORMAT) {
    return { ok: false, error: "Bu dosya bir NetDefter yedeği değil." };
  }

  const version = parsed.version;
  if (typeof version !== "number" || !Number.isFinite(version) || version < 1) {
    return { ok: false, error: "Yedek sürümü okunamadı." };
  }
  if (version > BACKUP_VERSION) {
    return {
      ok: false,
      error: `Bu yedek daha yeni bir sürüme ait (v${version}). Bu uygulama v${BACKUP_VERSION} destekliyor.`,
    };
  }

  const data = parsed.data;
  if (!isObject(data)) {
    return { ok: false, error: "Yedek içeriği eksik." };
  }
  if (!Array.isArray(data.topics)) {
    return { ok: false, error: "Yedekte konu listesi bulunamadı." };
  }

  const settings = isObject(data.settings) ? (data.settings as unknown as ScheduleSettings) : ({} as ScheduleSettings);
  const exportedAt = typeof parsed.exportedAt === "string" ? parsed.exportedAt : "";

  return {
    ok: true,
    exportedAt,
    data: {
      topics: asArray<TopicRow>(data.topics),
      archivedTopics: asArray<TopicRow>(data.archivedTopics),
      wrongs: asArray<WrongRow>(data.wrongs),
      tytExams: asArray<TytExam>(data.tytExams),
      aytExams: asArray<AytExam>(data.aytExams),
      daily: asArray<DailyRow>(data.daily),
      settings,
      carry: asArray<CarryItem>(data.carry),
    },
  };
}
