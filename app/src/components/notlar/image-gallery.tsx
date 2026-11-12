/**
 * Görsel galerisi — ekleme, önizleme, büyütme, silme ve açıklama.
 *
 * Blob'lar IndexedDB'de; gösterim `acquireObjectURL` ref sayacı üzerinden.
 */
import { useEffect, useState } from "react";
import { Trash2, Maximize2, X } from "lucide-react";
import { useNotesStore } from "@/lib/notes/store";
import { acquireObjectURL, releaseObjectURL, updateImageMeta, deleteImage } from "@/lib/notes/images";
import type { Note, NoteImage } from "@/lib/notes/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function Thumb({ image, onOpen }: { image: NoteImage; onOpen: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    let acquired = false;
    void acquireObjectURL(image.id).then((u) => {
      if (!active) return;
      if (u) acquired = true;
      setUrl(u);
    });
    return () => {
      active = false;
      if (acquired) releaseObjectURL(image.id);
    };
  }, [image.id]);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative size-20 overflow-hidden rounded-[var(--radius-xs)] border border-border bg-surface"
      title={image.name}
    >
      {url ? (
        <img src={url} alt={image.alt ?? image.name} className="size-full object-cover" />
      ) : (
        <span className="grid size-full place-items-center text-[10px] text-subtle">…</span>
      )}
      <span className="absolute inset-0 grid place-items-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
        <Maximize2 className="size-4 text-white" />
      </span>
    </button>
  );
}

export function ImageGallery({ note }: { note: Note }) {
  const allImages = useNotesStore((s) => s.images);
  const refreshImages = useNotesStore((s) => s.refreshImages);
  const update = useNotesStore((s) => s.update);
  const [openId, setOpenId] = useState<string | null>(null);
  const [openUrl, setOpenUrl] = useState<string | null>(null);
  const [captionDraft, setCaptionDraft] = useState("");

  const images = allImages.filter((i) => note.imageIds.includes(i.id));

  useEffect(() => {
    if (!openId) {
      setOpenUrl(null);
      return;
    }
    let active = true;
    let acquired = false;
    void acquireObjectURL(openId).then((u) => {
      if (!active) return;
      if (u) acquired = true;
      setOpenUrl(u);
    });
    return () => {
      active = false;
      if (acquired) releaseObjectURL(openId);
    };
  }, [openId]);

  useEffect(() => {
    const img = images.find((i) => i.id === openId);
    setCaptionDraft(img?.caption ?? "");
  }, [openId, images]);

  if (images.length === 0) return null;

  async function onDelete(id: string) {
    await deleteImage(id);
    const current = useNotesStore.getState().notes.find((n) => n.id === note.id);
    if (current) await update({ ...current, imageIds: current.imageIds.filter((x) => x !== id) });
    await refreshImages();
    setOpenId(null);
  }

  async function onSaveCaption() {
    const img = images.find((i) => i.id === openId);
    if (!img) return;
    await updateImageMeta(img.id, { caption: captionDraft || null }, img.revision);
    await refreshImages();
    setOpenId(null);
  }

  return (
    <div className="border-t border-border px-3 py-2">
      <div className="mb-1.5 text-xs text-muted">Görseller ({images.length})</div>
      <div className="flex flex-wrap gap-2">
        {images.map((img) => (
          <Thumb key={img.id} image={img} onOpen={() => setOpenId(img.id)} />
        ))}
      </div>

      {openId ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setOpenId(null)}
        >
          <div className="max-h-full w-full max-w-3xl overflow-auto rounded-[var(--radius-md)] bg-bg p-4" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium">Görsel</span>
              <Button size="icon" variant="ghost" onClick={() => setOpenId(null)} aria-label="Kapat">
                <X className="size-4" />
              </Button>
            </div>
            {openUrl ? <img src={openUrl} alt="" className="mx-auto max-h-[60vh] w-auto rounded-[var(--radius-sm)]" /> : null}
            <div className="mt-3 flex items-center gap-2">
              <Input
                value={captionDraft}
                onChange={(e) => setCaptionDraft(e.target.value)}
                placeholder="Açıklama (boş bırakınca temizlenir)"
                aria-label="Görsel açıklaması"
              />
              <Button size="sm" onClick={() => void onSaveCaption()}>Kaydet</Button>
              <Button size="sm" variant="danger" onClick={() => void onDelete(openId)} aria-label="Görseli sil">
                <Trash2 className="size-4" />
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
