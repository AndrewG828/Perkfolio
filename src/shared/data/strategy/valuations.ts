// SEED DATA: replaced by verified research before release
import type { ValuationsData } from "./types";

/**
 * What a point is worth, in cents, per program or bank currency (ids in ./programs.ts). Shape: ./types.ts.
 * These seed entries are unverified placeholders: one estimate each, so low = median = high. Bank currencies and
 * the co-brand programs reuse the per-card valuations in src/shared/data/cards.
 */
const seed = (id: string, cents: number) => ({
  id,
  values: [{ source: "Perkfolio estimate", cents, asOf: "2026-11-01", url: "https://perkfolio-app.vercel.app/about#methodology" }],
  low: cents,
  median: cents,
  high: cents,
});

export const valuations: ValuationsData = {
  valuations: [
    seed("amex-mr", 1.7),
    seed("chase-ur", 1.6),
    seed("capital-one", 1.6),
    seed("citi-typ", 1.6),
    seed("bilt", 1.7),
    seed("wells-fargo", 1.2),
    seed("aer-lingus-aerclub", 1.3),
    seed("aeromexico-rewards", 1.0),
    seed("air-canada-aeroplan", 1.4),
    seed("air-france-klm-flying-blue", 1.3),
    seed("ana-mileage-club", 1.4),
    seed("american-aadvantage", 1.3),
    seed("atmos-rewards", 1.3),
    seed("avianca-lifemiles", 1.4),
    seed("british-airways-club", 1.4),
    seed("cathay-pacific-asia-miles", 1.3),
    seed("delta-skymiles", 1.15),
    seed("emirates-skywards", 1.1),
    seed("etihad-guest", 1.2),
    seed("eva-air-infinity-mileagelands", 1.3),
    seed("finnair-plus", 1.3),
    seed("iberia-club", 1.4),
    seed("japan-airlines-mileage-bank", 1.3),
    seed("jetblue-trueblue", 1.3),
    seed("qantas-frequent-flyer", 1.2),
    seed("qatar-privilege-club", 1.4),
    seed("singapore-krisflyer", 1.4),
    seed("southwest-rapid-rewards", 1.3),
    seed("tap-miles-and-go", 1.2),
    seed("thai-royal-orchid-plus", 1.2),
    seed("turkish-miles-and-smiles", 1.3),
    seed("united-mileageplus", 1.2),
    seed("virgin-atlantic-flying-club", 1.4),
    seed("virgin-red", 1.0),
    seed("world-of-hyatt", 1.7),
    seed("marriott-bonvoy", 0.7),
    seed("hilton-honors", 0.5),
    seed("ihg-one-rewards", 0.5),
    seed("choice-privileges", 0.6),
    seed("wyndham-rewards", 0.9),
    seed("accor-live-limitless", 2.0),
    seed("i-prefer", 0.8),
  ],
};
