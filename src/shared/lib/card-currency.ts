import type { Card } from "@/shared/data/types";
import type { BankCurrencyId, ProgramId } from "@/shared/data/points/types";

/**
 * What each card's rewards are (a bank currency, maybe with limited transfers; a program's points; or cash back),
 * with no Points & Miles data attached, so pages that only value points (the calculator, Compare, Which Card?, the
 * tracker) stay small. shared/lib/points.ts re-exports all of it.
 */

/** What a card's rewards are: a bank currency, or one program's points earned directly (co-brand cards). */
export type CardPoints =
  | { kind: "currency"; currency: BankCurrencyId; limited?: LimitedTransfers }
  | { kind: "program"; program: ProgramId };

/** A card that earns a bank currency but can only transfer it with help from another card. */
export interface LimitedTransfers {
  /** Why, in one sentence. */
  note: string;
  /** Card ids that unlock full transfers once points are combined. */
  unlockedBy: string[];
}

/** Matched against `rewardsCurrency` for cards that earn a bank currency outright. */
const CURRENCY_PATTERNS: [RegExp, BankCurrencyId][] = [
  [/membership rewards/i, "amex-mr"],
  [/ultimate rewards/i, "chase-ur"],
  [/capital one miles/i, "capital-one"],
  [/thankyou/i, "citi-typ"],
  [/bilt points/i, "bilt"],
  [/wells fargo rewards/i, "wells-fargo"],
];

/** Matched against `rewardsCurrency` for co-brand cards. */
const PROGRAM_PATTERNS: [RegExp, ProgramId][] = [
  [/united mileageplus/i, "united-mileageplus"],
  [/delta skymiles/i, "delta-skymiles"],
  [/atmos rewards/i, "atmos-rewards"],
  [/aadvantage/i, "american-aadvantage"],
  [/southwest rapid rewards/i, "southwest-rapid-rewards"],
  [/world of hyatt/i, "world-of-hyatt"],
  [/marriott bonvoy/i, "marriott-bonvoy"],
  [/hilton honors/i, "hilton-honors"],
];

const SAPPHIRE_OR_INK = [
  "chase-sapphire-preferred",
  "chase-sapphire-reserve",
  "chase-sapphire-reserve-business",
  "chase-ink-business-preferred",
];
const STRATA = ["citi-strata-elite", "citi-strata-premier"];
const VENTURE = ["capital-one-venture-x", "capital-one-venture-x-business", "capital-one-venture"];

/** Listed by id, on purpose: these earn a bank currency, but transfers need another card. */
const LIMITED: Record<string, { currency: BankCurrencyId } & LimitedTransfers> = {
  "chase-freedom-unlimited": {
    currency: "chase-ur",
    note: "Points transfer only after you combine them with a Sapphire Preferred, Sapphire Reserve or Ink Business Preferred account.",
    unlockedBy: SAPPHIRE_OR_INK,
  },
  "chase-freedom-flex": {
    currency: "chase-ur",
    note: "Points transfer only after you combine them with a Sapphire Preferred, Sapphire Reserve or Ink Business Preferred account.",
    unlockedBy: SAPPHIRE_OR_INK,
  },
  "citi-double-cash": {
    currency: "citi-typ",
    note: "On its own it transfers at reduced rates (usually 1,000 points to 700 miles) and not to every partner; pool the points into a Strata Premier or Strata Elite account to move them at the full ratios.",
    unlockedBy: STRATA,
  },
  "citi-custom-cash": {
    currency: "citi-typ",
    note: "On its own it transfers at reduced rates (usually 1,000 points to 700 miles) and not to every partner; pool the points into a Strata Premier or Strata Elite account to move them at the full ratios.",
    unlockedBy: STRATA,
  },
  "capital-one-savor": {
    currency: "capital-one",
    note: "Cash back becomes transferable miles only when you move it to a Venture or Venture X account.",
    unlockedBy: VENTURE,
  },
};

/** Listed by id, on purpose: plain cash back that can't become airline or hotel points. */
const CASH_ONLY = new Set(["amex-blue-cash-preferred", "amex-blue-cash-everyday", "wells-fargo-active-cash"]);

export type ClassificationRule = "limited" | "cash-only" | "currency" | "program" | "unclassified";

/**
 * How a card was classified. "unclassified" means no rule matched: a new card that needs an entry above (a test
 * fails until it has one). Cash-back cards must be listed by id so a "Cash back (… points)" card is never mistaken
 * for one that earns full transferable points.
 */
export function classifyCard(card: Pick<Card, "id" | "rewardsCurrency">): { points: CardPoints | null; rule: ClassificationRule } {
  const limited = LIMITED[card.id];
  if (limited) {
    const { currency, note, unlockedBy } = limited;
    return { points: { kind: "currency", currency, limited: { note, unlockedBy } }, rule: "limited" };
  }
  if (CASH_ONLY.has(card.id)) return { points: null, rule: "cash-only" };
  if (/^cash/i.test(card.rewardsCurrency)) return { points: null, rule: "unclassified" };
  for (const [re, program] of PROGRAM_PATTERNS) {
    if (re.test(card.rewardsCurrency)) return { points: { kind: "program", program }, rule: "program" };
  }
  for (const [re, currency] of CURRENCY_PATTERNS) {
    if (re.test(card.rewardsCurrency)) return { points: { kind: "currency", currency }, rule: "currency" };
  }
  return { points: null, rule: "unclassified" };
}

/** What a card's points are: a bank currency (maybe with limited transfers), a program directly, or null for cash. */
export function currencyOfCard(card: Pick<Card, "id" | "rewardsCurrency">): CardPoints | null {
  return classifyCard(card).points;
}

/** True when the card earns this bank currency with full transfer rights. */
export function earnsFully(card: Pick<Card, "id" | "rewardsCurrency">, currency: BankCurrencyId): boolean {
  const p = currencyOfCard(card);
  return p?.kind === "currency" && p.currency === currency && !p.limited;
}

/** The cards in `list` that earn a bank currency, full earners first. */
export function cardsEarningIn<C extends Pick<Card, "id" | "rewardsCurrency">>(currency: BankCurrencyId, list: readonly C[]): C[] {
  const earning = list.filter((c) => {
    const p = currencyOfCard(c);
    return p?.kind === "currency" && p.currency === currency;
  });
  return [...earning.filter((c) => earnsFully(c, currency)), ...earning.filter((c) => !earnsFully(c, currency))];
}

/** Cents for display: at most two decimals ("2.225" → "2.23", "1.90" → "1.9"). */
export function trimCents(n: number): string {
  return String(Math.round((n + Number.EPSILON) * 100) / 100);
}
