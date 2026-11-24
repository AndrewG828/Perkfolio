import type { LoungeNetwork } from "../types";

/**
 * Clauses in the card data (shared/data/cards) that the travel research contradicts or couldn't confirm, for the card
 * data's owner to fix. Until then the travel tools show the issuer's current terms beside them: lounge rows
 * (lounge-row.tsx) and the baggage tool's card perks leave out a clause marked `hide` and print the `note` under the
 * card's terms. A test fails once a clause is gone from the card data, so its entry is removed with the fix.
 */
export type CardTermStatus =
  /** The issuer's current terms say otherwise. */
  | "contradicted"
  /** The issuer's page doesn't confirm it (it may still be true). */
  | "unconfirmed"
  /** True, but easy to misread next to the guest calculator. */
  | "unclear"
  /** Was true; the issuer has since added more. */
  | "outdated";

export interface CardTermCheck {
  cardId: string;
  /** Which text the clause is in: a lounge network's terms, or the card's perks. */
  where: LoungeNetwork | "perks";
  /** The clause as the card data words it (with its leading separator when `hide` removes it). */
  clause: RegExp;
  status: CardTermStatus;
  /** Leave the clause out where the travel tools show the card's terms. */
  hide?: boolean;
  /** What the issuer's terms say, in visitor words, shown under the card's terms. None for clauses only tracked here. */
  note?: string;
  /** For the card data's owner: what's wrong and where the research says so. */
  why: string;
  sources: string[];
}

const CHASE_RESERVE = "https://creditcards.chase.com/rewards-credit-cards/sapphire/reserve";
const CHASE_RESERVE_BUSINESS = "https://creditcards.chase.com/business-credit-cards/sapphire/reserve";
const AMEX_TERMS = "https://www.americanexpress.com/en-us/travel/lounges/the-platinum-card/terms/";
const AMEX_SAN = "https://www.americanexpress.com/en-us/travel/lounges/the-platinum-card/SAN/";
const AMEX_FRA = "https://www.americanexpress.com/en-us/travel/lounges/the-platinum-card/FRA/";
const PLATINUMS = ["amex-platinum", "amex-business-platinum"] as const;

export const CARD_TERM_CHECKS: CardTermCheck[] = [
  // Chase Sapphire Reserve and Sapphire Reserve for Business (chase-bilt.ts).
  ...[
    ["chase-sapphire-reserve", CHASE_RESERVE],
    ["chase-sapphire-reserve-business", CHASE_RESERVE_BUSINESS],
  ].map(
    ([cardId, source]): CardTermCheck => ({
      cardId,
      where: "chase-sapphire",
      clause: /,\s*additional guests \$27 each/,
      status: "unconfirmed",
      hide: true,
      note: "Chase's card page publishes no fee for Sapphire Lounge guests beyond the 2 free ones; $27 is its price for extra Priority Pass guests.",
      why: "Sapphire Lounge extra-guest fee: Chase's card pages give only 2 complimentary guests; $27 is Chase's Priority Pass extra-guest price (guest-rule research, rejected item 8).",
      sources: [source],
    }),
  ),
  {
    cardId: "chase-sapphire-reserve",
    where: "chase-sapphire",
    clause: /children under 2 free/,
    status: "unconfirmed",
    note: "The under-2 policy, early entry on connections and the end of Priority Pass access aren't on Chase's card page, so they aren't confirmed here.",
    why: "Not on Chase's card page (guest-rule research, rejected item 10).",
    sources: [CHASE_RESERVE],
  },
  {
    cardId: "chase-sapphire-reserve",
    where: "chase-sapphire",
    clause: /Up to 5 hours early on connections/,
    status: "unconfirmed",
    why: "Not on Chase's card page (guest-rule research, rejected item 9).",
    sources: [CHASE_RESERVE],
  },
  {
    cardId: "chase-sapphire-reserve",
    where: "chase-sapphire",
    clause: /Priority Pass\/LoungeKey members lost access 8\/15\/2026/,
    status: "unconfirmed",
    why: "Sapphire Lounges leaving Priority Pass and LoungeKey on Aug 15, 2026 isn't on Chase's card page (guest-rule research, rejected item 11; lounges.ts says the same in two comments).",
    sources: [CHASE_RESERVE],
  },

  // Amex Platinum and Business Platinum share their lounge terms (PLATINUM_LOUNGES in amex.ts).
  ...PLATINUMS.flatMap((cardId): CardTermCheck[] => [
    {
      cardId,
      where: "escape",
      clause: /;\s*guest fees apply/,
      status: "contradicted",
      hide: true,
      note: "Amex's terms give 2 complimentary guests per visit.",
      why: "Escape Lounges: Amex's terms give 2 complimentary guests per visit (guest-rule research, rejected item 15).",
      sources: [AMEX_TERMS],
    },
    {
      cardId,
      where: "airspace",
      clause: /;\s*guest fees apply/,
      status: "contradicted",
      hide: true,
      note: "Amex's San Diego listing allows up to 2 complimentary guests per visit.",
      why: "Airspace: Amex's San Diego listing allows 2 complimentary guests per visit (guest-rule research, rejected item 16).",
      sources: [AMEX_SAN],
    },
    {
      cardId,
      where: "plaza-premium",
      clause: /;\s*guest policy varies by location/,
      status: "contradicted",
      hide: true,
      note: "Amex's terms give 2 complimentary guests at any Plaza Premium Lounge; the lounge's own house rules still apply.",
      why: "Plaza Premium: superseded by Amex's terms, which give 2 complimentary guests at any Plaza Premium Lounge (guest-rule research, rejected item 17).",
      sources: [AMEX_TERMS],
    },
    {
      cardId,
      where: "amex-international",
      clause: /\s*\(e\.g\. Sydney, Mexico City, São Paulo\)/,
      status: "contradicted",
      hide: true,
      note: "Amex's Sydney and Mexico City lounges are now Centurion Lounges with their own rules, and São Paulo access is through the W Premium lounges at Guarulhos.",
      why: "Outdated examples: Sydney and Mexico City are Centurion Lounges now, and São Paulo access is via W Premium lounges (guest-rule research, rejected item 18).",
      sources: [AMEX_TERMS, "https://www.americanexpress.com/en-us/travel/lounges/the-platinum-card/GRU/"],
    },
    {
      cardId,
      where: "perks",
      clause: /Lufthansa lounge access ended October 1, 2026/,
      status: "unconfirmed",
      why: "The end of Lufthansa lounge access is only inferred (no Lufthansa section in Amex's terms, no Lufthansa lounge on its Frankfurt page); the October 1, 2026 date couldn't be checked (guest-rule research, rejected item 21).",
      sources: [AMEX_TERMS, AMEX_FRA],
    },
  ]),

  // Citi (other.ts).
  {
    cardId: "citi-aadvantage-executive",
    where: "admirals-club",
    clause: /\s+without guest privileges/,
    status: "contradicted",
    hide: true,
    note: "Citi's terms let authorized users bring up to 2 guests or their immediate family free too.",
    why: "Authorized users can bring 2 guests or immediate family (guest-rule research, rejected item 14).",
    sources: ["https://www.citi.com/credit-cards/citi-aadvantage-executive-world-legend-mastercard"],
  },
  {
    cardId: "citi-strata-elite",
    where: "admirals-club",
    clause: /for the primary cardholder only/,
    status: "unclear",
    note: "Only the primary cardmember gets passes, but every adult who enters uses one, the cardmember included: all 4 at once admit the cardmember and up to 3 adult guests.",
    why: "Reads as if guests can't use the passes; Citi's page has the primary use one pass per adult, up to 3 adult guests with all 4 (guest-rule research, citi-strata-elite admirals-club conditions).",
    sources: ["https://www.citi.com/credit-cards/citi-strata-elite-credit-card"],
  },

  // Bank of America (other.ts).
  {
    cardId: "atmos-rewards-summit",
    where: "alaska-lounge",
    clause: /8 Alaska Lounge day passes a year, issued as 2 each calendar quarter/,
    status: "unconfirmed",
    note: "Bank of America's card page confirms the card includes Alaska Lounge passes, but not how many, when they're issued or who can use them.",
    why: "Pass count, schedule and transfer rules are unconfirmed: the issuer's page only says lounge passes are included (guest-rule research, rejected item 13).",
    sources: ["https://www.bankofamerica.com/credit-cards/products/alaska-airlines-infinite-credit-card/"],
  },

  // Delta SkyMiles Reserve and Platinum (amex.ts): the verified baggage data adds a second free bag.
  ...["amex-delta-reserve", "amex-delta-platinum"].map(
    (cardId): CardTermCheck => ({
      cardId,
      where: "perks",
      clause: /^First checked bag free for cardmember and up to 8 companions on the reservation$/,
      status: "outdated",
      note: "Since June 4, 2026, the Basic Card Member also checks a second bag free on domestic Delta-operated flights (ones that begin and end in the U.S.).",
      why: "Baggage research (usDomestic DL exemptions): since June 4, 2026 the Basic Card Member also gets a second free bag on domestic Delta-operated flights.",
      sources: [
        "https://www.americanexpress.com/en-us/credit-cards/credit-intel/delta-baggage-fees/",
        "https://news.delta.com/more-travel-value-added-delta-skymiles-cards-no-increase-annual-fees",
      ],
    }),
  ),
];
