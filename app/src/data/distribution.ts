/** Geçmiş YKS konu-soru derlemesi.
 * 2018–2025: Hatay Reyhanlı Fen Lisesi rehberlik, ÖSYM kitapçık sınıflandırması (PDF, Aralık 2025).
 * 2026 TYT: UniRehberi konu tablosu (2026 oturumu gerçekleşti). AYT 2026 konu-yıl satırları yok — uydurulmadı.
 * ÖSYM resmi konu etiketi yayınlamaz.
 */
export const DIST_YEARS = [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026] as const;

export const DIST_SOURCE = {
  title: "Yıllara göre soru dağılımı (2018–2026)",
  publisher: "Hatay Reyhanlı Fen Lisesi Rehberlik Servisi + 2026 TYT UniRehberi derlemesi",
  basedOn: "ÖSYM TYT/AYT soru kitapçıkları",
  year: "2026",
  note: "Konu etiketleri derleyicinin sınıflandırmasıdır. ÖSYM resmi konu-soru tablosu yayınlamaz. AYT Matematik/Geometri 2018–2025 (8 yıl), AYT Fizik/Kimya/Biyoloji 2019–2025 (7 yıl). AYT 2026 konu-yıl satırları kaynakta yok. AYT Kimya tablosu satır bazında tutarlı, sütun toplamı basılı 13 yerine 14–16 çıkıyor; değerler düzeltilmedi.",
  urls: [
    "https://reyhanlisfkasml.meb.k12.tr/meb_iys_dosyalar/31/08/963209/dosyalar/2025_12/694bcadab4eec921652162_2025TYT_Y%C4%B1llara_Gore_Soru_Dag%C4%B1l%C4%B1m%C4%B1.pdf",
    "https://reyhanlisfkasml.meb.k12.tr/meb_iys_dosyalar/31/08/963209/dosyalar/2025_12/694bcaf0da32d183108646_2025AYT_Y%C4%B1llara_Gore_Soru_Dag%C4%B1l%C4%B1m%C4%B1.pdf",
    "https://www.unirehberi.com/tyt-bilinmesi-gereken-konular/",
  ],
};

export type DistRow = {
  exam: "TYT" | "AYT";
  subject: string;
  topic: string;
  counts: (number | null)[];
};

const n = (v: number | null) => v;

export const DISTRIBUTION: DistRow[] = [
  // TYT Türkçe
  { exam: "TYT", subject: "Türkçe", topic: "Ses Bilgisi", counts: [3, 1, null, 1, null, 1, null, null, null] },
  { exam: "TYT", subject: "Türkçe", topic: "Dil Bilgisi", counts: [1, 8, 3, 2, 3, 2, 3, 3, null] },
  { exam: "TYT", subject: "Türkçe", topic: "Noktalama İşaretleri", counts: [1, 1, 2, 2, 2, 2, 2, 2, 2] },
  { exam: "TYT", subject: "Türkçe", topic: "Yazım Kuralları", counts: [2, 2, 2, 2, 2, 2, 2, 2, 2] },
  { exam: "TYT", subject: "Türkçe", topic: "Anlatım Bozukluğu", counts: [1, null, null, null, null, null, null, null, null] },
  { exam: "TYT", subject: "Türkçe", topic: "Paragraf", counts: [22, 22, 26, 25, 26, 26, 26, 26, 27] },
  { exam: "TYT", subject: "Türkçe", topic: "Cümlede Anlam", counts: [7, 3, 6, 3, 3, 4, 3, 3, 3] },
  { exam: "TYT", subject: "Türkçe", topic: "Sözcükte Anlam", counts: [3, 3, 1, 5, 4, 3, 4, 4, 3] },
  // TYT Matematik
  { exam: "TYT", subject: "Matematik", topic: "Olasılık", counts: [2, 1, 1, 1, 1, 1, 1, 1, 1] },
  { exam: "TYT", subject: "Matematik", topic: "Permütasyon – Kombinasyon", counts: [1, 1, 2, null, null, 1, 3, 1, 1] },
  { exam: "TYT", subject: "Matematik", topic: "Oran – Orantı", counts: [null, null, 1, 1, 1, 1, null, 1, 2] },
  { exam: "TYT", subject: "Matematik", topic: "Mutlak Değer", counts: [1, 1, 1, 1, 1, 1, 2, 1, 1] },
  { exam: "TYT", subject: "Matematik", topic: "Problemler", counts: [11, 12, 13, 13, 13, 10, 11, 12, 15] },
  { exam: "TYT", subject: "Matematik", topic: "Temel Kavramlar", counts: [4, 1, 1, 3, 3, 2, 1, 3, null] },
  { exam: "TYT", subject: "Matematik", topic: "Sayı Basamakları", counts: [1, 2, 1, 2, 1, 1, 2, 1, 1] },
  { exam: "TYT", subject: "Matematik", topic: "Kümeler", counts: [2, 2, 1, 1, 1, 1, 1, 1, 1] },
  { exam: "TYT", subject: "Matematik", topic: "Mantık", counts: [null, null, null, null, 1, 1, 1, 1, 2] },
  { exam: "TYT", subject: "Matematik", topic: "Fonksiyonlar", counts: [1, 2, 2, 1, 1, 1, 1, 1, 1] },
  { exam: "TYT", subject: "Matematik", topic: "Bölme ve Bölünebilme", counts: [null, null, null, 1, 1, 1, 1, 1, 1] },
  { exam: "TYT", subject: "Matematik", topic: "Basit Eşitsizlikler", counts: [1, 1, 1, 1, 1, 3, null, 1, null] },
  { exam: "TYT", subject: "Matematik", topic: "Denklem Çözme", counts: [null, 2, null, null, 1, 1, null, 1, null] },
  { exam: "TYT", subject: "Matematik", topic: "Üslü Sayılar", counts: [2, null, null, 1, 1, 1, 1, 1, 1] },
  { exam: "TYT", subject: "Matematik", topic: "Çarpanlara Ayırma", counts: [null, 1, null, null, null, null, null, null, null] },
  { exam: "TYT", subject: "Matematik", topic: "Köklü Sayılar", counts: [2, 1, null, 1, 1, 1, 1, 1, 1] },
  { exam: "TYT", subject: "Matematik", topic: "EBOB – EKOK", counts: [null, null, 2, null, null, null, 1, null, null] },
  { exam: "TYT", subject: "Matematik", topic: "Rasyonel Sayılar", counts: [1, null, 3, 3, 1, 2, 2, 1, 1] },
  { exam: "TYT", subject: "Matematik", topic: "Polinomlar", counts: [1, 1, null, null, null, null, null, null, null] },
  { exam: "TYT", subject: "Matematik", topic: "Veri ve İstatistik", counts: [null, null, 1, null, 1, 1, 1, 1, 1] },
  // TYT Geometri
  { exam: "TYT", subject: "Geometri", topic: "Analitik Geometri", counts: [1, 1, null, 1, 1, null, null, null, null] },
  { exam: "TYT", subject: "Geometri", topic: "Çember ve Daire", counts: [1, 2, null, null, null, null, null, null, null] },
  { exam: "TYT", subject: "Geometri", topic: "Katı Cisimler", counts: [1, 2, 2, 2, 2, 2, 2, 2, 2] },
  { exam: "TYT", subject: "Geometri", topic: "Özel Dörtgenler", counts: [4, 3, 5, 2, 2, 3, 3, 3, 3] },
  { exam: "TYT", subject: "Geometri", topic: "Çokgenler", counts: [1, 1, 1, 1, 1, 1, 1, 1, 1] },
  { exam: "TYT", subject: "Geometri", topic: "Üçgende Açılar", counts: [3, 1, 2, 4, 4, 5, 5, 4, 4] },
  // TYT Fizik
  { exam: "TYT", subject: "Fizik", topic: "Fizik Bilimine Giriş", counts: [1, null, 1, null, null, null, null, null, null] },
  { exam: "TYT", subject: "Fizik", topic: "Madde ve Özellikleri", counts: [null, 1, null, 1, 1, 1, 1, 1, 1] },
  { exam: "TYT", subject: "Fizik", topic: "Hareket ve Kuvvet", counts: [1, 1, 1, 1, 1, 1, null, 1, 1] },
  { exam: "TYT", subject: "Fizik", topic: "İş, Güç ve Enerji", counts: [null, 1, null, null, null, null, null, null, null] },
  { exam: "TYT", subject: "Fizik", topic: "Isı ve Sıcaklık", counts: [1, 1, null, 1, 1, 1, 1, 1, 1] },
  { exam: "TYT", subject: "Fizik", topic: "Elektrostatik", counts: [1, null, null, null, 1, null, null, 1, 1] },
  { exam: "TYT", subject: "Fizik", topic: "Elektrik ve Manyetizma", counts: [null, 1, 1, 1, null, 2, 2, null, null] },
  { exam: "TYT", subject: "Fizik", topic: "Basınç ve Kaldırma Kuvveti", counts: [1, null, 2, 1, 1, null, 1, 1, 1] },
  { exam: "TYT", subject: "Fizik", topic: "Dalgalar", counts: [null, null, 1, 1, 1, null, 1, 1, 1] },
  { exam: "TYT", subject: "Fizik", topic: "Optik", counts: [2, 2, 1, 1, 1, 2, 1, 1, 1] },
  // TYT Kimya (2018–2024 Kağan/MEB örtüşmesi; 2025 MEB satırları kısmi)
  { exam: "TYT", subject: "Kimya", topic: "Kimya Bilimi", counts: [2, null, 1, 1, 1, 1, 1, 1, null] },
  { exam: "TYT", subject: "Kimya", topic: "Atom ve Periyodik Sistem", counts: [1, 2, 1, 1, 1, 1, 1, 1, 1] },
  { exam: "TYT", subject: "Kimya", topic: "Maddenin Halleri", counts: [1, 1, 1, 1, 1, 1, 1, 1, 1] },
  { exam: "TYT", subject: "Kimya", topic: "Kimyasal Türler Arası Etkileşimler", counts: [1, 1, 1, 1, 1, 1, 1, null, 2] },
  { exam: "TYT", subject: "Kimya", topic: "Mol ve Kimyasal Hesaplamalar", counts: [null, null, 1, 1, null, null, 1, null, 1] },
  { exam: "TYT", subject: "Kimya", topic: "Kimyanın Temel Kanunları", counts: [1, null, null, null, 1, 1, null, null, null] },
  { exam: "TYT", subject: "Kimya", topic: "Asit, Baz ve Tuz", counts: [null, 1, 1, 1, 1, 1, 1, null, 1] },
  { exam: "TYT", subject: "Kimya", topic: "Karışımlar", counts: [null, 1, 1, 1, 1, 1, 1, null, 1] },
  { exam: "TYT", subject: "Kimya", topic: "Kimya Her Yerde", counts: [1, 1, null, null, null, null, null, null, null] },
  // AYT Matematik
  { exam: "AYT", subject: "Matematik", topic: "Temel Kavramlar", counts: [4, 2, 2, 3, 2, 4, 2, 1, null] },
  { exam: "AYT", subject: "Matematik", topic: "Sayı Basamakları", counts: [null, null, 3, null, null, null, 1, 1, null] },
  { exam: "AYT", subject: "Matematik", topic: "Üslü Sayılar", counts: [null, null, 1, 1, null, 1, null, 1, null] },
  { exam: "AYT", subject: "Matematik", topic: "Bölme ve Bölünebilme", counts: [null, 1, null, null, null, 1, null, null, null] },
  { exam: "AYT", subject: "Matematik", topic: "Fonksiyonlar", counts: [3, 2, 2, 2, 2, 2, 2, 2, null] },
  { exam: "AYT", subject: "Matematik", topic: "2. Dereceden Denklemler", counts: [null, null, 1, 1, 2, 2, 1, 1, null] },
  { exam: "AYT", subject: "Matematik", topic: "Mantık", counts: [2, 1, null, 1, 1, 1, 1, 1, null] },
  { exam: "AYT", subject: "Matematik", topic: "2. Dereceden Fonksiyonlar", counts: [null, 1, 1, 1, null, 1, 1, null, null] },
  { exam: "AYT", subject: "Matematik", topic: "Trigonometri", counts: [3, 3, 4, 5, 4, 5, 5, 5, null] },
  { exam: "AYT", subject: "Matematik", topic: "Karmaşık Sayılar", counts: [1, 1, 2, null, null, null, null, null, null] },
  { exam: "AYT", subject: "Matematik", topic: "Polinomlar", counts: [2, 2, 2, 1, 1, 2, null, 1, null] },
  { exam: "AYT", subject: "Matematik", topic: "Logaritma", counts: [2, 3, 3, 1, 2, 3, 1, 2, null] },
  { exam: "AYT", subject: "Matematik", topic: "Diziler", counts: [1, 1, 2, 1, 1, 2, 1, 1, null] },
  { exam: "AYT", subject: "Matematik", topic: "Permütasyon – Kombinasyon", counts: [2, 2, 3, 2, 3, 3, 3, 3, null] },
  { exam: "AYT", subject: "Matematik", topic: "Limit ve Süreklilik", counts: [1, 2, null, 2, 2, null, 2, 2, null] },
  { exam: "AYT", subject: "Matematik", topic: "Türev", counts: [1, 4, null, 3, 4, null, 3, 3, null] },
  { exam: "AYT", subject: "Matematik", topic: "İntegral", counts: [3, 4, null, 4, 4, null, 5, 3, null] },
  { exam: "AYT", subject: "Matematik", topic: "Köklü Sayılar", counts: [1, null, null, null, null, null, null, null, null] },
  { exam: "AYT", subject: "Matematik", topic: "Kümeler", counts: [null, 1, 2, 1, 1, 1, 1, 1, null] },
  { exam: "AYT", subject: "Matematik", topic: "Eşitsizlikler ve Sistemler", counts: [null, 1, 1, 1, null, 1, 1, 1, null] },
  { exam: "AYT", subject: "Matematik", topic: "Mutlak Değer", counts: [null, 1, 1, null, null, 1, null, 1, null] },
  { exam: "AYT", subject: "Matematik", topic: "EBOB – EKOK", counts: [null, null, null, 1, 1, null, null, 1, null] },
  { exam: "AYT", subject: "Matematik", topic: "Çarpanlara Ayırma", counts: [null, null, null, null, 1, null, 1, null, null] },
  // AYT Geometri
  { exam: "AYT", subject: "Geometri", topic: "Üçgenler", counts: [3, 1, 3, null, 1, 3, 1, 1, null] },
  { exam: "AYT", subject: "Geometri", topic: "Çokgenler", counts: [1, 2, 1, null, null, null, null, null, null] },
  { exam: "AYT", subject: "Geometri", topic: "Analitik Geometri", counts: [2, 1, 2, 4, 2, 1, 4, 3, null] },
  { exam: "AYT", subject: "Geometri", topic: "Dönüşümler", counts: [1, 1, 1, null, 1, 1, null, 1, null] },
  { exam: "AYT", subject: "Geometri", topic: "Çember ve Daire", counts: [1, 2, 2, 3, 2, 2, 2, 2, null] },
  { exam: "AYT", subject: "Geometri", topic: "Özel Dörtgenler", counts: [1, null, null, null, null, 1, null, null, null] },
  { exam: "AYT", subject: "Geometri", topic: "Katı Cisimler", counts: [1, 1, 1, 1, 2, 1, 1, 1, null] },
  // AYT Fizik (2019–2025; 2018 sütunu boş)
  { exam: "AYT", subject: "Fizik", topic: "Vektörler", counts: [null, null, null, null, null, 1, null, null, null] },
  { exam: "AYT", subject: "Fizik", topic: "Bağıl Hareket", counts: [null, 1, 1, null, null, null, 1, null, null] },
  { exam: "AYT", subject: "Fizik", topic: "Newton Yasaları", counts: [null, null, 2, null, 2, 1, null, 1, null] },
  { exam: "AYT", subject: "Fizik", topic: "Hareket", counts: [null, 1, 1, 2, null, 1, 1, 2, null] },
  { exam: "AYT", subject: "Fizik", topic: "İş, Güç, Enerji", counts: [null, null, 1, null, null, null, null, 1, null] },
  { exam: "AYT", subject: "Fizik", topic: "İtme ve Momentum", counts: [null, 1, 1, null, 1, 1, 1, null, null] },
  { exam: "AYT", subject: "Fizik", topic: "Tork ve Denge", counts: [null, 1, null, 1, null, 1, null, null, null] },
  { exam: "AYT", subject: "Fizik", topic: "Çembersel Hareket", counts: [null, 1, 2, 1, 1, 1, 1, 1, null] },
  { exam: "AYT", subject: "Fizik", topic: "Elektrik Alan", counts: [null, 1, 1, 1, null, 1, 1, 1, null] },
  { exam: "AYT", subject: "Fizik", topic: "Manyetik Alan", counts: [null, 1, 1, 1, 1, 1, 1, 1, null] },
  { exam: "AYT", subject: "Fizik", topic: "İndüksiyon ve Alternatif Akım", counts: [null, 1, 1, 1, 1, 2, 1, 1, null] },
  { exam: "AYT", subject: "Fizik", topic: "Basit Harmonik Hareket", counts: [null, 1, 1, 1, 1, 1, 1, 1, null] },
  { exam: "AYT", subject: "Fizik", topic: "Dalga Mekaniği", counts: [null, null, 1, 1, 1, 1, 1, 1, null] },
  { exam: "AYT", subject: "Fizik", topic: "Kütle Çekim", counts: [null, null, null, 1, null, 1, 1, 1, null] },
  { exam: "AYT", subject: "Fizik", topic: "Modern Fizik", counts: [null, 1, null, 1, 2, null, 1, null, null] },
  // AYT Kimya (2019–2025; 2018 sütunu kaynak tablosunda yok)
  // Kaynak tablo satır bazında kendi TOPLAM'ıyla tutarlı, ancak sütun toplamı
  // basılı 13 yerine 14–16 çıkıyor (kaynak derlemesinin kendi içinde tutarsızlığı).
  // Değerler düzeltilmedi; kaynaktan birebir aktarıldı.
  { exam: "AYT", subject: "Kimya", topic: "Modern Atom Teorisi", counts: [null, 1, 2, null, 1, 1, 1, 1, null] },
  { exam: "AYT", subject: "Kimya", topic: "Gazlar", counts: [null, 2, 2, null, 2, 2, 1, 1, null] },
  { exam: "AYT", subject: "Kimya", topic: "Sıvı Çözeltiler", counts: [null, 1, 2, 2, 2, 2, 2, 1, null] },
  { exam: "AYT", subject: "Kimya", topic: "Kimyasal Tepkimelerde Enerji", counts: [null, 1, 1, 1, 1, 1, 1, 1, null] },
  { exam: "AYT", subject: "Kimya", topic: "Kimyasal Tepkimelerde Hız", counts: [null, 2, 1, 1, 1, null, 1, 1, null] },
  { exam: "AYT", subject: "Kimya", topic: "Kimyasal Denge", counts: [null, null, null, 1, 1, 1, 1, 1, null] },
  { exam: "AYT", subject: "Kimya", topic: "Asit-Baz Dengesi", counts: [null, 2, 1, 1, 1, 1, 1, 1, null] },
  { exam: "AYT", subject: "Kimya", topic: "Kimya ve Elektrik", counts: [null, 2, 3, 4, 2, 3, 2, 2, null] },
  { exam: "AYT", subject: "Kimya", topic: "Organik Kimyaya Giriş", counts: [null, 2, 1, 1, 1, 1, 1, 2, null] },
  { exam: "AYT", subject: "Kimya", topic: "Hidrokarbonlar", counts: [null, 1, 2, 1, null, null, 1, 1, null] },
  { exam: "AYT", subject: "Kimya", topic: "Organik Bileşikler", counts: [null, null, null, 1, 1, 1, 4, 1, null] },
  // AYT Biyoloji (2019–2025; 2018 sütunu kaynak tablosunda yok)
  // Kaynak satırları NetDefter konularıyla eşleştirildi. NetDefter'de ayrı konu
  // olan başlıklar (Sinir/Endokrin/Duyu, Fotosentez, Hücresel Solunum, Canlılar ve
  // Çevre) kaynakta birleşik olduğu için kaynak adıyla tek satır bırakıldı; bölme
  // yapılmadı (uydurma olurdu).
  { exam: "AYT", subject: "Biyoloji", topic: "Denetleyici ve Düzenleyici Sistem, Duyu Organları", counts: [null, 1, 2, 1, 1, 3, 1, 1, null] },
  { exam: "AYT", subject: "Biyoloji", topic: "Destek ve Hareket", counts: [null, null, null, 1, 1, null, null, null, null] },
  { exam: "AYT", subject: "Biyoloji", topic: "Sindirim Sistemi", counts: [null, 1, 1, null, null, 1, 1, 1, null] },
  { exam: "AYT", subject: "Biyoloji", topic: "Dolaşım ve Bağışıklık", counts: [null, 1, 1, 1, 1, 1, 1, 1, null] },
  { exam: "AYT", subject: "Biyoloji", topic: "Solunum Sistemi", counts: [null, 1, 1, 1, 1, 1, 1, null, null] },
  { exam: "AYT", subject: "Biyoloji", topic: "Boşaltım Sistemi", counts: [null, 1, 1, null, null, 1, 1, 1, null] },
  { exam: "AYT", subject: "Biyoloji", topic: "Üreme ve Gelişim", counts: [null, null, null, null, 1, null, null, 1, null] },
  { exam: "AYT", subject: "Biyoloji", topic: "Komünite Ekolojisi", counts: [null, null, 2, 2, 2, 2, 2, 1, null] },
  { exam: "AYT", subject: "Biyoloji", topic: "Genden Proteine", counts: [null, 2, 3, 2, 2, 1, 2, 2, null] },
  { exam: "AYT", subject: "Biyoloji", topic: "Canlılık ve Enerji", counts: [null, 2, 2, 2, 2, 2, 2, 2, null] },
  { exam: "AYT", subject: "Biyoloji", topic: "Bitki Biyolojisi", counts: [null, 3, null, 2, 2, null, 2, 2, null] },
  { exam: "AYT", subject: "Biyoloji", topic: "Canlılar ve Çevre", counts: [null, 1, null, 1, null, 1, null, 1, null] },
  // TYT Biyoloji (aynı MEB rehberlik derlemesi)
  { exam: "TYT", subject: "Biyoloji", topic: "Canlıların Ortak Özellikleri", counts: [null, 1, null, null, 1, null, null, 1, null] },
  { exam: "TYT", subject: "Biyoloji", topic: "Canlıların Temel Bileşenleri", counts: [1, 1, 1, 1, null, 1, null, null, 1] },
  { exam: "TYT", subject: "Biyoloji", topic: "Hücre", counts: [1, null, 1, 1, 1, 1, 1, 1, 2] },
  { exam: "TYT", subject: "Biyoloji", topic: "Canlıların Sınıflandırılması", counts: [1, 1, 1, 1, 1, 1, 1, 1, null] },
  { exam: "TYT", subject: "Biyoloji", topic: "Hücre Bölünmeleri", counts: [1, 1, 1, 1, 1, 1, 1, 1, 1] },
  { exam: "TYT", subject: "Biyoloji", topic: "Kalıtım", counts: [null, 1, 1, 1, 1, 1, 1, 1, 1] },
  { exam: "TYT", subject: "Biyoloji", topic: "Ekosistem Ekolojisi", counts: [1, 1, null, 1, null, 1, 1, null, 1] },
  { exam: "TYT", subject: "Biyoloji", topic: "Güncel Çevre Sorunları", counts: [1, null, 1, null, 1, null, null, 1, null] },
  // TYT Tarih
  { exam: "TYT", subject: "Tarih", topic: "İlk ve Orta Çağlarda Türk Dünyası", counts: [1, 1, 1, 1, 1, 1, 1, 1, 1] },
  { exam: "TYT", subject: "Tarih", topic: "İslam Tarihi", counts: [1, null, null, null, null, null, null, null, null] },
  { exam: "TYT", subject: "Tarih", topic: "Türk-İslam Devletleri", counts: [1, 1, 1, 1, 1, 1, 1, 1, 1] },
  { exam: "TYT", subject: "Tarih", topic: "Osmanlı Kuruluş ve Yükselme", counts: [1, 1, null, null, 1, null, 1, 1, 1] },
  { exam: "TYT", subject: "Tarih", topic: "Osmanlı'da Değişim", counts: [1, null, 1, 1, null, 1, null, null, null] },
  { exam: "TYT", subject: "Tarih", topic: "XX. Yüzyıl Başları", counts: [1, null, 1, null, null, null, null, null, null] },
  { exam: "TYT", subject: "Tarih", topic: "Milli Mücadele", counts: [null, 1, 1, 1, 1, 2, 1, 1, 1] },
  { exam: "TYT", subject: "Tarih", topic: "Atatürkçülük ve İnkılap", counts: [null, 1, null, 1, 1, null, 1, 1, 1] },
  // TYT Coğrafya
  { exam: "TYT", subject: "Coğrafya", topic: "Doğa ve İnsan", counts: [1, 1, null, null, null, null, null, null, null] },
  { exam: "TYT", subject: "Coğrafya", topic: "Dünya'nın Şekli ve Hareketleri", counts: [null, null, null, 1, null, null, null, null, null] },
  { exam: "TYT", subject: "Coğrafya", topic: "Harita Bilgisi", counts: [1, null, 1, null, 1, null, 1, 1, null] },
  { exam: "TYT", subject: "Coğrafya", topic: "Atmosfer ve İklim", counts: [1, 1, 1, 1, 1, 1, 1, 1, 1] },
  { exam: "TYT", subject: "Coğrafya", topic: "Yerin Yapısı", counts: [null, null, 1, 1, 1, 1, null, null, null] },
  { exam: "TYT", subject: "Coğrafya", topic: "Nüfus ve Yerleşme", counts: [1, 2, 1, 1, null, 1, 1, 1, 1] },
  { exam: "TYT", subject: "Coğrafya", topic: "Ekonomik Faaliyetler", counts: [null, null, null, null, 1, null, null, null, null] },
  { exam: "TYT", subject: "Coğrafya", topic: "Bölgeler", counts: [null, null, 1, 1, null, 1, 1, 1, 1] },
  // TYT Felsefe
  { exam: "TYT", subject: "Felsefe", topic: "Felsefenin Konusu", counts: [null, 1, null, 2, 1, 2, 1, null, 1] },
  { exam: "TYT", subject: "Felsefe", topic: "Bilgi Felsefesi", counts: [2, 1, 1, null, 2, 2, 1, 3, 1] },
  { exam: "TYT", subject: "Felsefe", topic: "Bilim Felsefesi", counts: [null, 1, null, null, null, null, null, 1, null] },
  { exam: "TYT", subject: "Felsefe", topic: "Varlık Felsefesi", counts: [1, null, 1, 1, null, null, 1, null, 1] },
  { exam: "TYT", subject: "Felsefe", topic: "Ahlak Felsefesi", counts: [1, 1, 2, null, 1, 1, 1, 1, null] },
  { exam: "TYT", subject: "Felsefe", topic: "Siyaset Felsefesi", counts: [null, 1, null, 1, 1, null, null, null, null] },
  { exam: "TYT", subject: "Felsefe", topic: "Din Felsefesi", counts: [1, null, 1, null, null, null, 1, null, null] },
  { exam: "TYT", subject: "Felsefe", topic: "Sanat Felsefesi", counts: [null, null, null, 1, null, null, null, null, null] },
  // TYT Din
  { exam: "TYT", subject: "Din Kültürü", topic: "Bilgi ve İnanç", counts: [1, 2, 1, 1, 1, 1, 1, 1, 2] },
  { exam: "TYT", subject: "Din Kültürü", topic: "Din ve İslam", counts: [null, null, null, null, 1, 1, 1, 1, null] },
  { exam: "TYT", subject: "Din Kültürü", topic: "İslam ve İbadet", counts: [1, 1, null, 1, 1, null, null, null, null] },
  { exam: "TYT", subject: "Din Kültürü", topic: "Gençlik ve Değerler", counts: [1, 1, 1, 1, null, null, null, null, null] },
  { exam: "TYT", subject: "Din Kültürü", topic: "Hz. Muhammed", counts: [1, 1, 1, null, null, 1, 1, 1, 1] },
  { exam: "TYT", subject: "Din Kültürü", topic: "İslam Düşüncesinde Yorumlar", counts: [null, null, null, null, null, 1, 1, null, 1] },
  { exam: "TYT", subject: "Din Kültürü", topic: "Din ve Laiklik", counts: [null, null, null, 1, 1, 1, null, 1, null] },
];

void n;

export function distStats(row: DistRow) {
  const recent = row.counts.slice(-6);
  const nums = row.counts.filter((x): x is number => x != null);
  const recentNums = recent.filter((x): x is number => x != null);
  const total = nums.reduce((a, b) => a + b, 0);
  const recentTotal = recentNums.reduce((a, b) => a + b, 0);
  const yearsWith = nums.length;
  const lastIdx = [...row.counts].reverse().findIndex((x) => x != null && x > 0);
  const lastYear = lastIdx >= 0 ? DIST_YEARS[DIST_YEARS.length - 1 - lastIdx] : null;
  const avg = yearsWith ? total / yearsWith : 0;
  return { total, recentTotal, yearsWith, lastYear, avg };
}

export function frequencyTier(row: DistRow): "yuksek" | "orta" | "dusuk" {
  const { recentTotal } = distStats(row);
  if (recentTotal >= 8) return "yuksek";
  if (recentTotal >= 3) return "orta";
  return "dusuk";
}

export function consecutiveYears(row: DistRow) {
  const last = row.counts.length - 1;
  const yearCompiled = DISTRIBUTION.some((r) => r.exam === row.exam && r.counts[last] != null);
  const counts = yearCompiled ? row.counts.map((c) => (c == null ? 0 : c)) : row.counts.slice(0, last);
  let streak = 0;
  for (let i = counts.length - 1; i >= 0; i--) {
    const c = counts[i];
    if (c != null && c > 0) streak += 1;
    else break;
  }
  return streak;
}

export function fiveYearStreak(row: DistRow) {
  return consecutiveYears(row) >= 5;
}

export function findDist(exam: string, subject: string, topic: string) {
  return DISTRIBUTION.find((r) => r.exam === exam && r.subject === subject && r.topic === topic);
}

export function frequencyScore(exam: string, subject: string, topic: string) {
  const row = findDist(exam, subject, topic);
  if (!row) return 0.45;
  const { recentTotal } = distStats(row);
  return Math.min(1, recentTotal / 18);
}

/**
 * Konunun soru ağırlığı (son yıllardaki ortalama soru sayısı).
 *
 * Ağırlıklı ilerleme hesabı için. Dağılım verisi yoksa `null` döner — bu
 * durumda çağıran taraf ağırlık uydurmamalı, eşit ağırlığa düşmelidir.
 */
export function topicWeight(exam: string, subject: string, topic: string): number | null {
  const row = findDist(exam, subject, topic);
  if (!row) return null;
  const { avg, yearsWith } = distStats(row);
  if (!yearsWith) return null;
  return avg;
}
