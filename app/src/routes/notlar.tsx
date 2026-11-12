/**
 * "Notlarım" ana sayfası — liste + editör + yedek paneli.
 *
 * Veri katmanı tamamen izole: IndexedDB `netdefter-notes`. Mevcut NetDefter
 * store'una (localStorage) hiç dokunulmaz.
 */
import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, NotebookPen } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useNotesStore, selectVisibleNotes } from "@/lib/notes/store";
import { emptyDoc } from "@/lib/notes/schema";
import { subjectsFor, topicsFor } from "@/lib/notes/curriculum";
import { Button } from "@/components/ui/button";
import { NoteCard } from "@/components/notlar/note-card";
import { NoteFilters } from "@/components/notlar/note-filters";
import { NoteEditor } from "@/components/notlar/note-editor";
import { NotesBackup } from "@/components/notlar/notes-backup";

export const Route = createFileRoute("/notlar")({ component: NotlarPage });

function NotlarPage() {
  const hydrated = useNotesStore((s) => s.hydrated);
  const loading = useNotesStore((s) => s.loading);
  const error = useNotesStore((s) => s.error);
  const activeNoteId = useNotesStore((s) => s.activeNoteId);
  const hydrate = useNotesStore((s) => s.hydrate);
  const setActiveNote = useNotesStore((s) => s.setActiveNote);
  const create = useNotesStore((s) => s.create);
  const notes = useNotesStore((s) => s.notes);
  const visible = useNotesStore(useShallow(selectVisibleNotes));

  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!hydrated && !loading) void hydrate();
  }, [hydrated, loading, hydrate]);

  const activeNote = useMemo(
    () => notes.find((n) => n.id === activeNoteId) ?? null,
    [notes, activeNoteId],
  );

  async function onCreate() {
    setCreating(true);
    try {
      const subject = subjectsFor("TYT")[0] ?? "";
      const note = await create({
        title: "Yeni not",
        exam: "TYT",
        subject,
        topics: topicsFor("TYT", subject)[0] ? [topicsFor("TYT", subject)[0]] : [],
        content: emptyDoc(),
      });
      setActiveNote(note.id);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="grid h-[calc(100dvh-8rem)] grid-cols-1 gap-3 lg:grid-cols-[22rem_1fr]">
      {/* Sol sütun: filtre + liste + yedek */}
      <aside className="flex min-h-0 flex-col overflow-hidden rounded-[var(--radius-md)] border border-border bg-bg-elevated">
        <div className="flex items-center justify-between px-3 py-2">
          <h1 className="flex items-center gap-2 font-display text-base font-semibold">
            <NotebookPen className="size-4" /> Notlarım
          </h1>
          <Button size="sm" onClick={() => void onCreate()} disabled={creating}>
            <Plus className="size-3.5" /> Yeni
          </Button>
        </div>
        <NoteFilters />
        <div className="min-h-0 flex-1 space-y-2 overflow-auto p-3">
          {error ? <p className="text-xs text-bad">{error}</p> : null}
          {!hydrated && loading ? <p className="text-xs text-subtle">Yükleniyor…</p> : null}
          {hydrated && visible.length === 0 ? (
            <p className="text-xs text-subtle">Bu görünümde not yok.</p>
          ) : null}
          {visible.map((n) => (
            <NoteCard key={n.id} note={n} selected={n.id === activeNoteId} onSelect={() => setActiveNote(n.id)} />
          ))}
        </div>
        <NotesBackup />
      </aside>

      {/* Sağ sütun: editör */}
      <section className="min-h-0 overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface">
        {activeNote ? (
          <NoteEditor key={activeNote.id} note={activeNote} />
        ) : (
          <div className="grid h-full place-items-center p-8 text-center text-sm text-subtle">
            <div>
              <NotebookPen className="mx-auto mb-2 size-8 opacity-40" />
              Bir not seçin veya yeni not oluşturun.
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
