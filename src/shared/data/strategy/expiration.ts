// SEED DATA: replaced by verified research before release
import type { ExpirationData } from "./types";

/**
 * When points expire, per program or bank currency (ids in ./programs.ts). Shape: ./types.ts.
 * These seed entries are unverified placeholders.
 */
const AS_OF = "2026-11-01";
const bank = (id: string) => ({
  id,
  rule: "while-account-open" as const,
  activity: "Keep at least one card that earns them open",
  notes: "Close your last card that earns these and unredeemed points can be forfeited.",
  asOf: AS_OF,
  sources: [],
});
const never = (id: string) => ({
  id,
  rule: "never" as const,
  activity: "None needed",
  notes: "They don't expire while the account is open.",
  asOf: AS_OF,
  sources: [],
});
const inactivity = (id: string, months: number) => ({
  id,
  rule: "inactivity" as const,
  months,
  activity: "Earning or redeeming any points",
  notes: `Points expire after ${months} months with no activity.`,
  asOf: AS_OF,
  sources: [],
});
const fixedTerm = (id: string, months: number) => ({
  id,
  rule: "fixed-term" as const,
  months,
  activity: "Activity doesn't extend them",
  notes: `Each batch expires ${months} months after it was earned.`,
  asOf: AS_OF,
  sources: [],
});

export const expirationPolicies: ExpirationData = {
  programs: [
    bank("amex-mr"),
    bank("chase-ur"),
    bank("capital-one"),
    bank("citi-typ"),
    bank("bilt"),
    bank("wells-fargo"),
    inactivity("aer-lingus-aerclub", 36),
    inactivity("aeromexico-rewards", 24),
    inactivity("air-canada-aeroplan", 18),
    inactivity("air-france-klm-flying-blue", 24),
    fixedTerm("ana-mileage-club", 36),
    inactivity("american-aadvantage", 24),
    inactivity("atmos-rewards", 24),
    inactivity("avianca-lifemiles", 12),
    inactivity("british-airways-club", 36),
    inactivity("cathay-pacific-asia-miles", 18),
    never("delta-skymiles"),
    fixedTerm("emirates-skywards", 36),
    inactivity("etihad-guest", 18),
    fixedTerm("eva-air-infinity-mileagelands", 36),
    inactivity("finnair-plus", 24),
    inactivity("iberia-club", 36),
    fixedTerm("japan-airlines-mileage-bank", 36),
    never("jetblue-trueblue"),
    inactivity("qantas-frequent-flyer", 18),
    inactivity("qatar-privilege-club", 36),
    fixedTerm("singapore-krisflyer", 36),
    never("southwest-rapid-rewards"),
    fixedTerm("tap-miles-and-go", 36),
    fixedTerm("thai-royal-orchid-plus", 36),
    fixedTerm("turkish-miles-and-smiles", 36),
    never("united-mileageplus"),
    never("virgin-atlantic-flying-club"),
    inactivity("virgin-red", 24),
    inactivity("world-of-hyatt", 24),
    inactivity("marriott-bonvoy", 24),
    never("hilton-honors"),
    inactivity("ihg-one-rewards", 12),
    inactivity("choice-privileges", 18),
    inactivity("wyndham-rewards", 18),
    inactivity("accor-live-limitless", 12),
    inactivity("i-prefer", 12),
  ],
};
