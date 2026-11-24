import Link from "next/link";
import { ArrowRight, ClipboardList, Info } from "lucide-react";
import { BOOKING_RULE_KEYS, programName, type BookingRuleKey, type BookingRules } from "@/shared/data/points";
import { num } from "@/shared/lib/format";
import { SourceList, Unknown, formatAsOf } from "./ui";

// Booking-rule labels and the per-program panel. No hooks, so server pages and the client matrix both use them.

export const BOOKING_RULE_LABEL: Record<BookingRuleKey, { label: string; short: string }> = {
  holds: { label: "Award holds", short: "Holds" },
  stopovers: { label: "Stopovers", short: "Stopovers" },
  phoneFee: { label: "Phone booking fee", short: "Phone fee" },
  partnerFee: { label: "Partner award fee", short: "Partner fee" },
  changeCancel: { label: "Changes and cancellations", short: "Change / cancel" },
  bookingWindowDays: { label: "Booking window", short: "Window" },
  phoneOnlyPartners: { label: "Partner awards you must book by phone", short: "Phone-only partners" },
  fuelSurcharges: { label: "Fuel and carrier surcharges", short: "Surcharges" },
};

/** The rule's text ("355 days before departure" for the window), or null when unknown. */
export function ruleText(rules: BookingRules, key: BookingRuleKey): string | null {
  if (key === "bookingWindowDays") return rules.bookingWindowDays === null ? null : `${num(rules.bookingWindowDays)} days before departure`;
  return rules[key];
}

/** How many of the eight rules a source confirmed (none for a program that uses another's rules). */
export function knownRuleCount(rules: BookingRules): number {
  return rules.sameAs ? 0 : BOOKING_RULE_KEYS.filter((k) => ruleText(rules, k) !== null).length;
}

/** The notes that qualify the booking window ("The 360-day window is for JAL-operated flights"). */
export function windowNotes(rules: BookingRules): string[] {
  return (rules.notes ?? []).filter((n) => /\bwindow\b|days? ahead|\bschedule\b|\bmonths? out\b/i.test(n));
}

/** "Uses Virgin Atlantic Flying Club's rules →" for a program with no rules of its own. */
export function SameRulesLink({ rules, className }: { rules: BookingRules; className?: string }) {
  if (!rules.sameAs) return null;
  return (
    <Link href={`/points/programs/${rules.sameAs}#booking-rules`} className={className ?? "inline-flex items-center gap-1 font-semibold text-brand hover:underline"}>
      Same rules as {programName(rules.sameAs)} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
    </Link>
  );
}

/** Program page: every rule, "Not confirmed" where no source gave one, then the research's qualifiers. */
export function BookingRulesPanel({ rules, programName: name }: { rules: BookingRules; programName: string }) {
  const known = knownRuleCount(rules);
  const notes = rules.notes ?? [];
  return (
    <div className="space-y-4">
      {rules.sameAs ? (
        <div className="panel space-y-2 p-5 text-sm leading-relaxed text-ink-2">
          <p className="font-semibold text-ink">
            {name} has no award rules of its own: flights are booked as {programName(rules.sameAs)} awards, so its rules apply.
          </p>
          <SameRulesLink rules={rules} />
        </div>
      ) : (
        <dl className="grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2">
          {BOOKING_RULE_KEYS.map((k) => {
            const text = ruleText(rules, k);
            const qualifiers = k === "bookingWindowDays" && text ? windowNotes(rules) : [];
            return (
              <div key={k} className="bg-white p-4">
                <dt className="text-xs font-semibold tracking-wide text-ink-3 uppercase">{BOOKING_RULE_LABEL[k].label}</dt>
                <dd className="mt-1 text-sm leading-relaxed text-ink">
                  {text ?? <Unknown>Not confirmed</Unknown>}
                  {qualifiers.map((q) => (
                    <span key={q} className="mt-1 block text-xs text-ink-2">
                      {q}
                    </span>
                  ))}
                </dd>
              </div>
            );
          })}
        </dl>
      )}
      {notes.length > 0 && (
        <details className="group rounded-md border border-line bg-white">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-navy hover:bg-canvas [&::-webkit-details-marker]:hidden">
            <Info className="h-4 w-4 text-ink-3" aria-hidden /> Notes from the sources ({notes.length})
          </summary>
          <ul className="list-disc space-y-1.5 border-t border-line py-3 pr-4 pl-9 text-sm leading-relaxed text-ink-2">
            {notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </details>
      )}
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 text-xs text-ink-3">
        <p>
          {rules.sameAs
            ? `As of ${formatAsOf(rules.asOf)}.`
            : `${known} of ${BOOKING_RULE_KEYS.length} rules confirmed for ${name} · as of ${formatAsOf(rules.asOf)}. Rules no source confirmed say "Not confirmed" rather than guess.`}{" "}
          TPG = The Points Guy, UP = Upgraded Points.
        </p>
        <SourceList urls={rules.sources} />
      </div>
      <Link href="/points/booking-rules" className="group inline-flex items-center gap-1 text-sm font-semibold text-brand hover:underline">
        <ClipboardList className="h-4 w-4" aria-hidden /> Compare booking rules across programs
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
      </Link>
    </div>
  );
}
