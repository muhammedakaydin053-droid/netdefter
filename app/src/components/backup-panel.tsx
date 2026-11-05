import { useRef, useState } from "react";
import { Download, Upload, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/lib/store";
import {
  backupFilename,
  parseBackup,
  serializeBackup,
  toBackupData,
  type BackupData,
} from "@/lib/backup";

type Pending = { data: BackupData; summary: Summary; filename: string };
type Summary = { topics: number; archived: number; wrongs: number; tyt: number; ayt: number; daily: number };

function summarize(d: BackupData): Summary {
  const withData = d.topics.filter(
    (t) => t.status !== "Başlamadım" || t.total != null || t.lastStudy || t.note,
  ).length;
  return {
    topics: withData,
    archived: d.archivedTopics.length,
    wrongs: d.wrongs.length,
    tyt: d.tytExams.length,
    ayt: d.aytExams.length,
    daily: d.daily.length,
  };
}

function summaryLine(s: Summary) {
  return `${s.topics} konu · ${s.archived} arşiv · ${s.wrongs} yanlış · ${s.tyt + s.ayt} deneme · ${s.daily} günlük`;
}

export function BackupPanel() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  function handleExport() {
    const s = useAppStore.getState();
    const json = serializeBackup(toBackupData(s));
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = backupFilename();
    a.click();
    URL.revokeObjectURL(url);
    setMessage({ kind: "ok", text: `Yedek indirildi (${a.download}).` });
  }

  async function handleFile(file: File) {
    let text: string;
    try {
      text = await file.text();
    } catch {
      setMessage({ kind: "err", text: "Dosya okunamadı. Başka bir dosya deneyin." });
      return;
    }
    const res = parseBackup(text);
    if (!res.ok) {
      setPending(null);
      setMessage({ kind: "err", text: `İçe aktarma başarısız: ${res.error} Mevcut verileriniz değişmedi.` });
      return;
    }
    setMessage(null);
    setPending({ data: res.data, summary: summarize(res.data), filename: file.name });
  }

  function confirmImport() {
    if (!pending) return;
    useAppStore.getState().importData(pending.data);
    setMessage({ kind: "ok", text: `Yedek geri yüklendi: ${summaryLine(pending.summary)}.` });
    setPending(null);
  }

  return (
    <section className="nd-card rounded-[var(--radius-xl)] border border-border bg-surface p-5 shadow-[var(--shadow-soft)]">
      <h2 className="text-lg font-semibold">Yedekleme</h2>
      <p className="mt-1 text-sm text-muted">
        Verileriniz yalnızca bu tarayıcıda saklanır. Cihaz değiştirmeden veya tarayıcı verilerini
        temizlemeden önce JSON yedeği indirin.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" onClick={handleExport}>
          <Download className="size-3.5" />
          JSON yedeği indir
        </Button>
        <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
          <Upload className="size-3.5" />
          JSON yedeğini içe aktar
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void handleFile(f);
          }}
        />
      </div>

      <p className="mt-3 text-xs text-subtle">
        Excel şablonu yalnızca boş bir çalışma dosyasıdır; bu uygulamadaki verilerinizi içermez.
      </p>

      {message ? (
        <p
          role="status"
          className={`mt-3 rounded-[var(--radius-md)] border px-3 py-2 text-sm ${
            message.kind === "ok"
              ? "border-border bg-ok-bg text-ok"
              : "border-border bg-bad-bg text-bad"
          }`}
        >
          {message.text}
        </p>
      ) : null}

      {pending ? (
        <div className="nd-overlay-enter fixed inset-0 z-50 grid place-items-center bg-[color-mix(in_oklab,var(--color-fg)_35%,transparent)] p-4">
          <div className="nd-modal-enter w-full max-w-md rounded-[var(--radius-xl)] border border-border bg-surface p-5 shadow-[var(--shadow-soft)]">
            <div className="flex items-center gap-2">
              <TriangleAlert className="size-5 text-warn" />
              <h2 className="font-display text-xl font-semibold">Yedekten geri yüklenecek</h2>
            </div>
            <p className="mt-3 text-sm text-muted">
              <span className="font-medium text-fg">{pending.filename}</span> dosyasındaki veriler
              yüklenecek. Bu işlem mevcut verilerinizin üzerine yazacak.
            </p>
            <p className="mt-2 text-sm text-muted">{summaryLine(pending.summary)}</p>
            <p className="mt-2 text-xs text-muted">
              Devam etmeden önce mevcut durumunuz otomatik yedeklenir; “Yedeği geri al” ile dönebilirsiniz.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setPending(null)}>Vazgeç</Button>
              <Button onClick={confirmImport}>İçe aktar</Button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
