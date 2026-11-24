import type { ProgramId, ProgramKind } from "./types";

// Display names for every fixed program id (hand-written, not generated): these label a program everywhere, including
// before it has a researched guide in programs.ts, and the aliases map free-text partner names ("British Airways
// Avios", "Iberia Plus") to program ids.

export const programNames: Record<ProgramId, { name: string; kind: ProgramKind; aliases?: string[] }> = {
  "aer-lingus-aerclub": { name: "Aer Lingus AerClub", kind: "airline", aliases: ["AerClub"] },
  "aeromexico-rewards": { name: "Aeromexico Rewards", kind: "airline", aliases: ["Aeroméxico Rewards", "Club Premier"] },
  "air-canada-aeroplan": { name: "Air Canada Aeroplan", kind: "airline", aliases: ["Aeroplan"] },
  "air-france-klm-flying-blue": {
    name: "Air France-KLM Flying Blue",
    kind: "airline",
    aliases: ["Flying Blue", "Flying Blue (Air France-KLM)"],
  },
  "ana-mileage-club": { name: "ANA Mileage Club", kind: "airline" },
  "american-aadvantage": { name: "American AAdvantage", kind: "airline", aliases: ["AAdvantage", "American Airlines AAdvantage"] },
  "atmos-rewards": { name: "Atmos Rewards", kind: "airline", aliases: ["Alaska Atmos Rewards", "Alaska Mileage Plan"] },
  "avianca-lifemiles": { name: "Avianca LifeMiles", kind: "airline", aliases: ["LifeMiles"] },
  "british-airways-club": {
    name: "British Airways Club",
    kind: "airline",
    aliases: ["British Airways Avios", "British Airways Executive Club", "The British Airways Club"],
  },
  "cathay-pacific-asia-miles": {
    name: "Cathay Pacific Asia Miles",
    kind: "airline",
    aliases: ["Asia Miles", "Cathay (Asia Miles)", "Cathay Pacific Cathay", "Cathay Pacific Cathay (Asia Miles)"],
  },
  "copa-connectmiles": { name: "Copa ConnectMiles", kind: "airline", aliases: ["Copa Airlines ConnectMiles", "ConnectMiles"] },
  "delta-skymiles": { name: "Delta SkyMiles", kind: "airline", aliases: ["SkyMiles"] },
  "emirates-skywards": { name: "Emirates Skywards", kind: "airline" },
  "etihad-guest": { name: "Etihad Guest", kind: "airline" },
  "eva-air-infinity-mileagelands": { name: "EVA Air Infinity MileageLands", kind: "airline", aliases: ["Infinity MileageLands"] },
  "finnair-plus": { name: "Finnair Plus", kind: "airline" },
  "iberia-club": { name: "Iberia Club", kind: "airline", aliases: ["Iberia Plus"] },
  "japan-airlines-mileage-bank": {
    name: "Japan Airlines Mileage Bank",
    kind: "airline",
    aliases: ["JAL Mileage Bank", "Japan Airlines JAL Mileage Bank"],
  },
  "jetblue-trueblue": { name: "JetBlue TrueBlue", kind: "airline" },
  "qantas-frequent-flyer": { name: "Qantas Frequent Flyer", kind: "airline" },
  "qatar-privilege-club": { name: "Qatar Airways Privilege Club", kind: "airline", aliases: ["Qatar Privilege Club"] },
  "singapore-krisflyer": { name: "Singapore Airlines KrisFlyer", kind: "airline", aliases: ["Singapore KrisFlyer"] },
  "southwest-rapid-rewards": { name: "Southwest Rapid Rewards", kind: "airline" },
  "tap-miles-and-go": { name: "TAP Miles&Go", kind: "airline", aliases: ["TAP Air Portugal Miles&Go"] },
  "thai-royal-orchid-plus": { name: "Thai Royal Orchid Plus", kind: "airline", aliases: ["Thai Airways Royal Orchid Plus"] },
  "turkish-miles-and-smiles": { name: "Turkish Airlines Miles&Smiles", kind: "airline", aliases: ["Turkish Miles&Smiles"] },
  "united-mileageplus": { name: "United MileagePlus", kind: "airline" },
  "virgin-atlantic-flying-club": { name: "Virgin Atlantic Flying Club", kind: "airline" },
  "virgin-red": { name: "Virgin Red", kind: "airline" },
  "world-of-hyatt": { name: "World of Hyatt", kind: "hotel" },
  "marriott-bonvoy": { name: "Marriott Bonvoy", kind: "hotel" },
  "hilton-honors": { name: "Hilton Honors", kind: "hotel" },
  "ihg-one-rewards": { name: "IHG One Rewards", kind: "hotel" },
  "choice-privileges": { name: "Choice Privileges", kind: "hotel" },
  "wyndham-rewards": { name: "Wyndham Rewards", kind: "hotel" },
  "accor-live-limitless": { name: "Accor Live Limitless", kind: "hotel", aliases: ["ALL Accor Live Limitless", "ALL - Accor Live Limitless", "ALL Accor"] },
  "i-prefer": { name: "I Prefer Hotel Rewards", kind: "hotel", aliases: ["I Prefer", "I Prefer (Preferred Hotels & Resorts)"] },
};

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, "");

const byName = new Map<string, ProgramId>();
for (const [id, p] of Object.entries(programNames) as [ProgramId, (typeof programNames)[ProgramId]][]) {
  for (const n of [id, p.name, ...(p.aliases ?? [])]) byName.set(norm(n), id);
}

/** The program a free-text partner name refers to ("Iberia Plus" → "iberia-club"), or null if we don't know it. */
export function programIdFromName(name: string): ProgramId | null {
  return byName.get(norm(name)) ?? null;
}
