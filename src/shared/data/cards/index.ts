import type { Card, CardCategory, Issuer } from "../types";
import { amexCards } from "./amex";
import { chaseBiltCards } from "./chase-bilt";
import { otherCards } from "./other";
import { cardImages } from "../card-images";

export const cards: Card[] = [...amexCards, ...chaseBiltCards, ...otherCards].map((c) => ({
  ...c,
  image: c.image ?? cardImages[c.id],
}));

const byId = new Map(cards.map((c) => [c.id, c]));

export function getCard(id: string): Card | undefined {
  return byId.get(id);
}

/** Cards highlighted on the home page and as compare defaults. */
export const featuredIds = [
  "amex-platinum",
  "amex-gold",
  "capital-one-venture-x",
  "chase-sapphire-reserve",
  "chase-sapphire-preferred",
  "citi-strata-elite",
];

export const featuredCards = featuredIds.map(getCard).filter((c): c is Card => Boolean(c));

export const issuers: Issuer[] = Array.from(new Set(cards.map((c) => c.issuer)));

export const categoryLabels: Record<CardCategory, string> = {
  "premium-travel": "Premium travel",
  travel: "Travel rewards",
  airline: "Airline",
  hotel: "Hotel",
  "cash-back": "Cash back",
  business: "Business",
};

/** Face value of all recurring credits per year (excludes every-4-years and one-time). */
export function totalCreditValue(card: Card): number {
  return card.credits
    .filter((c) => c.frequency !== "every-4-years" && c.frequency !== "one-time")
    .reduce((sum, c) => sum + c.annualValue, 0);
}

/** Annualized value incl. every-4-years credits spread over 4 years. */
export function annualizedCreditValue(card: Card): number {
  return card.credits.reduce((sum, c) => {
    if (c.frequency === "every-4-years") return sum + c.annualValue / 4;
    if (c.frequency === "one-time") return sum;
    return sum + c.annualValue;
  }, 0);
}

export function topEarnRate(card: Card): number {
  return Math.max(card.baseRate, ...card.earnRates.map((r) => r.multiplier));
}

/** True for cards that earn cash back (rates shown as %). "Bilt Points (plus Bilt Cash)" earns points, so only a
 *  rewards currency that starts with "Cash" counts. */
export function isCashBack(card: Pick<Card, "rewardsCurrency">): boolean {
  return /^cash\b/i.test(card.rewardsCurrency.trim());
}

export function rateLabel(card: Pick<Card, "rewardsCurrency">, multiplier: number): string {
  return isCashBack(card) ? `${multiplier}%` : `${multiplier}x`;
}
