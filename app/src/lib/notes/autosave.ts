/**
 * Autosave — 500 ms debounce + güvenli SIRALI kuyruk.
 *
 * Kurallar (Rev.3/Rev.8):
 *  - Yazmalar sırayla çalışır; hiçbiri diğerini geçemez.
 *  - Kuyrukta bir görev hata verirse `.catch` ZİNCİRİN İÇİNDE tutulur →
 *    zincir reddedilmiş hâlde kilitlenmez, sonraki yazmalar çalışır.
 *  - Durum: "saved" YALNIZCA yazma gerçekten olduğunda; "skipped"/"identical"
 *    kaydetmez ve "saved" göstermez.
 */

export type SaveState = "idle" | "saving" | "saved" | "error" | "conflict";

export interface AutosaveOptions {
  /** Debounce süresi (ms). Varsayılan 500. */
  delayMs?: number;
  /** Tek bir yazma denemesi. */
  save: () => Promise<{ status: string }>;
  /** Durum değişince çağrılır (UI göstergesi). */
  onState?: (state: SaveState) => void;
  /** Hata olunca çağrılır. */
  onError?: (err: unknown) => void;
}

export class Autosave {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private state: SaveState = "idle";
  private readonly delayMs: number;
  private readonly opts: AutosaveOptions;

  constructor(opts: AutosaveOptions) {
    this.opts = opts;
    this.delayMs = opts.delayMs ?? 500;
  }

  getState(): SaveState {
    return this.state;
  }

  private setState(s: SaveState): void {
    this.state = s;
    this.opts.onState?.(s);
  }

  /** Değişiklik bildirimi — debounce eder. */
  schedule(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, this.delayMs);
  }

  /** Bekleyen debounce'u iptal edip hemen yazar (ör. kaydet butonu). */
  flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    return this.enqueue();
  }

  /** Kuyruğa bir yazma görevi ekler; sırayı ve hata izolasyonunu korur. */
  private enqueue(): Promise<void> {
    this.setState("saving");
    const run = async () => {
      try {
        const res = await this.opts.save();
        if (res.status === "conflict") this.setState("conflict");
        else if (res.status === "written") this.setState("saved");
        else this.setState("idle"); // skipped/identical/missing → kaydetme yok
      } catch (err) {
        this.setState("error");
        this.opts.onError?.(err);
      }
    };
    // .catch zincirin İÇİNDE: bir görev patlasa da zincir devam eder.
    this.queue = this.queue.then(run).catch((err) => {
      this.setState("error");
      this.opts.onError?.(err);
    });
    return this.queue.then(() => undefined);
  }

  /** Kuyruğun bitmesini bekler (testler için). */
  idle(): Promise<void> {
    return this.queue.then(() => undefined);
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}

/**
 * Tarayıcı yaşam döngüsünde autosave kurtarma.
 *
 * Sekme gizlenince/gizliyken (`visibilitychange`) ve sayfa terk edilirken
 * (`pagehide`) bekleyen debounce'u flush etmeyi dener.
 *
 * SINIR: `pagehide`/`visibilitychange` sırasında tarayıcı IndexedDB yazmasının
 * tamamlanacağını GARANTİ ETMEZ — sayfa her an dondurulabilir. Bu yüzden
 * burada "kaydedildi" garantisi verilmez; yalnızca en iyi çaba gösterilir.
 * Kalıcı güvence için düzenli (debounce) yazma akışı esastır.
 *
 * @returns temizleme fonksiyonu (dinleyicileri kaldırır)
 */
export function attachLifecycleFlush(autosave: Autosave): () => void {
  const onHidden = () => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      void autosave.flush();
    }
  };
  const onPageHide = () => {
    void autosave.flush();
  };

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onHidden);
  }
  if (typeof window !== "undefined") {
    window.addEventListener("pagehide", onPageHide);
  }

  return () => {
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", onHidden);
    }
    if (typeof window !== "undefined") {
      window.removeEventListener("pagehide", onPageHide);
    }
  };
}
