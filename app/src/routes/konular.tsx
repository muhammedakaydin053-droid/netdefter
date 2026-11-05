import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Input, NumInput } from "@/components/ui/input";
import { HealthBadge, StatusBadge } from "@/components/ui/badge";
import { useAppStore } from "@/lib/store";
import { topicDerived } from "@/lib/stats";
import { countsIssue } from "@/lib/calc";
import { topicHealth } from "@/lib/smart/engine";
import { explainStage, learningStage, STAGE_LABEL } from "@/lib/smart/progress";
import { formatNet, formatPct, todayISO } from "@/lib/utils";
import { AYT_SUBJECTS, STATUSES, TYT_SUBJECTS, type Status } from "@/lib/types";

export const Route = createFileRoute("/konular")({ component: KonularPage });

function KonularPage() {
  const topics = useAppStore((s) => s.topics);
  const daily = useAppStore((s) => s.daily);
  const updateTopic = useAppStore((s) => s.updateTopic);
  const [exam, setExam] = useState<"Hepsi" | "TYT" | "AYT">("Hepsi");
  const [subject, setSubject] = useState("Hepsi");
  const [status, setStatus] = useState<"Hepsi" | Status>("Hepsi");
  const [q, setQ] = useState("");

  const subjects =
    exam === "AYT"
      ? AYT_SUBJECTS
      : exam === "TYT"
        ? TYT_SUBJECTS
        : [...TYT_SUBJECTS, ...AYT_SUBJECTS.filter((s) => !(TYT_SUBJECTS as readonly string[]).includes(s))];

  const rows = useMemo(() => {
    const query = q.trim().toLocaleLowerCase("tr");
    return topics.filter((t) => {
      if (exam !== "Hepsi" && t.exam !== exam) return false;
      if (subject !== "Hepsi" && t.subject !== subject) return false;
      if (status !== "Hepsi" && t.status !== status) return false;
      if (!query) return true;
      return `${t.topic} ${t.subtopic} ${t.subject}`.toLocaleLowerCase("tr").includes(query);
    });
  }, [topics, exam, subject, status, q]);

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted">Sayfa 2</p>
        <h1 className="mt-1 text-3xl font-semibold">Konu takibi</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          2026 MEB/ÖSYM müfredatı hazır. Sadece durum, soru sayıları ve tarihleri gir — net, boş ve başarı otomatik.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <select
          className={sel}
          value={exam}
          onChange={(e) => {
            setExam(e.target.value as typeof exam);
            setSubject("Hepsi");
          }}
        >
          <option>Hepsi</option>
          <option>TYT</option>
          <option>AYT</option>
        </select>
        <select className={sel} value={subject} onChange={(e) => setSubject(e.target.value)}>
          <option>Hepsi</option>
          {subjects.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select className={sel} value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          <option>Hepsi</option>
          {STATUSES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <Input className="max-w-xs" placeholder="Konu ara" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="self-center text-xs text-muted tabular-nums">{rows.length} satır</span>
      </div>

      <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-soft)]">
        <table className="min-w-[1100px] w-full text-left text-sm">
          <thead className="bg-ink text-primary-fg">
            <tr className="text-xs">
              {["Sınav", "Ders", "Konu", "Alt konu", "Durum", "Aşama", "Akıllı", "Soru", "D", "Y", "Boş", "Net", "Başarı", "Son çalışma", "Tekrar", "Kaynak"].map((h) => (
                <th key={h} className="px-2 py-2.5 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => {
              const d = topicDerived(t);
              const issue = countsIssue(t.total, t.correct, t.wrong);
              // "Öğrenildi" bir konu yine de tekrar isteyebilir; bu bilgi ayrı
              // gösterilir ki öğrenme aşaması ile karışmasın.
              const repeatDue = !!t.reviewDate && t.reviewDate <= todayISO();
              return (
                <tr key={t.id} className="border-t border-border odd:bg-bg-elevated">
                  <td className="px-2 py-1.5 text-xs text-muted">{t.exam}</td>
                  <td className="px-2 py-1.5">{t.subject}</td>
                  <td className="px-2 py-1.5 font-medium">{t.topic}</td>
                  <td className="px-2 py-1.5 text-muted">{t.subtopic}</td>
                  <td className="px-2 py-1.5">
                    <select
                      className="h-8 rounded-[var(--radius-xs)] border border-border bg-surface px-1 text-xs"
                      value={t.status}
                      onChange={(e) => updateTopic(t.id, { status: e.target.value as Status })}
                    >
                      {STATUSES.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                    <div className="mt-1">
                      <StatusBadge status={t.status} />
                    </div>
                  </td>
                  <td className="px-2 py-1.5 text-xs">
                    {(() => {
                      const stage = learningStage(t);
                      const ex = explainStage(t);
                      return (
                        <span
                          title={`${ex.summary}${ex.missing.length ? " — Eksik: " + ex.missing.join("; ") : ""}`}
                          className={
                            stage === "ogrenildi"
                              ? "font-medium text-emerald-600"
                              : stage === "tekrar-gerekli"
                                ? "text-amber-600"
                                : "text-muted"
                          }
                        >
                          {STAGE_LABEL[stage]}
                          {ex.invalid ? (
                            <span className="ml-1 text-red-600" title={ex.summary}>
                              ⚠ geçersiz veri
                            </span>
                          ) : ex.completed && ex.enoughSuccess && !ex.enoughQuestions ? (
                            <span className="ml-1 text-amber-600" title={ex.summary}>
                              (soru verisi yetersiz)
                            </span>
                          ) : null}
                          {repeatDue ? (
                            <span className="ml-1 text-sky-600" title="Tekrar tarihi geldi">
                              ↻ tekrar zamanı
                            </span>
                          ) : null}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="px-2 py-1.5">
                    <HealthBadge
                      health={topicHealth(
                        { total: t.total ?? 0, correct: t.correct ?? 0, wrong: t.wrong ?? 0, lastStudy: t.lastStudy, status: t.status, topic: t.topic },
                        daily,
                      )}
                    />
                  </td>
                  <td className="w-20 px-1 py-1.5">
                    <NumInput
                      value={t.total}
                      invalid={issue != null}
                      title={issue ?? undefined}
                      onChange={(v) => updateTopic(t.id, { total: v })}
                    />
                  </td>
                  <td className="w-16 px-1 py-1.5">
                    <NumInput
                      value={t.correct}
                      max={t.total ?? undefined}
                      invalid={issue != null}
                      title={issue ?? undefined}
                      onChange={(v) => updateTopic(t.id, { correct: v })}
                    />
                  </td>
                  <td className="w-16 px-1 py-1.5">
                    <NumInput
                      value={t.wrong}
                      max={t.total ?? undefined}
                      invalid={issue != null}
                      title={issue ?? undefined}
                      onChange={(v) => updateTopic(t.id, { wrong: v })}
                    />
                  </td>
                  <td className="px-2 py-1.5 tabular-nums text-muted">{d.blank ?? "—"}</td>
                  <td className="px-2 py-1.5 font-medium tabular-nums">{formatNet(d.net)}</td>
                  <td className="px-2 py-1.5 tabular-nums">{formatPct(d.pct)}</td>
                  <td className="px-1 py-1.5">
                    <input
                      type="date"
                      className={dateCls}
                      value={t.lastStudy}
                      onChange={(e) => updateTopic(t.id, { lastStudy: e.target.value })}
                    />
                  </td>
                  <td className="px-1 py-1.5">
                    <input
                      type="date"
                      className={dateCls}
                      value={t.reviewDate}
                      onChange={(e) => updateTopic(t.id, { reviewDate: e.target.value })}
                    />
                  </td>
                  <td className="px-1 py-1.5">
                    <input
                      className="h-8 w-28 rounded-[var(--radius-xs)] border border-border bg-surface px-2 text-xs"
                      value={t.source}
                      onChange={(e) => updateTopic(t.id, { source: e.target.value })}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-subtle">
        Net = Doğru − Yanlış / 4 · Boş = Toplam − Doğru − Yanlış · Başarı = Doğru / Toplam. Negatif sayı, toplamdan fazla doğru/yanlış
        ve toplam yokken doğru/yanlış kabul edilmez; başarı %100'ü aşmaz.
      </p>
    </div>
  );
}

const sel = "h-10 rounded-[var(--radius-sm)] border border-border bg-surface px-3 text-sm";
const dateCls = "h-8 rounded-[var(--radius-xs)] border border-border bg-surface px-1 text-xs";
