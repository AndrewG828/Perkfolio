"use client";

import { useId, useState } from "react";
import { Calculator, Info, RotateCcw } from "lucide-react";
import type { Card } from "@/shared/data/types";
import { valuationEditions } from "@/shared/data/points";
import {
  cardPageValue,
  currencyOfCard,
  judgeRedemption,
  trimCents,
  valueForWallet,
  valueRangeLabel,
  valueRelation,
  valueSources,
  type DealVerdict,
} from "@/shared/lib/points";
import { shortCardName } from "@/shared/lib/card-name";
import { Meter, type MeterTone } from "@/frontend/components/meter";
import { cn, usd } from "@/shared/lib/format";
import { cardPagePhrase, centsLabel } from "./point-value";
import { formatAsOf, listJoin } from "./ui";
import { useWalletReach } from "./use-wallet-reach";

/** True when the card's rewards are these points (a bank currency, even one it can't transfer alone, or a program). */
const cardEarns = (card: Card, id: string) => {
  const p = currencyOfCard(card);
  return p?.kind === "currency" ? p.currency === id : p?.kind === "program" && p.program === id;
};

const SOURCES = valueSources();
/** Picking this means "my own value": no published median to start from. */
const OTHER = "other";
const OUTLETS = Array.from(new Set(valuationEditions.map((e) => e.outlet)));
const EDITION = valuationEditions[0] ? formatAsOf(valuationEditions[0].edition) : "";

const VERDICT: Record<DealVerdict, { label: string; tone: MeterTone; badge: string }> = {
  great: { label: "Great deal", tone: "success", badge: "bg-success text-white" },
  good: { label: "Good deal", tone: "success", badge: "bg-success/12 text-success" },
  fair: { label: "About break-even", tone: "warn", badge: "bg-warn/12 text-warn" },
  poor: { label: "Poor value", tone: "warn", badge: "bg-danger/10 text-danger" },
};

const toNumber = (v: string) => (v.trim() === "" ? Number.NaN : Number(v));

/**
 * "Is this a good redemption?": cents per point against what the points are worth. The value starts at the median of
 * the outlets' published valuations for the points you pick; you can type your own.
 */
export function DealCalculator() {
  const id = useId();
  const wallet = useWalletReach();
  const [cash, setCash] = useState("1200");
  const [taxes, setTaxes] = useState("85");
  const [points, setPoints] = useState("60000");
  const [picked, setPicked] = useState<string | null>(null);
  /** The value typed by the user, per source (kept when switching back and forth). */
  const [override, setOverride] = useState<Record<string, string>>({});

  // Default to points the wallet earns: a bank currency first (even one its cards can't transfer yet), else a program.
  const earned = [...wallet.points.currencies.map((c) => c.currency as string), ...wallet.points.programs.map((p) => p.program as string)];
  const walletDefault = earned.map((id) => SOURCES.find((s) => s.id === id)).find(Boolean)?.id;
  const sourceId = picked ?? walletDefault ?? SOURCES[0]?.id ?? OTHER;
  const source = SOURCES.find((s) => s.id === sourceId);
  // An outlet's lower figure for the wallet's cards (NerdWallet's 1.3¢ for Citi cards without a Strata Premier or Elite).
  const forWallet = source && wallet.hydrated ? valueForWallet(source.value, wallet.cardIds) : null;
  const median = forWallet?.median ?? source?.cents;
  const typed = override[sourceId];
  const valueText = typed ?? (median !== undefined ? trimCents(median) : "");
  const value = toNumber(valueText);
  const custom = typed !== undefined && (median === undefined || toNumber(typed) !== median);
  const label = source?.label ?? "these points";
  const cashPrice = toNumber(cash);
  const taxesPaid = toNumber(taxes);
  const feesOverCash = Number.isFinite(cashPrice) && Number.isFinite(taxesPaid) && cashPrice >= 0 && taxesPaid >= cashPrice && taxesPaid > 0;
  const result = feesOverCash ? null : judgeRedemption({ cashPrice, taxes: taxesPaid, points: toNumber(points), baselineCents: value });
  const v = result ? VERDICT[result.verdict] : null;
  const ours = custom ? "your value" : forWallet?.variant ? "the median for your cards" : "the median value";
  // The value Perkfolio's card pages use for these points, worded by how it compares with the median shown (it can be
  // lower, the same or higher), so the two numbers are never unexplained.
  const cardPage = source ? cardPageValue(source.id) : null;
  const phrase = source && cardPage && median !== undefined ? cardPagePhrase(source.id, median) : null;
  const relation = cardPage && median !== undefined && source ? valueRelation(cardPage, { ...source.value, median }).relation : null;
  // Name the cards behind that figure when none of the wallet's cards for these points is one of them (a Double Cash
  // wallet: the 1.6¢ is the Strata cards' figure, while its own card page values its cash back at 1¢).
  const walletCards = source ? wallet.points.cards.filter((c) => cardEarns(c, source.id)) : [];
  const figureNames =
    cardPage && walletCards.length > 0 && !walletCards.some((c) => cardPage.cards.includes(c)) ? listJoin(cardPage.cards.map((c) => shortCardName(c.name))) : "";
  // Option labels use the median for the wallet's cards once it's known (NerdWallet's 1.3¢ for Citi cards without a
  // Strata Premier or Elite), so the list and the value field agree.
  const optionCents = (s: (typeof SOURCES)[number]) => (wallet.hydrated ? valueForWallet(s.value, wallet.cardIds).median : s.cents);

  const field = (key: string, text: string, val: string, set: (v: string) => void, opts: { prefix?: string; suffix?: string; hint?: string; step?: number }) => (
    <div className="space-y-1.5">
      <label htmlFor={`${id}-${key}`} className="block text-sm font-medium text-ink">
        {text}
      </label>
      <div className="relative">
        {opts.prefix && <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3">{opts.prefix}</span>}
        <input
          id={`${id}-${key}`}
          type="number"
          min={0}
          step={opts.step ?? 1}
          inputMode="decimal"
          className={cn("input h-11 text-base tabular-nums", opts.prefix && "pl-7", opts.suffix && "pr-8")}
          value={val}
          onChange={(e) => set(e.target.value)}
          aria-describedby={opts.hint ? `${id}-${key}-hint` : undefined}
        />
        {opts.suffix && <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-ink-3">{opts.suffix}</span>}
      </div>
      {opts.hint && (
        <p id={`${id}-${key}-hint`} className="text-xs text-ink-3">
          {opts.hint}
        </p>
      )}
    </div>
  );

  return (
    <div className="panel grid overflow-hidden md:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <form className="space-y-4 p-5 md:p-6" onSubmit={(e) => e.preventDefault()} aria-label="Redemption details">
        {field("cash", "Cash price of the same ticket or room", cash, setCash, { prefix: "$", step: 10 })}
        {field("taxes", "Taxes and fees you'd still pay on the award", taxes, setTaxes, { prefix: "$", step: 5 })}
        {field("points", "Points needed", points, setPoints, {
          step: 500,
          hint: "Transferring at a ratio other than 1:1? Enter the bank points you'd move.",
        })}
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="space-y-1.5">
            <label htmlFor={`${id}-source`} className="block text-sm font-medium text-ink">
              Points you&apos;d use
            </label>
            <select id={`${id}-source`} className="input h-11 text-base" value={sourceId} onChange={(e) => setPicked(e.target.value)}>
              <optgroup label="Bank points">
                {SOURCES.filter((s) => s.kind === "currency").map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label} ({trimCents(optionCents(s))}¢)
                  </option>
                ))}
              </optgroup>
              <optgroup label="Airline and hotel points">
                {SOURCES.filter((s) => s.kind === "program").map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label} ({trimCents(optionCents(s))}¢)
                  </option>
                ))}
              </optgroup>
              <option value={OTHER}>Other points (your own value)</option>
            </select>
          </div>
          {field("value", "Value per point", valueText, (val) => setOverride((o) => ({ ...o, [sourceId]: val })), {
            suffix: "¢",
            step: 0.05,
          })}
        </div>
        <p className="-mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-3">
          {source ? (
            <span>
              {forWallet?.variant ? (
                <>
                  Median for your cards: {trimCents(forWallet.median)}¢, using {forWallet.variant.outlet}&apos;s {trimCents(forWallet.variant.cents)}¢ for{" "}
                  {forWallet.variant.appliesTo} (range {valueRangeLabel(forWallet)}, {EDITION}).
                </>
              ) : (
                <>
                  Median of {source.value.values.length} published value{source.value.values.length === 1 ? "" : "s"} for {source.label}: range{" "}
                  {valueRangeLabel(source.value)} ({EDITION}).
                </>
              )}
              {phrase && (
                <>
                  {" "}
                  Our card pages use {phrase}
                  {figureNames ? ` for ${figureNames} points` : ""}.
                </>
              )}
            </span>
          ) : (
            <span>No published value to start from: enter what a point is worth to you.</span>
          )}
          {custom && source && (
            <button
              type="button"
              className="inline-flex items-center gap-1 font-semibold text-brand hover:underline"
              onClick={() =>
                setOverride((o) => {
                  const next = { ...o };
                  delete next[sourceId];
                  return next;
                })
              }
            >
              <RotateCcw className="h-3 w-3" aria-hidden /> Use the median
            </button>
          )}
        </p>
      </form>

      <div className="flex flex-col justify-center gap-4 border-t border-line bg-canvas p-5 md:border-t-0 md:border-l md:p-6" aria-live="polite">
        {result && v ? (
          <>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <p>
                <span className="block text-sm font-medium text-ink-2">You&apos;d get</span>
                <span className="text-5xl font-semibold tracking-tight text-navy tabular-nums">{result.cents.toFixed(2)}¢</span>
                <span className="ml-1.5 text-sm text-ink-2">per point</span>
              </p>
              <span className={cn("rounded-full px-3 py-1 text-sm font-semibold", v.badge)}>{v.label}</span>
            </div>
            <Meter
              size="lg"
              value={result.cents}
              max={Math.max(result.cents, result.baselineCents * 2)}
              tone={v.tone}
              marker={{ value: result.baselineCents, label: `Value ${trimCents(result.baselineCents)}¢` }}
              label="Cents per point for this redemption"
            />
            <div className="flex justify-between text-xs text-ink-3">
              <span>0¢</span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-3 w-[2px] rounded-full bg-navy" /> {custom ? "Your value" : "Median value"} for {label}:{" "}
                {trimCents(result.baselineCents)}¢
              </span>
            </div>
            <p className="text-sm leading-relaxed text-ink-2">
              {result.cents === 0 ? (
                <>With no cash price to save, the points add no value here.</>
              ) : result.vsBaseline >= 0 ? (
                <>
                  That&apos;s {(result.cents / result.baselineCents).toFixed(1)}× {ours} of {trimCents(result.baselineCents)}¢, about{" "}
                  <strong className="text-ink">{usd(result.vsBaseline)} more</strong> than these points are worth at that value.
                </>
              ) : result.verdict === "fair" ? (
                <>Close to {ours} of {trimCents(result.baselineCents)}¢. Fine if you&apos;d rather keep the cash, but not a standout.</>
              ) : (
                <>
                  Below {ours} of {trimCents(result.baselineCents)}¢: you&apos;d give up about <strong className="text-ink">{usd(-result.vsBaseline)}</strong>{" "}
                  of value. Paying cash and saving the points is likely better.
                </>
              )}
            </p>
            {cardPage && result.cents > 0 && (
              <p className="text-xs leading-relaxed text-ink-3">
                Perkfolio&apos;s card pages value {label}
                {figureNames ? ` from ${figureNames}` : ""} at {centsLabel(cardPage)}
                {relation === "below"
                  ? ", a conservative figure for comparing cards"
                  : relation === "same"
                    ? ", the same as the median"
                    : relation === "above"
                      ? ", above the median"
                      : ""}
                : this redemption is {result.cents >= cardPage.high ? "above" : result.cents < cardPage.low ? "below" : "within"} that.
              </p>
            )}
          </>
        ) : feesOverCash ? (
          <div className="space-y-1.5 text-sm text-ink-2">
            <p className="font-semibold text-navy">Pay cash: the award costs more in fees than the fare</p>
            <p>
              The taxes and fees on the award ({usd(taxesPaid)}) are {taxesPaid === cashPrice ? "as much as" : "more than"} the cash price (
              {usd(cashPrice)}), so booking with points saves no money and still spends the points.
            </p>
          </div>
        ) : (
          <p className="flex items-center gap-3 text-sm text-ink-2">
            <Calculator className="h-5 w-5 text-ink-3" aria-hidden />
            {Number.isFinite(value) && value > 0
              ? "Enter a cash price and the points needed to see what each point is worth."
              : "Enter a value per point to compare against."}
          </p>
        )}
        <p className="flex gap-2 border-t border-line pt-3 text-xs leading-relaxed text-ink-3">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          Value per point = (cash price − taxes and fees) ÷ points × 100. Default values are the median of {listJoin(OUTLETS)} ({EDITION});
          points no outlet values have no default.
        </p>
      </div>
    </div>
  );
}
