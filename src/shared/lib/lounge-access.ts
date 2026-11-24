import type { Card, Lounge, LoungeNetwork } from "@/shared/data/types";
import { airportGeo } from "@/shared/data/airport-geo";
import { airports, lounges } from "@/shared/data/lounges";

/** Who can get into lounges, given a set of cards. Pure, so pages, the map and tests share one set of rules. */

export interface LoungeAccessGrant {
  card: Card;
  terms: string;
  /** The network the card uses to get in (can differ from the lounge's own brand, e.g. via Priority Pass). */
  via: LoungeNetwork;
}

/** A note that says a lounge is out of Priority Pass ("Not in Priority Pass", "left Priority Pass"). */
const NOT_PRIORITY_PASS = /\b(?:not (?:in|part of)|no longer (?:in|part of)|left|leaving|out of)\s+(?:the\s+)?priority pass\b/i;

/** Networks a lounge can be entered through (e.g. a Plaza Premium lounge that also takes Priority Pass). */
export function networksFor(l: Lounge): LoungeNetwork[] {
  const n: LoungeNetwork[] = [l.network];
  const notes = l.notes ?? "";
  if (l.network !== "priority-pass" && /priority pass/i.test(notes) && !NOT_PRIORITY_PASS.test(notes)) n.push("priority-pass");
  return n;
}

export function accessFor(l: Lounge, cards: Card[]): LoungeAccessGrant[] {
  const nets = networksFor(l);
  return cards.flatMap((card) =>
    card.loungeAccess.filter((a) => nets.includes(a.network)).map((a) => ({ card, terms: a.terms, via: a.network })),
  );
}

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

/** How many lounges each airport has that these cards unlock. */
export function accessibleCountByAirport(cards: Card[]): Record<string, number> {
  const out: Record<string, number> = {};
  if (cards.length === 0) return out;
  for (const l of lounges) if (accessFor(l, cards).length > 0) out[l.airportCode] = (out[l.airportCode] ?? 0) + 1;
  return out;
}
