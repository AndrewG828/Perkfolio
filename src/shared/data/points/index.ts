import { BANK_CURRENCY_IDS, type AwardProgram, type BankCurrency, type BankCurrencyId, type Photo, type ProgramId, type Region, type SweetSpot, type TransferPartner } from "./types";
import { bankCurrencies } from "./currencies";
import { awardPrograms } from "./programs";
import { transferPartners } from "./transfers";
import { sweetSpots } from "./sweet-spots";
import { airportPhotos, loungePhotos, regionPhotos } from "./photos";
import { programNames } from "./program-names";

export * from "./types";
export { bankCurrencies, awardPrograms, transferPartners, sweetSpots, regionPhotos, airportPhotos, loungePhotos };
export { programNames, programIdFromName } from "./program-names";

const currencyById = new Map<string, BankCurrency>(bankCurrencies.map((c) => [c.id, c]));
const programById = new Map<string, AwardProgram>(awardPrograms.map((p) => [p.id, p]));

/** Bank currencies in display order (BANK_CURRENCY_IDS), skipping any without data. */
export const currencies: BankCurrency[] = BANK_CURRENCY_IDS.map((id) => currencyById.get(id)).filter(
  (c): c is BankCurrency => Boolean(c),
);

export function getCurrency(id: string): BankCurrency | undefined {
  return currencyById.get(id);
}

export function isCurrencyId(id: string | null | undefined): id is BankCurrencyId {
  return Boolean(id && currencyById.has(id));
}

export function getProgram(id: string): AwardProgram | undefined {
  return programById.get(id);
}

/** A program's display name, even when it has no entry in programs.ts yet. */
export function programName(id: ProgramId): string {
  return programById.get(id)?.name ?? programNames[id]?.name ?? id;
}

/** Distinct currency → program pairs (a pair with card-specific ratios counts once). */
export const partnershipCount = new Set(transferPartners.map((p) => `${p.currency}>${p.program}`)).size;

export function partnersOfCurrency(currency: BankCurrencyId): TransferPartner[] {
  return transferPartners.filter((p) => p.currency === currency);
}

export function partnersOfProgram(program: string): TransferPartner[] {
  return transferPartners.filter((p) => p.program === program);
}

export function sweetSpotsOf(program: string): SweetSpot[] {
  return sweetSpots.filter((s) => s.program === program);
}

export function regionPhoto(region: Region): Photo | undefined {
  return regionPhotos[region];
}

/** Every photo with its credit, for the attribution list on the About page. */
export function allPhotos(): Photo[] {
  const list = [...Object.values(regionPhotos), ...Object.values(airportPhotos), ...Object.values(loungePhotos)];
  return list.filter((p): p is Photo => Boolean(p));
}
