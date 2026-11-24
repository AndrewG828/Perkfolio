import Link from "next/link";
import { ArrowUpRight, Scale } from "lucide-react";
import type { Card } from "@/shared/data/types";
import { pointValueOf, unvaluedIds, valuationEditions, type BankCurrencyId, type PointValue, type ProgramId } from "@/shared/data/points";
import { cardPageValue, currencyOfCard, trimCents, valueRangeLabel, valueRelation } from "@/shared/lib/points";
import { cn } from "@/shared/lib/format";
import { formatAsOf, hostOf, listJoin } from "./ui";

// Published values per point (US cents) from the outlets in valuations.ts. No hooks: server and client both use it.

const outlets = () => Array.from(new Set(valuationEditions.map((e) => e.outlet)));

/** "Nov 2026": the latest edition behind a value. */
export function valueAsOf(v: PointValue): string {
  const latest = [...v.values].sort((a, b) => b.asOf.localeCompare(a.asOf))[0];
  return latest ? formatAsOf(latest.asOf) : "";
}

/** "1.5–1.7¢" (or "1.7¢") for a value or a range of values. */
export function centsLabel(v: { low: number; high: number }): string {
  return v.low === v.high ? `${trimCents(v.low)}¢` : `${trimCents(v.low)}–${trimCents(v.high)}¢`;
}

/**
 * How the card pages' figure compares with a published median, as the words that follow it: "a more conservative
 * 1.7¢", "the same 1.2¢", "1.7¢, above every published value", "1.5–1.7¢, depending on the card". A figure above the
 * median is never called conservative. `median` defaults to the published one (the calculator passes the wallet's).
 */
export function cardPagePhrase(id: BankCurrencyId | ProgramId, median?: number): string | null {
  const card = cardPageValue(id);
  const v = pointValueOf(id);
  if (!card || !v) return card ? centsLabel(card) : null;
  const { relation, aboveAll } = valueRelation(card, { ...v, median: median ?? v.median });
  const label = centsLabel(card);
  switch (relation) {
    case "below":
      return `a more conservative ${label}`;
    case "same":
      return `the same ${label}`;
    case "above":
      return aboveAll && median === undefined ? `${label}, above every published value` : `${label}, above the median`;
    case "spans":
      return `${label}, depending on the card`;
  }
}

/** One line: "2¢ (1.8–2.2¢ · Nov 2026)", or nothing when no outlet values it. */
export function ValueInline({ id, className }: { id: BankCurrencyId | ProgramId; className?: string }) {
  const v = pointValueOf(id);
  if (!v) return null;
  return (
    <span className={cn("tabular-nums", className)} title={`Median of ${v.values.length} published value${v.values.length === 1 ? "" : "s"} (${valueAsOf(v)})`}>
      <span className="font-semibold text-ink">{trimCents(v.median)}¢</span>
      <span className="text-ink-3">
        {" "}
        ({v.low === v.high ? "" : `${valueRangeLabel(v)} · `}
        {valueAsOf(v)})
      </span>
    </span>
  );
}

/**
 * "Our card pages use a more conservative 1.7¢.": the card data's figure next to a published value, so the two numbers
 * are never shown unexplained. Nothing when no card earns these points or no outlet values them.
 */
export function CardPageNote({ id, className }: { id: BankCurrencyId | ProgramId; className?: string }) {
  const phrase = pointValueOf(id) ? cardPagePhrase(id) : null;
  if (!phrase) return null;
  return <span className={cn("text-ink-3", className)}>Our card pages use {phrase}.</span>;
}

/**
 * Card page: the value the card data uses, next to the published median for the same points (when an outlet values
 * them), worded by how the two compare, so the card page and the Points & Miles pages never show two unexplained
 * numbers.
 */
export function CardValueNote({ card }: { card: Card }) {
  const points = currencyOfCard(card);
  const id = points?.kind === "currency" ? (points.limited ? null : points.currency) : (points?.program ?? null);
  const v = id ? pointValueOf(id) : undefined;
  const ours = { low: card.pointValueCents, high: card.pointValueCents };
  const cmp = v ? valueRelation(ours, v) : null;
  const published = v ? `${trimCents(v.median)}¢ (median of ${v.values.length}${v.low === v.high ? "" : `, ${valueRangeLabel(v)}`}, ${valueAsOf(v)})` : "";
  return (
    <p className="mt-3 text-sm text-ink-3">
      We value {card.rewardsCurrency} at {card.pointValueCents}¢ each
      {v && cmp ? (
        cmp.relation === "below" ? (
          <>, a conservative figure for comparing cards. Published valuations put them at {published}. </>
        ) : cmp.relation === "same" ? (
          <>, the same as the published median: {published}. </>
        ) : (
          <>
            {" "}
            to compare cards, {cmp.aboveAll ? "above every published valuation" : "above the published median"}: {published}.{" "}
          </>
        )
      ) : (
        ". "
      )}
      <Link href="/about#methodology" className="link">
        How we value points
      </Link>
    </p>
  );
}

/** Value per point: the median, the outlet range and each outlet's figure with its edition, or why there's none. */
export function PointValuePanel({ id, name, className }: { id: BankCurrencyId | ProgramId; name: string; className?: string }) {
  const v = pointValueOf(id);
  const editions = valuationEditions;
  if (!v) {
    const listed = (unvaluedIds as string[]).includes(id);
    const edition = editions[0] ? formatAsOf(editions[0].edition) : "";
    return (
      <div className={cn("panel p-5", className)}>
        <h3 className="flex items-center gap-2 font-semibold text-navy">
          <Scale className="h-4 w-4 text-ink-3" aria-hidden /> Value per point
        </h3>
        <p className="mt-2 text-sm text-ink-2">
          {listed
            ? `None of the outlets we follow (${listJoin(outlets())}) publishes a value for ${name} in its ${edition} table, so we don't show one.`
            : `No published value for ${name} yet, so we don't show one.`}{" "}
          Use the deal calculator with your own number.
        </p>
      </div>
    );
  }
  const span = Math.max(v.high - v.low, 0.0001);
  const pos = (c: number) => `${((c - v.low) / span) * 100}%`;
  const card = cardPageValue(v.id);
  const cmp = card ? valueRelation(card, v) : null;
  return (
    <div className={cn("panel p-5", className)}>
      <h3 className="flex items-center gap-2 font-semibold text-navy">
        <Scale className="h-4 w-4 text-ink-3" aria-hidden /> Value per point
      </h3>
      <p className="mt-2">
        <span className="text-3xl font-semibold tracking-tight text-navy tabular-nums">{trimCents(v.median)}¢</span>
        <span className="ml-1.5 text-sm text-ink-2">
          median of {v.values.length} outlet{v.values.length === 1 ? "" : "s"} · {valueAsOf(v)}
        </span>
      </p>
      {v.values.length > 1 && (
        <div className="mt-3" aria-hidden>
          <div className="relative h-1.5 rounded-full bg-sky">
            {v.values.map((o) => (
              <span
                key={o.outlet}
                className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-brand shadow"
                style={{ left: pos(o.cents) }}
              />
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[11px] text-ink-3 tabular-nums">
            <span>{trimCents(v.low)}¢</span>
            <span>{trimCents(v.high)}¢</span>
          </div>
        </div>
      )}
      <ul className="mt-3 divide-y divide-line border-t border-line text-sm">
        {v.values.map((o) => (
          <li key={o.outlet} className="flex items-start justify-between gap-3 py-2">
            <span className="min-w-0">
              <a href={o.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-brand hover:underline">
                {o.outlet} <ArrowUpRight className="h-3 w-3" aria-hidden />
              </a>
              <span className="block text-xs text-ink-3">
                {formatAsOf(o.asOf)}
                {o.previousCents ? ` · was ${trimCents(o.previousCents)}¢` : ""}
                {o.variants?.map((x) => ` · ${trimCents(x.cents)}¢ for ${x.appliesTo}`).join("")}
              </span>
              {o.method && <span className="block text-xs text-ink-3">Method: {o.method}</span>}
              {o.note && <span className="mt-0.5 block text-xs leading-relaxed text-ink-2">{o.note}</span>}
            </span>
            <span className="shrink-0 font-semibold text-ink tabular-nums">{trimCents(o.cents)}¢</span>
          </li>
        ))}
      </ul>
      {v.note && <p className="mt-2 text-xs leading-relaxed text-ink-3">{v.note}</p>}
      {card && cmp && (
        <p className="mt-2 text-xs leading-relaxed text-ink-3">
          {cmp.relation === "below"
            ? `Perkfolio's card pages use a more conservative ${centsLabel(card)} for these points, to compare cards on value you can count on.`
            : cmp.relation === "same"
              ? `Perkfolio's card pages use the same ${centsLabel(card)} for these points.`
              : cmp.relation === "above"
                ? `Perkfolio's card pages use ${centsLabel(card)} for these points, ${cmp.aboveAll ? "higher than every outlet here" : "above the median"}.`
                : `Perkfolio's card pages use ${centsLabel(card)} for these points, depending on the card.`}
        </p>
      )}
      <p className="mt-2 text-xs text-ink-3">US cents per point, as published. Sources: {listJoin(Array.from(new Set(v.values.map((o) => hostOf(o.url)))))}.</p>
    </div>
  );
}
