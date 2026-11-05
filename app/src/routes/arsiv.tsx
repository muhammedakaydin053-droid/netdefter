import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Archive } from "lucide-react";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/badge";
import { useAppStore } from "@/lib/store";
import { topicDerived } from "@/lib/stats";
import { formatDate, formatNet, formatPct } from "@/lib/utils";
import { AYT_SUBJECTS, TYT_SUBJECTS, STATUSES, type Status } from "@/lib/types";

export const Route = createFileRoute("/arsiv")({ component: ArsivPage });

/**
 * Arşiv ekranı — yalnızca görüntüleme.
 *
 * Kayıtlar tek kaynaktan, `archivedTopics` alanından okunur; aktif `topics`
 * listesine veya planlama motoruna dokunulmaz. Burada hiçbir yazma işlemi
 * yoktur, dolayısıyla kullanıcı bir şey yapmadıkça arşiv değişmez.
 */
function ArsivPage() {
  const archivedTopics = useAppStore((s) => s.archivedTopics);
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
    return archivedTopics.filter((t) => {
      if (exam !== "Hepsi" && t.exam !== exam) return false;
      if (subject !== "Hepsi" && t.subject !== subject) return false;
      if (status !== "Hepsi" && t.status !== status) return false;
      if (!query) return true;
      return `${t.topic} ${t.subtopic} ${t.subject} ${t.note}`.toLocaleLowerCase("tr").includes(query);
    });
  }, [archivedTopics, exam, subject, status, q]);

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted">Arşiv</p>
        <h1 className="mt-1 text-3xl font-semibold">Arşivlenen konular</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Müfredattan kaldırılan konulara ait çalışma geçmişin burada saklanır. Konu aynı kimlikle
          müfredata geri dönerse kayıtların otomatik olarak aktif listeye taşınır. Bu ekran yalnızca
          görüntüleme içindir.
        </p>
      </div>

      {archivedTopics.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-8 text-center shadow-[var(--shadow-soft)]">
          <span className="mx-auto grid size-12 place-items-center rounded-full bg-bg-elevated text-muted">
            <Archive className="size-6" strokeWidth={1.8} />
          </span>
          <h2 className="mt-3 font-display text-lg font-semibold">Arşiv boş</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted">
            Müfredattan çıkarılan bir konunun kayıtlı verisi olduğunda burada listelenir. Şu an arşivde
            konu yok.
          </p>
          <Link
            to="/konular"
            className="mt-4 inline-flex h-10 items-center gap-2 rounded-[var(--radius-sm)] bg-primary px-4 text-sm font-medium text-primary-fg hover:opacity-90"
          >
            Konu takibine git
          </Link>
        </div>
      ) : (
        <>
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
            <table className="min-w-[1000px] w-full text-left text-sm">
              <thead className="bg-ink text-primary-fg">
                <tr className="text-xs">
                  {["Sınav", "Ders", "Konu", "Alt konu", "Durum", "Soru", "D", "Y", "Boş", "Net", "Başarı", "Son çalışma", "Tekrar", "Kaynak", "Not"].map((h) => (
                    <th key={h} className="px-2 py-2.5 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => {
                  const d = topicDerived(t);
                  return (
                    <tr key={t.id} className="border-t border-border odd:bg-bg-elevated">
                      <td className="px-2 py-1.5 text-xs text-muted">{t.exam}</td>
                      <td className="px-2 py-1.5">{t.subject}</td>
                      <td className="px-2 py-1.5 font-medium">{t.topic}</td>
                      <td className="px-2 py-1.5 text-muted">{t.subtopic}</td>
                      <td className="px-2 py-1.5">
                        <StatusBadge status={t.status} />
                      </td>
                      <td className="px-2 py-1.5 tabular-nums">{t.total ?? "—"}</td>
                      <td className="px-2 py-1.5 tabular-nums">{t.correct ?? "—"}</td>
                      <td className="px-2 py-1.5 tabular-nums">{t.wrong ?? "—"}</td>
                      <td className="px-2 py-1.5 tabular-nums text-muted">{d.blank ?? "—"}</td>
                      <td className="px-2 py-1.5 font-medium tabular-nums">{formatNet(d.net)}</td>
                      <td className="px-2 py-1.5 tabular-nums">{formatPct(d.pct)}</td>
                      <td className="px-2 py-1.5 tabular-nums text-muted">{formatDate(t.lastStudy)}</td>
                      <td className="px-2 py-1.5 tabular-nums text-muted">{formatDate(t.reviewDate)}</td>
                      <td className="px-2 py-1.5 text-muted">{t.source || "—"}</td>
                      <td className="max-w-[16rem] px-2 py-1.5 text-muted">
                        <span className="line-clamp-2" title={t.note}>
                          {t.note || "—"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-subtle">
            Arşiv kayıtları salt okunurdur; planlama ve istatistiklere dahil edilmez.
          </p>
        </>
      )}
    </div>
  );
}

const sel = "h-10 rounded-[var(--radius-sm)] border border-border bg-surface px-3 text-sm";
