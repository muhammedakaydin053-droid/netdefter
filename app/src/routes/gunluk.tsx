import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, NumInput } from "@/components/ui/input";
import { Kpi } from "@/components/kpi";
import { useAppStore } from "@/lib/store";
import { classifyDaily } from "@/lib/sessions";
import { dailyTotals } from "@/lib/stats";
import { addDaysISO, formatNet, todayISO } from "@/lib/utils";
import { ALL_SUBJECTS, STUDY_TYPES } from "@/lib/types";
import { netOf } from "@/lib/calc";

export const Route = createFileRoute("/gunluk")({ component: GunlukPage });

function GunlukPage() {
  const daily = useAppStore((s) => s.daily);
  const topics = useAppStore((s) => s.topics);
  const archivedTopics = useAppStore((s) => s.archivedTopics);
  const addDaily = useAppStore((s) => s.addDaily);
  const updateDaily = useAppStore((s) => s.updateDaily);
  const removeDaily = useAppStore((s) => s.removeDaily);
  const removeSession = useAppStore((s) => s.removeSession);
  const today = todayISO();
  const weekFrom = addDaysISO(today, -6);
  const d = dailyTotals(daily, today, today);
  const w = dailyTotals(daily, weekFrom, today);

  // Silme onayı: orphan/malformed (kümülatif DEĞİŞMEZ) ve arşivlenmiş konuya bağlı
  // oturum (kümülatif katkı arşivden GERİ ALINIR) için açık onay alınır.
  const [confirmRow, setConfirmRow] = useState<{
    id: string;
    label: string;
    reason: string;
    recovers: boolean;
  } | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
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
              daily.map((r) => {
                const cls = classifyDaily(r, topics, archivedTopics);
                const isBound = cls === "bound";
                const isProtected = cls === "orphan" || cls === "malformed";
                // Arşivlenmiş konuya bağlı oturum: silme, arşivdeki kümülatif katkıyı
                // geri alır; bu yüzden onay ister (canlı bağlı oturumdan farkı budur).
                const isArchivedBound = isBound && !topics.some((t) => t.id === r.topicId);
                // Bağlı/orphan/malformed satırlarda soru ve kimlik alanları salt okunur.
                const ro = isBound || isProtected;
                const orphanNote =
                  cls === "orphan"
                    ? "Hedef konu bulunamadı; kümülatif katkı otomatik düzeltilemez."
                    : cls === "malformed"
                      ? "Bağlantı bilgisi bozuk; kayıt korumalı ve kümülatif katkısı yok."
                      : null;
                return (
                  <tr key={r.id} className="border-t border-border">
                    <td className="px-1 py-1">
                      {ro ? (
                        <span className="text-xs tabular-nums">{r.date}</span>
                      ) : (
                        <input type="date" className={cell} value={r.date} onChange={(e) => updateDaily(r.id, { date: e.target.value })} />
                      )}
                    </td>
                    <td className="px-1 py-1">
                      {ro ? (
                        <span className="text-xs">{r.subject || "—"}</span>
                      ) : (
                        <select className={cell} value={r.subject} onChange={(e) => updateDaily(r.id, { subject: e.target.value })}>
                          <option value="">—</option>
                          {ALL_SUBJECTS.map((s) => <option key={s}>{s}</option>)}
                        </select>
                      )}
                    </td>
                    <td className="px-1 py-1">
                      {ro ? (
                        <span className="text-xs">{r.topic || "—"}</span>
                      ) : (
                        <Input className="h-8" value={r.topic} onChange={(e) => updateDaily(r.id, { topic: e.target.value })} />
                      )}
                    </td>
                    <td className="px-1 py-1">
                      {ro ? (
                        <span className="text-xs">{r.kind || "—"}</span>
                      ) : (
                        <select className={cell} value={r.kind} onChange={(e) => updateDaily(r.id, { kind: e.target.value as typeof r.kind })}>
                          <option value="">—</option>
                          {STUDY_TYPES.map((s) => <option key={s}>{s}</option>)}
                        </select>
                      )}
                    </td>
                    <td className="px-1 py-1 w-20"><NumInput value={r.minutes} onChange={(v) => updateDaily(r.id, { minutes: v })} /></td>
                    <td className="px-1 py-1 w-20">
                      {ro ? <span className="block text-center text-xs tabular-nums">{r.questions ?? "—"}</span> : <NumInput value={r.questions} onChange={(v) => updateDaily(r.id, { questions: v })} />}
                    </td>
                    <td className="px-1 py-1 w-16">
                      {ro ? <span className="block text-center text-xs tabular-nums">{r.correct ?? "—"}</span> : <NumInput value={r.correct} onChange={(v) => updateDaily(r.id, { correct: v })} />}
                    </td>
                    <td className="px-1 py-1 w-16">
                      {ro ? <span className="block text-center text-xs tabular-nums">{r.wrong ?? "—"}</span> : <NumInput value={r.wrong} onChange={(v) => updateDaily(r.id, { wrong: v })} />}
                    </td>
                    <td className="px-2 py-1 tabular-nums">{formatNet(netOf(r.correct, r.wrong))}</td>
                    <td className="px-1 py-1"><Input className="h-8" value={r.note} onChange={(e) => updateDaily(r.id, { note: e.target.value })} /></td>
                    <td>
                      <div className="flex items-center gap-1">
                        {isBound && (
                          <span className="text-[10px] text-muted" title="Bağlı oturum: soru alanları kilitli, silme kümülatifi geri alır.">
                            bağlı
                          </span>
                        )}
                        {orphanNote && (
                          <span className="text-[10px] text-amber-600" title={orphanNote}>
                            {cls === "orphan" ? "konu yok" : "bozuk"}
                          </span>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          onClick={() => {
                            if (isBound && !isArchivedBound) {
                              removeSession(r.id);
                            } else if (isProtected) {
                              setConfirmRow({
                                id: r.id,
                                label: `${r.subject || "—"} · ${r.topic || "—"}`,
                                reason: orphanNote ?? "",
                                recovers: false,
                              });
                            } else if (isArchivedBound) {
                              setConfirmRow({
                                id: r.id,
                                label: `${r.subject || "—"} · ${r.topic || "—"}`,
                                reason:
                                  "Arşivlenmiş konuya bağlı oturum; silme, arşivdeki kümülatif katkıyı geri alır.",
                                recovers: true,
                              });
                            } else {
                              removeDaily(r.id);
                            }
                          }}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {confirmRow && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="daily-confirm-title"
          className="nd-overlay-enter fixed inset-0 z-50 grid place-items-center bg-[color-mix(in_oklab,var(--color-fg)_35%,transparent)] p-4"
        >
          <div className="nd-modal-enter w-full max-w-md rounded-[var(--radius-xl)] border border-border bg-surface p-5 shadow-[var(--shadow-soft)]">
            <h2 id="daily-confirm-title" className="font-display text-xl font-semibold">
              Kayıt silinsin mi?
            </h2>
            <p className="mt-3 text-sm text-muted">{confirmRow.label}</p>
            <p className="mt-2 text-sm text-muted">{confirmRow.reason}</p>
            <p className="mt-2 text-sm text-muted">
              {confirmRow.recovers ? (
                <>
                  Silme, bu oturumun arşivdeki konuya eklediği katkıyı geri alır;{" "}
                  <span className="font-medium text-fg">diğer konu ve kayıtlar etkilenmez.</span>
                </>
              ) : (
                <>
                  Silme yalnız bu günlük satırını kaldırır;{" "}
                  <span className="font-medium text-fg">kümülatif konu değerleri değişmez.</span>
                </>
              )}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setConfirmRow(null)}>Vazgeç</Button>
              <Button
                variant="danger"
                onClick={() => {
                  removeDaily(confirmRow.id, { confirm: true });
                  setConfirmRow(null);
                }}
              >
                Sil
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const cell = "h-8 w-full rounded-[var(--radius-xs)] border border-border bg-surface px-1 text-xs";
