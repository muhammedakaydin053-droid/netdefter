/**
 * İçerik özetleri (hash) — çakışma denetimi için.
 *
 * KRİTİK (Rev.7): Hash hesaplaması `crypto.subtle` ile ASENKRON'dur. Bir
 * IndexedDB transaction'ı içinde IDB dışı bir async işlem await edilirse
 * transaction otomatik kapanır (`TransactionInactiveError`). Bu yüzden tüm
 * hash'ler transaction DIŞINDA hesaplanıp içeri alınır.
 */

async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Not içeriği: başlık + sınav/ders/konular + Tiptap JSON. Görseller KATILMAZ. */
export function noteHashSource(input: {
  title: string;
  exam: string;
  subject: string;
  topics: string[];
  content: unknown;
}): string {
  return JSON.stringify({
    title: input.title,
    exam: input.exam,
    subject: input.subject,
    topics: input.topics,
    content: input.content,
  });
}

export function noteHash(input: Parameters<typeof noteHashSource>[0]): Promise<string> {
  return sha256Hex(noteHashSource(input));
}

/** Görsel meta: yalnızca 4 meta alanı. Blob write-once olduğu için KATILMAZ. */
export function imageMetaHashSource(input: {
  caption: string | null;
  alt: string | null;
  width: number | null;
  height: number | null;
}): string {
  return JSON.stringify({
    caption: input.caption,
    alt: input.alt,
    width: input.width,
    height: input.height,
  });
}

export function imageMetaHash(input: Parameters<typeof imageMetaHashSource>[0]): Promise<string> {
  return sha256Hex(imageMetaHashSource(input));
}
