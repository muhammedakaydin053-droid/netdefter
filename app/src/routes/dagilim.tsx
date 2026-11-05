import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { consecutiveYears, DISTRIBUTION, DIST_SOURCE, DIST_YEARS, distStats, fiveYearStreak, frequencyTier } from "@/data/distribution";
import {
  guaranteedBySubject,
  hotnessScore,
  NOTION_CAVEAT,
  NOTION_SOURCES,
  streakBySubject,
  streakCount,
} from "@/data/guaranteed";
import { AYT_KIMYA_BIO_NOTE, GARANTI_AYT_TOPICS, isGaranti, SUBJECT_ORDER } from "@/data/roadmap";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/dagilim")({ component: DagilimPage });

const TIER_CLASS = {
  yuksek: "bg-bad-bg text-bad",
  orta: "bg-warn-bg text-warn",
  dusuk: "bg-ok-bg text-ok",
};
const TIER_LABEL = { yuksek: "Yüksek", orta: "Orta", dusuk: "Düşük" };

type View = "ozet" | "garanti" | "yillar";

const VIEWS: { id: View; label: string }[] = [
  { id: "ozet", label: "Özet" },
  { id: "garanti", label: "Garanti konular" },
  { id: "yillar", label: "Yıllara göre" },
];

function DagilimPage() {
  const [view, setView] = useState<View>("ozet");
  const [exam, setExam] = useState<"TYT" | "AYT">("TYT");

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted">YKS soru dağılımı</p>
        <h1 className="mt-1 text-3xl font-semibold">Ne çıkıyor, neye çalışmalı</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted">
          İki liste: her sene garanti gelen konular ve son 5 yıl üst üste sorulan konular. {NOTION_CAVEAT}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-[var(--radius-sm)] border border-border bg-surface p-0.5">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => setView(v.id)}
              className={`h-9 rounded-[var(--radius-xs)] px-3 text-sm transition-colors ${view === v.id ? "bg-primary text-primary-fg" : "text-muted hover:text-fg"}`}
            >
              {v.label}
            </button>
          ))}
        </div>
        {view !== "yillar" ? (
          <select
            className={sel}
            value={exam}
            onChange={(e) => setExam(e.target.value as "TYT" | "AYT")}
          >
            <option>TYT</option>
            <option>AYT</option>
          </select>
        ) : null}
      </div>

      {view === "ozet" && <Overview exam={exam} />}
      {view === "garanti" && <GuaranteedView exam={exam} />}
      {view === "yillar" && <YearsView />}

      <section className="rounded-[var(--radius-xl)] border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold">Kaynaklar</h2>
        <ul className="mt-2 space-y-1 text-sm text-muted">
          {NOTION_SOURCES.map((s) => (
            <li key={s.url}>
              <a className="underline decoration-dotted hover:text-fg" href={s.url} target="_blank" rel="noreferrer">
                {s.title}
              </a>{" "}
              — {s.note}
            </li>
          ))}
          <li>{DIST_SOURCE.title} — {DIST_SOURCE.publisher}.</li>
        </ul>
      </section>
    </div>
  );
}

/** Özet: tek bakışta "en çok soru gelen" ve "5 yıl üst üste" tabloları. */
function Overview({ exam }: { exam: "TYT" | "AYT" }) {
  const garanti = useMemo(() => guaranteedBySubject(exam), [exam]);
  const streak = useMemo(() => streakBySubject(exam), [exam]);

  return (
    <div className="space-y-6">
      <section className="rounded-[var(--radius-xl)] border border-border bg-surface p-4">
        <h2 className="font-semibold">Öncelik sırası</h2>
        <p className="mt-1 text-xs text-muted">
          Garanti listesi ve 5 yıl serisi birleştirildi. Programda ağırlık bu sırayla verilir.
        </p>
        <ol className="mt-3 grid gap-2 sm:grid-cols-2">
          {topPriority(exam).map((r, i) => (
            <li key={`${r.subject}-${r.topic}`} className="flex items-start gap-2 rounded-[var(--radius-md)] border border-border bg-bg-elevated px-3 py-2">
              <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-primary text-[10px] font-semibold text-primary-fg">
                {i + 1}
              </span>
              <span className="min-w-0 text-sm">
                <span className="font-medium">{r.topic}</span>
                <span className="block text-xs text-muted">
                  {r.subject} · {r.detail}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className="overflow-x-auto rounded-[var(--radius-lg)] border border-border bg-surface">
        <div className="border-b border-border bg-bg-elevated px-3 py-2 text-sm font-semibold">
          {exam} — 5 yıl üst üste sorulan konular
        </div>
        <table className="w-full min-w-[420px] text-sm">
          <thead className="bg-ink text-primary-fg text-xs">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Konu</th>
              <th className="px-3 py-2 text-left font-medium">Ders</th>
              <th className="px-3 py-2 text-right font-medium">Yıllık ortalama soru</th>
            </tr>
          </thead>
          <tbody>
            {streak.flatMap((g) =>
              g.rows.map((r) => (
                <tr key={`${r.subject}-${r.topic}`} className="border-t border-border odd:bg-bg-elevated">
                  <td className="px-3 py-1.5 font-medium">{r.label}</td>
                  <td className="px-3 py-1.5 text-muted">{r.subject}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{r.count}</td>
                </tr>
              )),
            )}
          </tbody>
        </table>
      </section>

      {garanti.length > 0 && (
        <p className="text-sm text-muted">
          {exam} için {garanti.reduce((a, g) => a + g.rows.length, 0)} garanti konu listelendi. Ayrıntı için “Garanti konular” sekmesine geç.
        </p>
      )}
    </div>
  );
}

function topPriority(exam: "TYT" | "AYT") {
  const seen = new Set<string>();
  const out: { subject: string; topic: string; detail: string; score: number }[] = [];
  for (const r of DISTRIBUTION) {
    if (r.exam !== exam) continue;
    const k = `${r.subject}|${r.topic}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const hot = hotnessScore(r.exam, r.subject, r.topic);
    const recent = distStats(r).recentTotal;
    if (hot === 0 && recent === 0) continue;
    out.push({
      subject: r.subject,
      topic: r.topic,
      detail: hot > 0 ? `garanti/seri listesinde · son 6 yılda ${recent} soru` : `son 6 yılda ${recent} soru`,
      score: hot * 100 + recent,
    });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 12);
}

/** Garanti konular: ders ders, beklenen soru sayısıyla. */
function GuaranteedView({ exam }: { exam: "TYT" | "AYT" }) {
  const groups = useMemo(() => guaranteedBySubject(exam), [exam]);
  const streakGroups = useMemo(() => streakBySubject(exam), [exam]);
  const aytExtra = exam === "AYT" ? GARANTI_AYT_TOPICS : [];

  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <section key={g.subject} className="overflow-x-auto rounded-[var(--radius-lg)] border border-border bg-surface">
          <div className="border-b border-border bg-bg-elevated px-3 py-2 text-sm font-semibold">
            {exam} {g.subject}
          </div>
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-ink text-primary-fg text-xs">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Konu</th>
                <th className="px-3 py-2 text-left font-medium">Beklenen soru</th>
                <th className="px-3 py-2 text-left font-medium">Neden</th>
              </tr>
            </thead>
            <tbody>
              {g.rows.map((r) => (
                <tr key={`${r.subject}-${r.topic}`} className="border-t border-border odd:bg-bg-elevated">
                  <td className="px-3 py-2 font-medium">{r.label}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <Badge className="bg-warn-bg text-warn">{r.questions}</Badge>
                  </td>
                  <td className="px-3 py-2 text-muted">{r.why}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}

      {streakGroups.length > 0 && (
        <section className="overflow-x-auto rounded-[var(--radius-lg)] border border-border bg-surface">
          <div className="border-b border-border bg-bg-elevated px-3 py-2 text-sm font-semibold">
            {exam} — 5 yıl üst üste (soru sayısıyla)
          </div>
          <table className="w-full min-w-[520px] text-sm">
            <thead className="bg-ink text-primary-fg text-xs">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Ders</th>
                <th className="px-3 py-2 text-left font-medium">Konu</th>
                <th className="px-3 py-2 text-right font-medium">Yıllık ortalama soru</th>
              </tr>
            </thead>
            <tbody>
              {streakGroups.flatMap((g) =>
                g.rows.map((r) => (
                  <tr key={`${r.subject}-${r.topic}`} className="border-t border-border odd:bg-bg-elevated">
                    <td className="px-3 py-1.5 text-muted">{r.subject}</td>
                    <td className="px-3 py-1.5 font-medium">{r.label}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{r.count}</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </section>
      )}

      {exam === "AYT" && (
        <section className="rounded-[var(--radius-xl)] border border-border bg-surface p-5">
          <h2 className="text-lg font-semibold">{AYT_KIMYA_BIO_NOTE.title}</h2>
          <p className="mt-1 text-sm text-muted">{AYT_KIMYA_BIO_NOTE.body}</p>
          <ul className="mt-3 grid gap-1 text-sm sm:grid-cols-2">
            {aytExtra.map((g) => (
              <li key={`${g.subject}-${g.topic}`}>
                {g.subject} — {g.topic}
              </li>
            ))}
          </ul>
        </section>
      )}

      {groups.length === 0 && streakGroups.length === 0 && aytExtra.length === 0 && (
        <p className="text-sm text-muted">Bu oturum için garanti liste kaydı yok.</p>
      )}
    </div>
  );
}

/** Yıllara göre: klasik yıl-yıl tablo. Sadece isteyen burada açar. */
function YearsView() {
  const [exam, setExam] = useState<"TYT" | "AYT">("TYT");
  const [subject, setSubject] = useState("Hepsi");
  const [onlyStreak, setOnlyStreak] = useState(false);
  const subjects = SUBJECT_ORDER.filter((s) => s.exam === exam).map((s) => s.subject);
  const rows = useMemo(() => {
    return DISTRIBUTION.filter((r) => {
      if (r.exam !== exam) return false;
      if (subject !== "Hepsi" && r.subject !== subject) return false;
      if (onlyStreak && !fiveYearStreak(r) && !isGaranti(r.exam, r.subject, r.topic)) return false;
      return true;
    });
  }, [exam, subject, onlyStreak]);

  const groups = subjects
    .map((sub) => ({
      subject: sub,
      rows: rows.filter((r) => r.subject === sub).sort((a, b) => distStats(b).recentTotal - distStats(a).recentTotal),
    }))
    .filter((g) => g.rows.length);

  const top = [...rows].sort((a, b) => distStats(b).recentTotal - distStats(a).recentTotal).slice(0, 8);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <select className={sel} value={exam} onChange={(e) => { setExam(e.target.value as "TYT" | "AYT"); setSubject("Hepsi"); }}>
          <option>TYT</option>
          <option>AYT</option>
        </select>
        <select className={sel} value={subject} onChange={(e) => setSubject(e.target.value)}>
          <option>Hepsi</option>
          {subjects.map((s) => <option key={s}>{s}</option>)}
        </select>
        <label className="flex h-10 items-center gap-2 rounded-[var(--radius-sm)] border border-border bg-surface px-3 text-sm">
          <input type="checkbox" checked={onlyStreak} onChange={(e) => setOnlyStreak(e.target.checked)} />
          Garanti / 5 yıl üst üste
        </label>
      </div>

      {top.length > 0 && (
        <section className="rounded-[var(--radius-xl)] border border-border bg-surface p-4">
          <h2 className="mb-2 font-semibold">Son yıllarda en sık</h2>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={top.map((r) => ({ name: r.topic, n: distStats(r).recentTotal }))}>
                <CartesianGrid stroke="color-mix(in oklab, var(--color-fg) 12%, transparent)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: "var(--color-muted)" }} interval={0} angle={-22} textAnchor="end" height={64} />
                <YAxis tick={{ fontSize: 11, fill: "var(--color-muted)" }} />
                <Tooltip />
                <Bar dataKey="n" fill="var(--color-primary)" radius={[4, 4, 0, 0]} animationDuration={400} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {groups.map((g) => (
        <section key={g.subject} className="overflow-x-auto rounded-[var(--radius-lg)] border border-border bg-surface">
          <div className="border-b border-border bg-bg-elevated px-3 py-2 text-sm font-semibold">
            {exam} {g.subject}
          </div>
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-ink text-primary-fg text-xs">
              <tr>
                <th className="px-2 py-2 text-left font-medium">Konu</th>
                {DIST_YEARS.map((y) => <th key={y} className="px-1 py-2 font-medium">{String(y).slice(2)}</th>)}
                <th className="px-2 py-2 font-medium">Toplam</th>
                <th className="px-2 py-2 font-medium">Etiket</th>
              </tr>
            </thead>
            <tbody>
              {g.rows.map((r) => {
                const s = distStats(r);
                const tier = frequencyTier(r);
                const streakN = consecutiveYears(r);
                const garanti = isGaranti(r.exam, r.subject, r.topic);
                return (
                  <tr key={r.topic} className="border-t border-border odd:bg-bg-elevated">
                    <td className="px-2 py-1.5 font-medium">{r.topic}</td>
                    {r.counts.map((c, i) => (
                      <td key={DIST_YEARS[i]} className="px-1 py-1.5 text-center tabular-nums">{c ?? "—"}</td>
                    ))}
                    <td className="px-2 py-1.5 text-center tabular-nums">{s.total}</td>
                    <td className="px-2 py-1.5">
                      <span className="flex flex-wrap gap-1">
                        <Badge className={TIER_CLASS[tier]}>{TIER_LABEL[tier]}</Badge>
                        {streakN >= 5 ? <Badge className="bg-ok-bg text-ok">{streakN} yıl</Badge> : null}
                        {garanti ? <Badge className="bg-warn-bg text-warn">garanti</Badge> : null}
                        {streakCount(r.exam, r.subject, r.topic) > 0 ? (
                          <Badge className="bg-idle-bg text-idle">{streakCount(r.exam, r.subject, r.topic)} soru</Badge>
                        ) : null}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}

const sel = "h-10 rounded-[var(--radius-sm)] border border-border bg-surface px-3 text-sm";
