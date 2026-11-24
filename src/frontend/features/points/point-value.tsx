"use client";

import Link from "next/link";
import { ArrowUpRight, Scale } from "lucide-react";
import { valuationEditions, type BankCurrencyId, type PointValue, type ProgramId } from "@/shared/data/points";
import { trimCents, valueRangeLabel } from "@/shared/lib/points";
import { MEDIAN_SOURCE, VALUE_OUTLETS, formatCents, noValueReason, resolvePointValue } from "@/shared/lib/point-value";
import { useValueContext } from "@/frontend/state/point-values";
import { cn } from "@/shared/lib/format";
import { formatAsOf, hostOf, listJoin } from "./ui";

// What a point is worth, as every page says it (shared/lib/point-value.ts): the visitor's own value once their
// preferences load, else the published median of the outlets in valuations.ts.

/** "Nov 2026": the latest edition behind a value. */
function valueAsOf(v: PointValue): string {
  const latest = [...v.values].sort((a, b) => b.asOf.localeCompare(a.asOf))[0];
  return latest ? formatAsOf(latest.asOf) : "";
}

/** One line: "2¢ (1.3–2.2¢ · Nov 2026)", "2.5¢ (your value)", or nothing when no outlet values it and the user hasn't. */
export function ValueInline({ id, className }: { id: BankCurrencyId | ProgramId; className?: string }) {
  const values = useValueContext();
  const v = resolvePointValue(id, values);
  if (!v || (v.basis !== "own" && !v.published && !v.locked)) return null;
  if (v.locked) {
    return (
      <span className={cn("tabular-nums", className)} title={v.locked.note}>
        <span className="font-semibold text-ink">{formatCents(v.cents)}</span>
        <span className="text-ink-3"> (cash back with your cards)</span>
      </span>
    );
  }
  if (v.basis === "own") {
    return (
      <span className={cn("tabular-nums", className)} title={v.published ? `Your own value; the published median is ${formatCents(v.forCards?.median ?? v.published.median)}` : "Your own value"}>
        <span className="font-semibold text-ink">{formatCents(v.cents)}</span>
        <span className="text-ink-3"> (your value)</span>
      </span>
    );
  }
  const p = v.published!;
  const range = v.forCards ?? p;
  return (
    <span className={cn("tabular-nums", className)} title={`Median of ${p.values.length} published value${p.values.length === 1 ? "" : "s"} (${valueAsOf(p)})`}>
      <span className="font-semibold text-ink">{formatCents(v.cents)}</span>
      <span className="text-ink-3">
        {" "}
        ({range.low === range.high ? "" : `${valueRangeLabel(range)} · `}
        {valueAsOf(p)})
      </span>
    </span>
  );
}

/** Value per point: the value every page uses, the outlet range and each outlet's figure with its edition, or why there's none. */
export function PointValuePanel({ id, name, className }: { id: BankCurrencyId | ProgramId; name: string; className?: string }) {
  const values = useValueContext();
  const resolved = resolvePointValue(id, values);
  const v = resolved?.published;
  const own = resolved?.basis === "own" ? resolved.cents : undefined;
  const setOwn = (
    <Link href="/tracker?tab=points" className="link">
      Points tab
    </Link>
  );
  if (!v) {
    const reason = noValueReason(id);
    const edition = valuationEditions[0] ? formatAsOf(valuationEditions[0].edition) : "";
    return (
      <div className={cn("panel p-5", className)}>
        <h3 className="flex items-center gap-2 font-semibold text-navy">
          <Scale className="h-4 w-4 text-ink-3" aria-hidden /> Value per point
        </h3>
        {own !== undefined && (
          <p className="mt-2">
            <span className="text-3xl font-semibold tracking-tight text-navy tabular-nums">{formatCents(own)}</span>
            <span className="ml-1.5 text-sm text-ink-2">your value</span>
          </p>
        )}
        <p className="mt-2 text-sm text-ink-2">
          {reason
            ? `None of the outlets we follow (${listJoin(VALUE_OUTLETS)}) publishes a value for ${name} in its ${edition} table, so we don't show one.`
            : `No published value for ${name} yet, so we don't show one.`}{" "}
          {own !== undefined ? (
            <>You set your own on the tracker&apos;s {setOwn}; every page uses it.</>
          ) : (
            <>
              Use the{" "}
              <Link href="/points#deal-title" className="link">
                deal calculator
              </Link>{" "}
              with your own number.
            </>
          )}
        </p>
      </div>
    );
  }
  // The published range for the visitor's cards (NerdWallet's lower Chase figure with a Sapphire Preferred but no Reserve, say).
  const range = resolved?.forCards ?? v;
  const span = Math.max(v.high - v.low, 0.0001);
  const pos = (c: number) => `${((c - v.low) / span) * 100}%`;
  return (
    <div className={cn("panel p-5", className)}>
      <h3 className="flex items-center gap-2 font-semibold text-navy">
        <Scale className="h-4 w-4 text-ink-3" aria-hidden /> Value per point
      </h3>
      <p className="mt-2">
        <span className="text-3xl font-semibold tracking-tight text-navy tabular-nums">{formatCents(own ?? range.median)}</span>
        <span className="ml-1.5 text-sm text-ink-2">
          {own !== undefined
            ? `your value · the published median is ${formatCents(range.median)}`
            : `median of ${v.values.length} outlet${v.values.length === 1 ? "" : "s"} · ${valueAsOf(v)}`}
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
      {resolved?.locked ? (
        <p className="mt-2 rounded-md bg-sky/60 p-2.5 text-xs leading-relaxed text-ink-2">
          With the cards in your wallet these points are cash back, 1¢ each, wherever Perkfolio values them: {resolved.locked.note}
        </p>
      ) : (
        resolved?.forCards?.variant && (
          <p className="mt-2 text-xs leading-relaxed text-ink-3">
            For your cards the median is {formatCents(resolved.forCards.median)}, using {resolved.forCards.variant.outlet}&apos;s{" "}
            {trimCents(resolved.forCards.variant.cents)}¢ for {resolved.forCards.variant.appliesTo}.
          </p>
        )
      )}
      <p className="mt-2 text-xs leading-relaxed text-ink-3">
        {own !== undefined ? (
          <>Every page on Perkfolio uses your value, set on the tracker&apos;s {setOwn}.</>
        ) : (
          <>
            Every page on Perkfolio uses this value: {MEDIAN_SOURCE}. Set your own on the tracker&apos;s {setOwn}.
          </>
        )}{" "}
        US cents per point, as published. Sources: {listJoin(Array.from(new Set(v.values.map((o) => hostOf(o.url)))))}.
      </p>
    </div>
  );
}
