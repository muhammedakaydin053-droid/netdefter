import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAppStore } from "@/lib/store";

export function ResetDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const resetAll = useAppStore((s) => s.resetAll);
  const restoreBackup = useAppStore((s) => s.restoreBackup);
  const backup = useAppStore((s) => s.backup);
  const [step, setStep] = useState(1);
  const [typed, setTyped] = useState("");

  if (!open) return null;

  const close = () => {
    setStep(1);
    setTyped("");
    onClose();
  };

  return (
    <div className="nd-overlay-enter fixed inset-0 z-50 grid place-items-center bg-[color-mix(in_oklab,var(--color-fg)_35%,transparent)] p-4">
      <div className="nd-modal-enter w-full max-w-md rounded-[var(--radius-xl)] border border-border bg-surface p-5 shadow-[var(--shadow-soft)]">
        {step === 1 && (
          <>
            <h2 className="font-display text-xl font-semibold">Dikkat</h2>
            <p className="mt-3 text-sm text-muted">
              Bu işlem konu ilerlemelerini, yanlış kayıtlarını, deneme sonuçlarını ve günlük çalışma verilerini sıfırlayabilir.
              Devam etmek istediğine emin misin?
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" onClick={close}>Vazgeç</Button>
              <Button onClick={() => setStep(2)}>Devam et</Button>
            </div>
          </>
        )}
        {step === 2 && (
          <>
            <h2 className="font-display text-xl font-semibold">Bu işlem geri alınamayabilir</h2>
            <p className="mt-3 text-sm text-muted">
              Sıfırlamadan önce otomatik yedek alınır. Yine de gerçekten tüm verileri sıfırlamak istiyor musun?
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" onClick={close}>İptal</Button>
              <Button onClick={() => setStep(3)}>Evet, devam et</Button>
            </div>
          </>
        )}
        {step === 3 && (
          <>
            <h2 className="font-display text-xl font-semibold">Son onay</h2>
            <p className="mt-3 text-sm text-muted">
              Devam etmek için kutuya tam olarak <span className="font-medium text-fg">SIFIRLA</span> yaz.
            </p>
            <Input className="mt-3" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="SIFIRLA" />
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" onClick={close}>Vazgeç</Button>
              <Button
                variant="danger"
                disabled={typed !== "SIFIRLA"}
                onClick={() => {
                  resetAll();
                  close();
                }}
              >
                Tüm verileri sıfırla
              </Button>
            </div>
          </>
        )}
        {backup && step === 1 && (
          <button type="button" className="mt-4 text-xs text-primary underline" onClick={() => { restoreBackup(); close(); }}>
            Son yedekten geri yükle ({new Date(backup.at).toLocaleString("tr-TR")})
          </button>
        )}
      </div>
    </div>
  );
}
