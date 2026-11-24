import type { Card } from "@/shared/data/types";
import { cards as allCards } from "@/shared/data/cards";
import type { ApplicationRule } from "@/shared/data/strategy/types";
import { evaluateCard, historyContext, type CardEligibility } from "./eligibility";
import type { WalletState } from "./wallet";

/** Which cards the next-card ranking considers. */
export type NextCardScope = "personal" | "business" | "all";

export interface FirstYearValue {
  welcome: number;
  /** Credits the user marked as ones they'd use. */
  credits: number;
  /** Every credit on the card, at face value. */
  creditsAvailable: number;
  fee: number;
  /** welcome + credits - fee */
  total: number;
}

/** Key for a credit the user would use on a card they don't have yet: `${cardId}:${creditId}`. */
export const usableKey = (cardId: string, creditId: string) => `${cardId}:${creditId}`;

/**
 * What the first year of a card is worth: welcome offer + the credits the user says they'd use - the annual fee.
 * Credits count at face value for one year. One that renews every four years, or only once, counts in full,
 * since it can be used in year one.
 */
export function firstYearValue(card: Card, usable: (creditId: string) => boolean): FirstYearValue {
  const creditsAvailable = card.credits.reduce((s, c) => s + c.annualValue, 0);
  const credits = card.credits.filter((c) => usable(c.id)).reduce((s, c) => s + c.annualValue, 0);
  const welcome = card.welcomeOfferValue;
  return { welcome, credits, creditsAvailable, fee: card.annualFee, total: welcome + credits - card.annualFee };
}

export interface Candidate {
  card: Card;
  eligibility: CardEligibility;
  value: FirstYearValue;
}

export interface NextCardRanking {
  /** Every rule passes: highest first-year value first. */
  eligible: Candidate[];
  /** Nothing blocks, but something we need is missing: highest value first. */
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

const byValue = (a: Candidate, b: Candidate) => b.value.total - a.value.total || a.card.name.localeCompare(b.card.name);
const clearRank = (c: Candidate) => (c.eligibility.until ? 0 : c.eligibility.permanent ? 2 : 1);

export function rankNextCards(opts: {
  wallet: WalletState;
  today: Date;
  /** Credits the user would use, keyed by usableKey. */
  usable?: Record<string, true>;
  scope?: NextCardScope;
  cards?: Card[];
  rules?: ApplicationRule[];
}): NextCardRanking {
  const { wallet, today, usable = {}, scope = "personal", cards = allCards, rules } = opts;
  const ctx = historyContext(wallet, today);
  const out: NextCardRanking = { eligible: [], unknown: [], blocked: [], held: [], closed: [] };
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
    const value = firstYearValue(card, (creditId) => Boolean(usable[usableKey(card.id, creditId)]));
    out[eligibility.status].push({ card, eligibility, value });
  }
  out.eligible.sort(byValue);
  out.unknown.sort(byValue);
  out.blocked.sort(
    (a, b) =>
      clearRank(a) - clearRank(b) ||
      (a.eligibility.until ?? "").localeCompare(b.eligibility.until ?? "") ||
      byValue(a, b),
  );
  return out;
}
