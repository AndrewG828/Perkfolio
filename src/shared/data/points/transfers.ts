// SEED DATA: replaced by verified research before release
import type { TransferPartner } from "./types";

const STD = { minimum: 1000, increment: 1000 } as const;

/**
 * Bank currency → program transfers. Both ids must exist. One entry per (currency, program) pair, or several when the
 * ratio depends on the card (each with its own `cards` list).
 */
export const transferPartners: TransferPartner[] = [
  // American Express Membership Rewards
  { currency: "amex-mr", program: "air-canada-aeroplan", from: 1, to: 1, time: "Instant", ...STD },
  { currency: "amex-mr", program: "british-airways-club", from: 1, to: 1, time: "Instant", ...STD, note: "Placeholder: transfer bonuses run a few times a year." },
  { currency: "amex-mr", program: "air-france-klm-flying-blue", from: 1, to: 1, time: "Instant", ...STD },
  { currency: "amex-mr", program: "emirates-skywards", from: 5, to: 4, time: "Instant", ...STD },
  { currency: "amex-mr", program: "marriott-bonvoy", from: 1, to: 1, time: "Instant", ...STD },

  // Chase Ultimate Rewards
  { currency: "chase-ur", program: "air-canada-aeroplan", from: 1, to: 1, time: "Instant", ...STD },
  { currency: "chase-ur", program: "united-mileageplus", from: 1, to: 1, time: "Instant", ...STD },
  { currency: "chase-ur", program: "british-airways-club", from: 1, to: 1, time: "Instant", ...STD },
  { currency: "chase-ur", program: "air-france-klm-flying-blue", from: 1, to: 1, time: "Instant", ...STD },
  {
    currency: "chase-ur",
    program: "world-of-hyatt",
    from: 1,
    to: 1,
    time: "Instant",
    ...STD,
    cards: ["chase-sapphire-reserve", "chase-sapphire-reserve-business"],
  },
  {
    currency: "chase-ur",
    program: "world-of-hyatt",
    from: 4,
    to: 3,
    time: "Instant",
    ...STD,
    cards: ["chase-sapphire-preferred", "chase-ink-business-preferred"],
  },
  { currency: "chase-ur", program: "marriott-bonvoy", from: 1, to: 1, time: "Up to 2 days", ...STD },

  // Capital One Miles
  { currency: "capital-one", program: "air-canada-aeroplan", from: 1, to: 1, time: "Instant", ...STD },
  { currency: "capital-one", program: "british-airways-club", from: 1, to: 1, time: "Instant", ...STD },
  { currency: "capital-one", program: "air-france-klm-flying-blue", from: 1, to: 1, time: "Instant", ...STD },
  { currency: "capital-one", program: "emirates-skywards", from: 2, to: 1.5, time: "Instant", ...STD },

  // Citi ThankYou Points
  { currency: "citi-typ", program: "american-aadvantage", from: 1, to: 1, time: "Instant", ...STD },
  { currency: "citi-typ", program: "air-france-klm-flying-blue", from: 1, to: 1, time: "Instant", ...STD },
  { currency: "citi-typ", program: "emirates-skywards", from: 5, to: 4, time: "Up to 2 days", ...STD },

  // Bilt Points
  { currency: "bilt", program: "american-aadvantage", from: 1, to: 1, time: "Instant", minimum: 2000, increment: 1000 },
  { currency: "bilt", program: "united-mileageplus", from: 1, to: 1, time: "Instant", minimum: 2000, increment: 1000 },
  { currency: "bilt", program: "air-canada-aeroplan", from: 1, to: 1, time: "Instant", minimum: 2000, increment: 1000 },
  { currency: "bilt", program: "world-of-hyatt", from: 1, to: 1, time: "Instant", minimum: 2000, increment: 1000 },

  // Wells Fargo Rewards
  { currency: "wells-fargo", program: "air-france-klm-flying-blue", from: 1, to: 1, time: "Instant", ...STD },
  { currency: "wells-fargo", program: "british-airways-club", from: 1, to: 1, time: "Up to 2 days", ...STD },
];
