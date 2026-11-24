import type { Card } from "@/shared/data/types";
import { cards as allCards } from "@/shared/data/cards";
import type { ApplicationRule } from "@/shared/data/strategy/types";
import { NEEDS_HISTORY, evaluateCard, historyContext, type CardEligibility, type RuleResult, type UserFacts } from "./eligibility";
import { centsFor } from "./trackers";
import { welcomeValue, type WelcomeOffer } from "./welcome-offer";
import type { WalletState } from "./wallet";

/** Which cards the next-card ranking considers. */
export type NextCardScope = "personal" | "business" | "all";
export const NEXT_CARD_SCOPES: NextCardScope[] = ["personal", "business", "all"];

export interface FirstYearValue {
  /** The welcome offer's first tier in USD (an "as high as" offer at its advertised top). */
  welcome: number;
  /** The welcome offer with every tier and add-on (a second spend tier, adding an authorized user). */
  welcomeAll: number;
  /** Credits the user marked as ones they'd use. */
  credits: number;
  /** Every credit on the card, at face value. */
  creditsAvailable: number;
  fee: number;
  /** welcome + credits - fee */
  total: number;
  /** welcomeAll + credits - fee */
  totalAll: number;
  offer: WelcomeOffer;
  /** The program the welcome points are in, and the cents per point they're valued at. */
  program?: string;
  cents?: number;
}

/** Key for a credit the user would use on a card they don't have yet: `${cardId}:${creditId}`. */
export const usableKey = (cardId: string, creditId: string) => `${cardId}:${creditId}`;

/** Cents per point for a program: the outlets' median (shared/data/strategy/valuations) unless the caller passes the user's own. */
export type CentsFor = (program: string) => number | undefined;
const medianCents: CentsFor = (program) => centsFor(program);

/**
 * What the first year of a card is worth: welcome offer + the credits the user says they'd use - the annual fee.
 * Welcome points are valued like the points tracker values balances (`cents`: the user's own figure or the
 * outlets' November 2026 median). Credits count at face value for one year. One that renews every four years,
 * or only once, counts in full, since it can be used in year one.
 */
export function firstYearValue(card: Card, usable: (creditId: string) => boolean, cents: CentsFor = medianCents): FirstYearValue {
  const creditsAvailable = card.credits.reduce((s, c) => s + c.annualValue, 0);
  const credits = card.credits.filter((c) => usable(c.id)).reduce((s, c) => s + c.annualValue, 0);
  const w = welcomeValue(card, cents);
  const fee = card.annualFee;
  return {
    welcome: w.usd,
    welcomeAll: w.usdAll,
    credits,
    creditsAvailable,
    fee,
    total: w.usd + credits - fee,
    totalAll: w.usdAll + credits - fee,
    offer: w.offer,
    ...(w.program ? { program: w.program } : {}),
    ...(w.cents !== undefined ? { cents: w.cents } : {}),
  };
}

/**
 * Whether the ranking counts the welcome offer:
 * - counted: a fixed offer, and nothing in the rules says you'd miss it;
 * - at-risk: the issuer may withhold it (Amex's "may not be eligible", say): a warning;
 * - unconfirmed: a bonus rule needs something we don't know about your history (whether you earned a past bonus,
 *   the day you opened a card), and the answer could cost you the bonus;
 * - varies: an "as high as" offer. It's the most anyone gets, and no outlet gives a typical amount.
 * Only "counted" offers count toward `rankValue`; the others rank on the first year without the bonus, and the page
 * shows what the bonus would add. A missing card history alone doesn't make a bonus unconfirmed (every card would
 * be): the page asks for the history instead.
 */
export type BonusBasis = "counted" | "at-risk" | "unconfirmed" | "varies";

export interface Candidate {
  card: Card;
  eligibility: CardEligibility;
  value: FirstYearValue;
  bonus: BonusBasis;
  /** The bonus rule behind "at-risk" or "unconfirmed". */
  bonusRule?: RuleResult;
  /** Same as `bonus === "at-risk"`. */
  bonusAtRisk: boolean;
  /** What the ranking sorts on: the first-year value, without the welcome offer unless it's "counted". */
  rankValue: number;
}

/** Why the ranking would leave a card's welcome offer out (see BonusBasis), and the rule behind it. */
export function bonusBasis(eligibility: CardEligibility, value: Pick<FirstYearValue, "welcome" | "offer">): { bonus: BonusBasis; rule?: RuleResult } {
  const bonusRules = eligibility.results.filter((r) => r.rule.kind === "bonus");
  const atRisk = bonusRules.find((r) => r.status === "warning");
  if (atRisk) return { bonus: "at-risk", rule: atRisk };
  const unknown = bonusRules.find((r) => r.status === "unknown" && (r.question || (r.missing ?? []).some((m) => m !== NEEDS_HISTORY)));
  if (unknown && value.welcome > 0) return { bonus: "unconfirmed", rule: unknown };
  if (value.offer.upTo) return { bonus: "varies" };
  return { bonus: "counted" };
}

export interface NextCardRanking {
  /** Every rule passes: highest first-year value first. */
  eligible: Candidate[];
  /** Nothing blocks, but a soft limit or the issuer's discretion puts approval or the bonus at risk: by value. */
  warning: Candidate[];
  /** Nothing blocks that we know of, but something we need is missing: highest value first. */
  unknown: Candidate[];
  /** A rule blocks approval or the bonus: soonest to clear first, then ones that wait on an action, then permanent. */
  blocked: Candidate[];
  /** Left out because the user has them. */
  held: Card[];
  /** Left out because they're closed to new applicants. */
  closed: Card[];
}

const inScope = (card: Card, scope: NextCardScope) =>
  scope === "all" || (scope === "business" ? card.category === "business" : card.category !== "business");

/** Highest ranking value first; a bonus that isn't "counted" counts as no bonus, so those fall below clean results. */
export const byRankValue = (a: Candidate, b: Candidate) =>
  b.rankValue - a.rankValue || b.value.total - a.value.total || a.card.name.localeCompare(b.card.name);
const clearRank = (c: Candidate) => (c.eligibility.until ? 0 : c.eligibility.permanent ? 2 : 1);

export function rankNextCards(opts: {
  wallet: WalletState;
  today: Date;
  /** Credits the user would use, keyed by usableKey. */
  usable?: Record<string, true>;
  scope?: NextCardScope;
  cards?: Card[];
  rules?: ApplicationRule[];
  /** The user's answers to rule questions (e.g. a Bank of America deposit account). */
  facts?: UserFacts;
  /** Cents per point for welcome offers (pass the user's own values); defaults to the outlets' median. */
  cents?: CentsFor;
}): NextCardRanking {
  const { wallet, today, usable = {}, scope = "personal", cards = allCards, rules, facts, cents } = opts;
  const ctx = historyContext(wallet, today, facts);
  const out: NextCardRanking = { eligible: [], warning: [], unknown: [], blocked: [], held: [], closed: [] };
  for (const card of cards) {
    if (!inScope(card, scope)) continue;
    const eligibility = evaluateCard(card, ctx, rules);
    if (eligibility.held) {
      out.held.push(card);
      continue;
    }
    if (eligibility.closedToApplicants) {
      out.closed.push(card);
      continue;
    }
    const value = firstYearValue(card, (creditId) => Boolean(usable[usableKey(card.id, creditId)]), cents);
    const { bonus, rule } = bonusBasis(eligibility, value);
    out[eligibility.status].push({
      card,
      eligibility,
      value,
      bonus,
      ...(rule ? { bonusRule: rule } : {}),
      bonusAtRisk: bonus === "at-risk",
      rankValue: bonus === "counted" ? value.total : value.credits - value.fee,
    });
  }
  out.eligible.sort(byRankValue);
  out.warning.sort(byRankValue);
  out.unknown.sort(byRankValue);
  out.blocked.sort(
    (a, b) =>
      clearRank(a) - clearRank(b) ||
      (a.eligibility.until ?? "").localeCompare(b.eligibility.until ?? "") ||
      byRankValue(a, b),
  );
  return out;
}
