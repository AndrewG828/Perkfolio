// SEED DATA: replaced by verified research before release
import type { BankCurrency } from "./types";

/** One entry per BankCurrencyId (a test checks all six are here), in BANK_CURRENCY_IDS order. */
export const bankCurrencies: BankCurrency[] = [
  {
    id: "amex-mr",
    name: "American Express Membership Rewards",
    shortName: "Membership Rewards",
    issuer: "American Express",
    earnedWith: "Platinum, Gold and Green cards, plus the Business Platinum and Business Gold cards",
    restrictions: "Placeholder: transfers to U.S. airlines carry a small excise-tax offset fee.",
    sourceUrl: "https://global.americanexpress.com/rewards/transfer",
    lastVerified: "2026-11-01",
  },
  {
    id: "chase-ur",
    name: "Chase Ultimate Rewards",
    shortName: "Ultimate Rewards",
    issuer: "Chase",
    earnedWith: "Sapphire Reserve, Sapphire Preferred and Ink Business Preferred",
    restrictions:
      "Placeholder: Freedom cards earn Ultimate Rewards points that only transfer once combined with a Sapphire or Ink Business Preferred account.",
    sourceUrl: "https://www.chase.com/personal/credit-cards/ultimate-rewards",
    lastVerified: "2026-11-01",
  },
  {
    id: "capital-one",
    name: "Capital One Miles",
    shortName: "Capital One Miles",
    issuer: "Capital One",
    earnedWith: "Venture X, Venture X Business and Venture",
    sourceUrl: "https://www.capitalone.com/learn-grow/money-management/venture-miles-transfer-partnerships/",
    lastVerified: "2026-11-01",
  },
  {
    id: "citi-typ",
    name: "Citi ThankYou Rewards",
    shortName: "ThankYou Points",
    issuer: "Citi",
    earnedWith: "Strata Elite and Strata Premier",
    restrictions: "Placeholder: Double Cash and Custom Cash points transfer fully only when combined with a Strata card.",
    sourceUrl: "https://www.thankyou.com/",
    lastVerified: "2026-11-01",
  },
  {
    id: "bilt",
    name: "Bilt Rewards",
    shortName: "Bilt Points",
    issuer: "Bilt",
    earnedWith: "Bilt Blue, Obsidian and Palladium cards",
    sourceUrl: "https://www.bilt.com/",
    lastVerified: "2026-11-01",
  },
  {
    id: "wells-fargo",
    name: "Wells Fargo Rewards",
    shortName: "Wells Fargo Rewards",
    issuer: "Wells Fargo",
    earnedWith: "Autograph Journey",
    restrictions: "Placeholder: only Autograph Journey points can be transferred.",
    sourceUrl: "https://www.wellsfargo.com/rewards/",
    lastVerified: "2026-11-01",
  },
];
