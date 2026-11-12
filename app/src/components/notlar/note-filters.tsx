/**
 * Not filtreleri — görünüm sekmeleri, arama, sınav/ders filtresi.
 */
import { Search } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useNotesStore, selectCounts } from "@/lib/notes/store";
import { subjectsFor } from "@/lib/notes/curriculum";
import type { NoteView } from "@/lib/notes/search";
import { cn } from "@/lib/utils";

const VIEWS: { key: NoteView; label: string }[] = [
  { key: "active", label: "Notlar" },
  { key: "favorite", label: "Favoriler" },
  { key: "pinned", label: "Sabitler" },
  { key: "archived", label: "Arşiv" },
  { key: "trash", label: "Çöp" },
];

export function NoteFilters() {
  const filter = useNotesStore((s) => s.filter);
  const setFilter = useNotesStore((s) => s.setFilter);
  const setView = useNotesStore((s) => s.setView);
  const counts = useNotesStore(useShallow(selectCounts));

  const subjects = filter.exam === "all" ? [] : subjectsFor(filter.exam);

  return (
    <div className="space-y-2 border-b border-border p-3">
      <div className="flex flex-wrap gap-1">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            type="button"
            aria-pressed={filter.view === v.key}
            onClick={() => setView(v.key)}
            className={cn(
              "rounded-full px-2.5 py-1 text-xs transition-colors",
              filter.view === v.key ? "bg-primary text-primary-fg" : "bg-bg-elevated text-muted hover:text-fg",
            )}
          >
            {v.label}
            <span className="ml-1 tabular-nums opacity-70">{counts[v.key]}</span>
          </button>
        ))}
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-subtle" />
        <input
          value={filter.query}
          onChange={(e) => setFilter({ query: e.target.value })}
          placeholder="Ara: başlık, ders, konu, içerik"
          aria-label="Notlarda ara"
          className="h-9 w-full rounded-[var(--radius-sm)] border border-border bg-surface pl-7 pr-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
        />
      </div>

      <div className="flex gap-2">
        <select
          value={filter.exam}
          onChange={(e) => setFilter({ exam: e.target.value as typeof filter.exam, subject: "all" })}
          className="h-8 flex-1 rounded-[var(--radius-xs)] border border-border bg-surface px-2 text-xs"
          aria-label="Sınav filtresi"
        >
          <option value="all">Tüm sınavlar</option>
          <option value="TYT">TYT</option>
          <option value="AYT">AYT</option>
        </select>
        <select
          value={filter.subject}
          onChange={(e) => setFilter({ subject: e.target.value })}
          disabled={filter.exam === "all"}
          className="h-8 flex-1 rounded-[var(--radius-xs)] border border-border bg-surface px-2 text-xs disabled:opacity-50"
          aria-label="Ders filtresi"
        >
          <option value="all">Tüm dersler</option>
          {subjects.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
