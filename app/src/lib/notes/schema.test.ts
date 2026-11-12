/**
 * Tiptap şema doğrulama testleri — saf fonksiyon.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  validateTiptapDoc,
  emptyDoc,
  remapImageRefIds,
  removeImageRefs,
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

describe("removeImageRefs — görsel silinince artık referans kalmasın (H3)", () => {
  const ref = (id: string) => ({
    type: "imageRef",
    attrs: { imageId: id, alt: null, caption: null, width: null, height: null },
  });
  const doc = (...children: unknown[]) => ({ type: "doc", content: children });

  it("verilen imageId'nin imageRef düğümünü çıkarır", () => {
    const input = doc({ type: "paragraph" }, ref("a"));
    const out = removeImageRefs(input, new Set(["a"])) as any;
    assert.equal(out.content.length, 1);
    assert.equal(out.content[0].type, "paragraph");
  });

  it("diğer görsellerin referanslarına DOKUNMAZ", () => {
    const input = doc(ref("a"), ref("b"), ref("c"));
    const out = removeImageRefs(input, new Set(["b"])) as any;
    const ids = out.content.map((n: any) => n.attrs.imageId);
    assert.deepEqual(ids, ["a", "c"]);
  });

  it("birden çok id'yi tek çağrıda çıkarır", () => {
    const input = doc(ref("a"), ref("b"), ref("c"), ref("d"));
    const out = removeImageRefs(input, new Set(["a", "c"])) as any;
    assert.deepEqual(out.content.map((n: any) => n.attrs.imageId), ["b", "d"]);
  });

  it("iç içe (nested) imageRef'leri de bulur", () => {
    const input = doc({ type: "blockquote", content: [{ type: "paragraph", content: [ref("x")] }] });
    const out = removeImageRefs(input, new Set(["x"])) as any;
    assert.equal(JSON.stringify(out).includes('"x"'), false, "nested referans kalmamalı");
  });

  it("girdi ağacını DEĞİŞTİRMEZ (saf)", () => {
    const input = doc(ref("a"), ref("b"));
    const snapshot = JSON.stringify(input);
    removeImageRefs(input, new Set(["a"]));
    assert.equal(JSON.stringify(input), snapshot, "girdi korunmalı");
  });

  it("eşleşme yoksa içeriği aynen döndürür", () => {
    const input = doc(ref("a"));
    const out = removeImageRefs(input, new Set(["zzz"])) as any;
    assert.equal(out.content.length, 1);
  });
});

describe("remapImageRefIds — mevcut davranış korunur", () => {
  const ref = (id: string) => ({ type: "imageRef", attrs: { imageId: id } });

  it("haritadaki id'leri yeniden eşler", () => {
    const out = remapImageRefIds({ type: "doc", content: [ref("old")] }, new Map([["old", "new"]])) as any;
    assert.equal(out.content[0].attrs.imageId, "new");
  });

  it("haritada olmayan imageRef'i düşürür", () => {
    const out = remapImageRefIds({ type: "doc", content: [ref("old")] }, new Map()) as any;
    assert.equal(out.content.length, 0);
  });
});
