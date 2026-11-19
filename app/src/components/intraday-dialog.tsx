import { Button } from "@/components/ui/button";
import { Clock, TriangleAlert } from "lucide-react";
import { formatDate } from "@/lib/utils";
import type { IntradayOverflow } from "@/lib/store";

/**
 * Gün içi ayar (uyanma/uyuma/yemek/spor/serbest zaman) değişikliği için onay
 * penceresi.
 *
 * Neden gerekli: bu ayarlar dondurulmuş programın görev SAATLERİNİ değiştirir.
 * Görevlerin kimliği, tarihi, sırası ve içeriği korunur; ancak kullanıcı bunu
 * yalnızca fare ipucundan görmemeli. Onay verilmeden ne ayarlar ne de zaman
 * çizelgesi uygulanır; vazgeçilirse ikisi de eski hâlinde kalır.
 *
 * Sunumsal tutulur (`onConfirm`/`onCancel` dışarıdan verilir); böylece hem gerçek
 * store aksiyonundan hem de testten aynı bileşen kullanılabilir.
 */
export function IntradayDialog({
  open,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="intraday-dialog-title"
      className="nd-overlay-enter fixed inset-0 z-50 grid place-items-center bg-[color-mix(in_oklab,var(--color-fg)_35%,transparent)] p-4"
    >
      <div className="nd-modal-enter w-full max-w-md rounded-[var(--radius-xl)] border border-border bg-surface p-5 shadow-[var(--shadow-soft)]">
        <div className="flex items-center gap-2">
          <Clock className="size-5 text-primary" />
          <h2 id="intraday-dialog-title" className="font-display text-xl font-semibold">
            Gün içi zaman ayarları değişecek
          </h2>
        </div>
        <p className="mt-3 text-sm text-muted">
          Uyanma, uyuma, yemek, spor ve serbest zaman ayarlarını değiştirdin. Bu ayarlar
          görevlerin <span className="font-medium text-fg">saatlerini</span> etkiler.
        </p>
        <p className="mt-2 text-sm text-muted">
          Görevlerin tarihi, sırası, konusu, türü ve süresi korunur; yalnızca saatleri yeni
          düzene göre yeniden yerleştirilir. Tamamlanmış ve başlamış görevler ile geçmiş
          günler değişmez. Sığmayan görevler silinmez; uyarı olarak işaretlenir.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>
            Vazgeç
          </Button>
          <Button onClick={onConfirm}>Uygula</Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Yeni gün içi ayarlarla görevlerin bir kısmı sığmadığında gösterilen uyarı.
 * Görevler silinmez; eski saatleriyle korunur ve listede "sığmadı" işareti alır.
 * Kullanıcıya ayarları gevşetme veya programı yeniden planlama seçeneği sunulur.
 */
export function IntradayOverflowNotice({ overflow }: { overflow: IntradayOverflow | null }) {
  if (!overflow) return null;
  const days = Object.keys(overflow.byDate).sort();
  return (
    <div
      role="alert"
      className="mt-3 rounded-[var(--radius-md)] border border-warn bg-bg-elevated p-3 text-sm"
    >
      <div className="flex items-start gap-2">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" />
        <div>
          <p>
            Yeni zaman ayarlarıyla {overflow.total} görev sığmadı. Görevler silinmedi; eski
            saatleriyle korundu ama bu saatler yeni ayarlarla uyumlu değil.
          </p>
          <ul className="mt-1 space-y-0.5 text-xs text-muted">
            {days.slice(0, 5).map((d) => (
              <li key={d}>
                {formatDate(d)}: {overflow.byDate[d]} görev sığmadı
              </li>
            ))}
            {days.length > 5 ? <li>… ve {days.length - 5} gün daha</li> : null}
          </ul>
          <p className="mt-1 text-xs text-muted">
            Zaman ayarlarını gevşetmeyi ya da programı bugünden yeniden planlamayı düşün.
          </p>
        </div>
      </div>
    </div>
  );
}
