/**
 * Calendar helpers for dates the user enters: days are "YYYY-MM-DD" and months "YYYY-MM", both in the user's
 * local time (never UTC, so "today" matches their calendar).
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_MS = 86_400_000;
const pad = (n: number) => String(n).padStart(2, "0");

/** Local calendar date of `d` as YYYY-MM-DD. */
export const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** Local calendar month of `d` as YYYY-MM. */
export const monthKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;

/** Local midnight of a YYYY-MM-DD (or YYYY-MM, taken as the 1st) date. */
export function parseDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

/** Whole days from `today` to `iso`: 0 today, 1 tomorrow, negative once it's past. */
export function daysUntil(iso: string, today: Date): number {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  // Rounding absorbs daylight-saving hours.
  return Math.round((parseDate(iso).getTime() - start.getTime()) / DAY_MS);
}

export const daysSince = (iso: string, today: Date) => -daysUntil(iso, today);

/** Months since year 0: lets month arithmetic ignore year boundaries. */
export const monthIndex = (key: string) => {
  const [y, m] = key.split("-").map(Number);
  return y * 12 + (m - 1);
};
export const monthOfIndex = (i: number) => `${Math.floor(i / 12)}-${pad((i % 12) + 1)}`;
/** The 1st of the month `i` (a monthIndex) as YYYY-MM-DD. */
export const firstOfMonth = (i: number) => `${monthOfIndex(i)}-01`;

/** `iso` plus `months` calendar months, clamped to the end of shorter months (Jan 31 + 1 month = Feb 28). */
export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const target = y * 12 + (m - 1) + months;
  const ty = Math.floor(target / 12);
  const tm = target % 12;
  const last = new Date(ty, tm + 1, 0).getDate();
  return `${ty}-${pad(tm + 1)}-${pad(Math.min(d, last))}`;
}

export function addDays(iso: string, days: number): string {
  const d = parseDate(iso);
  return isoDate(new Date(d.getFullYear(), d.getMonth(), d.getDate() + days));
}

/** "Nov 2024" for a YYYY-MM (or the month of a YYYY-MM-DD). */
export function formatMonth(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

/** "Dec 1, 2026" for a YYYY-MM-DD. */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

/** "Dec 1" this year, "Dec 1, 2027" otherwise. */
export function formatShortDate(iso: string, today: Date): string {
  const [y, m, d] = iso.split("-").map(Number);
  return y === today.getFullYear() ? `${MONTHS[m - 1]} ${d}` : `${MONTHS[m - 1]} ${d}, ${y}`;
}

export const MONTH_NAMES = MONTHS;
