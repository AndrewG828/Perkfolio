// SEED DATA: replaced by verified research before release
import type { HotelEarningData } from "./types";

/**
 * How the big hotel programs earn on paid stays, for /tools/hotel-points.
 * Placeholder values in the final shape: research replaces this file (see seed-status.ts).
 */
export const hotelEarning: HotelEarningData = {
  chains: [
    {
      program: "Marriott Bonvoy",
      basePerDollar: 10,
      eligibleSpend: "Room rate and eligible charges to the room, before taxes and fees",
      brandExceptions: [
        { brands: ["Residence Inn", "TownePlace Suites", "Element"], perDollar: 5 },
        { brands: ["Marriott Executive Apartments", "Apartments by Marriott Bonvoy"], perDollar: 2.5 },
      ],
      eliteBonuses: [
        { tier: "Silver Elite", percent: 10 },
        { tier: "Gold Elite", percent: 25 },
        { tier: "Platinum Elite", percent: 50 },
        { tier: "Titanium Elite", percent: 75 },
        { tier: "Ambassador Elite", percent: 75 },
      ],
      cards: [
        { cardId: "amex-marriott-brilliant", name: "Marriott Bonvoy Brilliant", perDollar: 6 },
        { cardId: null, name: "Marriott Bonvoy Boundless", perDollar: 6 },
        { cardId: null, name: "Marriott Bonvoy Bevy", perDollar: 6 },
        { cardId: null, name: "Marriott Bonvoy Business", perDollar: 6 },
      ],
      asOf: "2026-11-24",
      notes: "Stays booked through third-party sites usually earn no points.",
      sources: ["https://www.marriott.com/loyalty/terms/default.mi"],
    },
    {
      program: "Hilton Honors",
      basePerDollar: 10,
      eligibleSpend: "Room rate and eligible incidentals, before taxes",
      brandExceptions: [{ brands: ["Tru by Hilton", "Home2 Suites by Hilton", "Spark by Hilton"], perDollar: 5 }],
      eliteBonuses: [
        { tier: "Silver", percent: 20 },
        { tier: "Gold", percent: 80 },
        { tier: "Diamond", percent: 100 },
      ],
      cards: [
        { cardId: "amex-hilton-aspire", name: "Hilton Honors Aspire", perDollar: 14 },
        { cardId: null, name: "Hilton Honors Surpass", perDollar: 12 },
        { cardId: null, name: "Hilton Honors Business", perDollar: 12 },
        { cardId: null, name: "Hilton Honors (no annual fee)", perDollar: 7 },
      ],
      asOf: "2026-11-24",
      notes: "Elite bonuses apply to base points only.",
      sources: ["https://www.hilton.com/en/hilton-honors/terms/"],
    },
    {
      program: "World of Hyatt",
      basePerDollar: 5,
      eligibleSpend: "Room rate and eligible incidentals, before taxes and fees",
      brandExceptions: [],
      eliteBonuses: [
        { tier: "Discoverist", percent: 10 },
        { tier: "Explorist", percent: 20 },
        { tier: "Globalist", percent: 30 },
      ],
      cards: [
        { cardId: "world-of-hyatt", name: "World of Hyatt Credit Card", perDollar: 4 },
        { cardId: null, name: "World of Hyatt Business", perDollar: 4 },
      ],
      asOf: "2026-11-24",
      notes: null,
      sources: ["https://world.hyatt.com/content/gp/en/terms.html"],
    },
    {
      program: "IHG One Rewards",
      basePerDollar: 10,
      eligibleSpend: "Room rate and eligible charges, before taxes",
      brandExceptions: [{ brands: ["Staybridge Suites", "Candlewood Suites", "Atwell Suites"], perDollar: 5 }],
      eliteBonuses: [
        { tier: "Silver", percent: 20 },
        { tier: "Gold", percent: 40 },
        { tier: "Platinum", percent: 60 },
        { tier: "Diamond", percent: 100 },
      ],
      cards: [
        { cardId: null, name: "IHG One Rewards Premier", perDollar: 10 },
        { cardId: null, name: "IHG One Rewards Premier Business", perDollar: 10 },
        { cardId: null, name: "IHG One Rewards Traveler", perDollar: 5 },
      ],
      asOf: "2026-11-24",
      notes: null,
      sources: ["https://www.ihg.com/onerewards/content/us/en/support/terms"],
    },
  ],
};
