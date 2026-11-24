import type { LoungeNetwork } from "../types";

/**
 * Shapes of the travel-tool datasets in this folder. Each data file holds one of these objects; verified research
 * replaces the seed values without changing the shape. Where a field could reasonably arrive as a number or a phrase
 * (fees, stays, notes), both are allowed and the pages render either.
 */

/** A short note or a list of them. */
export type Notes = string | string[] | null;

/** A rule of thumb, optionally with the sources that back it. */
export type Fact = string | { fact: string; sources?: string[] };

// ---------------------------------------------------------------------------------------------------------------------
// Baggage (/tools/baggage)

export type Alliance = "oneworld" | "Star Alliance" | "SkyTeam";

export interface BaggageAirline {
  name: string;
  /** Two-character IATA code, e.g. "DL". */
  iata: string;
  country: string;
  alliance: Alliance | null;
  /** The airline's official baggage page. */
  baggageUrl: string;
}

/** A fee in USD, or a phrase when it isn't one number ("$35 online, $40 at the airport"). */
export type FeeValue = number | string | null;

export interface DomesticBagFee {
  /** Airline name or IATA code (matched against `airlines` for the official link). */
  airline: string;
  firstBag: FeeValue;
  secondBag: FeeValue;
  /** Who flies with free bags (card members, elites, military...). */
  exemptions: Notes;
  /** ISO date the fee was checked. */
  asOf: string;
  sources: string[];
}

export interface BaggageData {
  airlines: BaggageAirline[];
  usDomestic: DomesticBagFee[];
  /** Carry-on size and checked-bag weight rules of thumb. */
  standards: Fact[];
  /** How baggage works on award tickets. */
  awardRules: Fact[];
  sources: string[];
}

// ---------------------------------------------------------------------------------------------------------------------
// Entry requirements for U.S. passport holders (/tools/entry-requirements)

export const ENTRY_REQUIREMENTS = ["visa-free", "eta", "evisa", "visa-on-arrival", "visa-required"] as const;
export type EntryRequirement = (typeof ENTRY_REQUIREMENTS)[number];

export interface EntryAuthorization {
  /** e.g. "UK Electronic Travel Authorisation (ETA)" */
  name: string;
  /** USD amount, or the fee as published ("£16"). */
  fee: number | string | null;
  /** Where to apply (the official site only). */
  url: string;
}

export interface Destination {
  country: string;
  /** ISO 3166-1 alpha-2, e.g. "GB"; null for a group of countries such as "Schengen Area". */
  iso2: string | null;
  requirement: EntryRequirement;
  /** Days, or the rule in words ("90 days in any 180-day period"). */
  maxStay: number | string | null;
  authorization: EntryAuthorization | null;
  passportValidity: string | null;
  notes: Notes;
  asOf: string;
  /** The destination's travel.state.gov country page. */
  officialSource: string;
  sources: string[];
}

export interface TransitRule {
  country: string;
  rule: string;
  sources: string[];
}

export interface RecentChange {
  /** ISO date (YYYY-MM-DD, or YYYY-MM when only the month is known). */
  date: string;
  country: string;
  change: string;
  sources: string[];
}

export interface EntryRequirementsData {
  destinations: Destination[];
  transitRules: TransitRule[];
  recentChanges: RecentChange[];
}

// ---------------------------------------------------------------------------------------------------------------------
// Hotel earning (/tools/hotel-points)

export interface BrandException {
  brands: string[];
  /** Base points per dollar at these brands (instead of the program's base rate). */
  perDollar: number;
}

export interface EliteBonus {
  tier: string;
  /** Bonus on base points, in percent (Gold 25 → +25%). */
  percent: number;
}

export interface HotelCardEarn {
  /** A card id from shared/data/cards, or null for a card we don't list. */
  cardId: string | null;
  name: string;
  /** Card points per dollar charged at this chain. */
  perDollar: number;
}

export interface HotelChain {
  /** Program name ("Marriott Bonvoy") or id ("marriott-bonvoy"); its slug is the valuation id. */
  program: string;
  /** Base points per dollar at most brands; null while unconfirmed (the calculator then counts card points only). */
  basePerDollar: number | null;
  /** What earns base points, in words. Say "including taxes" if taxes earn; otherwise they don't. */
  eligibleSpend: string;
  brandExceptions: BrandException[];
  eliteBonuses: EliteBonus[];
  cards: HotelCardEarn[];
  asOf: string;
  notes: Notes;
  sources: string[];
}

export interface HotelEarningData {
  chains: HotelChain[];
}

// ---------------------------------------------------------------------------------------------------------------------
// Point valuations (cents per point), shared by the hotel calculator

export interface ValuationValue {
  /** Who published the value. */
  source: string;
  cents: number;
  asOf: string;
  url: string;
}

export interface Valuation {
  /** Program or currency id, e.g. "marriott-bonvoy", "amex-mr", "chase-ur". */
  id: string;
  values: ValuationValue[];
  low: number;
  median: number;
  high: number;
}

export interface ValuationsData {
  valuations: Valuation[];
}

// ---------------------------------------------------------------------------------------------------------------------
// Lounge guest rules (guest-cost calculator)

/**
 * What reaching a spend threshold changes. The structured form is preferred; a phrase such as "2 complimentary
 * guests" or "unlimited visits" is understood too.
 */
export type UnlockEffect =
  | string
  | {
      freeGuests?: number;
      guestFeeUsd?: number | null;
      visits?: number | "unlimited";
    };

export interface GuestUnlock {
  spendUsd: number;
  /** e.g. "calendar year", "cardmember year" */
  period: string;
  effect: UnlockEffect;
}

export interface CardLoungeAccessRule {
  network: LoungeNetwork;
  /** Visits per year, "unlimited", or the limit in words. */
  visits: number | "unlimited" | string | null;
  /** Requirements to get in, e.g. "Same-day Delta flight". */
  conditions: Notes;
  /** Guests admitted free with the cardholder, per visit. */
  freeGuests: number | null;
  /** Fee per additional adult guest, per visit. Null when guests can't be added or the fee isn't fixed. */
  guestFeeUsd: number | null;
  unlocks: GuestUnlock[];
  notes: Notes;
}

export interface CardGuestRules {
  /** A card id from shared/data/cards. */
  cardId: string;
  access: CardLoungeAccessRule[];
  sources: string[];
}

export interface NetworkGuestDefault {
  network: LoungeNetwork;
  /** The network's usual guest fee, used when a card's own rule has none. */
  guestFeeUsd: number | null;
  notes: Notes;
  sources: string[];
}

export interface LoungeGuestRulesData {
  cards: CardGuestRules[];
  networkDefaults: NetworkGuestDefault[];
}
