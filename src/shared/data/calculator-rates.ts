import type { Card } from "./types";
import { cardPointValue, type ValueContext } from "@/shared/lib/point-value";

/**
 * Structured earn rates for the value calculator. Card earnRates are free-text for display;
 * this file maps each card onto a fixed set of spend categories.
 */
export type SpendCategory =
  | "dining"
  | "groceries"
  | "flights"
  | "hotels"
  | "otherTravel"
  | "gas"
  | "streaming"
  | "rent"
  | "other";

export const SPEND_CATEGORIES: { id: SpendCategory; label: string; hint?: string }[] = [
  { id: "dining", label: "Dining & takeout" },
  { id: "groceries", label: "Groceries", hint: "U.S. supermarkets" },
  { id: "flights", label: "Flights" },
  { id: "hotels", label: "Hotels" },
  { id: "otherTravel", label: "Other travel", hint: "Rideshare, transit, car rental" },
  { id: "gas", label: "Gas & EV charging" },
  { id: "streaming", label: "Streaming" },
  { id: "rent", label: "Rent", hint: "Only some cards earn on rent" },
  { id: "other", label: "Everything else" },
];

interface RateSpec {
  /** Rates when booking direct / paying normally. Missing => base rate. */
  rates: Partial<Record<SpendCategory, number>>;
  /** Rates when booking through the issuer's travel portal (used if the toggle is on). */
  portal?: Partial<Record<SpendCategory, number>>;
  /** Annual spend caps per category; spend above the cap earns the base rate. */
  caps?: Partial<Record<SpendCategory, number>>;
  /**
   * When a category's rate applies only to some purchases in it: one brand ("United purchases only"), a rate that
   * depends on other spend ("up to"), or a choice the cardmember makes. Which Card? and the calculator show it with
   * the rate. Rent earns 0 unless listed (most cards can't pay rent without fees).
   */
  only?: Partial<Record<SpendCategory, string>>;
  /** Categories that share one bonus the cardmember picks each year (Obsidian's dining or groceries): the calculator
   *  counts the bonus on whichever earns more for the spending entered. */
  chooseOne?: SpendCategory[];
}

const UNITED = "United purchases only";
const HOUSING = "Up to 1.25x: 0.5x–1.25x depending on your other spend vs. the housing payment";

const SPECS: Record<string, RateSpec> = {
  // American Express
  "amex-platinum": { rates: { flights: 5 }, portal: { flights: 5, hotels: 5 }, caps: { flights: 500_000 } },
  "amex-gold": {
    rates: { dining: 4, groceries: 4, flights: 3 },
    portal: { hotels: 5 },
    caps: { dining: 50_000, groceries: 25_000 },
  },
  "amex-green": { rates: { dining: 3, flights: 3, hotels: 3, otherTravel: 3 } },
  "amex-blue-cash-preferred": { rates: { groceries: 6, streaming: 6, gas: 3, otherTravel: 3 }, caps: { groceries: 6_000 } },
  "amex-blue-cash-everyday": { rates: { groceries: 3, gas: 3 }, caps: { groceries: 6_000, gas: 6_000 } },
  "amex-delta-reserve": { rates: { flights: 3 }, only: { flights: "Delta purchases only" } },
  "amex-delta-platinum": { rates: { flights: 3, hotels: 3, dining: 2, groceries: 2 }, only: { flights: "Delta purchases only", hotels: "Booked directly with the hotel" } },
  "amex-hilton-aspire": {
    rates: { hotels: 14, flights: 7, dining: 7, otherTravel: 7 },
    only: { hotels: "Hilton hotels only", otherTravel: "Car rentals booked directly with select companies" },
  },
  "amex-marriott-brilliant": { rates: { hotels: 6, dining: 3, flights: 3 }, only: { hotels: "Marriott Bonvoy hotels only" } },
  "amex-business-platinum": { rates: {}, portal: { flights: 5, hotels: 5 } },
  "amex-business-gold": {
    rates: { dining: 4, gas: 4 },
    portal: { flights: 3, hotels: 3 },
    only: { dining: "4x only when it's one of your top 2 categories that billing cycle", gas: "4x only when it's one of your top 2 categories that billing cycle" },
  },

  // Chase
  // Reserve's other travel earns the base rate unless it's a Lyft ride (5x) or booked through Chase Travel (8x).
  "chase-sapphire-reserve": {
    rates: { dining: 3, flights: 4, hotels: 4 },
    portal: { flights: 8, hotels: 8, otherTravel: 8 },
    only: { flights: "Booked directly with the airline", hotels: "Booked directly with the hotel" },
  },
  "chase-sapphire-reserve-business": {
    rates: { flights: 4, hotels: 4 },
    portal: { flights: 8, hotels: 8, otherTravel: 8 },
    only: { flights: "Booked directly with the airline", hotels: "Booked directly with the hotel" },
  },
  // Preferred's 3x grocery is online-only, so in-store groceries earn the base rate here.
  "chase-sapphire-preferred": {
    rates: { dining: 3, streaming: 3, gas: 3, flights: 2, hotels: 2, otherTravel: 2 },
    portal: { flights: 5, hotels: 5, otherTravel: 5 },
  },
  "chase-freedom-unlimited": { rates: { dining: 3 }, portal: { flights: 5, hotels: 5, otherTravel: 5 } },
  "chase-freedom-flex": { rates: { dining: 3 }, portal: { flights: 5, hotels: 5, otherTravel: 5 } },
  "chase-ink-business-preferred": { rates: { flights: 3, hotels: 3, otherTravel: 3 }, caps: { flights: 150_000 } },
  "united-club-infinite": { rates: { flights: 5, hotels: 2, otherTravel: 2, dining: 2 }, only: { flights: UNITED } },
  "united-quest": { rates: { flights: 4, hotels: 2, otherTravel: 2, dining: 2, streaming: 2 }, only: { flights: UNITED } },
  "world-of-hyatt": {
    rates: { hotels: 4, dining: 2, flights: 2, otherTravel: 2 },
    only: { hotels: "Hyatt hotels only", flights: "Bought directly from the airline", otherTravel: "Local transit and commuting" },
  },
  // Priority's 5x is Lyft only, so other travel earns the base rate.
  "southwest-priority": { rates: { flights: 4, gas: 2, dining: 2 }, only: { flights: "Southwest purchases only" } },

  // Bilt
  "bilt-blue": { rates: { rent: 1.25 }, only: { rent: HOUSING } },
  "bilt-obsidian": {
    rates: { dining: 3, groceries: 3, flights: 2, hotels: 2, otherTravel: 2, rent: 1.25 },
    caps: { groceries: 25_000 },
    chooseOne: ["dining", "groceries"],
    only: { dining: "3x on dining or groceries: you choose one each year", groceries: "3x on dining or groceries: you choose one each year", rent: HOUSING },
  },
  "bilt-palladium": { rates: { rent: 1.25 }, only: { rent: HOUSING } },

  // Capital One
  "capital-one-venture-x": { rates: {}, portal: { flights: 5, hotels: 10, otherTravel: 10 } },
  "capital-one-venture-x-business": { rates: {}, portal: { flights: 5, hotels: 10, otherTravel: 10 } },
  "capital-one-venture": { rates: {}, portal: { hotels: 5, otherTravel: 5 } },
  "capital-one-savor": { rates: { dining: 3, groceries: 3, streaming: 3 }, portal: { hotels: 5, otherTravel: 5 } },

  // Citi
  // Strata Elite: 3x at restaurants, 6x on Citi Nights (Friday and Saturday, 6 p.m.–6 a.m. ET).
  "citi-strata-elite": { rates: { dining: 3 }, portal: { flights: 6, hotels: 12, otherTravel: 12 }, only: { dining: "6x on Citi Nights (Fri and Sat, 6 p.m.–6 a.m. ET)" } },
  "citi-strata-premier": { rates: { dining: 3, groceries: 3, gas: 3, flights: 3, hotels: 3 }, portal: { hotels: 10, otherTravel: 10 } },
  "citi-double-cash": { rates: {}, portal: { hotels: 5, otherTravel: 5 } },
  "citi-custom-cash": { rates: { dining: 5 }, caps: { dining: 6_000 } },
  "citi-aadvantage-executive": { rates: { flights: 4 }, only: { flights: "American Airlines purchases only" } },

  // Others
  "wells-fargo-autograph-journey": { rates: { hotels: 5, flights: 4, dining: 3, otherTravel: 3 } },
  "wells-fargo-active-cash": { rates: {} },
  "atmos-rewards-summit": { rates: { flights: 3, dining: 3 }, only: { flights: "Alaska and Hawaiian purchases only" } },
  "atmos-rewards-ascent": {
    rates: { flights: 3, gas: 2, streaming: 2, otherTravel: 2 },
    only: { flights: "Alaska and Hawaiian purchases only", otherTravel: "Local transit, including rideshare" },
  },
};

/** Fallback for cards without a hand-written spec: infer from earnRates text. */
function inferSpec(card: Card): RateSpec {
  const rates: Partial<Record<SpendCategory, number>> = {};
  const portal: Partial<Record<SpendCategory, number>> = {};
  const rules: [RegExp, SpendCategory[]][] = [
    [/dining|restaurant/i, ["dining"]],
    [/grocer|supermarket/i, ["groceries"]],
    [/flight|air(line|fare)|air travel/i, ["flights"]],
    [/hotel/i, ["hotels"]],
    [/rideshare|transit|car rental|rental car|lyft|uber/i, ["otherTravel"]],
    [/\btravel\b/i, ["flights", "hotels", "otherTravel"]],
    [/\bgas\b|ev charging/i, ["gas"]],
    [/streaming/i, ["streaming"]],
    [/\brent\b/i, ["rent"]],
  ];
  for (const r of card.earnRates) {
    const viaPortal = /through|via|portal|booked (on|with) .*travel/i.test(r.category);
    for (const [re, cats] of rules) {
      if (!re.test(r.category)) continue;
      for (const c of cats) {
        const target = viaPortal ? portal : rates;
        target[c] = Math.max(target[c] ?? 0, r.multiplier);
      }
    }
  }
  return { rates, portal };
}

export function rateFor(card: Card, cat: SpendCategory, usePortal: boolean): number {
  const spec = SPECS[card.id] ?? inferSpec(card);
  const direct = spec.rates[cat] ?? (cat === "rent" ? 0 : card.baseRate);
  const viaPortal = usePortal ? (spec.portal?.[cat] ?? 0) : 0;
  return Math.max(direct, viaPortal);
}

/**
 * When the rate rateFor() gives applies only to some purchases in the category ("United purchases only", "Up to
 * 1.25x …"); null when it applies to all of them, through the portal, or it's just the base rate.
 */
export function rateCondition(card: Card, cat: SpendCategory, usePortal: boolean): string | null {
  const spec = SPECS[card.id];
  if (!spec?.only?.[cat]) return null;
  const direct = spec.rates[cat];
  if (direct === undefined || direct <= card.baseRate) return null;
  if (usePortal && (spec.portal?.[cat] ?? 0) >= direct) return null;
  return spec.only[cat]!;
}

/**
 * A year's rewards for a spending pattern: points (or cash-back cents) per category, valued at the card's point value
 * (shared/lib/point-value.ts: the user's own value, else the published median; cash back at face value).
 */
export function estimateRewards(card: Card, annualSpend: Record<SpendCategory, number>, usePortal: boolean, values: ValueContext = {}) {
  const spec = SPECS[card.id] ?? inferSpec(card);
  let points = 0;
  const breakdown: { cat: SpendCategory; rate: number; points: number }[] = [];
  const earn = (id: SpendCategory, rate: number) => {
    const spend = annualSpend[id] ?? 0;
    const cap = spec.caps?.[id];
    const base = id === "rent" ? 0 : card.baseRate;
    return cap && spend > cap ? cap * rate + (spend - cap) * base : spend * rate;
  };
  // A bonus the cardmember picks among categories goes where it earns the most for this spending; the others earn the
  // card's base rate (or the portal's).
  const chosen = spec.chooseOne?.length
    ? spec.chooseOne.reduce((a, b) => (earn(b, rateFor(card, b, usePortal)) - earn(b, card.baseRate) > earn(a, rateFor(card, a, usePortal)) - earn(a, card.baseRate) ? b : a))
    : null;
  for (const { id } of SPEND_CATEGORIES) {
    const spend = annualSpend[id] ?? 0;
    if (!spend) continue;
    const unchosen = chosen && spec.chooseOne!.includes(id) && id !== chosen;
    const rate = unchosen ? Math.max(card.baseRate, usePortal ? (spec.portal?.[id] ?? 0) : 0) : rateFor(card, id, usePortal);
    const p = earn(id, rate);
    points += p;
    breakdown.push({ cat: id, rate, points: p });
  }
  // Cash-back cards express rates as percent (2 => 2%), so their "points" are cents, worth 1¢ each.
  const pointValue = cardPointValue(card, values);
  const value = (points * pointValue.cents) / 100;
  return { points: Math.round(points), value: Math.round(value), breakdown, pointValue };
}
