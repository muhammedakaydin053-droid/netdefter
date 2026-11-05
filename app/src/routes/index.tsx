import type { ReactNode } from "react";
import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Download, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Kpi, ProgressBar } from "@/components/kpi";
import { ResetDialog } from "@/components/reset-dialog";
import { AiCommentButton, ReviewTodayPanel, SmartAdvicePanel, TodayPlanPanel } from "@/components/smart-panels";
import { BackupPanel } from "@/components/backup-panel";
import { useAppStore } from "@/lib/store";
import { aytNets, examBlock, subjectProgress, tytNets } from "@/lib/stats";
import { formatNet, formatPct } from "@/lib/utils";

export const Route = createFileRoute("/")({ component: Dashboard });

const PIE_COLORS = ["var(--color-ok)", "var(--color-warn)", "var(--color-idle)", "var(--color-bad)"];

function Dashboard() {
  const topics = useAppStore((s) => s.topics);
  const tytExams = useAppStore((s) => s.tytExams);
  const aytExams = useAppStore((s) => s.aytExams);
  const backup = useAppStore((s) => s.backup);
  const restoreBackup = useAppStore((s) => s.restoreBackup);
  const [resetOpen, setResetOpen] = useState(false);

  const tyt = examBlock(topics, "TYT");
  const ayt = examBlock(topics, "AYT");
  const subjects = subjectProgress(topics);
  const pieTyt = [
    { name: "Bitti", value: tyt.done },
    { name: "Çalışıyorum", value: tyt.studying },
    { name: "Başlamadım", value: tyt.notStarted },
    { name: "Tekrar", value: tyt.review },
  ];
  const pieAyt = [
    { name: "Bitti", value: ayt.done },
    { name: "Çalışıyorum", value: ayt.studying },
    { name: "Başlamadım", value: ayt.notStarted },
    { name: "Tekrar", value: ayt.review },
  ];

  const tytTrend = [...tytExams]
    .filter((e) => e.date)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((e) => ({ name: e.name || e.date, net: tytNets(e).total ?? 0, date: e.date }));
  const aytTrend = [...aytExams]
    .filter((e) => e.date)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((e) => ({ name: e.name || e.date, net: aytNets(e).total ?? 0, date: e.date }));

  const barData = subjects.map((s) => ({
    name: `${s.exam === "TYT" ? "T" : "A"} ${s.subject}`,
    ilerleme: Math.round(s.progress * 100),
  }));

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted">Kontrol paneli</p>
          <h1 className="mt-1 text-3xl font-semibold sm:text-4xl">YKS özeti</h1>
          <p className="mt-2 max-w-xl text-sm text-muted">
            Konu, soru ve deneme verilerin buraya otomatik yansır. Masaüstü Excel dosyası aynı formüllerle çalışır.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {backup ? (
            <Button variant="secondary" size="sm" onClick={restoreBackup}>
              Yedeği geri al
            </Button>
          ) : null}
          <Button variant="ghost" size="sm" onClick={() => setResetOpen(true)}>
            <Trash2 className="size-3.5" />
            Sıfırla
          </Button>
          <a
            href="/YKS-Takip-Sistemi.xlsx"
            download="YKS-Takip-Sistemi.xlsx"
            title="Boş Excel şablonu — uygulamadaki verilerinizi içermez."
          >
            <Button size="sm">
              <Download className="size-3.5" />
              Excel şablonu indir
            </Button>
          </a>
        </div>
      </div>

      <TodayPlanPanel />
      <ReviewTodayPanel />
      <SmartAdvicePanel />
      <AiCommentButton />
      <BackupPanel />
      <ResetDialog open={resetOpen} onClose={() => setResetOpen(false)} />

      <section className="grid gap-4 lg:grid-cols-3">
        <Block title="TYT" tone="teal">
          <div className="grid grid-cols-2 gap-3">
            <Kpi label="Toplam konu" value={tyt.total} />
            <Kpi label="Biten" value={tyt.done} />
            <Kpi label="Çalışılan" value={tyt.studying} />
            <Kpi label="Başlanmamış" value={tyt.notStarted} />
            <Kpi label="Tekrar gereken" value={tyt.review} />
            <Kpi label="Konu ilerleme" value={formatPct(tyt.progress)} />
            <Kpi label="Toplam soru" value={tyt.totalQ} />
            <Kpi label="Doğru" value={tyt.correct} />
            <Kpi label="Yanlış" value={tyt.wrong} />
            <Kpi label="Boş" value={tyt.blank} />
            <Kpi label="Net" value={formatNet(tyt.net)} />
            <Kpi label="Başarı" value={formatPct(tyt.success)} />
          </div>
        </Block>
        <Block title="AYT Sayısal" tone="ink">
          <div className="grid grid-cols-2 gap-3">
            <Kpi label="Toplam konu" value={ayt.total} />
            <Kpi label="Biten" value={ayt.done} />
            <Kpi label="Çalışılan" value={ayt.studying} />
            <Kpi label="Başlanmamış" value={ayt.notStarted} />
            <Kpi label="Tekrar gereken" value={ayt.review} />
            <Kpi label="Konu ilerleme" value={formatPct(ayt.progress)} />
            <Kpi label="Toplam soru" value={ayt.totalQ} />
            <Kpi label="Doğru" value={ayt.correct} />
            <Kpi label="Yanlış" value={ayt.wrong} />
            <Kpi label="Boş" value={ayt.blank} />
            <Kpi label="Net" value={formatNet(ayt.net)} />
            <Kpi label="Başarı" value={formatPct(ayt.success)} />
          </div>
        </Block>
        <Block title="Genel" tone="forest">
          <div className="grid grid-cols-2 gap-3">
            <Kpi label="Toplam soru" value={tyt.totalQ + ayt.totalQ} />
            <Kpi label="Toplam doğru" value={tyt.correct + ayt.correct} />
            <Kpi label="Toplam yanlış" value={tyt.wrong + ayt.wrong} />
            <Kpi label="Toplam net" value={formatNet(tyt.net + ayt.net)} />
            <Kpi
              label="Genel konu ilerleme"
              value={formatPct(
                topics.length ? topics.filter((t) => t.status === "Bitti").length / topics.length : 0,
              )}
            />
            <Kpi
              label="TYT + AYT konu"
              value={tyt.total + ayt.total}
              hint={`${tyt.done + ayt.done} biten`}
            />
          </div>
        </Block>
      </section>

      <section className="rounded-[var(--radius-xl)] border border-border bg-surface p-5 shadow-[var(--shadow-soft)]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Ders bazında ilerleme</h2>
          <Link to="/konular" className="text-sm text-primary hover:underline">
            Konulara git
          </Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {subjects.map((s) => (
            <div key={`${s.exam}-${s.subject}`} className="rounded-[var(--radius-md)] border border-border bg-bg-elevated p-3">
              <div className="flex items-baseline justify-between gap-2">
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-subtle">{s.exam}</div>
                  <div className="text-sm font-medium">{s.subject}</div>
                </div>
                <div className="text-right text-sm tabular-nums">
                  {formatPct(s.progress)}
                  <div className="text-[11px] text-muted">{s.done}/{s.total}</div>
                </div>
              </div>
              <ProgressBar value={s.progress} className="mt-2" />
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="TYT konu durumu">
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={pieTyt} dataKey="value" nameKey="name" innerRadius={58} outerRadius={88} paddingAngle={2} animationDuration={400}>
                {pieTyt.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="AYT konu durumu">
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={pieAyt} dataKey="value" nameKey="name" innerRadius={58} outerRadius={88} paddingAngle={2} animationDuration={400}>
                {pieAyt.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </section>

      <ChartCard title="Ders ilerleme yüzdeleri">
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barData} margin={{ left: 0, right: 8, top: 8, bottom: 48 }}>
              <CartesianGrid stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: "var(--color-muted)" }} interval={0} angle={-40} textAnchor="end" height={70} />
              <YAxis tick={{ fontSize: 11, fill: "var(--color-muted)" }} domain={[0, 100]} />
              <Tooltip />
              <Bar dataKey="ilerleme" fill="var(--color-primary)" radius={[4, 4, 0, 0]} animationDuration={400} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      <section className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="TYT deneme neti">
          {tytTrend.length ? (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={tytTrend}>
                  <CartesianGrid stroke="var(--color-border)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--color-muted)" }} />
                  <YAxis tick={{ fontSize: 11, fill: "var(--color-muted)" }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="net" stroke="var(--color-primary)" strokeWidth={2} dot={{ r: 3 }} animationDuration={400} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyChart href="/denemeler" />
          )}
        </ChartCard>
        <ChartCard title="AYT sayısal deneme neti">
          {aytTrend.length ? (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={aytTrend}>
                  <CartesianGrid stroke="var(--color-border)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--color-muted)" }} />
                  <YAxis tick={{ fontSize: 11, fill: "var(--color-muted)" }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="net" stroke="var(--color-accent)" strokeWidth={2} dot={{ r: 3 }} animationDuration={400} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyChart href="/denemeler" />
          )}
        </ChartCard>
      </section>
    </div>
  );
}

function Block({
  title,
  children,
  tone,
}: {
  title: string;
  children: ReactNode;
  tone: "teal" | "ink" | "forest";
}) {
  const bg = tone === "teal" ? "bg-primary" : tone === "ink" ? "bg-ink" : "bg-forest";
  return (
    <div className="nd-card overflow-hidden rounded-[var(--radius-xl)] border border-border bg-bg-elevated shadow-[var(--shadow-soft)]">
      <div className={`${bg} px-4 py-2.5 font-display text-lg font-semibold text-primary-fg`}>{title}</div>
      <div className="p-3">{children}</div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="nd-card rounded-[var(--radius-xl)] border border-border bg-surface p-5 shadow-[var(--shadow-soft)]">
      <h2 className="mb-3 text-lg font-semibold">{title}</h2>
      {children}
    </div>
  );
}

function EmptyChart({ href }: { href: string }) {
  return (
    <p className="py-10 text-center text-sm text-muted">
      Henüz deneme yok.{" "}
      <Link to={href} className="text-primary underline">
        Deneme ekle
      </Link>
    </p>
  );
}
