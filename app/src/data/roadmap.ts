import type { TopicRow, TytExam, AytExam } from "@/lib/types";
import { tytNets, aytNets } from "@/lib/stats";
import { learningStage, explainStage, STAGE_LABEL, type LearningStage } from "@/lib/smart/progress";
import { GARANTI_ROWS, STREAK_ROWS } from "@/data/guaranteed";

/**
 * TYT sayısal çekirdek — bitince AYT küme/fonksiyon açılır.
 *
 * Liste kullanıcının verdiği sırayla birebir aynıdır ve `curriculum.json`
 * yazımıyla eşleşir (ör. "EBOB – EKOK", "Oran – Orantı"). Ad uyuşmazlığı
 * kapıyı sessizce hiç açmaz hâle getirir; `references.test.ts` bunu denetler.
 */
export const MAT_AYT_GATE = [
  "Temel Kavramlar",
  "Sayı Basamakları",
  "Bölme ve Bölünebilme",
  "EBOB – EKOK",
  "Rasyonel Sayılar",
  "Basit Eşitsizlikler",
  "Mutlak Değer",
  "Üslü Sayılar",
  "Köklü Sayılar",
  "Çarpanlara Ayırma",
  "Oran – Orantı",
  "Denklem Çözme",
];

export const FIZ_AYT_GATE = [
  "Fizik Bilimine Giriş",
  "Madde ve Özellikleri",
  "Hareket ve Kuvvet",
  "İş, Güç ve Enerji",
];

export const KIM_AYT_GATE = [
  "Kimya Bilimi",
  "Atom ve Periyodik Sistem",
  "Kimyasal Türler Arası Etkileşimler",
  "Kimyanın Temel Kanunları",
  "Mol ve Kimyasal Hesaplamalar",
];

/**
 * Biyoloji: TYT bitirmek tercih; hızlı geçişte bu konular sonraya bırakılabilir.
 * Kullanıcı şartı: ertelense bile SİLİNMEZ, yalnızca geriye atılır.
 */
export const BIO_SKIP_FOR_FAST = ["Kalıtım", "Canlıların Sınıflandırılması"];

/** Rehberlik servisi / koçluk derlemeleri — “her sene garanti” iddiası; kesin ÖSYM tablosu değil. */
export const GARANTI_TOPICS: { exam: "TYT" | "AYT"; subject: string; topic: string }[] = [
  ...GARANTI_ROWS.map((r) => ({ exam: r.exam, subject: r.subject, topic: r.topic })),
  ...STREAK_ROWS.map((r) => ({ exam: r.exam, subject: r.subject, topic: r.topic })),
].filter((row, i, all) => all.findIndex((x) => x.exam === row.exam && x.subject === row.subject && x.topic === row.topic) === i);

/** AYT garanti listesi: koçluk derlemelerinden gelen AYT ağırlıklı konular. */
export const GARANTI_AYT_TOPICS: { exam: "AYT"; subject: string; topic: string }[] = [
  { exam: "AYT", subject: "Matematik", topic: "Fonksiyonlar" },
  { exam: "AYT", subject: "Matematik", topic: "Trigonometri" },
  { exam: "AYT", subject: "Matematik", topic: "Logaritma" },
  { exam: "AYT", subject: "Matematik", topic: "Türev" },
  { exam: "AYT", subject: "Matematik", topic: "İntegral" },
  { exam: "AYT", subject: "Fizik", topic: "Modern Fizik" },
  { exam: "AYT", subject: "Fizik", topic: "Elektrik Alan" },
  { exam: "AYT", subject: "Fizik", topic: "Manyetik Alan" },
  { exam: "AYT", subject: "Kimya", topic: "Gazlar" },
  { exam: "AYT", subject: "Kimya", topic: "Sıvı Çözeltiler" },
  { exam: "AYT", subject: "Kimya", topic: "Kimya ve Elektrik" },
  { exam: "AYT", subject: "Kimya", topic: "Organik Bileşikler" },
  { exam: "AYT", subject: "Biyoloji", topic: "Endokrin Sistem" },
  { exam: "AYT", subject: "Biyoloji", topic: "Dolaşım ve Bağışıklık" },
  { exam: "AYT", subject: "Biyoloji", topic: "Bitki Biyolojisi" },
  { exam: "AYT", subject: "Biyoloji", topic: "Komünite Ekolojisi" },
];

export const AYT_KIMYA_BIO_NOTE = {
  title: "AYT Kimya / Biyoloji önceliği",
  body: "Kimya ve Biyoloji için konu-yıl dağılımı artık dağılım tablosuna eklendi (2019–2025). Öncelik yine koçluk derlemelerinden (garanti net listeleri) gelir.",
};

export const SUBJECT_ORDER: { exam: "TYT" | "AYT"; subject: string }[] = [
  { exam: "TYT", subject: "Türkçe" },
  { exam: "TYT", subject: "Matematik" },
  { exam: "TYT", subject: "Geometri" },
  { exam: "TYT", subject: "Fizik" },
  { exam: "TYT", subject: "Kimya" },
  { exam: "TYT", subject: "Biyoloji" },
  { exam: "TYT", subject: "Tarih" },
  { exam: "TYT", subject: "Coğrafya" },
  { exam: "TYT", subject: "Felsefe" },
  { exam: "TYT", subject: "Din Kültürü" },
  { exam: "AYT", subject: "Matematik" },
  { exam: "AYT", subject: "Geometri" },
  { exam: "AYT", subject: "Fizik" },
  { exam: "AYT", subject: "Kimya" },
  { exam: "AYT", subject: "Biyoloji" },
];

/**
 * Bir konu "tamamlandı" sayılır mı?
 *
 * Kullanıcı şartı: yalnızca konu anlatımının izlenmiş olması yeterli değil;
 * temel soru çözümü de gerekir. `learningStage` bunu zaten uygular — "Bitti"
 * ama soru verisi yoksa aşama "anlatim" kalır ve kapı açılmaz.
 */
function topicDone(topics: TopicRow[], exam: "TYT" | "AYT", subject: string, name: string) {
  const rows = topics.filter((t) => t.exam === exam && t.subject === subject && t.topic === name);
  if (!rows.length) return false;
  return rows.every((t) => {
    const stage = learningStage(t);
    return stage === "ogrenildi";
  });
}

function gateReady(topics: TopicRow[], subject: string, names: string[]) {
  const done = names.filter((name) => topicDone(topics, "TYT", subject, name)).length;
  return { done, total: names.length, ready: done >= names.length };
}

export interface GateBlockerSubtopic {
  /** Alt konunun adı. */
  name: string;
  /** Bu alt konunun öğrenme aşaması. */
  stage: LearningStage;
  /** Aşamanın okunabilir etiketi. */
  stageLabel: string;
  /** Bu alt konunun neden öğrenildi sayılmadığı. */
  reason: string;
  /** Soru verisi: doğru / toplam. */
  correct: number;
  total: number;
}

export interface GateBlocker {
  /** Kapıyı kapatan konunun adı. */
  topic: string;
  /** Konunun temsili öğrenme aşaması (ilk eksik alt konu). */
  stage: LearningStage;
  /** Aşamanın okunabilir etiketi. */
  stageLabel: string;
  /** Neden öğrenildi sayılmadığının kısa açıklaması. */
  reason: string;
  /** Soru verisi: doğru / toplam. */
  correct: number;
  total: number;
  /** Konuyu kapatan TÜM eksik alt konular, her biri kendi durumuyla. */
  subtopics: GateBlockerSubtopic[];
}

/**
 * Bir kapıyı kapatan konuları ve nedenlerini döndürür.
 *
 * `aytUnlocks` yalnızca `5/12` gibi bir sayı verir; kullanıcı hangi konunun
 * kapıyı kapattığını göremez. Bu fonksiyon mevcut hesaplamayı DEĞİŞTİRMEZ,
 * yalnızca aynı `topicDone` koşulunu kullanarak eksikleri listeler.
 *
 * Konu başına tek kayıt döner (`blockers.length` = eksik konu sayısı), ancak
 * bir konunun birden fazla alt konusu eksikse `subtopics` içinde HEPSİ
 * listelenir; yalnızca ilkiyle sınırlanmaz.
 */
export function gateBlockers(
  topics: TopicRow[],
  subject: string,
  names: string[],
): GateBlocker[] {
  const blockers: GateBlocker[] = [];
  for (const name of names) {
    const rows = topics.filter((t) => t.exam === "TYT" && t.subject === subject && t.topic === name);
    if (!rows.length) {
      blockers.push({
        topic: name,
        stage: "gorulmedi",
        stageLabel: "Müfredatta yok",
        reason: "Bu konu müfredat listesinde bulunamadı.",
        correct: 0,
        total: 0,
        subtopics: [],
      });
      continue;
    }
    // Konunun alt konuları varsa hepsi öğrenilmiş olmalı (topicDone ile aynı kural).
    // Eksik olanların TAMAMI raporlanır; yalnızca ilki değil.
    const notDone = rows.filter((t) => learningStage(t) !== "ogrenildi");
    if (!notDone.length) continue;
    const subtopics: GateBlockerSubtopic[] = notDone.map((t) => {
      const stage = learningStage(t);
      const ex = explainStage(t);
      return {
        name: t.subtopic,
        stage,
        stageLabel: STAGE_LABEL[stage],
        reason: ex.summary,
        correct: ex.correct,
        total: ex.total,
      };
    });
    const first = subtopics[0];
    blockers.push({
      topic: name,
      stage: first.stage,
      stageLabel: first.stageLabel,
      reason: first.reason,
      correct: first.correct,
      total: first.total,
      subtopics,
    });
  }
  return blockers;
}

/** Kapı tanımları: arayüzde kapatan konuları listelemek için tek kaynak. */
export const GATE_DEFS: { key: "mat" | "fiz" | "kim"; subject: string; names: string[]; label: string }[] = [
  { key: "mat", subject: "Matematik", names: MAT_AYT_GATE, label: "AYT Mat / Geo" },
  { key: "fiz", subject: "Fizik", names: FIZ_AYT_GATE, label: "AYT Fizik" },
  { key: "kim", subject: "Kimya", names: KIM_AYT_GATE, label: "AYT Kimya" },
];

export function aytUnlocks(topics: TopicRow[]) {
  const mat = gateReady(topics, "Matematik", MAT_AYT_GATE);
  const fiz = gateReady(topics, "Fizik", FIZ_AYT_GATE);
  const kim = gateReady(topics, "Kimya", KIM_AYT_GATE);
  const bioRows = topics.filter((t) => t.exam === "TYT" && t.subject === "Biyoloji");
  const bioCore = bioRows.filter((t) => !BIO_SKIP_FOR_FAST.includes(t.topic));
  // Biyolojide "bitti" demek için de öğrenme aşaması şart (soru çözümü olmadan olmaz).
  const mastered = (t: TopicRow) => learningStage(t) === "ogrenildi";
  const bioAllDone = bioRows.length > 0 && bioRows.every(mastered);
  const bioFast =
    bioCore.length > 0 &&
    [...new Set(bioCore.map((t) => t.topic))].every((name) => topicDone(topics, "TYT", "Biyoloji", name));
  return {
    mat,
    fiz,
    kim,
    bio: { ready: bioAllDone || bioFast, allDone: bioAllDone, fast: bioFast && !bioAllDone },
  };
}

export function lastExamNet(tytExams: TytExam[], aytExams: AytExam[]) {
  const tyt = [...tytExams].filter((e) => e.date).sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  const ayt = [...aytExams].filter((e) => e.date).sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  return {
    tyt: tyt ? tytNets(tyt).total : null,
    ayt: ayt ? aytNets(ayt).total : null,
    tytDate: tyt?.date ?? "",
    aytDate: ayt?.date ?? "",
  };
}

/** TYT deneme: çekirdek matematiğin ~%40’ı bitince veya ilk deneme girilmişse. */
export function tytMockReady(topics: TopicRow[], tytExams: TytExam[]) {
  const mat = gateReady(topics, "Matematik", MAT_AYT_GATE);
  if (tytExams.some((e) => e.date && (e.turD != null || e.matD != null))) return true;
  return mat.done / mat.total >= 0.4;
}

/** AYT deneme: son TYT net ≥ 70 ve ilgili AYT kapısı açık. 70 altı AYT denemeyi şişirmez. */
export function aytMockReady(topics: TopicRow[], tytExams: TytExam[], aytExams: AytExam[]) {
  const nets = lastExamNet(tytExams, aytExams);
  if (nets.tyt == null || nets.tyt < 70) return false;
  const u = aytUnlocks(topics);
  return u.mat.ready || u.fiz.ready || u.kim.ready || u.bio.ready;
}

export function isGaranti(exam: string, subject: string, topic: string) {
  return (
    GARANTI_TOPICS.some((g) => g.exam === exam && g.subject === subject && g.topic === topic) ||
    GARANTI_AYT_TOPICS.some((g) => g.subject === subject && g.topic === topic)
  );
}

export const ROADMAP_PHASES = [
  {
    id: "tyt-core",
    title: "TYT çekirdek (4–8 hafta)",
    body: "Türkçe paragraf her gün. Matematikte 12 temel konu + problem. Fen kapı konularını paralel bitir. Sosyal’i ince dilimler halinde.",
  },
  {
    id: "ayt-open",
    title: "AYT erken açılış",
    body: "Mat kapısı bitince küme–fonksiyon. Fizik 4 konu, kimya 5 konu bitince AYT’ye geç. Biyoloji TYT’yi bitirmek daha sağlıklı; acelede kalıtım/sınıflandırma bekleyebilir.",
  },
  {
    id: "mocks",
    title: "Denemeler",
    body: "TYT deneme: çekirdek matematiğin ~%40’ı veya ilk deneme kaydı. AYT deneme: son TYT net 70+. Cumartesi deneme; pazar hafif (tekrar + paragraf, yeni konu yok).",
  },
  {
    id: "sustain",
    title: "Sürdürülebilir tempo",
    body: "Bitmiş konu silinmez. Paragraf ve problem hiç durmaz. Pazar diğer günlerden kısa tutulur.",
  },
];
