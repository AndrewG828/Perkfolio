// Data model for the Points & Miles section. The data files next to this one (currencies, programs, transfers,
// sweet-spots, photos) hold the values; the lists below are fixed, so ids stay stable across data refreshes.

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

/** Every airline and hotel program we cover. These ids are URL slugs (/points/programs/<id>): never rename one. */
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
  /** Which cards earn it, in words, e.g. "Platinum, Gold, Green and the business Platinum and Gold cards". */
  earnedWith: string;
  /** Rules that limit transfers, e.g. which cards can transfer at all. */
  restrictions?: string;
  /** The issuer's page listing the partners. */
  sourceUrl: string;
  /** ISO date (YYYY-MM-DD) the partner list was last checked. */
  lastVerified: string;
}

/** One bank currency → program transfer. `from` bank points become `to` program points (1000 → 1000 × to / from). */
export interface TransferPartner {
  currency: BankCurrencyId;
  program: ProgramId;
  from: number;
  to: number;
  /** How long a transfer takes, e.g. "Instant" or "Up to 2 days". */
  time: string;
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
}

/** An airline or hotel loyalty program. */
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
  /** e.g. "CC BY-SA 4.0" */
  license: string;
  licenseUrl?: string;
  /** Where the photo came from (e.g. its Wikimedia Commons file page). */
  sourcePage: string;
}
