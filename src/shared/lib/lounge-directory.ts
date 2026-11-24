import type { Lounge } from "@/shared/data/types";
import { airportGeo } from "@/shared/data/airport-geo";
import { airports, lounges } from "@/shared/data/lounges";

/**
 * The lounge directory: airports, their lounges by terminal, gates. No card or guest-rule data, so pages that only
 * list airports (search, Start here) stay small; card access lives in lounge-access.ts, which re-exports these.
 */

export const airportByCode = new Map(airports.map((a) => [a.code, a]));

export const loungesAt = (code: string) => lounges.filter((l) => l.airportCode === code);

export const loungeCountByAirport = lounges.reduce<Record<string, number>>((m, l) => {
  m[l.airportCode] = (m[l.airportCode] ?? 0) + 1;
  return m;
}, {});

/** Airports with enough lounges to be worth a map, busiest first. */
export const bigAirports = airports
  .filter((a) => (loungeCountByAirport[a.code] ?? 0) >= 5)
  .sort((a, b) => loungeCountByAirport[b.code] - loungeCountByAirport[a.code]);

/** The terminal a lounge is in, without the concourse ("Terminal 4, Concourse A" → "Terminal 4"). */
export const terminalOf = (l: Lounge) => l.terminal.split(",")[0].trim();

/** Gate reference from a location like "Near gate B18" → "B18". */
export function gateOf(l: Lounge): string | null {
  const m = /\bgates?\s+([A-Z]{0,2})-?(\d{1,3})\b/i.exec(l.location ?? "");
  return m ? `${m[1].toUpperCase()}${m[2]}` : null;
}

const gateNumber = (l: Lounge) => Number(/\d+/.exec(gateOf(l) ?? "")?.[0] ?? NaN);

export interface TerminalGroup {
  terminal: string;
  lounges: Lounge[];
}

/** Lounges at an airport grouped by terminal, in physical order where known, and by gate within each. */
export function terminalsAt(code: string): TerminalGroup[] {
  const groups = new Map<string, Lounge[]>();
  for (const l of loungesAt(code)) groups.set(terminalOf(l), [...(groups.get(terminalOf(l)) ?? []), l]);
  const order = airportGeo[code]?.terminalOrder ?? [];
  const rank = (t: string) => (order.indexOf(t) === -1 ? order.length : order.indexOf(t));
  return [...groups.entries()]
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b, "en", { numeric: true }))
    .map(([terminal, ls]) => ({
      terminal,
      lounges: ls.sort(
        (a, b) =>
          a.terminal.localeCompare(b.terminal, "en", { numeric: true }) ||
          (Number.isNaN(gateNumber(a)) ? 1 : 0) - (Number.isNaN(gateNumber(b)) ? 1 : 0) ||
          gateNumber(a) - gateNumber(b) ||
          a.name.localeCompare(b.name),
      ),
    }));
}

/**
 * "5 of 5 open lounges · 1 closed": what a visitor's cards open at an airport (or in a terminal), out of the lounges
 * open today, as the airport page counts them, so a tile never reads as if a closed lounge turned the cards away.
 */
export function openOfLabel(open: number, total: number, closed: number): string {
  return closed > 0 ? `${open} of ${total - closed} open lounges · ${closed} closed` : `${open} of ${total} open to you`;
}
