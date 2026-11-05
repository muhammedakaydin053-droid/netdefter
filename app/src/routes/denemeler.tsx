import { createFileRoute } from "@tanstack/react-router";
import { Plus, Trash2 } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Input, NumInput } from "@/components/ui/input";
import { useAppStore } from "@/lib/store";
import { aytNets, tytNets } from "@/lib/stats";
import { formatNet } from "@/lib/utils";
import { mockPlanSummary } from "@/lib/smart/mock-plan";

export const Route = createFileRoute("/denemeler")({ component: DenemelerPage });

function DenemelerPage() {
  const tytExams = useAppStore((s) => s.tytExams);
  const aytExams = useAppStore((s) => s.aytExams);
  const addTytExam = useAppStore((s) => s.addTytExam);
  const updateTytExam = useAppStore((s) => s.updateTytExam);
  const removeTytExam = useAppStore((s) => s.removeTytExam);
  const addAytExam = useAppStore((s) => s.addAytExam);
  const updateAytExam = useAppStore((s) => s.updateAytExam);
  const removeAytExam = useAppStore((s) => s.removeAytExam);

  const tytTrend = [...tytExams].filter((e) => e.date).sort((a, b) => a.date.localeCompare(b.date)).map((e) => ({
    date: e.date,
    net: tytNets(e).total ?? 0,
  }));
  const aytTrend = [...aytExams].filter((e) => e.date).sort((a, b) => a.date.localeCompare(b.date)).map((e) => ({
    date: e.date,
    net: aytNets(e).total ?? 0,
  }));

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted">Sayfa 4</p>
        <h1 className="mt-1 text-3xl font-semibold">Deneme takibi</h1>
        <p className="mt-2 text-sm text-muted">Net = Doğru − Yanlış / 4. Toplam net otomatik.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Trend title="TYT toplam net" data={tytTrend} color="var(--color-primary)" />
        <Trend title="AYT sayısal toplam net" data={aytTrend} color="var(--color-accent)" />
      </div>

      <MockPlanPanel />

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">TYT denemeleri</h2>
          <Button size="sm" onClick={() => addTytExam()}><Plus className="size-4" /> TYT ekle</Button>
        </div>
        <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-border bg-surface">
          <table className="min-w-[1100px] w-full text-sm">
            <thead className="bg-ink text-primary-fg text-xs">
              <tr>
                {["Tarih", "Ad", "T D", "T Y", "T Net", "M D", "M Y", "M Net", "S D", "S Y", "S Net", "F D", "F Y", "F Net", "Toplam", ""].map((h) => (
                  <th key={h} className="px-2 py-2 text-left font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tytExams.map((e) => {
                const n = tytNets(e);
                return (
                  <tr key={e.id} className="border-t border-border">
                    <td className="px-1 py-1"><input type="date" className={cell} value={e.date} onChange={(ev) => updateTytExam(e.id, { date: ev.target.value })} /></td>
                    <td className="px-1 py-1"><Input className="h-8 w-32" value={e.name} onChange={(ev) => updateTytExam(e.id, { name: ev.target.value })} /></td>
                    <td className="px-1 py-1"><NumInput value={e.turD} onChange={(v) => updateTytExam(e.id, { turD: v })} /></td>
                    <td className="px-1 py-1"><NumInput value={e.turY} onChange={(v) => updateTytExam(e.id, { turY: v })} /></td>
                    <td className="px-2 py-1 tabular-nums">{formatNet(n.tur)}</td>
                    <td className="px-1 py-1"><NumInput value={e.matD} onChange={(v) => updateTytExam(e.id, { matD: v })} /></td>
                    <td className="px-1 py-1"><NumInput value={e.matY} onChange={(v) => updateTytExam(e.id, { matY: v })} /></td>
                    <td className="px-2 py-1 tabular-nums">{formatNet(n.mat)}</td>
                    <td className="px-1 py-1"><NumInput value={e.sosD} onChange={(v) => updateTytExam(e.id, { sosD: v })} /></td>
                    <td className="px-1 py-1"><NumInput value={e.sosY} onChange={(v) => updateTytExam(e.id, { sosY: v })} /></td>
                    <td className="px-2 py-1 tabular-nums">{formatNet(n.sos)}</td>
                    <td className="px-1 py-1"><NumInput value={e.fenD} onChange={(v) => updateTytExam(e.id, { fenD: v })} /></td>
                    <td className="px-1 py-1"><NumInput value={e.fenY} onChange={(v) => updateTytExam(e.id, { fenY: v })} /></td>
                    <td className="px-2 py-1 tabular-nums">{formatNet(n.fen)}</td>
                    <td className="px-2 py-1 font-medium tabular-nums">{formatNet(n.total)}</td>
                    <td><Button variant="ghost" size="icon" className="size-8" onClick={() => removeTytExam(e.id)}><Trash2 className="size-4" /></Button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">AYT Sayısal denemeleri</h2>
          <Button size="sm" onClick={() => addAytExam()}><Plus className="size-4" /> AYT ekle</Button>
        </div>
        <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-border bg-surface">
          <table className="min-w-[1100px] w-full text-sm">
            <thead className="bg-ink text-primary-fg text-xs">
              <tr>
                {["Tarih", "Ad", "M D", "M Y", "M Net", "Fiz D", "Fiz Y", "Fiz Net", "Kim D", "Kim Y", "Kim Net", "Bio D", "Bio Y", "Bio Net", "Toplam", ""].map((h) => (
                  <th key={h} className="px-2 py-2 text-left font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {aytExams.map((e) => {
                const n = aytNets(e);
                return (
                  <tr key={e.id} className="border-t border-border">
                    <td className="px-1 py-1"><input type="date" className={cell} value={e.date} onChange={(ev) => updateAytExam(e.id, { date: ev.target.value })} /></td>
                    <td className="px-1 py-1"><Input className="h-8 w-32" value={e.name} onChange={(ev) => updateAytExam(e.id, { name: ev.target.value })} /></td>
                    <td className="px-1 py-1"><NumInput value={e.matD} onChange={(v) => updateAytExam(e.id, { matD: v })} /></td>
                    <td className="px-1 py-1"><NumInput value={e.matY} onChange={(v) => updateAytExam(e.id, { matY: v })} /></td>
                    <td className="px-2 py-1 tabular-nums">{formatNet(n.mat)}</td>
                    <td className="px-1 py-1"><NumInput value={e.fizD} onChange={(v) => updateAytExam(e.id, { fizD: v })} /></td>
                    <td className="px-1 py-1"><NumInput value={e.fizY} onChange={(v) => updateAytExam(e.id, { fizY: v })} /></td>
                    <td className="px-2 py-1 tabular-nums">{formatNet(n.fiz)}</td>
                    <td className="px-1 py-1"><NumInput value={e.kimD} onChange={(v) => updateAytExam(e.id, { kimD: v })} /></td>
                    <td className="px-1 py-1"><NumInput value={e.kimY} onChange={(v) => updateAytExam(e.id, { kimY: v })} /></td>
                    <td className="px-2 py-1 tabular-nums">{formatNet(n.kim)}</td>
                    <td className="px-1 py-1"><NumInput value={e.bioD} onChange={(v) => updateAytExam(e.id, { bioD: v })} /></td>
                    <td className="px-1 py-1"><NumInput value={e.bioY} onChange={(v) => updateAytExam(e.id, { bioY: v })} /></td>
                    <td className="px-2 py-1 tabular-nums">{formatNet(n.bio)}</td>
                    <td className="px-2 py-1 font-medium tabular-nums">{formatNet(n.total)}</td>
                    <td><Button variant="ghost" size="icon" className="size-8" onClick={() => removeAytExam(e.id)}><Trash2 className="size-4" /></Button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function MockPlanPanel() {
  const topics = useAppStore((s) => s.topics);
  const tytExams = useAppStore((s) => s.tytExams);
  const aytExams = useAppStore((s) => s.aytExams);
  const plan = mockPlanSummary(topics, tytExams, aytExams);
  const active = plan.branches.filter((b) => b.coverage >= 0.5 && !b.reduced);

  return (
    <section className="rounded-[var(--radius-xl)] border border-border bg-surface p-5">
      <h2 className="text-xl font-semibold">Deneme planı</h2>
      <p className="mt-1 text-sm text-muted">
        Deneme sıklığı takvime değil, çalışılan konu kapsamına ve son üç denemenin ortalamasına bakar.
      </p>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {[plan.tyt, plan.ayt].map((d) => (
          <div key={d.exam} className="nd-card rounded-[var(--radius-lg)] border border-border bg-bg p-4">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="font-semibold">{d.exam} genel deneme</h3>
              <span className="text-xs text-muted">kapsam %{Math.round(d.coverage * 100)}</span>
            </div>
            <p className="mt-2 text-sm text-muted">{d.reason}</p>
          </div>
        ))}
      </div>

      <div className="mt-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">Branş denemesi hazır olan dersler</h3>
        {active.length ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {active.map((b) => (
              <span
                key={`${b.exam}|${b.subject}`}
                className="rounded-[var(--radius-xs)] border border-border bg-bg px-2 py-1 text-xs"
              >
                {b.exam} {b.subject} · %{Math.round(b.coverage * 100)}
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted">
            Henüz hiçbir derste kapsam %50'yi geçmedi. Branş denemesi için önce konu anlatımı ve konu testleri.
          </p>
        )}
      </div>
    </section>
  );
}

function Trend({ title, data, color }: { title: string; data: { date: string; net: number }[]; color: string }) {
  return (
    <div className="rounded-[var(--radius-xl)] border border-border bg-surface p-4">
      <h3 className="mb-2 font-semibold">{title}</h3>
      {data.length ? (
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <CartesianGrid stroke="var(--color-border)" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--color-muted)" }} />
              <YAxis tick={{ fontSize: 11, fill: "var(--color-muted)" }} />
              <Tooltip />
              <Line type="monotone" dataKey="net" stroke={color} strokeWidth={2} dot={{ r: 3 }} animationDuration={400} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="py-8 text-center text-sm text-muted">Deneme ekledikçe grafik oluşur.</p>
      )}
    </div>
  );
}

const cell = "h-8 rounded-[var(--radius-xs)] border border-border bg-surface px-1 text-xs";
