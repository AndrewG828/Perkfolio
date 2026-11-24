import {
  ALLIANCES,
  BANK_CURRENCY_IDS,
  PROGRAM_BRIDGES,
  PROGRAM_IDS,
  type Alliance,
  type AwardProgram,
  type BankCurrency,
  type BankCurrencyId,
  type BookableAirline,
  type BookingRules,
  type HotelToAirline,
  type HotelTransferRule,
  type PartnerChange,
  type Photo,
  type ProgramBookingNote,
  type ProgramId,
  type ProgramKind,
  type Region,
  type SweetSpot,
  type TransferPartner,
} from "./types";
import { bankCurrencies } from "./currencies";
import { awardPrograms } from "./programs";
import { changeLogApplied, transferPartners } from "./transfers";
import { sweetSpots } from "./sweet-spots";
import { airportPhotos, loungePhotos, regionPhotos } from "./photos";
import { programNames } from "./program-names";
import { bookingRules } from "./booking-rules";
import { bookableAirlines, programBookingNotes, whoCanBookAsOf, whoCanBookCaveats } from "./airlines";
import { pointValues, unvaluedIds, valuationEditions } from "./valuations";
import { hotelToAirline, hotelTransferRules } from "./hotel-transfers";
import { transferBonuses } from "./transfer-bonuses";
import { partnerChanges } from "./partner-changes";

export * from "./types";
export {
  bankCurrencies,
  awardPrograms,
  transferPartners,
  changeLogApplied,
  sweetSpots,
  regionPhotos,
  airportPhotos,
  loungePhotos,
  bookingRules,
  bookableAirlines,
  programBookingNotes,
  whoCanBookCaveats,
  whoCanBookAsOf,
  pointValues,
  unvaluedIds,
  valuationEditions,
  hotelToAirline,
  hotelTransferRules,
  transferBonuses,
  partnerChanges,
};
export { programNames, programIdFromName } from "./program-names";
export { transferPartnerNames } from "./card-partners";

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

export function isProgramId(id: string | null | undefined): id is ProgramId {
  return Boolean(id && (PROGRAM_IDS as readonly string[]).includes(id));
}

/** The researched guide for a program, when there is one. */
export function getProgram(id: string): AwardProgram | undefined {
  return programById.get(id);
}

/** A program's display name, even when it has no guide yet. */
export function programName(id: ProgramId): string {
  return programById.get(id)?.name ?? programNames[id]?.name ?? id;
}

// ------------------------------------------------------------------------------------------------------- Programs

/** What every view needs to show a program, guide or not. */
export interface ProgramRef {
  id: ProgramId;
  name: string;
  kind: ProgramKind;
  alliance?: Alliance;
  /** What its points are called; known only for programs with a guide. */
  currency?: string;
  /** The researched guide, when there is one. */
  guide?: AwardProgram;
}

const ownAirline = new Map<string, BookableAirline>();
for (const a of bookableAirlines) if (a.ownProgram && !ownAirline.has(a.ownProgram)) ownAirline.set(a.ownProgram, a);

export function programRef(id: ProgramId): ProgramRef {
  const guide = programById.get(id);
  return {
    id,
    name: programName(id),
    kind: guide?.kind ?? programNames[id].kind,
    // Without a guide, the alliance of the airline that runs the program (from the who-can-book research).
    alliance: guide ? guide.alliance : ownAirline.get(id)?.alliance,
    currency: guide?.currency,
    guide,
  };
}

/**
 * Every program we have something on (a guide, a bank transfer, booking rules, a value or airlines it books), sorted
 * airlines first, then by name. Programs without a guide still get a page and a row in the charts.
 */
export const programList: ProgramRef[] = PROGRAM_IDS.filter(
  (id) =>
    programById.has(id) ||
    transferPartners.some((p) => p.program === id) ||
    bookingRules.some((r) => r.program === id) ||
    pointValues.some((v) => v.id === id) ||
    bookableAirlines.some((a) => a.bookableWith.includes(id)),
)
  .map(programRef)
  .sort((a, b) => Number(a.kind === "hotel") - Number(b.kind === "hotel") || a.name.localeCompare(b.name));

/** True when /points/programs/<id> exists. */
export function hasProgramPage(id: string): id is ProgramId {
  return programList.some((p) => p.id === id);
}

// ------------------------------------------------------------------------------------------------------ Transfers

/** Distinct currency → program pairs (a pair with card-specific ratios counts once). */
export const partnershipCount = new Set(transferPartners.map((p) => `${p.currency}>${p.program}`)).size;

export function partnersOfCurrency(currency: BankCurrencyId): TransferPartner[] {
  return transferPartners.filter((p) => p.currency === currency);
}

export function partnersOfProgram(program: string): TransferPartner[] {
  return transferPartners.filter((p) => p.program === program);
}

/**
 * The partner-change log entry behind a row's `changedOn` (an added partner, a changed ratio, or a scheduled change
 * once it has taken effect), so pages can mark the row "Added Nov 18, 2026" or "Ratio changed Mar 1, 2026".
 */
export function partnerChangeOf(p: Pick<TransferPartner, "currency" | "program" | "changedOn">): PartnerChange | undefined {
  if (!p.changedOn) return undefined;
  return partnerChanges.find((c) => c.currency === p.currency && c.program === p.program && c.date === p.changedOn);
}

export function sweetSpotsOf(program: string): SweetSpot[] {
  return sweetSpots.filter((s) => s.program === program);
}

// ------------------------------------------------------------------------------------- Rules, airlines and values

export function bookingRulesOf(program: string): BookingRules | undefined {
  return bookingRules.find((r) => r.program === program);
}

export function getAirline(iata: string | null | undefined): BookableAirline | undefined {
  const code = iata?.toUpperCase();
  return bookableAirlines.find((a) => a.iata === code);
}

/**
 * Airlines whose award seats a program can book, its own airline first, then by alliance and name. A bridge program
 * (Virgin Red) books whatever the program it spends through (Flying Club) books.
 */
export function airlinesBookableWith(program: ProgramId): BookableAirline[] {
  const order = (a: BookableAirline) => (a.ownProgram === program ? -1 : a.alliance ? ALLIANCES.indexOf(a.alliance) : ALLIANCES.length);
  const through = PROGRAM_BRIDGES.filter((b) => b.from === program).map((b) => b.to);
  return bookableAirlines
    .filter((a) => a.bookableWith.includes(program) || through.some((p) => a.bookableWith.includes(p)))
    .sort((a, b) => order(a) - order(b) || a.name.localeCompare(b.name));
}

export function bookingNoteOf(program: string): ProgramBookingNote | undefined {
  return programBookingNotes.find((n) => n.program === program);
}

export function hotelRoutesFrom(hotel: ProgramId): HotelToAirline[] {
  return hotelToAirline.filter((r) => r.from === hotel);
}

export function hotelRoutesInto(program: string): HotelToAirline[] {
  return hotelToAirline.filter((r) => r.program === program);
}

export function hotelRuleOf(hotel: string): HotelTransferRule | undefined {
  return hotelTransferRules.find((r) => r.from === hotel);
}

// --------------------------------------------------------------------------------------------------------- Photos

export function regionPhoto(region: Region): Photo | undefined {
  return regionPhotos[region];
}

/**
 * Region photos that show one place's landmark (the Eiffel Tower, New York's skyline), by photo title, with the
 * destinations they suit: the photo heads a sweet spot only when the spot goes there, so a Madrid card never wears
 * Paris. Scenery (a Caribbean beach, a Canadian lake) suits any spot in its region. A new landmark photo needs an entry.
 */
const LANDMARK_PLACES: Record<string, string[]> = {
  "Paris - The Eiffel Tower in spring - 2307": ["Paris"],
  "Long Island City New York May 2015 panorama 3": ["New York", "Newark"],
  "International Commerce Centre on Victoria Harbour": ["Hong Kong"],
  // The Taj Mahal, Machu Picchu and Table Mountain stand for their countries: India, Peru, South Africa.
  "Taj Mahal, Agra, India edit2": ["Delhi", "Mumbai", "Bengaluru", "Chennai"],
  "Machu Picchu, Perú, 2015-07-30, DD 47": ["Lima", "Cusco"],
  "Cape Town (ZA), Table Mountain -- 2024 -- 2825": ["Cape Town", "Johannesburg"],
  "Tulum - God of the Winds Temple 04": ["Tulum", "Riviera Maya", "Cancún", "Cancun"],
};

/** The photo heading a sweet spot: its region's, unless that photo is another place's landmark (LANDMARK_PLACES). */
export function sweetSpotPhoto(spot: Pick<SweetSpot, "to" | "destinations">): Photo | undefined {
  const photo = regionPhotos[spot.to];
  const places = photo ? LANDMARK_PLACES[photo.title] : undefined;
  if (!photo || !places) return photo;
  return spot.destinations.some((d) => places.some((p) => d.includes(p))) ? photo : undefined;
}

/** The photo in the header of an airport's lounge page, if research found one. */
export function airportPhoto(code: string): Photo | undefined {
  return airportPhotos[code];
}

/** Every credited photo the data has (a test checks each file under public/photos is one of them). */
export function allPhotos(): Photo[] {
  const list = [...Object.values(regionPhotos), ...Object.values(airportPhotos), ...Object.values(loungePhotos)];
  return list.filter((p): p is Photo => Boolean(p));
}
