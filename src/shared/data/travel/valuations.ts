// SEED DATA: replaced by verified research before release
import type { ValuationsData } from "./types";

/**
 * Cents-per-point valuations: several published values per program or currency, with their low, median and high.
 * The hotel calculator values points at the median. This seed copy repeats Perkfolio's own card valuations
 * (see /about#methodology) until the researched set lands; ids match the Points & Miles program and currency ids.
 */
const ours = (cents: number) => ({ source: "Perkfolio", cents, asOf: "2026-11-24", url: "/about#methodology" });

export const valuations: ValuationsData = {
  valuations: [
    { id: "marriott-bonvoy", values: [ours(0.7)], low: 0.7, median: 0.7, high: 0.7 },
    { id: "hilton-honors", values: [ours(0.5)], low: 0.5, median: 0.5, high: 0.5 },
    { id: "world-of-hyatt", values: [ours(1.7)], low: 1.7, median: 1.7, high: 1.7 },
    { id: "ihg-one-rewards", values: [ours(0.5)], low: 0.5, median: 0.5, high: 0.5 },
    { id: "amex-mr", values: [ours(1.7)], low: 1.7, median: 1.7, high: 1.7 },
    { id: "chase-ur", values: [ours(1.5), ours(1.7)], low: 1.5, median: 1.6, high: 1.7 },
    { id: "capital-one", values: [ours(1.6)], low: 1.6, median: 1.6, high: 1.6 },
    { id: "citi-typ", values: [ours(1.6)], low: 1.6, median: 1.6, high: 1.6 },
    { id: "bilt", values: [ours(1.7)], low: 1.7, median: 1.7, high: 1.7 },
    { id: "wells-fargo", values: [ours(1.2)], low: 1.2, median: 1.2, high: 1.2 },
  ],
};
