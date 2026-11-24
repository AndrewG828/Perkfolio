import type { FeeValue, Notes } from "@/shared/data/travel/types";

/** Formatting for the travel tools. No Date objects: ISO strings are formatted by hand, so server and browser agree. */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-11-24" → "Nov 24, 2026"; "2026-11" → "Nov 2026". Anything else is returned as is. */
export function formatIsoDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(iso);
  if (!m) return iso;
  const month = MONTHS[Number(m[2]) - 1];
  if (!month) return iso;
  return m[3] ? `${month} ${Number(m[3])}, ${m[1]}` : `${month} ${m[1]}`;
}

/** "Nov 2026" from any ISO date. */
export function formatIsoMonth(iso: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(iso);
  const month = m ? MONTHS[Number(m[2]) - 1] : undefined;
  return m && month ? `${month} ${m[1]}` : iso;
}

/** The latest of several ISO dates (string comparison works for ISO). */
export const latestIso = (dates: string[]) => dates.reduce((a, b) => (b > a ? b : a), "");

/** Notes as a list, whichever form they came in. */
export function noteList(notes: Notes | undefined): string[] {
  if (!notes) return [];
  return (Array.isArray(notes) ? notes : [notes]).map((n) => n.trim()).filter(Boolean);
}

/** A fee for display: numbers are USD ("$35", "$80.90", "Free"), phrases pass through. */
export function feeText(fee: FeeValue | undefined, empty = "—"): string {
  if (fee === null || fee === undefined || fee === "") return empty;
  if (typeof fee === "number") {
    if (fee === 0) return "Free";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: Number.isInteger(fee) ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(fee);
  }
  return fee;
}

/** Host name of a URL for link text ("travel.state.gov"); relative links get a readable label. */
export function hostOf(url: string): string {
  if (url.startsWith("/")) return "perkfolio";
  try {
    return new URL(url).hostname.replace(/^www\d?\./, "");
  } catch {
    return url;
  }
}

/** "1,234" with no decimals. */
export const whole = (n: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.round(n));
