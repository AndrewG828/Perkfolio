import type { Card } from "../types";
// The fixed lists and names only (not the Points & Miles index), so the tracker and Start here stay small.
import { BANK_CURRENCY_IDS, PROGRAM_BRIDGES, PROGRAM_IDS } from "../points/types";
import { bankCurrencies } from "../points/currencies";
import { programNames } from "../points/program-names";
import { currencyOfCard } from "../../lib/card-currency";

/**
 * Bank currencies and loyalty programs as the strategy tools (balances, certificates, redemptions, expiration policies)
 * list them, derived from the Points & Miles data so names and ids can't drift: every bank currency in
 * BANK_CURRENCY_IDS (named as in points/currencies.ts) and every program in PROGRAM_IDS (named as in
 * points/program-names.ts). A bridge program spent through another (Virgin Red) is grouped as "other".
 */
export type ProgramKind = "bank" | "airline" | "hotel" | "other";

export interface ProgramInfo {
  id: string;
  name: string;
  kind: ProgramKind;
  /** What the program calls its points, for sentences like "125,000 miles". */
  unit: "points" | "miles" | "Avios";
}

/** The unit, read from what the program calls its currency: "Avios", "SkyMiles" or "Asia Miles" → miles, else points. */
const unitOf = (currency: string): ProgramInfo["unit"] => (/\bavios\b/i.test(currency) ? "Avios" : /miles/i.test(currency) ? "miles" : "points");

export const PROGRAMS: ProgramInfo[] = [
  ...BANK_CURRENCY_IDS.map((id): ProgramInfo => {
    const name = bankCurrencies.find((c) => c.id === id)?.name ?? id;
    return { id, name, kind: "bank", unit: unitOf(name) };
  }),
  ...PROGRAM_IDS.map((id): ProgramInfo => {
    const p = programNames[id];
    const kind: ProgramKind = PROGRAM_BRIDGES.some((b) => b.from === id) ? "other" : p.kind;
    return { id, name: p.name, kind, unit: p.unit ?? unitOf(p.name) };
  }),
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

/** The currency or program a card we don't list earns, matched on the name the user gave it. */
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

/**
 * The currency or program a card we list earns, as every page classifies it (currencyOfCard): plain cash back (Active
 * Cash) earns none, and a card whose transfers need another card (Savor) earns its bank's points.
 */
export function programForCard(card: Pick<Card, "id" | "rewardsCurrency">): string | undefined {
  const p = currencyOfCard(card);
  return p ? (p.kind === "currency" ? p.currency : p.program) : undefined;
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
