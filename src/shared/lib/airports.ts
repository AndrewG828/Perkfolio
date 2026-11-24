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
 * Airports matching what someone typed: an exact code first, then city and name matches, then anything that contains
 * every word. Ties go to busy hubs, then the file's order (bigger airports first).
 */
export function searchAirports(list: WorldAirport[], query: string, limit = 8): WorldAirport[] {
  const q = fold(query.trim());
  if (!q) return [];
  const words = q.split(/[\s,]+/).filter(Boolean);
  const score = (a: WorldAirport): number => {
    const code = a.code.toLowerCase();
    if (code === q) return 0;
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

/** "jfk-lhr-sin" → ["JFK", "LHR", "SIN"]. Accepts -, commas, spaces or arrows between codes; drops anything else. */
export function parseRoute(param: string | null | undefined): string[] {
  if (!param) return [];
  return param
    .toUpperCase()
    .split(/[\s,>→–-]+/)
    .filter((c) => /^[A-Z]{3}$/.test(c))
    .slice(0, MAX_ROUTE_POINTS);
}

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
