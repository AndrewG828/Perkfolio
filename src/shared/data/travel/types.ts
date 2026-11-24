import type { LoungeNetwork } from "../types";

/**
 * Shapes of the travel-tool datasets in this folder. Each data file holds one of these objects, filled from verified
 * research. Where a field could reasonably arrive as a number or a phrase (fees, stays, notes), both are allowed and
 * the pages render either. A null means "not confirmed": pages say so instead of guessing.
 */

/** A short note or a list of them. */
export type Notes = string | string[] | null;

/**
 * A rule of thumb, optionally with the sources that back it. `status` says how well it's backed when that differs
 * from confirmed ("widely reported": secondary sources only).
 */
export type Fact = string | { fact: string; sources?: string[]; status?: string };

// ---------------------------------------------------------------------------------------------------------------------
// Baggage (/tools/baggage)

export type Alliance = "oneworld" | "Star Alliance" | "SkyTeam";

export interface BaggageAirline {
  name: string;
  /** Two-character IATA code, e.g. "DL". */
  iata: string;
  country: string;
  alliance: Alliance | null;
  /**
   * The airline's official baggage page, confirmed: seen on the airline's own domain in search results, or linked by
   * two independent outlets.
   */
  baggageUrl: string;
  /**
   * How the link was confirmed: it's on the airline's own website (`airline-site`), or two independent outlets link it
   * (`two-outlets`). `detail` names who links it, in visitor-facing words.
   */
  verification?: { method: "airline-site" | "two-outlets"; detail?: string };
  /** The airline's loyalty program id in the Points & Miles section, where it has one. */
  programId?: string;
  note?: string;
  sources?: string[];
}

/** A page on the airline's own domain that one article links as its baggage page: a lead, not a confirmed link. */
export interface CandidateBaggageLink {
  url: string;
  /** The outlet whose article links it, e.g. "Upgraded Points". */
  citedBy: string;
  /** Month of that article (YYYY-MM). */
  month: string;
  /** The article itself. */
  article: string;
}

/** An airline whose official baggage page isn't confirmed yet. */
export interface PendingBaggageAirline {
  name: string;
  iata: string;
  country: string;
  alliance: Alliance | null;
  programId?: string;
  candidate?: CandidateBaggageLink;
  note?: string;
  sources: string[];
}

/** A fee in USD, or a phrase when it isn't one number ("$35 online, $40 at the airport"). */
export type FeeValue = number | string | null;

export interface DomesticBagFee {
  /** Airline name or IATA code (matched against `airlines` for the official link). */
  airline: string;
  iata?: string;
  firstBag: FeeValue;
  secondBag: FeeValue;
  thirdBag?: FeeValue;
  /** How Basic Economy differs, where it does. */
  basicEconomy?: Notes;
  /** Who flies with free bags (card members, elites, military...). */
  exemptions: Notes;
  notes?: Notes;
  /** ISO date the airline stopped flying: it stays out of fee comparisons. */
  ceased?: string;
  /** ISO date (or month) the fee was checked. */
  asOf: string;
  sources: string[];
}

export interface BaggageData {
  /** Month the research reflects (YYYY-MM) and the day it was verified. */
  asOf: string;
  verifiedAt: string;
  /** Caveats that apply to every fee on the page. */
  notes: string[];
  airlines: BaggageAirline[];
  /** Airlines listed without a confirmed baggage link (some with a candidate). */
  pendingAirlines: PendingBaggageAirline[];
  usDomestic: DomesticBagFee[];
  /** Carry-on size and checked-bag weight rules of thumb. */
  standards: Fact[];
  /** How baggage works on award tickets. */
  awardRules: Fact[];
  /** Every source the research read. */
  sources: string[];
}

// ---------------------------------------------------------------------------------------------------------------------
// Entry requirements for U.S. passport holders (/tools/entry-requirements)

export const ENTRY_REQUIREMENTS = ["visa-free", "eta", "evisa", "visa-on-arrival", "visa-required"] as const;
export type EntryRequirement = (typeof ENTRY_REQUIREMENTS)[number];

/**
 * How well an entry is backed. high: the destination government's own rules (only the UK); medium: two agreeing
 * dated outlets, GOV.UK for a nationality-neutral rule, GOV.UK plus one outlet, a dated dataset, or a long-standing
 * structural rule.
 */
export type Confidence = "high" | "medium" | "low";

export interface EntryAuthorization {
  /** e.g. "Electronic Travel Authorisation (ETA)" */
  name: string;
  /** The fee as published ("GBP 20"), or a USD amount; null when it isn't confirmed (check the official site). */
  fee: number | string | null;
  /** Unconfirmed or conflicting figures, attributed to the outlet that gives them. Not a fact of the entry. */
  feeNote?: string;
  /** Where to apply (the official site only); null when the official site isn't confirmed. */
  url: string | null;
  /** The application form itself, when it's not `url`. */
  applyUrl?: string;
  validity?: string | null;
  processing?: string;
  howToApply?: string;
}

/** A form to fill in before or on arrival (not a visa). */
export interface ArrivalForm {
  name: string;
  /** "Free", or null when the fee isn't confirmed. */
  fee: string | null;
  required: boolean;
  /** The official site; null when it isn't confirmed. */
  url: string | null;
  /** When it has to be submitted. */
  window?: string;
}

/** Government travel insurance that must be bought to enter. */
export interface RequiredInsurance {
  name: string;
  /** ISO date it became mandatory. */
  from: string;
  fee: string | null;
  url: string;
  /** Zanzibar's own insurer, where it has one. */
  zanzibarUrl?: string;
  note: string;
}

/** A requirement that's announced but not in force yet (ETIAS, K-ETA). */
export interface UpcomingRequirement {
  name: string;
  fee: string | null;
  url: string | null;
  validity?: string;
  status: string;
}

export interface Destination {
  country: string;
  /** ISO 3166-1 alpha-2, e.g. "GB"; null for a group of countries such as "Schengen Area". */
  iso2: string | null;
  region?: string;
  /** A group's member countries (ISO codes). */
  members?: string[];
  /** Part of the Schengen Area, whose shared rules apply. */
  schengen?: boolean;
  requirement: EntryRequirement;
  /** Days, or the rule in words ("90 days in any 180-day period"); null when it isn't confirmed. */
  maxStay: number | string | null;
  authorization: EntryAuthorization | null;
  arrivalForm?: ArrivalForm;
  requiredInsurance?: RequiredInsurance;
  upcoming?: UpcomingRequirement;
  /** Null when it isn't confirmed. */
  passportValidity: string | null;
  /**
   * A restriction that outweighs the entry rule itself, shown on the row even when it's collapsed (Cuba: U.S. law
   * bars tourist travel). Keep it short; the details go in `notes`.
   */
  caution?: string;
  /** Single-outlet details appear here attributed to their outlet; they aren't facts of the entry. */
  notes: Notes;
  /** Month (or day) of the newest source behind the entry. */
  asOf: string;
  confidence?: Confidence;
  /** Which sources back which facts, with their dates. */
  evidence?: string;
  /**
   * Where to confirm: the destination's official page where one is confirmed (GOV.UK for the UK, Canada.ca),
   * otherwise the State Department's travel advisories index.
   */
  officialSource: string;
  sources: string[];
}

export interface TransitRule {
  country: string;
  rule: string;
  confidence?: Confidence;
  evidence?: string;
  sources: string[];
}

export interface RecentChange {
  /** ISO date (YYYY-MM-DD, or YYYY-MM when only the month is known). */
  date: string;
  country: string;
  change: string;
  confidence?: Confidence;
  sources: string[];
}

/** An announced change that hasn't happened yet. */
export interface PlannedChange {
  country: string;
  change: string;
  /** Where it stands, in words. */
  status: string;
  asOf: string;
  sources: string[];
}

export interface EntryRequirementsData {
  /** Day the research was verified. */
  verifiedAt: string;
  destinations: Destination[];
  transitRules: TransitRule[];
  recentChanges: RecentChange[];
  plannedChanges: PlannedChange[];
}

// ---------------------------------------------------------------------------------------------------------------------
// Hotel earning (/tools/hotel-points)

export interface BrandException {
  /** Brand names, some with a qualifier ("Marriott Executive Apartments (qualifying room rates only)"). */
  brands: string[];
  /** Base points per dollar at these brands (instead of the program's base rate). */
  perDollar: number;
  /** False where elite members earn no bonus points at these brands. */
  eliteBonus?: boolean;
}

export interface EliteBonus {
  tier: string;
  /** Bonus on base points, in percent (Gold 25 → +25%); null when the tier's bonus isn't confirmed. */
  percent: number | null;
}

export interface HotelCardEarn {
  /** A card id from shared/data/cards, or null for a card we don't list. */
  cardId: string | null;
  name: string;
  /** Card points per dollar charged at this chain. */
  perDollar: number;
}

export interface HotelChain {
  /** Program name ("Marriott Bonvoy") or id ("marriott-bonvoy"); its slug is the Points & Miles program id. */
  program: string;
  /** Base points per dollar at most brands; null while unconfirmed (the calculator then counts card points only). */
  basePerDollar: number | null;
  /** What earns base points, in words. */
  eligibleSpend: string;
  /**
   * Whether taxes earn base points: false when the program excludes them, null when that isn't confirmed (the
   * calculator then counts the room rate only and says so). Left out, it's read from `eligibleSpend` ("including
   * taxes" means they earn).
   */
  taxesEarn?: boolean | null;
  brandExceptions: BrandException[];
  eliteBonuses: EliteBonus[];
  cards: HotelCardEarn[];
  asOf: string;
  notes: Notes;
  sources: string[];
}

export interface HotelEarningData {
  verifiedAt: string;
  chains: HotelChain[];
}

// ---------------------------------------------------------------------------------------------------------------------
// Lounge guest rules (guest-cost calculator)

/**
 * What reaching a spend threshold changes. The structured form is preferred; a phrase such as "2 complimentary
 * guests", "free guests: 2 per visit ..." or "unlimited visits" is understood too.
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

/** Most guests per visit, where the terms cap it ("up to 2 guests, or their immediate family"). */
export interface GuestLimit {
  max: number;
  /** Who may still come beyond `max`, in words ("your immediate family"); left out, `max` is a hard cap. */
  beyond?: string;
  /** Those beyond `max` enter free (Admirals Club family), rather than at the guest fee (Sky Club family). */
  beyondFree?: boolean;
}

/** Currencies that lounges abroad charge guests in. */
export type GuestCurrency = "USD" | "GBP" | "EUR" | "HKD" | "JPY" | "AUD";

export interface CardLoungeAccessRule {
  network: LoungeNetwork;
  /**
   * Visits per year: "unlimited", a number, the limit in words ("10 per year"), or null when it isn't confirmed.
   * "0 per year" (or 0) means the network opens only after an unlock.
   */
  visits: number | "unlimited" | string | null;
  /** Requirements to get in, e.g. "Same-day Delta flight". */
  conditions: Notes;
  /** Adult guests admitted free with the cardholder, per visit; null when it isn't confirmed. */
  freeGuests: number | null;
  /** Fee per additional adult guest, per visit. Null when guests can't be added or the fee isn't published. */
  guestFeeUsd: number | null;
  /** The child guest rate, where the issuer publishes one (the age band is in `notes`). */
  childGuestFeeUsd?: number | null;
  unlocks: GuestUnlock[];
  /** A cap on guests per visit, from the terms. */
  guestLimit?: GuestLimit;
  /** Guest passes that come with the card, in words ("4 One-Time Guest Passes each Medallion Year"). */
  guestPasses?: string;
  /**
   * Everyone gets in by using one of the card's passes, the cardmember included (no guest fee is sold), e.g. Citi
   * Strata Elite's Admirals Club passes: `visits` then counts passes.
   */
  passesOnly?: boolean;
  /**
   * Where `guestFeeUsd` is the U.S. price and lounges abroad charge the same amount in their own currency, those prices
   * in words ("CA$59 in Canada, £59 in the UK and €59 elsewhere in Europe"), shown with the fee.
   */
  localFees?: string;
  /** Local-currency prices, age bands and exceptions. */
  notes: Notes;
}

/**
 * Guest rules that differ at particular lounges of a network: Centurion Lounges abroad (local prices, their own
 * allowances) and Capital One Landings (1 free guest after the spend unlock, not 2).
 */
export interface LocationGuestRule {
  network: LoungeNetwork;
  /** Lounges at these airports (IATA codes)... */
  airports?: string[];
  /** ...or lounges whose name contains this, e.g. "Landing". */
  loungeName?: string;
  /** Cards the rule is stated for. Other cards' guests aren't priced at these lounges: their rules there aren't stated. */
  cards: string[];
  /** Cards these lounges don't admit at all, though the network's terms cover them (Business Platinum at Arlanda). */
  notAdmitted?: string[];
  /** Adult guests admitted free, instead of the card's usual number. */
  freeGuests?: number;
  /** Fee per extra adult guest in USD, instead of the card's; null when it's charged in another currency (`fee`). */
  guestFeeUsd?: number | null;
  /** The fee in the lounge's own currency, with the child rate where there is one. */
  fee?: { currency: GuestCurrency; adult: number; child?: number };
  /** Most paid guests per visit. */
  maxPaidGuests?: number;
  /** Free guests once a spend unlock is reached; null when the unlock isn't stated to apply here (it's ignored). */
  unlockFreeGuests?: number | null;
  notes: string;
  sources: string[];
}

export interface CardGuestRules {
  /** A card id from shared/data/cards. */
  cardId: string;
  /** Month the issuer's terms were read (YYYY-MM). */
  asOf?: string;
  access: CardLoungeAccessRule[];
  notes?: Notes;
  sources: string[];
}

export interface NetworkGuestDefault {
  network: LoungeNetwork;
  /**
   * The network's usual guest fee, for reference only: a card whose own rule has no fee (null: the issuer doesn't
   * publish one) isn't priced at this fee.
   */
  guestFeeUsd: number | null;
  childGuestFeeUsd?: number | null;
  notes: Notes;
  sources: string[];
}

export interface LoungeGuestRulesData {
  /** Month the rules reflect (YYYY-MM) and the day they were verified. */
  asOf?: string;
  verifiedAt?: string;
  cards: CardGuestRules[];
  networkDefaults: NetworkGuestDefault[];
  /** Lounges whose guest rules differ from the card's usual ones. */
  locationRules?: LocationGuestRule[];
}
