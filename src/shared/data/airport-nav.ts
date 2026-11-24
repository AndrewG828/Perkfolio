/**
 * Wayfinding data for the big airports: zones (concourses or terminals), which gates are in each, where you can
 * clear security, and how zones connect *after* security (train, walkway or airside bus). Routing between zones
 * that aren't connected airside goes landside and through security again.
 *
 * Times are typical minutes, not measurements. Connections change with construction, so every route in the UI says
 * "follow airport signs". Researched November 2026 (LAX, SFO, ORD, MIA and PHX checked against recent reports).
 *
 * `terminals` lists the exact `terminal` strings used for lounges in lounges.ts that belong to the zone (a test
 * checks every lounge at these airports lands in a zone).
 */

export type LinkMode = "walk" | "train" | "bus";

export interface GateRule {
  /** Gate letter(s) before the number, e.g. "B" for B18; "" for numeric-only gates (LAX 64). */
  prefix: string;
  from?: number;
  to?: number;
}

export interface NavZone {
  id: string;
  name: string;
  gates?: GateRule[];
  terminals?: string[];
  /** Security checkpoint that puts you in this zone, if there is one. */
  checkpoint?: string;
  /**
   * How many stations the zone's train stops at, when it's more than one (in the zone's middle): DFW's terminals have
   * two Skylink stations each. The map spreads them along the zone's gates, a quarter of the way in from each end; the
   * exact spots aren't in this data, so they're approximate.
   */
  stations?: number;
}

export interface NavLink {
  a: string;
  b: string;
  mode: LinkMode;
  minutes: number;
  /** Name of the train/walkway/bus, e.g. "Plane Train". */
  via?: string;
  /** Shown as a warning when the route uses this link (restrictions, construction). */
  caution?: string;
}

export interface AirportNav {
  /** Zones in physical order (how they appear on the terminal map). */
  zones: NavZone[];
  /** Airside connections; each works both ways. */
  links: NavLink[];
  /** How to get between zones that aren't connected after security. */
  landside: { how: string; minutes: number };
  note?: string;
}

const letters = (...ps: string[]): GateRule[] => ps.map((prefix) => ({ prefix }));
const numbers = (...ranges: [number, number][]): GateRule[] => ranges.map(([from, to]) => ({ prefix: "", from, to }));
const concourse = (id: string, extra: Partial<NavZone> = {}): NavZone => ({
  id,
  name: `Concourse ${id}`,
  gates: letters(id),
  terminals: [`Concourse ${id}`],
  ...extra,
});
const terminal = (id: string, extra: Partial<NavZone> = {}): NavZone => ({
  id,
  name: `Terminal ${id}`,
  gates: letters(id),
  terminals: [`Terminal ${id}`],
  checkpoint: `Terminal ${id} security`,
  ...extra,
});
const chain = (ids: string[], mode: LinkMode, minutes: number, via?: string): NavLink[] =>
  ids.slice(1).map((id, i) => ({ a: ids[i], b: id, mode, minutes, via }));
const allPairs = (ids: string[], mode: LinkMode, minutes: number, via?: string): NavLink[] =>
  ids.flatMap((a, i) => ids.slice(i + 1).map((b) => ({ a, b, mode, minutes, via })));

export const airportNav: Record<string, AirportNav> = {
  ATL: {
    zones: [
      concourse("T", { checkpoint: "Domestic Terminal security (North or South)" }),
      concourse("A"),
      concourse("B"),
      concourse("C"),
      concourse("D"),
      concourse("E"),
      concourse("F", { checkpoint: "International Terminal security" }),
    ],
    links: chain(["T", "A", "B", "C", "D", "E", "F"], "train", 2, "Plane Train"),
    landside: { how: "Everything at ATL is connected after security", minutes: 0 },
    note: "The Transportation Mall walkway runs alongside the Plane Train if you'd rather walk (about 4 minutes between concourses).",
  },
  DFW: {
    zones: ["A", "B", "C", "D", "E"].map((t) => terminal(t, { stations: 2 })),
    links: allPairs(["A", "B", "C", "D", "E"], "train", 5, "Skylink"),
    landside: { how: "Terminal Link bus between terminals", minutes: 10 },
    note: "Skylink trains run both directions every couple of minutes; rides take about 2–9 minutes.",
  },
  JFK: {
    zones: [
      { id: "1", name: "Terminal 1", gates: numbers([1, 11]), terminals: ["Terminal 1"], checkpoint: "Terminal 1 security" },
      { id: "4A", name: "Terminal 4, Concourse A", gates: letters("A"), terminals: ["Terminal 4, Concourse A"] },
      { id: "4", name: "Terminal 4 (main hall)", terminals: ["Terminal 4"], checkpoint: "Terminal 4 security" },
      { id: "4B", name: "Terminal 4, Concourse B", gates: letters("B"), terminals: ["Terminal 4, Concourse B"] },
      { id: "8", name: "Terminal 8", gates: numbers([1, 16], [31, 47]), terminals: ["Terminal 8"], checkpoint: "Terminal 8 security" },
    ],
    links: [
      { a: "4", b: "4A", mode: "walk", minutes: 5 },
      { a: "4", b: "4B", mode: "walk", minutes: 7 },
    ],
    landside: { how: "AirTrain JFK between terminals (free)", minutes: 10 },
    note: "JFK's terminals aren't connected after security, except Terminal 4's A and B concourses. The New Terminal One is opening in phases, so check where your airline flies.",
  },
  ORD: {
    zones: [
      { id: "B", name: "Terminal 1, Concourse B", gates: letters("B"), terminals: ["Terminal 1, Concourse B"], checkpoint: "Terminal 1 security" },
      { id: "C", name: "Terminal 1, Concourse C", gates: letters("C"), terminals: ["Terminal 1, Concourse C"] },
      { id: "EF", name: "Terminal 2", gates: letters("E", "F"), terminals: ["Terminal 2"], checkpoint: "Terminal 2 security" },
      { id: "HK", name: "Terminal 3, Concourse H/K", gates: letters("H", "K"), terminals: ["Terminal 3, Concourse H/K"], checkpoint: "Terminal 3 security" },
      { id: "G", name: "Terminal 3, Concourse G", gates: letters("G"), terminals: ["Terminal 3, Concourse G"] },
      { id: "L", name: "Terminal 3, Concourse L", gates: letters("L"), terminals: ["Terminal 3, Concourse L"] },
      { id: "M", name: "Terminal 5", gates: letters("M"), terminals: ["Terminal 5", "Terminal 5, Concourse M"], checkpoint: "Terminal 5 security" },
    ],
    links: [
      { a: "B", b: "C", mode: "walk", minutes: 6, via: "the underground walkway" },
      { a: "B", b: "EF", mode: "walk", minutes: 8 },
      { a: "EF", b: "HK", mode: "walk", minutes: 8 },
      { a: "HK", b: "G", mode: "walk", minutes: 5 },
      { a: "HK", b: "L", mode: "walk", minutes: 6 },
      {
        a: "G",
        b: "M",
        mode: "bus",
        minutes: 15,
        via: "airside Terminal Transfer Bus",
        caution: "Only for connecting passengers with a same-day flight from the terminal you're going to, and only during set hours. Otherwise take the ATS train and clear security again.",
      },
    ],
    landside: { how: "ATS train between terminals (free)", minutes: 8 },
  },
  DEN: {
    zones: [
      { id: "J", name: "Jeppesen Terminal", checkpoint: "Jeppesen Terminal security" },
      concourse("A"),
      concourse("B"),
      concourse("C"),
    ],
    links: [
      { a: "J", b: "A", mode: "train", minutes: 2, via: "Concourse train" },
      { a: "A", b: "B", mode: "train", minutes: 2, via: "Concourse train" },
      { a: "B", b: "C", mode: "train", minutes: 2, via: "Concourse train" },
    ],
    landside: { how: "Everything at DEN is connected after security", minutes: 0 },
    note: "You can also walk from Jeppesen Terminal to Concourse A over the A Bridge.",
  },
  IAD: {
    zones: [
      { id: "Z", name: "Z gates", gates: letters("Z") },
      { id: "Main", name: "Main Terminal", terminals: ["Main Terminal"], checkpoint: "Main Terminal security" },
      concourse("A"),
      concourse("B"),
      concourse("C"),
      concourse("D"),
    ],
    links: [
      { a: "Main", b: "Z", mode: "walk", minutes: 3 },
      { a: "Main", b: "A", mode: "train", minutes: 4, via: "AeroTrain (or the underground walkway)" },
      { a: "Main", b: "B", mode: "train", minutes: 4, via: "AeroTrain" },
      { a: "A", b: "B", mode: "walk", minutes: 5 },
      { a: "Main", b: "C", mode: "train", minutes: 5, via: "AeroTrain" },
      { a: "C", b: "D", mode: "walk", minutes: 3 },
    ],
    landside: { how: "Everything at IAD is connected after security", minutes: 0 },
  },
  LAX: {
    zones: [
      { id: "1", name: "Terminal 1", gates: numbers([1, 18]), terminals: ["Terminal 1"], checkpoint: "Terminal 1 security" },
      { id: "2", name: "Terminal 2", gates: numbers([20, 29]), terminals: ["Terminal 2"], checkpoint: "Terminal 2 security" },
      { id: "3", name: "Terminal 3", gates: numbers([30, 39]), terminals: ["Terminal 3"], checkpoint: "Terminal 3 security" },
      {
        id: "B",
        name: "Tom Bradley International Terminal",
        gates: numbers([130, 160], [200, 220]),
        terminals: ["Tom Bradley International Terminal"],
        checkpoint: "Tom Bradley security",
      },
      { id: "4", name: "Terminal 4", gates: numbers([40, 49]), terminals: ["Terminal 4"], checkpoint: "Terminal 4 security" },
      { id: "5", name: "Terminal 5", gates: numbers([50, 59]), terminals: ["Terminal 5"], checkpoint: "Terminal 5 security" },
      { id: "6", name: "Terminal 6", gates: numbers([60, 69]), terminals: ["Terminal 6"], checkpoint: "Terminal 6 security" },
      { id: "7", name: "Terminal 7", gates: numbers([70, 79]), terminals: ["Terminal 7"], checkpoint: "Terminal 7 security" },
      { id: "8", name: "Terminal 8", gates: numbers([80, 89]), terminals: ["Terminal 8"], checkpoint: "Terminal 8 security" },
    ],
    links: [
      { a: "1", b: "2", mode: "walk", minutes: 6, via: "the Terminal 1.5 connector" },
      { a: "2", b: "3", mode: "walk", minutes: 5 },
      { a: "3", b: "B", mode: "walk", minutes: 8, via: "the Delta Sky Way connector" },
      { a: "B", b: "4", mode: "walk", minutes: 6 },
      {
        a: "4",
        b: "6",
        mode: "bus",
        minutes: 10,
        via: "airside shuttle bus",
        caution: "The T4–T5–T6 tunnels are closed while Terminal 5 is rebuilt; follow signs for the airside shuttle.",
      },
      { a: "4", b: "5", mode: "walk", minutes: 5, caution: "May be closed during Terminal 5 reconstruction." },
      { a: "6", b: "7", mode: "walk", minutes: 5 },
      { a: "7", b: "8", mode: "walk", minutes: 5 },
    ],
    landside: { how: "LAX shuttle between terminals", minutes: 15 },
    note: "All LAX terminals are connected after security, but the walks are long (Terminal 1 to 8 is about 2 miles).",
  },
  SEA: {
    zones: [
      { id: "S", name: "South Satellite", gates: letters("S"), terminals: ["South Satellite (S gates)"] },
      concourse("A", { checkpoint: "Main terminal security" }),
      concourse("B", { checkpoint: "Main terminal security" }),
      concourse("C", { checkpoint: "Main terminal security" }),
      concourse("D", { checkpoint: "Main terminal security" }),
      { id: "N", name: "North Satellite", gates: letters("N"), terminals: ["North Satellite (N gates)"] },
    ],
    links: [
      { a: "A", b: "B", mode: "walk", minutes: 5 },
      { a: "B", b: "C", mode: "walk", minutes: 4 },
      { a: "C", b: "D", mode: "walk", minutes: 4 },
      { a: "B", b: "S", mode: "train", minutes: 4, via: "SEA Underground train (South loop)" },
      { a: "C", b: "N", mode: "train", minutes: 4, via: "SEA Underground train (North loop)" },
    ],
    landside: { how: "Everything at SEA is connected after security", minutes: 0 },
  },
  SFO: {
    zones: [
      { id: "G", name: "International Terminal G", gates: letters("G"), terminals: ["International Terminal", "International Terminal G", "International Boarding Area G"], checkpoint: "International Terminal G security" },
      { id: "3", name: "Terminal 3", gates: letters("E", "F"), terminals: ["Terminal 3"], checkpoint: "Terminal 3 security" },
      { id: "2", name: "Terminal 2", gates: letters("D"), terminals: ["Terminal 2", "Terminal 2, Concourse D"], checkpoint: "Terminal 2 security" },
      { id: "1", name: "Harvey Milk Terminal 1", gates: letters("B", "C"), terminals: ["Harvey Milk Terminal 1"], checkpoint: "Terminal 1 security" },
      { id: "A", name: "International Terminal A", gates: letters("A"), terminals: ["International Terminal A", "International Boarding Area A"], checkpoint: "International Terminal A security" },
    ],
    links: [
      { a: "G", b: "3", mode: "walk", minutes: 10 },
      { a: "3", b: "2", mode: "walk", minutes: 8 },
      { a: "2", b: "1", mode: "walk", minutes: 10 },
      { a: "1", b: "A", mode: "walk", minutes: 10 },
    ],
    landside: { how: "Walk landside through the International Terminal (or take AirTrain)", minutes: 8 },
    note: "All SFO terminals are connected after security, but the A and G gates only connect the long way round. Between them, it's often quicker to exit and re-clear security.",
  },
  CLT: {
    zones: [
      concourse("A"),
      concourse("B"),
      { id: "Atrium", name: "Atrium", terminals: ["Atrium"], checkpoint: "Main terminal security" },
      concourse("C"),
      concourse("D", { terminals: ["Concourse D", "Concourses D/E"] }),
      concourse("E"),
    ],
    links: [
      { a: "Atrium", b: "A", mode: "walk", minutes: 4 },
      { a: "Atrium", b: "B", mode: "walk", minutes: 3 },
      { a: "Atrium", b: "C", mode: "walk", minutes: 3 },
      { a: "Atrium", b: "D", mode: "walk", minutes: 3 },
      { a: "D", b: "E", mode: "walk", minutes: 4 },
    ],
    landside: { how: "Everything at CLT is connected after security", minutes: 0 },
  },
  IAH: {
    zones: ["A", "B", "C", "D", "E"].map((t) => terminal(t)),
    links: [
      { a: "A", b: "B", mode: "train", minutes: 3, via: "Skyway train" },
      { a: "B", b: "C", mode: "train", minutes: 3, via: "Skyway train" },
      { a: "C", b: "D", mode: "train", minutes: 3, via: "Skyway train" },
      { a: "C", b: "E", mode: "walk", minutes: 5 },
      { a: "D", b: "E", mode: "walk", minutes: 5 },
    ],
    landside: { how: "Subway train between terminals (before security)", minutes: 8 },
  },
  LAS: {
    zones: [
      { id: "A", name: "Concourse A", gates: letters("A"), terminals: ["Terminal 1, Concourse A"], checkpoint: "Terminal 1 A/B security" },
      { id: "B", name: "Concourse B", gates: letters("B"), terminals: ["Terminal 1, Concourse B"], checkpoint: "Terminal 1 A/B security" },
      { id: "C", name: "Concourse C", gates: letters("C"), terminals: ["Terminal 1, Concourse C"], checkpoint: "Terminal 1 C security" },
      { id: "D", name: "Concourse D", gates: letters("D"), terminals: ["Concourse D", "Terminal 1, Concourse D"] },
      { id: "E", name: "Terminal 3 (E gates)", gates: letters("E"), terminals: ["Terminal 3"], checkpoint: "Terminal 3 security" },
    ],
    links: [
      { a: "A", b: "B", mode: "walk", minutes: 3 },
      { a: "B", b: "C", mode: "walk", minutes: 6 },
      { a: "C", b: "D", mode: "train", minutes: 3, via: "tram" },
      { a: "D", b: "E", mode: "train", minutes: 3, via: "tram" },
    ],
    landside: { how: "Shuttle between Terminals 1 and 3", minutes: 15 },
  },
  MIA: {
    zones: [
      { id: "D", name: "Concourse D", gates: letters("D"), terminals: ["Concourse D", "North Terminal, Concourse D"], checkpoint: "North Terminal security" },
      concourse("E", { checkpoint: "Concourse E security" }),
      concourse("F", { checkpoint: "Concourse F security" }),
      concourse("G", { checkpoint: "Concourse G security" }),
      concourse("H", { terminals: ["Concourse H", "Concourse H/J"], checkpoint: "Concourse H security" }),
      concourse("J", { checkpoint: "South Terminal security" }),
    ],
    links: [
      { a: "D", b: "E", mode: "walk", minutes: 6 },
      { a: "H", b: "J", mode: "walk", minutes: 5 },
    ],
    landside: { how: "Walk the landside corridor between concourses", minutes: 10 },
    note: "Only D–E and H–J are connected after security at MIA.",
  },
  LHR: {
    zones: ["2", "3", "4", "5"].map((t) => ({ id: t, name: `Terminal ${t}`, terminals: [`Terminal ${t}`], checkpoint: `Terminal ${t} security` })),
    links: [],
    landside: { how: "Free train between terminals (Elizabeth line or Heathrow Express; Terminals 2 and 3 share a station)", minutes: 15 },
    note: "Heathrow's terminals aren't connected after security for departing passengers: use a lounge in your departure terminal.",
  },
  LGA: {
    zones: [
      { id: "B", name: "Terminal B", terminals: ["Terminal B"], checkpoint: "Terminal B security" },
      { id: "C", name: "Terminal C", terminals: ["Terminal C"], checkpoint: "Terminal C security" },
    ],
    links: [],
    landside: { how: "Free shuttle bus between Terminals B and C", minutes: 10 },
    note: "LaGuardia's terminals aren't connected after security.",
  },
  PHL: {
    zones: [
      { id: "AW", name: "Terminal A-West", gates: [{ prefix: "A", from: 14, to: 30 }], terminals: ["Terminal A-West"], checkpoint: "Terminal A-West security" },
      { id: "AE", name: "Terminal A-East", gates: [{ prefix: "A", from: 1, to: 13 }], terminals: ["Terminal A-East", "Terminals A/B"], checkpoint: "Terminal A-East security" },
      terminal("B", { terminals: ["Terminal B", "Terminals B/C"], checkpoint: "Terminal B/C security" }),
      terminal("C", { checkpoint: "Terminal B/C security" }),
      terminal("D", { terminals: ["Terminal D", "Terminals D/E"], checkpoint: "Terminal D/E security" }),
      terminal("E", { checkpoint: "Terminal D/E security" }),
      terminal("F"),
    ],
    links: [
      ...chain(["AW", "AE", "B", "C", "D", "E"], "walk", 4),
      { a: "E", b: "F", mode: "walk", minutes: 8 },
    ],
    landside: { how: "Everything at PHL is connected after security", minutes: 0 },
  },
  PHX: {
    zones: [
      { id: "3", name: "Terminal 3", gates: letters("E", "F"), terminals: ["Terminal 3"], checkpoint: "Terminal 3 security" },
      { id: "4", name: "Terminal 4", gates: letters("A", "B", "C", "D"), terminals: ["Terminal 4"], checkpoint: "Terminal 4 security" },
    ],
    links: [],
    landside: { how: "PHX Sky Train between terminals (free)", minutes: 5 },
    note: "Terminals 3 and 4 aren't connected after security.",
  },
};
