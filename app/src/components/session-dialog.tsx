import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, NumInput } from "@/components/ui/input";
import { useAppStore } from "@/lib/store";
import { SESSION_KINDS, sessionInputFromForm } from "@/lib/sessions";
import { STUDY_TYPES, type StudyType, type TopicRow } from "@/lib/types";
import { todayISO, uid } from "@/lib/utils";

/**
 * Konularım'dan seçili konuya "Çalışma ekle" formu.
 *
 * Kurallar (store ile tutarlı):
 *  - Form açılışında TEK bir oturum `id`'si üretilir; gönderim tekrarında aynı
 *    `id` kullanılır (`addSession` idempotansı sayesinde çift kayıt oluşmaz).
 *  - Başarılı eklemeden sonra form kapanır; sonraki açılışta yeni `id` üretilir.
 *  - Başarısız işlemde form verisi KORUNUR ve hata gösterilir.
 *  - `null` (boş) ile `0` ayrıdır: boş alan "girilmedi" demektir.
 *  - Dakika girilmezse tahmin/varsayılan yazılmaz.
 *  - Kümülatif `updateTopic` ile AYRICA değiştirilmez; yalnız `addSession` kullanılır.
 */
export function SessionDialog({
  open,
  topic,
  onClose,
}: {
  open: boolean;
  topic: TopicRow | null;
  onClose: () => void;
}) {
  const addSession = useAppStore((s) => s.addSession);
  const [formId, setFormId] = useState(() => uid());
  const [kind, setKind] = useState<StudyType>("Soru çözümü");
  const [questions, setQuestions] = useState<number | null>(null);
  const [correct, setCorrect] = useState<number | null>(null);
  const [wrong, setWrong] = useState<number | null>(null);
  const [minutes, setMinutes] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [date, setDate] = useState(() => todayISO());
  const [error, setError] = useState<string | null>(null);

  // Her yeni açılışta yeni `id` ve temiz form. Gönderim başarısız olursa form
  // açık kalır; aynı `id` korunur.
  useEffect(() => {
    if (!open) return;
    setFormId(uid());
    setKind("Soru çözümü");
    setQuestions(null);
    setCorrect(null);
    setWrong(null);
    setMinutes(null);
    setNote("");
    setDate(todayISO());
    setError(null);
  }, [open]);

  if (!open || !topic) return null;

  const clamped = questions != null && correct != null && wrong != null && correct + wrong > questions;

  const submit = () => {
    if (!topic) return;
    const ok = addSession(
      sessionInputFromForm(formId, topic.id, { kind, questions, correct, wrong, minutes, note, date }),
    );
    if (ok) {
      onClose();
    } else {
      setError("Oturum eklenemedi. Sayıları kontrol et (negatif olamaz) ve tekrar dene.");
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="session-dialog-title"
      className="nd-overlay-enter fixed inset-0 z-50 grid place-items-center bg-[color-mix(in_oklab,var(--color-fg)_35%,transparent)] p-4"
    >
      <div className="nd-modal-enter w-full max-w-lg rounded-[var(--radius-xl)] border border-border bg-surface p-5 shadow-[var(--shadow-soft)]">
        <h2 id="session-dialog-title" className="font-display text-xl font-semibold">
          Çalışma ekle
        </h2>
        <p className="mt-1 text-sm text-muted">
          {topic.exam} · {topic.subject} · {topic.topic}
          {topic.subtopic ? ` · ${topic.subtopic}` : ""}
        </p>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="col-span-2 flex flex-col gap-1 text-xs text-muted">
            Çalışma türü
            <select
              className={field}
              value={kind}
              onChange={(e) => setKind(e.target.value as StudyType)}
            >
              {STUDY_TYPES.filter((k) => (SESSION_KINDS as string[]).includes(k)).map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs text-muted">
            Soru sayısı
            <NumInput value={questions} onChange={setQuestions} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Tarih
            <input type="date" className={field} value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Doğru
            <NumInput value={correct} max={questions ?? undefined} onChange={setCorrect} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Yanlış
            <NumInput value={wrong} max={questions ?? undefined} onChange={setWrong} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Dakika (isteğe bağlı)
            <NumInput value={minutes} onChange={setMinutes} />
          </label>
          <label className="col-span-2 flex flex-col gap-1 text-xs text-muted">
            Not (isteğe bağlı)
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
        </div>

        {clamped && (
          <p className="mt-3 text-xs text-amber-600">
            Doğru + yanlış, soru sayısını aşıyor; kayıt sırasında yanlış kırpılacak.
          </p>
        )}
        {error && <p className="mt-3 text-xs text-red-600">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Vazgeç
          </Button>
          <Button onClick={submit}>Ekle</Button>
        </div>
      </div>
    </div>
  );
}

const field = "h-9 w-full rounded-[var(--radius-xs)] border border-border bg-surface px-2 text-sm";
