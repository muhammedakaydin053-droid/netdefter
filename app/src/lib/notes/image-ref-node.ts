/**
 * Tiptap `imageRef` düğümü — IndexedDB görseline referans.
 *
 * Kalıcı bir `src` yolu yazmak yanlış olur (blob URL'i oturumluk). Bunun
 * yerine JSON yalnızca `imageId` taşır; ekranda/export'ta gerçek veri
 * ayrıca çözülür (`hydrateImagesForExport`).
 */
import { Node, mergeAttributes } from "@tiptap/core";

export interface ImageRefAttrs {
  imageId: string;
  alt: string | null;
  caption: string | null;
  width: number | null;
  height: number | null;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    imageRef: {
      insertImageRef: (attrs: ImageRefAttrs) => ReturnType;
    };
  }
}

export const ImageRef = Node.create({
  name: "imageRef",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      imageId: { default: "" },
      alt: { default: null },
      caption: { default: null },
      width: { default: null },
      height: { default: null },
    };
  },

  parseHTML() {
    return [
      {
        tag: "figure[data-image-id]",
        getAttrs: (el) => {
          const node = el as HTMLElement;
          return {
            imageId: node.getAttribute("data-image-id") ?? "",
            alt: node.querySelector("img")?.getAttribute("alt") ?? null,
            caption: node.querySelector("figcaption")?.textContent ?? null,
          };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    // src kasıtlı olarak boş: export aşamasında gerçek veriyle doldurulur.
    return [
      "figure",
      mergeAttributes({ "data-image-id": HTMLAttributes.imageId }),
      ["img", { src: "", alt: HTMLAttributes.alt ?? "" }],
      ["figcaption", {}, HTMLAttributes.caption ?? ""],
    ];
  },

  addCommands() {
    return {
      insertImageRef:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs }),
    };
  },
});
