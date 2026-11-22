import type { Card } from "./types";

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
  /** Rent earning (default 0 — most cards can't pay rent without fees). */
}

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
  "amex-delta-reserve": { rates: { flights: 3 } },
  "amex-delta-platinum": { rates: { flights: 3, hotels: 3, dining: 2, groceries: 2 } },
  "amex-hilton-aspire": { rates: { hotels: 14, flights: 7, dining: 7, otherTravel: 7 } },
  "amex-marriott-brilliant": { rates: { hotels: 6, dining: 3, flights: 3 } },
  "amex-business-platinum": { rates: {}, portal: { flights: 5, hotels: 5 } },
  "amex-business-gold": { rates: { dining: 4, gas: 4 }, portal: { flights: 3, hotels: 3 } },

  // Chase
  "chase-sapphire-reserve": { rates: { dining: 3, flights: 4, hotels: 4, otherTravel: 3 }, portal: { flights: 8, hotels: 8, otherTravel: 8 } },
  "chase-sapphire-reserve-business": { rates: { flights: 4, hotels: 4, otherTravel: 3 }, portal: { flights: 8, hotels: 8, otherTravel: 8 } },
  // Preferred's 3x grocery is online-only, so in-store groceries earn the base rate here.
  "chase-sapphire-preferred": {
    rates: { dining: 3, streaming: 3, gas: 3, flights: 2, hotels: 2, otherTravel: 2 },
    portal: { flights: 5, hotels: 5, otherTravel: 5 },
  },
  "chase-freedom-unlimited": { rates: { dining: 3 }, portal: { flights: 5, hotels: 5, otherTravel: 5 } },
  "chase-freedom-flex": { rates: { dining: 3 }, portal: { flights: 5, hotels: 5, otherTravel: 5 } },
  "chase-ink-business-preferred": { rates: { flights: 3, hotels: 3, otherTravel: 3 }, caps: { flights: 150_000 } },
  "united-club-infinite": { rates: { flights: 5, hotels: 2, otherTravel: 2, dining: 2 } },
  "united-quest": { rates: { flights: 4, hotels: 2, otherTravel: 2, dining: 2, streaming: 2 } },
  "world-of-hyatt": { rates: { hotels: 4, dining: 2, flights: 2, otherTravel: 2 } },
  "southwest-priority": { rates: { flights: 4, gas: 2, dining: 2, otherTravel: 3 } },

  // Bilt
  "bilt-blue": { rates: { rent: 1.25 } },
  "bilt-obsidian": { rates: { dining: 3, flights: 2, hotels: 2, otherTravel: 2, rent: 1.25 } },
  "bilt-palladium": { rates: { rent: 1.25 } },

  // Capital One
  "capital-one-venture-x": { rates: {}, portal: { flights: 5, hotels: 10, otherTravel: 10 } },
  "capital-one-venture-x-business": { rates: {}, portal: { flights: 5, hotels: 10, otherTravel: 10 } },
  "capital-one-venture": { rates: {}, portal: { hotels: 5, otherTravel: 5 } },
  "capital-one-savor": { rates: { dining: 3, groceries: 3, streaming: 3 }, portal: { hotels: 5, otherTravel: 5 } },

  // Citi
  "citi-strata-elite": { rates: { dining: 4 }, portal: { flights: 6, hotels: 12, otherTravel: 12 } },
  "citi-strata-premier": { rates: { dining: 3, groceries: 3, gas: 3, flights: 3, hotels: 3 }, portal: { hotels: 10, otherTravel: 10 } },
  "citi-double-cash": { rates: {}, portal: { hotels: 5, otherTravel: 5 } },
  "citi-custom-cash": { rates: { dining: 5 }, caps: { dining: 6_000 } },
  "citi-aadvantage-executive": { rates: { flights: 4 } },

  // Others
  "wells-fargo-autograph-journey": { rates: { hotels: 5, flights: 4, dining: 3, otherTravel: 3 } },
  "wells-fargo-active-cash": { rates: {} },
  "atmos-rewards-summit": { rates: { flights: 3, dining: 3 } },
  "atmos-rewards-ascent": { rates: { flights: 3, gas: 2, streaming: 2, otherTravel: 2 } },
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

export function estimateRewards(card: Card, annualSpend: Record<SpendCategory, number>, usePortal: boolean) {
  const spec = SPECS[card.id] ?? inferSpec(card);
  let points = 0;
  const breakdown: { cat: SpendCategory; rate: number; points: number }[] = [];
  for (const { id } of SPEND_CATEGORIES) {
    const spend = annualSpend[id] ?? 0;
    if (!spend) continue;
    const rate = rateFor(card, id, usePortal);
    const cap = spec.caps?.[id];
    const base = id === "rent" ? 0 : card.baseRate;
    const p = cap && spend > cap ? cap * rate + (spend - cap) * base : spend * rate;
    points += p;
    breakdown.push({ cat: id, rate, points: p });
  }
  // Cash-back cards express rates as percent: 2 => 2% => 0.02 per dollar.
  const cashBack = /cash/i.test(card.rewardsCurrency);
  const value = cashBack ? points / 100 : (points * card.pointValueCents) / 100;
  return { points: Math.round(points), value: Math.round(value), breakdown };
}
