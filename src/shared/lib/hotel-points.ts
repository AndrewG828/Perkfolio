import type { Card } from "@/shared/data/types";
import type { BrandException, HotelChain } from "@/shared/data/travel/types";
import { getCard } from "@/shared/data/cards";
import { PROGRAM_IDS, type ProgramId } from "@/shared/data/points/types";
import { bankCurrencies } from "@/shared/data/points/currencies";
import { programNames } from "@/shared/data/points/program-names";
import { currencyOfCard } from "./card-currency";

const getCurrency = (id: string) => bankCurrencies.find((c) => c.id === id);
const isProgramId = (id: string | null | undefined): id is ProgramId => Boolean(id && (PROGRAM_IDS as readonly string[]).includes(id));
import { cardPointValue, resolvePointValue, type CardPointValue, type PointValueResult, type ValueContext } from "./point-value";

/** Points and value for a paid hotel stay: hotel points (base rate, brand exceptions, elite bonus) plus card points. */

/** "Marriott Bonvoy" → "marriott-bonvoy": the program's id in the Points & Miles section (and its point value). */
export function programId(program: string): string {
  const slug = program
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  if (/accor|^all-/.test(slug)) return "accor-live-limitless";
  return slug;
}

/** Display name for a program given either as a name ("World of Hyatt") or an id ("world-of-hyatt"). */
export function programName(program: string): string {
  if (/[\sA-Z]/.test(program)) return program;
  if (isProgramId(program)) return programNames[program].name;
  return program.replace(/(^|-)([a-z])/g, (_, dash: string, c: string) => `${dash ? " " : ""}${c.toUpperCase()}`);
}

/**
 * What a stay earns on the card, by name: the currency without the card data's aside ("Bilt Points (plus Bilt Cash)"
 * → "Bilt Points": the calculator counts no Bilt Cash).
 */
export const currencyName = (card: Pick<Card, "rewardsCurrency">) => card.rewardsCurrency.replace(/\s*\([^)]*\)\s*$/, "").trim();

/** The currency or program a card's points are in (currencyOfCard), or null for plain cash back. */
export function pointsIdOf(card: Pick<Card, "id" | "rewardsCurrency">): string | null {
  const p = currencyOfCard(card);
  return p ? (p.kind === "currency" ? p.currency : p.program) : null;
}

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
  /** The currency or program its points are in (the chain's program for its co-branded cards); null for cash back. */
  currencyId: string | null;
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
    const currencyId = card ? (pointsIdOf(card) ?? pid) : pid;
    return {
      key: c.cardId ?? slug(c.name),
      name: c.name,
      cardId: card ? card.id : null,
      perDollar: c.perDollar,
      currencyId,
      currencyLabel: currencyId === pid ? `${programName(chain.program)} points` : card ? currencyName(card) : "points",
      group: "chain" as const,
    };
  });
}

/**
 * What a card earns per dollar at a chain, given its hotel rate (calculator-rates.ts). A co-branded card of another
 * hotel chain earns its bonus only at its own chain, so elsewhere it earns its base rate: a World of Hyatt card earns
 * 4x at Hyatt but 1x at a Marriott, and the Hilton Aspire's 14x is for Hilton stays only.
 */
export function hotelRateAt(card: Pick<Card, "id" | "rewardsCurrency" | "baseRate">, chain: HotelChain, hotelRate: number): number {
  const p = currencyOfCard(card);
  const hotel = p?.kind === "program" && programNames[p.program].kind === "hotel" ? p.program : null;
  return hotel !== null && hotel !== programId(chain.program) ? card.baseRate : hotelRate;
}

/**
 * A card from the wallet (or a shared link), earning its own currency at its hotel rate; with `chain`, at the rate it
 * earns at that chain (see hotelRateAt).
 */
export function walletCard(card: Card, hotelRate: number, chain?: HotelChain): StayCard {
  return {
    key: card.id,
    name: card.name,
    cardId: card.id,
    perDollar: chain ? hotelRateAt(card, chain, hotelRate) : hotelRate,
    currencyId: pointsIdOf(card),
    currencyLabel: currencyName(card),
    group: "wallet",
  };
}

/**
 * What a point a card earns on the stay is worth: a card we list is valued like everywhere else (cardPointValue:
 * cash back at face value, the user's own value, the published median); a chain's card we don't list, at its points'
 * value (resolvePointValue).
 */
export function stayCardValue(card: StayCard, values: ValueContext = {}): CardPointValue | PointValueResult | undefined {
  const listed = card.cardId ? getCard(card.cardId) : undefined;
  return listed ? cardPointValue(listed, values) : resolvePointValue(card.currencyId, values);
}

/** "cash back", or what the card's points are: a card whose transfers another card unlocks earns the bank's points. */
function earnsLabel(card: StayCard, v: CardPointValue | PointValueResult | undefined): string {
  if (v?.basis === "cash") return "cash back";
  if (v && "limited" in v && v.limited && v.id) {
    // "Chase Ultimate Rewards points", but "Capital One Miles" and "Citi ThankYou Points" (no unit twice).
    const name = getCurrency(v.id)?.name ?? card.currencyLabel;
    return /\b(points|miles)$/i.test(name) ? name : `${name} points`;
  }
  return card.currencyLabel;
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
  /** The user's own point values and cards (shared/lib/point-value.ts), once known. */
  values?: ValueContext;
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
  /** The card's rewards count as cash back (its "points" are cents). */
  cardCash: boolean;
  /** What the card earns, e.g. "Marriott Bonvoy points" or "cash back". */
  cardLabel: string;
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
  const { chain, card, values = {} } = input;
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
  const hotelCents = resolvePointValue(pid, values)?.cents ?? null;
  const cardPoints = card ? Math.round(total * card.perDollar) : 0;
  const cardValueOf = card ? stayCardValue(card, values) : undefined;
  const cardCash = cardValueOf?.basis === "cash";
  const sameCurrency = Boolean(card && !cardCash && (cardValueOf?.id ?? card.currencyId) === pid);
  const cardCents = card ? (sameCurrency ? hotelCents : (cardValueOf?.cents ?? null)) : null;

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
    cardCash,
    cardLabel: card ? earnsLabel(card, cardValueOf) : "",
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
