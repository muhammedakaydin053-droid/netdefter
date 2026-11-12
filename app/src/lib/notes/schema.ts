/**
 * Tiptap JSON şema doğrulaması — içe aktarımda güvenlik kapısı.
 *
 * Yalnızca izin verilen node/mark türleri kabul edilir; bilinmeyen tür, aşırı
 * derinlik/node sayısı veya geçersiz attribute reddedilir. Amaç: bozuk/kötü
 * niyetli belgenin sessizce içeri sızmasını engellemek.
 */

export const ALLOWED_NODES = new Set([
  "doc",
  "paragraph",
  "text",
  "heading",
  "bulletList",
  "orderedList",
  "listItem",
  "taskList",
  "taskItem",
  "blockquote",
  "codeBlock",
  "horizontalRule",
  "hardBreak",
  "imageRef",
]);

export const ALLOWED_MARKS = new Set([
  "bold",
  "italic",
  "underline",
  "strike",
  "code",
  "highlight",
  "link",
]);

export const MAX_DEPTH = 20;
export const MAX_NODES = 10000;
export const MAX_CHILDREN = 500;
export const MAX_MARKS_PER_NODE = 10;
export const MAX_TEXT_LEN = 50000;

export interface DocIssue {
  path: string;
  reason: string;
}

interface RawNode {
  type?: unknown;
  attrs?: unknown;
  content?: unknown;
  marks?: unknown;
  text?: unknown;
}

/** Belgeyi doğrular; geçerliyse boş dizi döner. */
export function validateTiptapDoc(doc: unknown): DocIssue[] {
  const issues: DocIssue[] = [];
  let nodeCount = 0;

  if (!doc || typeof doc !== "object" || (doc as RawNode).type !== "doc") {
    return [{ path: "$", reason: "belge 'doc' tipinde değil" }];
  }

  function walk(node: unknown, depth: number, path: string): void {
    if (depth > MAX_DEPTH) {
      issues.push({ path, reason: `derinlik ${MAX_DEPTH} aşıldı` });
      return;
    }
    if (!node || typeof node !== "object") {
      issues.push({ path, reason: "node nesne değil" });
      return;
    }
    nodeCount++;
    if (nodeCount > MAX_NODES) {
      issues.push({ path, reason: `node sayısı ${MAX_NODES} aşıldı` });
      return;
    }
    const n = node as RawNode;
    if (typeof n.type !== "string" || !ALLOWED_NODES.has(n.type)) {
      issues.push({ path, reason: `bilinmeyen node türü: ${String(n.type)}` });
      return;
    }

    if (n.type === "text") {
      if (typeof n.text !== "string") {
        issues.push({ path, reason: "text node metni yok" });
      } else if (n.text.length > MAX_TEXT_LEN) {
        issues.push({ path, reason: `metin ${MAX_TEXT_LEN} karakteri aşıyor` });
      }
    }

    if (n.marks !== undefined) {
      if (!Array.isArray(n.marks)) {
        issues.push({ path, reason: "marks dizi değil" });
      } else if (n.marks.length > MAX_MARKS_PER_NODE) {
        issues.push({ path, reason: `mark sayısı ${MAX_MARKS_PER_NODE} aşıldı` });
      } else {
        for (const m of n.marks) {
          const mark = m as { type?: unknown };
          if (typeof mark?.type !== "string" || !ALLOWED_MARKS.has(mark.type)) {
            issues.push({ path: `${path}/mark`, reason: `bilinmeyen mark: ${String(mark?.type)}` });
          }
        }
      }
    }

    if (n.content !== undefined) {
      if (!Array.isArray(n.content)) {
        issues.push({ path, reason: "content dizi değil" });
      } else if (n.content.length > MAX_CHILDREN) {
        issues.push({ path, reason: `çocuk sayısı ${MAX_CHILDREN} aşıldı` });
      } else {
        n.content.forEach((child, i) => walk(child, depth + 1, `${path}/${i}`));
      }
    }
  }

  walk(doc, 0, "$");
  return issues;
}

/** Boş Tiptap belgesi. */
export function emptyDoc(): { type: "doc"; content: unknown[] } {
  return { type: "doc", content: [{ type: "paragraph" }] };
}

/**
 * İçerik ağacındaki `imageRef` düğümlerinin `imageId` attribute'unu `idMap`
 * ile yeniden eşler (içe aktarmada görseller yeni kimlik aldığı için şarttır;
 * aksi hâlde gövdeye gömülü görseller eski, artık var olmayan kimliğe işaret
 * eder ve editörde sonsuza kadar "yükleniyor" durumunda kalır).
 *
 * Eşlenemeyen `imageRef` düğümleri düşürülür (haritada karşılığı olmayan görsel
 * içe alınmamıştır). Girdi değiştirilmez; yeni bir ağaç döner.
 */
export function remapImageRefIds(doc: unknown, idMap: Map<string, string>): unknown {
  if (!doc || typeof doc !== "object") return doc;
  const node = doc as { type?: unknown; attrs?: Record<string, unknown>; content?: unknown[] };

  if (node.type === "imageRef") {
    const oldId = typeof node.attrs?.imageId === "string" ? (node.attrs.imageId as string) : "";
    const newId = idMap.get(oldId);
    if (!newId) return null;
    return { ...node, attrs: { ...node.attrs, imageId: newId } };
  }

  if (Array.isArray(node.content)) {
    const mapped = node.content
      .map((child) => remapImageRefIds(child, idMap))
      .filter((child) => child !== null);
    return { ...node, content: mapped };
  }

  return node;
}

/**
 * İçerik ağacından belirtilen `imageId`'lere ait `imageRef` düğümlerini
 * çıkarır (görsel silindiğinde artık referans kalmasın diye). Diğer
 * görsellerin referanslarına DOKUNMAZ. Girdi değiştirilmez; yeni ağaç döner.
 */
export function removeImageRefs(doc: unknown, idsToRemove: Set<string>): unknown {
  if (!doc || typeof doc !== "object") return doc;
  const node = doc as { type?: unknown; attrs?: Record<string, unknown>; content?: unknown[] };

  if (node.type === "imageRef") {
    const id = typeof node.attrs?.imageId === "string" ? (node.attrs.imageId as string) : "";
    return idsToRemove.has(id) ? null : node;
  }

  if (Array.isArray(node.content)) {
    const kept = node.content
      .map((child) => removeImageRefs(child, idsToRemove))
      .filter((child) => child !== null);
    return { ...node, content: kept };
  }

  return node;
}
