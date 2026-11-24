import type { Lounge } from "@/shared/data/types";
import type { AirportNav, NavZone } from "@/shared/data/airport-nav";
import { gateOf } from "./lounge-access";
import { linkKey, parseGate, zoneForLounge, type Origin, type Route } from "./wayfinding";

/**
 * Geometry for the airport map: where gates, concourses and lounges are (in projected meters, from
 * public/airport-maps/<CODE>.json, built from OpenStreetMap by scripts/build-airport-maps.ts) and the route drawn
 * between them. Pure, so it's testable without a browser.
 */

export interface AirportMapData {
  code: string;
  origin: [number, number];
  terminals: { name: string | null; rings: [number, number][][] }[];
  runways: [number, number][][];
  gates: { ref: string; x: number; y: number; t: string | null }[];
  attribution: string;
}

export type Pt = [number, number];
export type SegmentMode = "walk" | "train" | "bus" | "landside";

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** True if an OSM terminal name belongs to this zone ("Terminal 4" ↔ "Terminal 4, Concourse A"). */
function zoneHasTerminal(zone: NavZone, terminalName: string | null): boolean {
  if (!terminalName) return false;
  const t = norm(terminalName);
  // Also match a building named for just the concourse ("Concourse B" for "Terminal 1, Concourse B").
  return [zone.name, ...(zone.terminals ?? [])]
    .map(norm)
    .some((z) => z === t || z.startsWith(t) || t.startsWith(z) || (t.length >= 9 && z.endsWith(t)));
}

const centroid = (pts: Pt[]): Pt | null =>
  pts.length ? [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length] : null;

/** OSM gate refs can be "C15/C16", "E38A" or "E29A/B": read the first gate in them. */
function looseGate(ref: string) {
  const m = /^([A-Z]{0,2})-?(\d{1,3})/.exec(ref);
  return m ? parseGate(`${m[1]}${m[2]}`) : null;
}

/** True if an OSM gate ref covers this gate label ("C15/C16" covers C16; "E38A" covers E38). */
function refCovers(ref: string, label: string) {
  return ref.split("/").some((part) => part === label || (part.startsWith(label) && /^[A-Z]$/.test(part.slice(label.length))));
}

function gatesInZone(data: AirportMapData, zone: NavZone) {
  const rules = zone.gates ?? [];
  const byRule = data.gates.filter((g) => {
    const p = looseGate(g.ref);
    return p && rules.some((r) => r.prefix === p.prefix && (r.from === undefined || p.number >= r.from) && (r.to === undefined || p.number <= r.to));
  });
  const inTerminal = byRule.filter((g) => zoneHasTerminal(zone, g.t));
  return inTerminal.length ? inTerminal : byRule;
}

type MapGate = AirportMapData["gates"][number];

/**
 * The zone's hub gate: the gate nearest the middle of all its gates. On a long concourse that's mid-concourse
 * (where trains stop at ATL/DEN); on a curved terminal (DFW) it stays on the building rather than mid-air.
 */
function hubGate(data: AirportMapData, zone: NavZone): MapGate | null {
  const gates = gatesInZone(data, zone);
  const c = centroid(gates.map((g) => [g.x, g.y]));
  if (!c) return null;
  return gates.reduce((a, b) => (Math.hypot(a.x - c[0], a.y - c[1]) <= Math.hypot(b.x - c[0], b.y - c[1]) ? a : b));
}

/** A representative point for a zone: its hub gate, else the middle of its terminal building. */
export function zoneAnchor(data: AirportMapData, zone: NavZone): Pt | null {
  const hub = hubGate(data, zone);
  if (hub) return [hub.x, hub.y];
  const shapes = data.terminals.filter((t) => zoneHasTerminal(zone, t.name));
  return centroid(shapes.flatMap((s) => s.rings.flat()));
}

interface Stop {
  pt: Pt;
  prefix?: string;
  number?: number;
}

/**
 * A walk inside one zone: along the gates numbered between the two ends (smoothed so it runs down the middle of the
 * concourse instead of zig-zagging between odd and even sides), or straight when we can't tell.
 */
function walkPath(data: AirportMapData, zone: NavZone, from: Stop, to: Stop): Pt[] {
  if (from.number === undefined || to.number === undefined || from.prefix !== to.prefix) return [from.pt, to.pt];
  const lo = Math.min(from.number, to.number);
  const hi = Math.max(from.number, to.number);
  const between = gatesInZone(data, zone)
    .map((g) => ({ g, p: looseGate(g.ref) }))
    .filter(({ p }) => p && p.prefix === from.prefix && p.number > lo && p.number < hi)
    .sort((a, b) => (a.p!.number - b.p!.number) * (from.number! <= to.number! ? 1 : -1))
    .map(({ g }) => [g.x, g.y] as Pt);
  const pts: Pt[] = [from.pt, ...between, to.pt];
  if (pts.length < 4) return pts;
  const smooth = pts.map((p, i) =>
    i === 0 || i === pts.length - 1 ? p : ([(pts[i - 1][0] + p[0] + pts[i + 1][0]) / 3, (pts[i - 1][1] + p[1] + pts[i + 1][1]) / 3] as Pt),
  );
  return smooth;
}

/** Where a specific gate is (e.g. "B18" in zone B), disambiguating same-numbered gates by terminal. */
export function gatePoint(data: AirportMapData, zone: NavZone, label: string): Pt | null {
  const ref = norm(label).toUpperCase();
  const same = data.gates.filter((g) => refCovers(g.ref, ref));
  if (!same.length) return null;
  const inZone = same.filter((g) => zoneHasTerminal(zone, g.t));
  const pick = (inZone.length ? inZone : same)[0];
  if (inZone.length || same.length === 1) return [pick.x, pick.y];
  // Several candidates and none clearly in this zone: take the one nearest the zone's other gates.
  const anchor = zoneAnchor(data, zone);
  if (!anchor) return [pick.x, pick.y];
  const best = same.reduce((a, b) => (Math.hypot(a.x - anchor[0], a.y - anchor[1]) <= Math.hypot(b.x - anchor[0], b.y - anchor[1]) ? a : b));
  return [best.x, best.y];
}

export function loungePoint(data: AirportMapData, nav: AirportNav, l: Lounge): Pt | null {
  const zone = zoneForLounge(nav, l);
  if (!zone) return null;
  const gate = gateOf(l);
  return (gate && gatePoint(data, zone, gate)) || zoneAnchor(data, zone);
}

export interface RouteGeometry {
  segments: { mode: SegmentMode; pts: Pt[] }[];
  start: Pt | null;
  end: Pt | null;
}

function hubStop(data: AirportMapData, zone: NavZone): Stop | null {
  const hub = hubGate(data, zone);
  if (hub) {
    const p = looseGate(hub.ref);
    return { pt: [hub.x, hub.y], prefix: p?.prefix, number: p?.number };
  }
  const a = zoneAnchor(data, zone);
  return a ? { pt: a } : null;
}

function gateStop(data: AirportMapData, zone: NavZone, label: string | null | undefined): Stop | null {
  if (!label) return null;
  const pt = gatePoint(data, zone, label);
  const p = parseGate(label);
  return pt ? { pt, prefix: p?.prefix, number: p?.number } : null;
}

/** The route as map segments: walk to the train along the concourse, ride, walk to the lounge. */
export function routeGeometry(data: AirportMapData, nav: AirportNav, origin: Origin, route: Route, lounge: Lounge): RouteGeometry {
  const zone = (id: string) => nav.zones.find((z) => z.id === id)!;
  const hubs = route.zones.map((id) => hubStop(data, zone(id)));
  const destZone = zone(route.zones[route.zones.length - 1]);
  const endStop = gateStop(data, destZone, gateOf(lounge)) ?? hubs[hubs.length - 1];
  const startStop = (origin.kind === "gate" ? gateStop(data, zone(origin.zone), origin.gate?.label) : null) ?? hubs[0];
  const segments: RouteGeometry["segments"] = [];
  const same = (a: Pt, b: Pt) => a[0] === b[0] && a[1] === b[1];
  const push = (mode: SegmentMode, pts: Pt[]) => {
    if (pts.length < 2 || pts.every((p) => same(p, pts[0]))) return;
    const last = segments[segments.length - 1];
    if (last && last.mode === mode && same(last.pts[last.pts.length - 1], pts[0])) last.pts.push(...pts.slice(1));
    else segments.push({ mode, pts: [...pts] });
  };

  if (startStop && endStop) {
    if (route.zones.length <= 1) {
      push("walk", walkPath(data, destZone, startStop, endStop));
    } else {
      if (hubs[0]) push("walk", walkPath(data, zone(route.zones[0]), startStop, hubs[0]));
      for (let i = 0; i < route.zones.length - 1; i++) {
        const key = linkKey(route.zones[i], route.zones[i + 1]);
        const link = route.links.includes(key) ? nav.links.find((l) => linkKey(l.a, l.b) === key) : undefined;
        if (hubs[i] && hubs[i + 1]) push(link ? link.mode : "landside", [hubs[i]!.pt, hubs[i + 1]!.pt]);
      }
      const lastHub = hubs[hubs.length - 1];
      if (lastHub) push("walk", walkPath(data, destZone, lastHub, endStop));
    }
  }
  return { segments, start: startStop?.pt ?? null, end: endStop?.pt ?? null };
}

export function bounds(pts: Pt[]): { minX: number; minY: number; maxX: number; maxY: number } | null {
  if (!pts.length) return null;
  return {
    minX: Math.min(...pts.map((p) => p[0])),
    minY: Math.min(...pts.map((p) => p[1])),
    maxX: Math.max(...pts.map((p) => p[0])),
    maxY: Math.max(...pts.map((p) => p[1])),
  };
}
