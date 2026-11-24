import type { Lounge } from "@/shared/data/types";
import type { AirportNav, NavZone } from "@/shared/data/airport-nav";
import { gateOf, loungesAt } from "./lounge-access";
import { linkKey, parseGate, zoneForLounge, type Origin, type Route } from "./wayfinding";
import {
  bestGap,
  cellAt,
  cellCenter,
  cellPath,
  gapsBetween,
  nearestCell,
  nearestSeeds,
  nudgeCell,
  rasterize,
  smoothCells,
  terminalRings,
  walkGrid,
  type Gap,
  type WalkGrid,
} from "./walkable";

/**
 * Geometry for the airport map: where gates, concourses and lounges are (in projected meters, from
 * public/airport-maps/<CODE>.json, built from OpenStreetMap by scripts/build-airport-maps.ts) and the route drawn
 * between them. Routes are found on the walkable grid (walkable.ts), so they stay inside the terminal buildings.
 * Pure, so it's testable without a browser.
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
/** "connector": a walk between buildings OSM doesn't connect (a tunnel or bridge that isn't mapped as a terminal). */
export type SegmentMode = "walk" | "train" | "bus" | "landside" | "connector";

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** True if an OSM terminal name belongs to this zone ("Terminal 4" ↔ "Terminal 4, Concourse A"). */
function zoneHasTerminal(zone: NavZone, terminalName: string | null): boolean {
  if (!terminalName) return false;
  const t = norm(terminalName);
  // Also match a building named for just the concourse ("Concourse B" for "Terminal 1, Concourse B"), or one with
  // the airport's name in front ("Washington-Dulles International Airport, Main Terminal").
  return [zone.name, ...(zone.terminals ?? [])]
    .map(norm)
    .some((z) => z === t || z.startsWith(t) || t.startsWith(z) || (Math.min(t.length, z.length) >= 9 && (z.endsWith(t) || t.endsWith(z))));
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
  if (inTerminal.length) return inTerminal;
  // The zone's own building is mapped but none of its gates are (LAX T5 mid-rebuild): gates tagged to another
  // building (LAX's remote Eagle terminal, gates 52A–I) aren't this zone's middle.
  if (data.terminals.some((t) => zoneHasTerminal(zone, t.name))) return byRule.filter((g) => !g.t);
  return byRule;
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

/** A rough middle for a zone without the walkable grid: its hub gate, else the middle of its terminal building. */
function roughAnchor(data: AirportMapData, zone: NavZone): Pt | null {
  const hub = hubGate(data, zone);
  if (hub) return [hub.x, hub.y];
  const shapes = data.terminals.filter((t) => zoneHasTerminal(zone, t.name));
  return centroid(shapes.flatMap((s) => s.rings.flat()));
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
  const anchor = roughAnchor(data, zone);
  if (!anchor) return [pick.x, pick.y];
  const best = same.reduce((a, b) => (Math.hypot(a.x - anchor[0], a.y - anchor[1]) <= Math.hypot(b.x - anchor[0], b.y - anchor[1]) ? a : b));
  return [best.x, best.y];
}

// --- Zones on the walkable grid ---------------------------------------------------------------------------------

interface ZoneInfo {
  zone: NavZone;
  /**
   * The middle of the zone, inside the building: where its train stops, its name goes and lounges without a gate
   * sit. A concourse's widest spot near the middle of its gates (the core where ATL's and DEN's trains stop); for a
   * zone without gates (a main hall or atrium), the roomiest spot in its building away from other zones' gates.
   */
  anchor: Pt | null;
}

interface ZoneIndex {
  g: WalkGrid;
  zones: ZoneInfo[];
  byId: Map<string, number>;
  /** Which zone each walkable cell belongs to: the nearest zone seed (gates, own building) by walking; -1 if none. */
  label: Int16Array;
  /** Components each zone's cells are in. */
  comps: Set<number>[];
  /** Where two zones meet (key pairKey(a, b)). */
  doors: Map<number, Pt>;
  gapCache: Map<string, Gap[]>;
  placements?: Map<string, Pt>;
}

const MAX_ZONES = 16;
const bit = (k: number) => 1 << k;
const pairKey = (a: number, b: number) => Math.min(a, b) * MAX_ZONES + Math.max(a, b);
const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);

const indexCache = new WeakMap<AirportMapData, WeakMap<AirportNav, ZoneIndex | null>>();

/** Zones laid out on the walkable grid (built once per map and nav), or null when the map has no buildings. */
function zoneIndex(data: AirportMapData, nav: AirportNav): ZoneIndex | null {
  let byNav = indexCache.get(data);
  if (!byNav) indexCache.set(data, (byNav = new WeakMap()));
  if (!byNav.has(nav)) byNav.set(nav, buildIndex(data, nav));
  return byNav.get(nav)!;
}

/** Best cell within `radius` meters of a cell by `score` (higher is better), among cells `ok` allows; -1 if none. */
function bestNear(g: WalkGrid, from: number, radius: number, ok: (cell: number) => boolean, score: (cell: number, d: number) => number): number {
  const fc = from % g.cols;
  const fr = (from - fc) / g.cols;
  const R = Math.ceil(radius / g.cell);
  let best = -1;
  let bestScore = -Infinity;
  for (let y = Math.max(0, fr - R); y <= Math.min(g.rows - 1, fr + R); y++) {
    for (let x = Math.max(0, fc - R); x <= Math.min(g.cols - 1, fc + R); x++) {
      const i = y * g.cols + x;
      if (!g.walk[i]) continue;
      const d = Math.hypot(x - fc, y - fr) * g.cell;
      if (d > radius || !ok(i)) continue;
      const s = score(i, d);
      if (s > bestScore) [best, bestScore] = [i, s];
    }
  }
  return best;
}

function buildIndex(data: AirportMapData, nav: AirportNav): ZoneIndex | null {
  const g = walkGrid(data);
  if (!g) return null;
  const n = g.cols * g.rows;
  const zones = nav.zones.slice(0, MAX_ZONES);
  const byId = new Map(zones.map((z, k) => [z.id, k]));

  // Which zones' buildings cover each cell (a bit per zone).
  const inZone = new Uint16Array(n);
  const rings = terminalRings(data);
  zones.forEach((z, k) => data.terminals.forEach((t, ti) => zoneHasTerminal(z, t.name) && rasterize(g, rings[ti], inZone, bit(k))));
  // Gates, moved onto the building when OSM puts them out at the aircraft stand.
  const gateCells = zones.map((z) => gatesInZone(data, z).map((gt) => nearestCell(g, [gt.x, gt.y], 60)).filter((c) => c >= 0));
  const allGates = gateCells.flat();
  const gateDist = allGates.length ? nearestSeeds(g, allGates.map((cell) => ({ cell, label: 0 }))).dist : null;

  // Seeds: each zone's gates, and the cells only its own buildings cover.
  const seeds: { cell: number; label: number }[] = [];
  gateCells.forEach((cells, k) => cells.forEach((cell) => seeds.push({ cell, label: k })));
  const best = zones.map(() => ({ cell: -1, score: -Infinity }));
  for (let i = 0; i < n; i++) {
    const m = inZone[i];
    if (!m || !g.walk[i]) continue;
    if ((m & (m - 1)) === 0) seeds.push({ cell: i, label: 31 - Math.clz32(m) });
    // A gate-less zone's middle: the roomiest spot in its buildings, away from other zones' gates (JFK T4's main
    // hall is the wide middle of the V, not the start of Concourse A or B).
    const score = Math.min(g.clear[i], 45) - (gateDist ? 0.5 * Math.max(0, 80 - gateDist[i]) : 0);
    for (let k = 0; k < zones.length; k++) if (m & bit(k) && !gateCells[k].length && score > best[k].score) best[k] = { cell: i, score };
  }
  const anchors: (Pt | null)[] = zones.map((z, k) => {
    if (gateCells[k].length) return null;
    if (best[k].cell >= 0) return cellCenter(g, best[k].cell);
    // Neither gates nor a building on the map: the middle of whatever is named like it, if that's near anything.
    const rough = roughAnchor(data, z);
    const c = rough ? nearestCell(g, rough, 300) : -1;
    return c >= 0 ? cellCenter(g, nudgeCell(g, c, 30, 20)) : null;
  });
  anchors.forEach((a, k) => a && seeds.push({ cell: cellAt(g, a), label: k }));
  const { label, dist: seedDist } = nearestSeeds(g, seeds);

  // Gated zones' middles: the roomiest spot near the hub gate within the zone (a concourse's core).
  zones.forEach((z, k) => {
    if (anchors[k]) return;
    const hub = hubGate(data, z);
    const h = hub ? nearestCell(g, [hub.x, hub.y], 150, (c) => label[c] === k) : -1;
    if (h < 0) return;
    const c = bestNear(g, h, 200, (i) => label[i] === k && g.comp[i] === g.comp[h], (i, d) => Math.min(g.clear[i], 30) - 0.08 * d);
    anchors[k] = cellCenter(g, c >= 0 ? c : h);
  });

  const comps = zones.map(() => new Set<number>());
  for (let i = 0; i < n; i++) if (label[i] >= 0) comps[label[i]].add(g.comp[i]);

  // Doors: where two zones' cells touch, at the point nearest both zones' seeds (the narrowest gap between them),
  // nudged to the middle of the passage.
  const doorAt = new Map<number, { i: number; j: number; v: number }>();
  for (let i = 0; i < n; i++) {
    const a = label[i];
    if (a < 0) continue;
    for (let side = 0; side < 2; side++) {
      const j = side === 0 ? i + 1 : i + g.cols;
      if (j >= n || (side === 0 && j % g.cols === 0)) continue;
      const b = label[j];
      if (b < 0 || b === a) continue;
      const key = pairKey(a, b);
      const v = seedDist[i] + seedDist[j];
      if (v < (doorAt.get(key)?.v ?? Infinity)) doorAt.set(key, { i, j, v });
    }
  }
  const doors = new Map<number, Pt>();
  for (const [key, { i, j }] of doorAt) {
    const [a, b] = [label[i], label[j]];
    const c = bestNear(g, i, 20, (x) => (label[x] === a || label[x] === b) && g.comp[x] === g.comp[i], (x, d) => Math.min(g.clear[x], 15) - 0.3 * d);
    doors.set(key, cellCenter(g, c >= 0 ? c : i));
  }

  return { g, zones: zones.map((zone, k) => ({ zone, anchor: anchors[k] })), byId, label, comps, doors, gapCache: new Map() };
}

/** Where a gate is, moved inside its concourse (off the facade or the apron, toward the middle). */
function gateSpot(ix: ZoneIndex, data: AirportMapData, k: number, label: string): Pt | null {
  const p = gatePoint(data, ix.zones[k].zone, label);
  if (!p) return null;
  const { g } = ix;
  let c = nearestCell(g, p, 150, (i) => ix.label[i] === k);
  if (c < 0) c = nearestCell(g, p, 150);
  if (c < 0) return null;
  return cellCenter(g, nudgeCell(g, c, 15, 12, (i) => ix.label[i] === ix.label[c]));
}

/** Pins sharing a spot spread out this far apart (meters), along the roomy middle of the building. */
const PIN_SPACING = 30;

/** A free spot for a pin near `p`, inside zone k, at least PIN_SPACING from the pins already placed. */
function freeSpot(ix: ZoneIndex, p: Pt, k: number, placed: Pt[]): Pt {
  const { g } = ix;
  const from = cellAt(g, p);
  if (from < 0) return p;
  for (const spacing of [PIN_SPACING, 20, 12]) {
    const c = bestNear(
      g,
      from,
      140,
      (i) => g.comp[i] === g.comp[from] && (k < 0 || ix.label[i] === k) && g.clear[i] >= Math.min(6, g.clear[from]) && placed.every((q) => dist(q, cellCenter(g, i)) >= spacing),
      (i, d) => Math.min(g.clear[i], 18) - 0.12 * d,
    );
    if (c >= 0) return cellCenter(g, c);
  }
  return p;
}

/** Every lounge at the airport placed on the map: by its gate, else at its zone's middle, never two on one spot. */
function placements(ix: ZoneIndex, data: AirportMapData, nav: AirportNav): Map<string, Pt> {
  if (ix.placements) return ix.placements;
  const out = new Map<string, Pt>();
  const items = loungesAt(data.code)
    .map((l) => {
      const zone = zoneForLounge(nav, l);
      const k = zone ? (ix.byId.get(zone.id) ?? -1) : -1;
      const gate = gateOf(l);
      const at = (k >= 0 && gate ? gateSpot(ix, data, k, gate) : null) ?? (k >= 0 ? ix.zones[k].anchor : null);
      return { l, k, at, gated: Boolean(gate) };
    })
    .filter((x): x is typeof x & { at: Pt } => x.at !== null)
    // Lounges by a gate keep their spot; the rest make room around them.
    .sort((a, b) => Number(b.gated) - Number(a.gated) || a.l.id.localeCompare(b.l.id));
  const placed: Pt[] = [];
  for (const { l, k, at } of items) {
    const p = placed.some((q) => dist(q, at) < 15) ? freeSpot(ix, at, k, placed) : at;
    placed.push(p);
    out.set(l.id, p);
  }
  ix.placements = out;
  return out;
}

/** The middle of a zone (see ZoneInfo.anchor); inside the building when the map has buildings. */
export function zoneAnchor(data: AirportMapData, nav: AirportNav, zone: NavZone): Pt | null {
  const ix = zoneIndex(data, nav);
  const k = ix?.byId.get(zone.id);
  return ix && k !== undefined ? ix.zones[k].anchor : roughAnchor(data, zone);
}

/** Zone names and where to write them on the map. */
export function zoneMarkers(data: AirportMapData, nav: AirportNav): { zone: NavZone; p: Pt }[] {
  return nav.zones.map((zone) => ({ zone, p: zoneAnchor(data, nav, zone) })).filter((m): m is { zone: NavZone; p: Pt } => m.p !== null);
}

export function loungePoint(data: AirportMapData, nav: AirportNav, l: Lounge): Pt | null {
  const ix = zoneIndex(data, nav);
  if (ix) {
    const placed = placements(ix, data, nav).get(l.id);
    if (placed) return placed;
    const zone = zoneForLounge(nav, l);
    const k = zone ? ix.byId.get(zone.id) : undefined;
    if (k === undefined) return null;
    const gate = gateOf(l);
    return (gate ? gateSpot(ix, data, k, gate) : null) ?? ix.zones[k].anchor;
  }
  const zone = zoneForLounge(nav, l);
  if (!zone) return null;
  const gate = gateOf(l);
  return (gate && gatePoint(data, zone, gate)) || roughAnchor(data, zone);
}

// --- Routes -----------------------------------------------------------------------------------------------------

export interface RouteGeometry {
  segments: { mode: SegmentMode; pts: Pt[] }[];
  start: Pt | null;
  end: Pt | null;
}

interface Piece {
  pts: Pt[];
  connector: boolean;
}

/** Zone regions don't touch but share a building (another zone in between): no door, just walk. */
const shareComponent = (ix: ZoneIndex, a: number, b: number) => [...ix.comps[a]].some((c) => ix.comps[b].has(c));

function gaps(ix: ZoneIndex, key: string, a: (cell: number) => boolean, b: (cell: number) => boolean): Gap[] {
  let found = ix.gapCache.get(key);
  if (!found) ix.gapCache.set(key, (found = gapsBetween(ix.g, a, b)));
  return found;
}

/** A cost multiplier that discourages cells of zones outside `allowed` (a bit mask), or none. */
const zonePenalty = (ix: ZoneIndex, allowed: number | null) =>
  allowed === null
    ? undefined
    : (c: number) => {
        const l = ix.label[c];
        return l < 0 || (allowed >> l) & 1 ? 1 : 4;
      };

/**
 * One walk through a run of zones joined by walkways (zone ids in order), from a point to a point: through the
 * doors where consecutive zones meet, each stretch kept to its two zones, then smoothed into a polyline down the
 * middle of the building. Buildings that aren't connected on the map are joined by a straight connector.
 */
function walkLeg(ix: ZoneIndex, zs: number[], from: Pt, to: Pt): Piece[] | null {
  const { g } = ix;
  type Sub = { from: Pt; to: Pt; allowed: number | null; connector?: boolean };
  const subs: Sub[] = [];
  let prev = from;
  let allowed: number | null = bit(zs[0]);
  for (let t = 0; t + 1 < zs.length; t++) {
    const [a, b] = [zs[t], zs[t + 1]];
    if (allowed !== null) allowed |= bit(b);
    const door = ix.doors.get(pairKey(a, b));
    if (door) {
      subs.push({ from: prev, to: door, allowed });
      prev = door;
      allowed = bit(a) | bit(b);
      continue;
    }
    if (ix.comps[a].size && ix.comps[b].size && !shareComponent(ix, a, b)) {
      const gap = bestGap(g, gaps(ix, `z${a}-${b}`, (c) => ix.label[c] === a, (c) => ix.label[c] === b), prev, to);
      if (gap) {
        const [pa, pb] = [cellCenter(g, gap.a), cellCenter(g, gap.b)];
        subs.push({ from: prev, to: pa, allowed }, { from: pa, to: pb, allowed: null, connector: true });
        prev = pb;
        allowed = bit(b);
        continue;
      }
    }
    allowed = null;
  }
  subs.push({ from: prev, to, allowed });

  const legMask = zs.reduce((m, z) => m | bit(z), 0);
  const inLeg = (c: number) => {
    const l = ix.label[c];
    return l < 0 || ((legMask >> l) & 1) === 1;
  };
  const pieces: Piece[] = [];
  let run: number[] = [];
  let runFrom: Pt = from;
  let runFree = false;
  const flush = (end: Pt) => {
    if (run.length) pieces.push({ pts: smoothCells(g, run, runFrom, end, runFree ? undefined : inLeg), connector: false });
    run = [];
    runFree = false;
  };
  const extend = (cells: number[], start: Pt, free: boolean) => {
    if (!run.length) runFrom = start;
    run.push(...(run.length && run[run.length - 1] === cells[0] ? cells.slice(1) : cells));
    runFree ||= free;
  };
  const connect = (a: Pt, b: Pt) => {
    flush(a);
    pieces.push({ pts: [a, b], connector: true });
  };
  for (const s of subs) {
    if (s.connector) {
      connect(s.from, s.to);
      continue;
    }
    const a = cellAt(g, s.from);
    const b = cellAt(g, s.to);
    if (a < 0 || b < 0 || !g.walk[a] || !g.walk[b]) return null;
    const pen = zonePenalty(ix, s.allowed);
    if (g.comp[a] === g.comp[b]) {
      extend(cellPath(g, a, b, pen)!, s.from, s.allowed === null);
      continue;
    }
    // The two ends are in buildings the map doesn't connect: cross where they come closest.
    const [ca, cb] = [g.comp[a], g.comp[b]];
    const gap = bestGap(g, gaps(ix, `c${ca}-${cb}`, (c) => g.comp[c] === ca, (c) => g.comp[c] === cb), s.from, s.to);
    if (!gap) {
      connect(s.from, s.to);
      continue;
    }
    const [pa, pb] = [cellCenter(g, gap.a), cellCenter(g, gap.b)];
    extend(cellPath(g, a, gap.a, pen)!, s.from, s.allowed === null);
    connect(pa, pb);
    extend(cellPath(g, gap.b, b, pen)!, pb, s.allowed === null);
  }
  flush(to);
  return pieces;
}

/** The route on the walkable grid, or null if a point can't be placed on it. */
function walkableRoute(ix: ZoneIndex, data: AirportMapData, nav: AirportNav, origin: Origin, route: Route, lounge: Lounge): RouteGeometry | null {
  const ks = route.zones.map((id) => ix.byId.get(id));
  if (!ks.length || ks.some((k) => k === undefined)) return null;
  const zs = ks as number[];
  const n = zs.length;
  const modes: SegmentMode[] = [];
  for (let i = 0; i < n - 1; i++) {
    const key = linkKey(route.zones[i], route.zones[i + 1]);
    const link = route.links.includes(key) ? nav.links.find((l) => linkKey(l.a, l.b) === key) : undefined;
    modes.push(link ? link.mode : "landside");
  }
  const start = (origin.kind === "gate" && origin.gate ? gateSpot(ix, data, zs[0], origin.gate.label) : null) ?? ix.zones[zs[0]].anchor;
  const end = loungePoint(data, nav, lounge);
  if (!start || !end || cellAt(ix.g, end) < 0 || !ix.g.walk[cellAt(ix.g, end)]) return null;

  const segments: RouteGeometry["segments"] = [];
  const same = (a: Pt, b: Pt) => a[0] === b[0] && a[1] === b[1];
  const push = (mode: SegmentMode, pts: Pt[]) => {
    if (pts.length < 2 || pts.every((p) => same(p, pts[0]))) return;
    const last = segments[segments.length - 1];
    if (last && last.mode === mode && same(last.pts[last.pts.length - 1], pts[0])) last.pts.push(...pts.slice(1));
    else segments.push({ mode, pts: [...pts] });
  };

  let cur = start;
  for (let i = 0; ; ) {
    // Walk through the zones joined by walkways, then ride (or go landside) to the next zone.
    let j = i;
    while (j < n - 1 && modes[j] === "walk") j++;
    const legEnd = j === n - 1 ? end : ix.zones[zs[j]].anchor;
    if (!legEnd) return null;
    const pieces = walkLeg(ix, zs.slice(i, j + 1), cur, legEnd);
    if (!pieces) return null;
    for (const p of pieces) push(p.connector ? "connector" : "walk", p.pts);
    if (j === n - 1) break;
    const mode = modes[j];
    let k = j + 1;
    if (mode !== "landside") while (k < n - 1 && modes[k] === mode) k++;
    // A ride stops at each zone on the way (the train's stations); landside goes from one zone's middle to the next.
    const stops = zs.slice(j, k + 1).map((z) => ix.zones[z].anchor);
    if (stops.some((s) => !s)) return null;
    push(mode, stops as Pt[]);
    cur = stops[stops.length - 1]!;
    i = k;
  }
  return { segments, start, end };
}

/**
 * The route as map segments: walks inside the buildings (down the middle of concourses, through the doors between
 * zones), rides (train/bus) as straight hops between the zones' stations, and landside hops between zones' middles.
 * Without building outlines (or if a point can't be placed on them) it falls back to following the gates.
 */
export function routeGeometry(data: AirportMapData, nav: AirportNav, origin: Origin, route: Route, lounge: Lounge): RouteGeometry {
  const ix = zoneIndex(data, nav);
  return (ix && walkableRoute(ix, data, nav, origin, route, lounge)) || gateFollowingRoute(data, nav, origin, route, lounge);
}

// --- Fallback without building outlines: follow the gates -------------------------------------------------------

interface Stop {
  pt: Pt;
  prefix?: string;
  number?: number;
}

const pathLength = (pts: Pt[]) => pts.slice(1).reduce((s, p, i) => s + dist(pts[i], p), 0);

/** Moving average over ±2 points, run twice: cancels the odd/even zig-zag between the two sides of a concourse. */
function smooth(pts: Pt[]): Pt[] {
  let out = pts;
  for (let pass = 0; pass < 2; pass++) {
    const src = out;
    out = src.map((p, i) => {
      if (i === 0 || i === src.length - 1) return p;
      const win = src.slice(Math.max(0, i - 2), Math.min(src.length, i + 3));
      return [win.reduce((s, q) => s + q[0], 0) / win.length, win.reduce((s, q) => s + q[1], 0) / win.length] as Pt;
    });
  }
  return out;
}

/**
 * A walk inside one zone: along the gates numbered between the two ends (smoothed so it runs down the middle of the
 * concourse), or straight when we can't tell or when the numbering wanders off (gates split across piers).
 */
function gateWalk(data: AirportMapData, zone: NavZone, from: Stop, to: Stop): Pt[] {
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
  const path = smooth(pts);
  const direct = dist(from.pt, to.pt);
  return pathLength(path) > direct * 1.25 + 40 ? [from.pt, to.pt] : path;
}

function stopAt(g: MapGate): Stop {
  const p = looseGate(g.ref);
  return { pt: [g.x, g.y], prefix: p?.prefix, number: p?.number };
}

function hubStop(data: AirportMapData, zone: NavZone): Stop | null {
  const hub = hubGate(data, zone);
  if (hub) return stopAt(hub);
  const a = roughAnchor(data, zone);
  return a ? { pt: a } : null;
}

function gateStop(data: AirportMapData, zone: NavZone, label: string | null | undefined): Stop | null {
  if (!label) return null;
  const pt = gatePoint(data, zone, label);
  const p = parseGate(label);
  return pt ? { pt, prefix: p?.prefix, number: p?.number } : null;
}

/**
 * Where a walk from one zone into the next crosses over: the closest pair of gates between them (the ends of two
 * connected concourses), or the gate nearest a zone that has no gates of its own (a main terminal or atrium).
 */
function crossing(data: AirportMapData, a: NavZone, b: NavZone): [Stop, Stop] | null {
  const ga = gatesInZone(data, a);
  const gb = gatesInZone(data, b);
  if (ga.length && gb.length) {
    let best: [MapGate, MapGate] = [ga[0], gb[0]];
    for (const x of ga) for (const y of gb) if (Math.hypot(x.x - y.x, x.y - y.y) < Math.hypot(best[0].x - best[1].x, best[0].y - best[1].y)) best = [x, y];
    return [stopAt(best[0]), stopAt(best[1])];
  }
  const nearest = (gates: MapGate[], to: Pt) => stopAt(gates.reduce((p, q) => (dist([p.x, p.y], to) <= dist([q.x, q.y], to) ? p : q)));
  const aa = roughAnchor(data, a);
  const ab = roughAnchor(data, b);
  if (!aa || !ab) return null;
  if (ga.length) return [nearest(ga, ab), { pt: ab }];
  if (gb.length) return [{ pt: aa }, nearest(gb, aa)];
  return [{ pt: aa }, { pt: ab }];
}

/**
 * The route without building outlines (unit-test fixtures, maps built in the browser without terminals): rides and
 * landside hops go hub to hub; walks between zones cross where the zones meet; inside each zone the path follows
 * the gates from where you enter to where you leave.
 */
function gateFollowingRoute(data: AirportMapData, nav: AirportNav, origin: Origin, route: Route, lounge: Lounge): RouteGeometry {
  const zone = (id: string) => nav.zones.find((z) => z.id === id)!;
  const zones = route.zones.map(zone);
  const n = zones.length;
  const segments: RouteGeometry["segments"] = [];
  const same = (a: Pt, b: Pt) => a[0] === b[0] && a[1] === b[1];
  const push = (mode: SegmentMode, pts: Pt[]) => {
    if (pts.length < 2 || pts.every((p) => same(p, pts[0]))) return;
    const last = segments[segments.length - 1];
    if (last && last.mode === mode && same(last.pts[last.pts.length - 1], pts[0])) last.pts.push(...pts.slice(1));
    else segments.push({ mode, pts: [...pts] });
  };

  const entry: (Stop | null)[] = zones.map(() => null);
  const exit: (Stop | null)[] = zones.map(() => null);
  const modes: SegmentMode[] = [];
  for (let i = 0; i < n - 1; i++) {
    const key = linkKey(route.zones[i], route.zones[i + 1]);
    const link = route.links.includes(key) ? nav.links.find((l) => linkKey(l.a, l.b) === key) : undefined;
    const mode: SegmentMode = link ? link.mode : "landside";
    modes.push(mode);
    const cross = mode === "walk" ? crossing(data, zones[i], zones[i + 1]) : null;
    exit[i] = cross ? cross[0] : hubStop(data, zones[i]);
    entry[i + 1] = cross ? cross[1] : hubStop(data, zones[i + 1]);
  }
  const startStop = (origin.kind === "gate" ? gateStop(data, zones[0], origin.gate?.label) : null) ?? exit[0] ?? hubStop(data, zones[0]);
  const endStop = gateStop(data, zones[n - 1], gateOf(lounge)) ?? entry[n - 1] ?? hubStop(data, zones[n - 1]);
  entry[0] = startStop;
  exit[n - 1] = endStop;

  for (let i = 0; i < n; i++) {
    const a = entry[i];
    const b = exit[i];
    if (a && b) push("walk", gateWalk(data, zones[i], a, b));
    const next = entry[i + 1];
    if (i < n - 1 && b && next) push(modes[i], [b.pt, next.pt]);
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

// DEBUG-REMOVE
export { zoneIndex as __debugIndex };
