/**
 * "Her sene garanti" ve "5 yıl üst üste" konu listeleri.
 *
 * Kaynak: osymsevdiren Notion sayfaları (iki sayfa, 2026-10 taraması).
 * Bu listeler bir koçluk derlemesidir; ÖSYM resmî konu-soru tablosu yayınlamaz.
 * Kesin "çıkacak" garantisi değildir — program bu konulara daha fazla ağırlık verir.
 *
 * `topic` alanları `src/data/curriculum.json` içindeki konu adlarıyla birebir
 * eşleşir; böylece hem dağılım sayfası hem de plan motoru aynı anahtarı kullanır.
 */

export const NOTION_SOURCES = [
  {
    title: "TYT'de her sene garanti çıkan konular",
    url: "https://osymsevdiren.notion.site/TYT-DE-HER-SENE-GARANT-IKAN-KONULAR-3d07bf019c3d8057bffbc5fb4e8856e1",
    note: "Ders ders, neredeyse her yıl soru gelen ve net kazandıran konular; yanında beklenen soru sayısı.",
  },
  {
    title: "ÖSYM'nin 5 yıl üst üste sorduğu konular",
    url: "https://osymsevdiren.notion.site/SYM-N-N-5-YIL-ST-STE-SORDU-U-KONULAR-3dd7bf019c3d80deab8ef3a9e2aa3188",
    note: "Son 5 yılda kesintisiz soru gelen konular ve yıllık ortalama soru sayısı.",
  },
] as const;

export const NOTION_CAVEAT =
  "Bu listeler koçluk derlemesidir; ÖSYM resmî konu-soru tablosu yayınlamaz. Garanti değil, ağırlık gerekçesidir.";

export type ExamName = "TYT" | "AYT";

export interface GuaranteeRow {
  exam: ExamName;
  subject: string;
  /** curriculum.json içindeki konu adı. */
  topic: string;
  /** Notion'daki özgün etiket (farklıysa). */
  label: string;
  /** Beklenen soru sayısı, ör. "11–12 soru" veya "20+ / 26". */
  questions: string;
  why: string;
}

/** Kaynak 1 — "her sene garanti" listesi. */
export const GARANTI_ROWS: GuaranteeRow[] = [
  // TYT Türkçe
  { exam: "TYT", subject: "Türkçe", topic: "Paragraf", label: "Paragraf", questions: "20+ / 26", why: "26 sorunun 20'den fazlası buradan geliyor." },
  { exam: "TYT", subject: "Türkçe", topic: "Ses Bilgisi", label: "Ses Bilgisi", questions: "1–2", why: "Her sene düzenli 1–2 soru." },
  { exam: "TYT", subject: "Türkçe", topic: "Yazım Kuralları", label: "Yazım Kuralları", questions: "2", why: "Yazım + noktalama toplam 4 soru garanti." },
  { exam: "TYT", subject: "Türkçe", topic: "Noktalama İşaretleri", label: "Noktalama İşaretleri", questions: "2", why: "Yazım + noktalama toplam 4 soru garanti." },
  { exam: "TYT", subject: "Türkçe", topic: "Cümle Bilgisi", label: "Cümlenin Ögeleri", questions: "1", why: "1 net garanti." },
  { exam: "TYT", subject: "Türkçe", topic: "Fiiller", label: "Fiilimsi", questions: "1", why: "Her sene 1 soru." },
  { exam: "TYT", subject: "Türkçe", topic: "Sözcük Grupları", label: "Sözcük Grupları", questions: "1", why: "1 soru geliyor; konu biraz uzun." },
  // TYT Matematik
  { exam: "TYT", subject: "Matematik", topic: "Temel Kavramlar", label: "Sayılar Konuları", questions: "14 soruya dokunuyor", why: "Sayı temeli TYT matematiğin 14 sorusuna dokunuyor." },
  { exam: "TYT", subject: "Matematik", topic: "Problemler", label: "Problemler", questions: "11", why: "Neredeyse garanti; günlük çözümlü deneme +5 net getirir." },
  { exam: "TYT", subject: "Matematik", topic: "Mantık", label: "Mantık", questions: "1", why: "Her yıl tek soru; yarım saatte biter." },
  { exam: "TYT", subject: "Matematik", topic: "Veri ve İstatistik", label: "Veri ve İstatistik", questions: "1", why: "Özellikle grafik ve tablo soruları." },
  { exam: "TYT", subject: "Matematik", topic: "Olasılık", label: "Olasılık", questions: "1", why: "Zor olduğu için sona atılabilir ama her sene soru geliyor." },
  // TYT Geometri
  { exam: "TYT", subject: "Geometri", topic: "Üçgende Açılar", label: "Açılar ve Üçgenler", questions: "4–5", why: "Her sene 4–5 soru; üçgenleri çok iyi bilmelisin." },
  { exam: "TYT", subject: "Geometri", topic: "Çokgenler", label: "Çokgenler", questions: "1", why: "Her yıl sabit bir soru." },
  { exam: "TYT", subject: "Geometri", topic: "Özel Dörtgenler", label: "Dikdörtgen", questions: "1–2", why: "Her yıl kesin 1, bazen 2 soru." },
  { exam: "TYT", subject: "Geometri", topic: "Analitik Geometri", label: "Analitik Geometri", questions: "0–1", why: "Bazen çıkmıyor ama genelde soruluyor." },
  { exam: "TYT", subject: "Geometri", topic: "Katı Cisimler", label: "Katı Cisimler", questions: "2", why: "Yıllardır soru sayısı değişmedi: 2." },
  // TYT Tarih
  { exam: "TYT", subject: "Tarih", topic: "İlk ve Orta Çağlarda Türk Dünyası", label: "İlk ve Orta Çağlarda Türk Dünyası", questions: "1", why: "Temel bilgi, kolay." },
  { exam: "TYT", subject: "Tarih", topic: "Türk-İslam Devletleri", label: "Türklerin İslamiyet'i Kabulü ve İlk Türk İslam Devletleri", questions: "1", why: "Çokça soru gelir, ezberlemesi kolay." },
  { exam: "TYT", subject: "Tarih", topic: "Osmanlı'da Değişim", label: "Uluslararası İlişkilerde Denge Stratejisi (1774–1914)", questions: "1", why: "Mantıkla çözülebilen tarih konularından." },
  { exam: "TYT", subject: "Tarih", topic: "Milli Mücadele", label: "Milli Mücadele", questions: "1", why: "Her yıl çıkan temel konu." },
  { exam: "TYT", subject: "Tarih", topic: "Atatürkçülük ve İnkılap", label: "Atatürkçülük ve Türk İnkılabı", questions: "1", why: "İnkılap tarihi için olmazsa olmaz." },
  // TYT Coğrafya
  { exam: "TYT", subject: "Coğrafya", topic: "Atmosfer ve İklim", label: "İklim Bilgisi", questions: "1", why: "Yorum ağırlıklı ve kolay." },
  { exam: "TYT", subject: "Coğrafya", topic: "Nüfus ve Yerleşme", label: "Nüfus ve Yerleşme", questions: "1", why: "Çokça grafik ve tablo sorusu gelir." },
  { exam: "TYT", subject: "Coğrafya", topic: "Çevre ve Afetler", label: "Doğal Afetler", questions: "1", why: "Güncel bilgilerle desteklenir, net." },
  { exam: "TYT", subject: "Coğrafya", topic: "Harita Bilgisi", label: "Harita Bilgisi", questions: "1", why: "Kısa çalışmayla hemen halledilir." },
  { exam: "TYT", subject: "Coğrafya", topic: "Yerin Yapısı", label: "İç ve Dış Kuvvetler", questions: "1", why: "Şekil yorumlama önemli ama kolay." },
  // TYT Felsefe
  { exam: "TYT", subject: "Felsefe", topic: "Felsefenin Konusu", label: "Felsefenin Alanı", questions: "1", why: "Giriş düzeyinde." },
  { exam: "TYT", subject: "Felsefe", topic: "Bilgi Felsefesi", label: "Bilgi Felsefesi", questions: "1–2", why: "Mantıksal düşünce gerektirir." },
  { exam: "TYT", subject: "Felsefe", topic: "Ahlak Felsefesi", label: "Ahlak Felsefesi", questions: "1", why: "Kavramları bilirsen net çıkar." },
  { exam: "TYT", subject: "Felsefe", topic: "Varlık Felsefesi", label: "Varlık Felsefesi", questions: "1", why: "Zor görünse de yorumla çözülür." },
  // TYT Din Kültürü
  { exam: "TYT", subject: "Din Kültürü", topic: "Bilgi ve İnanç", label: "Bilgi ve İnanç", questions: "1", why: "Kısa ve net konu." },
  { exam: "TYT", subject: "Din Kültürü", topic: "İslam ve İbadet", label: "İbadetler", questions: "1", why: "Ezberlemesi kolay." },
  { exam: "TYT", subject: "Din Kültürü", topic: "Gençlik ve Değerler", label: "Ahlak ve Değerler", questions: "1", why: "Genel kültürle yapılır." },
  { exam: "TYT", subject: "Din Kültürü", topic: "Din ve İslam", label: "Vahiy ve Akıl", questions: "1", why: "Sade anlatılır." },
  { exam: "TYT", subject: "Din Kültürü", topic: "Dinler ve Evrensel Öğretiler", label: "Din, Kültür ve Medeniyet", questions: "1", why: "Yorum sorularına açık." },
  // TYT Fizik
  { exam: "TYT", subject: "Fizik", topic: "Madde ve Özellikleri", label: "Madde ve Özellikleri", questions: "1", why: "Neredeyse her yıl; soru tarzı net, kolay net sağlar." },
  { exam: "TYT", subject: "Fizik", topic: "Hareket ve Kuvvet", label: "Hareket ve Kuvvet", questions: "1", why: "Temel ve düzenli soru gelen konu." },
  { exam: "TYT", subject: "Fizik", topic: "Isı ve Sıcaklık", label: "Isı ve Sıcaklık", questions: "1", why: "Her yıl soru gelen çekirdek konu." },
  { exam: "TYT", subject: "Fizik", topic: "Dalgalar", label: "Dalgalar", questions: "1", why: "Göz korkutsa da uzun değil; doğru kaynakla kolay öğrenilir." },
  // TYT Kimya
  { exam: "TYT", subject: "Kimya", topic: "Kimya Bilimi", label: "Kimya Bilimi", questions: "1", why: "Her sene soru gelen giriş konusu." },
  { exam: "TYT", subject: "Kimya", topic: "Atom ve Periyodik Sistem", label: "Periyodik Tablo", questions: "1", why: "Periyodik tablo her yıl soruluyor." },
  { exam: "TYT", subject: "Kimya", topic: "Maddenin Halleri", label: "Maddenin Halleri", questions: "1", why: "Sabit soru kaynağı." },
  { exam: "TYT", subject: "Kimya", topic: "Asit, Baz ve Tuz", label: "Asit – Baz – Tuz", questions: "1", why: "Her yıl soru gelen konu." },
  // TYT Biyoloji
  { exam: "TYT", subject: "Biyoloji", topic: "Hücre", label: "Hücre ve Organeller", questions: "1", why: "Her yıl soru gelen temel konu." },
  { exam: "TYT", subject: "Biyoloji", topic: "Hücre Bölünmeleri", label: "Hücre Bölünmeleri", questions: "1", why: "Düzenli soru gelen konu." },
  { exam: "TYT", subject: "Biyoloji", topic: "Kalıtım", label: "Kalıtım", questions: "1", why: "Zor gibi görünür ama değil." },
  { exam: "TYT", subject: "Biyoloji", topic: "Ekosistem Ekolojisi", label: "Ekosistem", questions: "1", why: "Her yıl soru geliyor." },
];

export interface StreakRow {
  exam: ExamName;
  subject: string;
  /** curriculum.json içindeki konu adı. */
  topic: string;
  /** Notion'daki özgün etiket (farklıysa). */
  label: string;
  /** Yıllık ortalama soru sayısı (Notion kaynağındaki değer). */
  count: number;
}

/** Kaynak 2 — "5 yıl üst üste" tablosu (soru sayılarıyla). */
export const STREAK_ROWS: StreakRow[] = [
  { exam: "TYT", subject: "Türkçe", topic: "Noktalama İşaretleri", label: "Noktalama İşaretleri", count: 2 },
  { exam: "TYT", subject: "Türkçe", topic: "Yazım Kuralları", label: "Yazım Kuralları", count: 2 },
  { exam: "TYT", subject: "Türkçe", topic: "Cümlede Anlam", label: "Cümlede Anlam", count: 5 },
  { exam: "TYT", subject: "Matematik", topic: "Temel Kavramlar", label: "Temel Kavramlar", count: 3 },
  { exam: "TYT", subject: "Matematik", topic: "Sayı Basamakları", label: "Sayı Basamakları", count: 1 },
  { exam: "TYT", subject: "Matematik", topic: "Bölme ve Bölünebilme", label: "Bölünebilme Kuralları", count: 1 },
  { exam: "TYT", subject: "Matematik", topic: "Rasyonel Sayılar", label: "Rasyonel Sayılar", count: 1 },
  { exam: "TYT", subject: "Matematik", topic: "Basit Eşitsizlikler", label: "Basit Eşitsizlikler", count: 1 },
  { exam: "TYT", subject: "Matematik", topic: "Mutlak Değer", label: "Mutlak Değer", count: 1 },
  { exam: "TYT", subject: "Matematik", topic: "Üslü Sayılar", label: "Üslü Sayılar", count: 1 },
  { exam: "TYT", subject: "Matematik", topic: "Köklü Sayılar", label: "Köklü Sayılar", count: 1 },
  { exam: "TYT", subject: "Matematik", topic: "Oran – Orantı", label: "Oran-Orantı", count: 1 },
  { exam: "TYT", subject: "Matematik", topic: "Problemler", label: "Problemler", count: 12 },
  { exam: "TYT", subject: "Matematik", topic: "Kümeler", label: "Kümeler", count: 1 },
  { exam: "TYT", subject: "Matematik", topic: "Mantık", label: "Mantık", count: 1 },
  { exam: "TYT", subject: "Matematik", topic: "Fonksiyonlar", label: "Fonksiyonlar", count: 1 },
  { exam: "TYT", subject: "Matematik", topic: "Permütasyon – Kombinasyon", label: "P-K-O-B", count: 2 },
  { exam: "TYT", subject: "Matematik", topic: "Veri ve İstatistik", label: "Veri – İstatistik", count: 1 },
  { exam: "TYT", subject: "Tarih", topic: "İlk ve Orta Çağlarda Türk Dünyası", label: "İlk ve Orta Çağlarda Türk Dünyası", count: 1 },
  { exam: "TYT", subject: "Tarih", topic: "Türk-İslam Devletleri", label: "Türklerin İslamiyet'i Kabulü ve İlk Türk İslam Devletleri", count: 1 },
  { exam: "TYT", subject: "Tarih", topic: "Milli Mücadele", label: "Milli Mücadele", count: 1 },
  { exam: "TYT", subject: "Tarih", topic: "Atatürkçülük ve İnkılap", label: "Atatürkçülük ve Türk İnkılabı", count: 1 },
  { exam: "TYT", subject: "Coğrafya", topic: "Harita Bilgisi", label: "Harita Bilgisi", count: 1 },
  { exam: "TYT", subject: "Coğrafya", topic: "Atmosfer ve İklim", label: "İklim Bilgisi", count: 1 },
  { exam: "TYT", subject: "Coğrafya", topic: "Nüfus ve Yerleşme", label: "Nüfus ve Yerleşme", count: 1 },
  { exam: "TYT", subject: "Coğrafya", topic: "Bölgeler", label: "Bölgeler", count: 1 },
  { exam: "TYT", subject: "Coğrafya", topic: "Çevre ve Afetler", label: "Doğal Afetler", count: 1 },
  { exam: "TYT", subject: "Felsefe", topic: "Bilgi Felsefesi", label: "Bilgi Felsefesi", count: 2 },
  { exam: "TYT", subject: "Felsefe", topic: "Bilim Felsefesi", label: "Bilim Felsefesi", count: 1 },
  { exam: "TYT", subject: "Felsefe", topic: "Ahlak Felsefesi", label: "Ahlak Felsefesi", count: 1 },
  { exam: "TYT", subject: "Felsefe", topic: "Felsefenin Konusu", label: "Felsefe'nin Konusu", count: 1 },
  { exam: "TYT", subject: "Din Kültürü", topic: "Bilgi ve İnanç", label: "Bilgi ve İnanç", count: 1 },
  { exam: "TYT", subject: "Din Kültürü", topic: "Din ve İslam", label: "Din ve İslam", count: 2 },
  { exam: "TYT", subject: "Din Kültürü", topic: "Hz. Muhammed", label: "Hz. Muhammed (S.A.V)", count: 1 },
  { exam: "TYT", subject: "Din Kültürü", topic: "Dinler ve Evrensel Öğretiler", label: "Din, Kültür ve Medeniyet", count: 1 },
  { exam: "TYT", subject: "Geometri", topic: "Üçgende Açılar", label: "Açılar ve Üçgenler", count: 5 },
  { exam: "TYT", subject: "Geometri", topic: "Çokgenler", label: "Çokgenler", count: 1 },
  { exam: "TYT", subject: "Geometri", topic: "Özel Dörtgenler", label: "Yamuk + Dikdörtgen", count: 2 },
  { exam: "TYT", subject: "Geometri", topic: "Katı Cisimler", label: "Katı Cisimler", count: 2 },
  { exam: "TYT", subject: "Fizik", topic: "Madde ve Özellikleri", label: "Madde ve Özellikleri", count: 1 },
  { exam: "TYT", subject: "Fizik", topic: "Hareket ve Kuvvet", label: "Kuvvet ve Hareket", count: 1 },
  { exam: "TYT", subject: "Fizik", topic: "Dalgalar", label: "Dalgalar", count: 1 },
  { exam: "TYT", subject: "Fizik", topic: "Optik", label: "Optik", count: 1 },
  { exam: "TYT", subject: "Kimya", topic: "Kimya Bilimi", label: "Kimya Bilimi", count: 1 },
  { exam: "TYT", subject: "Kimya", topic: "Atom ve Periyodik Sistem", label: "Atomun Yapısı", count: 1 },
  { exam: "TYT", subject: "Kimya", topic: "Maddenin Halleri", label: "Maddenin Halleri", count: 1 },
  { exam: "TYT", subject: "Kimya", topic: "Kimyasal Türler Arası Etkileşimler", label: "Kimyasal Türler Arası Etkileşimler", count: 1 },
  { exam: "TYT", subject: "Kimya", topic: "Asit, Baz ve Tuz", label: "Asit, Baz ve Tuz", count: 1 },
  { exam: "TYT", subject: "Kimya", topic: "Karışımlar", label: "Karışımlar", count: 1 },
];

const key = (exam: string, subject: string, topic: string) => `${exam}|${subject}|${topic}`;

const GARANTI_MAP = new Map(GARANTI_ROWS.map((r) => [key(r.exam, r.subject, r.topic), r]));

const STREAK_MAP = new Map<string, StreakRow>();
for (const row of STREAK_ROWS) {
  const k = key(row.exam, row.subject, row.topic);
  const prev = STREAK_MAP.get(k);
  STREAK_MAP.set(k, prev ? { ...prev, count: prev.count + row.count, label: `${prev.label} + ${row.label}` } : row);
}

export function guaranteeRow(exam: string, subject: string, topic: string): GuaranteeRow | undefined {
  return GARANTI_MAP.get(key(exam, subject, topic));
}

export function streakRow(exam: string, subject: string, topic: string): StreakRow | undefined {
  return STREAK_MAP.get(key(exam, subject, topic));
}

export function streakCount(exam: string, subject: string, topic: string): number {
  return STREAK_MAP.get(key(exam, subject, topic))?.count ?? 0;
}

export function isGuaranteedTopic(exam: string, subject: string, topic: string): boolean {
  return GARANTI_MAP.has(key(exam, subject, topic)) || STREAK_MAP.has(key(exam, subject, topic));
}

/** Bir dersin garanti konuları, en çok soru gelen önce. */
export function guaranteedBySubject(exam: ExamName) {
  const subjects = new Map<string, { subject: string; rows: GuaranteeRow[] }>();
  for (const row of GARANTI_ROWS) {
    if (row.exam !== exam) continue;
    const entry = subjects.get(row.subject) ?? { subject: row.subject, rows: [] };
    entry.rows.push(row);
    subjects.set(row.subject, entry);
  }
  return [...subjects.values()];
}

/** Bir dersin 5 yıl üst üste listesi, en çok soru gelen önce. */
export function streakBySubject(exam: ExamName) {
  const subjects = new Map<string, { subject: string; rows: StreakRow[] }>();
  for (const row of STREAK_ROWS) {
    if (row.exam !== exam) continue;
    const k = key(row.exam, row.subject, row.topic);
    const entry = subjects.get(row.subject) ?? { subject: row.subject, rows: [] };
    if (!entry.rows.some((r) => key(r.exam, r.subject, r.topic) === k)) entry.rows.push(STREAK_MAP.get(k) ?? row);
    subjects.set(row.subject, entry);
  }
  for (const entry of subjects.values()) entry.rows.sort((a, b) => b.count - a.count);
  return [...subjects.values()];
}

/** "Sıcak" konu = garanti listesinde veya 5 yıl üst üste. Plan ağırlığı buradan gelir. */
export function hotnessScore(exam: string, subject: string, topic: string): number {
  const g = guaranteeRow(exam, subject, topic) ? 0.6 : 0;
  const s = Math.min(0.4, streakCount(exam, subject, topic) / 30);
  return Math.min(1, g + s);
}
