/**
 * Arama/filtreleme/sıralama testleri — saf fonksiyonlar (vite'sız çalışır).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { filterAndSortNotes, noteCounts, docToText, DEFAULT_FILTER } from "./search.ts";
import type { Note } from "./types.ts";

function note(over: Partial<Note>): Note {
  return {
    id: "n1",
    title: "Not",
    exam: "TYT",
    subject: "Matematik",
    topics: ["Temel Kavramlar"],
    content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "içerik" }] }] },
    imageIds: [],
    tags: [],
    favorite: false,
    pinned: false,
    archived: false,
    deletedAt: null,
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
    revision: 1,
    baseRevision: 0,
    contentHash: "h",
    schemaVersion: 1,
    ...over,
  };
}

describe("docToText", () => {
  it("düz metni tüm node'lardan toplar", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Merhaba" }] },
        { type: "paragraph", content: [{ type: "text", text: "dünya" }] },
      ],
    };
    assert.equal(docToText(doc), "Merhaba dünya");
  });
});

describe("filterAndSortNotes — görünümler", () => {
  const notes = [
    note({ id: "a", title: "Aktif", updatedAt: "2026-11-02T00:00:00.000Z" }),
    note({ id: "f", title: "Favori", favorite: true, updatedAt: "2026-11-03T00:00:00.000Z" }),
    note({ id: "p", title: "Sabit", pinned: true, updatedAt: "2026-11-01T00:00:00.000Z" }),
    note({ id: "ar", title: "Arşiv", archived: true }),
    note({ id: "t", title: "Çöp", deletedAt: "2026-11-04T00:00:00.000Z" }),
  ];

  it("aktif görünüm çöp ve arşivi gizler", () => {
    const r = filterAndSortNotes(notes, DEFAULT_FILTER);
    assert.deepEqual(r.map((n) => n.id).sort(), ["a", "f", "p"]);
  });

  it("sabitlenmiş not en üstte", () => {
    const r = filterAndSortNotes(notes, DEFAULT_FILTER);
    assert.equal(r[0].id, "p");
  });

  it("çöp görünümü yalnızca çöptekileri verir", () => {
    const r = filterAndSortNotes(notes, { ...DEFAULT_FILTER, view: "trash" });
    assert.deepEqual(r.map((n) => n.id), ["t"]);
  });

  it("arşiv görünümü yalnızca arşivi verir", () => {
    const r = filterAndSortNotes(notes, { ...DEFAULT_FILTER, view: "archived" });
    assert.deepEqual(r.map((n) => n.id), ["ar"]);
  });

  it("favori görünümü yalnızca favorileri verir", () => {
    const r = filterAndSortNotes(notes, { ...DEFAULT_FILTER, view: "favorite" });
    assert.deepEqual(r.map((n) => n.id), ["f"]);
  });
});

describe("filterAndSortNotes — arama ve filtre", () => {
  const notes = [
    note({ id: "m", title: "Türev", subject: "Matematik", exam: "TYT" }),
    note({ id: "f", title: "Newton", subject: "Fizik", exam: "AYT", topics: ["Hareket"] }),
  ];

  it("başlıkta arar (Türkçe küçük harf duyarsız)", () => {
    const r = filterAndSortNotes(notes, { ...DEFAULT_FILTER, query: "türev" });
    assert.deepEqual(r.map((n) => n.id), ["m"]);
  });

  it("ders/konu içinde arar", () => {
    const r = filterAndSortNotes(notes, { ...DEFAULT_FILTER, query: "hareket" });
    assert.deepEqual(r.map((n) => n.id), ["f"]);
  });

  it("sınav filtresi uygular", () => {
    const r = filterAndSortNotes(notes, { ...DEFAULT_FILTER, exam: "AYT" });
    assert.deepEqual(r.map((n) => n.id), ["f"]);
  });

  it("ders filtresi uygular", () => {
    const r = filterAndSortNotes(notes, { ...DEFAULT_FILTER, subject: "Fizik" });
    assert.deepEqual(r.map((n) => n.id), ["f"]);
  });
});

describe("noteCounts", () => {
  it("rozet sayılarını doğru hesaplar", () => {
    const notes = [
      note({ id: "1" }),
      note({ id: "2", favorite: true }),
      note({ id: "3", pinned: true }),
      note({ id: "4", archived: true }),
      note({ id: "5", deletedAt: "2026-11-04T00:00:00.000Z" }),
    ];
    const c = noteCounts(notes);
    assert.deepEqual(c, { active: 3, favorite: 1, pinned: 1, archived: 1, trash: 1 });
  });
});
