import type { TransferPartner } from "@/shared/data/points/types";

/**
 * Dates for transfer rows, with no Points & Miles data attached (for the client islands on card pages):
 * the viewer's date and a row as it stands on that date. shared/lib/points.ts re-exports all of it.
 */

/** The viewer's date as YYYY-MM-DD in their own time zone. Call after hydration (it reads the clock). */
export function localIsoDate(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Whole days from `fromIso` to `toIso` (both YYYY-MM-DD); negative when `toIso` is earlier. */
export function daysBetween(fromIso: string, toIso: string): number {
  const utc = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
  return Math.round((utc(toIso) - utc(fromIso)) / 86_400_000);
}

/**
 * The transfer as it stands on `today`: from its date, a scheduled ratio change replaces the ratio, becomes the row's
 * change (`changedOn`, its sources first) and stops being "scheduled". The row's note is dropped: it was written before
 * the change ("1:1 for now …"), and the change log keeps the details. Unchanged without `today` (before hydration) or
 * before the date.
 */
export function partnerOn(p: TransferPartner, today?: string | null): TransferPartner {
  const s = p.scheduled;
  if (!today || !s || today < s.date) return p;
  const dated: TransferPartner = { ...p, from: s.from, to: s.to, changedOn: s.date, sources: Array.from(new Set([...s.sources, ...p.sources])) };
  delete dated.scheduled;
  delete dated.note;
  return dated;
}
