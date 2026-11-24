/**
 * Which travel datasets still hold seed (placeholder) data. Pages built on a seed dataset show a "Preview data"
 * notice. When verified research replaces a file, delete its "SEED DATA" header comment and set its flag to false.
 */
export type TravelDataset = "baggage" | "entryRequirements" | "hotelEarning" | "valuations" | "loungeGuestRules";

export const seedData: Record<TravelDataset, boolean> = {
  baggage: true,
  entryRequirements: true,
  hotelEarning: true,
  valuations: true,
  loungeGuestRules: true,
};
