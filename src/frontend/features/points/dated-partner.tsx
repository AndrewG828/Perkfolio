"use client";

import type { TransferPartner } from "@/shared/data/points/types";
import { localIsoDate, partnerOn } from "@/shared/lib/transfer-dates";
import { ratioOf } from "@/shared/lib/ratios";
import { useHydrated, useWallet } from "@/frontend/state/wallet-store";
import { cn } from "@/shared/lib/format";
import { RatioPill, formatDate, scheduledLabel } from "./ratio-pill";

// Client islands for server-rendered transfer rows (card pages): the prerender shows the row as researched, and after
// hydration a scheduled ratio change applies from its date (partnerOn()), so a page that isn't rebuilt never keeps
// showing an old ratio under a "Scheduled" label. They import no Points & Miles data (only the rows they're given),
// so a card page's bundle stays small.

/** The viewer's date (YYYY-MM-DD) once hydrated, else null. */
export function useToday(): string | null {
  return useHydrated() ? localIsoDate() : null;
}

/**
 * The row for this card as the visitor's wallet decides it: a card whose points transfer only once pooled with
 * another (`unlockedBy`: Freedom Flex with a Sapphire) moves them at the rate of the best card in the wallet that
 * unlocks them (`options`: every row for this program, card-specific ones with their `cards`). Null until hydration,
 * or when the wallet holds no such card: the server's row stands, marked as varying.
 */
function walletRow(options: TransferPartner[] | undefined, unlockedBy: string[] | undefined, wallet: string[], hydrated: boolean): TransferPartner | null {
  if (!hydrated || !options?.length || !unlockedBy?.length) return null;
  const holding = unlockedBy.filter((id) => wallet.includes(id));
  if (holding.length === 0) return null;
  const rows = holding.flatMap((id) => {
    const own = options.find((p) => p.cards?.includes(id));
    const general = options.find((p) => !p.cards);
    return own ? [own] : general ? [general] : [];
  });
  return rows.sort((a, b) => ratioOf(b) - ratioOf(a))[0] ?? null;
}

/**
 * The row's ratio as it stands today. With `options` and `unlockedBy` (a card that transfers only through another), the
 * ratio of the card in the visitor's wallet that unlocks it, without the "depends on the card" marker.
 */
export function DatedRatioPill({
  partner,
  varies,
  options,
  unlockedBy,
  className,
}: {
  partner: TransferPartner;
  varies?: boolean;
  options?: TransferPartner[];
  unlockedBy?: string[];
  className?: string;
}) {
  const today = useToday();
  const wallet = useWallet();
  const mine = walletRow(options, unlockedBy, wallet.cards, today !== null);
  return <RatioPill partner={partnerOn(mine ?? partner, today)} varies={mine ? false : varies} className={className} />;
}

/** A change-log entry's status badge: "Scheduled" until its date, then "In effect" (the log itself is as researched). */
export function ChangeStatus({ status, date, className }: { status: string; date: string; className?: string }) {
  const today = useToday();
  const label = status === "scheduled" && today && today >= date ? "in effect" : status === "ended" ? "Since ended" : status;
  if (label === "in effect") return null;
  return <span className={cn(label === "scheduled" ? "bg-sky text-brand" : "bg-canvas text-ink-3", className)}>{label}</span>;
}

/**
 * "4:3 from Jan 1, 2027" while a change is scheduled, then "Ratio changed Jan 1, 2027"; "Added Nov 18, 2026" for a new
 * partner. `change` is the row's own label as the server writes it (changeLabel(): added or changed, from the log).
 */
export function DatedChangeNote({ partner, change, className }: { partner: TransferPartner; change: string | null; className?: string }) {
  const p = partnerOn(partner, useToday());
  const scheduled = scheduledLabel(p);
  // A scheduled change that has taken effect is a ratio change.
  const changed = p !== partner && p.changedOn ? `Ratio changed ${formatDate(p.changedOn)}` : change;
  if (!scheduled && !changed) return null;
  return <span className={cn("block text-xs font-medium", scheduled ? "text-warn" : "text-brand", className)}>{scheduled ?? changed}</span>;
}
