import { frequencyScore, frequencyTier, DISTRIBUTION } from "@/data/distribution";
import { aytMockReady, aytUnlocks, isGaranti, tytMockReady } from "@/data/roadmap";
import { buildTimeline, isCoreTopic, isOngoingTopic, orderAllowed, orderBoost, phaseFor } from "@/data/sequence";
import { countsIssue, n, pctOf, sanitizeCounts } from "@/lib/calc";
import { MIN_QUESTIONS_FOR_MASTERED, MASTERY_RATIO, learningStage } from "@/lib/smart/progress";
import { splitBudget, capacity, dailyCapacity, type DayLoad } from "@/lib/smart/budget";
import { topicAggregates, aytNets, tytNets, dailyTotals } from "@/lib/stats";
import { overallCoverage, pickBranchSubject } from "@/lib/smart/mock-plan";
import { chooseMock } from "@/lib/smart/mock-model";
import type { AytExam, DailyRow, TopicRow, TytExam, WrongRow } from "@/lib/types";
import { addDaysISO, todayISO, uid } from "@/lib/utils";
import type {
  CarryItem,
  Health,
  Insight,
  PlanSlot,
  ReviewRec,
  ScheduleSettings,
} from "@/lib/smart/types";

const PREREQ: Record<string, string[]> = {
  "AYT|Matematik|Türev": ["AYT|Matematik|Limit ve Süreklilik", "AYT|Matematik|Fonksiyonlar"],
  "AYT|Matematik|İntegral": ["AYT|Matematik|Türev"],
  "AYT|Matematik|Logaritma": ["AYT|Matematik|Üstel Fonksiyonlar"],
  "AYT|Matematik|Limit ve Süreklilik": ["AYT|Matematik|Fonksiyonlar"],
  "AYT|Fizik|İtme ve Momentum": ["AYT|Fizik|Newton Yasaları"],
  "AYT|Fizik|İndüksiyon ve Alternatif Akım": ["AYT|Fizik|Manyetik Alan"],
};

const ONGOING = [
  { exam: "TYT" as const, subject: "Türkçe", topic: "Paragraf", label: "paragraf pratiği" },
  { exam: "TYT" as const, subject: "Matematik", topic: "Problemler", label: "problem pratiği" },
];

function daysBetween(a: string, b: string) {
  if (!a || !b) return 999;
  return Math.round((new Date(b + "T12:00:00").getTime() - new Date(a + "T12:00:00").getTime()) / 86400000);
}

/**
 * `from` ile `to` arasındaki deneme günü sayaçları (program başından bugüne,
 * bugün dahil). İki AYRI değer döner:
 *   - `mockDays`: deneme günü sayısı — tam deneme KADANSININ tabanı.
 *   - `fullMockDays`: TAM deneme günü sayısı — sınav (TYT/AYT) DÖNÜŞÜMÜNÜN tabanı.
 *
 * Neden ayrı: kadans ile dönüşüm aynı sayacı kullanırsa ikisi de aynı pariteye
 * bağlanır. Düşük yoğunluklu fazda (mockIntensity < 2) tam denemeler yalnızca
 * çift `mockDays`'te olur; 2'li dönüşümde çift indeks daima TYT'ye denk gelir ve
 * 1:1 dönemi pratikte hiç AYT üretmez (gözlenen: 5 TYT / 0 AYT). Dönüşüm bu
 * yüzden `fullMockDays`'e bağlanır; art arda gelen TAM denemeler sırayla
 * TYT/AYT alır. Sayaç yine TAKVİME bağlıdır, kullanıcı kaydına bakmaz.
 *
 * Deneme günü kuralı `buildDailyPlan` ile aynıdır: hafta sonu hariç,
 * `mockWeekdays` veya yoğun fazda hafta ortası (Çrş).
 */
function mockDayCounters(
  settings: ScheduleSettings,
  from: string,
  to: string,
): { mockDays: number; fullMockDays: number } {
  if (!from || !to || to < from) return { mockDays: 0, fullMockDays: 0 };
  const timeline = buildTimeline(settings.programStart || from, settings.examDate || to);
  let mockDays = 0;
  let fullMockDays = 0;
  for (let d = from; d <= to; d = addDaysISO(d, 1)) {
    const wd = new Date(d + "T12:00:00").getDay();
    if (wd === 0) continue;
    const ph = phaseFor(timeline, d);
    const extra = ph.mockIntensity >= 2 && wd === 3;
    if (!(settings.mockWeekdays.includes(wd) || extra)) continue;
    mockDays += 1;
    const due = mockDays === 1 || (ph.mockIntensity >= 2 ? true : mockDays % 2 === 0);
    if (due) fullMockDays += 1;
  }
  return { mockDays, fullMockDays };
}

function toMin(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
function fromMin(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function srsIntervalDays(success: number | null, reviewCount: number) {
  const base = [1, 3, 7, 14, 30, 45];
  const idx = Math.min(reviewCount, base.length - 1);
  let days = base[idx];
  if (success == null) return days;
  if (success >= 0.9) days = Math.round(days * 1.6);
  else if (success < 0.5) days = 1;
  else if (success < 0.7) days = Math.max(1, Math.round(days * 0.55));
  return days;
}

export function suggestedReviewDate(t: TopicRow, today = todayISO()) {
  if (!t.lastStudy && t.status === "Başlamadım") return "";
  const success = pctOf(t.correct, t.total);
  const count = t.status === "Bitti" || t.status === "Tekrar Gerekli" ? Math.max(1, success != null && success < 0.5 ? 0 : 1) : 1;
  const anchor = t.lastStudy || today;
  if (t.status === "Tekrar Gerekli" || (success != null && success < 0.5 && n(t.total) >= 8)) {
    return addDaysISO(anchor, 1);
  }
  return addDaysISO(anchor, srsIntervalDays(success, count));
}

export function topicHealth(
  t: { total: number; correct: number; wrong: number; lastStudy?: string; status?: string; topic?: string },
  daily: DailyRow[],
  today = todayISO(),
): Health {
  const { total, correct } = sanitizeCounts(t.total, t.correct, t.wrong);
  const tt = total ?? 0;
  if (!tt) {
    if (t.status === "Çalışıyorum" || t.status === "Tekrar Gerekli") return "orta";
    return "bos";
  }
  // Geçersiz kayıt (negatif, toplamdan fazla doğru) sağlığı yanıltmasın:
  // kırpılmış değer kullanılır ve başarı %100'e sabitlenmez.
  const invalid = countsIssue(t.total, t.correct, t.wrong) != null;
  const success = invalid ? Math.min(1, (correct ?? 0) / tt) : (correct ?? 0) / tt;
  // Son çalışma tarihi bilinmiyorsa tazelik cezası/ödülü UYGULANMAZ.
  // "Tarih girilmedi" ile "2 ay önce çalışıldı" aynı şey değildir.
  const recency = t.lastStudy ? daysBetween(t.lastStudy, today) : null;
  // Trend yalnızca AYNI konunun günlük kayıtlarından hesaplanır; ders/konu
  // eşleşmesi olmadan tüm günlük kayıtları karıştırmak yanıltıcıydı.
  const related = t.topic ? daily.filter((d) => d.topic === t.topic) : [];
  let trend = 0;
  if (related.length >= 2) {
    const last = [...related].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);
    const rates = last.map((d) => (n(d.questions) ? n(d.correct) / n(d.questions) : 0));
    if (rates.length >= 2) trend = rates[0] - rates[rates.length - 1];
  }
  let score = success * 55;
  if (tt >= 25) score += 10;
  else if (tt >= 10) score += 6;
  else score -= 8;
  if (recency != null) {
    if (recency <= 7) score += 8;
    else if (recency > 21) score -= 12;
  }
  score += trend * -20;
  if (t.status === "Tekrar Gerekli") score -= 15;
  if (invalid) {
    // Geçersiz veri "iyi" damgası almaz; en fazla "orta" olabilir.
    if (score < 40) return "kritik";
    if (score < 58 || success < 0.65) return "zayif";
    return "orta";
  }
  if (success >= 0.8 && (recency == null || recency <= 14) && trend >= 0) return "iyi";
  if (score >= 70 && success >= 0.7) return "iyi";
  if (success < 0.5 && tt >= 8) return "kritik";
  if (score < 40) return "kritik";
  if (score < 58 || success < 0.65) return "zayif";
  return "orta";
}

export function aggregateHealth(topics: TopicRow[], daily: DailyRow[], exam: string, subject: string, topic: string) {
  const rows = topics.filter((t) => t.exam === exam && t.subject === subject && t.topic === topic);
  const total = rows.reduce((a, t) => a + n(t.total), 0);
  const correct = rows.reduce((a, t) => a + n(t.correct), 0);
  const wrong = rows.reduce((a, t) => a + n(t.wrong), 0);
  const lastStudy = rows.map((t) => t.lastStudy).filter(Boolean).sort().at(-1) ?? "";
  const status = rows.some((t) => t.status === "Tekrar Gerekli")
    ? "Tekrar Gerekli"
    : rows.some((t) => t.status === "Çalışıyorum")
      ? "Çalışıyorum"
      : rows.every((t) => t.status === "Bitti")
        ? "Bitti"
        : rows.every((t) => t.status === "Başlamadım")
          ? "Başlamadım"
          : "Çalışıyorum";
  return topicHealth({ total, correct, wrong, lastStudy, status, topic }, daily);
}

type Ranked = {
  exam: "TYT" | "AYT";
  subject: string;
  topic: string;
  health: Health;
  priority: number;
  success: number | null;
  total: number;
  wrong: number;
  lastStudy: string;
  status: string;
  freq: number;
  reasons: string[];
  /** AYT dersi için ön koşul kapısı açık mı? TYT konuları için her zaman true. */
  aytOpen: boolean;
};

export function rankTopics(topics: TopicRow[], daily: DailyRow[], wrongs: WrongRow[], today = todayISO()): Ranked[] {
  const aggs = topicAggregates(topics);
  const finished = new Set(
    topics.filter((t) => t.status === "Bitti").map((t) => `${t.exam}|${t.subject}|${t.topic}`),
  );
  return aggs.map((a) => {
    const health = aggregateHealth(topics, daily, a.exam, a.subject, a.topic);
    const freq = frequencyScore(a.exam, a.subject, a.topic);
    const recency = a.total ? daysBetween(topics.filter((t) => t.exam === a.exam && t.topic === a.topic).map((t) => t.lastStudy).filter(Boolean).sort().at(-1) ?? "", today) : 40;
    const lastStudy = topics.filter((t) => t.exam === a.exam && t.subject === a.subject && t.topic === a.topic).map((t) => t.lastStudy).filter(Boolean).sort().at(-1) ?? "";
    const status = topics.find((t) => t.exam === a.exam && t.subject === a.subject && t.topic === a.topic)?.status ?? "Başlamadım";
    const started = status !== "Başlamadım" || a.total > 0;
    const weakness = health === "kritik" ? 1 : health === "zayif" ? 0.75 : health === "orta" ? 0.45 : health === "bos" ? 0.55 : 0.15;
    const wrongBoost = Math.min(1, a.wrong / 20);
    const prereqKey = `${a.exam}|${a.subject}|${a.topic}`;
    const needs = PREREQ[prereqKey] ?? [];
    const prereqBoost = needs.some((k) => {
      const [e, s, top] = k.split("|");
      const h = aggregateHealth(topics, daily, e, s, top);
      return h === "kritik" || h === "zayif" || h === "bos";
    })
      ? 0.2
      : 0;
    const notStarted = !started ? 0.35 * freq : 0;
    const stale = started && recency > 14 ? Math.min(0.3, recency / 60) : 0;
    const ongoingBoost = ONGOING.some((o) => o.exam === a.exam && o.topic === a.topic) ? 0.22 : 0;
    const garantiBoost = isGaranti(a.exam, a.subject, a.topic) ? 0.12 : 0;
    const seqBoost = orderBoost(a.exam, a.subject, a.topic, finished);
    const unlock = aytUnlocks(topics);
    let lockPenalty = 0;
    let aytOpen = true;
    if (a.exam === "AYT") {
      aytOpen =
        a.subject === "Matematik" || a.subject === "Geometri"
          ? unlock.mat.ready
          : a.subject === "Fizik"
            ? unlock.fiz.ready
            : a.subject === "Kimya"
              ? unlock.kim.ready
              : a.subject === "Biyoloji"
                ? unlock.bio.ready
                : true;
      if (!aytOpen) lockPenalty = 0.55;
    }
    const coreOpen = !started && isCoreTopic(a.exam, a.subject, a.topic);
    const coreBoost = coreOpen ? 0.18 : 0;
    // Başlanmış ama zayıf/kritik konu için acil düzeltme payı.
    //
    // Neden gerekli: hiç başlanmamış konular `notStarted` payı ve `coreBoost`
    // alırken, zayıf bir konu yalnızca `weakness` farkıyla öne çıkıyordu. Bu
    // fark, 12 yanlış birikmiş bir konuyu "hiç başlanmamış" konuların gerisine
    // düşürüyordu. Ölçüm: Üslü Sayılar (12 yanlış, kritik) sıralamada 25.,
    // başlanmamış konular 0.646 ile üstteydi.
    const criticalFix = started && (health === "kritik" || health === "zayif") ? 0.16 : 0;
    const priority =
      weakness * 0.28 +
      freq * 0.24 +
      wrongBoost * 0.12 +
      prereqBoost +
      notStarted * 0.1 +
      stale * 0.1 +
      ongoingBoost +
      garantiBoost +
      seqBoost +
      coreBoost +
      criticalFix -
      lockPenalty;
    const reasons: string[] = [];
    if (health === "kritik" || health === "zayif") reasons.push(`akıllı durum: ${health}`);
    if (freq >= 0.6) reasons.push("geçmiş YKS sıklığı yüksek");
    if (stale) reasons.push(`${recency} gündür çalışılmamış`);
    if (!started && freq >= 0.4) reasons.push("henüz başlanmadı, sınav ağırlığı var");
    if (coreBoost) reasons.push("AYT kapısını açan TYT çekirdeği");
    if (seqBoost > 0.05) reasons.push("ders sırası geldi");
    if (seqBoost < -0.05) reasons.push("ders sırasında önceki konular duruyor");
    if (lockPenalty) reasons.push("AYT kapısı henüz kapalı — önce TYT çekirdek");
    if (a.wrong >= 8) reasons.push(`${a.wrong} yanlış birikmiş`);
    return {
      exam: a.exam,
      subject: a.subject,
      topic: a.topic,
      health,
      priority,
      success: a.success,
      total: a.total,
      wrong: a.wrong,
      lastStudy,
      status,
      freq,
      reasons,
      aytOpen,
    };
  }).sort((x, y) => y.priority - x.priority);
}

export function dueReviews(topics: TopicRow[], daily: DailyRow[], today = todayISO()): ReviewRec[] {
  const ranked = rankTopics(topics, daily, [], today);
  const out: ReviewRec[] = [];
  for (const r of ranked) {
    const rows = topics.filter((t) => t.exam === r.exam && t.subject === r.subject && t.topic === r.topic);
    const dates = rows.map((t) => t.reviewDate).filter(Boolean);
    const last = r.lastStudy;
    const success = r.success;
    const autoDue = last ? addDaysISO(last, srsIntervalDays(success, r.status === "Bitti" ? 2 : 1)) : "";
    const due = dates.sort()[0] || autoDue;
    if (!due) continue;
    const started = r.status !== "Başlamadım" || r.total > 0;
    if (!started) continue;
    const overdue = due <= today;
    const weak = r.health === "kritik" || r.health === "zayif";
    if (!overdue && !weak) continue;
    if (r.health === "iyi" && daysBetween(last, today) < srsIntervalDays(success, 3)) continue;
    const suggestedQ = r.health === "kritik" ? 30 : r.health === "zayif" ? 25 : 15;
    const reasonBits = [
      overdue ? (due < today ? `tekrar tarihi geçti (${due})` : "bugünün tekrarı") : "zayıf performans",
      r.success != null ? `başarı ${Math.round(r.success * 100)}%` : "soru verisi sınırlı",
      ...r.reasons.slice(0, 2),
    ];
    out.push({
      exam: r.exam,
      subject: r.subject,
      topic: r.topic,
      health: r.health,
      reason: reasonBits.join(" · "),
      suggestedQ,
      due,
    });
  }
  return out.slice(0, 8);
}

export function buildInsights(
  topics: TopicRow[],
  daily: DailyRow[],
  wrongs: WrongRow[],
  tytExams: TytExam[],
  aytExams: AytExam[],
  settings: ScheduleSettings,
  today = todayISO(),
): Insight[] {
  const insights: Insight[] = [];
  const weekFrom = addDaysISO(today, -6);
  const week = dailyTotals(daily, weekFrom, today);
  const targetMin = settings.weeklyHours * 60;
  if (week.minutes > 0 || daily.length > 0) {
    const ratio = targetMin ? week.minutes / targetMin : 0;
    insights.push({
      id: "tempo",
      kind: "tempo",
      title: ratio >= 0.85 ? "Tempo hedefin civarında" : ratio >= 0.5 ? "Tempo biraz düşük" : "Bu hafta tempo zayıf",
      body:
        week.minutes === 0
          ? "Son 7 günde günlük çalışma kaydı yok. Bu bir başarısızlık değil; kaydı açınca tempo hesabı düzgün işler."
          : `Son 7 günde ${week.minutes} dk / ${week.questions} soru. Haftalık hedef ${settings.weeklyHours} saat.`,
      evidence: `günlük kayıt ${week.count} satır, hedef ${targetMin} dk`,
    });
  }

  const tytSorted = [...tytExams].filter((e) => e.date).sort((a, b) => a.date.localeCompare(b.date));
  if (tytSorted.length >= 3) {
    const last3 = tytSorted.slice(-3).map((e) => tytNets(e));
    const mats = last3.map((x) => x.mat ?? 0);
    const drop = mats[0] - mats[2];
    if (drop > 2) {
      insights.push({
        id: "tyt-mat-drop",
        kind: "deneme",
        title: "TYT Matematik netin son 3 denemede düşmüş",
        body: `Mat netleri ${mats.map((m) => m.toFixed(1)).join(" → ")}. Problem pratiğini programa geri almak mantıklı.`,
        evidence: "TYT deneme matematik netleri (son 3)",
      });
    }
    const totals = last3.map((x) => x.total ?? 0);
    if (totals[2] - totals[0] > 4) {
      insights.push({
        id: "tyt-up",
        kind: "deneme",
        title: "TYT toplam net yükseliyor",
        body: `Son 3 deneme: ${totals.map((m) => m.toFixed(1)).join(" → ")}.`,
        evidence: "TYT toplam net (son 3)",
      });
    }
  }
  const aytSorted = [...aytExams].filter((e) => e.date).sort((a, b) => a.date.localeCompare(b.date));
  if (aytSorted.length >= 3) {
    const last = aytSorted.slice(-4).map((e) => aytNets(e));
    const kim = last.map((x) => x.kim ?? 0);
    const rising = kim.length >= 3 && kim.every((v, i) => i === 0 || v >= kim[i - 1] - 0.25);
    if (rising && kim.at(-1)! > kim[0]) {
      insights.push({
        id: "ayt-kim-up",
        kind: "deneme",
        title: "AYT Kimya denemelerde yükseliyor",
        body: `Kimya netleri ${kim.map((m) => m.toFixed(1)).join(" → ")}. Ritmi bozmamak yeterli; yükü şişirmeye gerek yok.`,
        evidence: "AYT deneme kimya netleri",
      });
    }
    const mats = last.slice(-3).map((x) => x.mat ?? 0);
    if (mats.length === 3 && mats[0] - mats[2] > 2) {
      insights.push({
        id: "ayt-mat-drop",
        kind: "deneme",
        title: "AYT Matematik son denemelerde zayıflamış",
        body: `Mat netleri ${mats.map((m) => m.toFixed(1)).join(" → ")}. Türev / trigonometri / problem karışımına bak.`,
        evidence: "AYT matematik net (son 3)",
      });
    }
  }

  const recentWrongs = wrongs.filter((w) => w.reason).slice(0, 30);
  if (recentWrongs.length >= 6) {
    const counts = new Map<string, number>();
    for (const w of recentWrongs) counts.set(w.reason, (counts.get(w.reason) ?? 0) + 1);
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (top && top[1] / recentWrongs.length >= 0.28) {
      const tip =
        top[0] === "İşlem hatası"
          ? "Çözümü kapatmadan 20–30 sn işlem kontrolü bırak."
          : top[0] === "Bilgi eksikliği"
            ? "İlgili konuyu kısa tekrarla, sonra 15–20 soru çöz."
            : top[0] === "Soruyu yanlış okudum"
              ? "Kökü ve birimleri işaretleyerek oku; şıkları görmeden isteneni yaz."
              : top[0] === "Dikkat hatası"
                ? "İlk 5 soruyu yavaş çöz, tempo sonra gelsin."
                : "Yanlış defterindeki notu bir cümleye indirip aynı tipi tekrar çöz.";
      insights.push({
        id: "wrong-pattern",
        kind: "yanlis",
        title: `Son ${recentWrongs.length} yanlışın ${top[1]} tanesi: ${top[0]}`,
        body: tip,
        evidence: `Yanlışlarım neden dağılımı (${recentWrongs.length} kayıt)`,
      });
    }
  }

  const ranked = rankTopics(topics, daily, wrongs, today);
  const top = ranked[0];
  if (top && top.priority > 0.5) {
    insights.push({
      id: "week-focus",
      kind: "oncelik",
      title: `Bu hafta ${top.exam} ${top.subject} ağırlığı`,
      body: `${top.topic} önde. ${top.reasons.slice(0, 2).join(" · ") || "Zayıflık ve sınav sıklığı birlikte yüksek."}`,
      evidence: `öncelik skoru ${top.priority.toFixed(2)}`,
    });
  }

  const overdue = dueReviews(topics, daily, today).filter((r) => r.due < today);
  if (overdue.length) {
    insights.push({
      id: "overdue",
      kind: "tekrar",
      title: `${overdue.length} konunun tekrarı gecikti`,
      body: "Hepsini yarına yığma. Bugün en kritik 1–2 tanesini al, kalanı haftaya yay.",
      evidence: overdue.map((r) => `${r.exam} ${r.topic}`).slice(0, 4).join(", "),
    });
  }

  const para = topicAggregates(topics).find((a) => a.exam === "TYT" && a.topic === "Paragraf");
  if (para && para.success != null && para.success < 0.75 && para.total >= 20) {
    insights.push({
      id: "para",
      kind: "pratik",
      title: "Paragraf pratiği düşmüş",
      body: `TYT Paragraf başarı ${Math.round(para.success * 100)}%. Konu bitmiş olsa da günlük ${settings.paragraphTarget} paragraf hedefi kalsın.`,
      evidence: `${para.total} soru, ${para.correct} doğru`,
    });
  }
  const prob = topicAggregates(topics).find((a) => a.exam === "TYT" && a.topic === "Problemler");
  if (prob && prob.success != null && prob.success < 0.7 && prob.total >= 15) {
    insights.push({
      id: "prob",
      kind: "pratik",
      title: "Problem performansı zayıf",
      body: `TYT Problemler ${Math.round(prob.success * 100)}%. Bitmiş görünse de düzenli problem seti programda kalsın.`,
      evidence: `${prob.total} soru`,
    });
  }

  return insights.slice(0, 8);
}

function busyIntervals(settings: ScheduleSettings, weekday: number) {
  const busy: { start: number; end: number; label: string }[] = [];
  for (const m of settings.meals) busy.push({ start: toMin(m.start), end: toMin(m.end), label: m.name });
  if (settings.sportDays.includes(weekday)) {
    busy.push({ start: toMin(settings.sportStart), end: toMin(settings.sportEnd), label: "Spor" });
  }
  for (const l of settings.leisure) {
    if (l.days.includes(weekday)) busy.push({ start: toMin(l.start), end: toMin(l.end), label: l.name });
  }
  return busy.sort((a, b) => a.start - b.start);
}

function freeWindows(settings: ScheduleSettings, weekday: number) {
  const wake = toMin(settings.wake);
  const sleep = toMin(settings.sleep);
  const busy = busyIntervals(settings, weekday);
  const gaps: { start: number; end: number }[] = [];
  let cursor = wake;
  for (const b of busy) {
    if (b.start > cursor + 25) gaps.push({ start: cursor, end: b.start });
    cursor = Math.max(cursor, b.end);
  }
  if (sleep > cursor + 25) gaps.push({ start: cursor, end: sleep });
  return gaps;
}

/**
 * Geçmişte anlatımı VERİLMİŞ konular (`exam|subject|topic`).
 *
 * `avoid` kümesinin tek amacı aynı konunun anlatımını ikinci kez açmamaktır;
 * soru çözümü, tekrar ve eksik kapatma bu kümeyle engellenmez (bkz. `addTask`
 * içindeki `isNew && avoid.has(...)` koşulu).
 *
 * Kaynak iki tanedir ve ikisi de O(n) okunur:
 *  1) `topics.status !== "Başlamadım"` — konu bir kez anlatılınca "Çalışıyorum"
 *     olur; bu, ders/sınav bazında KESİN ve güncel kayıttır.
 *  2) `daily` içindeki "Konu anlatımı" satırları — kullanıcı konu durumunu
 *     güncellemese bile anlatım yapıldığı burada görünür. `daily` satırında
 *     `exam` alanı olmadığından ders+konu eşleşmesi iki sınav için de korunur.
 *
 * ÖNEMLİ: Geçmiş planı BUGÜNKÜ konu durumuyla yeniden oynatmak (eski
 * `avoidEarlierThisWeek`) yanlıştı. Bugün başlamış konular geçmişte
 * "başlamamış" görünmediğinden replay, o günün sıradaki HİÇ işlenmemiş
 * konularını seçip onları `avoid`a atıyordu; böylece her gün bir sonraki konu
 * kalıcı olarak bloke ediliyor, 14.11.2026'dan sonra yeni konu üretimi sıfıra
 * iniyor ve AYT kapıları hiç açılmıyordu. Üstelik maliyeti O(gün²) idi.
 */
function taughtTopics(topics: TopicRow[], daily: DailyRow[]): Set<string> {
  const used = new Set<string>();
  for (const t of topics) {
    if (t.status !== "Başlamadım") used.add(`${t.exam}|${t.subject}|${t.topic}`);
  }
  for (const d of daily) {
    if (d.kind !== "Konu anlatımı" || !d.subject || !d.topic) continue;
    used.add(`TYT|${d.subject}|${d.topic}`);
    used.add(`AYT|${d.subject}|${d.topic}`);
  }
  return used;
}

export function planPace(topics: TopicRow[], settings: ScheduleSettings, today = todayISO()) {
  const start = settings.programStart || today;
  const from = start > today ? start : today;
  const exam = settings.examDate || from;
  const daysLeft = Math.max(0, daysBetween(from, exam));
  let studyDays = 0;
  for (let i = 0; i <= daysLeft; i++) {
    const wd = new Date(addDaysISO(from, i) + "T12:00:00").getDay();
    if (wd !== 0) studyDays += 1;
  }
  const groups = new Map<string, TopicRow[]>();
  for (const t of topics) {
    const key = `${t.exam}|${t.subject}|${t.topic}`;
    const list = groups.get(key) ?? [];
    list.push(t);
    groups.set(key, list);
  }
  let leftTopics = 0;
  for (const rows of groups.values()) {
    // Paragraf/Problemler her gün soru çözümü olarak yapılır, "konu anlatımı"
    // olarak hiç açılmaz. Sayılırsa sayaç hiç sıfırlanmaz ve motor AYT'yi açmaz.
    if (isOngoingTopic(rows[0].exam, rows[0].subject, rows[0].topic)) continue;
    if (!rows.every((r) => r.status === "Bitti")) leftTopics += 1;
  }
  // Gerçek kapasite: pazar, deneme günleri ve günlük sabit görevler düşülür.
  // `from` ile yeni konu penceresinin sonu arasındaki günler sayılır.
  const timeline = buildTimeline(start, exam);
  const finalPhase = timeline[timeline.length - 1];
  const teachWindow: DayLoad[] = [];
  for (let date = from; date < exam; date = addDaysISO(date, 1)) {
    const ph = phaseFor(timeline, date);
    // Yeni konu açılmayan faz başlayınca pencere kapanır; o günler kapasiteye
    // giremez, yoksa motor "sığar" deyip konuları hiç açmaz.
    if (!ph.newTopics) break;
    const wd = new Date(date + "T12:00:00").getDay();
    const isMock = settings.mockWeekdays.includes(wd) || (ph.mockIntensity >= 2 && wd === 3);
    teachWindow.push({ isSunday: wd === 0, isMock });
  }
  // Kapasite dönemsel eğriden gelir; varsayılan 240 onu geçersiz kılamaz.
  const studyMinutes = dailyCapacity(from, settings.studyMinutes);
  const cap = capacity(teachWindow, studyMinutes);
  // Talep tabanlı yeni konu sayısı (tüm müfredat sınav tarihine yetişsin diye).
  const perDayBase = cap.teachDays > 0
    ? Math.min(cap.perDay, Math.max(1, Math.ceil(leftTopics / cap.teachDays)))
    : 0;
  // TYT yalnız: sınav öncesi bitiş tahmini. AYT kapıları kapalıyken öncelik TYT'de.
  const tytKeys = new Set<string>();
  for (const t of topics) {
    if (t.exam !== "TYT") continue;
    if (isOngoingTopic(t.exam, t.subject, t.topic)) continue;
    const key = `${t.subject}|${t.topic}`;
    const rows = topics.filter((x) => x.exam === "TYT" && x.subject === t.subject && x.topic === t.topic);
    if (!rows.every((r) => r.status === "Bitti")) tytKeys.add(key);
  }
  const tytLeft = tytKeys.size;

  // Hedef-farkındal tempo: TYT tur 1 hedefine (ilk fazın sonu) yetişmek için
  // TYT'nin günde kaç yeni konu alması gerektiği. AYT kapıları açılınca motor
  // günlük 2 slotu iki sınava bölüyordu ve TYT günde ~1 konuya düşüp hedefi
  // 2 ay geçiyordu. TYT önce bitmeli; AYT kalan slotu kullanır.
  const tytAnchor = timeline[0]?.to ?? exam;
  const tytWindowDays = Math.max(
    1,
    (() => {
      let n2 = 0;
      for (let d = from; d < tytAnchor; d = addDaysISO(d, 1)) {
        const ph = phaseFor(timeline, d);
        if (!ph.newTopics) break;
        if (new Date(d + "T12:00:00").getDay() !== 0) n2 += 1;
      }
      return n2;
    })(),
  );
  const tytPerDayNeeded = tytLeft > 0 ? Math.min(cap.perDay, Math.max(1, Math.ceil(tytLeft / tytWindowDays))) : 0;
  // KADANS TABANI (ders sürekliliği).
  //
  // `perDay` tüm müfredatı Haziran'a yaydığı için son dönemde 1'e düşüyordu.
  // Ama o dönemde ~15 TYT dersi hâlâ bekliyor; günde 1 yeni konu → her ders
  // ~15 günde bir dönüyor ve boşluklar 15-20 güne çıkıyordu. Kapasite elverdiği
  // ölçüde, bekleyen her TYT dersini ~10 günde bir dolaşacak bir taban koyuyoruz.
  // Bu, yapay hızlandırma değil; günlük kapasitenin (480 dk) zaten karşıladığı,
  // "dersler kopuk ilerlemesin" kuralının gerektirdiği bir alt sınırdır.
  const pendingTytSubjects = new Set(
    topics
      .filter(
        (t) =>
          t.exam === "TYT" &&
          !isOngoingTopic(t.exam, t.subject, t.topic) &&
          t.status !== "Bitti",
      )
      .map((t) => t.subject),
  ).size;
  const cadenceFloor = Math.min(cap.perDay, Math.max(1, Math.ceil(pendingTytSubjects / 10)));
  // AYT kapısı: en az bir AYT dersi hazır mı?
  const aytGateOpen = (() => {
    const u = aytUnlocks(topics);
    return u.mat.ready || u.fiz.ready || u.kim.ready || u.bio.ready;
  })();
  const aytLeft = leftTopics - tytLeft;
  // TYT'nin hedefine yetişmesi için gereken günlük pay (kadans tabanıyla).
  const tytPerDayTarget = Math.min(cap.perDay, Math.max(tytPerDayNeeded, cadenceFloor));
  // Günlük yeni konu sayısı. TYT sürerken: TYT hedefi + (AYT kapısı açıksa 1).
  // Aksi hâlde TYT fazında AYT hiç başlamıyor ya da TYT hedefini kaçırıyordu.
  // TYT bitince tüm kapasite AYT'ye geçer.
  const perDay =
    tytLeft > 0
      ? Math.min(cap.perDay, Math.max(perDayBase, tytPerDayTarget + (aytGateOpen && aytLeft > 0 ? 1 : 0)))
      : cap.perDay;
  // TYT sürerken AYT'ye EN AZ 1 slot; TYT bitince kalan kapasitenin tamamı
  // AYT'ye geçer. Kapı açıldığı andan itibaren AYT ilerler (kural: AYT başlayınca
  // TYT durmaz, ama AYT de donmaz).
  const aytPerDay =
    aytGateOpen && aytLeft > 0
      ? tytLeft > 0
        ? Math.max(0, Math.min(2, perDay - tytPerDayTarget))
        : Math.min(2, Math.max(1, perDay - 1))
      : 0;
  const tytPerDay = tytLeft > 0 ? Math.max(1, Math.min(perDay, perDay - aytPerDay)) : 0;
  const tytStudyDays = perDay > 0 ? Math.ceil(tytLeft / perDay) : 0;
  const tytEta = tytStudyDays > 0 ? addDaysISO(from, Math.ceil((tytStudyDays * 7) / 6)) : from;

  // Hız senaryoları: günde kaç yeni konu hedeflenirse TYT ne zaman biter.
  const tytScenarios = [1, 2, 3].map((per) => {
    const days = Math.ceil(tytLeft / per);
    return { per, studyDays: days, eta: addDaysISO(from, Math.ceil((days * 7) / 6)) };
  });
  const teachDays = cap.teachDays;
  const fits = leftTopics <= cap.capacity;
  return {
    start,
    from,
    daysLeft,
    studyDays,
    leftTopics,
    perDay,
    timeline,
    finalPhase,
    teachingDays: teachDays,
    capacity: cap.capacity,
    fits,
    tytLeft,
    tytStudyDays,
    tytEta,
    tytPerDay,
    aytPerDay,
    tytScenarios,
  };
}

export function buildDailyPlan(
  topics: TopicRow[],
  daily: DailyRow[],
  wrongs: WrongRow[],
  tytExams: TytExam[],
  aytExams: AytExam[],
  settings: ScheduleSettings,
  carry: CarryItem[],
  today = todayISO(),
  avoidExternal?: Set<string>,
  analyzedWrongs?: Record<string, string>,
  branchHistory?: Record<string, string>,
): {
  slots: PlanSlot[];
  life: PlanSlot[];
  /** Bugün analiz edilen yanlış kayıtlarının kimlikleri (çağıran taraf işaretler). */
  analyzedWrongIds: string[];
  /** Bugün verilen branş denemesi dersi (çağıran taraf geçmişe işler). */
  branchMockSubject: string | null;
} {
  const weekday = new Date(today + "T12:00:00").getDay();
  const sunday = weekday === 0;
  const pace = planPace(topics, settings, today);
  if (settings.programStart && today < settings.programStart) {
    const lifeOnly: PlanSlot[] = busyIntervals(settings, weekday).map((b) => ({
      id: uid(),
      start: fromMin(b.start),
      end: fromMin(b.end),
      exam: "",
      subject: "",
      topic: b.label,
      kind: "Tekrar",
      targetQ: 0,
      minutes: b.end - b.start,
      priority: "düşük",
      reason: "Korunan yaşam bloğu",
      life: true,
    }));
    return { slots: [], life: lifeOnly, analyzedWrongIds: [], branchMockSubject: null };
  }
  const avoid = avoidExternal ?? taughtTopics(topics, daily);
  const phase = phaseFor(pace.timeline, today);
  const ranked = rankTopics(topics, daily, wrongs, today);
  const reviews = dueReviews(topics, daily, today);
  const extra = Math.min(45, Math.round(carry.reduce((a, c) => a + c.minutes, 0) / 3));
  // Dönemsel kapasite eğrisi (330/390/480); varsayılan 240'ı geçersiz kılar.
  let budget = dailyCapacity(today, settings.studyMinutes) + extra;
  if (sunday) budget = Math.max(90, Math.round(budget * 0.5));
  // Sabit günlük görevlerin (paragraf, problem, yanlış analizi) toplam dakikası.
  let fixedMinutes = 0;
  const slots: PlanSlot[] = [];
  const life: PlanSlot[] = busyIntervals(settings, weekday).map((b) => ({
    id: uid(),
    start: fromMin(b.start),
    end: fromMin(b.end),
    exam: "",
    subject: "",
    topic: b.label,
    kind: "Tekrar",
    targetQ: 0,
    minutes: b.end - b.start,
    priority: "düşük",
    reason: "Korunan yaşam bloğu",
    life: true,
  }));

  const tasks: (Omit<PlanSlot, "id" | "start" | "end"> & { tier?: number })[] = [];

  // Deneme günü: kullanıcı seçimi + yoğun fazlarda hafta ortası ek deneme.
  const extraMockDay = phase.mockIntensity >= 2 && weekday === 3;
  const mockDay = (settings.mockWeekdays.includes(weekday) || extraMockDay) && !sunday;
  // Deneme günü: 165–180 dk'lık tam deneme günün omurgasıdır. Bu bayrak denemenin
  // bitişik yerleşmesini ve o gün yeni konu açılmamasını tetikler.
  let mockFull = false;
  let mockShort = false;
  let branchMockSubject: string | null = null;
  if (mockDay) {
    const tytReady = tytMockReady(topics, tytExams);
    const aytReady = aytMockReady(topics, tytExams, aytExams);
    // Branş denemesi dersi: kapsam + zayıflık (yanlış/net) + rotasyon birlikte.
    // Eski kod yalnızca "en düşük kapsamlı uygun ders"i seçiyordu; dört branş
    // denemesinin tamamı Türkçe'ye gidiyordu. Deneme kayıtları ders türünü
    // ayırmadığı için `subjectLastMock` boş geçilir; rotasyon güne bağlıdır.
    const branch = pickBranchSubject({
      topics,
      tytExams,
      wrongs,
      today,
      candidates: ["Türkçe", "Matematik", "Geometri", "Fizik", "Kimya", "Biyoloji"],
      subjectLastMock: branchHistory,
    });
    // Deneme türü seçimi saf modelde (`mock-model.ts`): tam TYT / tam AYT /
    // branş / mini. Süreler gerçek sınav sürelerinden gelir. Tam deneme SINAVI
    // takvim dönüşümüyle belirlenir; kullanıcının hangi sonucu girdiği temel
    // TYT–AYT dağılımını değiştirmez (yalnızca hazırbulunuşluk etkiler).
    //
    // `mockOrdinal` deneme günü sayacıdır (tam deneme KADANSI), `fullMockOrdinal`
    // ise tam deneme sayacıdır (sınav DÖNÜŞÜMÜ). İkisi ayrı tutulur; aksi hâlde
    // kadans ile dönüşüm aynı pariteye bağlanıp 1:1 döneminde hep TYT üretilir.
    // Her iki sayaç da TAKVİME bağlıdır, sonuç kaydına bakmaz.
    const { mockDays: mockOrdinal, fullMockDays: fullMockOrdinal } = mockDayCounters(
      settings,
      settings.programStart,
      today,
    );
    const daysToTytExam = daysBetween(today, settings.examDate || today);
    // TAM deneme kadansı (TAKVİME bağlı, sonuç kaydından bağımsız). İlk deneme
    // gününde başlar; faz yoğunluğu 2 olduğunda her deneme günü tam denemeye
    // uygundur, aksi hâlde iki deneme gününde bir. Tam deneme günü değilse branş/
    // mini denemesi kurulur; böylece branş denemesi kadansı korunur.
    const fullMockDue = mockOrdinal === 1 || (phase.mockIntensity >= 2 ? true : mockOrdinal % 2 === 0);
    // TYT ilk turu bitti mi? Bitti sayılması için öğrenilmiş (Bitti + 15 soru +
    // %70) TYT konusu kalmamalı. Bitince tam deneme dengesi 1:1'e kayar.
    const tytRound1Done = !topics.some(
      (t) =>
        t.exam === "TYT" &&
        !isOngoingTopic(t.exam, t.subject, t.topic) &&
        learningStage(t) !== "ogrenildi",
    );
    const mock = chooseMock({
      isMockDay: mockDay,
      fullMockDue,
      tytReady,
      aytReady,
      branchSubject: branch?.subject ?? null,
      overallCoverage: overallCoverage(topics, "TYT"),
      rotationIndex: fullMockOrdinal,
      daysToTytExam,
      tytRound1Done,
    });
    if (mock) {
      tasks.push({
        exam: mock.exam,
        subject: mock.subject,
        topic: mock.topic,
        kind: "Deneme",
        targetQ: mock.targetQ,
        minutes: mock.minutes,
        priority: mock.type === "tam" ? "yüksek" : "orta",
        reason:
          mock.type === "tam"
            ? mock.exam === "AYT"
              ? `AYT kapsamı ve kapıları yeterli. ${phase.title} fazı, 14 günde bir.`
              : phase.mockIntensity >= 2
                ? `${phase.title} fazı: deneme sıklığı arttı, haftada iki.`
                : "Çekirdek matematiğin ~%40’ı bitti veya deneme kaydı var."
            : mock.type === "brans"
              ? `Tam deneme zamanı gelmedi; branş denemesi: ${branch?.subject ?? mock.subject} (${branch?.reason ?? ""}).`
              : "Kapsam henüz branş denemesine yetmiyor; deneme ritmi mini denemeyle korunur.",
      });
      // Tam deneme günün omurgasıdır: bitişik yerleşir ve o gün yeni konu
      // açılmaz. Branş/mini kısa olduğu için bu kısıt uygulanmaz.
      if (mock.type === "tam") {
        budget = Math.max(budget, 210);
        mockFull = true;
      }
      if (mock.type === "brans" || mock.type === "mini") mockShort = true;
      if (mock.type === "brans") branchMockSubject = mock.subject;
    }
  }

  const paraToday = daily.filter((d) => d.date === today && d.topic.toLocaleLowerCase("tr").includes("paragraf"));
  if (paraToday.reduce((a, d) => a + n(d.questions), 0) < settings.paragraphTarget) {
    tasks.push({
      exam: "TYT",
      subject: "Türkçe",
      topic: "Paragraf",
      kind: "Soru çözümü",
      targetQ: settings.paragraphTarget,
      minutes: 50,
      priority: "orta",
      reason: "Paragraf bitmez; günlük pratik korunur",
    });
    fixedMinutes += 50;
  }
  const probToday = daily.filter((d) => d.date === today && d.topic.toLocaleLowerCase("tr").includes("problem"));
  if (probToday.reduce((a, d) => a + n(d.questions), 0) < settings.problemTarget) {
    tasks.push({
      exam: "TYT",
      subject: "Matematik",
      topic: "Problemler",
      kind: "Soru çözümü",
      targetQ: settings.problemTarget,
      minutes: 50,
      priority: "orta",
      reason: "Problemler sürekli pratik ister",
    });
    fixedMinutes += 50;
  }

  // Yanlış analizi: son günlerdeki yanlışlar GERÇEK KONU kimliğine göre gruplanır
  // (exam|subject|topic). Görev `topic` alanı gerçek konuyu taşır ve `wrongIds`
  // ile kaynak yanlış kayıtlarına bağlanır; `reason` tek başına konu bağlantısı
  // yerine geçmez. Her yanlış kaydı en fazla BİR kez analiz edilir:
  // `analyzedWrongs[id]` o yanlışın analiz edildiği günü tutar. Kayıt DAHA ÖNCEKİ
  // bir günde analiz edildiyse tekrar üretilmez; BUGÜN analiz edildiyse aynı gün
  // görünmeye devam eder (ekran yenilenince görev kaybolmaz). Pencere 7 gündür;
  // `result` dolu (kullanıcı kapatmış) yanlışlar analiz edilmez. Günde en fazla
  // 2 KONU grubu.
  //
  // İŞARETLEME BURADA YAPILMAZ. Görevin üretilmesi veya plana yerleşmesi tek
  // başına yanlışları "analiz edildi" saymaz; aksi hâlde kapasite nedeniyle
  // yerleşmeyen görevlerin yanlışları kaybolurdu. İşaretleme, dönen
  // `analyzedWrongIds` üzerinden ve YALNIZCA kullanıcı bugün o konuda
  // "Yanlış analizi" günlük kaydı girdiğinde yapılır (bkz. fonksiyon sonu).
  const analyzed = analyzedWrongs ?? {};
  const pendingWrongs = wrongs.filter(
    (w) =>
      w.subject &&
      w.topic &&
      !w.result &&
      daysBetween(w.date, today) <= 7 &&
      !(analyzed[w.id] && analyzed[w.id] < today),
  );
  const wrongByTopic = new Map<string, WrongRow[]>();
  for (const w of pendingWrongs) {
    const key = `${w.exam || "TYT"}|${w.subject}|${w.topic}`;
    const list = wrongByTopic.get(key) ?? [];
    list.push(w);
    wrongByTopic.set(key, list);
  }
  const analyzedTopics: { exam: string; subject: string; topic: string }[] = [];
  let wrongTasks = 0;
  for (const [key, list] of [...wrongByTopic.entries()].sort((a, b) => b[1].length - a[1].length)) {
    if (wrongTasks >= 2) break;
    const [exam, subject, topic] = key.split("|");
    const subtopics = [...new Set(list.map((w) => w.subtopic).filter(Boolean))];
    const reasons = [...new Set(list.map((w) => w.reason).filter(Boolean))];
    const detail = [
      subtopics.length ? `alt konu: ${subtopics.slice(0, 3).join(", ")}` : "",
      reasons.length ? `hata: ${reasons.slice(0, 2).join(", ")}` : "",
    ]
      .filter(Boolean)
      .join("; ");
    tasks.push({
      exam: exam as "TYT" | "AYT",
      subject,
      topic,
      kind: "Yanlış analizi",
      targetQ: Math.min(12, list.length * 3),
      minutes: 40,
      priority: "orta",
      reason: `Son 7 günde ${list.length} yanlış — ${subject}/${topic}${detail ? ` (${detail})` : ""}`,
      wrongIds: list.map((w) => w.id),
    });
    analyzedTopics.push({ exam, subject, topic });
    fixedMinutes += 40;
    wrongTasks += 1;
  }

  // Tamamlanma kapısı. Bir yanlış, YALNIZCA kullanıcı bugün o konu için
  // "Yanlış analizi" günlük kaydı girdiğinde (mevcut görev tamamlama mekanizması)
  // analiz edilmiş sayılır. Görevin üretilmesi veya plana yerleşmesi tek başına
  // yeterli DEĞİLDİR: kapasite yüzünden yerleşmeyen ya da yerleşip de
  // tamamlanmayan görevin yanlışları kaybolmaz, sonraki günlerde yeniden
  // görevlendirilir. Dönüş yalnızca bu tamamlanmış görevlerin kimliklerini taşır;
  // çağıran taraf `markWrongsAnalyzed` ile kalıcılaştırır.
  const completedToday = new Set(
    daily
      .filter((d) => d.date === today && d.kind === "Yanlış analizi" && d.subject && d.topic)
      .map((d) => `${d.subject}|${d.topic}`),
  );
  const analyzedWrongIds: string[] = [];
  for (const t of tasks) {
    if (t.kind !== "Yanlış analizi") continue;
    if (completedToday.has(`${t.subject}|${t.topic}`)) analyzedWrongIds.push(...(t.wrongIds ?? []));
  }

  // Yanlış analizinin HEMEN ardından hedefli konu çalışması: analiz edilen her
  // konu için konuya bağlı bir soru çözümü eklenir. Analiz gerçek konuya dönük
  // çalışmaya dönüşsün diye görev analizle aynı gün ve yeni konulardan ÖNCE
  // sıraya girer; günlük en fazla 2 analiz olduğu için maliyeti sınırlıdır.
  // Aynı konu için zaten bir görev varsa (rutin Paragraf/Problemler vb.) eklenmez.
  for (const t of analyzedTopics) {
    // Dedup: yalnızca "Yanlış analizi" DIŞINDA aynı konuya ait görev varsa ekleme.
    // (Yanlış analizi görevi de aynı konuyu taşır; onu eşleştirmek hedefli görevi
    // tamamen engelliyordu.)
    if (
      tasks.some(
        (x) => x.kind !== "Yanlış analizi" && x.subject === t.subject && x.topic === t.topic,
      )
    )
      continue;
    tasks.push({
      exam: t.exam as "TYT" | "AYT",
      subject: t.subject,
      topic: t.topic,
      kind: "Soru çözümü",
      targetQ: 12,
      minutes: 40,
      priority: "orta",
      reason: `Yanlış analizi sonrası hedefli soru çözümü: ${t.subject}/${t.topic}`,
      tier: 1,
    });
  }

  // Yerleştirme sırası önemli: görevler listedeki sırayla saat dilimlerine
  // oturur ve bütçe bitince kalanlar düşer. Bu yüzden sıra:
  //   1) yeni konu anlatımı (programın ilerlemesi buna bağlı)
  //   2) tekrar (bütçede kalan pay kadar)
  //   3) başlanmış konuların soru çözümü
  // Yeni konu en sona bırakılırsa sabit görevler bütçeyi doldurup program durur.
  // Yeni konu rezervi YALNIZCA gerçekten açılacak yeni konu varsa ayrılır.
  // İlk tur bittikten sonra `pace.perDay` hâlâ dolu görünür (tüm müfredat hesabı);
  // rezerv sıfırlanmazsa bütçenin ~110 dk'sı var olmayan yeni konulara ayrılır ve
  // gerçek işler (deneme, yanlış analizi, SRS, branş) açlığa itilir. Ölçüm:
  // Mart–Haziran'da 480 dk kapasitenin yalnızca ~128 dk'sı kullanılıyordu.
  const hasNewTopics =
    phase.newTopics &&
    !sunday &&
    topics.some(
      (t) => t.status === "Başlamadım" && !isOngoingTopic(t.exam, t.subject, t.topic),
    );
  // Deneme gününde 165 dk deneme + 100 dk sabit görev kapasitenin çoğunu yer.
  // O gün yeni konu açılmaz; kalan bütçe pratik/tekrara bırakılır. Aksi hâlde
  // anlatılan konuların pratiği ertesi günlere sarkıyordu (ölçüm: 2026-12-23
  // anlatımı 2026-12-27'de çözüldü, 4 gün).
  // Branş/mini deneme gününde yeni konu açılışı sınırlanır: kısa deneme günü
  // tümüyle kapatılmaz ama aynı güne 3 yeni anlatım yığılmaz (eski ölçüm:
  // 2026-12-05 ve 12-12'de branş denemesiyle birlikte 3 yeni konu). En fazla 1
  // yeni konu; kalan bütçe bekleyen pratik ve tekrara gider. Tam deneme gününde
  // yeni konu hiç açılmaz (mevcut kural korunur).
  const newCap = hasNewTopics ? (mockFull ? 0 : mockShort ? Math.min(pace.perDay, 1) : pace.perDay) : 0;
  const perDayReserve = newCap;
  const split = splitBudget(budget, perDayReserve, fixedMinutes, {
    sunday,
    // Tekrarların pratiği açlığa itmemesi için pratiğe slot ayrılır. Her konu
    // 1 anlatım + 1 soru çözümü tükettiğinden, TYT bittikten sonra AYT'nin
    // tıkanmaması için pratik payı artırılır.
    practiceSlots: mockFull ? 2 : hasNewTopics ? Math.max(1, Math.min(2, perDayReserve - 1)) : 0,
  });
  const used2 = new Set<string>();
  // İlerleme kapısı (sert sıra) için "öğrenilmiş" küme.
  //
  // Kullanıcı kuralı: aynı derste sonraki YENİ konuya geçmek için önceki konunun
  // ÖĞRENİLMİŞ olması gerekir. Öğrenilmiş = "Bitti" + en az 15 soru + en az %70
  // doğru (bkz. progress.ts). Eşik DEĞİŞMEZ; başarı sağlanmadan konu Bitti
  // yapılmaz, dolayısıyla sıradaki konu açılmaz.
  //
  // Kilit GLOBAL DEĞİL, DERS BAZINDADIR: bir derste takılı kalan konu yalnızca O
  // dersin yeni konusunu durdurur; bağımsız dersler ilerlemeye devam eder. Bu
  // yüzden tek bir dersin başarısızlığı tüm programı dondurmaz. Takılı konu ise
  // görünür kalır ve eksik kapatma rotasyonunda (3. geçiş) çalışmaya devam eder.
  const progressionReady = new Set<string>(
    topics
      .filter(
        (t) =>
          t.status === "Bitti" &&
          (t.total ?? 0) >= MIN_QUESTIONS_FOR_MASTERED &&
          (t.total ?? 0) > 0 &&
          ((t.correct ?? 0) / (t.total ?? 1)) >= MASTERY_RATIO,
      )
      .map((t) => `${t.exam}|${t.subject}|${t.topic}`),
  );
  // Eksik kapatma rotasyonu: takılı bir konu için sırayla uygulanan görev
  // türleri. Aynı görevi (ör. her gün 18 soru) tekrar üretmek yerine
  // soru çözümü → tekrar → konu anlatımı → yanlış analizi döner. Tur seçimi
  // güne + konuya bağlıdır (bkz. aşağıda); soru sayısına bağlamak yanlıştı.
  const RECOVERY_KINDS: PlanSlot["kind"][] = ["Soru çözümü", "Tekrar", "Konu anlatımı", "Yanlış analizi"];
  const RECOVERY_TARGET: Record<string, number> = { "Soru çözümü": 18, Tekrar: 15, "Konu anlatımı": 0, "Yanlış analizi": 12 };
  // Eksik kapatma türünü GÜN + KONUYA göre seçer. Aynı başarısız konuya her gün
  // aynı görevi (ör. 25 soruluk "Tekrar") yazmak yerine tür döner; böylece
  // öğrenci soru çözümü → tekrar → konu anlatımı → yanlış analizi döngüsünden
  // geçer (kullanıcı kuralı 6). Gün indeksi her gün bir sonraki türe geçirir;
  // konu bazlı ofset aynı gün farklı konuların türlerini ayırır.
  const recoveryKindFor = (exam: string, subject: string, topic: string): PlanSlot["kind"] => {
    const dayIdx = Math.round(daysBetween(settings.programStart || today, today));
    const seed = [...`${exam}|${subject}|${topic}`].reduce((a, c) => a + c.charCodeAt(0), 0);
    const n = RECOVERY_KINDS.length;
    return RECOVERY_KINDS[((dayIdx + seed) % n + n) % n];
  };
  // Öğrencinin hangi alt konuda / hangi hata türünde zorlandığını özetler.
  const struggleOf = (exam: string, subject: string, topic: string) => {
    const ws = wrongs.filter((w) => w.exam === exam && w.subject === subject && w.topic === topic);
    if (!ws.length) return null;
    const tally = (pick: (w: (typeof ws)[number]) => string) => {
      const m = new Map<string, number>();
      for (const w of ws) {
        const k = pick(w);
        if (k) m.set(k, (m.get(k) ?? 0) + 1);
      }
      return [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
    };
    return { count: ws.length, subtopic: tally((w) => w.subtopic), reason: tally((w) => w.reason) };
  };
  const addTask = (
    r: (typeof ranked)[number],
    kindOverride?: string,
    opts?: { targetQ?: number; minutes?: number; reason?: string; tier?: number },
  ): boolean => {
    if (tasks.length > (sunday ? 5 : 8)) return false;
    if (tasks.some((t) => t.topic === r.topic && t.subject === r.subject)) return false;
    const isNew = r.status === "Başlamadım";
    // `avoid` yalnızca AYNI konunun anlatımını tekrar açmayı engeller.
    // Soru çözümü/tekrar engellenmez: aksi hâlde geçmişte anlatımı verilmiş
    // her konu kalıcı olarak dışlanıyor ve hiçbir konu "Bitti" olamıyordu.
    if (isNew && avoid.has(`${r.exam}|${r.subject}|${r.topic}`)) return false;
    if (used2.has(`${r.exam}|${r.subject}|${r.topic}`)) return false;
    if (r.health === "iyi" && r.freq < 0.5) return false;
    if (isNew && (sunday || !phase.newTopics)) return false;
    // Sert ön koşul: AYT kapısı kapalıysa konu hiç açılmaz (yumuşak ceza yeterli değil).
    if (isNew && !r.aytOpen) return false;
    // Sert sıra: ders içinde önceki konular başlamadan bu konu açılmaz.
    if (isNew && !orderAllowed(r.exam, r.subject, r.topic, progressionReady)) return false;
    // Tamamlanmış konuya yeni "Soru çözümü" görevi yazılmaz. Bitmiş konunun
    // bakımı tekrar (SRS) görevleriyle yapılır; yoksa aynı konu her gün
    // tekrar tekrar soru görevi alıp yeni konuların önünü kesiyordu.
    if (!isNew && r.status === "Bitti" && !kindOverride) return false;
    tasks.push({
      exam: r.exam,
      subject: r.subject,
      topic: r.topic,
      kind: (kindOverride ?? (isNew ? "Konu anlatımı" : "Soru çözümü")) as PlanSlot["kind"],
      targetQ: opts?.targetQ ?? (r.health === "bos" ? 0 : r.health === "kritik" ? 25 : 18),
      minutes: opts?.minutes ?? 55,
      priority: r.priority > 0.7 ? "yüksek" : r.priority > 0.45 ? "orta" : "düşük",
      reason: opts?.reason ?? (r.reasons[0] || "Öncelik sırası"),
      tier: opts?.tier ?? (isNew ? 0 : 2),
    });
    used2.add(`${r.exam}|${r.subject}|${r.topic}`);
    return true;
  };

  // 1. geçiş: yeni konular — bütçede ayrılan rezervi kullanır.
  // TYT ve AYT için ayrı kontenjan: TYT tur 1 hedefine yetişmesi gerektiğinden
  // TYT önce gelir, AYT kalan slotu kullanır. Kontenjan yoksa ilgili sınav atlanır.
  //
  // AYT adayları dersler arasında DÖNÜŞÜMLÜ sıralanır: aksi hâlde öncelik
  // skoru yüksek Matematik (18 konu) diğer derslerin önüne geçiyor ve Fizik/
  // Kimya/Biyoloji kapıları açılmasına rağmen haftalarca başlamıyordu.
  const aytBySubject = new Map<string, (typeof ranked)[number][]>();
  for (const r of ranked) {
    if (r.exam !== "AYT" || r.status !== "Başlamadım" || !r.aytOpen) continue;
    const list = aytBySubject.get(r.subject) ?? [];
    list.push(r);
    aytBySubject.set(r.subject, list);
  }
  // Dersler EN GERİDE OLANDAN öne doğru dizilir (ilerleme = başlanmış/toplam):
  // büyük dersler daha çok slot alır, ama hiçbir ders kapı açıkken aç kalmaz.
  const progressOf = new Map<string, number>();
  // Dersin son YENİ KONU ANLATIMI tarihi. "Maksimum bekleme" kuralı bu tarihten
  // bugüne geçen günü ölçer; pratik/tekrar bekleme saymaz (aksi hâlde tekrar
  // görevleri saati sıfırlayıp anlatım boşluğunu gizlerdi).
  //
  // Ölçüm iki kaynaktan birleşir:
  //  - `daily` "Konu anlatımı" satırları (kesin sinyal). Yalnızca TYT'de
  //    KARŞILIĞI OLMAYAN konular sayılır; Mat/Geo adları TYT ile örtüştüğü ve
  //    `daily` satırı exam taşımadığı için onlar atlanır.
  //  - Günlük kayıt yoksa `topics[].lastStudy` (AYT satırları) yedeği.
  const lastLectureOf = new Map<string, string>();
  const tytTopicKeys = new Set(topics.filter((t) => t.exam === "TYT").map((t) => `${t.subject}|${t.topic}`));
  for (const d of daily) {
    if (d.kind !== "Konu anlatımı" || !d.subject || !d.topic) continue;
    if (tytTopicKeys.has(`${d.subject}|${d.topic}`)) continue;
    const prev = lastLectureOf.get(d.subject);
    if (!prev || d.date > prev) lastLectureOf.set(d.subject, d.date);
  }
  for (const subject of aytBySubject.keys()) {
    const rows = topics.filter((t) => t.exam === "AYT" && t.subject === subject);
    progressOf.set(subject, rows.length ? rows.filter((t) => t.status !== "Başlamadım").length / rows.length : 1);
    if (!lastLectureOf.has(subject)) {
      const last = rows
        .filter((t) => t.status !== "Başlamadım" && t.lastStudy)
        .map((t) => t.lastStudy)
        .sort()
        .at(-1);
      if (last) lastLectureOf.set(subject, last);
    }
  }
  // MAKSİMUM BEKLEME (ders devamlılığı).
  //
  // Salt "en geride olan önce" sıralaması, hızlı ilerleyen bir dersi (ör. AYT
  // Fizik) sürekli geriye itiyordu: ders Aralık sonunda öne geçtiği için Ocak'ta
  // ~46 gün yeni konu anlatımı almadı ve 5 konu aç kaldı. Düzeltme, kapısı açık
  // ve ilk turu bitmemiş bir ders `AYT_MAX_WAIT_DAYS` gündür yeni konu anlatımı
  // almadıysa onu sıralamada ÖNE taşır. Eşitlik değil, ihmal önleme amaçlanır:
  // bekleme süresi dolmamış dersler yine ilerlemeye göre sıralanır.
  //
  // Bu kural TYT kontenjanına (tytPerDay) dokunmaz; yalnızca AYT dersleri
  // arasındaki sırayı etkiler. Tamamlanmış dersler zaten `aytBySubject`'e
  // girmez (status "Başlamadım" süzgeci) ve kapısı kapalı dersler de burada
  // yoktur; dolayısıyla tamamlanmış veya kilitli dersler yeniden açılmaz.
  const AYT_MAX_WAIT_DAYS = 10;
  const waitOf = (subject: string): number => {
    const last = lastLectureOf.get(subject);
    return last ? daysBetween(last, today) : 9999;
  };
  const overdue = (subject: string) => waitOf(subject) >= AYT_MAX_WAIT_DAYS;
  const baseOrder = [...aytBySubject.keys()].sort((a, b) => {
    const oa = overdue(a) ? 1 : 0;
    const ob = overdue(b) ? 1 : 0;
    if (oa !== ob) return ob - oa; // bekleme süresi dolan ders öne
    if (oa === 1) return waitOf(b) - waitOf(a); // en çok bekleyen önce
    return (progressOf.get(a) ?? 0) - (progressOf.get(b) ?? 0); // yoksa en geride olan
  });
  // GÜN DÖNGÜSÜ (dönüşümlü adalet). Yalnızca sıralamaya güvenmek yetmiyor:
  // günlük AYT kontenjanı 1–2 slot olduğundan, listenin hep başındaki dersler
  // hizmet alıp arkadakiler haftalarca bekliyordu. Sıra, program başından beri
  // geçen güne göre DÖNDÜRÜLÜR; böylece her açık kapılı ders sırayla öne geçer.
  // Bu, TYT ders dengesinde kullanılan `offset` deseninin aynısıdır.
  //
  // Bekleme süresi dolmuş dersler (yukarıda öne alınanlar) yine başta kalır;
  // dönüşüm onların ARASINDA değil, ders listesinin tamamında uygulanır ve
  // bekleme kuralı dönüşümden sonra da korunur.
  const aytDayIndex = Math.max(0, Math.floor(daysBetween(settings.programStart || today, today)));
  const nSubjects = Math.max(1, baseOrder.length);
  const rotate = aytDayIndex % nSubjects;
  const rotated = [...baseOrder.slice(rotate), ...baseOrder.slice(0, rotate)];
  // Bekleme süresi dolan dersler dönüşümle geriye düşmesin: onları listenin
  // başına sabitle, kalanları dönüşümlü sırayla ekle.
  const due = rotated.filter(overdue);
  const notDue = rotated.filter((s) => !overdue(s));
  const orderedSubjects = [...due, ...notDue];
  // `ranked` öncelik sıralıdır, ders sırası değil; bir dersin önde görünen
  // konusu sert sıra kuralınca bloke olabilir (ör. Fizik'te "Newton Yasaları"
  // gelip "Vektörler" beklemede). Bu yüzden sıradaki konu `orderAllowed` ile
  // seçilir; aksi hâlde ders aylarca başlamıyordu.
  const aytQueues = orderedSubjects.map((subject) => {
    const list = aytBySubject.get(subject)!;
    const first = list.find((r) => orderAllowed(r.exam, r.subject, r.topic, progressionReady));
    return first ? [first, ...list.filter((r) => r !== first)] : list;
  });
  const aytInterleaved: (typeof ranked)[number][] = [];
  for (let more = true; more; ) {
    more = false;
    for (const queue of aytQueues) {
      const next = queue.shift();
      if (next) {
        aytInterleaved.push(next);
        more = true;
      }
    }
  }
  const tytCandidates = ranked.filter(
    (r) => r.exam === "TYT" && r.status === "Başlamadım" && !isOngoingTopic(r.exam, r.subject, r.topic),
  );
  // TYT ders dengesi: adaylar derslere göre gruplanır ve DÖNÜŞÜMLÜ serpiştirilir
  // (aşağıda, ilerlemeye göre döndürülmüş round-robin).
  //
  // Önceden adaylar salt öncelik puanına göre sıralanıyordu; düşük frekanslı
  // dersler (Coğrafya, Felsefe, Din Kültürü) haftalarca geriye düşüyordu. Ölçüm:
  // Coğrafya ve Felsefe'de 45 gün, Matematik'te 57 gün yeni konu boşluğu vardı.
  const tytBySubject = new Map<string, (typeof ranked)[number][]>();
  for (const r of tytCandidates) {
    const list = tytBySubject.get(r.subject) ?? [];
    list.push(r);
    tytBySubject.set(r.subject, list);
  }
  // Dersin sıradaki (orderAllowed) konusu başa alınır; sert sıra yüzünden bloke
  // bir konu dersin başında durup dersi aylarca kilitleyemez.
  const tytQueues = new Map<string, (typeof ranked)[number][]>();
  for (const subject of tytBySubject.keys()) {
    const list = tytBySubject.get(subject)!;
    const first = list.find((r) => orderAllowed(r.exam, r.subject, r.topic, progressionReady));
    tytQueues.set(subject, first ? [first, ...list.filter((r) => r !== first)] : list);
  }
  const tytOrdered: (typeof ranked)[number][] = [];
  {
    // İLERLEMEYE GÖRE DÖNDÜRÜLMÜŞ dönüşümlü (round-robin) dağıtım.
    //
    // Ders sırası sabittir (alfabetik) ama liste, o ana kadar BAŞLATILMIŞ TYT
    // konu sayısına göre döndürülür. Böylece her gün kota listenin hep aynı
    // başından alınmaz; rotasyon ilerlemeyle birlikte kayar ve her aktif ders
    // sırayla hizmet alır.
    //
    // Dönüşüm (offset) olmadan "dalga" oluşuyordu: kısa konulu dersler hızlı
    // tamamlanıp listede hep öne geçiyor, uzun konulu dersler (Matematik/Tarih)
    // bloke kalıp 18-22 gün geriye düşüyordu. Offset, hizmeti ilerlemeye bağlar.
    const stableOrder = [...tytBySubject.keys()].sort((a, b) => a.localeCompare(b, "tr"));
    const rotation = stableOrder;
    // O ana kadar BAŞLATILMIŞ TYT konu sayısı (ders başına değil, toplam).
    const startedTotal = new Set(
      topics
        .filter((t) => t.exam === "TYT" && t.status !== "Başlamadım")
        .map((t) => `${t.subject}|${t.topic}`),
    ).size;
    const offset = startedTotal % Math.max(1, rotation.length);
    const rotated = [...rotation.slice(offset), ...rotation.slice(0, offset)];
    const queues = new Map<string, (typeof ranked)[number][]>(
      stableOrder.map((s) => [s, [...(tytQueues.get(s) ?? [])]]),
    );
    for (let more = true; more; ) {
      more = false;
      for (const s of rotated) {
        const queue = queues.get(s)!;
        const next = queue.shift();
        if (next) {
          tytOrdered.push(next);
          more = true;
        }
      }
    }
  }
  const newCandidates = [...tytOrdered, ...aytInterleaved];
  // Pratik bekleyen (anlatımı verilmiş, hiç soru çözülmemiş) konular. Hem yeni
  // konu kısıtlaması (aşağıda) hem 1.5 geçişi bu listeyi kullanır. EN ESKİDEN
  // yeniye (FIFO) sıralanır; aksi hâlde düşük skorlu uzun konular haftalarca
  // pratik alamıyordu (ölçüm: 3 konu 16 gün bekledi).
  const startedRows = ranked.filter((r) => r.status !== "Başlamadım");
  const awaitingPractice = startedRows
    .filter((r) => (r.total ?? 0) === 0)
    .sort((a, b) => (a.lastStudy || "").localeCompare(b.lastStudy || ""));
  // Eksik kapatma hedefi: başlamış ama HENÜZ öğrenilmemiş (başarı < %70)
  // konular. Bu konulara her gün AYNI görev yazılmaz; tür rotasyona bağlanır.
  const recoveryRows = startedRows
    .filter((r) => (r.total ?? 0) > 0 && r.success != null && r.success < 0.7)
    .sort((a, b) => (a.success ?? 0) - (b.success ?? 0));
  const recoveryKeys = new Set(recoveryRows.map((r) => `${r.exam}|${r.subject}|${r.topic}`));

  let newCount = 0;
  let tytNew = 0;
  let aytNew = 0;
  // Dersler arasında dönüşümlü dağıtım yardımcıcı: bir dersin birikimi tüm günü
  // doldurmasın, eksik kapatma farklı derslere dengeli yayılsın.
  const interleaveBySubject = <T extends { exam: string; subject: string }>(rows: T[]): T[] => {
    const groups = new Map<string, T[]>();
    for (const r of rows) {
      const k = `${r.exam}|${r.subject}`;
      const list = groups.get(k);
      if (list) list.push(r);
      else groups.set(k, [r]);
    }
    const out: T[] = [];
    for (let more = true; more; ) {
      more = false;
      for (const list of groups.values()) {
        const next = list.shift();
        if (next) {
          out.push(next);
          more = true;
        }
      }
    }
    return out;
  };
  // Pratik birikimi, yeni konu açılışını DERS BAZINDA kısar.
  // Kısıt GLOBAL değil: yalnızca pratiği birikmiş dersin yeni konusu yavaşlar;
  // bağımsız dersler ilerlemeye devam eder. Önceki global kilit, tek bir dersin
  // birikimiyle tüm programı (10 Kasım'da) donduruyordu.
  const awaitingBySubject = new Map<string, number>();
  for (const r of awaitingPractice) {
    const k = `${r.exam}|${r.subject}`;
    awaitingBySubject.set(k, (awaitingBySubject.get(k) ?? 0) + 1);
  }
  for (const r of newCandidates) {
    if (newCount >= newCap) break;
    const isTyt = r.exam === "TYT";
    if (isTyt && tytNew >= pace.tytPerDay) continue;
    if (!isTyt && aytNew >= pace.aytPerDay) continue;
    // Ders kendi pratiğini biriktirdiyse (>=2 bekleyen) yeni konusunu açmaz.
    if ((awaitingBySubject.get(`${r.exam}|${r.subject}`) ?? 0) >= 2) continue;
    if (addTask(r)) {
      newCount += 1;
      if (isTyt) tytNew += 1;
      else aytNew += 1;
    }
  }

  // 1.5 geçiş: ANLATIMI VERİLMİŞ ama henüz soru çözülmemiş konuların pratiği.
  //
  // Bu geçiş hem tekrarlardan hem de bugün anlatılan konunun aynı-gün pratiğinden
  // ÖNCE gelir. Aksi hâlde taze bir konunun pratiği, daha önce anlatılmış bir
  // konunun pratiğinin önüne geçiyor ve o konu haftalarca bekliyordu; ölçüm:
  // Kimyanın Temel Kanunları 25.11.2026'da anlatıldı, pratiği 18.01.2027'de
  // yapıldı (54 gün). Sıra FIFO'dur (en eski bekleyen önce); dersler arasında
  // dönüşümlü dağıtılır ki bir dersin birikimi günü doldurmasın. Katman 0'dır
  // (yeni konuyla aynı): başlanmış işi bitirmek, yeni konu açmak kadar önceliklidir.
  for (const r of interleaveBySubject(awaitingPractice)) addTask(r, undefined, { tier: 0 });

  // 1.25 geçiş: KISA konuların pratiğini aynı gün tamamla.
  //
  // Kullanıcı kuralı: anlatım + soru çözümü günlük kapasiteye sığıyorsa kısa/
  // orta konu aynı gün biter. Uzun konular (>=3 alt konu) ertesi güne taşar.
  // Zorlama yoktur: kapasite yetmezse görev yerleştirme aşamasında düşer.
  const lecturedToday = tasks.filter((t) => t.kind === "Konu anlatımı");
  for (const lt of lecturedToday) {
    const rows = topics.filter(
      (t) => t.exam === lt.exam && t.subject === lt.subject && t.topic === lt.topic,
    );
    if (rows.length > 2) continue; // uzun konu: gerçek iş yükü gereği bölünür
    tasks.push({
      exam: lt.exam,
      subject: lt.subject,
      topic: lt.topic,
      kind: "Soru çözümü",
      targetQ: 18,
      minutes: 55,
      priority: "orta",
      reason: "Kısa konu: anlatımla aynı gün tamamlanır",
      tier: 0,
    });
  }

  // 2. geçiş: tekrarlar, kalan paya sığdığı kadar.
  let reviewMinutes = 0;
  for (const r of reviews) {
    const mins = r.health === "kritik" ? 70 : 55;
    if (tasks.filter((t) => t.kind === "Tekrar").length >= 3) break;
    if (reviewMinutes + mins > split.reviewCap) break;
    if (tasks.some((t) => t.topic === r.topic && t.subject === r.subject)) continue;
    // Öğrenilmemiş konu "Tekrar"a kilitlenmesin: tür güne göre döner ve görev
    // eksik kapatma olarak işaretlenir (kullanıcı kuralı 6). Aksi hâlde aynı
    // "Tekrar" her gün tekrarlanıp rotasyon (konu anlatımı/yanlış analizi) hiç
    // devreye girmiyordu (ölçüm: takılı konuya 12 gün üst üste aynı "Tekrar").
    const isRecovery = recoveryKeys.has(`${r.exam}|${r.subject}|${r.topic}`);
    const kind = isRecovery ? recoveryKindFor(r.exam, r.subject, r.topic) : "Tekrar";
    tasks.push({
      exam: r.exam,
      subject: r.subject,
      topic: r.topic,
      kind,
      targetQ: isRecovery ? RECOVERY_TARGET[kind] : r.suggestedQ,
      minutes: isRecovery && kind === "Yanlış analizi" ? 40 : mins,
      priority: r.health === "kritik" ? "yüksek" : "orta",
      reason: isRecovery
        ? `Eksik kapatma turu: ${kind} (akıllı durum: ${r.health}).`
        : r.reason,
      tier: 2,
    });
    reviewMinutes += mins;
  }

  // 3. geçiş: başlanmış ama HENÜZ öğrenilmemiş konuların eksik kapatma işleri.
  // Öğrenilmemiş konu "Bitti" sayılmaz (15 soru + %70 korunur). Bu konular
  // normalde 2. geçişte (SRS) rotasyonlu türle zaten işlenir; buradaki geçiş
  // tekrar tavanı veya bütçe nedeniyle dışarıda kalanlar için yedektir (aynı
  // konu iki kez eklenmez). Yalnızca başarısı %70'in altındaki konular girer.
  for (const r of interleaveBySubject(recoveryRows)) {
    const kind = recoveryKindFor(r.exam, r.subject, r.topic);
    const st = struggleOf(r.exam, r.subject, r.topic);
    const detail = st ? ` Alt konu: ${st.subtopic || "-"}, hata: ${st.reason || "-"}` : "";
    addTask(r, kind, {
      targetQ: RECOVERY_TARGET[kind],
      minutes: kind === "Konu anlatımı" ? 55 : kind === "Yanlış analizi" ? 40 : 55,
      reason: `Eksik kapatma turu: ${kind} (başarı %${Math.round((r.success ?? 0) * 100)}).${detail}`,
      tier: 3,
    });
  }

  // Deneme, gerçek sınav gibi BİTİŞİK blok kaplar. Serbest pencereler yemek/
  // dinlenme bloklarıyla bölündüğü için eski kod denemeyi ilk pencereye sığdırıp
  // 165 dk'yı 50 dk'ya kırpıyordu (ölçüm: 2026-12-12/19/26). Deneme, KENDİSİNİ
  // TUTAN EN BÜYÜK pencereye (Cumartesi 13:20–19:00, 340 dk) bütün yerleşir;
  // kapladığı aralık diğer görevlerin pencerelerinden düşülür.
  const allWindows = freeWindows(settings, weekday);
  let used = 0;
  const occupied: { start: number; end: number }[] = [];

  // TAM SIĞDIRMA. Bir görevin tanımlı süresi (`task.minutes`) ile takvimde
  // kapladığı aralık BİRBİRİNDEN BAĞIMSIZDIR: görev ya tanımlı süresiyle bütün
  // yerleşir ya da hiç yerleşmez. Eski kod `Math.min(task.minutes, w.end-cursor)`
  // ile süreyi pencereye KIRPIYORDU; bu hem 40 dk'lık görevi 55 dk gösterebiliyor
  // hem de "tanımlı süre ≠ yerleşen süre" tutarsızlığını doğuruyordu.
  //
  // Bir görev, süresi kadar boş yer bulunan EN ERKEN pencereye konur. Hiçbir
  // pencere yetmiyorsa görev o gün düşer (kaybolmaz: bekleyen havuzda kalır ve
  // ertesi gün yeniden değerlendirilir).
  const freeRanges = (): { start: number; end: number }[] => {
    const out: { start: number; end: number }[] = [];
    for (const w of allWindows) {
      let segs = [{ start: w.start, end: w.end }];
      for (const o of occupied) {
        segs = segs.flatMap((sg) =>
          o.end <= sg.start || o.start >= sg.end
            ? [sg]
            : [
                ...(o.start > sg.start ? [{ start: sg.start, end: o.start }] : []),
                ...(o.end < sg.end ? [{ start: o.end, end: sg.end }] : []),
              ],
        );
      }
      out.push(...segs);
    }
    return out.sort((a, b) => a.start - b.start);
  };
  const placeAt = (task: (typeof tasks)[number], need: number, start: number) => {
    const { tier: _tier, ...slot } = task;
    slots.push({ ...slot, id: uid(), start: fromMin(start), end: fromMin(start + need), minutes: need });
    used += need;
    occupied.push({ start, end: start + need });
  };

  // Deneme, gerçek sınav gibi BİTİŞİK blok kaplar. Kendisini tutan en büyük
  // pencereye bütün yerleşir; hiçbir pencere yetmezse kırpılmaz, düşer.
  for (const task of tasks.filter((t) => t.kind === "Deneme")) {
    const need = task.minutes;
    let idx = -1;
    for (let i = 0; i < allWindows.length; i++) {
      if (allWindows[i].end - allWindows[i].start < need) continue;
      if (idx < 0 || allWindows[i].end - allWindows[i].start > allWindows[idx].end - allWindows[idx].start) idx = i;
    }
    if (idx < 0) continue;
    placeAt(task, need, allWindows[idx].start);
  }

  // Diğer görevler öncelik sırasına göre yerleşir; her biri kendi TAM süresiyle
  // sığan en erken boş aralığa konur. Sonra ders bloğu olarak yeniden sıralanır.
  const rest = tasks.filter((t) => t.kind !== "Deneme");
  for (const task of rest) {
    const need = task.minutes;
    if (used + need > budget) break;
    const ranges = freeRanges();
    let placed = false;
    for (const r of ranges) {
      if (r.end - r.start < need) continue;
      placeAt(task, need, r.start);
      placed = true;
      break;
    }
    if (!placed) continue;
  }
  // Ders geçişlerini azalt: yerleşen görevleri DERS BLOĞU olarak yeniden sırala.
  //
  // YALNIZCA içerik sırası değişir; hangi görevlerin yerleştiği ve her görevin
  // ÖZGÜN `minutes` değeri DEĞİŞMEZ. Zaman aralıkları, görevlerin kendi
  // süreleriyle (sabit boyutlu kutular) ders blokları hâlinde yeniden dağıtılır:
  // bir dersin görevleri ardışık kutulara yerleşir. Böylece ders geçişi azalırken
  // 40 dk'lık görev 40, 55 dk'lık görev 55 dk kalır ve start/end kendi süresiyle
  // tutarlı olur. Deneme bitişik bloğu ve rutin görevler (Paragraf/Problemler)
  // dokunulmadan başta korunur.
  {
    const isMock = (s: PlanSlot) => s.kind === "Deneme";
    const isRoutine = (s: PlanSlot) =>
      !s.exam || s.topic === "Paragraf" || s.topic === "Problemler";
    const mocks = slots.filter(isMock);
    const movable = slots.filter((s) => !isMock(s));
    const routines = movable.filter(isRoutine);
    const groups = new Map<string, PlanSlot[]>();
    for (const s of movable) {
      if (isRoutine(s)) continue;
      const k = `${s.exam}|${s.subject}`;
      const list = groups.get(k);
      if (list) list.push(s);
      else groups.set(k, [s]);
    }
    const ordered = [...groups.values()].flat();
    // Zaman kutuları: taşınamayan görevler (deneme + rutin) sabit kalır; diğer
    // görevler kendi süreleriyle bu boş kutulara sırayla oturur.
    const fixed = [...mocks, ...routines].sort((a, b) => a.start.localeCompare(b.start));
    const allRanges = freeWindows(settings, weekday);
    const occupiedFixed = fixed.map((s) => ({ start: toMin(s.start), end: toMin(s.end) }));
    const freeBoxes: { start: number; end: number }[] = [];
    for (const w of allRanges) {
      let segs = [{ start: w.start, end: w.end }];
      for (const o of occupiedFixed) {
        segs = segs.flatMap((sg) =>
          o.end <= sg.start || o.start >= sg.end
            ? [sg]
            : [
                ...(o.start > sg.start ? [{ start: sg.start, end: o.start }] : []),
                ...(o.end < sg.end ? [{ start: o.end, end: sg.end }] : []),
              ],
        );
      }
      freeBoxes.push(...segs);
    }
    freeBoxes.sort((a, b) => a.start - b.start);
    let bi = 0;
    for (const s of ordered) {
      const need = s.minutes;
      while (bi < freeBoxes.length && freeBoxes[bi].end - freeBoxes[bi].start < need) bi += 1;
      if (bi >= freeBoxes.length) break;
      const start = freeBoxes[bi].start;
      s.start = fromMin(start);
      s.end = fromMin(start + need);
      s.minutes = need;
      freeBoxes[bi] = { start: start + need, end: freeBoxes[bi].end };
    }
    slots.length = 0;
    slots.push(...[...fixed, ...ordered].sort((a, b) => a.start.localeCompare(b.start)));
  }
  return { slots, life, analyzedWrongIds, branchMockSubject };
}

export function buildWeekGrid(
  topics: TopicRow[],
  daily: DailyRow[],
  wrongs: WrongRow[],
  tytExams: TytExam[],
  aytExams: AytExam[],
  settings: ScheduleSettings,
  carry: CarryItem[],
  today = todayISO(),
) {
  const pace = planPace(topics, settings, today);
  // Hafta ızgarası: konu anlatımı tekrarını engellemek için anlatılmış konular
  // okunur; geçmişi yeniden oynatmaya gerek yok (bkz. `taughtTopics`).
  const used = taughtTopics(topics, daily);
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDaysISO(pace.from, i);
    const weekday = new Date(date + "T12:00:00").getDay();
    const { slots } = buildDailyPlan(topics, daily, wrongs, tytExams, aytExams, settings, carry, date, used);
    for (const sl of slots) {
      if (sl.kind === "Konu anlatımı") used.add(`${sl.exam}|${sl.subject}|${sl.topic}`);
    }
    return {
      date,
      weekday,
      light: weekday === 0,
      today: date === today,
      startDay: date === pace.start,
      slots: slots.slice(0, 4),
    };
  });
}

export function weeklyBlueprint(
  topics: TopicRow[],
  daily: DailyRow[],
  wrongs: WrongRow[],
  settings: ScheduleSettings,
  today = todayISO(),
) {
  const ranked = rankTopics(topics, daily, wrongs, today).slice(0, 10);
  const reviews = dueReviews(topics, daily, today);
  const weekFrom = addDaysISO(today, -6);
  const week = dailyTotals(daily, weekFrom, today);
  const aggs = topicAggregates(topics);
  const weakest = [...aggs].filter((a) => a.total >= 8 && a.success != null).sort((a, b) => (a.success ?? 1) - (b.success ?? 1))[0];
  const finishedThisWeek = topics.filter((t) => t.status === "Bitti" && t.lastStudy && t.lastStudy >= weekFrom).length;
  const overdue = reviews.filter((r) => r.due < today).length;
  const hours = Math.floor(week.minutes / 60);
  const mins = week.minutes % 60;
  return {
    focus: ranked.slice(0, 5),
    reviews,
    week,
    weakest,
    finishedThisWeek,
    overdue,
    hoursLabel: `${hours} saat ${mins} dakika`,
    weeklyTargetHours: settings.weeklyHours,
    nextWeekExtra: ranked[0] ? `${ranked[0].exam} ${ranked[0].subject} — ${ranked[0].topic}` : null,
  };
}

export function rareTopics() {
  return DISTRIBUTION.filter((r) => frequencyTier(r) === "dusuk");
}
