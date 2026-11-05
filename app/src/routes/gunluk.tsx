import { createFileRoute } from "@tanstack/react-router";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, NumInput } from "@/components/ui/input";
import { Kpi } from "@/components/kpi";
import { useAppStore } from "@/lib/store";
import { dailyTotals } from "@/lib/stats";
import { addDaysISO, formatNet, todayISO } from "@/lib/utils";
import { ALL_SUBJECTS, STUDY_TYPES } from "@/lib/types";
import { netOf } from "@/lib/calc";

export const Route = createFileRoute("/gunluk")({ component: GunlukPage });

function GunlukPage() {
  const daily = useAppStore((s) => s.daily);
  const addDaily = useAppStore((s) => s.addDaily);
  const updateDaily = useAppStore((s) => s.updateDaily);
  const removeDaily = useAppStore((s) => s.removeDaily);
  const today = todayISO();
  const weekFrom = addDaysISO(today, -6);
  const d = dailyTotals(daily, today, today);
  const w = dailyTotals(daily, weekFrom, today);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted">Sayfa 7</p>
          <h1 className="mt-1 text-3xl font-semibold">Günlük çalışma</h1>
          <p className="mt-2 text-sm text-muted">Süre dakika cinsinden. Net otomatik.</p>
        </div>
        <Button onClick={() => addDaily()}>
          <Plus className="size-4" />
          Kayıt ekle
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Günlük süre (dk)" value={d.minutes} />
        <Kpi label="Günlük soru" value={d.questions} />
        <Kpi label="Haftalık süre (dk)" value={w.minutes} />
        <Kpi label="Haftalık soru" value={w.questions} />
      </div>

      <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-border bg-surface">
        <table className="min-w-[1000px] w-full text-sm">
          <thead className="bg-ink text-primary-fg text-xs">
            <tr>
              {["Tarih", "Ders", "Konu", "Tür", "Süre", "Soru", "D", "Y", "Net", "Not", ""].map((h) => (
                <th key={h} className="px-2 py-2.5 text-left font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {daily.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-4 py-10 text-center text-muted">Bugün bir satır ekle.</td>
              </tr>
            ) : (
              daily.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-1 py-1"><input type="date" className={cell} value={r.date} onChange={(e) => updateDaily(r.id, { date: e.target.value })} /></td>
                  <td className="px-1 py-1">
                    <select className={cell} value={r.subject} onChange={(e) => updateDaily(r.id, { subject: e.target.value })}>
                      <option value="">—</option>
                      {ALL_SUBJECTS.map((s) => <option key={s}>{s}</option>)}
                    </select>
                  </td>
                  <td className="px-1 py-1"><Input className="h-8" value={r.topic} onChange={(e) => updateDaily(r.id, { topic: e.target.value })} /></td>
                  <td className="px-1 py-1">
                    <select className={cell} value={r.kind} onChange={(e) => updateDaily(r.id, { kind: e.target.value as typeof r.kind })}>
                      <option value="">—</option>
                      {STUDY_TYPES.map((s) => <option key={s}>{s}</option>)}
                    </select>
                  </td>
                  <td className="px-1 py-1 w-20"><NumInput value={r.minutes} onChange={(v) => updateDaily(r.id, { minutes: v })} /></td>
                  <td className="px-1 py-1 w-20"><NumInput value={r.questions} onChange={(v) => updateDaily(r.id, { questions: v })} /></td>
                  <td className="px-1 py-1 w-16"><NumInput value={r.correct} onChange={(v) => updateDaily(r.id, { correct: v })} /></td>
                  <td className="px-1 py-1 w-16"><NumInput value={r.wrong} onChange={(v) => updateDaily(r.id, { wrong: v })} /></td>
                  <td className="px-2 py-1 tabular-nums">{formatNet(netOf(r.correct, r.wrong))}</td>
                  <td className="px-1 py-1"><Input className="h-8" value={r.note} onChange={(e) => updateDaily(r.id, { note: e.target.value })} /></td>
                  <td><Button variant="ghost" size="icon" className="size-8" onClick={() => removeDaily(r.id)}><Trash2 className="size-4" /></Button></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const cell = "h-8 w-full rounded-[var(--radius-xs)] border border-border bg-surface px-1 text-xs";
