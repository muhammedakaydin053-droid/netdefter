/**
 * Not kartı — liste öğesi; favori/sabitle/arşiv/çöp eylemleri.
 */
import { useState } from "react";
import { Star, Pin, Archive, Trash2, RotateCcw } from "lucide-react";
import type { Note } from "@/lib/notes/types";
import { useNotesStore } from "@/lib/notes/store";
import { docToText } from "@/lib/notes/search";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "./confirm-dialog";

function preview(note: Note): string {
  const text = docToText(note.content).trim();
  return text.length > 120 ? `${text.slice(0, 120)}…` : text;
}

export function NoteCard({ note, selected, onSelect }: { note: Note; selected: boolean; onSelect: () => void }) {
  const toggleFavorite = useNotesStore((s) => s.toggleFavorite);
  const togglePinned = useNotesStore((s) => s.togglePinned);
  const toggleArchived = useNotesStore((s) => s.toggleArchived);
  const remove = useNotesStore((s) => s.remove);
  const restore = useNotesStore((s) => s.restore);
  const purge = useNotesStore((s) => s.purge);
  const [confirmPurge, setConfirmPurge] = useState(false);

  const inTrash = note.deletedAt !== null;

  return (
    <div
      className={cn(
        "rounded-[var(--radius-sm)] border bg-surface p-3 transition-colors",
        selected ? "border-primary" : "border-border hover:border-primary/40",
      )}
    >
      <button type="button" className="block w-full text-left" onClick={onSelect}>
        <div className="flex items-start gap-2">
          {note.pinned ? <Pin className="mt-0.5 size-3.5 shrink-0 text-accent" /> : null}
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{note.title || "(başlıksız)"}</span>
          {note.favorite ? <Star className="size-3.5 shrink-0 fill-accent text-accent" /> : null}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-muted">
          <span className="rounded-full bg-bg-elevated px-1.5 py-0.5">{note.exam}</span>
          <span className="rounded-full bg-bg-elevated px-1.5 py-0.5">{note.subject}</span>
          {note.topics[0] ? <span className="truncate">{note.topics[0]}</span> : null}
        </div>
        {preview(note) ? <p className="mt-1 line-clamp-2 text-xs text-subtle">{preview(note)}</p> : null}
      </button>

      <div className="mt-2 flex items-center gap-0.5">
        {inTrash ? (
          <>
            <IconBtn title="Geri al" onClick={() => void restore(note.id)}><RotateCcw className="size-3.5" /></IconBtn>
            <IconBtn title="Kalıcı sil" onClick={() => setConfirmPurge(true)}><Trash2 className="size-3.5" /></IconBtn>
          </>
        ) : (
          <>
            <IconBtn title="Favori" active={note.favorite} onClick={() => void toggleFavorite(note.id)}><Star className="size-3.5" /></IconBtn>
            <IconBtn title="Sabitle" active={note.pinned} onClick={() => void togglePinned(note.id)}><Pin className="size-3.5" /></IconBtn>
            <IconBtn title="Arşivle" active={note.archived} onClick={() => void toggleArchived(note.id)}><Archive className="size-3.5" /></IconBtn>
            <IconBtn title="Çöpe taşı" onClick={() => void remove(note.id)}><Trash2 className="size-3.5" /></IconBtn>
          </>
        )}
      </div>

      <ConfirmDialog
        open={confirmPurge}
        title="Notu kalıcı sil"
        description={`"${note.title || "(başlıksız)"}" ve bağlı görselleri kalıcı olarak silinecek. Bu işlem geri alınamaz.`}
        confirmLabel="Kalıcı sil"
        onConfirm={() => {
          setConfirmPurge(false);
          void purge(note.id);
        }}
        onCancel={() => setConfirmPurge(false)}
      />
    </div>
  );
}

function IconBtn({
  title,
  active,
  onClick,
  children,
}: {
  title: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "grid size-7 place-items-center rounded-[var(--radius-xs)] text-muted hover:bg-bg-elevated hover:text-fg",
        active && "text-accent",
      )}
    >
      {children}
    </button>
  );
}
