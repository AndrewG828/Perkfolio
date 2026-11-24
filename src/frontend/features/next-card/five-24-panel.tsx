"use client";

import Link from "next/link";
import { useState } from "react";
import { CalendarClock, ChevronDown, CircleHelp } from "lucide-react";
import { Meter } from "@/frontend/components/meter";
import type { NewCardCount } from "@/shared/lib/eligibility";
import { daysUntil, formatDate, formatMonth } from "@/shared/lib/dates";
import { cn } from "@/shared/lib/format";
import { CertaintyChip } from "./rule-results";

/** Headline sentence for the 5/24 count. */
export function fiveTwentyFourSummary(s: NewCardCount): string {
  const room = s.limit - s.count;
  if (s.status === "at-limit") return `Over the limit: Chase will likely decline until ${formatDate(s.underOn!)}.`;
  if (s.undated.length && s.count + s.undated.length >= s.limit) {
    return `${s.count} counted, plus ${s.undated.length} wallet card${s.undated.length === 1 ? "" : "s"} without an open date that could push you over.`;
  }
  if (!s.historyKnown) return `${s.count} from your wallet so far. Add the other cards you've opened for an exact count.`;
  return room === 1
    ? "Under the limit, with room for 1 more personal card before Chase starts declining."
    : `Under the limit, with room for ${room} more personal cards before Chase starts declining.`;
}

/**
 * The Chase 5/24 counter: how many personal cards opened in the window, a meter against the limit, and (unless
 * `compact`) every counted card with the day it drops off.
 */
export function FiveTwentyFourPanel({
  status: s,
  today,
  compact = false,
  collapsible = false,
  showLink = false,
  className,
}: {
  status: NewCardCount;
  today: Date;
  compact?: boolean;
  /** On narrow screens, hide the card list behind a toggle (it's always shown from the lg breakpoint). */
  collapsible?: boolean;
  /** Link to /next-card (for use outside that page). */
  showLink?: boolean;
  className?: string;
}) {
  const [listOpen, setListOpen] = useState(false);
  const over = s.status === "at-limit";
  const next = s.counted[0];
  const rows = s.counted.length + s.undated.length;
  return (
    <section className={cn("panel p-6", className)} aria-labelledby="five24-title">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p id="five24-title" className="text-sm font-medium text-ink-2">
            Chase {s.limit}/{s.months}
          </p>
          <p className="mt-1 text-4xl font-semibold tracking-tight text-navy">
            <span className={cn(over && "text-danger")}>{s.count}</span>
            <span className="text-2xl font-medium text-ink-3">/{s.months}</span>
          </p>
        </div>
        {s.rule && <CertaintyChip certainty={s.rule.certainty} />}
      </div>
      <Meter
        className="mt-4"
        size="lg"
        value={Math.min(s.count, s.limit)}
        max={s.limit}
        tone={s.count >= s.limit - 1 ? "warn" : "brand"}
        label={`${s.count} of ${s.limit} personal cards in the last ${s.months} months; Chase declines at ${s.limit}`}
      />
      <p className={cn("mt-3 text-sm", over ? "font-semibold text-danger" : "text-ink-2")}>{fiveTwentyFourSummary(s)}</p>
      {next && (
        <p className="mt-2 flex items-start gap-2 text-sm text-ink-2">
          <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
          <span>
            Next to drop off: <span className="font-medium text-ink">{next.record.name}</span> on {formatDate(next.dropOff)}
          </span>
        </p>
      )}

      {!compact && collapsible && rows > 0 && (
        <button className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline lg:hidden" onClick={() => setListOpen((o) => !o)} aria-expanded={listOpen}>
          {listOpen ? "Hide" : "Show"} the {rows === 1 ? "card" : `${rows} cards`}
          {s.counted.length > 0 ? " and drop-off dates" : ""}
          <ChevronDown className={cn("h-4 w-4 transition-transform", listOpen && "rotate-180")} />
        </button>
      )}
      {!compact && (
        <div className={cn(collapsible && !listOpen && "hidden lg:block")}>
          {rows > 0 && (
            <ol className="mt-5 divide-y divide-line border-t border-line">
              {s.counted.map(({ record, dropOff }) => {
                const days = daysUntil(dropOff, today);
                return (
                  <li key={record.key} className="py-2.5 text-sm">
                    <p>
                      <span className="font-medium text-ink">{record.name}</span>
                      <span className="text-ink-3"> · opened {formatMonth(record.opened!)}</span>
                    </p>
                    <p className="text-xs text-ink-2">
                      Drops off {formatDate(dropOff)} <span className="text-ink-3">({days} day{days === 1 ? "" : "s"})</span>
                    </p>
                  </li>
                );
              })}
              {s.undated.map((r) => (
                <li key={r.key} className="py-2.5 text-sm">
                  <p className="font-medium text-ink">{r.name}</p>
                  <p className="flex items-center gap-1 text-xs font-medium text-brand">
                    <CircleHelp className="h-3.5 w-3.5" /> No open date yet: it may count
                  </p>
                </li>
              ))}
            </ol>
          )}
          <p className="mt-4 text-xs leading-relaxed text-ink-3">
            Counts personal cards from every bank, open or closed; business cards usually don&apos;t count. A card opened
            in a month counts to the end of that month {s.months} months later, so drop-off dates are on the safe side.
            {s.rule?.certainty === "widely reported" && " The rule comes from applicants' reports, not Chase's published terms."}
            {showLink && (
              <>
                {" "}
                <Link href="/next-card" className="link">
                  See which cards you can get
                </Link>
              </>
            )}
          </p>
        </div>
      )}
    </section>
  );
}
