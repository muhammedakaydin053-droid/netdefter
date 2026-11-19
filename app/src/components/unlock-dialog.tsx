import { Button } from "@/components/ui/button";
import { TriangleAlert } from "lucide-react";
import { UNLOCK_WARNING } from "@/lib/sessions";

/**
 * Kümülatif değerleri bağlı oturumlar nedeniyle kilitlenmiş bir konuda bağ çözme
 * onay penceresi. Onay verilmeden `unlockTopic` çağrılmaz.
 *
 * Sunumsal tutulur (`onConfirm`/`onCancel` dışarıdan verilir); hem gerçek store
 * aksiyonundan hem testten aynı bileşen kullanılabilir.
 */
export function UnlockDialog({
  open,
  topicLabel,
  sessionCount,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  topicLabel: string;
  sessionCount: number;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="unlock-dialog-title"
      className="nd-overlay-enter fixed inset-0 z-50 grid place-items-center bg-[color-mix(in_oklab,var(--color-fg)_35%,transparent)] p-4"
    >
      <div className="nd-modal-enter w-full max-w-md rounded-[var(--radius-xl)] border border-border bg-surface p-5 shadow-[var(--shadow-soft)]">
        <div className="flex items-center gap-2">
          <TriangleAlert className="size-5 text-warn" />
          <h2 id="unlock-dialog-title" className="font-display text-xl font-semibold">
            Konu kilidi çözülecek
          </h2>
        </div>
        <p className="mt-3 text-sm text-muted">{topicLabel}</p>
        <p className="mt-2 text-sm text-muted">{UNLOCK_WARNING}</p>
        <p className="mt-2 text-xs text-subtle">
          {sessionCount} bağlı oturumun bağı çözülecek. Kümülatif değerler değişmez.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>
            Vazgeç
          </Button>
          <Button onClick={onConfirm}>Kilidi çöz</Button>
        </div>
      </div>
    </div>
  );
}
