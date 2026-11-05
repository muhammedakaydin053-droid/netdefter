import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useAppStore } from "@/lib/store";
import { topicAggregates } from "@/lib/stats";
import { formatNet, formatPct } from "@/lib/utils";

export const Route = createFileRoute("/istatistikler")({ component: IstatistikPage });

function IstatistikPage() {
  const topics = useAppStore((s) => s.topics);
  const [exam, setExam] = useState<"Hepsi" | "TYT" | "AYT">("Hepsi");
  const aggs = useMemo(() => {
    return topicAggregates(topics).filter((r) => (exam === "Hepsi" ? true : r.exam === exam));
  }, [topics, exam]);
  const weak = [...aggs]
    .filter((r) => r.total >= 10 && r.success != null)
    .sort((a, b) => (a.success ?? 1) - (b.success ?? 1))
    .slice(0, 12);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted">Sayfa 6</p>
          <h1 className="mt-1 text-3xl font-semibold">Soru istatistikleri</h1>
          <p className="mt-2 text-sm text-muted">Alt konular, ana konu başlığında toplanır.</p>
        </div>
        <select className="h-10 rounded-[var(--radius-sm)] border border-border bg-surface px-3 text-sm" value={exam} onChange={(e) => setExam(e.target.value as typeof exam)}>
          <option>Hepsi</option>
          <option>TYT</option>
          <option>AYT</option>
        </select>
      </div>

      <section className="overflow-hidden rounded-[var(--radius-xl)] border border-border bg-surface">
        <div className="bg-bad px-4 py-2.5 font-display text-lg font-semibold text-primary-fg">
          En düşük başarı · en az 10 soru
        </div>
        {weak.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted">Henüz 10 soru çözülmüş konu yok.</p>
        ) : (
          <ol className="divide-y divide-border">
            {weak.map((r, i) => (
              <li key={`${r.exam}-${r.subject}-${r.topic}`} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                <span className="w-6 tabular-nums text-muted">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-muted">{r.exam} · {r.subject}</div>
                  <div className="font-medium">{r.topic}</div>
                </div>
                <div className="text-sm tabular-nums text-muted">{r.total} soru</div>
                <div className="font-medium tabular-nums">{formatPct(r.success)}</div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-border bg-surface">
        <table className="min-w-[800px] w-full text-sm">
          <thead className="bg-ink text-primary-fg text-xs">
            <tr>
              {["Sınav", "Ders", "Konu", "Soru", "Doğru", "Yanlış", "Boş", "Net", "Başarı"].map((h) => (
                <th key={h} className="px-3 py-2.5 text-left font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {aggs.map((r) => (
              <tr key={`${r.exam}-${r.subject}-${r.topic}`} className="border-t border-border odd:bg-bg-elevated">
                <td className="px-3 py-2 text-muted">{r.exam}</td>
                <td className="px-3 py-2">{r.subject}</td>
                <td className="px-3 py-2 font-medium">{r.topic}</td>
                <td className="px-3 py-2 tabular-nums">{r.total || "—"}</td>
                <td className="px-3 py-2 tabular-nums">{r.total ? r.correct : "—"}</td>
                <td className="px-3 py-2 tabular-nums">{r.total ? r.wrong : "—"}</td>
                <td className="px-3 py-2 tabular-nums">{r.total ? r.blank : "—"}</td>
                <td className="px-3 py-2 tabular-nums">{r.total ? formatNet(r.net) : "—"}</td>
                <td className="px-3 py-2 tabular-nums">{formatPct(r.success)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
