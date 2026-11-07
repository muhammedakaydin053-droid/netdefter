import { frequencyScore, frequencyTier, DISTRIBUTION } from "@/data/distribution";
import { aytMockReady, aytUnlocks, isGaranti, tytMockReady } from "@/data/roadmap";
import { buildTimeline, isCoreTopic, isOngoingTopic, orderAllowed, orderBoost, phaseFor } from "@/data/sequence";
import { countsIssue, n, pctOf, sanitizeCounts } from "@/lib/calc";
import { MIN_QUESTIONS_FOR_MASTERED } from "@/lib/smart/progress";
import { splitBudget, capacity, dailyCapacity, type DayLoad } from "@/lib/smart/budget";
import { topicAggregates, aytNets, tytNets, dailyTotals } from "@/lib/stats";
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

const planningNested = { on: false };

function avoidEarlierThisWeek(
  topics: TopicRow[],
  daily: DailyRow[],
  wrongs: WrongRow[],
  tytExams: TytExam[],
  aytExams: AytExam[],
  settings: ScheduleSettings,
  carry: CarryItem[],
  today: string,
) {
  if (planningNested.on) return new Set<string>();
  const start = settings.programStart || today;
  if (today <= start) return new Set<string>();
  const used = new Set<string>();
  planningNested.on = true;
  try {
    for (let date = start; date < today; date = addDaysISO(date, 1)) {
      const { slots } = buildDailyPlan(topics, daily, wrongs, tytExams, aytExams, settings, carry, date, used);
      for (const sl of slots) {
        if (sl.kind === "Konu anlatımı") used.add(`${sl.exam}|${sl.subject}|${sl.topic}`);
      }
    }
  } finally {
    planningNested.on = false;
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
): { slots: PlanSlot[]; life: PlanSlot[] } {
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
    return { slots: [], life: lifeOnly };
  }
  const avoid =
    avoidExternal ??
    avoidEarlierThisWeek(topics, daily, wrongs, tytExams, aytExams, settings, carry, today);
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
  if (mockDay) {
    const tytReady = tytMockReady(topics, tytExams);
    const aytReady = aytMockReady(topics, tytExams, aytExams);
    const lastAyt = [...aytExams].filter((e) => e.date).sort((a, b) => a.date.localeCompare(b.date)).at(-1);
    const lastTyt = [...tytExams].filter((e) => e.date).sort((a, b) => a.date.localeCompare(b.date)).at(-1);
    const aytDue = !lastAyt || daysBetween(lastAyt.date, today) >= 14;
    const tytDue = !lastTyt || daysBetween(lastTyt.date, today) >= (phase.mockIntensity >= 2 ? 4 : 7);
    if (aytReady && aytDue) {
      tasks.push({
        exam: "AYT",
        subject: "Deneme",
        topic: "AYT sayısal denemesi",
        kind: "Deneme",
        targetQ: 80,
        minutes: 180,
        priority: "yüksek",
        reason: `Son TYT net ≥ 70 ve AYT kapısı açık. ${phase.title} fazı, 14 günde bir.`,
      });
      budget = Math.max(budget, 210);
    } else if (tytReady && tytDue) {
      tasks.push({
        exam: "TYT",
        subject: "Deneme",
        topic: "TYT denemesi",
        kind: "Deneme",
        targetQ: 120,
        minutes: 165,
        priority: "yüksek",
        reason:
          phase.mockIntensity >= 2
            ? `${phase.title} fazı: deneme sıklığı arttı, haftada iki.`
            : "Çekirdek matematiğin ~%40’ı bitti veya deneme kaydı var.",
      });
      budget = Math.max(budget, 210);
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

  const recentWrong = wrongs.filter((w) => daysBetween(w.date, today) <= 5);
  if (recentWrong.length >= 3) {
    tasks.push({
      exam: (recentWrong[0].exam || "TYT") as "TYT" | "AYT",
      subject: recentWrong[0].subject || "Karışık",
      topic: "Yanlış analizi",
      kind: "Yanlış analizi",
      targetQ: Math.min(12, recentWrong.length),
      minutes: 40,
      priority: "orta",
      reason: `Son 5 günde ${recentWrong.length} yanlış kaydı`,
    });
    fixedMinutes += 40;
  }

  // Yerleştirme sırası önemli: görevler listedeki sırayla saat dilimlerine
  // oturur ve bütçe bitince kalanlar düşer. Bu yüzden sıra:
  //   1) yeni konu anlatımı (programın ilerlemesi buna bağlı)
  //   2) tekrar (bütçede kalan pay kadar)
  //   3) başlanmış konuların soru çözümü
  // Yeni konu en sona bırakılırsa sabit görevler bütçeyi doldurup program durur.
  const split = splitBudget(budget, pace.perDay, fixedMinutes, {
    sunday,
    // Tekrarların pratiği açlığa itmemesi için pratiğe slot ayrılır. Her konu
    // 1 anlatım + 1 soru çözümü tükettiğinden, TYT bittikten sonra AYT'nin
    // tıkanmaması için pratik payı artırılır.
    practiceSlots: sunday ? 0 : Math.max(1, Math.min(2, pace.perDay - 1)),
  });
  const used2 = new Set<string>();
  // İlerleme kapısı (sert sıra) için "hazır" küme. Kullanıcı kuralı: aynı derste
  // önceki konunun TEMEL SORU ÇÖZÜMÜ bitmeden sonraki yeni konuya geçilmez.
  //
  // ÖNEMLİ: Kapı "Öğrenildi" (15 soru + %70) DEĞİL, "temel soru çözümü yapıldı"
  // (>= 15 soru) seviyesidir. Önceden yalnızca status === "Bitti" kabul ediliyordu;
  // "Bitti" ise %70 başarı şartına bağlı. Başarısı kalıcı olarak %70 altında kalan
  // bir öğrencide hiçbir konu "Bitti" olamıyor, dolayısıyla her dersin yalnızca
  // ilk konusu açılıp program 10. günde tamamen kilitleniyordu (ölçüm: 186 konudan
  // 10'u başlıyor, 0'ı bitiyor). %70 eşiği "Öğrenildi" etiketi için KORUNUR
  // (`progress.ts`); yalnızca sıradaki konuya geçiş kapısı pratik tamamlanmasına
  // bağlanır. Yeterli pratiği olup %70'e ulaşamayan konu "Bitti" sayılmaz ve
  // eksik kapatma rotasyonunda (3. geçiş) çalışmaya devam eder.
  const progressionReady = new Set<string>(
    topics
      .filter((t) => t.status === "Bitti" || (t.total ?? 0) >= MIN_QUESTIONS_FOR_MASTERED)
      .map((t) => `${t.exam}|${t.subject}|${t.topic}`),
  );
  // Eksik kapatma rotasyonu: takılı bir konu için sırayla uygulanan görev
  // türleri. Aynı görevi (ör. her gün 18 soru) tekrar üretmek yerine konu
  // anlatımı → tekrar → anlatıma dönüş → yanlış analizi döner. Deneme sayısı
  // çözülen soru miktarından (total/15) tahmin edilir; her oturum >=15 soru ekler.
  const RECOVERY_KINDS: PlanSlot["kind"][] = ["Soru çözümü", "Tekrar", "Konu anlatımı", "Yanlış analizi"];
  const RECOVERY_TARGET: Record<string, number> = { "Soru çözümü": 18, Tekrar: 15, "Konu anlatımı": 0, "Yanlış analizi": 12 };
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
  for (const subject of aytBySubject.keys()) {
    const rows = topics.filter((t) => t.exam === "AYT" && t.subject === subject);
    progressOf.set(subject, rows.length ? rows.filter((t) => t.status !== "Başlamadım").length / rows.length : 1);
  }
  const orderedSubjects = [...aytBySubject.keys()].sort(
    (a, b) => (progressOf.get(a) ?? 0) - (progressOf.get(b) ?? 0),
  );
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
    if (newCount >= pace.perDay) break;
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
    tasks.push({
      exam: r.exam,
      subject: r.subject,
      topic: r.topic,
      kind: "Tekrar",
      targetQ: r.suggestedQ,
      minutes: mins,
      priority: r.health === "kritik" ? "yüksek" : "orta",
      reason: r.reason,
      tier: 2,
    });
    reviewMinutes += mins;
  }

  // 3. geçiş: başlanmış ama HENÜZ öğrenilmemiş konuların eksik kapatma işleri.
  //
  // Öğrenilmemiş konu "Bitti" sayılmaz (15 soru + %70 korunur). Bu konular için
  // her gün AYNI 18 soruluk görevi üretmek yerine görev türü rotasyona bağlanır:
  // tur sayısı (çözülen soru / 15) arttıkça sıradaki tür seçilir, böylece
  // soru çözümü → tekrar → anlatıma dönüş → yanlış analizi döner. Yalnızca
  // başarısı %70'in altında kalan konular bu geçişe girer; "iyi" konular girmez.
  const recoveryRows = interleaveBySubject(
    startedRows
      .filter((r) => (r.total ?? 0) > 0 && r.success != null && r.success < 0.7)
      .sort((a, b) => (a.success ?? 0) - (b.success ?? 0)),
  );
  for (const r of recoveryRows) {
    const attempts = Math.floor((r.total ?? 0) / 15);
    const kind = RECOVERY_KINDS[attempts % RECOVERY_KINDS.length];
    const st = struggleOf(r.exam, r.subject, r.topic);
    const detail = st ? ` Alt konu: ${st.subtopic || "-"}, hata: ${st.reason || "-"}` : "";
    addTask(r, kind, {
      targetQ: RECOVERY_TARGET[kind],
      minutes: kind === "Konu anlatımı" ? 55 : kind === "Yanlış analizi" ? 40 : 55,
      reason: `${attempts + 1}. eksik kapatma turu: ${kind} (başarı %${Math.round((r.success ?? 0) * 100)}).${detail}`,
      tier: 3,
    });
  }

  const windows = freeWindows(settings, weekday);
  let used = 0;
  let ti = 0;
  for (const w of windows) {
    let cursor = w.start;
    while (cursor + 40 <= w.end && ti < tasks.length && used < budget) {
      const task = tasks[ti];
      const dur = Math.min(task.minutes, w.end - cursor, budget - used);
      if (dur < 35) break;
      const { tier: _tier, ...slot } = task;
      slots.push({
        ...slot,
        id: uid(),
        start: fromMin(cursor),
        end: fromMin(cursor + dur),
        minutes: dur,
      });
      used += dur;
      cursor += dur + 10;
      ti += 1;
    }
  }
  // Ders geçişlerini azalt: yerleşen görevleri DERS BLOĞU olarak yeniden sırala.
  //
  // Görevler yukarıda öncelik sırasına göre yerleştirilir; bu yüzden aynı gün
  // aynı dersin anlatım/pratik/tekrar işleri gün boyunca dağılıyor ve sürekli
  // ders değişiyordu (ölçüm: gün başına ortalama 2,9 geçiş, en kötü 6). Burada
  // YALNIZCA içerik sırası değişir: hangi görevlerin yerleştiği (dolayısıyla
  // bütçe/kesme davranışı) aynı kalır. Zaman pencereleri korunur; içerik sırası
  // değişince start/end dakikaları da pencerelere göre yeniden atanır, böylece
  // program kesintisiz ve zaman sıralı kalır (ölçüm: ortalama 2,0 geçiş, en kötü 4).
  // Rutin görevler (Paragraf/Problemler) günün başında korunur.
  {
    const isRoutine = (s: PlanSlot) =>
      !s.exam || s.topic === "Paragraf" || s.topic === "Problemler";
    const routines = slots.filter(isRoutine);
    const groups = new Map<string, PlanSlot[]>();
    for (const s of slots) {
      if (isRoutine(s)) continue;
      const k = `${s.exam}|${s.subject}`;
      const list = groups.get(k);
      if (list) list.push(s);
      else groups.set(k, [s]);
    }
    const ordered = [...routines, ...[...groups.values()].flat()];
    const windowsList = slots.map((s) => ({ start: s.start, end: s.end, minutes: s.minutes }));
    ordered.forEach((s, i) => {
      s.start = windowsList[i].start;
      s.end = windowsList[i].end;
      s.minutes = windowsList[i].minutes;
    });
    slots.length = 0;
    slots.push(...ordered);
  }
  return { slots, life };
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
  const used = new Set<string>();
  if (pace.start < pace.from) {
    planningNested.on = true;
    try {
      for (let date = pace.start; date < pace.from; date = addDaysISO(date, 1)) {
        const { slots } = buildDailyPlan(topics, daily, wrongs, tytExams, aytExams, settings, carry, date, used);
        for (const sl of slots) {
          if (sl.kind === "Konu anlatımı") used.add(`${sl.exam}|${sl.subject}|${sl.topic}`);
        }
      }
    } finally {
      planningNested.on = false;
    }
  }
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
