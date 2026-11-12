/**
 * Notlarım yedek paneli — JSON/ZIP dışa aktarma ve içe aktarma.
 *
 * Kritik kural: içe aktarmada doğrulama TAMAMLANMADAN mevcut veriye
 * dokunulmaz. İçe aktarma her zaman "birleştir" (merge) modundadır: mevcut
 * notlar korunur, yedekteki notlar yeni kimliklerle eklenir.
 */
import { useRef, useState } from "react";
import { Download, Upload, FileJson, FileArchive } from "lucide-react";
import { useNotesStore } from "@/lib/notes/store";
import { buildNotesBackup, parseNotesBackup, dataUrlToBlob } from "@/lib/notes/backup";
import { buildZip, readZipSecurely, parseZipFiles } from "@/lib/notes/zip";
import { importNotesBackup, type ImportImage } from "@/lib/notes/import";
import { Button } from "@/components/ui/button";

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function NotesBackup() {
  const notes = useNotesStore((s) => s.notes);
  const images = useNotesStore((s) => s.images);
  const hydrate = useNotesStore((s) => s.hydrate);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const jsonRef = useRef<HTMLInputElement>(null);
  const zipRef = useRef<HTMLInputElement>(null);

  async function exportJson() {
    setBusy(true);
    try {
      const file = await buildNotesBackup(notes, images);
      download(new Blob([JSON.stringify(file, null, 2)], { type: "application/json" }), `netdefter-notlar-${new Date().toISOString().slice(0, 10)}.json`);
      setMessage("JSON yedek indirildi.");
    } finally {
      setBusy(false);
    }
  }

  async function exportZip() {
    setBusy(true);
    try {
      const manifest = { format: "netdefter-notes-backup", version: 1, exportedAt: new Date().toISOString(), app: "NetDefter" };
      const notesForZip = notes.map((n) => ({ ...n, content: n.content }));
      const imgEntries: { name: string; bytes: Uint8Array }[] = [];
      for (const img of images) {
        // Uzantı gerçek MIME'dan türetilir; sabit ".png" yanıltıcı olurdu.
        const ext = img.mime === "image/jpeg" ? "jpg" : img.mime === "image/webp" ? "webp" : img.mime === "image/gif" ? "gif" : "png";
        imgEntries.push({ name: `${img.id}.${ext}`, bytes: new Uint8Array(await img.blob.arrayBuffer()) });
      }
      const zipBytes = buildZip(manifest, { notes: notesForZip }, imgEntries);
      download(new Blob([zipBytes as BlobPart], { type: "application/zip" }), `netdefter-notlar-${new Date().toISOString().slice(0, 10)}.zip`);
      setMessage("ZIP yedek indirildi.");
    } finally {
      setBusy(false);
    }
  }

  /** İçe aktarma: doğrula → uygula. Mevcut veri her zaman korunur (birleştir). */
  async function importJson(file: File) {
    setBusy(true);
    try {
      const raw = JSON.parse(await file.text());
      const parsed = parseNotesBackup(raw);
      if (!parsed.ok || !parsed.data) {
        setMessage(`Geçersiz yedek: ${parsed.error ?? "bilinmeyen"}. Hiçbir veri değişmedi.`);
        return;
      }
      const result = await importNotesBackup({
        notes: parsed.data.notes,
        images: parsed.data.images.map(
          (bi): ImportImage => ({
            id: bi.id,
            noteId: bi.noteId,
            name: bi.name,
            mime: bi.mime,
            blob: dataUrlToBlob(bi.dataUrl),
            caption: bi.caption,
            alt: bi.alt,
            width: bi.width,
            height: bi.height,
          }),
        ),
      });
      await hydrate();
      setMessage(
        `İçe aktarıldı: ${result.notes} not, ${result.images} görsel.` +
          (parsed.skippedNotes ? ` (${parsed.skippedNotes} bozuk not atlandı)` : "") +
          (result.orphanImages ? ` (${result.orphanImages} yetim görsel alınmadı)` : "") +
          (result.failedImages ? ` (${result.failedImages} görsel doğrulanamadı)` : ""),
      );
    } catch (e) {
      setMessage(`İçe aktarma başarısız: ${String(e)}. Hiçbir veri değişmedi.`);
    } finally {
      setBusy(false);
    }
  }

  async function importZip(file: File) {
    setBusy(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const read = readZipSecurely(bytes);
      if (!read.ok || !read.files) {
        setMessage(`Geçersiz/riskli arşiv: ${read.error}. Hiçbir veri değişmedi.`);
        return;
      }
      const parsed = parseZipFiles(read.files);
      if (!parsed.ok) {
        setMessage(`Arşiv içeriği hatalı: ${parsed.error}. Hiçbir veri değişmedi.`);
        return;
      }
      const notesArr = (parsed.notes as { notes?: unknown[] })?.notes;
      const result = parseNotesBackup({
        format: "netdefter-notes-backup",
        version: 1,
        data: { notes: Array.isArray(notesArr) ? notesArr : [], images: [] },
      });
      if (!result.ok || !result.data) {
        setMessage("Arşivdeki notlar doğrulanamadı. Hiçbir veri değişmedi.");
        return;
      }
      // Görselin hangi nota ait olduğu, notların `imageIds` referansından
      // türetilir (ZIP manifesti görsel→not bağı taşımaz).
      const imageOwner = new Map<string, string>();
      for (const n of result.data.notes) {
        for (const iid of n.imageIds) imageOwner.set(iid, n.id);
      }
      const images: ImportImage[] = [];
      for (const entry of parsed.images ?? []) {
        const stem = entry.name.replace(/\.[^.]+$/, "");
        const owner = imageOwner.get(stem);
        if (!owner) continue; // yetim görsel: notu yok → alınmaz
        const ext = entry.name.slice(stem.length + 1).toLowerCase();
        const mime =
          ext === "jpg" || ext === "jpeg"
            ? "image/jpeg"
            : ext === "webp"
              ? "image/webp"
              : ext === "gif"
                ? "image/gif"
                : "image/png";
        images.push({
          id: stem,
          noteId: owner,
          name: entry.name,
          mime,
          blob: new Blob([entry.bytes as BlobPart], { type: mime }),
        });
      }
      const imported = await importNotesBackup({ notes: result.data.notes, images });
      await hydrate();
      setMessage(
        `ZIP içe aktarıldı: ${imported.notes} not, ${imported.images} görsel.` +
          (imported.orphanImages ? ` (${imported.orphanImages} yetim görsel alınmadı)` : ""),
      );
    } catch (e) {
      setMessage(`ZIP içe aktarma başarısız: ${String(e)}. Hiçbir veri değişmedi.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 border-t border-border p-3 text-xs">
      <div className="font-medium text-muted">Yedekleme</div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => void exportJson()}>
          <FileJson className="size-3.5" /> JSON indir
        </Button>
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => void exportZip()}>
          <FileArchive className="size-3.5" /> ZIP indir
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => jsonRef.current?.click()}>
          <Upload className="size-3.5" /> JSON birleştir
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => zipRef.current?.click()}>
          <Download className="size-3.5" /> ZIP içe al
        </Button>
      </div>
      <input
        ref={jsonRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void importJson(f);
          e.target.value = "";
        }}
      />
      <input
        ref={zipRef}
        type="file"
        accept="application/zip,.zip"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void importZip(f);
          e.target.value = "";
        }}
      />
      {message ? <p className="text-muted">{message}</p> : null}
    </div>
  );
}
