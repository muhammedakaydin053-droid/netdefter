import { blankOf, netOf, n, pctOf, sanitizeCounts } from "@/lib/calc";
import type { TopicRow, TytExam, AytExam, DailyRow, Status } from "@/lib/types";
import { AYT_SUBJECTS, TYT_SUBJECTS } from "@/lib/types";

/** Tek satırın ham soru sayılarını güvenli aralığa indirger. */
function safeCounts(t: Pick<TopicRow, "total" | "correct" | "wrong">) {
  return sanitizeCounts(t.total, t.correct, t.wrong);
}

export function topicDerived(t: TopicRow) {
  const { total, correct, wrong } = safeCounts(t);
  const blank = blankOf(total, correct, wrong);
  const net = total == null ? null : netOf(correct, wrong);
  const pct = pctOf(correct, total);
  return { blank, net, pct };
}

export function examBlock(topics: TopicRow[], exam: "TYT" | "AYT") {
  const rows = topics.filter((t) => t.exam === exam);
  const count = (s: Status) => rows.filter((t) => t.status === s).length;
  const safe = rows.map(safeCounts);
  const totalQ = safe.reduce((a, c) => a + n(c.total), 0);
  const correct = safe.reduce((a, c) => a + n(c.correct), 0);
  const wrong = safe.reduce((a, c) => a + n(c.wrong), 0);
  const blank = safe.reduce((a, c) => a + (blankOf(c.total, c.correct, c.wrong) ?? 0), 0);
  const net = safe.reduce((a, c) => a + (c.total == null ? 0 : n(netOf(c.correct, c.wrong))), 0);
  const done = count("Bitti");
  return {
    total: rows.length,
    done,
    studying: count("Çalışıyorum"),
    notStarted: count("Başlamadım"),
    review: count("Tekrar Gerekli"),
    progress: rows.length ? done / rows.length : 0,
    totalQ,
    correct,
    wrong,
    blank,
    net,
    success: totalQ ? Math.min(1, correct / totalQ) : null,
  };
}

export function subjectProgress(topics: TopicRow[]) {
  const list: { exam: "TYT" | "AYT"; subject: string; total: number; done: number; progress: number; success: number | null }[] = [];
  const push = (exam: "TYT" | "AYT", subjects: readonly string[]) => {
    for (const subject of subjects) {
      const rows = topics.filter((t) => t.exam === exam && t.subject === subject);
      const done = rows.filter((t) => t.status === "Bitti").length;
      const safe = rows.map(safeCounts);
      const totalQ = safe.reduce((a, c) => a + n(c.total), 0);
      const correct = safe.reduce((a, c) => a + n(c.correct), 0);
      list.push({
        exam,
        subject,
        total: rows.length,
        done,
        progress: rows.length ? done / rows.length : 0,
        success: totalQ ? Math.min(1, correct / totalQ) : null,
      });
    }
  };
  push("TYT", TYT_SUBJECTS);
  push("AYT", AYT_SUBJECTS);
  return list;
}

export function topicAggregates(topics: TopicRow[]) {
  const map = new Map<
    string,
    { exam: "TYT" | "AYT"; subject: string; topic: string; total: number; correct: number; wrong: number }
  >();
  for (const t of topics) {
    const c = safeCounts(t);
    const key = `${t.exam}|${t.subject}|${t.topic}`;
    const cur = map.get(key) ?? { exam: t.exam, subject: t.subject, topic: t.topic, total: 0, correct: 0, wrong: 0 };
    cur.total += n(c.total);
    cur.correct += n(c.correct);
    cur.wrong += n(c.wrong);
    map.set(key, cur);
  }
  return [...map.values()].map((r) => ({
    ...r,
    blank: r.total ? Math.max(0, r.total - r.correct - r.wrong) : 0,
    net: r.total ? Math.max(0, r.correct - r.wrong / 4) : 0,
    success: r.total ? Math.min(1, r.correct / r.total) : null,
  }));
}

export function tytNets(e: TytExam) {
  const tur = e.turD == null && e.turY == null ? null : netOf(e.turD, e.turY);
  const mat = e.matD == null && e.matY == null ? null : netOf(e.matD, e.matY);
  const sos = e.sosD == null && e.sosY == null ? null : netOf(e.sosD, e.sosY);
  const fen = e.fenD == null && e.fenY == null ? null : netOf(e.fenD, e.fenY);
  const total =
    tur == null && mat == null && sos == null && fen == null
      ? null
      : n(tur) + n(mat) + n(sos) + n(fen);
  return { tur, mat, sos, fen, total };
}

export function aytNets(e: AytExam) {
  const mat = e.matD == null && e.matY == null ? null : netOf(e.matD, e.matY);
  const fiz = e.fizD == null && e.fizY == null ? null : netOf(e.fizD, e.fizY);
  const kim = e.kimD == null && e.kimY == null ? null : netOf(e.kimD, e.kimY);
  const bio = e.bioD == null && e.bioY == null ? null : netOf(e.bioD, e.bioY);
  const total =
    mat == null && fiz == null && kim == null && bio == null
      ? null
      : n(mat) + n(fiz) + n(kim) + n(bio);
  return { mat, fiz, kim, bio, total };
}

export function dailyTotals(rows: DailyRow[], fromISO: string, toISO: string) {
  const slice = rows.filter((r) => r.date >= fromISO && r.date <= toISO);
  return {
    minutes: slice.reduce((a, r) => a + n(r.minutes), 0),
    questions: slice.reduce((a, r) => a + n(r.questions), 0),
    net: slice.reduce((a, r) => a + n(netOf(r.correct, r.wrong)), 0),
    count: slice.length,
  };
}
