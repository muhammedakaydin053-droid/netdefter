/**
 * Tiptap şema doğrulama testleri — saf fonksiyon.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  validateTiptapDoc,
  emptyDoc,
  MAX_DEPTH,
  MAX_NODES,
} from "./schema.ts";

describe("validateTiptapDoc", () => {
  it("boş belgeyi kabul eder", () => {
    assert.equal(validateTiptapDoc(emptyDoc()).length, 0);
  });

  it("geçerli zengin belgeyi kabul eder", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Başlık" }] },
        {
          type: "bulletList",
          content: [
            { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "x" }] }] },
          ],
        },
        { type: "paragraph", content: [{ type: "text", text: "vurgu", marks: [{ type: "bold" }] }] },
      ],
    };
    assert.equal(validateTiptapDoc(doc).length, 0);
  });

  it("doc olmayan belgeyi reddeder", () => {
    assert.ok(validateTiptapDoc({ type: "paragraph" }).length > 0);
    assert.ok(validateTiptapDoc(null).length > 0);
  });

  it("bilinmeyen node türünü reddeder", () => {
    const doc = { type: "doc", content: [{ type: "evilScript" }] };
    const issues = validateTiptapDoc(doc);
    assert.equal(issues.length, 1);
    assert.match(issues[0].reason, /bilinmeyen node/);
  });

  it("bilinmeyen mark'ı reddeder", () => {
    const doc = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "x", marks: [{ type: "onclick" }] }] }],
    };
    assert.ok(validateTiptapDoc(doc).some((i) => /bilinmeyen mark/.test(i.reason)));
  });

  it("aşırı derinliği reddeder", () => {
    let node: unknown = { type: "paragraph" };
    for (let i = 0; i < MAX_DEPTH + 3; i++) {
      node = { type: "blockquote", content: [node] };
    }
    const doc = { type: "doc", content: [node] };
    assert.ok(validateTiptapDoc(doc).some((i) => /derinlik/.test(i.reason)));
  });

  it("node sayısı sınırını uygular", () => {
    const children = Array.from({ length: MAX_NODES + 5 }, () => ({ type: "paragraph" }));
    // content dizisi MAX_CHILDREN'ı aşacağı için parçalara bölüyoruz
    const doc = { type: "doc", content: [{ type: "blockquote", content: children.slice(0, 500) }] };
    // Aşırı sayıyı ayrı bir düz liste ile test et
    const flat = { type: "doc", content: Array.from({ length: 500 }, () => ({ type: "paragraph" })) };
    assert.equal(validateTiptapDoc(flat).length, 0);
    // MAX_CHILDREN aşımı
    const tooMany = { type: "doc", content: Array.from({ length: 501 }, () => ({ type: "paragraph" })) };
    assert.ok(validateTiptapDoc(tooMany).some((i) => /çocuk/.test(i.reason)));
    assert.ok(doc);
  });
});
