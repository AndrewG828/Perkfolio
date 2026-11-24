import type { Card, Credit } from "@/shared/data/types";
import { cards as allCards } from "@/shared/data/cards";
// The value data itself and the small modules beside it, not the Points & Miles index: pages that only value points
// (the calculator, Compare, Which Card?, the tracker) shouldn't load every program, sweet spot and airline.
import { BANK_CURRENCY_IDS, type BankCurrencyId, type PointValue, type ProgramId } from "@/shared/data/points/types";
import { bankCurrencies } from "@/shared/data/points/currencies";
import { programNames } from "@/shared/data/points/program-names";
import { pointValues, unvaluedIds, valuationEditions } from "@/shared/data/points/valuations";
import { cardsEarningIn, currencyOfCard, trimCents, type LimitedTransfers } from "./card-currency";

/**
 * One value per point, everywhere: every page and tool (the calculator, Compare, Which Card?, the next-card ranking,
 * card pages, the tracker, Points & Miles, the hotel calculator, Start here) asks this module what a point is worth.
 *
 * A currency or program (`resolvePointValue`):
 * 1. the user's own value, if they set one (the tracker's Points tab, `ValueContext.own`);
 * 2. else the published median: the middle of The Points Guy's, Upgraded Points' and NerdWallet's figures in
 *    shared/data/points/valuations.ts (generated from the verified research by `npm run points:import`). Once the
 *    user's cards are known (`ValueContext.cards`), an outlet's figure for cardholders like them replaces its headline
 *    one (NerdWallet's 1.3¢ for Citi points without a Strata Premier or Elite) and the median is taken again;
 * 3. else, only for points no outlet values, the card file's `pointValueCents` (from the cards that earn them in full);
 * 4. else nothing: pages ask for the user's own value instead of estimating one.
 *
 * A card (`cardPointValue`): cash back counts at face value, 1¢ a point. A card whose points transfer only with
 * another card (currencyOfCard's `limited`: Freedom Unlimited and Flex, Double Cash, Custom Cash, Savor) counts as
 * cash back too, until the cards in context include one that unlocks transfers; then its points are the currency's
 * points, worth what the currency is worth, as walletPoints() already treats them. Otherwise the card's currency or
 * program is resolved as above, with the card itself counted among the user's cards.
 *
 * The same rule holds for the currency itself: once the wallet is known, a bank currency it earns only on cards that
 * can't transfer it yet (a Freedom Unlimited without a Sapphire) is worth 1¢ a point as cash back (`locked`), so the
 * tracker's balances, the deal calculator and the card pages agree on one value for those points.
 *
 * Pure: pages pass the context after hydration (frontend/state/point-values.ts), never before. Like shared/lib/points,
 * every function takes the dataset as an optional last argument so tests can run against fixed data.
 */

export interface ValueContext {
  /** The user's own cents per point, by currency or program id. */
  own?: Readonly<Record<string, number>>;
  /** Card ids the user holds (the wallet). Leave out until it's known. */
  cards?: readonly string[];
}

/** Where a value comes from: the user's own figure, the published median, the card file's estimate, or cash back. */
export type ValueBasis = "own" | "median" | "estimate" | "cash";

/** A published value as it applies to a set of cards. */
export interface WalletValue {
  low: number;
  median: number;
  high: number;
  /** Set when an outlet's figure for these cards replaced its headline figure. */
  variant?: { outlet: string; appliesTo: string; cents: number };
}

export interface PointValueResult {
  /** US cents per point. */
  cents: number;
  basis: ValueBasis;
  /** The currency or program the points are in (absent for plain cash back). */
  id?: string;
  /** Every outlet's figure, when any outlet values these points (also with the user's own value, to show the default). */
  published?: PointValue;
  /** The published low, median and high for the cards in context (the headline figures without cards). */
  forCards?: WalletValue;
  /**
   * The wallet earns these bank points only on cards whose transfers need another card it doesn't hold, so they count
   * as cash back (basis "cash"): why, and the cards that would unlock them.
   */
  locked?: LimitedTransfers;
}

export interface CardPointValue extends PointValueResult {
  /** The card's points transfer only with another card: why, the cards that unlock them, and the one in context. */
  limited?: LimitedTransfers & { unlockedWith?: string };
}

/** The published values and the card data the resolver reads. */
export interface ValueData {
  values: PointValue[];
  cards: Card[];
}

export const valueData: ValueData = { values: pointValues, cards: allCards };

// ------------------------------------------------------------------------------------------------ Published values

/** "The Points Guy", "Upgraded Points", "NerdWallet": the outlets behind every median. */
export const VALUE_OUTLETS: string[] = Array.from(new Set(valuationEditions.map((e) => e.outlet)));

const LONG_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const joinWith = (items: string[], word: string) => (items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} ${word} ${items[items.length - 1]}`);

/** "2026-11": the outlets' edition (they're read together, so they share one). */
export const VALUE_EDITION: string = valuationEditions.map((e) => e.edition).sort().reverse()[0] ?? "";
/** "November 2026" */
export const VALUE_EDITION_LABEL: string = VALUE_EDITION ? `${LONG_MONTHS[Number(VALUE_EDITION.slice(5, 7)) - 1]} ${VALUE_EDITION.slice(0, 4)}` : "";
/** "the median of the November 2026 figures from The Points Guy, Upgraded Points and NerdWallet" */
export const MEDIAN_SOURCE = `the median of the ${VALUE_EDITION_LABEL} figures from ${joinWith(VALUE_OUTLETS, "and")}`;

/**
 * Why there's no published value for these points, for ids the outlets' tables leave out ("Not listed in the
 * November 2026 tables of The Points Guy, Upgraded Points or NerdWallet."). Undefined otherwise.
 */
export function noValueReason(id: string): string | undefined {
  return (unvaluedIds as string[]).includes(id) ? `Not listed in the ${VALUE_EDITION_LABEL} tables of ${joinWith(VALUE_OUTLETS, "or")}.` : undefined;
}

const STRATA = ["citi-strata-elite", "citi-strata-premier"];

/**
 * Which cards an outlet's lower figure (OutletValue.variants) applies to, by currency. NerdWallet values Chase at
 * 1.4¢ for "Sapphire Preferred and Ink Preferred cardholders" (Hyatt at 4:3) and Citi at 1.3¢ for "other Citi cards"
 * (no Strata Premier or Strata Elite).
 */
const VARIANT_FOR: Partial<Record<BankCurrencyId, (cardIds: Set<string>) => boolean>> = {
  "chase-ur": (ids) =>
    !["chase-sapphire-reserve", "chase-sapphire-reserve-business"].some((id) => ids.has(id)) &&
    ["chase-sapphire-preferred", "chase-ink-business-preferred"].some((id) => ids.has(id)),
  "citi-typ": (ids) => !STRATA.some((id) => ids.has(id)) && cardsEarningIn("citi-typ", allCards).some((c) => ids.has(c.id)),
};

/** The middle value (the mean of the two middle ones for an even count). */
function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * A published value as it applies to a set of cards: an outlet's lower figure for those cards (NerdWallet's 1.3¢ for
 * Citi cards without a Strata Premier or Elite) replaces its headline figure, and the median is taken again.
 */
export function valueForWallet(v: PointValue, cardIds: readonly string[]): WalletValue {
  const ids = new Set(cardIds);
  const applies = (BANK_CURRENCY_IDS as readonly string[]).includes(v.id) && VARIANT_FOR[v.id as BankCurrencyId]?.(ids);
  const outlet = applies ? v.values.find((o) => o.variants?.length) : undefined;
  if (!outlet) return { low: v.low, median: v.median, high: v.high };
  const variant = outlet.variants![0];
  const cents = v.values.map((o) => (o === outlet ? variant.cents : o.cents));
  return {
    low: Math.min(...cents),
    median: Math.round(median(cents) * 1000) / 1000,
    high: Math.max(...cents),
    variant: { outlet: outlet.outlet, appliesTo: variant.appliesTo, cents: variant.cents },
  };
}

// ------------------------------------------------------------------------------------------------------ Resolving

const ownValue = (own: ValueContext["own"], id: string) => {
  const v = own?.[id];
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : undefined;
};

/** True when the card earns these points with full transfer rights (or the program's points directly). */
function earnsInFull(card: Card, id: string): boolean {
  const p = currencyOfCard(card);
  return p?.kind === "currency" ? p.currency === id && !p.limited : p?.kind === "program" && p.program === id;
}

/** The card files' `pointValueCents` for points no outlet values: the cards that earn them in full (a test keeps them equal). */
function cardEstimate(id: string, cards: Card[]): number | undefined {
  return cards.find((c) => earnsInFull(c, id))?.pointValueCents;
}

/**
 * Why the cards in context can't transfer a bank currency they earn: every card of theirs that earns it needs another
 * card to transfer (none earns it in full). Null when the wallet isn't known, earns the currency in full, or doesn't
 * earn it at all (then the published value stands: they may be thinking of getting such a card).
 */
export function lockedFor(id: string, cardIds: readonly string[] | undefined, cards: Card[] = allCards): LimitedTransfers | null {
  if (!cardIds || !(BANK_CURRENCY_IDS as readonly string[]).includes(id)) return null;
  const earning = cards.filter((c) => {
    if (!cardIds.includes(c.id)) return false;
    const p = currencyOfCard(c);
    return p?.kind === "currency" && p.currency === id;
  });
  if (earning.length === 0) return null;
  const limits = earning.map((c) => currencyOfCard(c)).map((p) => (p?.kind === "currency" ? p.limited : undefined));
  if (limits.some((l) => !l)) return null;
  return limits[0] ?? null;
}

/**
 * What a point of a currency or program is worth: the user's own value, else the published median (for the cards in
 * context), else the card files' estimate for points no outlet values, else undefined (ask the user). A bank currency
 * the wallet earns only on cards that can't transfer it yet is cash back, 1¢ (`locked`), as those cards are.
 */
export function resolvePointValue(id: string | null | undefined, ctx: ValueContext = {}, data: ValueData = valueData): PointValueResult | undefined {
  if (!id) return undefined;
  const published = data.values.find((v) => v.id === id);
  const forCards = published ? (ctx.cards ? valueForWallet(published, ctx.cards) : { low: published.low, median: published.median, high: published.high }) : undefined;
  const locked = lockedFor(id, ctx.cards, data.cards);
  if (locked) return { cents: 1, basis: "cash", id, locked, ...(published ? { published, forCards } : {}) };
  const own = ownValue(ctx.own, id);
  if (own !== undefined) return { cents: own, basis: "own", id, ...(published ? { published, forCards } : {}) };
  if (published && forCards) return { cents: forCards.median, basis: "median", id, published, forCards };
  const estimate = cardEstimate(id, data.cards);
  return estimate === undefined ? undefined : { cents: estimate, basis: "estimate", id };
}

/** `cards` plus `id`, once. */
const withCard = (cards: readonly string[] | undefined, id: string) => (cards?.includes(id) ? [...cards] : [...(cards ?? []), id]);

/**
 * What one of a card's points (or a cash-back cent) is worth, with the card counted among the user's cards: cash back
 * at face value; a card whose transfers need another card as cash back until a card in context unlocks them; anything
 * else at its currency's or program's value (resolvePointValue), or the card file's own figure when none is published.
 */
export function cardPointValue(card: Card, ctx: ValueContext = {}, data: ValueData = valueData): CardPointValue {
  const points = currencyOfCard(card);
  if (!points) return { cents: 1, basis: "cash" };
  const cards = withCard(ctx.cards, card.id);
  if (points.kind === "currency" && points.limited) {
    const unlockedWith = points.limited.unlockedBy.find((id) => cards.includes(id));
    const limited = { ...points.limited, ...(unlockedWith ? { unlockedWith } : {}) };
    const unlocked = unlockedWith ? resolvePointValue(points.currency, { ...ctx, cards }, data) : undefined;
    return unlocked ? { ...unlocked, limited } : { cents: 1, basis: "cash", id: points.currency, limited };
  }
  const id = points.kind === "currency" ? points.currency : points.program;
  return resolvePointValue(id, { ...ctx, cards }, data) ?? { cents: card.pointValueCents, basis: "estimate", id };
}

/**
 * What a credit is worth in dollars a period: its face value, or for a benefit paid in points (Venture X's anniversary
 * miles) the points at what they're worth to this visitor (resolvePointValue: their own value, else the median).
 */
export function creditValue(credit: Pick<Credit, "annualValue" | "points">, ctx: ValueContext = {}): number {
  if (!credit.points) return credit.annualValue;
  const cents = resolvePointValue(credit.points.program, ctx)?.cents;
  return cents === undefined ? credit.annualValue : Math.round((credit.points.amount * cents) / 100);
}

/** A card's credits a year, as annualizedCreditValue() counts them, with points benefits at creditValue(). */
export function annualizedCredits(card: Card, ctx: ValueContext = {}): number {
  return card.credits.reduce((sum, c) => {
    if (c.frequency === "every-4-years") return sum + creditValue(c, ctx) / 4;
    if (c.frequency === "one-time") return sum;
    return sum + creditValue(c, ctx);
  }, 0);
}

/** Return in percent on a dollar of spend at `rate` (points per dollar, or a cash-back percent): 3x at 2¢ = 6%. */
export const returnPercent = (card: Card, rate: number, ctx: ValueContext = {}) => rate * cardPointValue(card, ctx).cents;

// -------------------------------------------------------------------------------------------------------- Display

/** Cents for display, at most two decimals: "2¢", "0.73¢", "2.23¢" (Accor's 2.225). */
export const formatCents = (c: number) => `${trimCents(c)}¢`;

/** "your value", "November 2026 median", "estimate" or "cash back", for a line like "2¢ (your value)". */
export function basisLabel(v: Pick<PointValueResult, "basis">): string {
  return v.basis === "own" ? "your value" : v.basis === "median" ? `${VALUE_EDITION_LABEL} median` : v.basis === "estimate" ? "estimate" : "cash back";
}

/** "your own value from the tracker's Points tab", "the median of the November 2026 figures from …", … in a sentence. */
export function basisSentence(v: Pick<PointValueResult, "basis">): string {
  switch (v.basis) {
    case "own":
      return "your own value from the tracker's Points tab";
    case "median":
      return MEDIAN_SOURCE;
    case "estimate":
      return "our estimate, since no outlet we follow publishes a value for these points";
    case "cash":
      return "cash back at face value";
  }
}

// --------------------------------------------------------------------------------------------------- Value sources

export interface ValueSource {
  id: BankCurrencyId | ProgramId;
  label: string;
  kind: "currency" | "program";
  value: PointValue;
}

/**
 * Points with a published value, for pickers like the deal calculator's: bank currencies first, then programs by name.
 * Ids no outlet values are left out, never estimated; resolve each one's cents with resolvePointValue.
 */
export function valueSources(values: PointValue[] = pointValues): ValueSource[] {
  const isCurrency = (id: string): id is BankCurrencyId => (BANK_CURRENCY_IDS as readonly string[]).includes(id);
  const list = values.map(
    (v): ValueSource => ({
      id: v.id,
      label: isCurrency(v.id) ? (bankCurrencies.find((c) => c.id === v.id)?.shortName ?? v.id) : programNames[v.id].name,
      kind: isCurrency(v.id) ? "currency" : "program",
      value: v,
    }),
  );
  const currencies = BANK_CURRENCY_IDS.flatMap((id) => list.filter((s) => s.id === id));
  const programs = list.filter((s) => s.kind === "program").sort((a, b) => a.label.localeCompare(b.label));
  return [...currencies, ...programs];
}
