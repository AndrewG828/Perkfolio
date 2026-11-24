import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import type { ExpiryTone } from "@/shared/lib/trackers";
import { cn } from "@/shared/lib/format";

/** The row of three stats at the top of a tab: the first full width on phones, the other two side by side. */
export function StatRow({ children }: { children: ReactNode }) {
  return <section className="grid grid-cols-2 gap-4 md:grid-cols-3 md:gap-5 [&>*:first-child]:col-span-2 md:[&>*:first-child]:col-span-1">{children}</section>;
}

/** Page frame for a tracker tab: canvas background, page container, vertical rhythm. */
export function TabFrame({ children }: { children: ReactNode }) {
  return (
    <div className="bg-canvas">
      <div className="container-page space-y-8 py-10">{children}</div>
    </div>
  );
}

export function Stat({
  label,
  value,
  sub,
  tone,
  className,
  children,
}: {
  label: string;
  value: string;
  sub?: ReactNode;
  tone?: "danger" | "warn" | "success";
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={cn("panel p-5 md:p-6", className)}>
      <p className="text-sm font-medium text-ink-2">{label}</p>
      <p
        className={cn(
          "mt-2 text-2xl font-semibold tracking-tight md:text-3xl",
          tone === "danger" ? "text-danger" : tone === "warn" ? "text-warn" : tone === "success" ? "text-success" : "text-navy",
        )}
      >
        {value}
      </p>
      {sub && <p className="mt-1 text-sm text-ink-3">{sub}</p>}
      {children}
    </div>
  );
}

const TONE: Record<ExpiryTone, string> = {
  expired: "bg-danger/10 text-danger",
  red: "bg-danger/10 text-danger",
  amber: "bg-warn/10 text-warn",
  ok: "bg-canvas text-ink-2",
};

/** A rounded label colored by how soon something expires. */
export function ExpiryChip({ tone, children }: { tone: ExpiryTone; children: ReactNode }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap", TONE[tone])}>{children}</span>;
}

/** An empty tab: icon, title, a line of text and actions. */
export function EmptyState({ icon: Icon, title, children, actions }: { icon: LucideIcon; title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-sky text-brand">
        <Icon className="h-6 w-6" />
      </span>
      <h3 className="mt-4 text-lg font-semibold text-navy">{title}</h3>
      <p className="mt-1 max-w-md text-sm text-ink-2">{children}</p>
      {actions && <div className="mt-5 flex flex-wrap justify-center gap-2">{actions}</div>}
    </div>
  );
}

/** "in 12 days", "today", "3 days ago". */
export function relativeDays(days: number): string {
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  return days > 0 ? `in ${days} days` : `${-days} days ago`;
}
