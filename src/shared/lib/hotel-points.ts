import type { Card } from "@/shared/data/types";
import type { BrandException, HotelChain, Valuation } from "@/shared/data/travel/types";

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

/**
 * Whether a card earns cash back: its currency starts with "Cash" ("Cash back (Reward Dollars)", "Cash rewards").
 * Bilt Points "(plus Bilt Cash)" are points, valued as Bilt Points.
 */
export const earnsCashBack = (card: Pick<Card, "rewardsCurrency">) => /^\s*cash\b/i.test(card.rewardsCurrency);

/**
 * What a stay earns on the card, by name: the currency without the card data's aside ("Bilt Points (plus Bilt Cash)"
 * → "Bilt Points": the calculator counts no Bilt Cash).
 */
export const currencyName = (card: Pick<Card, "rewardsCurrency">) => card.rewardsCurrency.replace(/\s*\([^)]*\)\s*$/, "").trim();

/** Valuation id for what a card earns, or null when it's cash back or a currency we don't value separately. */
export function currencyIdForCard(card: Pick<Card, "rewardsCurrency">): string | null {
  const c = card.rewardsCurrency;
  if (earnsCashBack(card)) return null;
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
    [/skymiles/i, "delta-skymiles"],
    [/aadvantage/i, "american-aadvantage"],
    [/mileageplus/i, "united-mileageplus"],
    [/rapid rewards/i, "southwest-rapid-rewards"],
    [/atmos/i, "atmos-rewards"],
    [/trueblue/i, "jetblue-trueblue"],
    [/aeroplan/i, "air-canada-aeroplan"],
  ];
  return ids.find(([re]) => re.test(c))?.[1] ?? null;
}

export const medianCents = (valuations: Valuation[], id: string | null) =>
  id ? (valuations.find((v) => v.id === id)?.median ?? null) : null;

/** The lower-earning brand group a brand belongs to, if any. */
export function brandExceptionFor(chain: HotelChain, brand: string | null | undefined): BrandException | undefined {
  const b = brand?.trim().toLowerCase();
  return b ? chain.brandExceptions.find((e) => e.brands.some((x) => x.toLowerCase() === b)) : undefined;
}

/** Base points per dollar at a brand (a lower-earning exception, or the program's base rate; null if unconfirmed). */
export function earnRateFor(chain: HotelChain, brand: string | null | undefined): number | null {
  return brandExceptionFor(chain, brand)?.perDollar ?? chain.basePerDollar;
}

/** A tier's bonus in percent: 0 without a tier (or for a tier we don't have), null when its bonus isn't confirmed. */
export function elitePercentFor(chain: HotelChain, tier: string | null | undefined): number | null {
  if (!tier) return 0;
  const found = chain.eliteBonuses.find((e) => e.tier.toLowerCase() === tier.trim().toLowerCase());
  return found ? found.percent : 0;
}

/**
 * Whether taxes earn hotel points: the chain's `taxesEarn` when set (false, or null when it isn't confirmed),
 * otherwise read from its eligible-spend wording (they usually don't).
 */
export function taxesEarnPoints(chain: HotelChain): boolean | null {
  if (chain.taxesEarn !== undefined) return chain.taxesEarn;
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
      currencyLabel: currencyId === pid ? `${programName(chain.program)} points` : card ? currencyName(card) : "points",
      group: "chain" as const,
    };
  });
}

/** Hotel programs' ids ("marriott-bonvoy"), to tell a hotel chain's co-branded card from a general card. */
const HOTEL_PROGRAMS = new Set(Object.keys(PROGRAM_NAMES));

/**
 * What a card earns per dollar at a chain, given its hotel rate (calculator-rates.ts). A co-branded card of another
 * hotel chain earns its bonus only at its own chain, so elsewhere it earns its base rate: a World of Hyatt card earns
 * 4x at Hyatt but 1x at a Marriott, and the Hilton Aspire's 14x is for Hilton stays only.
 */
export function hotelRateAt(card: Pick<Card, "rewardsCurrency" | "baseRate">, chain: HotelChain, hotelRate: number): number {
  const own = currencyIdForCard(card);
  return own !== null && HOTEL_PROGRAMS.has(own) && own !== programId(chain.program) ? card.baseRate : hotelRate;
}

/**
 * A card from the wallet (or a shared link), earning its own currency at its hotel rate; with `chain`, at the rate it
 * earns at that chain (see hotelRateAt).
 */
export function walletCard(card: Card, hotelRate: number, chain?: HotelChain): StayCard {
  const cashBack = earnsCashBack(card);
  return {
    key: card.id,
    name: card.name,
    cardId: card.id,
    perDollar: chain ? hotelRateAt(card, chain, hotelRate) : hotelRate,
    currencyId: currencyIdForCard(card),
    fallbackCents: card.pointValueCents,
    cashBack,
    currencyLabel: cashBack ? "cash back" : currencyName(card),
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
  /** Whether taxes earned: false, or null when that isn't confirmed (then only the room rate counts). */
  taxesEarn: boolean | null;
  /** Base rate used; null when the program's rate isn't confirmed (hotel points are then unknown). */
  perDollar: number | null;
  basePoints: number | null;
  /** The tier's bonus; null when it isn't confirmed (no bonus is counted, and `eliteUnknown` says so). */
  elitePercent: number | null;
  eliteBonus: number | null;
  /** A tier was picked whose bonus isn't confirmed. */
  eliteUnknown: boolean;
  /** The brand pays elite members no bonus points (e.g. StudioRes). */
  noEliteAtBrand: boolean;
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
  const taxesEarn = taxesEarnPoints(chain);
  const eligible = taxesEarn === true ? total : room;
  const exception = brandExceptionFor(chain, input.brand);
  const perDollar = earnRateFor(chain, input.brand);
  const partial = perDollar === null;
  const basePoints = perDollar === null ? null : Math.round(eligible * perDollar);
  const noEliteAtBrand = exception?.eliteBonus === false;
  const tierPercent = elitePercentFor(chain, input.tier);
  const elitePercent = noEliteAtBrand ? 0 : tierPercent;
  const eliteUnknown = elitePercent === null;
  const eliteBonus = basePoints === null || elitePercent === null ? null : Math.round((basePoints * elitePercent) / 100);
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
    taxesEarn,
    perDollar,
    basePoints,
    elitePercent,
    eliteBonus,
    eliteUnknown,
    noEliteAtBrand,
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
