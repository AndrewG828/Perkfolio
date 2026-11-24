import type { Card } from "../types";

/**
 * Display names for bank currencies and loyalty programs, keyed by the ids the strategy data uses (balances,
 * certificates, redemptions, expiration policies, valuations). A local map on purpose: full program data
 * (transfer partners, award charts) lives elsewhere and can replace this later.
 */
export type ProgramKind = "bank" | "airline" | "hotel" | "other";

export interface ProgramInfo {
  id: string;
  name: string;
  kind: ProgramKind;
  /** What the program calls its points, for sentences like "125,000 miles". */
  unit: "points" | "miles" | "Avios";
}

const p = (id: string, name: string, kind: ProgramKind, unit: ProgramInfo["unit"] = "points"): ProgramInfo => ({ id, name, kind, unit });

export const PROGRAMS: ProgramInfo[] = [
  p("amex-mr", "Amex Membership Rewards", "bank"),
  p("chase-ur", "Chase Ultimate Rewards", "bank"),
  p("capital-one", "Capital One Miles", "bank", "miles"),
  p("citi-typ", "Citi ThankYou Points", "bank"),
  p("bilt", "Bilt Rewards", "bank"),
  p("wells-fargo", "Wells Fargo Rewards", "bank"),

  p("aer-lingus-aerclub", "Aer Lingus AerClub", "airline", "Avios"),
  p("aeromexico-rewards", "Aeromexico Rewards", "airline"),
  p("air-canada-aeroplan", "Air Canada Aeroplan", "airline"),
  p("air-france-klm-flying-blue", "Air France-KLM Flying Blue", "airline", "miles"),
  p("ana-mileage-club", "ANA Mileage Club", "airline", "miles"),
  p("american-aadvantage", "American AAdvantage", "airline", "miles"),
  p("atmos-rewards", "Atmos Rewards", "airline"),
  p("avianca-lifemiles", "Avianca LifeMiles", "airline", "miles"),
  p("british-airways-club", "British Airways Club", "airline", "Avios"),
  p("cathay-pacific-asia-miles", "Cathay Pacific Asia Miles", "airline", "miles"),
  p("delta-skymiles", "Delta SkyMiles", "airline", "miles"),
  p("emirates-skywards", "Emirates Skywards", "airline", "miles"),
  p("etihad-guest", "Etihad Guest", "airline", "miles"),
  p("eva-air-infinity-mileagelands", "EVA Air Infinity MileageLands", "airline", "miles"),
  p("finnair-plus", "Finnair Plus", "airline", "Avios"),
  p("iberia-club", "Iberia Club", "airline", "Avios"),
  p("japan-airlines-mileage-bank", "Japan Airlines Mileage Bank", "airline", "miles"),
  p("jetblue-trueblue", "JetBlue TrueBlue", "airline"),
  p("qantas-frequent-flyer", "Qantas Frequent Flyer", "airline"),
  p("qatar-privilege-club", "Qatar Airways Privilege Club", "airline", "Avios"),
  p("singapore-krisflyer", "Singapore Airlines KrisFlyer", "airline", "miles"),
  p("southwest-rapid-rewards", "Southwest Rapid Rewards", "airline"),
  p("tap-miles-and-go", "TAP Miles&Go", "airline", "miles"),
  p("thai-royal-orchid-plus", "Thai Royal Orchid Plus", "airline", "miles"),
  p("turkish-miles-and-smiles", "Turkish Airlines Miles&Smiles", "airline", "miles"),
  p("united-mileageplus", "United MileagePlus", "airline", "miles"),
  p("virgin-atlantic-flying-club", "Virgin Atlantic Flying Club", "airline"),
  p("virgin-red", "Virgin Red", "other"),

  p("world-of-hyatt", "World of Hyatt", "hotel"),
  p("marriott-bonvoy", "Marriott Bonvoy", "hotel"),
  p("hilton-honors", "Hilton Honors", "hotel"),
  p("ihg-one-rewards", "IHG One Rewards", "hotel"),
  p("choice-privileges", "Choice Privileges", "hotel"),
  p("wyndham-rewards", "Wyndham Rewards", "hotel"),
  p("accor-live-limitless", "Accor Live Limitless", "hotel"),
  p("i-prefer", "I Prefer Hotel Rewards", "hotel"),
];

const byId = new Map(PROGRAMS.map((x) => [x.id, x]));

export const programInfo = (id: string): ProgramInfo | undefined => byId.get(id);
export const programName = (id: string): string => byId.get(id)?.name ?? id;
export const programUnit = (id: string | undefined): string => (id && byId.get(id)?.unit) || "points";

export const programKindLabels: Record<ProgramKind, string> = {
  bank: "Bank points",
  airline: "Airlines",
  hotel: "Hotels",
  other: "Other programs",
};

/** Programs grouped for pickers, in display order. */
export const programGroups = (Object.keys(programKindLabels) as ProgramKind[]).map((kind) => ({
  kind,
  label: programKindLabels[kind],
  programs: PROGRAMS.filter((x) => x.kind === kind),
}));

/** The currency or program a card earns, matched on its rewards currency ("Chase Ultimate Rewards points"). */
const EARNS: [RegExp, string][] = [
  [/Membership Rewards/i, "amex-mr"],
  [/Ultimate Rewards/i, "chase-ur"],
  [/Capital One miles/i, "capital-one"],
  [/ThankYou/i, "citi-typ"],
  [/Bilt Points/i, "bilt"],
  [/Wells Fargo Rewards/i, "wells-fargo"],
  [/SkyMiles/i, "delta-skymiles"],
  [/MileagePlus/i, "united-mileageplus"],
  [/AAdvantage/i, "american-aadvantage"],
  [/Rapid Rewards/i, "southwest-rapid-rewards"],
  [/Atmos/i, "atmos-rewards"],
  [/Hilton Honors/i, "hilton-honors"],
  [/Marriott Bonvoy/i, "marriott-bonvoy"],
  [/World of Hyatt/i, "world-of-hyatt"],
];

export function programForCard(card: Pick<Card, "rewardsCurrency" | "issuer">): string | undefined {
  const hit = EARNS.find(([re]) => re.test(card.rewardsCurrency));
  if (hit) return hit[1];
  // Wells Fargo's cash-back cards earn into the same Wells Fargo Rewards account.
  if (card.issuer === "Wells Fargo" && /cash rewards/i.test(card.rewardsCurrency)) return "wells-fargo";
  return undefined;
}

/** Co-brand names that don't spell out the program: Barclays' AAdvantage Aviator cards, a "Hyatt" card. */
const NAME_EARNS: [RegExp, string][] = [
  [/\bAviator\b/i, "american-aadvantage"],
  [/\bHyatt\b/i, "world-of-hyatt"],
];

/**
 * The program a card we don't list earns, read from the name the user gave it in their card history ("AAdvantage
 * Aviator Red" → American AAdvantage). Undefined when the name doesn't say.
 */
export function programForName(name: string): string | undefined {
  return (EARNS.find(([re]) => re.test(name)) ?? NAME_EARNS.find(([re]) => re.test(name)))?.[1];
}

/** Issuers offered in the application editor for cards that aren't in our dataset. */
export const ISSUERS = [
  "American Express",
  "Chase",
  "Capital One",
  "Citi",
  "Bank of America",
  "Barclays",
  "Wells Fargo",
  "U.S. Bank",
  "Discover",
  "TD Bank",
  "Bilt",
  "Synchrony",
  "Goldman Sachs",
  "Navy Federal",
];
