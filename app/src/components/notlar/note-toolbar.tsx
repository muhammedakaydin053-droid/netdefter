/**
 * Editör araç çubuğu — sade, tek satır, sabit (sticky).
 *
 * Yalnızca izinli biçimleri sunar; mevcut `--color-*` token'larıyla uyumlu.
 */
import type { Editor } from "@tiptap/react";
import { Bold, Italic, Underline, Highlighter, List, ListOrdered, ListChecks, Heading1, Heading2, Undo2, Redo2, ImagePlus } from "lucide-react";
import { cn } from "@/lib/utils";

/** Editörde tek tıkla eklenebilen matematik karakterleri. */
export const MATH_CHARS = ["²", "³", "√", "π", "∫", "≤", "≥", "∑", "∞", "α", "β", "θ", "Δ", "≠", "≈", "±", "×", "÷"];

function TB({
  active,
  onClick,
  title,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "grid size-8 place-items-center rounded-[var(--radius-xs)] text-muted transition-colors",
        "hover:bg-bg-elevated hover:text-fg",
        active && "bg-primary/10 text-primary",
      )}
    >
      {children}
    </button>
  );
}

export function NoteToolbar({ editor, onAddImage }: { editor: Editor | null; onAddImage: () => void }) {
  if (!editor) return null;
  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-0.5 border-b border-border bg-bg-elevated/95 px-2 py-1.5 backdrop-blur-sm">
      <TB title="Kalın" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
        <Bold className="size-4" />
      </TB>
      <TB title="İtalik" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <Italic className="size-4" />
      </TB>
      <TB title="Altı çizili" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}>
        <Underline className="size-4" />
      </TB>
      <TB title="Vurgu" active={editor.isActive("highlight")} onClick={() => editor.chain().focus().toggleHighlight().run()}>
        <Highlighter className="size-4" />
      </TB>
      <span className="mx-1 h-5 w-px bg-border" />
      <TB title="Başlık 1" active={editor.isActive("heading", { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
        <Heading1 className="size-4" />
      </TB>
      <TB title="Başlık 2" active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
        <Heading2 className="size-4" />
      </TB>
      <TB title="Madde listesi" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
        <List className="size-4" />
      </TB>
      <TB title="Numaralı liste" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
        <ListOrdered className="size-4" />
      </TB>
      <TB title="Görev listesi" active={editor.isActive("taskList")} onClick={() => editor.chain().focus().toggleTaskList().run()}>
        <ListChecks className="size-4" />
      </TB>
      <span className="mx-1 h-5 w-px bg-border" />
      <TB title="Geri al" onClick={() => editor.chain().focus().undo().run()}>
        <Undo2 className="size-4" />
      </TB>
      <TB title="Yinele" onClick={() => editor.chain().focus().redo().run()}>
        <Redo2 className="size-4" />
      </TB>
      <TB title="Görsel ekle" onClick={onAddImage}>
        <ImagePlus className="size-4" />
      </TB>
      <span className="mx-1 h-5 w-px bg-border" />
      <div className="flex flex-wrap items-center gap-0.5">
        {MATH_CHARS.map((ch) => (
          <button
            key={ch}
            type="button"
            title={`Ekle: ${ch}`}
            onClick={() => editor.chain().focus().insertContent(ch).run()}
            className="grid size-7 place-items-center rounded-[var(--radius-xs)] text-sm text-muted hover:bg-bg-elevated hover:text-fg"
          >
            {ch}
          </button>
        ))}
      </div>
    </div>
  );
}
