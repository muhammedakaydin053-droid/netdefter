/**
 * HTML export yardımcıları — görselleri `data:` URL olarak gömer.
 *
 * Tiptap `renderHTML` yalnızca `data-image-id` taşır ve `src` boş kalır;
 * tek dosya HTML export'unda `hydrateImagesForExport` her `src=""`'i gerçek
 * veriyle doldurur. ZIP yedeğinde görseller binary kalır (şişme yok).
 */
import { getImage } from "./images";
import { blobToDataUrl } from "./backup";

/** HTML içindeki `data-image-id` referanslarını toplar. */
export function collectImageIds(html: string): string[] {
  const ids: string[] = [];
  const re = /data-image-id="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    if (m[1] && !ids.includes(m[1])) ids.push(m[1]);
  }
  return ids;
}

/**
 * Boş `src` alanlarını gerçek görsel verisiyle doldurur.
 * Bulunamayan görsel için `src` boş bırakılır (sessizce atlanmaz → placeholder).
 */
export async function hydrateImagesForExport(html: string): Promise<string> {
  const ids = collectImageIds(html);
  let out = html;
  for (const id of ids) {
    const img = await getImage(id);
    const dataUrl = img ? await blobToDataUrl(img.blob) : "";
    const esc = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(<figure data-image-id="${esc}"[^>]*>\\s*<img\\s+)src=""`, "g");
    out = out.replace(re, `$1src="${dataUrl}"`);
  }
  return out;
}
