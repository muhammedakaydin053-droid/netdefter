import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import {
  Archive,
  BookOpen,
  CalendarClock,
  CalendarDays,
  ClipboardList,
  Download,
  FileText,
  LayoutDashboard,
  LineChart,
  Moon,
  RotateCcw,
  Sun,
  Table2,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/lib/store";

const NAV = [
  { to: "/", label: "Özet", icon: LayoutDashboard },
  { to: "/program", label: "Program", icon: CalendarClock },
  { to: "/konular", label: "Konular", icon: BookOpen },
  { to: "/yanlislar", label: "Yanlışlar", icon: XCircle },
  { to: "/denemeler", label: "Denemeler", icon: ClipboardList },
  { to: "/tekrarlar", label: "Tekrar", icon: RotateCcw },
  { to: "/istatistikler", label: "İstatistik", icon: LineChart },
  { to: "/dagilim", label: "Dağılım", icon: Table2 },
  { to: "/gunluk", label: "Günlük", icon: CalendarDays },
  { to: "/arsiv", label: "Arşiv", icon: Archive },
] as const;

function readTheme(): "light" | "dark" {
  if (typeof document === "undefined") return "light";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [theme, setTheme] = useState<"light" | "dark">("light");
  useEffect(() => {
    void useAppStore.persist.rehydrate();
    const saved = localStorage.getItem("netdefter-theme");
    if (saved === "dark") {
      document.documentElement.classList.add("dark");
      setTheme("dark");
    } else {
      document.documentElement.classList.remove("dark");
      setTheme("light");
    }
  }, []);

  const toggleTheme = () => {
    const next = readTheme() === "dark" ? "light" : "dark";
    document.documentElement.classList.toggle("dark", next === "dark");
    localStorage.setItem("netdefter-theme", next);
    setTheme(next);
  };

  return (
    <div className="min-h-dvh bg-bg text-fg">
      <header className="sticky top-0 z-30 border-b border-border bg-bg-elevated/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6">
          <Link to="/" className="flex min-w-0 items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-[var(--radius-sm)] bg-primary text-primary-fg">
              <BookOpen className="size-4" strokeWidth={2} />
            </span>
            <span className="min-w-0">
              <span className="block font-display text-base font-semibold leading-tight tracking-tight">
                NetDefter
              </span>
              <span className="hidden text-[11px] text-muted sm:block">
                YKS TYT + AYT Sayısal
              </span>
            </span>
          </Link>
          <nav className="ml-2 hidden min-w-0 flex-1 items-center gap-0.5 overflow-x-auto lg:flex">
            {NAV.map((item) => {
              const active = pathname === item.to;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "rounded-[var(--radius-sm)] px-3 py-2 text-sm transition-colors duration-150",
                    active
                      ? "bg-primary text-primary-fg"
                      : "text-muted hover:bg-bg hover:text-fg",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={toggleTheme}
              className="grid size-10 place-items-center rounded-[var(--radius-sm)] border border-border bg-surface text-fg"
              aria-label={theme === "dark" ? "Açık tema" : "Koyu tema"}
              title={theme === "dark" ? "Açık tema" : "Koyu tema"}
            >
              {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </button>
            <a
              href="/YKS-Takip-Sistemi.xlsx"
              download="YKS-Takip-Sistemi.xlsx"
              title="Boş Excel şablonu — uygulamadaki verilerinizi içermez."
              className="inline-flex h-10 items-center gap-2 rounded-[var(--radius-sm)] bg-primary px-3 text-sm font-medium text-primary-fg hover:opacity-90"
            >
              <Download className="size-4" />
              <span className="hidden sm:inline">Excel şablonu indir</span>
            </a>
            <a
              href="/DENETIM-RAPORU.html"
              className="inline-flex h-10 items-center gap-2 rounded-[var(--radius-sm)] border border-border bg-surface px-3 text-sm font-medium text-fg hover:opacity-90"
            >
              <FileText className="size-4" />
              <span className="hidden sm:inline">Denetim raporu</span>
            </a>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 pb-24 pt-6 sm:px-6 sm:pb-10">
        <div key={pathname} className="nd-page-enter">{children}</div>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-bg-elevated/95 backdrop-blur-sm lg:hidden">
        <div className="flex overflow-x-auto">
          {NAV.map((item) => {
            const active = pathname === item.to;
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex min-h-14 min-w-16 flex-1 flex-col items-center justify-center gap-0.5 px-1 text-[10px]",
                  active ? "text-primary" : "text-muted",
                )}
              >
                <Icon className="size-4" strokeWidth={active ? 2.2 : 1.8} />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
