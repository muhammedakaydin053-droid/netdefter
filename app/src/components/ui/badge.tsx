import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { Status } from "@/lib/types";
import type { Health } from "@/lib/smart/types";
import { HEALTH_LABEL } from "@/lib/smart/types";

export function Badge({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        className,
      )}
    >
      {children}
    </span>
  );
}

const statusClass: Record<Status, string> = {
  Başlamadım: "bg-idle-bg text-idle",
  Çalışıyorum: "bg-warn-bg text-warn",
  Bitti: "bg-ok-bg text-ok",
  "Tekrar Gerekli": "bg-bad-bg text-bad",
};

export function StatusBadge({ status }: { status: Status }) {
  return <Badge className={statusClass[status]}>{status}</Badge>;
}

const healthClass: Record<Health, string> = {
  iyi: "bg-ok-bg text-ok",
  orta: "bg-warn-bg text-warn",
  zayif: "bg-warn-bg text-accent",
  kritik: "bg-bad-bg text-bad",
  bos: "bg-idle-bg text-idle",
};

export function HealthBadge({ health }: { health: Health }) {
  return <Badge className={healthClass[health]}>{HEALTH_LABEL[health]}</Badge>;
}
