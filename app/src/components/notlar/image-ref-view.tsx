/**
 * Görsel düğümü — `imageRef` node'u için React NodeView.
 *
 * IndexedDB blob'unu objectURL ile gösterir; `acquireObjectURL` ref sayacı
 * sayesinde aynı görsel birden çok yerde güvenle kullanılır.
 */
import { useEffect, useState } from "react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { acquireObjectURL, releaseObjectURL } from "@/lib/notes/images";

export function ImageRefView({ node, selected }: NodeViewProps) {
  const imageId = node.attrs.imageId as string;
  const caption = (node.attrs.caption as string | null) ?? null;
  const alt = (node.attrs.alt as string | null) ?? "";
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let acquired = false;
    void acquireObjectURL(imageId).then((u) => {
      if (!active) return;
      if (u) acquired = true;
      setUrl(u);
    });
    return () => {
      active = false;
      if (acquired) releaseObjectURL(imageId);
    };
  }, [imageId]);

  return (
    <NodeViewWrapper
      className={`my-2 rounded-[var(--radius-sm)] border ${selected ? "border-primary" : "border-border"} bg-surface p-2`}
      data-image-id={imageId}
    >
      {url ? (
        <img src={url} alt={alt} className="max-h-80 w-auto rounded-[var(--radius-xs)]" />
      ) : (
        <div className="grid h-24 place-items-center text-xs text-subtle">Görsel yükleniyor…</div>
      )}
      {caption ? <div className="mt-1 text-center text-xs text-muted">{caption}</div> : null}
    </NodeViewWrapper>
  );
}
