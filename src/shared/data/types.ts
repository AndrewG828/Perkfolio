// Core data model for Perkfolio. All card data is static and lives in src/data/cards/*.ts.

export type Issuer =
  | "American Express"
  | "Chase"
  | "Capital One"
  | "Citi"
  | "Bilt"
  | "Wells Fargo"
  | "U.S. Bank"
  | "Bank of America"
  | "Barclays";

export type CardCategory =
  | "premium-travel" // $395+ AF general travel cards
  | "travel" // mid-tier transferable-points travel cards
  | "airline"
  | "hotel"
  | "cash-back"
  | "business";

export type Network = "Amex" | "Visa" | "Mastercard";

/** How often a credit refreshes. */
export type CreditFrequency =
  | "monthly"
  | "quarterly"
  | "semiannual"
  | "annual"
  | "every-4-years" // e.g. Global Entry
  | "one-time";

export type CreditCategory =
  | "travel"
  | "airline"
  | "hotel"
  | "dining"
  | "rideshare"
  | "entertainment"
  | "shopping"
  | "wellness"
  | "membership"
  | "other";

export interface Credit {
  /** Stable id, unique within the card, kebab-case (used as a localStorage key). */
  id: string;
  name: string;
  /** Total annual value in USD (e.g. $25/month => 300). For every-4-years credits, the per-use value. */
  annualValue: number;
  frequency: CreditFrequency;
  /** Value available each period in USD (e.g. 25 for $25/month). */
  amountPerPeriod: number;
  category: CreditCategory;
  description: string;
  enrollmentRequired?: boolean;
  /** Optional caveat, e.g. "December bonus of $15" or "Through 12/31/2026". */
  note?: string;
  /**
   * A benefit paid in points, not dollars (Venture X's 10,000 anniversary miles). `annualValue` and `amountPerPeriod`
   * are these points at the published median (point-value.ts; a test keeps them in step), and pages that know the
   * visitor's own values use creditValue() instead.
   */
  points?: { amount: number; program: string };
  /**
   * Posts only when the card renews (each account anniversary, "starting at the first renewal"), so the first year
   * never gets it: the next-card ranking leaves it out of the first-year value. Set only where the issuer's terms say so.
   */
  afterRenewal?: boolean;
}

export interface EarnRate {
  /** e.g. "Flights booked directly with airlines or Amex Travel" */
  category: string;
  /** Points/miles per dollar, or cash-back percent for cash-back cards. */
  multiplier: number;
  /** e.g. "Up to $500k per calendar year" */
  cap?: string;
}

/** Lounge networks used to connect cards to the lounge finder. */
export type LoungeNetwork =
  | "centurion"
  | "amex-international" // Amex lounges outside the US (e.g. Escape partner, Intl American Express Lounges)
  | "delta-sky-club"
  | "priority-pass"
  | "capital-one"
  | "chase-sapphire"
  | "plaza-premium"
  | "escape"
  | "airspace"
  | "lufthansa"
  | "united-club"
  | "admirals-club"
  | "alaska-lounge"
  | "citi-strata" // reserved for Citi-branded lounges (none yet)
  | "air-canada-maple-leaf" // Maple Leaf Lounges and Air Canada Cafés
  | "star-alliance-lounges"; // Star Alliance member and affiliated airlines' lounges

export interface LoungeAccess {
  network: LoungeNetwork;
  /** Human-readable terms, e.g. "Unlimited visits; 2 free guests" */
  terms: string;
}

export interface Card {
  /** kebab-case slug, e.g. "amex-platinum" */
  id: string;
  name: string;
  issuer: Issuer;
  network: Network;
  category: CardCategory;
  annualFee: number;
  /** Rewards currency, e.g. "Membership Rewards points" */
  rewardsCurrency: string;
  /**
   * The card file's own value per point in cents (e.g. 1.6; cash back = 1.0). Used only when no outlet publishes a
   * value for the card's points: every page values points with shared/lib/point-value.ts (the user's own value, else
   * the published median).
   */
  pointValueCents: number;
  /** Current public welcome offer, short form. */
  welcomeOffer: string;
  /**
   * The welcome offer's approximate value in USD. Used only for an offer that can't be valued from its points and cash
   * (free nights); point offers are valued with shared/lib/point-value.ts (shared/lib/welcome-offer.ts).
   */
  welcomeOfferValue: number;
  earnRates: EarnRate[];
  /** Base rate on all other purchases. */
  baseRate: number;
  credits: Credit[];
  loungeAccess: LoungeAccess[];
  /** Other notable non-credit perks (insurance, status, transfer partners...). */
  perks: string[];
  /** Short marketing-style summary, 1–2 sentences. */
  tagline: string;
  bestFor: string;
  foreignTransactionFee: boolean;
  authorizedUserFee?: string;
  /** Transfer partner names, for cards that earn a bank currency: set with transferPartnerNames() from the verified
   *  Points & Miles partner list (shared/data/points/card-partners.ts). */
  transferPartners?: string[];
  /** Card art gradient (CSS colors) and text color for the rendered card visual. */
  art: { from: string; to: string; text: "light" | "dark"; finish?: "metal" | "plastic" };
  /** Path to the issuer's card artwork (set from src/data/card-images.ts). */
  image?: string;
  /** Public product page on the issuer's site. */
  url: string;
  /** ISO date terms were last verified, e.g. "2026-11-22" */
  lastVerified: string;
}

export interface Lounge {
  id: string;
  name: string;
  network: LoungeNetwork;
  airportCode: string;
  terminal: string;
  /** e.g. "After security, near gate B5" */
  location?: string;
  /** e.g. "Opened 2025; showers available" */
  notes?: string;
  /**
   * Closed for now (as the notes say): left out of access counts, nearest-lounge rankings and automatic directions,
   * and shown as closed. `from` and `until` (ISO dates, the first day closed and the day it's due to reopen) limit it
   * in time when known; `until` is how pages word the reopening ("end of 2027 (expected)").
   */
  closed?: { from?: string; until?: string; untilLabel?: string };
  /**
   * Card access isn't confirmed here although the lounge belongs to a network cards open (Plaza Premium First): no
   * card is counted as getting in, and the row says why.
   */
  cardAccessUnconfirmed?: string;
}

export interface Airport {
  code: string;
  name: string;
  city: string;
  country: string;
}
