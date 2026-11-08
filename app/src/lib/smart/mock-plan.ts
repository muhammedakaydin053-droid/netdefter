/**
 * Deneme planlama — konu kapsamı + öğrenme düzeyi + net ortalaması birlikte.
 *
 * Tasarım kararları ve dayanakları:
 *
 * 1) Branş denemesi konu ilerlemesine bağlı, takvime değil. Saruhan Kurs:
 *    "Başlangıç zamanını takvim belirleyemez... Bütün konular bitmeden branş
 *    denemesine dokunma yanlıştır." Aile ve Eğitim: kapsamdaki konular
 *    çalışılmadıysa sonuç konu eksikliğini değil işlenmemiş konuyu gösterir.
 *
 * 2) Genel deneme ilk turun bitmesini beklemez. Nettik: "İlk genel denemeyi
 *    çalışma döneminin ilk iki-üç haftasında çöz." MEB resmî MEBİ takvimi de
 *    ilk Türkiye geneli denemeyi 21-27 Eylül'de yapıyor.
 *
 * 3) Sıklık kararı tek denemeye değil, benzer koşullardaki son üç denemenin
 *    ortalamasına bakmalı. YKSMax: "Tek denemedeki yükseliş veya düşüş büyük
 *    kararlar için yeterli değildir."
 *
 * 4) Net eşikleri ve konu yüzdeleri KAYNAKLARDA KESİN BARAJ OLARAK YOK.
 *    Saruhan: "tek bir yüzdesi veya kesin kuralı yoktur." Aile ve Eğitim kendi
 *    tablosunu "editoryal öneri" sayıyor. Bu yüzden buradaki bantlar
 *    `PLANNING_BANDS_NOTE` ile işaretli yaklaşık önerilerdir ve net eşiği
 *    ALTINDA kalan öğrenci denemeden mahrum bırakılmaz.
 */

import type { AytExam, TopicRow, TytExam, WrongRow } from "@/lib/types";
import { aytNets, tytNets } from "@/lib/stats";
import { aytUnlocks } from "@/data/roadmap";
import { learningStage } from "@/lib/smart/progress";
import {
  AYT_MOCK_STAGES,
  TYT_MOCK_STAGES,
  rollingAverage,
  stageFor,
  type MockStage,
} from "@/lib/smart/mock-bands";

export { AYT_MOCK_STAGES, TYT_MOCK_STAGES, rollingAverage, stageFor };
export type { MockStage };

export type MockKind = "brans" | "genel";

export interface MockDecision {
  exam: "TYT" | "AYT";
  subject: string;
  kind: MockKind;
  /** Ölçülen konu kapsamı (0–1). */
  coverage: number;
  /** Kapsam ağırlıklı hesaplandı mı? */
  weighted: boolean;
  /** Karar gerekçesi. */
  reason: string;
  /** Net eşiği altında kaldığı için sıklık düşürüldü mü? */
  reduced: boolean;
}

/**
 * Deneme sıklık aşamaları `mock-bands.ts` içinde (saf, test edilebilir).
 * Bantlar kaynaklarda kesin baraj değildir; yaklaşık planlama önerisidir.
 */

/** Denemenin kapsadığı derslerdeki konu kapsamı (0–1). */
export function subjectCoverage(topics: TopicRow[], exam: "TYT" | "AYT", subject: string): number {
  const rows = topics.filter((t) => t.exam === exam && t.subject === subject);
  if (!rows.length) return 0;
  // Ders bazında eşit konu ağırlığı: alt konu satırları aynı konuya aitse tek say.
  const byTopic = new Map<string, TopicRow[]>();
  for (const r of rows) {
    const list = byTopic.get(r.topic) ?? [];
    list.push(r);
    byTopic.set(r.topic, list);
  }
  let mastered = 0;
  for (const list of byTopic.values()) {
    if (list.every((r) => learningStage(r) === "ogrenildi")) mastered += 1;
  }
  return mastered / byTopic.size;
}

/** Genel denemede ölçülen toplam kapsam (ders kapsamlarının ortalaması). */
export function overallCoverage(topics: TopicRow[], exam: "TYT" | "AYT"): number {
  const subjects = [...new Set(topics.filter((t) => t.exam === exam).map((t) => t.subject))];
  if (!subjects.length) return 0;
  return subjects.reduce((a, s) => a + subjectCoverage(topics, exam, s), 0) / subjects.length;
}

/**
 * Bir ders için branş denemesi kararı.
 *
 * Kapsam %50'yi geçince branş denemesi anlamlı (Saruhan: konuların anlamlı bir
 * bölümü öğrenilmişse yeterli). Kapı kapalıysa (ör. AYT Fizik) hiç başlamaz.
 */
export function branchMockDecision(topics: TopicRow[], exam: "TYT" | "AYT", subject: string): MockDecision | null {
  const coverage = subjectCoverage(topics, exam, subject);
  const stages = exam === "TYT" ? TYT_MOCK_STAGES : AYT_MOCK_STAGES;
  const stage = stageFor(stages, coverage);
  if (coverage < 0.5) {
    return {
      exam,
      subject,
      kind: "brans",
      coverage,
      weighted: false,
      reduced: false,
      reason:
        coverage < 0.3
          ? "Kapsam %30'un altında — konu anlatımı ve konu testleri daha doğru araç."
          : "Kapsam %30–50 — tamamlanan konulardan karma test uygun, branş denemesi için erken.",
    };
  }
  // Kapı kontrolü: AYT dersi açık mı?
  if (exam === "AYT") {
    const u = aytUnlocks(topics);
    const open =
      subject === "Matematik" || subject === "Geometri"
        ? u.mat.ready
        : subject === "Fizik"
          ? u.fiz.ready
          : subject === "Kimya"
            ? u.kim.ready
            : subject === "Biyoloji"
              ? u.bio.ready
              : true;
    if (!open) {
      return {
        exam,
        subject,
        kind: "brans",
        coverage,
        weighted: false,
        reduced: true,
        reason: "AYT ön koşul kapısı henüz kapalı — önce TYT çekirdeği.",
      };
    }
  }
  return {
    exam,
    subject,
    kind: "brans",
    coverage,
    weighted: false,
    reduced: false,
    reason: `${stage.label} — kapsam %${Math.round(coverage * 100)}, haftada ~${stage.perWeek}.`,
  };
}

/**
 * Genel deneme kararı.
 *
 * İlk seviye belirleme denemesi ilk 2–3 hafta içinde bir kez yapılır (Nettik).
 * Sonrasında kapsam bandı sıklığı belirler. Net, bandın altında kalırsa
 * öğrenci denemeden mahrum bırakılmaz; sıklık düşürülür (kullanıcı şartı).
 */
export function generalMockDecision(
  topics: TopicRow[],
  tytExams: TytExam[],
  aytExams: AytExam[],
  exam: "TYT" | "AYT",
): MockDecision {
  const coverage = overallCoverage(topics, exam);
  const stages = exam === "TYT" ? TYT_MOCK_STAGES : AYT_MOCK_STAGES;
  const stage = stageFor(stages, coverage);
  const exams = exam === "TYT" ? tytExams : aytExams;
  const netOf = exam === "TYT" ? (e: TytExam) => tytNets(e).total : (e: AytExam) => aytNets(e).total;
  const roll = rollingAverage(exams as never[], netOf as never);

  // İlk seviye belirleme: hiç deneme yoksa ve kapsam düşükse.
  if (roll.count === 0) {
    return {
      exam,
      subject: "Genel",
      kind: "genel",
      coverage,
      weighted: false,
      reduced: false,
      reason:
        exam === "TYT"
          ? "İlk seviye belirleme: net şartı yok. İlk 2–3 hafta içinde bir kez çöz, eksikleri haritala."
          : "İlk seviye belirleme: yeterli konu birikimi oluşunca seyrek. Net şartı yok.",
    };
  }

  let reduced = false;
  let reason = `${stage.label} — kapsam %${Math.round(coverage * 100)}`;
  if (stage.nets && roll.avg != null && roll.avg < stage.nets[0]) {
    reduced = true;
    reason += `. Ortalama net ${roll.avg.toFixed(1)}, bandın altında (${stage.nets[0]}–${stage.nets[1]}). Sıklık düşük tutulur, eksiklere daha çok süre ayrılır.`;
  } else if (roll.avg != null) {
    reason += `. Son ${roll.count} deneme ortalaması ${roll.avg.toFixed(1)} (${roll.trend >= 0 ? "↑" : "↓"} ${Math.abs(roll.trend).toFixed(1)}).`;
  }
  return { exam, subject: "Genel", kind: "genel", coverage, weighted: false, reduced, reason };
}

/** İki ISO tarih arasındaki gün farkı (b − a). */
function dayDiff(a: string, b: string): number {
  return Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 86400000);
}

/** Dersin son denemedeki net oranı (0–1) veya veri yoksa null. */
function subjectNetRatio(tytExams: TytExam[], subject: string): number | null {
  const last = [...tytExams].filter((e) => e.date).sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  if (!last) return null;
  const n = tytNets(last);
  const bucket = subject === "Türkçe" ? n.tur : subject === "Matematik" || subject === "Geometri" ? n.mat : ["Fizik", "Kimya", "Biyoloji"].includes(subject) ? n.fen : n.sos;
  if (bucket == null) return null;
  const max = subject === "Türkçe" || subject === "Matematik" || subject === "Geometri" ? 40 : 20;
  return Math.max(0, Math.min(1, bucket / max));
}

/**
 * Branş denemesi için ders seçimi.
 *
 * Eski motor yalnızca "kapsamı yeterli derslerin EN DÜŞÜK kapsamlısı"nı seçiyordu;
 * bu yüzden dört branş denemesinin tamamı Türkçe'ye gidiyordu. Burada karar
 * birlikte verilir:
 *
 *  - Yalnızca konu kapsamı yeterli (%50+) dersler adaydır.
 *  - Zayıflık: son 14 gündeki yanlış yoğunluğu ve düşük net puanı yükseltir.
 *  - Rotasyon: hiç denenmemiş / uzun süredir denenmemiş ders yükseltilir.
 *    Deneme kayıtları ders türünü (branş/tam) ayırmadığı için geçmiş her zaman
 *    dolu olmayabilir; bu yüzden rotasyon ayrıca GÜNE BAĞLI deterministiktir:
 *    adaylar arasında `gün indeksi mod aday sayısı` sıradaki dersi işaret eder.
 *    Böylece art arda deneme günlerinde (3–7 gün arayla) farklı ders seçilir ve
 *    tek bir ders yığılmaz. Geçmiş (`subjectLastMock`) verilirse yakın tarihli
 *    ders soğuma süresince elenir.
 *
 * Skor = 2.0·(sıradaki ders) + 1.5·yanlışYoğunluğu + 1.0·(1−net) +
 *        0.8·(1−kapsam) + 0.5·bayatlık. En yüksek skorlu ders seçilir.
 */
export function pickBranchSubject(opts: {
  topics: TopicRow[];
  tytExams: TytExam[];
  wrongs: WrongRow[];
  /** `exam|subject` → son branş denemesi tarihi (varsa). */
  subjectLastMock?: Record<string, string>;
  today: string;
  /** Aday dersler. */
  candidates: string[];
  cooldownDays?: number;
}): { subject: string; coverage: number; reason: string } | null {
  const cooldown = opts.cooldownDays ?? 10;
  const history = opts.subjectLastMock ?? {};
  const all = [...opts.candidates].sort((a, b) => a.localeCompare(b, "tr"));
  const eligible = all.filter((s) => subjectCoverage(opts.topics, "TYT", s) >= 0.5);
  if (!eligible.length) return null;
  const recent = eligible.filter((s) => {
    const last = history[`TYT|${s}`];
    return last ? dayDiff(last, opts.today) < cooldown : false;
  });
  const pool = eligible.filter((s) => !recent.includes(s));
  const finalPool = pool.length ? pool : eligible;
  // Rotasyon: sıra SABİT aday listesi (`all`) üzerinden ve ŞİMDİYE KADAR DENENMİŞ
  // DERS SAYISINA göre hesaplanır. Deneme günleri 14 gün arayla geldiği için
  // güne bağlı (`dayIndex % 6`) rotasyon yalnızca çift sıraları görüyor ve tek
  // derse yığılıyordu; geçmiş sayacı her branş denemesinde bir artarak altı
  // dersi de sırayla dolaşır. Geçmişte denenmiş ders soğuma süresince elenir.
  const mockedCount = Object.keys(history).length;
  const turn = ((mockedCount % all.length) + all.length) % all.length;
  const ordered = [...all.slice(turn), ...all.slice(0, turn)];
  const dueSubject = ordered.find((s) => finalPool.includes(s)) ?? finalPool[0];
  const wrong14 = (subject: string) =>
    opts.wrongs.filter((w) => w.subject === subject && w.date && dayDiff(w.date, opts.today) <= 14).length;
  const scored = finalPool.map((subject) => {
    const coverage = subjectCoverage(opts.topics, "TYT", subject);
    const last = history[`TYT|${subject}`];
    const daysSince = last ? dayDiff(last, opts.today) : 999;
    const wrongs = wrong14(subject);
    const net = subjectNetRatio(opts.tytExams, subject);
    const wrongScore = Math.min(1, wrongs / 4);
    const netScore = net == null ? 0 : 1 - net;
    const stale = Math.min(1, daysSince / 30);
    const rotation = subject === dueSubject ? 1 : 0;
    const score = 2.0 * rotation + 1.5 * wrongScore + 1.0 * netScore + 0.8 * (1 - coverage) + 0.5 * stale;
    return { subject, coverage, score, wrongs, net, rotation };
  });
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  const parts = [
    `kapsam %${Math.round(best.coverage * 100)}`,
    best.wrongs ? `${best.wrongs} yanlış` : null,
    best.net != null ? `net %${Math.round(best.net * 100)}` : "net verisi yok",
    best.rotation ? "rotasyon sırası" : history[`TYT|${best.subject}`] ? `son deneme ${history[`TYT|${best.subject}`]}` : "hiç denenmedi",
  ].filter(Boolean);
  return { subject: best.subject, coverage: best.coverage, reason: parts.join(", ") };
}

/** Öğrenciye gösterilecek deneme takvimi özeti. */
export function mockPlanSummary(topics: TopicRow[], tytExams: TytExam[], aytExams: AytExam[]) {
  const tyt = generalMockDecision(topics, tytExams, aytExams, "TYT");
  const ayt = generalMockDecision(topics, tytExams, aytExams, "AYT");
  const branches: MockDecision[] = [];
  for (const subject of ["Türkçe", "Matematik", "Fizik", "Kimya", "Biyoloji"]) {
    const d = branchMockDecision(topics, "TYT", subject);
    if (d) branches.push(d);
  }
  for (const subject of ["Matematik", "Fizik", "Kimya", "Biyoloji"]) {
    const d = branchMockDecision(topics, "AYT", subject);
    if (d) branches.push(d);
  }
  return { tyt, ayt, branches };
}
