import { Button } from "@/components/ui/button";
import { TriangleAlert } from "lucide-react";

/**
 * "Programı bugünden yeniden planla" için onay penceresi.
 *
 * Neden gerekli: bu işlem dondurulmuş program penceresini temizler ve bugünden
 * itibaren görevleri yeniden üretir; mevcut ve gelecek görevlerin tarihleri veya
 * sırası değişebilir. Kullanıcı bunu yalnızca fare ipucundan görmemeli.
 *
 * Sunumsal tutulur (`onConfirm`/`onCancel` dışarıdan verilir); böylece hem gerçek
 * store aksiyonundan hem de testten aynı bileşen kullanılabilir.
 */
export function ReplanDialog({
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
      aria-labelledby="replan-dialog-title"
      className="nd-overlay-enter fixed inset-0 z-50 grid place-items-center bg-[color-mix(in_oklab,var(--color-fg)_35%,transparent)] p-4"
    >
      <div className="nd-modal-enter w-full max-w-md rounded-[var(--radius-xl)] border border-border bg-surface p-5 shadow-[var(--shadow-soft)]">
        <div className="flex items-center gap-2">
          <TriangleAlert className="size-5 text-warn" />
          <h2 id="replan-dialog-title" className="font-display text-xl font-semibold">
            Programı bugünden yeniden planla
          </h2>
        </div>
        <p className="mt-3 text-sm text-muted">
          Bugünden itibaren program görevleri yeniden oluşturulacak. Mevcut ve gelecek görevlerin
          tarihleri veya sırası değişebilir.
        </p>
        <p className="mt-2 text-sm text-muted">
          Konu ilerlemen, soru sonuçların, yanlışların ve denemelerin korunur.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>
            Vazgeç
          </Button>
          <Button onClick={onConfirm}>Yeniden planla</Button>
        </div>
      </div>
    </div>
  );
}
