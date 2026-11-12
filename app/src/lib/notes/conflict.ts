/**
 * Çakışma çözümü UI kararı (O2).
 *
 * Çakışma çözüm aksiyonlarının dönüş `status` değerini, kullanıcıya
 * gösterilecek sonuca çevirir. Saf fonksiyonlardır (DOM/React gerekmez), bu
 * yüzden editör bileşeninden ayrı test edilebilir. Bileşen bu fonksiyonları
 * GERÇEKTEN kullanır; testler dolayısıyla gerçek davranışı doğrular.
 */
import type { Note } from "./types";

export type ConflictResolution =
  /** Başarı: editör `note` ile senkronlanır, banner kalkar. */
  | { action: "synced"; note: Note; blockAutosave: false }
  /** Başarısız: banner KORUNUR, editör dokunulmaz. */
  | { action: "keep-banner"; message: string; blockAutosave: boolean };

export const CONFLICT_MISSING_MESSAGE =
  "Bu not başka bir yerde silinmiş olabilir. Yerel içeriğiniz korundu ancak " +
  "henüz kaydedilmedi; silinen not otomatik olarak yeniden oluşturulmaz.";

export const CONFLICT_ERROR_MESSAGE =
  "Çakışma çözülemedi, hiçbir değişiklik yapılmadı. Lütfen tekrar deneyin.";

/**
 * `status` → UI niyeti.
 *  - `written` (+ kayıt mevcut): başarı → senkronla.
 *  - `missing`: not yok → banner korunur, autosave kilitlenir (silinen not
 *    kendiliğinden yeniden oluşmasın; yerel içerik kaybolmaz).
 *  - diğer/bilinmeyen (error vb.): güvenli başarısızlık → banner korunur,
 *    autosave çalışmaya devam eder (geçici hata kullanıcı yazarak düzelebilir).
 */
export function resolveConflictUi(
  status: string,
  current: Note | undefined,
): ConflictResolution {
  if (status === "written" && current) {
    return { action: "synced", note: current, blockAutosave: false };
  }
  if (status === "missing") {
    return { action: "keep-banner", message: CONFLICT_MISSING_MESSAGE, blockAutosave: true };
  }
  return { action: "keep-banner", message: CONFLICT_ERROR_MESSAGE, blockAutosave: false };
}

/**
 * `missing` sonrası autosave kilidi + `save()` sarmalayıcısı.
 *
 * Kilit açıkken yazma yapılmaz; dönen `"conflict"` durumu çakışma banner'ını
 * görünür tutar. Böylece silinen not kullanıcı açıkça işlem yapmadan
 * kendiliğinden yeniden oluşmaz.
 */
export function guardedSave(
  isBlocked: () => boolean,
  save: () => Promise<{ status: string }>,
): () => Promise<{ status: string }> {
  return async () => {
    if (isBlocked()) return { status: "conflict" };
    return save();
  };
}

export interface SingleFlight {
  readonly busy: boolean;
  /** `fn`'i çalıştırır; zaten çalışıyorsa hiçbir şey yapmaz (yeniden giriş koruması). */
  run(fn: () => Promise<void>): Promise<void>;
}

/**
 * Aynı anda yalnızca bir çalıştırmaya izin veren basit kilit.
 *
 * Çakışma çözümü sürerken iki butonun da tekrar çalışmasını engeller.
 * Kilit, işlev hata verse bile `finally` ile güvenle bırakılır.
 */
export function createSingleFlight(): SingleFlight {
  let running = false;
  return {
    get busy() {
      return running;
    },
    async run(fn) {
      if (running) return;
      running = true;
      try {
        await fn();
      } finally {
        running = false;
      }
    },
  };
}
