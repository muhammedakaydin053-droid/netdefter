import { createFileRoute } from "@tanstack/react-router";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAppStore } from "@/lib/store";
import { ALL_SUBJECTS, REVIEW_RESULTS, WRONG_REASONS } from "@/lib/types";

export const Route = createFileRoute("/yanlislar")({ component: YanlislarPage });

function YanlislarPage() {
  const wrongs = useAppStore((s) => s.wrongs);
  const addWrong = useAppStore((s) => s.addWrong);
  const updateWrong = useAppStore((s) => s.updateWrong);
  const removeWrong = useAppStore((s) => s.removeWrong);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted">Sayfa 3</p>
          <h1 className="mt-1 text-3xl font-semibold">Yanlışlarım</h1>
          <p className="mt-2 max-w-xl text-sm text-muted">Kısa tut. Neden + bir satır not yeterli. Fotoğraf yok.</p>
        </div>
        <Button onClick={() => addWrong()}>
          <Plus className="size-4" />
          Satır ekle
        </Button>
      </div>

      <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-soft)]">
        <table className="min-w-[1200px] w-full text-left text-sm">
          <thead className="bg-ink text-primary-fg">
            <tr className="text-xs">
              {["Tarih", "Sınav", "Ders", "Konu", "Alt konu", "Kaynak", "No", "Neden", "Kısa not", "Tekrar", "Sonuç", ""].map((h) => (
                <th key={h} className="px-2 py-2.5 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {wrongs.length === 0 ? (
              <tr>
                <td colSpan={12} className="px-4 py-10 text-center text-muted">
                  Henüz yanlış kaydı yok. Hızlı ekle.
                </td>
              </tr>
            ) : (
              wrongs.map((w) => (
                <tr key={w.id} className="border-t border-border">
                  <td className="px-1 py-1.5"><input type="date" className={cell} value={w.date} onChange={(e) => updateWrong(w.id, { date: e.target.value })} /></td>
                  <td className="px-1 py-1.5">
                    <select className={cell} value={w.exam} onChange={(e) => updateWrong(w.id, { exam: e.target.value as "TYT" | "AYT" })}>
                      <option value="">—</option>
                      <option>TYT</option>
                      <option>AYT</option>
                    </select>
                  </td>
                  <td className="px-1 py-1.5">
                    <select className={cell} value={w.subject} onChange={(e) => updateWrong(w.id, { subject: e.target.value })}>
                      <option value="">—</option>
                      {ALL_SUBJECTS.map((s) => <option key={s}>{s}</option>)}
                    </select>
                  </td>
                  <td className="px-1 py-1.5"><Input className="h-8" value={w.topic} onChange={(e) => updateWrong(w.id, { topic: e.target.value })} /></td>
                  <td className="px-1 py-1.5"><Input className="h-8" value={w.subtopic} onChange={(e) => updateWrong(w.id, { subtopic: e.target.value })} /></td>
                  <td className="px-1 py-1.5"><Input className="h-8 w-24" value={w.source} onChange={(e) => updateWrong(w.id, { source: e.target.value })} /></td>
                  <td className="px-1 py-1.5"><Input className="h-8 w-14" value={w.questionNo} onChange={(e) => updateWrong(w.id, { questionNo: e.target.value })} /></td>
                  <td className="px-1 py-1.5">
                    <select className={cell} value={w.reason} onChange={(e) => updateWrong(w.id, { reason: e.target.value as typeof w.reason })}>
                      <option value="">—</option>
                      {WRONG_REASONS.map((s) => <option key={s}>{s}</option>)}
                    </select>
                  </td>
                  <td className="px-1 py-1.5"><Input className="h-8 min-w-40" value={w.note} onChange={(e) => updateWrong(w.id, { note: e.target.value })} /></td>
                  <td className="px-1 py-1.5"><input type="date" className={cell} value={w.reviewDate} onChange={(e) => updateWrong(w.id, { reviewDate: e.target.value })} /></td>
                  <td className="px-1 py-1.5">
                    <select className={cell} value={w.result} onChange={(e) => updateWrong(w.id, { result: e.target.value as typeof w.result })}>
                      <option value="">—</option>
                      {REVIEW_RESULTS.map((s) => <option key={s}>{s}</option>)}
                    </select>
                  </td>
                  <td className="px-1 py-1.5">
                    <Button variant="ghost" size="icon" className="size-8" onClick={() => removeWrong(w.id)} aria-label="Sil">
                      <Trash2 className="size-4" />
                    </Button>
                  </td>
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
