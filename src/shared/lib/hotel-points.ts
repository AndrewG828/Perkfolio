import type { Card } from "@/shared/data/types";
import type { HotelChain, Valuation } from "@/shared/data/travel/types";

/** Points and value for a paid hotel stay: hotel points (base rate, brand exceptions, elite bonus) plus card points. */

/** "Marriott Bonvoy" → "marriott-bonvoy": the program's id in valuations and the Points & Miles section. */
export function programId(program: string): string {
  const slug = program
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  if (/accor|^all-/.test(slug)) return "accor-live-limitless";
  return slug;
}

const PROGRAM_NAMES: Record<string, string> = {
  "marriott-bonvoy": "Marriott Bonvoy",
  "hilton-honors": "Hilton Honors",
  "world-of-hyatt": "World of Hyatt",
  "ihg-one-rewards": "IHG One Rewards",
  "choice-privileges": "Choice Privileges",
  "wyndham-rewards": "Wyndham Rewards",
  "accor-live-limitless": "Accor Live Limitless",
};

/** Display name for a program given either as a name ("World of Hyatt") or an id ("world-of-hyatt"). */
export function programName(program: string): string {
  if (/[\sA-Z]/.test(program)) return program;
  return PROGRAM_NAMES[program] ?? program.replace(/(^|-)([a-z])/g, (_, dash: string, c: string) => `${dash ? " " : ""}${c.toUpperCase()}`);
}

/** Valuation id for what a card earns, or null when it's cash back or a currency we don't value separately. */
export function currencyIdForCard(card: Pick<Card, "rewardsCurrency">): string | null {
  const c = card.rewardsCurrency;
  if (/cash/i.test(c)) return null;
  const ids: [RegExp, string][] = [
    [/membership rewards/i, "amex-mr"],
    [/ultimate rewards/i, "chase-ur"],
    [/capital one/i, "capital-one"],
    [/thankyou/i, "citi-typ"],
    [/bilt/i, "bilt"],
    [/wells fargo/i, "wells-fargo"],
    [/marriott/i, "marriott-bonvoy"],
    [/hilton/i, "hilton-honors"],
    [/hyatt/i, "world-of-hyatt"],
    [/\bihg\b/i, "ihg-one-rewards"],
  ];
  return ids.find(([re]) => re.test(c))?.[1] ?? null;
}

export const medianCents = (valuations: Valuation[], id: string | null) =>
  id ? (valuations.find((v) => v.id === id)?.median ?? null) : null;

/** Base points per dollar at a brand (a lower-earning exception, or the program's base rate; null if unconfirmed). */
export function earnRateFor(chain: HotelChain, brand: string | null | undefined): number | null {
  const b = brand?.trim().toLowerCase();
  const exception = b ? chain.brandExceptions.find((e) => e.brands.some((x) => x.toLowerCase() === b)) : undefined;
  return exception?.perDollar ?? chain.basePerDollar;
}

export function elitePercentFor(chain: HotelChain, tier: string | null | undefined): number {
  if (!tier) return 0;
  return chain.eliteBonuses.find((e) => e.tier.toLowerCase() === tier.trim().toLowerCase())?.percent ?? 0;
}

/** Whether taxes earn hotel points, from the program's eligible-spend wording (they usually don't). */
export function taxesEarnPoints(chain: HotelChain): boolean {
  const s = chain.eligibleSpend;
  return /\b(includ\w*|plus|and)\s+(room\s+)?tax/i.test(s) && !/\b(before|exclud\w*|not including|less)\s+(room\s+)?tax/i.test(s);
}

/** A way of paying for the stay. */
export interface StayCard {
  /** Stable key for the URL: the card id, or the card's name as a slug. */
  key: string;
  name: string;
  /** Card id in shared/data/cards, when we list the card. */
  cardId: string | null;
  /** Points (or cash-back percent) per dollar charged at this hotel. */
  perDollar: number;
  /** Valuation id of the points it earns; the chain's program id for co-branded cards. */
  currencyId: string | null;
  /** Used when there's no valuation for the currency (e.g. cash back = 1¢). */
  fallbackCents: number | null;
  cashBack: boolean;
  /** What the card earns, e.g. "Marriott Bonvoy points". */
  currencyLabel: string;
  group: "chain" | "wallet";
}

const slug = (s: string) => programId(s);

/** Cards listed for a chain (usually its co-branded cards, which earn the chain's own points). */
export function chainCards(chain: HotelChain, lookup: (id: string) => Card | undefined): StayCard[] {
  const pid = programId(chain.program);
  return chain.cards.map((c) => {
    const card = c.cardId ? lookup(c.cardId) : undefined;
    const currencyId = card ? (currencyIdForCard(card) ?? pid) : pid;
    return {
      key: c.cardId ?? slug(c.name),
      name: c.name,
      cardId: card ? card.id : null,
      perDollar: c.perDollar,
      currencyId,
      fallbackCents: card?.pointValueCents ?? null,
      cashBack: false,
      currencyLabel: currencyId === pid ? `${programName(chain.program)} points` : (card?.rewardsCurrency ?? "points"),
      group: "chain" as const,
    };
  });
}

/** A card from the wallet, earning its own currency at its hotel rate. */
export function walletCard(card: Card, hotelRate: number): StayCard {
  const cashBack = /cash/i.test(card.rewardsCurrency);
  return {
    key: card.id,
    name: card.name,
    cardId: card.id,
    perDollar: hotelRate,
    currencyId: currencyIdForCard(card),
    fallbackCents: card.pointValueCents,
    cashBack,
    currencyLabel: cashBack ? "cash back" : card.rewardsCurrency,
    group: "wallet",
  };
}

export interface StayInput {
  chain: HotelChain;
  brand?: string | null;
  nightlyRate: number;
  nights: number;
  /** Taxes and fees as a percent of the room rate. */
  taxPercent: number;
  tier?: string | null;
  card?: StayCard | null;
  valuations: Valuation[];
}

export interface StayResult {
  room: number;
  taxes: number;
  /** What's charged to the card. */
  total: number;
  /** What earns hotel points. */
  eligible: number;
  /** Base rate used; null when the program's rate isn't confirmed (hotel points are then unknown). */
  perDollar: number | null;
  basePoints: number | null;
  elitePercent: number;
  eliteBonus: number | null;
  hotelPoints: number | null;
  /** True when hotel points are unknown, so values cover card points only (still fine for ranking cards). */
  partial: boolean;
  cardPoints: number;
  /** True when the card earns the hotel's own points (so they add up). */
  sameCurrency: boolean;
  /** Hotel + card points when they're one currency, otherwise just the hotel points (0 if unknown). */
  totalPoints: number;
  hotelCents: number | null;
  cardCents: number | null;
  hotelValue: number | null;
  cardValue: number | null;
  totalValue: number | null;
  /** Total value as a percent of what you paid. */
  returnPercent: number | null;
}

const clean = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);

export function stayPoints(input: StayInput): StayResult {
  const { chain, card, valuations } = input;
  const nights = Math.floor(clean(input.nights));
  const room = clean(input.nightlyRate) * nights;
  const taxes = (room * clean(input.taxPercent)) / 100;
  const total = room + taxes;
  const eligible = taxesEarnPoints(chain) ? total : room;
  const perDollar = earnRateFor(chain, input.brand);
  const partial = perDollar === null;
  const basePoints = perDollar === null ? null : Math.round(eligible * perDollar);
  const elitePercent = elitePercentFor(chain, input.tier);
  const eliteBonus = basePoints === null ? null : Math.round((basePoints * elitePercent) / 100);
  const hotelPoints = basePoints === null ? null : basePoints + (eliteBonus ?? 0);

  const pid = programId(chain.program);
  const hotelCents = medianCents(valuations, pid);
  const cardPoints = card ? Math.round(total * card.perDollar) : 0;
  const sameCurrency = Boolean(card && card.currencyId === pid);
  const cardCents = card ? (card.cashBack ? 1 : (medianCents(valuations, sameCurrency ? pid : card.currencyId) ?? card.fallbackCents)) : null;

  const hotelValue = hotelPoints === null || hotelCents === null ? null : (hotelPoints * hotelCents) / 100;
  const cardValue = !card ? 0 : cardCents === null ? null : (cardPoints * cardCents) / 100;
  const totalValue = cardValue === null ? null : partial ? cardValue : hotelValue === null ? null : hotelValue + cardValue;
  return {
    room,
    taxes,
    total,
    eligible,
    perDollar,
    basePoints,
    elitePercent,
    eliteBonus,
    hotelPoints,
    partial,
    cardPoints,
    sameCurrency,
    totalPoints: (hotelPoints ?? 0) + (sameCurrency ? cardPoints : 0),
    hotelCents,
    cardCents: card ? cardCents : null,
    hotelValue,
    cardValue: card ? cardValue : null,
    totalValue,
    returnPercent: totalValue === null || total === 0 ? null : (totalValue / total) * 100,
  };
}
