/**
 * Planlama hedefleri ve kaynak kaydı — saf veri, test edilebilir.
 *
 * Buradaki tarihler ÖSYM'nin resmî takviminden (sınav günleri) ve kullanıcının
 * kendi tur hedeflerinden gelir. Konu yüzdeleri / net aralıkları ise
 * KAYNAKLARDA KESİN KURAL OLARAK BULUNMAZ; yaklaşık planlama önerisidir.
 * Ayrım `SOURCES[].strength` alanında açıkça tutulur.
 */

export interface Targets {
  /** Çalışma başlangıcı. */
  programStart: string;
  /** TYT ilk konu turu hedefi. */
  tytRound1: string;
  /** AYT ilk konu turu hedefi. */
  aytRound1: string;
  /** AYT için esnek son tarih. */
  aytFlex: string;
  /** Eksik konuları kapatma ve pekiştirme hedefi. */
  gapFill: string;
  /** Son dönem başlangıcı: deneme/tekrar/yanlış analizi ağırlıklı. */
  finalPeriod: string;
  /** TYT sınav günü (planlama çapası). */
  tytExam: string;
  /** AYT sınav günü. */
  aytExam: string;
}

export const TARGETS: Targets = {
  programStart: "2026-11-11",
  tytRound1: "2027-02-08",
  aytRound1: "2027-04-23",
  aytFlex: "2027-05-07",
  gapFill: "2027-05-17",
  finalPeriod: "2027-05-17",
  tytExam: "2027-06-19",
  aytExam: "2027-06-20",
};

export type SourceStrength = "resmi" | "kurumsal" | "ticari" | "editoryal";

export interface SourceRef {
  id: string;
  title: string;
  publisher: string;
  url: string;
  strength: SourceStrength;
  /** Bu kaynaktan hangi karar desteklendi? */
  usedFor: string;
  /** Kaynağın gerçekten söylediği şey. */
  finding: string;
}

/** Kaynakların son kontrol tarihi. */
export const SOURCES_CHECKED_AT = "2026-10-27";

export const SOURCES: SourceRef[] = [
  {
    id: "meb-deneme",
    title: "MEBİ 2026-2027 YKS ve LGS deneme takvimi",
    publisher: "Millî Eğitim Bakanlığı",
    url: "https://www.meb.gov.tr/mebi-2026-2027-yks-ve-lgs-deneme-takvimi-belli-oldu/haber/41943/tr",
    strength: "resmi",
    usedFor: "Deneme takviminin erken başlaması gerektiği kararı",
    finding:
      "MEBİ üzerinden 2026-2027 boyunca Türkiye geneli 12 YKS denemesi yapılacak. İlk YKS denemesi 21-27 Eylül 2026, Haziran 2027'ye kadar sürecek. Yani resmî takvim, denemeyi son aylara bırakmıyor.",
  },
  {
    id: "osym-2027",
    title: "2027-YKS sınav tarihleri açıklaması",
    publisher: "ÖSYM / Anadolu Ajansı",
    url: "https://www.aa.com.tr/tr/gundem/yks-19-20-haziran-2027de-yapilacak/4103332",
    strength: "resmi",
    usedFor: "Sınav günleri ve geri sayım çapası",
    finding:
      "ÖSYM Başkanı: 2027-YKS 19-20 Haziran'da. TYT 19 Haziran Cumartesi, AYT ve YDT 20 Haziran Pazar. Başvuru 4 Şubat-2 Mart, sonuç 21 Temmuz.",
  },
  {
    id: "saruhan-brans",
    title: "AYT branş denemelerine ne zaman başlanmalı?",
    publisher: "Saruhan Kurs",
    url: "https://saruhankurs.com/tr/content/ayt_bran%C5%9F_denemelerine_ne_zaman_ba%C5%9Flanmal%C4%B1",
    strength: "kurumsal",
    usedFor: "Branş denemesini konu ilerlemesine bağlama kararı",
    finding:
      "Başlangıç zamanını takvim değil konu durumu belirler. 'Bütün konular bitmeden dokunma' yanlıştır; konuların anlamlı bir bölümü öğrenilmişse başlanabilir. Açıkça: 'Bunun tek bir yüzdesi veya kesin kuralı yoktur.' İlk denemelerin işi net ölçmek değil, karma soruda tanıma ve süre davranışını görmektir.",
  },
  {
    id: "yksmax-program",
    title: "YKS deneme programı ne zaman başlamalı?",
    publisher: "YKSMax",
    url: "https://yksmax.com/rehber/yks-deneme-programi-ne-zaman-baslanmali",
    strength: "ticari",
    usedFor: "Branş ve genel denemenin görev ayrımı",
    finding:
      "Branş denemesi ders içi geçiş ve süreyi ölçer; genel deneme dersler arası enerji dağılımı ve sınav dayanıklılığını. Tam TYT/AYT denemesi erken dönemde seyrek başlangıç ölçümü olarak kullanılabilir. Sonucu yorumlarken henüz çalışılmamış konular ayrı tutulmalı.",
  },
  {
    id: "yksmax-analiz",
    title: "YKS deneme analizi nasıl yapılır?",
    publisher: "YKSMax",
    url: "https://yksmax.com/rehber/yks-deneme-analizi-nasil-yapilir",
    strength: "ticari",
    usedFor: "Hata nedeni sınıflandırması ve analiz->görev aktarımı",
    finding:
      "Her yanlış ve kritik boş için dört neden: bilgi eksiği, yöntem/işlem hatası, süre yönetimi, dikkat. Tek deneme karar için yeterli değil; benzer koşullardaki son üç denemenin ders bazında hareketi izlenmeli. Analiz 24-48 saat içinde somut göreve dönüşmeli. En çok puan kaybettiren tek nedene öncelik verilmeli.",
  },
  {
    id: "nettik",
    title: "Deneme sınavına ne zaman başlanmalı?",
    publisher: "Nettik",
    url: "https://nettik.com.tr/blog/deneme-sinavi-ne-zaman-baslamali",
    strength: "ticari",
    usedFor: "İlk seviye belirleme denemesi kararı",
    finding:
      "İlk genel deneme çalışma döneminin ilk iki-üç haftasında çözülmeli. Sıra: ilk iki-üç haftada bir genel denemeyle seviye tespiti, konu eksikken branş denemesi, konular oturdukça haftalık genel deneme. Deneme sayısını kademeli artır, ama analize ayrılan süreyi denemeden kısa tutma.",
  },
  {
    id: "ailevegitim",
    title: "Branş denemesi ne zaman çözülür?",
    publisher: "Aile ve Eğitim",
    url: "https://ailevegitim.com/brans-denemesi-ne-zaman-cozulur/",
    strength: "editoryal",
    usedFor: "Konu durumuna göre deneme türü karar rehberi",
    finding:
      "Branş denemesi MEB/ÖSYM kılavuzlarında tanımlı resmî bir sınav türü değildir. Kapsamdaki konular çalışılmadıysa sonuç konu eksikliğini değil henüz işlenmemiş konuyu gösterir. Karar rehberi: konu hiç çalışılmadı -> deneme değil konu anlatımı; pratik az -> önce konu tarama testi; konu bitti -> branş denemesi uygun; ders bitti diğerleri sürüyor -> iki-üç derslik karma deneme; tüm konular bitti -> genel deneme öne çıkar. Tablo 'editoryal bir öneri'dir.",
  },
];

/**
 * Kaynaklarda AÇIKÇA bulunmayan, bu program için üretilmiş yaklaşık aralıklar.
 *
 * Önemli: %35-45, %50-65 gibi bantlar ve net aralıkları hiçbir kaynakta
 * 'kanıtlanmış eşik' olarak geçmiyor. Saruhan açıkça 'kesin kural yok' diyor,
 * Aile ve Eğitim tablosunu 'editoryal öneri' sayıyor. Bu yüzden bu değerler
 * kaynak kanıtı gibi gösterilmez; yalnızca planlama başlangıcıdır.
 */
export const PLANNING_BANDS_NOTE =
  "Bu yüzdeler ve net aralıkları kaynaklarda kesin kural olarak geçmiyor. Saruhan Kurs 'tek bir yüzdesi veya kesin kuralı yoktur' diyor; Aile ve Eğitim tablosunu 'editoryal öneri' olarak etiketliyor; YKSMax net aralıklarının bilimsel baraj olmadığını belirtiyor. Aşağıdaki değerler bu program için üretilmiş yaklaşık planlama önerileridir.";
