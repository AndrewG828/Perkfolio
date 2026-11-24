// SEED DATA: replaced by verified research before release
import type { CardLoungeAccessRule, LoungeGuestRulesData } from "./types";

/**
 * Guest rules per card and lounge network, for the lounge guest-cost calculator (shared/lib/guest-cost.ts).
 * Placeholder values in the final shape, taken from the lounge terms in shared/data/cards: research replaces this
 * file (see seed-status.ts). Card ids come from shared/data/cards; network ids from shared/data/networks.
 */

const CARD_TERMS = "/cards";

const PLATINUM: CardLoungeAccessRule[] = [
  {
    network: "centurion",
    visits: "unlimited",
    conditions: "Same-day boarding pass",
    freeGuests: 0,
    guestFeeUsd: 50,
    unlocks: [{ spendUsd: 75_000, period: "calendar year", effect: { freeGuests: 2 } }],
    notes: "Guests aged 2–17 cost $30.",
  },
  {
    network: "delta-sky-club",
    visits: 10,
    conditions: "Same-day Delta flight; 10 visits per Medallion Year",
    freeGuests: 0,
    guestFeeUsd: 50,
    unlocks: [{ spendUsd: 75_000, period: "calendar year", effect: { visits: "unlimited" } }],
    notes: "No complimentary guests.",
  },
  {
    network: "priority-pass",
    visits: "unlimited",
    conditions: "Priority Pass Select enrollment",
    freeGuests: 2,
    guestFeeUsd: 35,
    unlocks: [],
    notes: "Lounges only; restaurants are excluded.",
  },
  { network: "plaza-premium", visits: "unlimited", conditions: null, freeGuests: 0, guestFeeUsd: null, unlocks: [], notes: "Guest policy varies by location." },
  { network: "escape", visits: "unlimited", conditions: null, freeGuests: 0, guestFeeUsd: null, unlocks: [], notes: "Guest fees apply." },
  { network: "airspace", visits: "unlimited", conditions: null, freeGuests: 0, guestFeeUsd: null, unlocks: [], notes: "Guest fees apply." },
  { network: "amex-international", visits: "unlimited", conditions: null, freeGuests: 0, guestFeeUsd: null, unlocks: [], notes: "Guest policy varies by lounge." },
];

const PRIORITY_PASS_2_FREE: CardLoungeAccessRule = {
  network: "priority-pass",
  visits: "unlimited",
  conditions: "Priority Pass Select enrollment",
  freeGuests: 2,
  guestFeeUsd: 35,
  unlocks: [],
  notes: null,
};

const SAPPHIRE_RESERVE: CardLoungeAccessRule[] = [
  {
    network: "chase-sapphire",
    visits: "unlimited",
    conditions: null,
    freeGuests: 2,
    guestFeeUsd: 27,
    unlocks: [],
    notes: "Children under 2 are free.",
  },
  { ...PRIORITY_PASS_2_FREE, notes: "Lounges only; restaurants are excluded." },
];

const CAPITAL_ONE_LOUNGES: CardLoungeAccessRule = {
  network: "capital-one",
  visits: "unlimited",
  conditions: null,
  freeGuests: 0,
  guestFeeUsd: 45,
  unlocks: [{ spendUsd: 75_000, period: "calendar year", effect: { freeGuests: 2 } }],
  notes: "Guests aged 2–17 cost $25. After the spend: 2 free guests at Lounges, 1 at Landings, through the next year.",
};

export const loungeGuestRules: LoungeGuestRulesData = {
  cards: [
    { cardId: "amex-platinum", access: PLATINUM, sources: [`${CARD_TERMS}/amex-platinum`] },
    { cardId: "amex-business-platinum", access: PLATINUM, sources: [`${CARD_TERMS}/amex-business-platinum`] },
    {
      cardId: "amex-delta-reserve",
      access: [
        {
          network: "delta-sky-club",
          visits: 15,
          conditions: "Same-day Delta flight; 15 visits per Medallion Year",
          freeGuests: 0,
          guestFeeUsd: 50,
          unlocks: [{ spendUsd: 75_000, period: "calendar year", effect: { visits: "unlimited" } }],
          notes: "Includes 4 One-Time Guest Passes a year.",
        },
        {
          network: "centurion",
          visits: "unlimited",
          conditions: "Same-day Delta flight",
          freeGuests: 0,
          guestFeeUsd: 50,
          unlocks: [],
          notes: null,
        },
      ],
      sources: [`${CARD_TERMS}/amex-delta-reserve`],
    },
    { cardId: "amex-marriott-brilliant", access: [PRIORITY_PASS_2_FREE], sources: [`${CARD_TERMS}/amex-marriott-brilliant`] },
    { cardId: "chase-sapphire-reserve", access: SAPPHIRE_RESERVE, sources: [`${CARD_TERMS}/chase-sapphire-reserve`] },
    { cardId: "chase-sapphire-reserve-business", access: SAPPHIRE_RESERVE, sources: [`${CARD_TERMS}/chase-sapphire-reserve-business`] },
    {
      cardId: "united-club-infinite",
      access: [
        {
          network: "united-club",
          visits: "unlimited",
          conditions: null,
          freeGuests: 1,
          guestFeeUsd: null,
          unlocks: [{ spendUsd: 50_000, period: "calendar year", effect: "2 complimentary guests" }],
          notes: "One adult guest, or immediate family. Guest rules are due to change in 2027.",
        },
      ],
      sources: [`${CARD_TERMS}/united-club-infinite`],
    },
    {
      cardId: "capital-one-venture-x",
      access: [
        CAPITAL_ONE_LOUNGES,
        { network: "priority-pass", visits: "unlimited", conditions: "Priority Pass enrollment", freeGuests: 0, guestFeeUsd: 35, unlocks: [], notes: "Every guest costs $35, even after the $75,000 spend." },
      ],
      sources: [`${CARD_TERMS}/capital-one-venture-x`],
    },
    {
      cardId: "capital-one-venture-x-business",
      access: [CAPITAL_ONE_LOUNGES, { ...PRIORITY_PASS_2_FREE, conditions: "Priority Pass enrollment" }],
      sources: [`${CARD_TERMS}/capital-one-venture-x-business`],
    },
    {
      cardId: "citi-strata-elite",
      access: [
        PRIORITY_PASS_2_FREE,
        {
          network: "admirals-club",
          visits: 4,
          conditions: "4 Admirals Club passes per calendar year",
          freeGuests: 0,
          guestFeeUsd: null,
          unlocks: [],
          notes: "Each pass covers one adult plus accompanying children.",
        },
      ],
      sources: [`${CARD_TERMS}/citi-strata-elite`],
    },
    {
      cardId: "citi-aadvantage-executive",
      access: [
        {
          network: "admirals-club",
          visits: "unlimited",
          conditions: null,
          freeGuests: 2,
          guestFeeUsd: null,
          unlocks: [],
          notes: "Up to 2 guests or immediate family.",
        },
      ],
      sources: [`${CARD_TERMS}/citi-aadvantage-executive`],
    },
    { cardId: "bilt-palladium", access: [PRIORITY_PASS_2_FREE], sources: [`${CARD_TERMS}/bilt-palladium`] },
    {
      cardId: "atmos-rewards-summit",
      access: [
        {
          network: "alaska-lounge",
          visits: 8,
          conditions: "8 day passes a year, 2 per quarter; flight to or from that airport",
          freeGuests: 0,
          guestFeeUsd: null,
          unlocks: [],
          notes: "Each guest uses one of your day passes.",
        },
      ],
      sources: [`${CARD_TERMS}/atmos-rewards-summit`],
    },
  ],
  networkDefaults: [
    { network: "centurion", guestFeeUsd: 50, notes: "$30 for ages 2–17.", sources: [] },
    { network: "delta-sky-club", guestFeeUsd: 50, notes: null, sources: [] },
    { network: "priority-pass", guestFeeUsd: 35, notes: "Set by your card's Priority Pass membership.", sources: [] },
    { network: "capital-one", guestFeeUsd: 45, notes: "$25 for ages 2–17.", sources: [] },
    { network: "chase-sapphire", guestFeeUsd: 27, notes: null, sources: [] },
    { network: "plaza-premium", guestFeeUsd: null, notes: "Varies by location.", sources: [] },
    { network: "escape", guestFeeUsd: null, notes: "Varies by location.", sources: [] },
    { network: "airspace", guestFeeUsd: null, notes: "Varies by location.", sources: [] },
  ],
};
