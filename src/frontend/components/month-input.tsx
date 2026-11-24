"use client";

import { MONTH_NAMES } from "@/shared/lib/dates";
import { cn } from "@/shared/lib/format";

const daysIn = (year: string, month: string) => (year && month ? new Date(Number(year), Number(month), 0).getDate() : 31);

/**
 * A month picker as two selects (month, year), since `<input type="month">` isn't supported everywhere.
 * Value is "YYYY-MM", or "" when empty. Picking only a month fills in the latest year (and only a year, January), so
 * the value is always complete. With `optional`, choosing "—" in either select clears it.
 * With `withDay`, a third select adds an optional day: the value is then "YYYY-MM-DD" once a day is picked.
 * `max` (YYYY-MM-DD, usually today) disables later months and days, so a date can't be in the future.
 */
export function MonthInput({
  value,
  onChange,
  label,
  optional = false,
  withDay = false,
  minYear = 1990,
  maxYear,
  max,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Accessible name, e.g. "Opened". */
  label: string;
  optional?: boolean;
  withDay?: boolean;
  minYear?: number;
  maxYear: number;
  /** Latest selectable day, YYYY-MM-DD. */
  max?: string;
  className?: string;
}) {
  const [y = "", m = "", d = ""] = value ? value.split("-") : [];
  const top = Math.min(maxYear, max ? Number(max.slice(0, 4)) : maxYear);
  const years = Array.from({ length: top - minYear + 1 }, (_, i) => String(top - i));
  const [maxY, maxM, maxD] = max ? max.split("-") : ["", "", ""];
  const monthTooLate = (month: string) => Boolean(max) && (y || String(top)) === maxY && month > maxM;
  const dayTooLate = (day: string) => Boolean(max) && y === maxY && m === maxM && day > maxD;
  const pick = (year: string, month: string, day: string = d) => {
    if (!year || !month) {
      if (optional) onChange("");
      else if (year || month) onChange(`${year || top}-${month || "01"}`);
      return;
    }
    // Never past `max`: a year change that would land in the future moves to the latest allowed month and day.
    if (max && `${year}-${month}` > max.slice(0, 7)) month = maxM;
    // Keep the day valid for the new month (Jan 31 → Feb 28).
    let dd = day ? String(Math.min(Number(day), daysIn(year, month))).padStart(2, "0") : "";
    if (max && dd && `${year}-${month}-${dd}` > max) dd = maxD;
    onChange(dd ? `${year}-${month}-${dd}` : `${year}-${month}`);
  };
  return (
    <span className={cn("flex gap-2", className)}>
      <select
        className="input min-w-0 flex-1"
        value={m}
        onChange={(e) => (e.target.value ? pick(y || String(top), e.target.value) : pick("", ""))}
        aria-label={`${label}: month`}
      >
        <option value="" disabled={!optional}>
          {optional ? "—" : "Month"}
        </option>
        {MONTH_NAMES.map((name, i) => {
          const month = String(i + 1).padStart(2, "0");
          return (
            <option key={name} value={month} disabled={monthTooLate(month)}>
              {name}
            </option>
          );
        })}
      </select>
      {withDay && (
        <select
          className="input w-[4.75rem] shrink-0"
          value={d}
          disabled={!m}
          onChange={(e) => pick(y || String(top), m, e.target.value)}
          aria-label={`${label}: day (optional)`}
          title="Day (optional): issuer rules counted in days need it"
        >
          <option value="">Day</option>
          {Array.from({ length: daysIn(y, m) }, (_, i) => String(i + 1)).map((day) => (
            <option key={day} value={day.padStart(2, "0")} disabled={dayTooLate(day.padStart(2, "0"))}>
              {day}
            </option>
          ))}
        </select>
      )}
      <select
        className="input w-[5.5rem] shrink-0"
        value={y}
        onChange={(e) => (e.target.value ? pick(e.target.value, m || "01") : pick("", ""))}
        aria-label={`${label}: year`}
      >
        <option value="" disabled={!optional}>
          {optional ? "—" : "Year"}
        </option>
        {years.map((year) => (
          <option key={year} value={year}>
            {year}
          </option>
        ))}
      </select>
    </span>
  );
}
