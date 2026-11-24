/**
 * Where each travel dataset stands. "verified": research-backed. "seed": unverified stand-in values (the file then
 * starts with a "SEED DATA" header comment and its pages show a "Preview data" notice; a test keeps the two in step).
 * `{ partial }`: verified, but still incomplete; its pages show the text in a "Partly verified" notice, so say what's
 * missing.
 */
export type TravelDataset = "baggage" | "entryRequirements" | "hotelEarning" | "loungeGuestRules";

export type DatasetStatus = "verified" | "seed" | { partial: string };

export const datasetStatus: Record<TravelDataset, DatasetStatus> = {
  baggage: {
    partial:
      "Fees and rules here are checked, but official baggage links are confirmed for only 19 airlines so far. The other 110 are listed without one (16 with a possible link that isn't confirmed yet), so check those on the airline's own site.",
  },
  entryRequirements: "verified",
  hotelEarning: "verified",
  loungeGuestRules: "verified",
};

/** The datasets' preview notices, if any: seed data first, then what's partial. */
export function datasetNotice(datasets: TravelDataset[]): { seed: boolean; partial: string[] } {
  const statuses = datasets.map((d) => datasetStatus[d]);
  return {
    seed: statuses.includes("seed"),
    partial: statuses.flatMap((s) => (typeof s === "object" ? [s.partial] : [])),
  };
}
