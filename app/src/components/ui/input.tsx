import * as React from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-[var(--radius-sm)] border border-border bg-surface px-3 text-sm text-fg placeholder:text-subtle",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
        className,
      )}
      {...props}
    />
  );
}

export function NumInput({
  value,
  onChange,
  className,
  max,
  invalid,
  ...props
}: Omit<React.ComponentProps<"input">, "value" | "onChange" | "type" | "max"> & {
  value: number | null;
  onChange: (v: number | null) => void;
  /** İzin verilen üst sınır; girilen değer bunu aşarsa `invalid` ile uyarılır. */
  max?: number;
  /** Değer kullanılabilir aralığın dışında mı (kırmızı çerçeve). */
  invalid?: boolean;
}) {
  return (
    <input
      type="number"
      min={0}
      max={max}
      inputMode="numeric"
      value={value ?? ""}
      onChange={(e) => {
        const raw = e.target.value;
        if (raw === "") return onChange(null);
        const num = Number(raw);
        // Negatif veya sayı olmayan girdi hiç kabul edilmez (input katmanı).
        if (!Number.isFinite(num) || num < 0) return onChange(null);
        onChange(num);
      }}
      aria-invalid={invalid || undefined}
      className={cn(
        "h-9 w-full min-w-16 rounded-[var(--radius-xs)] border border-border bg-surface px-2 text-center text-sm tabular-nums",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
        invalid && "border-red-500 text-red-600",
        className,
      )}
      {...props}
    />
  );
}
