import type { CreditFrequency } from "@/shared/data/types";

export interface Period {
  /** Stable key used in storage, e.g. "2026-11", "2026-Q4", "2026-H2", "2026". */
  key: string;
  label: string;
  start: Date;
  /** Exclusive end. */
  end: Date;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Returns the calendar period a credit of the given frequency falls in for `date`. */
export function periodFor(frequency: CreditFrequency, date: Date = new Date()): Period {
  const y = date.getFullYear();
  const m = date.getMonth();
  switch (frequency) {
    case "monthly":
      return {
        key: `${y}-${String(m + 1).padStart(2, "0")}`,
        label: `${MONTHS[m]} ${y}`,
        start: new Date(y, m, 1),
        end: new Date(y, m + 1, 1),
      };
    case "quarterly": {
      const q = Math.floor(m / 3);
      return {
        key: `${y}-Q${q + 1}`,
        label: `Q${q + 1} ${y} (${MONTHS[q * 3]}–${MONTHS[q * 3 + 2]})`,
        start: new Date(y, q * 3, 1),
        end: new Date(y, q * 3 + 3, 1),
      };
    }
    case "semiannual": {
      const h = m < 6 ? 0 : 1;
      return {
        key: `${y}-H${h + 1}`,
        label: h === 0 ? `Jan–Jun ${y}` : `Jul–Dec ${y}`,
        start: new Date(y, h * 6, 1),
        end: new Date(y, h * 6 + 6, 1),
      };
    }
    case "annual":
      return { key: `${y}`, label: `${y}`, start: new Date(y, 0, 1), end: new Date(y + 1, 0, 1) };
    case "every-4-years": {
      // Fixed 4-year windows (2024–2027, 2028–2031, ...). Close enough for Global Entry/TSA style credits.
      const s = 2024 + Math.floor((y - 2024) / 4) * 4;
      return { key: `${s}-4y`, label: `${s}–${s + 3}`, start: new Date(s, 0, 1), end: new Date(s + 4, 0, 1) };
    }
    case "one-time":
      return { key: "once", label: "One-time", start: new Date(2000, 0, 1), end: new Date(2100, 0, 1) };
  }
}

/** All periods of this frequency that overlap the given calendar year (for year-to-date totals). */
export function periodsInYear(frequency: CreditFrequency, year: number): Period[] {
  const count = { monthly: 12, quarterly: 4, semiannual: 2, annual: 1, "every-4-years": 1, "one-time": 1 }[frequency];
  const step = 12 / Math.min(count, 12);
  return Array.from({ length: count }, (_, i) => periodFor(frequency, new Date(year, Math.floor(i * step), 1)));
}

export function daysLeft(period: Period, now: Date = new Date()): number {
  return Math.max(0, Math.ceil((period.end.getTime() - now.getTime()) / 86_400_000));
}

export const frequencyLabel: Record<CreditFrequency, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  semiannual: "Semi-annual",
  annual: "Annual",
  "every-4-years": "Every 4 years",
  "one-time": "One-time",
};

export const frequencyShort: Record<CreditFrequency, string> = {
  monthly: "/mo",
  quarterly: "/qtr",
  semiannual: "/half",
  annual: "/yr",
  "every-4-years": "/4 yrs",
  "one-time": "",
};
