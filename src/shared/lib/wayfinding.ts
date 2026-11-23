import type { Lounge } from "@/shared/data/types";
import { airportNav, type AirportNav, type LinkMode, type NavLink, type NavZone } from "@/shared/data/airport-nav";
import { gateOf } from "./lounge-access";

/**
 * Gate-to-lounge routing over the zone graph in airport-nav.ts. Pure functions: the airport page and tests share them.
 * Times are estimates; the UI always pairs a route with "follow airport signs".
 */

export const navFor = (code: string): AirportNav | null => airportNav[code] ?? null;

/** Typical time to clear security, used when a route has to leave and re-enter. */
export const SECURITY_MINUTES = 15;
/** Walking within a zone when we don't know both gates. */
const ZONE_WALK = 3;

export interface ParsedGate {
  prefix: string;
  number: number;
  label: string;
}

/** "b18", "B 18", "E-11", "64" → { prefix, number }. */
export function parseGate(input: string): ParsedGate | null {
  const m = /^\s*([A-Za-z]{0,2})\s*-?\s*(\d{1,3})\s*$/.exec(input);
  if (!m) return null;
  const prefix = m[1].toUpperCase();
  return { prefix, number: Number(m[2]), label: `${prefix}${Number(m[2])}` };
}

/** Zones a gate could be in (more than one means we need to ask, e.g. JFK gate 5 is in Terminal 1 and 8). */
export function zonesForGate(nav: AirportNav, gate: ParsedGate): NavZone[] {
  return nav.zones.filter((z) =>
    (z.gates ?? []).some(
      (r) => r.prefix === gate.prefix && (r.from === undefined || gate.number >= r.from) && (r.to === undefined || gate.number <= r.to),
    ),
  );
}

/** The zone a lounge is in: by its gate if we know it, otherwise by its terminal name. */
export function zoneForLounge(nav: AirportNav, l: Lounge): NavZone | null {
  const g = gateOf(l);
  if (g) {
    const p = parseGate(g);
    const z = p ? zonesForGate(nav, p) : [];
    if (z.length === 1) return z[0];
  }
  const t = l.terminal.toLowerCase();
  const parts = [t, ...t.split(",").map((s) => s.trim())];
  for (const candidate of parts) {
    const z = nav.zones.find((zone) => (zone.terminals ?? []).some((name) => name.toLowerCase() === candidate));
    if (z) return z;
  }
  return null;
}

function loungeGateNumber(l: Lounge): number | null {
  const p = parseGate(gateOf(l) ?? "");
  return p ? p.number : null;
}

/** Where the traveler is starting: a gate (in a zone) or before security. */
export type Origin = { kind: "gate"; zone: string; gate?: ParsedGate } | { kind: "zone"; zone: string } | { kind: "landside" };

export type StepKind = LinkMode | "security" | "exit" | "landside" | "arrive";

export interface RouteStep {
  kind: StepKind;
  text: string;
  minutes: number;
  caution?: string;
}

export interface Route {
  steps: RouteStep[];
  minutes: number;
  /** Zone ids in order, for highlighting the map. */
  zones: string[];
  /** Links used, as "a|b" keys. */
  links: string[];
  /** Route leaves and re-clears security. */
  reclearsSecurity: boolean;
}

export const linkKey = (a: string, b: string) => [a, b].sort().join("|");
/** Cautioned links (closures, restrictions) cost extra so routes prefer a clean alternative. */
const linkCost = (l: NavLink) => l.minutes + (l.caution ? 8 : 0);

/** Cheapest airside path between zones (Dijkstra). Null if they aren't connected after security. */
function airsidePath(nav: AirportNav, from: string, to: string): { zones: string[]; links: NavLink[] } | null {
  const dist = new Map<string, number>([[from, 0]]);
  const prev = new Map<string, { zone: string; link: NavLink }>();
  const todo = new Set(nav.zones.map((z) => z.id));
  while (todo.size) {
    let cur: string | null = null;
    for (const z of todo) if (dist.has(z) && (cur === null || dist.get(z)! < dist.get(cur)!)) cur = z;
    if (cur === null) break;
    todo.delete(cur);
    if (cur === to) break;
    for (const l of nav.links) {
      const next = l.a === cur ? l.b : l.b === cur ? l.a : null;
      if (!next || !todo.has(next)) continue;
      const d = dist.get(cur)! + linkCost(l);
      if (d < (dist.get(next) ?? Infinity)) {
        dist.set(next, d);
        prev.set(next, { zone: cur, link: l });
      }
    }
  }
  if (!dist.has(to)) return null;
  const zones = [to];
  const links: NavLink[] = [];
  for (let z = to; z !== from; ) {
    const p = prev.get(z)!;
    links.unshift(p.link);
    zones.unshift(p.zone);
    z = p.zone;
  }
  return { zones, links };
}

const zoneName = (nav: AirportNav, id: string) => nav.zones.find((z) => z.id === id)?.name ?? id;

/**
 * Turns a chain of links into steps. Consecutive rides on the same train become one step ("3 stops"), and
 * consecutive plain walks become one step that names the zones you pass through.
 */
function rideSteps(nav: AirportNav, zones: string[], links: NavLink[]): RouteStep[] {
  type Seg = { link: NavLink; to: string; hops: number; through: string[]; minutes: number };
  const segs: Seg[] = [];
  for (let i = 0; i < links.length; i++) {
    const l = links[i];
    const to = zones[i + 1];
    const last = segs[segs.length - 1];
    const mergeTrain = last && l.mode === "train" && last.link.mode === "train" && last.link.via === l.via && !l.caution;
    const mergeWalk = last && l.mode === "walk" && last.link.mode === "walk" && !l.via && !last.link.via && !l.caution && !last.link.caution;
    if (mergeTrain || mergeWalk) {
      last.through.push(last.to);
      last.to = to;
      last.hops++;
      last.minutes += l.minutes;
      continue;
    }
    segs.push({ link: l, to, hops: 1, through: [], minutes: l.minutes });
  }
  return segs.map(({ link: l, to, hops, through, minutes }) => {
    const dest = zoneName(nav, to);
    const text =
      l.mode === "train"
        ? `Take the ${l.via ?? "train"} ${hops > 1 ? `${hops} stops ` : ""}to ${dest}`
        : l.mode === "bus"
          ? `Take the ${l.via ?? "bus"} to ${dest}`
          : `Walk to ${dest}${l.via ? ` via ${l.via}` : through.length ? `, through ${through.map((z) => zoneName(nav, z)).join(" and ")}` : ""}`;
    return { kind: l.mode, text, minutes, caution: l.caution };
  });
}

function finalWalk(l: Lounge, fromGate: number | null, sameZone: boolean): RouteStep {
  const to = loungeGateNumber(l);
  const minutes = sameZone && fromGate !== null && to !== null ? Math.max(1, Math.round(Math.abs(fromGate - to) * 0.3) + 1) : ZONE_WALK;
  const where = l.location ? ` (${l.location.charAt(0).toLowerCase()}${l.location.slice(1)})` : "";
  return { kind: "arrive", text: `Walk to ${l.name}${where}`, minutes };
}

/** Best checkpoint to enter by for a destination zone: its own, else the one with the shortest airside ride. */
function bestCheckpoint(nav: AirportNav, dest: string): { zone: NavZone; path: { zones: string[]; links: NavLink[] } } | null {
  let best: { zone: NavZone; path: { zones: string[]; links: NavLink[] }; cost: number } | null = null;
  for (const z of nav.zones.filter((z) => z.checkpoint)) {
    const path = airsidePath(nav, z.id, dest);
    if (!path) continue;
    const cost = path.links.reduce((s, l) => s + linkCost(l), 0);
    if (!best || cost < best.cost) best = { zone: z, path, cost };
  }
  return best;
}

/** Step-by-step route from an origin to a lounge, or null if we can't place the lounge. */
export function routeTo(nav: AirportNav, origin: Origin, lounge: Lounge): Route | null {
  const dest = zoneForLounge(nav, lounge);
  if (!dest) return null;
  const steps: RouteStep[] = [];
  const zones: string[] = [];
  const used: NavLink[] = [];
  let reclears = false;
  const startGate = origin.kind === "gate" ? (origin.gate?.number ?? null) : null;

  const enter = () => {
    const cp = bestCheckpoint(nav, dest.id);
    if (!cp) return false;
    steps.push({ kind: "security", text: `Clear ${cp.zone.checkpoint}`, minutes: SECURITY_MINUTES, caution: "Security lines vary; allow 15–30 minutes, more at peak times." });
    steps.push(...rideSteps(nav, cp.path.zones, cp.path.links));
    zones.push(...cp.path.zones);
    used.push(...cp.path.links);
    return true;
  };

  if (origin.kind === "landside") {
    if (!enter()) return null;
    steps.push(finalWalk(lounge, null, false));
  } else {
    const path = airsidePath(nav, origin.zone, dest.id);
    if (path) {
      zones.push(...path.zones);
      used.push(...path.links);
      if (path.links.length > 0 && origin.kind === "gate" && origin.gate) {
        steps.push({ kind: "walk", text: `From gate ${origin.gate.label}, head to the ${path.links[0].mode === "train" ? "train" : path.links[0].mode === "bus" ? "bus" : "connector"}`, minutes: ZONE_WALK });
      }
      steps.push(...rideSteps(nav, path.zones, path.links));
      steps.push(finalWalk(lounge, startGate, path.links.length === 0));
    } else {
      reclears = true;
      zones.push(origin.zone);
      steps.push({ kind: "exit", text: `Leave the secure area in ${zoneName(nav, origin.zone)}`, minutes: ZONE_WALK, caution: "This lounge isn't connected to you after security." });
      const cp = bestCheckpoint(nav, dest.id);
      steps.push({
        kind: "landside",
        text: `Go to ${cp?.zone.name ?? zoneName(nav, dest.id)}: ${nav.landside.how}`,
        minutes: nav.landside.minutes,
      });
      if (!enter()) return null;
      steps.push(finalWalk(lounge, null, false));
    }
  }
  return {
    steps,
    minutes: steps.reduce((s, x) => s + x.minutes, 0),
    zones: Array.from(new Set(zones)),
    links: used.map((l) => linkKey(l.a, l.b)),
    reclearsSecurity: reclears || origin.kind === "landside",
  };
}

/** Lounges ranked by how long they take to reach from the origin (unplaceable lounges dropped). */
export function rankByDistance(nav: AirportNav, origin: Origin, ls: Lounge[]): { lounge: Lounge; route: Route }[] {
  return ls
    .map((lounge) => ({ lounge, route: routeTo(nav, origin, lounge) }))
    .filter((x): x is { lounge: Lounge; route: Route } => x.route !== null)
    .sort((a, b) => Number(a.route.reclearsSecurity) - Number(b.route.reclearsSecurity) || a.route.minutes - b.route.minutes);
}

/** Apple Maps walking directions (indoor maps at many large airports on iPhone/Mac). */
export const appleMapsUrl = (lounge: Lounge, airportName: string) =>
  `https://maps.apple.com/?daddr=${encodeURIComponent(`${lounge.name}, ${lounge.terminal}, ${airportName}`)}&dirflg=w`;

/** Google Maps walking directions. */
export const googleMapsUrl = (lounge: Lounge, airportName: string) =>
  `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${lounge.name}, ${lounge.terminal}, ${airportName}`)}&travelmode=walking`;

/** True if two zones are connected after security (directly or through others). */
export const isConnected = (nav: AirportNav, a: string, b: string) => a === b || airsidePath(nav, a, b) !== null;

/** Resolves what the traveler typed into an origin, or explains what's missing. */
export type OriginResult =
  | { ok: true; origin: Origin; label: string }
  | { ok: false; reason: "empty" | "unknown" | "ambiguous"; options: NavZone[]; gate?: ParsedGate };

export function resolveOrigin(nav: AirportNav, from: string): OriginResult {
  if (!from) return { ok: false, reason: "empty", options: nav.zones };
  if (from === "landside") return { ok: true, origin: { kind: "landside" }, label: "Before security" };
  if (from.startsWith("@")) {
    const [zoneId, gateText] = from.slice(1).split(":");
    const zone = nav.zones.find((z) => z.id === zoneId);
    if (!zone) return { ok: false, reason: "unknown", options: nav.zones };
    const gate = gateText ? (parseGate(gateText) ?? undefined) : undefined;
    return { ok: true, origin: { kind: "gate", zone: zone.id, gate }, label: gate ? `Gate ${gate.label} · ${zone.name}` : zone.name };
  }
  const gate = parseGate(from);
  if (!gate) return { ok: false, reason: "unknown", options: nav.zones };
  const zones = zonesForGate(nav, gate);
  if (zones.length === 1) return { ok: true, origin: { kind: "gate", zone: zones[0].id, gate }, label: `Gate ${gate.label} · ${zones[0].name}` };
  return { ok: false, reason: zones.length ? "ambiguous" : "unknown", options: zones.length ? zones : nav.zones, gate };
}
