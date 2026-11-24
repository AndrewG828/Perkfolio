import type { TransferPartner } from "@/shared/data/points/types";
import { ratioLabel } from "@/shared/lib/ratios";
import { cn } from "@/shared/lib/format";

// The transfer-ratio pieces client islands need (a card page's dated ratio pills), with no Points & Miles data
// attached, so those islands stay small. ./ui.tsx re-exports them for the server-rendered pages.

/** "Nov 1, 2026" from an ISO date, the same on server and client. */
export function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/**
 * "4:3 from Jan 1, 2027" for a transfer with a scheduled ratio change, else null. A dated row (partnerOn(), after
 * hydration) no longer carries `scheduled` once the date comes; changeLabel() then says when it changed.
 */
export function scheduledLabel(p: Pick<TransferPartner, "scheduled">): string | null {
  return p.scheduled ? `${ratioLabel(p.scheduled)} from ${formatDate(p.scheduled.date)}` : null;
}

/** "1:1" / "2:1.5" pill. `mine` marks a currency the wallet earns. */
export function RatioPill({
  partner,
  mine = false,
  varies = false,
  approx = false,
  className,
}: {
  partner: Pick<TransferPartner, "from" | "to">;
  mine?: boolean;
  /** Ratio depends on the card: adds a marker (explain it nearby). */
  varies?: boolean;
  /** The nearest simple ratio to an overall rate (effectiveRatio): shown as "≈8:3". */
  approx?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex min-w-[3.25rem] items-center justify-center gap-0.5 rounded-full px-2.5 py-1 text-xs leading-none font-semibold tabular-nums",
        mine ? "bg-brand text-white" : "bg-sky text-brand-dark ring-1 ring-brand/15",
        className,
      )}
    >
      {approx && <span aria-label="about">≈</span>}
      {ratioLabel(partner)}
      {varies && <span aria-hidden>*</span>}
    </span>
  );
}
