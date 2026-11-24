import type { Destination } from "@/shared/data/travel/types";
import { fold } from "@/shared/lib/airports";

/**
 * Searching the entry-requirements list: country names, ISO codes, the names people actually type ("UK",
 * "Turkey", "Holland") and well-known places inside a country ("Dubai", "Bali"), plus countries covered by a group
 * entry (Slovenia, in the Schengen Area).
 */

/**
 * Other names for a country, by ISO code: `names` are alternate names for the country itself; `places` are
 * destinations inside it, shown as "Includes Dubai" on the row they find.
 */
export const COUNTRY_ALIASES: Record<string, { names?: string[]; places?: string[] }> = {
  GB: { names: ["UK", "U.K.", "Britain", "Great Britain", "England", "Scotland", "Wales", "Northern Ireland"] },
  TR: { names: ["Turkey"] },
  CZ: { names: ["Czech Republic"] },
  NL: { names: ["Holland"] },
  VN: { names: ["Viet Nam"] },
  AE: { names: ["UAE", "U.A.E.", "Emirates"], places: ["Dubai", "Abu Dhabi"] },
  ID: { places: ["Bali"] },
  TZ: { places: ["Zanzibar"] },
  KR: { names: ["Korea", "Republic of Korea"] },
  MO: { names: ["Macao"] },
  LC: { names: ["St Lucia", "St. Lucia"] },
  BS: { names: ["The Bahamas"] },
  DO: { places: ["Punta Cana"] },
  MX: { places: ["Cancún", "Cabo", "Los Cabos"] },
  TH: { places: ["Phuket"] },
  EC: { places: ["Galápagos"] },
};

/**
 * What the row leaves out for a place inside a country: its own entry charges, which the research flagged to check
 * next but couldn't confirm. Shown on the row a search for the place finds.
 */
export const PLACE_NOTES: Record<string, string> = {
  Bali: "Bali has its own tourist levy, which this guide doesn't cover yet. Check it before you go.",
  "Galápagos": "The Galápagos have their own entry fees and limits, which this guide doesn't cover yet. Check them before you go.",
};

/**
 * The United States, its territories and its states (with a few islands and cities people search for): searching for
 * one says this guide is about going abroad, rather than "we're adding more countries".
 */
const US_PLACES: Record<"country" | "territory" | "state", string[]> = {
  country: ["United States", "United States of America", "USA", "U.S.A.", "US", "U.S.", "America"],
  territory: [
    "Puerto Rico", "Guam", "U.S. Virgin Islands", "US Virgin Islands", "USVI", "St. Thomas", "St. Croix", "St. John",
    "Northern Mariana Islands", "Saipan", "American Samoa",
  ],
  state: [
    "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut", "Delaware", "Florida", "Georgia",
    "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland",
    "Massachusetts", "Michigan", "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire",
    "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon",
    "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota", "Tennessee", "Texas", "Utah", "Vermont", "Virginia",
    "Washington", "West Virginia", "Wisconsin", "Wyoming", "Washington DC", "Washington, D.C.", "District of Columbia",
    "Maui", "Oahu", "Kauai", "Honolulu",
  ],
};

/** Lowercase, accent-free, with spaces and punctuation dropped: "St. Lucia" and "st lucia" both read "stlucia". */
const squash = (s: string) => fold(s).replace(/[^a-z0-9]/g, "");

/**
 * The U.S. place a search names ("Hawaii", "Puerto Rico", "US"), when it names one in full: those aren't foreign
 * destinations for U.S. citizens. Only asked when no destination matches (Georgia the country comes first).
 */
export function usPlaceFor(query: string): { name: string; kind: "country" | "territory" | "state" } | null {
  const q = squash(query.trim());
  if (!q) return null;
  for (const kind of ["country", "territory", "state"] as const) {
    const name = US_PLACES[kind].find((p) => squash(p) === q);
    if (name) return { name, kind };
  }
  return null;
}

export interface DestinationMatches {
  matching: Destination[];
  /** Row key → what the search found inside it ("Slovenia" in the Schengen Area, "Dubai" in the UAE). */
  via: Map<string, string>;
}

/**
 * Destinations matching a search, A to Z. A country's own name, code or alternate name comes first; failing that, a
 * group entry whose member matches. `nameOf` names an ISO code (the browser's Intl.DisplayNames on the page).
 */
export function searchDestinations(
  destinations: Destination[],
  query: string,
  keyOf: (d: Destination) => string,
  nameOf: (iso2: string) => string,
): DestinationMatches {
  const q = squash(query.trim());
  const via = new Map<string, string>();
  const sorted = [...destinations].sort((a, b) => a.country.localeCompare(b.country));
  if (!q) return { matching: sorted, via };
  // One or two letters are a code or a short name ("US", "UK", "jp"), else the start of a name ("ja" → Jamaica,
  // Japan), never letters inside one ("us" isn't Australia or Austria).
  const short = q.length <= 2;
  const hit = (s: string) => squash(s).includes(q);
  // Other names match from their start ("UK" isn't found inside "Phuket"), and in full when the query is short.
  const starts = (s: string) => (short ? squash(s) === q : squash(s).startsWith(q));
  const direct = sorted.filter((d) => {
    if (d.iso2?.toLowerCase() === q || (!short && hit(d.country))) return true;
    const alias = d.iso2 ? COUNTRY_ALIASES[d.iso2] : undefined;
    if (alias?.names?.some(starts)) return true;
    const place = alias?.places?.find(starts);
    if (place) via.set(keyOf(d), place);
    return Boolean(place);
  });
  if (direct.length > 0) return { matching: direct, via };
  // A country without its own row, inside a group entry (Slovenia → Schengen Area), by name, code or alternate name.
  const inGroup = (found: (code: string) => boolean) => {
    const map = new Map<string, string>();
    const matching = sorted.filter((d) => {
      const member = d.members?.find(found);
      if (member) map.set(keyOf(d), nameOf(member));
      return Boolean(member);
    });
    return { matching, via: map };
  };
  if (!short) return inGroup((code) => hit(nameOf(code)) || Boolean(COUNTRY_ALIASES[code]?.names?.some(starts)));
  // Short: a member's code ("si"), then names that start with the letters, then members' names that do.
  const byCode = inGroup((code) => code.toLowerCase() === q);
  if (byCode.matching.length > 0) return byCode;
  const prefixed = sorted.filter((d) => squash(d.country).startsWith(q));
  if (prefixed.length > 0) return { matching: prefixed, via };
  return inGroup((code) => squash(nameOf(code)).startsWith(q));
}
