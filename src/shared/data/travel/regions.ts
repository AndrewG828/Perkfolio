/**
 * Destination regions, matching the Points & Miles section's REGIONS (shared/data/points/types.ts on that branch),
 * so tools can link to /points/sweet-spots?region=<Region>. Countries are ISO 3166-1 alpha-2 codes.
 */
export const SWEET_SPOT_REGIONS = [
  "United States",
  "Canada",
  "Mexico & Central America",
  "Caribbean",
  "South America",
  "Hawaii",
  "Europe",
  "Middle East",
  "Africa",
  "South Asia",
  "Indian Ocean",
  "Southeast Asia",
  "East Asia",
  "Japan",
  "Australia & New Zealand",
  "South Pacific",
] as const;
export type SweetSpotRegion = (typeof SWEET_SPOT_REGIONS)[number];

const COUNTRIES: Record<SweetSpotRegion, string> = {
  "United States": "US",
  Canada: "CA PM",
  "Mexico & Central America": "MX GT BZ SV HN NI CR PA",
  Caribbean:
    "AG AI AW BB BL BM BQ BS CU CW DM DO GD GP HT JM KN KY LC MF MQ MS PR SX TC TT VC VG VI",
  "South America": "AR BO BR CL CO EC FK GF GY PE PY SR UY VE",
  Hawaii: "",
  Europe:
    "AD AL AM AT AZ BA BE BG BY CH CY CZ DE DK EE ES FI FO FR GB GE GG GI GL GR HR HU IE IM IS IT JE LI LT LU LV MC MD ME MK MT NL NO PL PT RO RS RU SE SI SJ SK SM TR UA VA XK",
  "Middle East": "AE BH IL IQ IR JO KW LB OM PS QA SA SY YE",
  Africa:
    "AO BF BI BJ BW CD CF CG CI CM CV DJ DZ EG EH ER ET GA GH GM GN GQ GW KE LR LS LY MA MG ML MR MW MZ NA NE NG RW SD SH SL SN SO SS ST SZ TD TG TN TZ UG ZA ZM ZW",
  "South Asia": "AF BD BT IN LK NP PK",
  "Indian Ocean": "CC CX IO KM MU MV RE SC YT",
  "Southeast Asia": "BN ID KH LA MM MY PH SG TH TL VN",
  "East Asia": "CN HK KP KR MN MO TW",
  Japan: "JP",
  "Australia & New Zealand": "AU NF NZ",
  "South Pacific": "AS CK FJ FM GU KI MH MP NC NR NU PF PG PN PW SB TK TO TV UM VU WF WS",
};

const BY_COUNTRY = new Map<string, SweetSpotRegion>(
  (Object.entries(COUNTRIES) as [SweetSpotRegion, string][]).flatMap(([region, codes]) =>
    codes
      .split(/\s+/)
      .filter(Boolean)
      .map((code) => [code, region] as const),
  ),
);

/**
 * The sweet-spot region for a place, from its country code (and coordinates, which pick out Hawaii from the rest of
 * the U.S.). Central Asia and Antarctica have no region.
 */
export function regionFor(country: string, lat?: number, lon?: number): SweetSpotRegion | null {
  const code = country.toUpperCase();
  if (code === "US" && lat !== undefined && lon !== undefined && lat > 18 && lat < 23.5 && lon > -161 && lon < -154) {
    return "Hawaii";
  }
  return BY_COUNTRY.get(code) ?? null;
}

/** Link to the award sweet spots for a region (the page lives in the Points & Miles section). */
export const sweetSpotsHref = (region: SweetSpotRegion, extra: Record<string, string> = {}) =>
  `/points/sweet-spots?${new URLSearchParams({ region, ...extra }).toString()}`;
