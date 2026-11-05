import { createFileRoute, Link } from "@tanstack/react-router";
import { HealthBadge, StatusBadge } from "@/components/ui/badge";
import { useAppStore } from "@/lib/store";
import { addDaysISO, formatDate, todayISO } from "@/lib/utils";
import type { TopicRow } from "@/lib/types";
import { dueReviews } from "@/lib/smart/engine";

export const Route = createFileRoute("/tekrarlar")({ component: TekrarlarPage });

function TekrarlarPage() {
  const topics = useAppStore((s) => s.topics);
  const daily = useAppStore((s) => s.daily);
  const today = todayISO();
  const week = addDaysISO(today, 7);
  const smart = dueReviews(topics, daily, today);

  const withDate = topics.filter((t) => t.reviewDate);
  const todayRows = withDate.filter((t) => t.reviewDate === today);
  const overdue = withDate.filter((t) => t.reviewDate < today && t.status !== "Bitti");
  const upcoming = withDate.filter((t) => t.reviewDate > today && t.reviewDate <= week);
  const done = withDate.filter((t) => t.status === "Bitti");

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted">Sayfa 5</p>
        <h1 className="mt-1 text-3xl font-semibold">Tekrar takibi</h1>
        <p className="mt-2 text-sm text-muted">
          Bugün: <span className="font-medium text-fg tabular-nums">{formatDate(today)}</span>. Tarih, Konu Takibi’ndeki tekrar sütunundan gelir. Akıllı öneriler performansa göre aralığı kaydırır.
        </p>
      </div>

      {smart.length > 0 && (
        <section className="rounded-[var(--radius-xl)] border border-border bg-surface p-4">
          <h2 className="font-semibold">Akıllı tekrar önerisi</h2>
          <ul className="mt-2 space-y-2">
            {smart.map((r) => (
              <li key={`${r.exam}-${r.topic}`} className="flex flex-wrap items-center gap-2 text-sm">
                <HealthBadge health={r.health} />
                <span>{r.exam} {r.subject} — {r.topic}</span>
                <span className="text-xs text-muted">{r.reason}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Section title="Bugün tekrar edilecekler" tone="teal" rows={todayRows} empty="Bugün tekrar yok." />
      <Section title="Gecikmiş tekrarlar" tone="bad" rows={overdue} empty="Gecikmiş tekrar yok." />
      <Section title="Önümüzdeki 7 gün" tone="warn" rows={upcoming} empty="Önümüzdeki 7 günde tekrar yok." />
      <Section title="Tamamlanan tekrarlar" tone="ok" rows={done} empty="Tamamlanan tekrar yok." />
    </div>
  );
}

function Section({
  title,
  rows,
  empty,
  tone,
}: {
  title: string;
  rows: TopicRow[];
  empty: string;
  tone: "teal" | "bad" | "warn" | "ok";
}) {
  const cls =
    tone === "teal"
      ? "bg-primary text-primary-fg"
      : tone === "bad"
        ? "bg-bad text-primary-fg"
        : tone === "warn"
          ? "bg-warn text-primary-fg"
          : "bg-ok text-primary-fg";
  return (
    <section className="overflow-hidden rounded-[var(--radius-xl)] border border-border bg-surface">
      <div className={`flex items-center justify-between px-4 py-2.5 ${cls}`}>
        <h2 className="font-display text-lg font-semibold">{title}</h2>
        <span className="text-sm tabular-nums">{rows.length}</span>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted">
          {empty}{" "}
          <Link to="/konular" className="text-primary underline">
            Konu takibine git
          </Link>
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="text-xs text-muted">
                  {t.exam} · {t.subject}
                </div>
                <div className="font-medium">
                  {t.topic}
                  <span className="font-normal text-muted"> — {t.subtopic}</span>
                </div>
              </div>
              <StatusBadge status={t.status} />
              <div className="text-xs tabular-nums text-muted">
                Tekrar {formatDate(t.reviewDate)}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
