"use client";

import type { TransferPartner } from "@/shared/data/points";
import { localIsoDate, partnerOn } from "@/shared/lib/points";
import { useHydrated } from "@/frontend/state/wallet-store";
import { cn } from "@/shared/lib/format";
import { RatioPill, changeLabel, scheduledLabel } from "./ui";

// Client islands for server-rendered transfer rows (card pages): the prerender shows the row as researched, and after
// hydration a scheduled ratio change applies from its date (partnerOn()), so a page that isn't rebuilt never keeps
// showing an old ratio under a "Scheduled" label.

/** The viewer's date (YYYY-MM-DD) once hydrated, else null. */
export function useToday(): string | null {
  return useHydrated() ? localIsoDate() : null;
}

/** The row's ratio as it stands today. */
export function DatedRatioPill({ partner, varies, className }: { partner: TransferPartner; varies?: boolean; className?: string }) {
  return <RatioPill partner={partnerOn(partner, useToday())} varies={varies} className={className} />;
}

/** A change-log entry's status badge: "Scheduled" until its date, then "In effect" (the log itself is as researched). */
export function ChangeStatus({ status, date, className }: { status: string; date: string; className?: string }) {
  const today = useToday();
  const label = status === "scheduled" && today && today >= date ? "in effect" : status === "ended" ? "Since ended" : status;
  if (label === "in effect") return null;
  return <span className={cn(label === "scheduled" ? "bg-sky text-brand" : "bg-canvas text-ink-3", className)}>{label}</span>;
}

/** "4:3 from Jan 1, 2027" while a change is scheduled, then "Ratio changed Jan 1, 2027"; "Added Nov 18, 2026" for a new partner. */
export function DatedChangeNote({ partner, className }: { partner: TransferPartner; className?: string }) {
  const p = partnerOn(partner, useToday());
  const scheduled = scheduledLabel(p);
  const changed = changeLabel(p);
  if (!scheduled && !changed) return null;
  return <span className={cn("block text-xs font-medium", scheduled ? "text-warn" : "text-brand", className)}>{scheduled ?? changed}</span>;
}
