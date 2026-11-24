import type { CardType } from "./types";

/**
 * Cards that issuer rules name but our card dataset doesn't list (application-rules.ts `otherProducts` and
 * `businessCardsOnPersonalReportOther`), with how to recognize them in the user's card history. A history entry
 * for a card we don't list has a free-text name and an issuer; it matches when the issuer is the same, the segment
 * fits and its name contains every word of one of the `words` groups.
 *
 * Names come from the research. `pick` lists the named cards in the history editor, so a user can choose
 * "Marriott Bonvoy Boundless" instead of typing it. Labels that describe a group we can't recognize ("earlier
 * versions of the card") are in DESCRIPTIVE_ONLY: they're shown as caveats.
 */


export interface OtherProductMatcher {
  issuer: string;
  /** true: business cards only; false: personal only; omitted: either. */
  business?: boolean;
  /** Any one group must appear in full in the card's name (lowercase words). Omitted: any name. */
  words?: string[][];
  /** No group may appear in full. */
  notWords?: string[][];
  /**
   * A business card that matches by name, but the issuer's terms don't say whether it counts: the match is
   * reported as uncertain with this reason (from the rule's notes), so the rule warns instead of blocking.
   */
  uncertainIfBusiness?: string;
  /** Credit or charge card, when the research says (Amex's pacing limits count credit cards only). */
  cardType?: CardType;
}

/** How a history entry matches a label: not at all, surely, or only maybe (`uncertain` says why). */
export interface OtherProductMatch {
  match: boolean;
  uncertain?: string;
}

/** A card the history editor offers by name (no card id). */
export interface NamedProduct {
  key: string;
  name: string;
  issuer: string;
  business: boolean;
}

const tokens = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
const hasGroup = (name: string[], group: string[]) => group.every((w) => name.includes(w));

const UNITED_CLUB: OtherProductMatcher = { issuer: "Chase", business: false, words: [["united", "club"]] };
/** Chase's "any United Club credit card": its notes say the terms don't settle whether the Business card counts. */
const ANY_UNITED_CLUB: OtherProductMatcher = {
  issuer: "Chase",
  words: [["united", "club"]],
  uncertainIfBusiness: "Chase's terms don't say whether the United Club Business Card counts as a United Club credit card.",
};
const RITZ: OtherProductMatcher = { issuer: "Chase", words: [["ritz"]] };

/** Research label → matcher. Several labels can share one. */
export const OTHER_PRODUCT_MATCHERS: Record<string, OtherProductMatcher> = {
  "United Club Visa Signature Card": UNITED_CLUB,
  "any other United Club credit card": ANY_UNITED_CLUB,
  "Southwest Rapid Rewards Plus Credit Card": { issuer: "Chase", business: false, words: [["southwest", "plus"]] },
  "Southwest Rapid Rewards Premier Credit Card": { issuer: "Chase", business: false, words: [["southwest", "premier"]] },
  "Citi Premier Card": { issuer: "Citi", business: false, words: [["premier"]] },
  "any Capital One business card": { issuer: "Capital One", business: true },
  "Platinum Card from American Express Exclusively for Charles Schwab": {
    issuer: "American Express",
    business: false,
    words: [["platinum", "schwab"]],
    cardType: "charge",
  },
  "Platinum Card from American Express Exclusively for Morgan Stanley": {
    issuer: "American Express",
    business: false,
    words: [["platinum", "morgan", "stanley"]],
    cardType: "charge",
  },
  "Premier Rewards Gold Card": { issuer: "American Express", business: false, words: [["premier", "rewards", "gold"]], cardType: "charge" },
  "Starwood Preferred Guest American Express Luxury Card": { issuer: "American Express", words: [["starwood", "luxury"], ["spg", "luxury"]] },
  "The Ritz-Carlton Credit Card (Chase / J.P. Morgan)": RITZ,
  "J.P. Morgan Ritz-Carlton Rewards Credit Card": RITZ,
  "Marriott Bonvoy Bountiful (Chase)": { issuer: "Chase", words: [["bountiful"]] },
  "Marriott Bonvoy Boundless (Chase)": { issuer: "Chase", words: [["boundless"]] },
  "Marriott Bonvoy Bold (Chase)": { issuer: "Chase", words: [["bonvoy", "bold"], ["marriott", "bold"]] },
  // businessCardsOnPersonalReportOther (Chase 5/24)
  "Chase, American Express and Citi business cards": { issuer: "*chase-amex-citi", business: true },
  "Capital One business cards other than the Venture X Business, Venture Business and Spark Cash Plus": {
    issuer: "Capital One",
    business: true,
    notWords: [["venture", "business"], ["spark", "cash", "plus"]],
  },
  "Discover business cards": { issuer: "Discover", business: true },
  "TD Bank business cards": { issuer: "TD Bank", business: true },
};

/** Labels for groups we can't pick out of a history by name: shown to the user as "also counts". */
export const DESCRIPTIVE_ONLY = new Set([
  "earlier versions of the Platinum Card",
  "earlier versions of the card",
  "earlier versions of these cards",
  "earlier versions of the Delta Reserve card",
  "earlier versions of the Delta Platinum or Delta Reserve",
  "earlier versions of the Business Platinum Card",
  "earlier versions of the Business Gold Card",
  "any Citi card later product-changed into a Double Cash",
  "any Citi card later product-changed into an AAdvantage Executive",
]);

/** Named cards the history editor offers, grouped by issuer in display order. */
export const NAMED_PRODUCTS: NamedProduct[] = [
  { key: "chase-united-club-visa-signature", name: "United Club Visa Signature Card", issuer: "Chase", business: false },
  { key: "chase-southwest-plus", name: "Southwest Rapid Rewards Plus Credit Card", issuer: "Chase", business: false },
  { key: "chase-southwest-premier", name: "Southwest Rapid Rewards Premier Credit Card", issuer: "Chase", business: false },
  { key: "chase-marriott-bountiful", name: "Marriott Bonvoy Bountiful", issuer: "Chase", business: false },
  { key: "chase-marriott-boundless", name: "Marriott Bonvoy Boundless", issuer: "Chase", business: false },
  { key: "chase-marriott-bold", name: "Marriott Bonvoy Bold", issuer: "Chase", business: false },
  { key: "chase-ritz-carlton", name: "The Ritz-Carlton Credit Card", issuer: "Chase", business: false },
  { key: "amex-platinum-schwab", name: "Platinum Card Exclusively for Charles Schwab", issuer: "American Express", business: false },
  { key: "amex-platinum-morgan-stanley", name: "Platinum Card Exclusively for Morgan Stanley", issuer: "American Express", business: false },
  { key: "amex-premier-rewards-gold", name: "Premier Rewards Gold Card", issuer: "American Express", business: false },
  { key: "amex-spg-luxury", name: "Starwood Preferred Guest American Express Luxury Card", issuer: "American Express", business: false },
  { key: "citi-premier", name: "Citi Premier Card", issuer: "Citi", business: false },
];

export const namedProduct = (key: string) => NAMED_PRODUCTS.find((p) => p.key === key);
/** The named product an application was picked as (same name and issuer), if any. */
export const namedProductFor = (name: string | undefined, issuer: string) =>
  name ? NAMED_PRODUCTS.find((p) => p.name === name && p.issuer === issuer) : undefined;

type Entry = { name: string; issuer: string; business: boolean };
type SameIssuer = (a: string, b: string) => boolean;

/**
 * How a history entry for a card we don't list matches the product a label names. `sameIssuer` is passed in so
 * the issuer aliases live in one place (shared/lib/eligibility.ts).
 */
export function matchOtherProduct(label: string, entry: Entry, sameIssuer: SameIssuer): OtherProductMatch {
  const m = OTHER_PRODUCT_MATCHERS[label];
  if (!m) return { match: false };
  const issuerOk =
    m.issuer === "*chase-amex-citi" ? ["Chase", "American Express", "Citi"].some((i) => sameIssuer(entry.issuer, i)) : sameIssuer(entry.issuer, m.issuer);
  if (!issuerOk) return { match: false };
  if (m.business !== undefined && m.business !== entry.business) return { match: false };
  const name = tokens(entry.name);
  if (m.words && !m.words.some((g) => hasGroup(name, g))) return { match: false };
  if (m.notWords?.some((g) => hasGroup(name, g))) return { match: false };
  return entry.business && m.uncertainIfBusiness ? { match: true, uncertain: m.uncertainIfBusiness } : { match: true };
}

/** Whether a history entry is (or may be) the product a label names. */
export const matchesOtherProduct = (label: string, entry: Entry, sameIssuer: SameIssuer) => matchOtherProduct(label, entry, sameIssuer).match;

/** Credit or charge, for a card we don't list that the research types (the Schwab Platinum is a charge card). */
export function otherProductCardType(entry: Entry, sameIssuer: SameIssuer): CardType | undefined {
  for (const [label, m] of Object.entries(OTHER_PRODUCT_MATCHERS)) {
    if (m.cardType && matchOtherProduct(label, entry, sameIssuer).match) return m.cardType;
  }
  return undefined;
}
