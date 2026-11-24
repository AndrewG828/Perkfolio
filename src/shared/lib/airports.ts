import { flightMinutes, haversineKm, kmToMiles, kmToNm } from "./geo";

/**
 * The world airport list behind the flight distance tool: public/data/airports.json, built from OurAirports
 * (public domain) by scripts/build-airports.ts and fetched by the browser only when a page needs it.
 */

export const AIRPORT_FIELDS = ["code", "name", "city", "country", "lat", "lon"] as const;
export type AirportRow = [code: string, name: string, city: string, country: string, lat: number, lon: number];

export interface AirportsFile {
  source: string;
  license: string;
  url: string;
  fields: typeof AIRPORT_FIELDS;
  /** Largest airports first, so list order breaks search ties sensibly. */
  airports: AirportRow[];
}

export interface WorldAirport {
  /** IATA code, e.g. "JFK". */
  code: string;
  name: string;
  city: string;
  /** ISO 3166-1 alpha-2. */
  country: string;
  lat: number;
  lon: number;
  /** Position in the file (0 = most important). */
  rank: number;
  /** Lowercased, accent-free "code city name" for matching. */
  search: string;
}

/** Lowercase without accents, so "sao paulo" finds "São Paulo". */
export const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

export function decodeAirports(file: AirportsFile): WorldAirport[] {
  return file.airports.map(([code, name, city, country, lat, lon], rank) => ({
    code,
    name,
    city,
    country,
    lat,
    lon,
    rank,
    search: fold(`${code} ${city} ${name}`),
  }));
}

/**
 * Busy hubs, listed first among equally good matches ("London" → LHR before Southend). OurAirports has no traffic
 * figures, so this short list stands in for them.
 */
const HUBS = new Set(
  (
    "ATL DFW DEN ORD LAX JFK LAS MCO MIA CLT SEA PHX EWR SFO IAH BOS FLL MSP LGA DTW PHL SLC BWI DCA SAN IAD TPA BNA " +
    "AUS HNL PDX RDU SJU LHR CDG AMS FRA IST MAD BCN MUC FCO DUB ZRH CPH LIS DXB DOH AUH HND NRT ICN PEK PVG HKG TPE " +
    "SIN BKK KUL DEL BOM SYD MEL AKL YYZ YVR YUL MEX CUN GRU EZE BOG LIM SCL JNB"
  ).split(" "),
);

/**
 * Places people search by that OurAirports files under other city names ("Tokyo" for Narita, "New York" for Newark,
 * "Hawaii"), with their main airports, busiest first.
 */
export const METRO_AIRPORTS: Record<string, string[]> = {
  "new york": ["JFK", "EWR", "LGA"],
  "new york city": ["JFK", "EWR", "LGA"],
  nyc: ["JFK", "EWR", "LGA"],
  tokyo: ["HND", "NRT"],
  dallas: ["DFW", "DAL"],
  "dallas fort worth": ["DFW", "DAL"],
  "bay area": ["SFO", "OAK", "SJC"],
  "san francisco bay area": ["SFO", "OAK", "SJC"],
  washington: ["IAD", "DCA", "BWI"],
  "washington dc": ["IAD", "DCA", "BWI"],
  dc: ["IAD", "DCA", "BWI"],
  chicago: ["ORD", "MDW"],
  houston: ["IAH", "HOU"],
  "los angeles": ["LAX", "BUR", "LGB", "SNA"],
  hawaii: ["HNL", "OGG", "KOA", "LIH", "ITO"],
  oahu: ["HNL"],
  maui: ["OGG"],
  "big island": ["KOA", "ITO"],
  kauai: ["LIH"],
  london: ["LHR", "LGW", "STN", "LTN", "LCY"],
  paris: ["CDG", "ORY"],
  milan: ["MXP", "LIN"],
  seoul: ["ICN", "GMP"],
  osaka: ["KIX", "ITM"],
  shanghai: ["PVG", "SHA"],
  beijing: ["PEK", "PKX"],
  bangkok: ["BKK", "DMK"],
  istanbul: ["IST", "SAW"],
  "sao paulo": ["GRU", "CGH"],
  "buenos aires": ["EZE", "AEP"],
};

/** How a metro area reads on screen, where its search name won't do ("nyc" → "New York"); others are title-cased. */
const METRO_NAMES: Record<string, string> = {
  "new york city": "New York",
  nyc: "New York",
  "dallas fort worth": "Dallas–Fort Worth",
  "san francisco bay area": "Bay Area",
  "washington dc": "Washington, D.C.",
  dc: "Washington, D.C.",
  "sao paulo": "São Paulo",
};

/** METRO_AIRPORTS entries a search names: in full, or by at least 3 letters of the start. */
function metrosFor(query: string): [string, string[]][] {
  const plain = fold(query.trim()).replace(/[^a-z0-9]+/g, " ").trim();
  if (!plain) return [];
  return Object.entries(METRO_AIRPORTS).filter(([name]) => name === plain || (plain.length >= 3 && name.startsWith(plain)));
}

/**
 * For airports a search finds through a metro area, the area's name by airport code ("milan" → MXP and LIN: "Milan"),
 * to label them by the place searched rather than the town OurAirports files them under (Ferno, Segrate).
 */
export function metroNamesFor(query: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const [name, codes] of metrosFor(query)) {
    const shown = METRO_NAMES[name] ?? name.replace(/(^|\s)([a-z])/g, (_, space: string, c: string) => `${space}${c.toUpperCase()}`);
    for (const c of codes) if (!out.has(c)) out.set(c, shown);
  }
  return out;
}

/**
 * Airports matching what someone typed: an exact code first, then a metro area's main airports ("Tokyo": Haneda and
 * Narita), city and name matches, then anything that contains every word. Ties go to busy hubs, then the file's order
 * (bigger airports first).
 */
export function searchAirports(list: WorldAirport[], query: string, limit = 8): WorldAirport[] {
  const q = fold(query.trim());
  if (!q) return [];
  const words = q.split(/[\s,]+/).filter(Boolean);
  // A metro name typed in full, or at least 3 letters of one: its airports, in the listed order.
  const metro = new Map<string, number>();
  for (const [, codes] of metrosFor(q)) codes.forEach((c, i) => metro.has(c) || metro.set(c, i));
  const score = (a: WorldAirport): number => {
    const code = a.code.toLowerCase();
    if (code === q) return 0;
    const m = metro.get(a.code);
    if (m !== undefined) return 0.5 + m / 100;
    const city = fold(a.city);
    const name = fold(a.name);
    if (city === q) return 1;
    if (q.length <= 3 && code.startsWith(q)) return 2;
    if (city.startsWith(q)) return 3;
    if (name.startsWith(q) || name.includes(` ${q}`)) return 4;
    if (words.every((w) => a.search.includes(w))) return 5;
    return -1;
  };
  const hits: { a: WorldAirport; s: number }[] = [];
  for (const a of list) {
    const s = score(a);
    if (s >= 0) hits.push({ a, s });
  }
  const hub = (a: WorldAirport) => (HUBS.has(a.code) ? 0 : 1);
  return hits
    .sort((x, y) => x.s - y.s || hub(x.a) - hub(y.a) || x.a.rank - y.a.rank)
    .slice(0, limit)
    .map((h) => h.a);
}

/** Up to five points: origin, up to three stops, destination. */
export const MAX_ROUTE_POINTS = 5;

/**
 * A route parameter's codes, "jfk-lhr-sin" → ["JFK", "LHR", "SIN"] (accepts -, commas, spaces or arrows; drops
 * anything else). A route with more than three stops keeps its origin, destination and first three stops, and says
 * which stops it dropped.
 */
export function parseRouteParam(param: string | null | undefined): { codes: string[]; dropped: string[] } {
  if (!param) return { codes: [], dropped: [] };
  const all = param
    .toUpperCase()
    .split(/[\s,>→–-]+/)
    .filter((c) => /^[A-Z]{3}$/.test(c));
  if (all.length <= MAX_ROUTE_POINTS) return { codes: all, dropped: [] };
  const stops = MAX_ROUTE_POINTS - 2;
  return { codes: [all[0], ...all.slice(1, 1 + stops), all[all.length - 1]], dropped: all.slice(1 + stops, -1) };
}

/** "jfk-lhr-sin" → ["JFK", "LHR", "SIN"], trimmed to an origin, up to three stops and the destination. */
export const parseRoute = (param: string | null | undefined): string[] => parseRouteParam(param).codes;

/** Legs that start and end at the same airport ("JFK-JFK"), by the index of their second airport. */
export const sameAirportLegs = (codes: (string | null)[]): number[] =>
  codes.flatMap((c, i) => (i > 0 && c !== null && c === codes[i - 1] ? [i] : []));

export const formatRoute = (codes: string[]) => codes.join("-");

export interface RouteLeg {
  from: WorldAirport;
  to: WorldAirport;
  km: number;
  miles: number;
  nm: number;
  /** Estimated flight time (see flightMinutes). */
  minutes: number;
}

export interface RouteSummary {
  legs: RouteLeg[];
  km: number;
  miles: number;
  nm: number;
  minutes: number;
  /** Straight from the origin to the final destination. */
  nonstop: { km: number; miles: number; nm: number; minutes: number } | null;
  /** How much farther the stops make the trip, versus nonstop (null for round trips or without stops). */
  extra: { km: number; miles: number; percent: number } | null;
}

/** Distances and times for a route of two or more airports. */
export function summarizeRoute(points: WorldAirport[]): RouteSummary {
  const legs: RouteLeg[] = [];
  for (let i = 1; i < points.length; i++) {
    const km = haversineKm(points[i - 1], points[i]);
    const miles = kmToMiles(km);
    legs.push({ from: points[i - 1], to: points[i], km, miles, nm: kmToNm(km), minutes: flightMinutes(miles) });
  }
  const sum = (f: (l: RouteLeg) => number) => legs.reduce((s, l) => s + f(l), 0);
  const km = sum((l) => l.km);
  const first = points[0];
  const last = points[points.length - 1];
  const direct = first && last && points.length > 1 ? haversineKm(first, last) : 0;
  const nonstop =
    points.length > 1 && direct > 1
      ? { km: direct, miles: kmToMiles(direct), nm: kmToNm(direct), minutes: flightMinutes(kmToMiles(direct)) }
      : null;
  const extra =
    nonstop && legs.length > 1
      ? { km: km - nonstop.km, miles: kmToMiles(km - nonstop.km), percent: ((km - nonstop.km) / nonstop.km) * 100 }
      : null;
  return { legs, km, miles: kmToMiles(km), nm: kmToNm(km), minutes: sum((l) => l.minutes), nonstop, extra };
}
