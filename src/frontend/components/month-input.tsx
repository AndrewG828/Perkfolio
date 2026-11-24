"use client";

import { MONTH_NAMES } from "@/shared/lib/dates";
import { cn } from "@/shared/lib/format";

/**
 * A month picker as two selects (month, year), since `<input type="month">` isn't supported everywhere.
 * Value is "YYYY-MM", or "" when empty. Picking only a month fills in the latest year (and only a year, January), so
 * the value is always complete. With `optional`, choosing "—" in either select clears it.
 */
export function MonthInput({
  value,
  onChange,
  label,
  optional = false,
  minYear = 1990,
  maxYear,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Accessible name, e.g. "Opened". */
  label: string;
  optional?: boolean;
  minYear?: number;
  maxYear: number;
  className?: string;
}) {
  const [y = "", m = ""] = value ? value.split("-") : [];
  const years = Array.from({ length: maxYear - minYear + 1 }, (_, i) => String(maxYear - i));
  const pick = (year: string, month: string) => {
    if (!year || !month) {
      if (optional) onChange("");
      else if (year || month) onChange(`${year || maxYear}-${month || "01"}`);
      return;
    }
    onChange(`${year}-${month}`);
  };
  return (
    <span className={cn("flex gap-2", className)}>
      <select
        className="input min-w-0 flex-1"
        value={m}
        onChange={(e) => (e.target.value ? pick(y || String(maxYear), e.target.value) : pick("", ""))}
        aria-label={`${label}: month`}
      >
        <option value="" disabled={!optional}>
          {optional ? "—" : "Month"}
        </option>
        {MONTH_NAMES.map((name, i) => (
          <option key={name} value={String(i + 1).padStart(2, "0")}>
            {name}
          </option>
        ))}
      </select>
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
