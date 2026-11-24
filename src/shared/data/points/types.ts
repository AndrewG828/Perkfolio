// Data model for the Points & Miles section. The data modules next to this one are generated from verified research
// by scripts/import-points-research.ts (see CLAUDE.md); the lists below are fixed, so ids stay stable across refreshes.

/** Bank (flexible) points currencies, in the order they're shown everywhere. */
export const BANK_CURRENCY_IDS = ["amex-mr", "chase-ur", "capital-one", "citi-typ", "bilt", "wells-fargo"] as const;
export type BankCurrencyId = (typeof BANK_CURRENCY_IDS)[number];

export const ALLIANCES = ["Star Alliance", "oneworld", "SkyTeam"] as const;
export type Alliance = (typeof ALLIANCES)[number];

/** Where a sweet spot flies from/to (or, for hotels, where the hotel is). */
export const REGIONS = [
  "United States",
  "Canada",
  "Mexico & Central America",
  "Caribbean",
  "South America",
  "Hawaii",
  "Europe",
  "Middle East",
  "Africa",
  "South Asia",
  "Indian Ocean",
  "Southeast Asia",
  "East Asia",
  "Japan",
  "Australia & New Zealand",
  "South Pacific",
] as const;
export type Region = (typeof REGIONS)[number];

/**
 * Every airline and hotel program we cover. These ids are URL slugs (/points/programs/<id>) and keys in research
 * files: never rename one. A program can be listed here before it has a researched guide in programs.ts (its page
 * then shows what we do know: transfers, airlines it books, values).
 */
export const PROGRAM_IDS = [
  "aer-lingus-aerclub",
  "aeromexico-rewards",
  "air-canada-aeroplan",
  "air-france-klm-flying-blue",
  "ana-mileage-club",
  "american-aadvantage",
  "atmos-rewards",
  "avianca-lifemiles",
  "british-airways-club",
  "cathay-pacific-asia-miles",
  "copa-connectmiles",
  "delta-skymiles",
  "emirates-skywards",
  "etihad-guest",
  "eva-air-infinity-mileagelands",
  "finnair-plus",
  "iberia-club",
  "japan-airlines-mileage-bank",
  "jetblue-trueblue",
  "qantas-frequent-flyer",
  "qatar-privilege-club",
  "singapore-krisflyer",
  "southwest-rapid-rewards",
  "tap-miles-and-go",
  "thai-royal-orchid-plus",
  "turkish-miles-and-smiles",
  "united-mileageplus",
  "virgin-atlantic-flying-club",
  "virgin-red",
  "world-of-hyatt",
  "marriott-bonvoy",
  "hilton-honors",
  "ihg-one-rewards",
  "choice-privileges",
  "wyndham-rewards",
  "accor-live-limitless",
  "i-prefer",
] as const;
export type ProgramId = (typeof PROGRAM_IDS)[number];

export type Cabin = "economy" | "premium economy" | "business" | "first";
export type ProgramKind = "airline" | "hotel";
export type Pricing = "award chart" | "distance-based" | "dynamic" | "hybrid";
export type SurchargeLevel = "none" | "low" | "mixed" | "high";
export type FeeLevel = "low" | "moderate" | "high";

/** A bank's transferable points currency. */
export interface BankCurrency {
  id: BankCurrencyId;
  /** Full name, e.g. "American Express Membership Rewards". */
  name: string;
  /** Short name for chips and table headers, e.g. "Membership Rewards". */
  shortName: string;
  /** e.g. "American Express" */
  issuer: string;
  /** Which cards earn it, in words. */
  earnedWith: string;
  /** Rules that limit transfers, e.g. which cards can transfer at all. */
  restrictions?: string;
  /** https pages backing the partner list and rules (the issuer's own pages first). */
  sources: string[];
  /** ISO date (YYYY-MM-DD) the partner list was last checked. */
  lastVerified: string;
}

/** One bank currency → program transfer. `from` bank points become `to` program points (1000 → 1000 × to / from). */
export interface TransferPartner {
  currency: BankCurrencyId;
  program: ProgramId;
  from: number;
  to: number;
  /** How long a transfer takes, as the source puts it ("Typically 48 hours"). Absent when no source confirms it. */
  time?: string;
  /** Smallest transfer, in bank points. */
  minimum?: number;
  /** Transfers must be a multiple of this, in bank points. */
  increment?: number;
  note?: string;
  /**
   * Only these card ids (from shared/data/cards) get this ratio. Leave it out when every card that fully earns the
   * currency transfers at this ratio. Use it for card-specific ratios (two entries for one pair, e.g. 1:1 with one
   * card and 4:3 with another) and for reduced-ratio transfers a no-fee card can make on its own.
   */
  cards?: string[];
  /** https links backing the ratio. */
  sources: string[];
  /** Set when the entry comes from the dated partner-change log rather than the partner list (ISO date of the change). */
  changedOn?: string;
  /** A ratio change the partner-change log lists as scheduled: `from` bank points become `to` from `date` (ISO) on. */
  scheduled?: { date: string; from: number; to: number; detail: string; sources: string[] };
}

/** Which program a currency reaches, and with which cards (transfer-routes.ts: TransferPartner without the ratio). */
export type TransferRoute = Pick<TransferPartner, "currency" | "program" | "cards">;

/**
 * A program whose points are spent through another one with no transfer in between: once the accounts are linked
 * they share one balance (Virgin Red and Virgin Atlantic Flying Club share Virgin Points). Banks that transfer to
 * `from` reach `to` at the same ratio, shown as "via <from>". Hand-written; `note` repeats what the research says.
 */
export interface ProgramBridge {
  from: ProgramId;
  to: ProgramId;
  note: string;
}

export const PROGRAM_BRIDGES: readonly ProgramBridge[] = [
  // programs-air-b: Flying Club perks "Once linked, Flying Club and Virgin Red share one Virgin Points balance";
  // Virgin Red strengths "Once linked to Flying Club, the two programs share one Virgin Points balance for flights".
  {
    from: "virgin-red",
    to: "virgin-atlantic-flying-club",
    note: "Virgin Red and Flying Club share one Virgin Points balance once the accounts are linked, so points sent to Virgin Red book Flying Club awards.",
  },
];

/** An airline or hotel loyalty program with a researched guide. */
export interface AwardProgram {
  id: ProgramId;
  /** e.g. "Air Canada Aeroplan" */
  name: string;
  /** The company behind it, e.g. "Air Canada" */
  owner: string;
  kind: ProgramKind;
  alliance?: Alliance;
  /** What its points are called, e.g. "Aeroplan points" */
  currency: string;
  pricing: Pricing;
  /** Two or three sentences: what the program is good for. */
  summary: string;
  strengths: string[];
  watchOuts: string[];
  /** Carrier-imposed surcharges on partner awards (airlines). */
  partnerSurcharges?: SurchargeLevel;
  perks?: string[];
  officialUrl: string;
  chartUrl?: string;
  sources: string[];
  /** ISO date (YYYY-MM-DD). */
  lastVerified: string;
}

/** A redemption where points go unusually far. */
export interface SweetSpot {
  /** kebab-case, unique */
  id: string;
  kind: "flight" | "hotel";
  program: ProgramId;
  title: string;
  /** Airlines that fly it, or hotel brands. */
  operatedBy: string[];
  from: Region;
  /** Destination region; for hotels, where the hotel is (same as `from`). */
  to: Region;
  /** e.g. ["Tokyo", "Osaka"] */
  destinations: string[];
  /** Flights only. */
  cabin?: Cabin;
  /** Price in program points (the low end when there's a range). */
  points: number;
  /** Top of the range, if prices vary (by season, distance or category). */
  pointsMax?: number;
  per: "one-way" | "round-trip" | "night";
  /** Cash you pay on top of the points (taxes, carrier surcharges, resort fees). */
  fees: FeeLevel;
  feesNote?: string;
  howToBook: string;
  caveats?: string;
  /** https links backing the price and rules. */
  sources: string[];
  /** ISO date (YYYY-MM-DD). */
  lastVerified: string;
}

/** A credited photo served from /public/photos. */
export interface Photo {
  /** Path under /public, e.g. "/photos/regions/japan.webp" */
  src: string;
  width: number;
  height: number;
  alt: string;
  title: string;
  author: string;
  /** e.g. "CC BY-SA 4.0". Only CC0, public domain, CC BY and CC BY-SA are accepted. */
  license: string;
  licenseUrl?: string;
  /** Where the photo came from (e.g. its Wikimedia Commons file page). */
  sourcePage: string;
}

// ------------------------------------------------------------------------------------------------- Booking rules

/** The rule columns of the booking-rules comparison, in display order. */
export const BOOKING_RULE_KEYS = [
  "holds",
  "stopovers",
  "phoneFee",
  "partnerFee",
  "changeCancel",
  "bookingWindowDays",
  "phoneOnlyPartners",
  "fuelSurcharges",
] as const;
export type BookingRuleKey = (typeof BOOKING_RULE_KEYS)[number];

/** How an airline program's awards are booked. Every rule is null when no source confirmed it (shown as unknown). */
export interface BookingRules {
  program: ProgramId;
  holds: string | null;
  stopovers: string | null;
  /** Fee for booking by phone. */
  phoneFee: string | null;
  /** Fee for awards on partner airlines. */
  partnerFee: string | null;
  changeCancel: string | null;
  /** How many days before departure the program's own award seats open. */
  bookingWindowDays: number | null;
  /** Partner awards that can't be booked online. */
  phoneOnlyPartners: string | null;
  fuelSurcharges: string | null;
  /**
   * Set when the program has no rules of its own and uses another program's (Virgin Red books flights as Flying Club
   * awards). Every rule is then null: the other program's rules apply, and none are counted as confirmed here.
   */
  sameAs?: ProgramId;
  /** Qualifiers on the rules above (e.g. which flights a booking window covers), one sentence each, from the research. */
  notes?: string[];
  /** "YYYY-MM" or an ISO date. */
  asOf: string;
  sources: string[];
}

// -------------------------------------------------------------------------------------------------- Who can book

/** An airline and the programs whose points can book its award seats. */
export interface BookableAirline {
  /** Two-character IATA code, unique. */
  iata: string;
  name: string;
  alliance?: Alliance;
  /** The airline's own program, when it's one we cover. */
  ownProgram?: ProgramId;
  /** Programs that can book its award seats. */
  bookableWith: ProgramId[];
  /** Limits worth knowing before booking (pricing quirks, seat release, partners that need a phone call). */
  restrictions?: string;
  notes?: string;
  /**
   * ISO date from which this listing no longer applies (Asiana leaves Star Alliance and becomes Korean Air on
   * 2026-12-17). Pages say "Until <the day before>", and from that date (the viewer's, after hydration) the programs
   * aren't offered as ways to book it.
   */
  endsOn?: string;
  /** "YYYY-MM" or an ISO date. */
  asOf: string;
  sources: string[];
}

/** How a program books partner airlines in general. */
export interface ProgramBookingNote {
  program: ProgramId;
  notes: string;
  sources: string[];
}

// ----------------------------------------------------------------------------------------------------- Valuations

/** One outlet's published value for a currency or program. */
export interface OutletValue {
  /** e.g. "The Points Guy" */
  outlet: string;
  cents: number;
  /** The outlet's figure in its previous edition, when it changed. */
  previousCents?: number;
  /** "YYYY-MM" edition. */
  asOf: string;
  url: string;
  /** How the outlet arrives at the figure, when it says. */
  method?: string;
  note?: string;
  /** Other figures the outlet gives for some cardholders (e.g. a lower value without the premium card). */
  variants?: { appliesTo: string; cents: number }[];
}

/** Published values per point (US cents) for a bank currency or program, across outlets. */
export interface PointValue {
  id: BankCurrencyId | ProgramId;
  low: number;
  /** The middle outlet figure (the mean of two). Used as the deal calculator's default. */
  median: number;
  high: number;
  values: OutletValue[];
  note?: string;
  sources: string[];
}

/** An outlet's valuation table edition. */
export interface ValuationEdition {
  outlet: string;
  url: string;
  /** "YYYY-MM" */
  edition: string;
  published?: string;
  modified?: string;
  /** ISO date the table was read. */
  readOn: string;
  method: string;
}

// ------------------------------------------------------------------------------------------- Hotel → airline, news

/** Hotel points converted into airline miles. `program` may be an airline we don't cover (then only its name shows). */
export interface HotelToAirline {
  from: ProgramId;
  program: string;
  programName: string;
  /** `fromPoints` hotel points become `toMiles` miles. */
  fromPoints: number;
  toMiles: number;
  /** Extra miles per 60,000 points moved in one transaction (Marriott). 0 = excluded from the bonus. */
  bonusMilesPer60k?: number;
  /** Smallest conversion, in hotel points. */
  minimum?: number;
  notes?: string;
  /** ISO date. */
  asOf: string;
  sources: string[];
}

/** A hotel program's general conversion rules. */
export interface HotelTransferRule {
  from: ProgramId;
  /** Marriott: points per bonus block and the bonus per block. */
  everyPoints?: number;
  bonusMiles?: number;
  /** e.g. "10:1" */
  standardRatio?: string;
  exceptions?: { program: string; programName: string; bonusMiles: number }[];
  /** Smallest conversion, in hotel points, for rows without their own `minimum` (read from the rule text). */
  minimum?: number;
  /** Conversions go in multiples of this (hotel points). */
  increment?: number;
  /** Most points per conversion. */
  maxPerTransfer?: number;
  /** Most points a member can convert per day. */
  dailyMax?: number;
  rule: string;
  /** ISO date. */
  asOf: string;
  sources: string[];
}

/** A limited-time transfer bonus. `from` bank points become `to` program points while it runs. */
export interface TransferBonus {
  currency: BankCurrencyId;
  program: ProgramId;
  bonusPercent: number;
  from: number;
  to: number;
  /** ISO date. */
  starts: string;
  /** "stated" by the issuer, or "first reported" when only the first coverage date is known. */
  startsBasis: string;
  /** ISO date, the last day of the bonus. */
  ends: string;
  /** Offered only to some members. */
  targeted: boolean;
  /** Only these card ids get the bonus. */
  cards?: string[];
  /** The most bonus miles one member can earn from it (read from the notes, e.g. "capped at 50,000 miles"). */
  maxBonusMiles?: number;
  notes?: string;
  sources: string[];
}

export type PartnerChangeKind = "added" | "removed" | "ratio changed" | "access expanded";

/** A dated change to a bank's partner list. `program` may be one we don't cover (then only its name shows). */
export interface PartnerChange {
  /** ISO date it took (or takes) effect. */
  date: string;
  currency: BankCurrencyId;
  program?: string;
  programName: string;
  change: PartnerChangeKind;
  /** "in effect", "scheduled" or "ended" (a partner since dropped). */
  status: string;
  /** ISO date it was announced, when known. */
  announced?: string;
  detail: string;
  cards?: string[];
  sources: string[];
}
