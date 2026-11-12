/**
 * Not editörü — Tiptap + autosave + görsel ekleme.
 *
 * Kalıcılık: içerik 500 ms debounce ile `update` üzerinden yazılır; durum
 * çubuğu gerçek yazma sonucunu gösterir ("skipped" ≠ "saved").
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EditorContent, useEditor, ReactNodeViewRenderer, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TaskList, TaskItem } from "@tiptap/extension-list";
import Highlight from "@tiptap/extension-highlight";
import Placeholder from "@tiptap/extension-placeholder";
import type { JSONContent } from "@tiptap/core";
import { useNotesStore } from "@/lib/notes/store";
import { Autosave, attachLifecycleFlush, type SaveState } from "@/lib/notes/autosave";
import {
  resolveConflictUi,
  createSingleFlight,
  guardedSave,
  CONFLICT_ERROR_MESSAGE,
} from "@/lib/notes/conflict";
import { ImageRef } from "@/lib/notes/image-ref-node";
import { createImage } from "@/lib/notes/images";
import { emptyDoc, removeImageRefs } from "@/lib/notes/schema";
import { subjectsFor, topicsFor } from "@/lib/notes/curriculum";
import type { Exam, Note, NoteTag } from "@/lib/notes/types";
import { NOTE_TAGS } from "@/lib/notes/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NoteToolbar } from "./note-toolbar";
import { ImageRefView } from "./image-ref-view";
import { ImageGallery } from "./image-gallery";

const SAVE_LABEL: Record<SaveState, string> = {
  idle: "",
  saving: "Kaydediliyor…",
  saved: "Kaydedildi",
  error: "Kaydedilemedi",
  conflict: "Çakışma var",
};

export function NoteEditor({ note }: { note: Note }) {
  const update = useNotesStore((s) => s.update);
  const refreshImages = useNotesStore((s) => s.refreshImages);
  const resolveKeepLocal = useNotesStore((s) => s.resolveKeepLocal);
  const resolveKeepDb = useNotesStore((s) => s.resolveKeepDb);

  const [title, setTitle] = useState(note.title);
  const [exam, setExam] = useState<Exam>(note.exam);
  const [subject, setSubject] = useState(note.subject);
  const [topic, setTopic] = useState(note.topics[0] ?? "");
  const [tags, setTags] = useState<NoteTag[]>(note.tags);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [conflictMessage, setConflictMessage] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);

  // Çakışma çözümü sürerken iki butonun da tekrar çalışmasını engeller.
  const conflictLock = useRef(createSingleFlight()).current;

  // `missing` sonrası autosave kilidi: silinen not kendiliğinden yeniden
  // oluşmasın diye save() bu bayrak açıkken yazmaz (durumu "conflict" tutar).
  const autosaveBlockedRef = useRef(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Güncel taslağı autosave'e taşımak için ref (stale closure önlenir).
  const draftRef = useRef({ title, exam, subject, topic, tags, content: note.content });
  draftRef.current = { title, exam, subject, topic, tags, content: draftRef.current.content };

  const autosave = useMemo(
    () =>
      new Autosave({
        delayMs: 500,
        save: guardedSave(
          () => autosaveBlockedRef.current,
          async () => {
            const d = draftRef.current;
            const current = useNotesStore.getState().notes.find((n) => n.id === note.id);
            if (!current) return { status: "missing" };
            const res = await update({
              ...current,
              title: d.title,
              exam: d.exam,
              subject: d.subject,
              topics: d.topic ? [d.topic] : [],
              tags: d.tags,
              content: d.content as Note["content"],
            });
            // `missing`: not başka sekmede kalıcı silinmiş. Çakışma banner'ını
            // aç ki kullanıcı bilinçli karar versin; not sessizce dirilmesin.
            if (res.status === "missing") return { status: "conflict" };
            return res;
          },
        ),
        onState: setSaveState,
      }),
    [note.id, update],
  );

  useEffect(() => {
    const detach = attachLifecycleFlush(autosave);
    return detach;
  }, [autosave]);

  useEffect(
    () => () => {
      // Unmount'ta bekleyen yazmayı dene. Bu bir "garanti" değildir:
      // IndexedDB yazması sayfa donmadan önce bitmeyebilir (bkz. autosave.ts).
      void autosave.flush();
      autosave.dispose();
    },
    [autosave],
  );

  // Çakışma anında kullanıcının karar vermesi için yerel taslağı üretir.
  function buildLocalDraft(): Note | null {
    const current = useNotesStore.getState().notes.find((n) => n.id === note.id);
    if (!current) return null;
    const d = draftRef.current;
    return {
      ...current,
      title: d.title,
      exam: d.exam,
      subject: d.subject,
      topics: d.topic ? [d.topic] : [],
      tags: d.tags,
      content: d.content as Note["content"],
    };
  }

  /** Editörü verilen kaydın içeriğiyle senkronlar (yerel taslağı günceller). */
  function syncEditorTo(record: Note) {
    setTitle(record.title);
    setExam(record.exam);
    setSubject(record.subject);
    setTopic(record.topics[0] ?? "");
    setTags(record.tags);
    draftRef.current = {
      title: record.title,
      exam: record.exam,
      subject: record.subject,
      topic: record.topics[0] ?? "",
      tags: record.tags,
      content: record.content,
    };
    editor?.commands.setContent((record.content as JSONContent) ?? emptyDoc());
  }

  /**
   * Çakışma çözümünü çalıştırır: bekleyen autosave'i durdurur, sonucu
   * `resolveConflictUi` ile yorumlar. Başarıda editörü senkronlar ve banner'ı
   * kaldırır; `error`/`missing`/bilinmeyen durumda banner'ı KORUR.
   */
  async function runConflictResolution(
    resolve: (local: Note) => Promise<{ status: string }>,
  ): Promise<void> {
    await conflictLock.run(async () => {
      setResolving(true);
      setConflictMessage(null);
      try {
        const local = buildLocalDraft();
        if (!local) {
          setConflictMessage(CONFLICT_ERROR_MESSAGE);
          return;
        }
        // Eski revision ile yarışmasın: bekleyen debounce'u iptal et,
        // yürüyen yazmayı bekle (çözüm doğrudan repository'ye yazar).
        autosave.dispose();
        await autosave.idle();

        const res = await resolve(local);
        const current = useNotesStore.getState().notes.find((n) => n.id === note.id);
        const decision = resolveConflictUi(res.status, current);
        if (decision.action === "synced") {
          autosaveBlockedRef.current = false;
          syncEditorTo(decision.note);
          setSaveState("idle");
        } else {
          // `missing`: silinen not kendiliğinden yeniden oluşmasın diye kilitle.
          autosaveBlockedRef.current = decision.blockAutosave;
          setConflictMessage(decision.message);
        }
      } catch {
        setConflictMessage(CONFLICT_ERROR_MESSAGE);
      } finally {
        setResolving(false);
      }
    });
  }

  function onConflictKeepLocal() {
    return runConflictResolution((local) => resolveKeepLocal(local));
  }

  function onConflictKeepDb() {
    return runConflictResolution((local) => resolveKeepDb(local));
  }

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      TaskList,
      TaskItem.configure({ nested: true }),
      Highlight,
      Placeholder.configure({ placeholder: "Notunu yaz…" }),
      ImageRef.extend({ addNodeView: () => ReactNodeViewRenderer(ImageRefView) }),
    ],
    content: (note.content as JSONContent) ?? emptyDoc(),
    onUpdate: ({ editor: e }) => {
      draftRef.current.content = e.getJSON() as unknown as Note["content"];
      autosave.schedule();
    },
    editorProps: {
      attributes: {
        class:
          "prose prose-sm max-w-none min-h-[40vh] px-3 py-2 text-sm text-fg focus:outline-none",
      },
    },
  }) as Editor | null;

  // Not değişince editörü tazele.
  useEffect(() => {
    setTitle(note.title);
    setExam(note.exam);
    setSubject(note.subject);
    setTopic(note.topics[0] ?? "");
    setTags(note.tags);
    draftRef.current.content = note.content;
    editor?.commands.setContent((note.content as JSONContent) ?? emptyDoc());
  }, [note.id, editor]); // eslint-disable-line react-hooks/exhaustive-deps

  const subjects = subjectsFor(exam);
  const topics = topicsFor(exam, subject);

  const onPickFiles = useCallback(
    async (files: FileList | null) => {
      if (!files) return;
      for (const file of Array.from(files)) {
        const res = await createImage({
          noteId: note.id,
          name: file.name,
          mime: file.type,
          blob: file,
        });
        if (res.status === "created" && res.id) {
          const current = useNotesStore.getState().notes.find((n) => n.id === note.id);
          if (current) {
            await update({ ...current, imageIds: [...current.imageIds, res.id] });
          }
          editor?.chain().focus().insertImageRef({
            imageId: res.id,
            alt: null,
            caption: null,
            width: null,
            height: null,
          }).run();
        }
      }
      await refreshImages();
      autosave.flush();
    },
    [note.id, editor, update, refreshImages, autosave],
  );

  // Görsel silinince editör içeriğindeki `imageRef` düğümlerini de kaldır
  // (aksi hâlde düğüm "Görsel yükleniyor…" olarak takılı kalır). Diğer
  // görsellerin referanslarına dokunulmaz. Not güncellemesi TEK atomik yazma;
  // kaydedilmemiş düzenlemeler kaybolmasın diye güncel taslak (draft) esas alınır.
  const onImageDeleted = useCallback(
    async (imageId: string): Promise<{ status: string }> => {
      const current = useNotesStore.getState().notes.find((n) => n.id === note.id);
      if (!current) return { status: "missing" };
      const d = draftRef.current;
      const nextContent = removeImageRefs(d.content, new Set([imageId])) as Note["content"];
      draftRef.current.content = nextContent;
      editor?.commands.setContent(nextContent as JSONContent, { emitUpdate: false });
      return update({
        ...current,
        title: d.title,
        exam: d.exam,
        subject: d.subject,
        topics: d.topic ? [d.topic] : [],
        tags: d.tags,
        imageIds: current.imageIds.filter((x) => x !== imageId),
        content: nextContent,
      });
    },
    [note.id, editor, update],
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <Input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            autosave.schedule();
          }}
          placeholder="Başlık"
          className="h-9 flex-1"
          aria-label="Not başlığı"
        />
        <span className="min-w-24 text-right text-xs text-muted" aria-live="polite">
          {SAVE_LABEL[saveState]}
        </span>
      </div>

      {saveState === "conflict" ? (
        <div
          role="alert"
          className="flex flex-col gap-2 border-b border-border bg-bad-bg px-3 py-2 text-xs text-bad"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex-1">
              Bu not başka bir sekmede değiştirilmiş. Ne yapmak istersiniz?
            </span>
            <Button
              size="sm"
              variant="secondary"
              disabled={resolving}
              onClick={() => void onConflictKeepLocal()}
            >
              Yerel değişikliklerimi koru
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={resolving}
              onClick={() => void onConflictKeepDb()}
            >
              Veritabanındaki sürümü yükle
            </Button>
          </div>
          {conflictMessage ? (
            <p role="status" className="text-bad">
              {conflictMessage}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2 text-xs">
        <select
          value={exam}
          onChange={(e) => {
            const next = e.target.value as Exam;
            setExam(next);
            const firstSubject = subjectsFor(next)[0] ?? "";
            setSubject(firstSubject);
            setTopic(topicsFor(next, firstSubject)[0] ?? "");
            autosave.schedule();
          }}
          className="h-8 rounded-[var(--radius-xs)] border border-border bg-surface px-2"
          aria-label="Sınav"
        >
          <option value="TYT">TYT</option>
          <option value="AYT">AYT</option>
        </select>
        <select
          value={subject}
          onChange={(e) => {
            setSubject(e.target.value);
            setTopic(topicsFor(exam, e.target.value)[0] ?? "");
            autosave.schedule();
          }}
          className="h-8 rounded-[var(--radius-xs)] border border-border bg-surface px-2"
          aria-label="Ders"
        >
          {subjects.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select
          value={topic}
          onChange={(e) => {
            setTopic(e.target.value);
            autosave.schedule();
          }}
          className="h-8 rounded-[var(--radius-xs)] border border-border bg-surface px-2"
          aria-label="Konu"
        >
          {topics.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <div className="flex flex-wrap items-center gap-1">
          {NOTE_TAGS.map((tag) => (
            <button
              key={tag}
              type="button"
              aria-pressed={tags.includes(tag)}
              onClick={() => {
                setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
                autosave.schedule();
              }}
              className={`rounded-full px-2 py-0.5 text-[11px] ${
                tags.includes(tag) ? "bg-primary text-primary-fg" : "bg-bg-elevated text-muted"
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
        <Button size="sm" variant="secondary" onClick={() => fileInputRef.current?.click()}>
          Görsel ekle
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          multiple
          hidden
          onChange={(e) => void onPickFiles(e.target.files)}
        />
      </div>

      <NoteToolbar editor={editor} onAddImage={() => fileInputRef.current?.click()} />

      <div className="min-h-0 flex-1 overflow-auto">
        <EditorContent editor={editor} />
      </div>

      <ImageGallery note={note} onDeleted={onImageDeleted} />
    </div>
  );
}
