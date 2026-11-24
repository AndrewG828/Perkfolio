import type { Lounge } from "@/shared/data/types";
import type { AirportNav, NavZone } from "@/shared/data/airport-nav";
import { gateOf, loungesAt } from "./lounge-access";
import { linkKey, navFor, parseGate, zoneForLounge, type Origin, type Route } from "./wayfinding";
import {
  cellAt,
  cellCenter,
  cellPath,
  fixedGap,
  gapsBetween,
  hasWalkGrid,
  walkGridStep,
  nearestCell,
  nearestSeeds,
  nudgeCell,
  rasterize,
  smoothCells,
  terminalRings,
  walkGrid,
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
/**
 * "connector": a walk between buildings OSM doesn't connect (a tunnel or bridge that isn't mapped as a terminal).
 * "seam": a stretch of a walk over a gap between buildings OSM draws a few meters apart.
 */
export type SegmentMode = "walk" | "train" | "bus" | "landside" | "connector" | "seam";

// --- Names and gates --------------------------------------------------------------------------------------------

/** A name reduced to letters and digits, without parentheses ("Concourse G (Building #7)") or plurals ("Concourses"). */
const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/\b(concourse|terminal|gate|pier|satellite)s\b/g, "$1")
    .replace(/[^a-z0-9]/g, "");

/** The places one OSM building name stands for: "Concourse A & B" is Concourse A and Concourse B. */
function nameParts(name: string): string[] {
  const parts = name
    .split(/\s*(?:&|\/|\+|\band\b)\s*/i)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length < 2) return [name];
  const head = parts[0].replace(/\S+$/, "");
  return parts.map((p, i) => (i > 0 && /^[a-z0-9]{1,2}$/i.test(p) ? `${head}${p}` : p));
}

/** The same name but for one typo before its last two characters ("Terminl 8"; never "Terminal A" for "Terminal E"). */
function nearlyEqual(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.min(a.length, b.length) < 8 || Math.abs(a.length - b.length) > 1 || a.slice(-2) !== b.slice(-2)) return false;
  const [s, t] = a.length <= b.length ? [a, b] : [b, a];
  let i = 0;
  while (i < s.length && s[i] === t[i]) i++;
  return s.slice(i) === t.slice(i + 1) || (s.length === t.length && s.slice(i + 1) === t.slice(i + 1));
}

const namesMatch = (z: string, t: string) =>
  z === t || z.startsWith(t) || t.startsWith(z) || (Math.min(t.length, z.length) >= 9 && (z.endsWith(t) || t.endsWith(z))) || nearlyEqual(z, t);

/**
 * True if an OSM terminal name belongs to this zone ("Terminal 4" ↔ "Terminal 4, Concourse A"). Also a building
 * named for just the concourse ("Concourse B" for "Terminal 1, Concourse B"), one with the airport's name in front
 * ("Washington-Dulles International Airport, Main Terminal"), and one named for several ("Concourse A & B").
 */
function zoneHasTerminal(zone: NavZone, terminalName: string | null): boolean {
  if (!terminalName) return false;
  const names = [zone.name, ...(zone.terminals ?? [])].map(norm).filter(Boolean);
  return nameParts(terminalName)
    .map(norm)
    .filter(Boolean)
    // A terminal's main hall (SFO's "International Terminal Main Hall") is before security: no zone of gates'.
    .filter((t) => !(zone.gates?.length && t.endsWith("mainhall") && !names.some((z) => z.endsWith("mainhall"))))
    .some((t) => names.some((z) => namesMatch(z, t)));
}

const centroid = (pts: Pt[]): Pt | null =>
  pts.length ? [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length] : null;

/** OSM gate refs can be "C15/C16", "E38A", "3AB" or "31A,B,C,D": read the first gate in them. */
function looseGate(ref: string) {
  const m = /^([A-Z]{0,2})-?(\d{1,3})/.exec(ref);
  return m ? parseGate(`${m[1]}${m[2]}`) : null;
}

/** True if an OSM gate ref covers this gate label ("C15/C16" covers C16; "E38A", "3AB" and "31A,B,C,D" cover theirs). */
function refCovers(ref: string, label: string) {
  return ref.split("/").some((part) => part === label || (part.startsWith(label) && /^[A-Z](?:,?[A-Z])*$/.test(part.slice(label.length))));
}

type MapGate = AirportMapData["gates"][number];

/** True if the zone's gate rules cover an OSM gate ref ("B18" in Concourse B; "52A" in LAX Terminal 5's 50–59). */
function coversGate(zone: NavZone, ref: string) {
  const p = looseGate(ref);
  return Boolean(p && (zone.gates ?? []).some((r) => r.prefix === p.prefix && (r.from === undefined || p.number >= r.from) && (r.to === undefined || p.number <= r.to)));
}

const zoneGateCache = new WeakMap<AirportMapData, Map<string, MapGate[]>>();

/**
 * The OSM gates in a zone: by its gate rules, and by the building OSM puts each gate in. A zone without gate rules
 * (Heathrow's terminals, where you can't start at a gate) has the gates in its own buildings that no other zone's
 * rules cover, so lounges there still go by their gates.
 */
function gatesInZone(data: AirportMapData, zone: NavZone): MapGate[] {
  let byZone = zoneGateCache.get(data);
  if (!byZone) zoneGateCache.set(data, (byZone = new Map()));
  const hit = byZone.get(zone.id);
  if (hit) return hit;
  const others = (navFor(data.code)?.zones ?? []).filter((z) => z.id !== zone.id);
  if (!zone.gates?.length) {
    const out = data.gates.filter((g) => zoneHasTerminal(zone, g.t) && !others.some((z) => coversGate(z, g.ref)));
    byZone.set(zone.id, out);
    return out;
  }
  // A gate drawn in a building another zone claims is that zone's if its number fits there too (JFK Terminal 1's
  // gate 9 isn't Terminal 8's); otherwise it's this zone's wherever OSM drew it (IAH's D7–D9, in Terminal C's outline).
  const mine = data.gates.filter((g) => coversGate(zone, g.ref) && !others.some((z) => coversGate(z, g.ref) && zoneHasTerminal(z, g.t)));
  const inTerminal = mine.filter((g) => zoneHasTerminal(zone, g.t));
  let out: MapGate[];
  if (inTerminal.length) {
    // Plus gates in buildings OSM names otherwise: numbered so only this zone fits (LAX's Midfield Satellite, gates
    // 201–210, for Tom Bradley), or continuing from the zone's own gates (ORD's E and F concourses off Terminal 2's
    // main building), but not a separate terminal with the same numbers (JFK Terminal 7's for Terminal 8).
    const rest = mine.filter((g) => !zoneHasTerminal(zone, g.t));
    out = [...inTerminal, ...rest.filter((g) => !others.some((z) => coversGate(z, g.ref)))];
    for (let grew = true; grew; ) {
      grew = false;
      for (const g of rest)
        if (!out.includes(g) && out.some((h) => Math.hypot(h.x - g.x, h.y - g.y) < 150)) {
          out.push(g);
          grew = true;
        }
    }
  } else if (data.terminals.some((t) => zoneHasTerminal(zone, t.name))) {
    // The zone's own building is mapped but none of its gates are (LAX T5 mid-rebuild): gates in another building
    // (LAX's remote Eagle terminal, gates 52A–I) aren't this zone's.
    out = mine.filter((g) => !g.t);
  } else out = mine;
  byZone.set(zone.id, out);
  return out;
}

/** The zone's hub gate: the gate nearest the middle of all its gates. */
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

const gateLabel = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

/**
 * A gate's label as OSM tags it, where the two differ: Heathrow Terminal 4's gates 1–25 are tagged 401–425 (the
 * terminal's number in front), so "gate 10" there is 410. Only for a zone without gate rules, numbered with one digit,
 * whose gates on the map are numbered that way and don't include the label as it is.
 */
function osmLabel(data: AirportMapData, zone: NavZone, label: string): string {
  const p = parseGate(label);
  if (!p || p.prefix || p.number >= 100 || zone.gates?.length || !/^\d$/.test(zone.id)) return label;
  const own = gatesInZone(data, zone);
  if (own.some((g) => refCovers(g.ref, p.label))) return label;
  const hundreds = Number(zone.id) * 100;
  const numbered = own.map((g) => looseGate(g.ref)).filter((q) => q && !q.prefix);
  const inBlock = numbered.filter((q) => q!.number >= hundreds && q!.number < hundreds + 100);
  return numbered.length && inBlock.length >= numbered.length / 2 ? String(hundreds + p.number) : label;
}

/**
 * OSM gates that are this gate: `own` are the zone's gates (gatesInZone); `loose` aren't in any zone's buildings
 * (untagged, or in a building no zone claims), so they're this gate only if they're in the zone's area. Same-numbered
 * gates in another zone's terminal (JFK Terminal 1's gate 9 for Terminal 8) are neither.
 */
function gateCandidates(data: AirportMapData, zone: NavZone, label: string) {
  const ref = gateLabel(label);
  const same = data.gates.filter((g) => refCovers(g.ref, ref));
  const mine = new Set(gatesInZone(data, zone));
  const zones = navFor(data.code)?.zones ?? [zone];
  return {
    own: same.filter((g) => mine.has(g)),
    loose: same.filter((g) => !mine.has(g) && !zones.some((z) => zoneHasTerminal(z, g.t))),
  };
}

/**
 * Where a gate OSM doesn't have probably is: between the zone's gates numbered just below and above it (B20 between
 * B19 and B21), or next to the nearest one when only one side is close (CLT A20 next to A21). Gates numbered like it,
 * odd or even, come first: they're on its side of the concourse where the sides alternate (JFK Terminal 8's gate 9 is
 * with 7, not across from 10). Null when no gate within a few numbers is mapped (IAH B12, when only B40 and up are).
 */
function estimateGate(data: AirportMapData, zone: NavZone, label: string): Pt | null {
  const p = parseGate(label);
  if (!p) return null;
  const all = gatesInZone(data, zone).flatMap((g) => {
    const q = looseGate(g.ref);
    return q && q.prefix === p.prefix && q.number !== p.number ? [{ n: q.number, pt: [g.x, g.y] as Pt }] : [];
  });
  const sameSide = all.filter((x) => (x.n - p.number) % 2 === 0 && Math.abs(x.n - p.number) <= 4);
  const numbered = sameSide.length ? all.filter((x) => (x.n - p.number) % 2 === 0) : all;
  const below = numbered.filter((x) => x.n < p.number && p.number - x.n <= 4);
  const above = numbered.filter((x) => x.n > p.number && x.n - p.number <= 4);
  const lo = below.length ? Math.max(...below.map((x) => x.n)) : null;
  const hi = above.length ? Math.min(...above.map((x) => x.n)) : null;
  const at = (n: number) => numbered.filter((x) => x.n === n).map((x) => x.pt);
  if (lo !== null && hi !== null) {
    // The closest pair of nodes with those numbers (a gate can have several), if they're on the same pier.
    let best: [Pt, Pt] | null = null;
    for (const a of at(lo)) for (const b of at(hi)) if (!best || dist(a, b) < dist(best[0], best[1])) best = [a, b];
    if (best && dist(best[0], best[1]) <= 70 * (hi - lo)) {
      const t = (p.number - lo) / (hi - lo);
      return [best[0][0] + (best[1][0] - best[0][0]) * t, best[0][1] + (best[1][1] - best[0][1]) * t];
    }
  }
  const near = [lo, hi].filter((n): n is number => n !== null && Math.abs(n - p.number) <= 2).sort((a, b) => Math.abs(a - p.number) - Math.abs(b - p.number))[0];
  return near === undefined ? null : centroid(at(near));
}

/** Where a specific gate is (e.g. "B18" in zone B): the zone's OSM gate, else an estimate from its neighbours. */
export function gatePoint(data: AirportMapData, zone: NavZone, name: string): Pt | null {
  const label = osmLabel(data, zone, name);
  const { own, loose } = gateCandidates(data, zone, label);
  const anchor = roughAnchor(data, zone);
  const nearest = (gates: MapGate[]) =>
    gates.length ? gates.reduce((a, b) => (!anchor || dist([a.x, a.y], anchor) <= dist([b.x, b.y], anchor) ? a : b)) : null;
  const g = nearest(own);
  if (g) return [g.x, g.y];
  const est = estimateGate(data, zone, label);
  if (est) return est;
  // Untagged, or in a building no zone claims: only if it's near the zone's other gates.
  const l = nearest(loose);
  return l && (!anchor || dist([l.x, l.y], anchor) < 400) ? [l.x, l.y] : null;
}

// --- Zones on the walkable grid ---------------------------------------------------------------------------------

interface ZoneInfo {
  zone: NavZone;
  /**
   * The middle of the zone, inside the building: where its train stops, its name goes and lounges without a gate
   * sit. For a concourse, a roomy spot near the middle of its part of the building (the core where ATL's and DEN's
   * trains stop; mid-arc on DFW's curved terminals); for a zone without gates (a main hall or atrium), a roomy spot on
   * the side of the zones it connects to, a little away from other zones' gates.
   */
  anchor: Pt | null;
}

interface Crossing {
  a: Pt;
  b: Pt;
  d: number;
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
  /** Fixed places to cross between zones or buildings the map doesn't join (one per pair, whatever the route). */
  crossings: Map<string, Crossing | null>;
  placements?: Map<string, Pt>;
  markers?: ZoneMarker[];
  /** Crossings still to work out ahead of the first route (see prepareMapStep); empty once they all are. */
  pending?: (() => void)[];
}

const MAX_ZONES = 16;
const bit = (k: number) => 1 << k;
const pairKey = (a: number, b: number) => Math.min(a, b) * MAX_ZONES + Math.max(a, b);
const dist = (a: Pt, b: Pt) => Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2);

const indexCache = new WeakMap<AirportMapData, WeakMap<AirportNav, ZoneIndex | null>>();
const indexJobs = new WeakMap<AirportMapData, WeakMap<AirportNav, Generator<void, ZoneIndex | null>>>();

/** Zones laid out on the walkable grid (built once per map and nav), or null when the map has no buildings. */
function zoneIndex(data: AirportMapData, nav: AirportNav): ZoneIndex | null {
  while (!zoneIndexStep(data, nav));
  return indexCache.get(data)!.get(nav)!;
}

/** Does the next piece of laying out the zones (see buildIndex); true once they are. */
function zoneIndexStep(data: AirportMapData, nav: AirportNav): boolean {
  let byNav = indexCache.get(data);
  if (!byNav) indexCache.set(data, (byNav = new WeakMap()));
  if (byNav.has(nav)) return true;
  let jobs = indexJobs.get(data);
  if (!jobs) indexJobs.set(data, (jobs = new WeakMap()));
  let job = jobs.get(nav);
  if (!job) jobs.set(nav, (job = buildIndex(data, nav)));
  const step = job.next();
  if (!step.done) return false;
  byNav.set(nav, step.value);
  jobs.delete(nav);
  return true;
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
      const d = Math.sqrt((x - fc) ** 2 + (y - fr) ** 2) * g.cell;
      if (d > radius || !ok(i)) continue;
      const s = score(i, d);
      if (s > bestScore) [best, bestScore] = [i, s];
    }
  }
  return best;
}

/**
 * Mean distance from each of `cells` to `pts`, with points closer than 40 m to one already counted left out (so a
 * dense patch counts about as much as the same area elsewhere), and at most 24 of them: plenty for a smooth mean.
 */
function meanDistances(g: WalkGrid, cells: number[], pts: Pt[]): Float64Array {
  const spread: Pt[] = [];
  for (const p of pts) if (!spread.some((q) => dist(p, q) < 40)) spread.push(p);
  const step = Math.max(1, Math.ceil(spread.length / 24));
  const sample = spread.filter((_, i) => i % step === 0);
  const out = new Float64Array(cells.length);
  const [qx, qy] = [Float64Array.from(sample, (q) => q[0]), Float64Array.from(sample, (q) => q[1])];
  for (let x = 0; x < cells.length; x++) {
    const c = cells[x] % g.cols;
    const px = g.x0 + (c + 0.5) * g.cell;
    const py = g.y0 + ((cells[x] - c) / g.cols + 0.5) * g.cell;
    let s = 0;
    for (let k = 0; k < qx.length; k++) s += Math.sqrt((px - qx[k]) ** 2 + (py - qy[k]) ** 2);
    out[x] = s / qx.length;
  }
  return out;
}


const minOf = (xs: ArrayLike<number>) => {
  let m = Infinity;
  for (let i = 0; i < xs.length; i++) if (xs[i] < m) m = xs[i];
  return m;
};

/** Lays out the zones on the walkable grid, in pieces (it yields between them) so it can run over idle callbacks. */
function* buildIndex(data: AirportMapData, nav: AirportNav): Generator<void, ZoneIndex | null> {
  const g = walkGrid(data);
  if (!g) return null;
  const n = g.cols * g.rows;
  const zones = nav.zones.slice(0, MAX_ZONES);
  const byId = new Map(zones.map((z, k) => [z.id, k]));

  // Which zones' buildings cover each cell (a bit per zone).
  const inZone = new Uint16Array(n);
  const rings = terminalRings(data);
  data.terminals.forEach((t, ti) => {
    const mask = zones.reduce((m, z, k) => (zoneHasTerminal(z, t.name) ? m | bit(k) : m), 0);
    if (mask) rasterize(g, rings[ti], inZone, mask);
  });
  // Gates, moved onto the building when OSM puts them out at the aircraft stand.
  const zoneGates = zones.map((z) =>
    gatesInZone(data, z)
      .map((gt) => ({ gt, cell: nearestCell(g, [gt.x, gt.y], 60) }))
      .filter((x) => x.cell >= 0),
  );
  const gateCells = zoneGates.map((zg) => zg.map((x) => x.cell));
  const allGates = gateCells.flat();
  let gateDist: Float64Array | null | undefined;
  /** Meters walked from each cell to the nearest gate of any zone (computed when first needed). */
  const distToGates = () => (gateDist ??= allGates.length ? nearestSeeds(g, allGates.map((cell) => ({ cell, label: 0 }))).dist : null);

  // Seeds: each zone's gates, and the cells only its own buildings cover.
  const seeds: { cell: number; label: number }[] = [];
  gateCells.forEach((cells, k) => cells.forEach((cell) => seeds.push({ cell, label: k })));
  const own: number[][] = zones.map(() => []);
  for (let i = 0; i < n; i++) {
    const m = inZone[i];
    if (!m || !g.walk[i]) continue;
    if ((m & (m - 1)) === 0) seeds.push({ cell: i, label: 31 - Math.clz32(m) });
    for (let k = 0; k < zones.length; k++) if (m & bit(k)) own[k].push(i);
  }
  /** Zones joined to zone k by any link (walkway, train, bus) that have gates on the map. */
  const linkedTo = (k: number) =>
    nav.links
      .filter((l) => l.a === zones[k].id || l.b === zones[k].id)
      .map((l) => ({ mode: l.mode, j: byId.get(l.a === zones[k].id ? l.b : l.a) }))
      .filter((x): x is { mode: typeof x.mode; j: number } => x.j !== undefined && gateCells[x.j].length > 0);

  /**
   * A gate-less zone's middle (a main hall, an atrium), in its own buildings. Between the gated zones it opens onto
   * by walkway when there are two or more (JFK T4's main hall is between Concourses A and B, not the AirTrain
   * building at the end of the same outline); else on the side facing the zones it links to (IAD's AeroTrain leaves
   * the main terminal on its south side, DEN's trains the north end of Jeppesen); else the roomiest spot near the
   * middle of its buildings. Always a little away from other zones' gates.
   */
  const gatelessAnchor = (k: number): Pt | null => {
    const z = zones[k];
    const cells = own[k];
    if (!cells.length) {
      // No building on the map: the middle of whatever is named like it, if that's near anything.
      const rough = roughAnchor(data, z);
      const c = rough ? nearestCell(g, rough, 300) : -1;
      return c >= 0 ? cellCenter(g, nudgeCell(g, c, 30, 20)) : null;
    }
    const links = linkedTo(k);
    const walkLinked = [...new Set(links.filter((x) => x.mode === "walk").map((x) => x.j))];
    const gateTerm = (i: number) => {
      const gd = distToGates();
      return gd ? 0.3 * Math.max(0, 60 - gd[i]) : 0;
    };
    let score: ((i: number, x: number) => number) | null = null;
    if (walkLinked.length) {
      // Walking distance to each of those zones' gates: least in total (and evenly split) on the way between them;
      // with one, near the walkway to it (IAD's main terminal by the Z gates, not out in the landside hall).
      const fields = walkLinked.map((j) => nearestSeeds(g, gateCells[j].map((cell) => ({ cell, label: 0 }))).dist);
      const cost = new Float64Array(cells.length);
      let least = Infinity;
      cells.forEach((i, x) => {
        let [sum, lo, hi] = [0, Infinity, -Infinity];
        for (const f of fields) [sum, lo, hi] = [sum + f[i], Math.min(lo, f[i]), Math.max(hi, f[i])];
        cost[x] = sum + 0.5 * (hi - lo);
        least = Math.min(least, cost[x]);
      });
      if (Number.isFinite(least))
        score =
          walkLinked.length >= 2
            ? (i, x) => Math.min(g.clear[i], 40) - 0.15 * (cost[x] - least)
            : (i, x) => Math.min(g.clear[i], 15) - 0.15 * (cost[x] - least) - gateTerm(i);
    }
    if (!score && links.length) {
      const toward = meanDistances(g, cells, [...new Set(links.map((x) => x.j))].flatMap((j) => gateCells[j].map((c) => cellCenter(g, c))));
      const least = minOf(toward);
      score = (i, x) => Math.min(g.clear[i], 15) - 0.25 * (toward[x] - least) - gateTerm(i);
    }
    if (!score) {
      const mid = centroid(cells.map((i) => cellCenter(g, i)))!;
      score = (i) => {
        const [x, y] = cellCenter(g, i);
        return Math.min(g.clear[i], 40) - 0.05 * Math.hypot(x - mid[0], y - mid[1]) - gateTerm(i);
      };
    }
    let best = cells[0];
    let bestScore = -Infinity;
    cells.forEach((i, x) => {
      const v = score!(i, x);
      if (v > bestScore) [best, bestScore] = [i, v];
    });
    return cellCenter(g, best);
  };
  yield;
  const anchors: (Pt | null)[] = [];
  for (let k = 0; k < zones.length; k++) {
    anchors.push(gateCells[k].length ? null : gatelessAnchor(k));
    if (anchors[k]) yield;
  }
  anchors.forEach((a, k) => a && seeds.push({ cell: cellAt(g, a), label: k }));
  const { label, dist: seedDist } = nearestSeeds(g, seeds);
  yield;

  // How many of each zone's cells are in each component (building).
  const compCount = new Int32Array(zones.length * g.comps);
  for (let i = 0; i < n; i++) if (label[i] >= 0) compCount[label[i] * g.comps + g.comp[i]]++;
  const comps = zones.map((_, k) => new Set(Array.from({ length: g.comps }, (_, c) => c).filter((c) => compCount[k * g.comps + c] > 0)));

  // Gated zones' middles, in the zone's main building (the biggest one with its gates: JFK's Terminal 1, not the
  // gate-less New Terminal One next door). Candidates every other row and column.
  const candidates: number[][] = zones.map(() => []);
  for (let r = 0; r < g.rows; r += 2) for (let c = 0; c < g.cols; c += 2) if (label[r * g.cols + c] >= 0) candidates[label[r * g.cols + c]].push(r * g.cols + c);
  for (let k = 0; k < zones.length; k++) {
    if (anchors[k] || !zoneGates[k].length) continue;
    const withGates = [...new Set(zoneGates[k].map((x) => g.comp[x.cell]))];
    const main = withGates.reduce((a, b) => (compCount[k * g.comps + a] >= compCount[k * g.comps + b] ? a : b));
    let cells = candidates[k].filter((i) => g.comp[i] === main && (inZone[i] & bit(k)) !== 0);
    if (!cells.length) cells = candidates[k].filter((i) => g.comp[i] === main);
    if (!cells.length) {
      anchors[k] = cellCenter(g, zoneGates[k][0].cell);
      continue;
    }
    // Roomy (a concourse's core, where the trains stop) but central: the mean distance to the rest of the zone's part
    // of the building grows slowly along a concourse (DEN C's core is well off the middle of its gates) and fast
    // toward the end of an arc (DFW B's middle is mid-arc, not the roomy hall at one end).
    const mean = meanDistances(g, cells, cells.filter((_, x) => x % Math.max(1, Math.floor(cells.length / 400)) === 0).map((i) => cellCenter(g, i)));
    const least = minOf(mean);
    let best = cells[0];
    let bestScore = -Infinity;
    cells.forEach((i, x) => {
      // Never on a narrow neck (SEA's Concourse C where it joins the main terminal).
      const v = Math.min(g.clear[i], 45) - 0.5 * (mean[x] - least) - 2 * Math.max(0, 12 - g.room[i]);
      if (v > bestScore) [best, bestScore] = [i, v];
    });
    anchors[k] = cellCenter(g, nudgeCell(g, best, 6, 25, (i) => label[i] === k));
    yield;
  }

  // Doors: where two zones' cells touch, at the point nearest both zones' seeds (the narrowest gap between them),
  // moved to the roomiest spot of the passage nearby.
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
    const c = bestNear(g, i, 30, (x) => (label[x] === a || label[x] === b) && g.comp[x] === g.comp[i], (x, d) => Math.min(g.clear[x], 15) - 0.25 * d);
    doors.set(key, cellCenter(g, c >= 0 ? c : i));
  }

  return { g, zones: zones.map((zone, k) => ({ zone, anchor: anchors[k] })), byId, label, comps, doors, crossings: new Map() };
}

/**
 * Where a gate is, moved inside its concourse (off the facade or the apron, toward the middle): the zone's OSM gate,
 * an untagged one in the zone's area, else an estimate from the gates either side (`exact` false). Null when the
 * gate isn't on the map or what we found isn't in the zone (a remote stand, a same-numbered gate elsewhere).
 */
function gateSpot(ix: ZoneIndex, data: AirportMapData, k: number, name: string): { p: Pt; exact: boolean } | null {
  const { g } = ix;
  const zone = ix.zones[k].zone;
  const label = osmLabel(data, zone, name);
  const inZone = (i: number) => ix.label[i] === k;
  const snap = (p: Pt, radius: number): Pt | null => {
    let c = nearestCell(g, p, radius, inZone);
    if (c < 0) return null;
    // Off a jet bridge or a sliver OSM draws as part of the terminal (nowhere within 12 m is 6 m wide, like Heathrow
    // T5's): into the nearest roomy spot of the building, if it's not much further.
    if (bestNear(g, c, 12, (i) => g.room[i] >= 3, () => 0) < 0) {
      const roomy = nearestCell(g, p, Math.min(radius, dist(p, cellCenter(g, c)) + 60), (i) => inZone(i) && g.room[i] >= 6);
      if (roomy >= 0) c = roomy;
    }
    // Well inside the concourse (about 9 m from the real wall where it's that wide), on the gate's side of it.
    return cellCenter(g, nudgeCell(g, c, 30, PIN_ROOM, inZone, g.room));
  };
  const { own, loose } = gateCandidates(data, zone, label);
  // A gate with several nodes (JFK's A6): the one nearest the zone's middle first.
  const anchor = ix.zones[k].anchor;
  const byMiddle = (gates: MapGate[]) => (anchor ? [...gates].sort((a, b) => dist([a.x, a.y], anchor) - dist([b.x, b.y], anchor)) : gates);
  for (const [gates, radius] of [
    [own, 120],
    [loose, 80],
  ] as const) {
    for (const gt of byMiddle(gates)) {
      const p = snap([gt.x, gt.y], radius);
      if (p) return { p, exact: true };
    }
  }
  const est = estimateGate(data, zone, label);
  const p = est && snap(est, 80);
  return p ? { p, exact: false } : null;
}

/** Room (m) a gate's pin (and the You marker at a gate) gets from the real wall, where the building is that wide. */
const PIN_ROOM = 9;
/** Pins sharing a spot spread out this far apart (meters), along the roomy middle of the building. */
const PIN_SPACING = 50;
/** Pins keep this far from zone middles, which the You marker (security, or a concourse with no gate given) uses. */
const MIDDLE_CLEARANCE = 40;

/** Distance from p to segment a–b. */
function segDist(p: Pt, a: Pt, b: Pt): number {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2)) : 0;
  return Math.sqrt((p[0] - a[0] - t * dx) ** 2 + (p[1] - a[1] - t * dy) ** 2);
}

/**
 * A free spot for a pin near `p`, inside zone k, away from the pins already placed, from zone middles (at least
 * `clearance`) and from the train lines into the zone (`rides`), so a train never runs through a pin before it stops;
 * toward `side` (a unit direction) when the lounge's location says which ("East side").
 */
function freeSpot(ix: ZoneIndex, p: Pt, k: number, placed: Pt[], middles: Pt[], opts: { rides?: [Pt, Pt][]; clearance?: number; side?: Pt | null } = {}): Pt {
  const { g } = ix;
  const { rides = [], clearance = MIDDLE_CLEARANCE, side = null } = opts;
  const from = cellAt(g, p);
  if (from < 0) return p;
  for (const spacing of [PIN_SPACING, 20, 12]) {
    const c = bestNear(
      g,
      from,
      140,
      (i) => {
        if (g.comp[i] !== g.comp[from] || ix.label[i] !== k || g.clear[i] < Math.min(6, g.clear[from])) return false;
        const q = cellCenter(g, i);
        return placed.every((o) => dist(o, q) >= spacing) && middles.every((m) => dist(m, q) >= Math.min(spacing, clearance));
      },
      (i, d) => {
        const q = cellCenter(g, i);
        const nearRide = rides.reduce((s, [a, b]) => s + Math.max(0, 30 - segDist(q, a, b)), 0);
        const toward = side ? 0.2 * ((q[0] - p[0]) * side[0] + (q[1] - p[1]) * side[1]) : 0;
        return Math.min(g.clear[i], 18) - 0.12 * d - 0.5 * nearRide + toward;
      },
    );
    if (c >= 0) return cellCenter(g, c);
  }
  return p;
}

/** The side of its concourse a lounge's location names ("East side", "north end"), as a unit direction, or null. */
function sideOf(l: Lounge): Pt | null {
  const m = /\b(east|west|north|south)(?:ern)?\b/i.exec(l.location ?? "");
  if (!m) return null;
  return ({ east: [1, 0], west: [-1, 0], north: [0, -1], south: [0, 1] } as Record<string, Pt>)[m[1].toLowerCase()];
}

/**
 * Every lounge at the airport placed on the map: by its gate (or where its gate probably is), else next to its zone's
 * middle (leaving the middle itself for the You marker, and off the train lines), never two on one spot.
 */
function placements(ix: ZoneIndex, data: AirportMapData, nav: AirportNav): Map<string, Pt> {
  if (ix.placements) return ix.placements;
  const out = new Map<string, Pt>();
  const items = loungesAt(data.code)
    .map((l) => {
      const zone = zoneForLounge(nav, l);
      const k = zone ? (ix.byId.get(zone.id) ?? -1) : -1;
      const gate = gateOf(l);
      const spot = k >= 0 && gate ? gateSpot(ix, data, k, gate) : null;
      return { l, k, at: spot?.p ?? (k >= 0 ? ix.zones[k].anchor : null), gated: spot !== null };
    })
    .filter((x): x is typeof x & { at: Pt } => x.at !== null)
    // Lounges by a gate keep their spot; the rest make room around them.
    .sort((a, b) => Number(b.gated) - Number(a.gated) || a.l.id.localeCompare(b.l.id));
  const placed: Pt[] = [];
  const middles = ix.zones.flatMap((z) => (z.anchor ? [z.anchor] : []));
  // Lines to keep pins without a gate off: the trains into the zone, and the walks across it between its middle and
  // the doors to the zones next to it (JFK T4's hall, between Concourses A and B), so a route doesn't run over them.
  const rides = (k: number): [Pt, Pt][] => {
    const mid = ix.zones[k].anchor;
    if (!mid) return [];
    const trains = nav.links
      .filter((l) => l.mode === "train" && (l.a === ix.zones[k].zone.id || l.b === ix.zones[k].zone.id))
      .flatMap((l) => {
        const j = ix.byId.get(l.a === ix.zones[k].zone.id ? l.b : l.a);
        const b = j === undefined ? null : ix.zones[j].anchor;
        return b ? [[b, mid] as [Pt, Pt]] : [];
      });
    const doors = ix.zones.flatMap((_, j) => (j !== k && ix.doors.has(pairKey(j, k)) ? [ix.doors.get(pairKey(j, k))!] : []));
    const walks = [...doors.map((d) => [mid, d] as [Pt, Pt]), ...doors.flatMap((d, x) => doors.slice(x + 1).map((e) => [d, e] as [Pt, Pt]))];
    return [...trains, ...walks];
  };
  for (const { l, k, at, gated } of items) {
    // A lounge by a gate stays there, just off the zone's middle (where the You marker goes) if it's right on it.
    const crowded = placed.some((q) => dist(q, at) < 15) || middles.some((m) => dist(m, at) < (gated ? 15 : MIDDLE_CLEARANCE));
    const p = crowded ? freeSpot(ix, at, k, placed, middles, gated ? { clearance: 20 } : { rides: rides(k), side: sideOf(l) }) : at;
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

/** The zone a point on the map is in (by the walkable grid), or null outside the buildings. */
export function zoneAt(data: AirportMapData, nav: AirportNav, p: Pt): string | null {
  const ix = zoneIndex(data, nav);
  const i = ix ? cellAt(ix.g, p) : -1;
  return ix && i >= 0 && ix.label[i] >= 0 ? ix.zones[ix.label[i]].zone.id : null;
}

export interface ZoneMarker {
  zone: NavZone;
  /** The zone's middle (see ZoneInfo.anchor). */
  p: Pt;
  /** A few other roomy spots in the zone, 70 m+ apart, for its name when the middle is busy with pins or the route. */
  alt: Pt[];
}

/** Zone names and where to write them on the map. */
export function zoneMarkers(data: AirportMapData, nav: AirportNav): ZoneMarker[] {
  const ix = zoneIndex(data, nav);
  if (!ix) return nav.zones.flatMap((zone) => (roughAnchor(data, zone) ? [{ zone, p: roughAnchor(data, zone)!, alt: [] }] : []));
  if (ix.markers) return ix.markers;
  const { g } = ix;
  // Roomy cells of each zone, every other row and column (plenty for picking a few spots).
  const cells: number[][] = ix.zones.map(() => []);
  for (let r = 0; r < g.rows; r += 2) {
    for (let c = 0; c < g.cols; c += 2) {
      const i = r * g.cols + c;
      if (ix.label[i] >= 0 && g.clear[i] >= 6) cells[ix.label[i]].push(i);
    }
  }
  ix.markers = ix.zones.flatMap(({ zone, anchor }, k) => {
    if (!anchor) return [];
    const comp = g.comp[cellAt(g, anchor)];
    const chosen: Pt[] = [anchor];
    for (let t = 0; t < 5; t++) {
      let best: Pt | null = null;
      let bestScore = -Infinity;
      for (const i of cells[k]) {
        if (g.comp[i] !== comp) continue;
        const p = cellCenter(g, i);
        const d = dist(p, anchor);
        if (d > 350 || chosen.some((q) => dist(q, p) < 70)) continue;
        const score = Math.min(g.clear[i], 15) - 0.01 * d;
        if (score > bestScore) [best, bestScore] = [p, score];
      }
      if (!best) break;
      chosen.push(best);
    }
    return [{ zone, p: anchor, alt: chosen.slice(1) }];
  });
  return ix.markers;
}

export function loungePoint(data: AirportMapData, nav: AirportNav, l: Lounge): Pt | null {
  const ix = zoneIndex(data, nav);
  if (ix) return placements(ix, data, nav).get(l.id) ?? null;
  const zone = zoneForLounge(nav, l);
  if (!zone) return null;
  const gate = gateOf(l);
  return (gate && gatePoint(data, zone, gate)) || roughAnchor(data, zone);
}

/**
 * Builds everything the map needs for an airport up front (the walkable grid, zones, pins, zone names and the
 * crossings routes use), all at once: ~100–350 ms the first time; later calls return at once. A page does the same
 * in pieces with prepareMapStep.
 */
export function prepareMap(data: AirportMapData, nav: AirportNav): void {
  while (!prepareMapStep(data, nav));
}

/**
 * The same work in pieces of a few milliseconds each (the walkable grid, the zones, the pins, the zone names, then
 * each fixed crossing a route may need): does the next one and returns true once everything is ready, so a page can
 * spread it over idle callbacks instead of one long task, and no route works anything out while it renders.
 */
export function prepareMapStep(data: AirportMapData, nav: AirportNav): boolean {
  if (!hasWalkGrid(data)) {
    walkGridStep(data);
    return false;
  }
  if (!indexCache.get(data)?.has(nav)) {
    zoneIndexStep(data, nav);
    return false;
  }
  const ix = zoneIndex(data, nav);
  if (!ix) return true;
  if (!ix.placements) {
    placements(ix, data, nav);
    return false;
  }
  if (!ix.markers) {
    zoneMarkers(data, nav);
    return false;
  }
  if (!ix.pending) {
    // The crossings routes use: between walk-linked zones the map doesn't join, and between the buildings of a zone
    // spread over several (the order matters: a link's crossing works out its zone crossing first).
    const tasks: (() => void)[] = [];
    for (const l of nav.links) {
      const [a, b] = [ix.byId.get(l.a), ix.byId.get(l.b)];
      if (l.mode === "walk" && a !== undefined && b !== undefined && !ix.doors.has(pairKey(a, b))) tasks.push(() => linkCrossing(ix, a, b));
    }
    ix.comps.forEach((set, k) => {
      const list = [...set];
      list.forEach((ca, x) => list.slice(x + 1).forEach((cb) => tasks.push(() => buildingCrossing(ix, ca, cb, bit(k)))));
    });
    ix.pending = tasks;
    return tasks.length === 0;
  }
  ix.pending.shift()?.();
  return ix.pending.length === 0;
}

/** True once prepareMap (or every prepareMapStep) has run for this map and nav. */
export function isMapPrepared(data: AirportMapData, nav: AirportNav): boolean {
  const byNav = indexCache.get(data);
  if (!byNav?.has(nav)) return false;
  const ix = byNav.get(nav);
  return !ix || Boolean(ix.placements && ix.markers && ix.pending && ix.pending.length === 0);
}

// --- Routes -----------------------------------------------------------------------------------------------------

export interface RouteGeometry {
  segments: { mode: SegmentMode; pts: Pt[] }[];
  start: Pt | null;
  end: Pt | null;
  /**
   * For a start at a gate: "gate" when the map has it, "near-gate" when it's placed from the gates either side, and
   * "zone" when it isn't on the map (the start is then the zone's middle, so label it with the zone, not the gate).
   */
  startAt: "gate" | "near-gate" | "zone";
}

interface Piece {
  pts: Pt[];
  connector: boolean;
}

/** Meters walked inside the buildings from a point to a cell (Infinity if the buildings don't connect them). */
function walkLength(g: WalkGrid, from: Pt, to: number): number {
  const cells = cellPath(g, cellAt(g, from), to);
  return cells ? pathLength(cells.map((c) => cellCenter(g, c))) : Infinity;
}

/**
 * The one place to cross between two zones that don't touch on the map (a tunnel or bridge OSM doesn't map as a
 * terminal, like ORD's B–C walkway): the narrowest gap between them, and of those nearly as narrow, the one nearest
 * both zones' middles. Fixed per pair, so every route draws the walkway in the same place.
 */
function zoneCrossing(ix: ZoneIndex, a: number, b: number): Crossing | null {
  const [lo, hi] = a < b ? [a, b] : [b, a];
  const key = `z${lo}-${hi}`;
  if (!ix.crossings.has(key)) {
    const { g, label } = ix;
    const [ma, mb] = [ix.zones[lo].anchor, ix.zones[hi].anchor];
    const gap = ix.comps[lo].size && ix.comps[hi].size
      ? fixedGap(g, gapsBetween(g, (c) => label[c] === lo, (c) => label[c] === hi), (pa, pb) => 0.15 * ((ma ? dist(pa, ma) : 0) + (mb ? dist(pb, mb) : 0)))
      : null;
    ix.crossings.set(key, gap ? inward(ix, gap) : null);
  }
  const c = ix.crossings.get(key)!;
  return c && a > b ? { a: c.b, b: c.a, d: c.d } : c;
}

/**
 * How a walk between two walk-linked zones that don't touch on the map is drawn, the same for every route: at their
 * fixed crossing (a dotted connector), unless the buildings join their middles by a walk not much longer than the
 * one through the crossing (then through the buildings, and this is null). Decided once per pair, from the zones'
 * middles, so neighbouring gates never get two different drawings of the same walkway (IAH's D–E).
 */
function linkCrossing(ix: ZoneIndex, a: number, b: number): Crossing | null {
  const [lo, hi] = a < b ? [a, b] : [b, a];
  const key = `l${lo}-${hi}`;
  if (!ix.crossings.has(key)) {
    const { g } = ix;
    const cross = zoneCrossing(ix, lo, hi);
    const [ma, mb] = [ix.zones[lo].anchor, ix.zones[hi].anchor];
    let use = cross;
    if (cross && ma && mb) {
      const through = walkLength(g, ma, cellAt(g, mb));
      const via = walkLength(g, ma, cellAt(g, cross.a)) + cross.d + walkLength(g, cross.b, cellAt(g, mb));
      if (through <= via + Math.max(150, 3 * cross.d)) use = null;
    }
    ix.crossings.set(key, use);
  }
  const c = ix.crossings.get(key)!;
  return c && a > b ? { a: c.b, b: c.a, d: c.d } : c;
}

/** A gap's two ends moved a few meters in from the walls (the grid's outline is a cell wider than the building's). */
function inward(ix: ZoneIndex, gap: { a: number; b: number; d: number }): Crossing {
  const { g, label } = ix;
  const end = (c: number) => cellCenter(g, nudgeCell(g, c, 9, 4, (i) => label[i] === label[c], g.room));
  return { a: end(gap.a), b: end(gap.b), d: gap.d };
}

/**
 * The one place to cross between two buildings (components) of the zones in `mask` (a zone spread over buildings
 * the map doesn't join, like LAX's Midfield Satellite and Tom Bradley): the narrowest gap between their cells.
 */
function buildingCrossing(ix: ZoneIndex, ca: number, cb: number, mask: number): Crossing | null {
  const [lo, hi] = ca < cb ? [ca, cb] : [cb, ca];
  const key = `c${lo}-${hi}-${mask}`;
  if (!ix.crossings.has(key)) {
    const { g, label } = ix;
    const member = (comp: number) => (c: number) => g.comp[c] === comp && label[c] >= 0 && ((mask >> label[c]) & 1) === 1;
    const gap = fixedGap(g, gapsBetween(g, member(lo), member(hi)));
    ix.crossings.set(key, gap ? inward(ix, gap) : null);
  }
  const c = ix.crossings.get(key)!;
  return c && ca > cb ? { a: c.b, b: c.a, d: c.d } : c;
}

/**
 * The crossing between two buildings for a walk from cell `a` to cell `b` in zones `mask`: between the buildings of
 * a's zone when it has cells in b's building too (a zone spread over buildings, always crossed in the same place),
 * else between those of the walk's zones.
 */
function crossingFor(ix: ZoneIndex, a: number, b: number, mask: number): Crossing | null {
  const { g, label } = ix;
  const za = label[a];
  if (za >= 0 && ix.comps[za].has(g.comp[b])) {
    const own = buildingCrossing(ix, g.comp[a], g.comp[b], bit(za));
    if (own) return own;
  }
  return buildingCrossing(ix, g.comp[a], g.comp[b], mask);
}

/** A cost multiplier that discourages cells of zones outside `allowed` (a bit mask), or none. */
const zonePenalty = (ix: ZoneIndex, allowed: number | null) =>
  allowed === null
    ? undefined
    : (c: number) => {
        const l = ix.label[c];
        return l < 0 || (allowed >> l) & 1 ? 1 : 4;
      };

/** The door or crossing a walk through zones `zs` leaves its first zone by, or null if there's none (one zone). */
function firstWaypoint(ix: ZoneIndex, zs: number[]): Pt | null {
  return zs.length < 2 ? null : (ix.doors.get(pairKey(zs[0], zs[1])) ?? linkCrossing(ix, zs[0], zs[1])?.a ?? null);
}

/** The door or crossing a walk through zones `zs` enters its last zone by, or null if there's none (one zone). */
function lastWaypoint(ix: ZoneIndex, zs: number[]): Pt | null {
  const n = zs.length;
  return n < 2 ? null : (ix.doors.get(pairKey(zs[n - 2], zs[n - 1])) ?? linkCrossing(ix, zs[n - 2], zs[n - 1])?.b ?? null);
}

/**
 * One walk through a run of zones joined by walkways (zone indexes in order), from a point to a point: through the
 * doors where consecutive zones meet, each stretch kept to its two zones, then smoothed into a polyline down the
 * middle of the building. Zones that don't touch on the map are joined at their fixed crossing (a dotted connector),
 * or through the buildings, whichever linkCrossing decided for the pair. A connector only ever joins zones of this
 * walk; where the buildings don't connect a stretch any other way, there's no walk (null).
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
    const cross = linkCrossing(ix, a, b);
    if (cross) {
      subs.push({ from: prev, to: cross.a, allowed: allowed ?? bit(a) }, { from: cross.a, to: cross.b, allowed: null, connector: true });
      prev = cross.b;
      allowed = bit(b);
      continue;
    }
    allowed = null;
  }
  subs.push({ from: prev, to, allowed });

  const legMask = zs.reduce((m, z) => m | bit(z), 0);
  const pieces: Piece[] = [];
  let run: number[] = [];
  let runFrom: Pt = from;
  let runFree = false;
  const flush = (end: Pt) => {
    if (run.length) {
      // Shortcuts may cross the zones of this walk and any the path itself goes through (so a path that has to cut
      // through another zone still gets smoothed).
      let ok = legMask;
      for (const c of run) if (ix.label[c] >= 0) ok |= bit(ix.label[c]);
      const accept = runFree ? undefined : (c: number) => ix.label[c] < 0 || ((ok >> ix.label[c]) & 1) === 1;
      pieces.push({ pts: smoothCells(g, run, runFrom, end, accept), connector: false });
    }
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
    // A zone spread over buildings the map doesn't join: cross at their fixed crossing.
    const cross = crossingFor(ix, a, b, s.allowed ?? legMask);
    const [ca, cb] = cross ? [cellAt(g, cross.a), cellAt(g, cross.b)] : [-1, -1];
    if (!cross || g.comp[ca] !== g.comp[a] || g.comp[cb] !== g.comp[b]) return null;
    extend(cellPath(g, a, ca, pen)!, s.from, s.allowed === null);
    connect(cross.a, cross.b);
    extend(cellPath(g, cb, b, pen)!, cross.b, s.allowed === null);
  }
  flush(to);
  return pieces;
}

/** Where a bus pulls in at zone k coming from `toward`: the zone's facade on the way there, a little inside. */
function busStop(ix: ZoneIndex, k: number, toward: Pt): Pt | null {
  const { g } = ix;
  const anchor = ix.zones[k].anchor;
  if (!anchor) return null;
  const n = Math.ceil(dist(anchor, toward) / g.cell);
  for (let s = 0; s <= n; s++) {
    const p: Pt = [toward[0] + ((anchor[0] - toward[0]) * s) / n, toward[1] + ((anchor[1] - toward[1]) * s) / n];
    const i = cellAt(g, p);
    if (i >= 0 && ix.label[i] === k && g.comp[i] === g.comp[cellAt(g, anchor)]) return cellCenter(g, nudgeCell(g, i, 20, 8, (c) => ix.label[c] === k, g.room));
  }
  return anchor;
}

/**
 * A ride drawn as a gentle arc (buses and trips outside security), so it reads as a ride rather than a walk across
 * whatever is in between: of a few bows either side, the one over the fewest other buildings (a bus drives around
 * the piers in its way), the flattest of those, and one that doesn't set off back over the walk that came from
 * `from` (or arrive back over the one that goes on to `to`). An airside bus bows toward the runways, a trip outside
 * security away from them (to the landside roads), where that's no worse.
 */
function arc(ix: ZoneIndex, runways: Pt[][], area: "airside" | "landside", a: Pt, b: Pt, from: Pt | null = null, to: Pt | null = null): Pt[] {
  const { g, label } = ix;
  const len = dist(a, b);
  if (len < 1) return [a, b];
  const [nx, ny] = [-(b[1] - a[1]) / len, (b[0] - a[0]) / len];
  // The airfield's side of the line from a to b: toward the nearest runway.
  const mid: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  let near: Pt | null = null;
  for (const r of runways)
    for (let i = 1; i < r.length; i++) {
      const [dx, dy] = [r[i][0] - r[i - 1][0], r[i][1] - r[i - 1][1]];
      const t = Math.max(0, Math.min(1, ((mid[0] - r[i - 1][0]) * dx + (mid[1] - r[i - 1][1]) * dy) / (dx * dx + dy * dy || 1)));
      const q: Pt = [r[i - 1][0] + t * dx, r[i - 1][1] + t * dy];
      if (!near || dist(mid, q) < dist(mid, near)) near = q;
    }
  const airfield = near ? Math.sign((near[0] - mid[0]) * nx + (near[1] - mid[1]) * ny) : 0;
  const n = Math.max(24, Math.ceil(len / 12));
  const curve = (side: number, bow: number): Pt[] => {
    const c: Pt = [(a[0] + b[0]) / 2 + side * nx * bow * 2, (a[1] + b[1]) / 2 + side * ny * bow * 2];
    return Array.from({ length: n + 1 }, (_, i) => {
      const t = i / n;
      return [(1 - t) ** 2 * a[0] + 2 * (1 - t) * t * c[0] + t ** 2 * b[0], (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * c[1] + t ** 2 * b[1]] as Pt;
    });
  };
  // The two zones it joins, each in the building it's in there.
  const ends = [a, b].map((p) => cellAt(g, p)).filter((c) => c >= 0).map((c) => [label[c], g.comp[c]]);
  /** Meters of the curve over buildings other than the two it joins. */
  const over = (pts: Pt[]) => {
    let m = 0;
    for (const p of pts) {
      const c = cellAt(g, p);
      if (c >= 0 && g.walk[c] && !ends.some(([z, comp]) => label[c] === z && g.comp[c] === comp)) m++;
    }
    return (m * pathLength(pts)) / n;
  };
  /** Degrees a route turns at p, coming from q and going on to r (0 straight on, 180 straight back). */
  const turn = (q: Pt, p: Pt, r: Pt) => {
    const [u, v] = [[p[0] - q[0], p[1] - q[1]], [r[0] - p[0], r[1] - p[1]]];
    const lu = Math.hypot(u[0], u[1]);
    const lv = Math.hypot(v[0], v[1]);
    return lu < 5 || lv < 1 ? 0 : (Math.acos(Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1]) / (lu * lv)))) * 180) / Math.PI;
  };
  let best: Pt[] = [a, b];
  let bestScore = Infinity;
  for (const share of [0.2, 0.3, 0.45, 0.7]) {
    for (const side of [1, -1]) {
      const pts = curve(side, Math.min(share * len, 1500 * share));
      // Rounder arcs only to keep off buildings: each meter of detour costs as much as 0.15 m over a building; a
      // sharp turn back at either end as much as 30 m; the wrong side of the terminals (a bus over the landside
      // roads, a trip outside security over the airfield) as much as 60 m.
      const back = (from ? Math.max(0, turn(from, a, pts[2]) - 60) : 0) + (to ? Math.max(0, turn(pts[n - 2], b, to) - 60) : 0);
      const wrongSide = airfield !== 0 && side === (area === "airside" ? -airfield : airfield) ? 60 : 0;
      const score = over(pts) + 0.15 * (pathLength(pts) - len) + 0.3 * back + wrongSide;
      if (score < bestScore) [best, bestScore] = [pts, score];
    }
  }
  return best;
}

const pathLength = (pts: Pt[]) => pts.slice(1).reduce((s, p, i) => s + dist(pts[i], p), 0);

/** A walk to or from a ride keeps at least this long where it can (m), so the stop shows clear of the pin or You. */
const MIN_ACCESS = 45;

/**
 * Where to get on a ride (`pts` from its first stop) for a walk that comes from `toward` (your gate, or the door you
 * came in by). Where the ride's first `hops` hops pass `toward` clearly closer than its stop does, in the building of
 * one of `zones` (the ride's zone, and the one the walk comes through before it), it starts there instead: at the
 * point nearest `toward` that's past it (so the walk there and the ride head the same way), but not nearer than
 * MIN_ACCESS while there's room. So a ride never runs back past where you came from (IAD's AeroTrain leaves the main
 * terminal through the passage from the Z gates). Run on a reversed ride, it's where to get off for a walk on to
 * `toward` (the lounge, or the door to the next zone): before the ride runs past it (DFW's Skylink crosses Terminal
 * B's arc by the lounge on its way to the far tip). Returns the ride from that point on, and the zone it's in.
 */
function boardAt(ix: ZoneIndex, pts: Pt[], zones: number[], toward: Pt, hops: number): { pts: Pt[]; zone: number } {
  const { g, label } = ix;
  const c0 = cellAt(g, pts[0]);
  const stay = { pts, zone: zones[0] };
  if (c0 < 0 || pts.length < 2) return stay;
  const comp = g.comp[c0];
  const atStop = dist(pts[0], toward);
  // Points along the ride (every 2 m) where you could get on: in those zones' building, clear of its walls, and past
  // `toward` (the ride heads on away from it, or across: within 100° of straight on).
  const cands: { i: number; p: Pt; d: number; zone: number }[] = [];
  for (let i = 1; i < pts.length && i <= hops; i++) {
    const [a, b] = [pts[i - 1], pts[i]];
    const len = dist(a, b);
    const m = Math.max(1, Math.ceil(len / 2));
    for (let x = 1; x <= m; x++) {
      const p: Pt = [a[0] + ((b[0] - a[0]) * x) / m, a[1] + ((b[1] - a[1]) * x) / m];
      const c = cellAt(g, p);
      if (c < 0 || !g.walk[c] || !zones.includes(label[c]) || g.comp[c] !== comp || g.room[c] < 4) continue;
      const d = dist(p, toward);
      const ahead = len ? ((p[0] - toward[0]) * (b[0] - a[0]) + (p[1] - toward[1]) * (b[1] - a[1])) / len : 0;
      if (d <= atStop - 5 && ahead >= -0.17 * d) cands.push({ i, p, d, zone: label[c] });
    }
  }
  // Nearest at least MIN_ACCESS away; else the furthest of those a few steps away; else, when the stop is far, where
  // the ride passes (it starts right where you are).
  const floor = Math.min(MIN_ACCESS, atStop);
  const pick =
    cands.filter((x) => x.d >= floor).sort((a, b) => a.d - b.d)[0] ??
    cands.filter((x) => x.d >= 10).sort((a, b) => b.d - a.d)[0] ??
    (atStop > 60 ? [...cands].sort((a, b) => b.d - a.d)[0] : undefined);
  if (pick) return { pts: [pick.p, ...pts.slice(pick.i)], zone: pick.zone };
  // A train whose line passes the lounge outside the building, then stops far beyond it (DFW's Skylink by the
  // Admirals Club on Terminal B's arc, to the arc's far tip): its last hop bends a little (within 20°) to a station
  // MIN_ACCESS short of the lounge, where the building is, rather than the walk coming all the way back.
  if (hops !== 1 || atStop <= 60) return stay;
  const from = pts[1];
  const reach = dist(from, pts[0]);
  const heading = Math.atan2(pts[0][1] - from[1], pts[0][0] - from[0]);
  // Only where the line does pass the lounge first: beside it (within 120 m), well before the stop.
  const t = ((toward[0] - from[0]) * (pts[0][0] - from[0]) + (toward[1] - from[1]) * (pts[0][1] - from[1])) / (reach * reach || 1);
  if (t > 1 - 20 / Math.max(reach, 1) || segDist(toward, from, pts[0]) > 120) return stay;
  let best: { p: Pt; d: number; zone: number } | null = null;
  for (let deg = -20; deg <= 20; deg += 2) {
    const [ux, uy] = [Math.cos(heading + (deg * Math.PI) / 180), Math.sin(heading + (deg * Math.PI) / 180)];
    for (let r = Math.max(0, reach - 600); r <= reach + 20; r += 3) {
      const p: Pt = [from[0] + ux * r, from[1] + uy * r];
      const c = cellAt(g, p);
      if (c < 0 || !g.walk[c] || label[c] !== zones[0] || g.comp[c] !== comp || g.room[c] < 6) continue;
      const d = dist(p, toward);
      // The ride and the walk head the same way (or across), not back: `toward` is ahead of the station on the way
      // from the other stop (for a ride that ends there; for one that starts there, the walk comes from behind it).
      if (d < floor || d > atStop - 20 || (p[0] - toward[0]) * ux + (p[1] - toward[1]) * uy > 0.17 * d) continue;
      if (!best || d < best.d) best = { p, d, zone: label[c] };
    }
  }
  return best ? { pts: [best.p, ...pts.slice(1)], zone: best.zone } : stay;
}

/** The point `s` meters along a polyline. */
function pointAt(pts: Pt[], s: number): Pt {
  let done = 0;
  for (let i = 1; i < pts.length; i++) {
    const len = dist(pts[i - 1], pts[i]);
    if (done + len >= s && len > 0) {
      const t = (s - done) / len;
      return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t];
    }
    done += len;
  }
  return pts[pts.length - 1];
}

/** The part of a polyline up to `s` meters along it. */
function headOf(pts: Pt[], s: number): Pt[] {
  const out: Pt[] = [pts[0]];
  let done = 0;
  for (let i = 1; i < pts.length; i++) {
    const len = dist(pts[i - 1], pts[i]);
    if (done + len >= s) {
      out.push(pointAt([pts[i - 1], pts[i]], s - done));
      return out;
    }
    out.push(pts[i]);
    done += len;
  }
  return out;
}

/**
 * Where a walk (from `minAlong` meters along it to `maxAlong`) first comes within 12 m of a ride's line, at a point
 * of the line inside a building: the walk's position then, and the point and segment of the line it meets.
 */
function meetsLine(g: WalkGrid, walk: Pt[], line: Pt[], minAlong: number, maxAlong: number, backward: boolean): { s: number; q: Pt; seg: number } | null {
  const hit = (s: number) => {
    const p = pointAt(walk, s);
    for (let j = 1; j < line.length; j++) {
      const [a, b] = [line[j - 1], line[j]];
      const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
      const len2 = dx * dx + dy * dy;
      const t = len2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2)) : 0;
      const q: Pt = [a[0] + t * dx, a[1] + t * dy];
      const c = cellAt(g, q);
      if (dist(p, q) < 12 && c >= 0 && g.walk[c] && g.room[c] >= 2) return { s, q, seg: j - 1 };
    }
    return null;
  };
  if (backward) {
    for (let s = maxAlong; s >= minAlong; s -= 2) {
      const h = hit(s);
      if (h) return h;
    }
  } else {
    for (let s = minAlong; s <= maxAlong; s += 2) {
      const h = hit(s);
      if (h) return h;
    }
  }
  return null;
}

/**
 * Where a walk to a ride runs alongside the ride's line before it gets to the stop (a walk round DFW's Terminal B arc
 * meets the Skylink's line well before the station), the ride starts where the walk first comes up to its line, and
 * the rest of the walk goes; likewise where the walk from a ride runs back alongside it, the ride ends where the walk
 * last leaves its line. Leaves at least MIN_ACCESS of each walk, so the stop still shows apart from the You marker
 * and the pin.
 */
function untangle(g: WalkGrid, segments: RouteGeometry["segments"]) {
  for (let r = 0; r < segments.length; r++) {
    const ride = segments[r];
    if (ride.mode === "walk" || ride.mode === "connector") continue;
    // A train's first or last hop; the first or last 200 m of an arc.
    const startLine = ride.mode === "train" ? ride.pts.slice(0, 2) : headOf(ride.pts, 200);
    const prev = segments[r - 1];
    if (prev?.mode === "walk") {
      const len = pathLength(prev.pts);
      const m = meetsLine(g, prev.pts, startLine, Math.min(MIN_ACCESS, len), len - 15, false);
      if (m && m.seg + 1 < ride.pts.length) {
        prev.pts = [...headOf(prev.pts, m.s), m.q];
        ride.pts = [m.q, ...ride.pts.slice(m.seg + 1)];
      }
    }
    const back = [...ride.pts].reverse();
    const endLine = ride.mode === "train" ? back.slice(0, 2) : headOf(back, 200);
    const next = segments[r + 1];
    if (next?.mode === "walk") {
      const len = pathLength(next.pts);
      const m = meetsLine(g, next.pts, endLine, 15, len - Math.min(MIN_ACCESS, len), true);
      if (m && m.seg + 1 < back.length) {
        next.pts = [m.q, ...[...headOf([...next.pts].reverse(), len - m.s)].reverse()];
        ride.pts = [...back.slice(m.seg + 1)].reverse().concat([m.q]);
      }
    }
  }
}

/**
 * Where you leave the secure area from zone k: a zone with a checkpoint (where the exits are) that's a walk away, the
 * nearest by the nav's minutes (JFK's Terminal 4 main hall, from either concourse). The zones on the way there, k
 * first; just [k] when k has a checkpoint itself or none is a walk away.
 */
function exitPath(ix: ZoneIndex, nav: AirportNav, k: number): number[] {
  if (ix.zones[k].zone.checkpoint) return [k];
  const cost = new Map<number, number>([[k, 0]]);
  const prev = new Map<number, number>();
  const todo = new Set([k]);
  while (todo.size) {
    const cur = [...todo].reduce((x, y) => (cost.get(x)! <= cost.get(y)! ? x : y));
    todo.delete(cur);
    if (ix.zones[cur].zone.checkpoint) {
      const path = [cur];
      for (let z = cur; z !== k; ) path.unshift((z = prev.get(z)!));
      return path;
    }
    for (const l of nav.links) {
      if (l.mode !== "walk" || (l.a !== ix.zones[cur].zone.id && l.b !== ix.zones[cur].zone.id)) continue;
      const next = ix.byId.get(l.a === ix.zones[cur].zone.id ? l.b : l.a);
      if (next === undefined) continue;
      const c = cost.get(cur)! + l.minutes;
      if (c < (cost.get(next) ?? Infinity)) {
        cost.set(next, c);
        prev.set(next, cur);
        todo.add(next);
      }
    }
  }
  return [k];
}

/** The route on the walkable grid, or null if a point can't be placed on it. */
function walkableRoute(ix: ZoneIndex, data: AirportMapData, nav: AirportNav, origin: Origin, route: Route, lounge: Lounge): RouteGeometry | null {
  const ks = route.zones.map((id) => ix.byId.get(id));
  if (!ks.length || ks.some((k) => k === undefined)) return null;
  let zs = ks as number[];
  let modes: SegmentMode[] = [];
  for (let i = 0; i < zs.length - 1; i++) {
    const key = linkKey(route.zones[i], route.zones[i + 1]);
    const link = route.links.includes(key) ? nav.links.find((l) => linkKey(l.a, l.b) === key) : undefined;
    modes.push(link ? link.mode : "landside");
  }
  // Leaving the secure area: walk to the zone with the exits first (JFK's concourses through Terminal 4's main hall).
  const out = modes.indexOf("landside");
  if (out >= 0) {
    const path = exitPath(ix, nav, zs[out]);
    zs = [...zs.slice(0, out), ...path, ...zs.slice(out + 1)];
    modes = [...modes.slice(0, out), ...path.slice(1).map((): SegmentMode => "walk"), ...modes.slice(out)];
  }
  const n = zs.length;
  const spot = origin.kind === "gate" && origin.gate ? gateSpot(ix, data, zs[0], origin.gate.label) : null;
  const start = spot?.p ?? ix.zones[zs[0]].anchor;
  const startAt: RouteGeometry["startAt"] = spot ? (spot.exact ? "gate" : "near-gate") : "zone";
  const end = loungePoint(data, nav, lounge);
  if (!start || !end || cellAt(ix.g, end) < 0 || !ix.g.walk[cellAt(ix.g, end)]) return null;

  // The route as walks (runs of zones joined by walkways) between rides: runs[r] comes before rides[r].
  const runs: number[][] = [];
  const rides: { mode: SegmentMode; from: number; to: number; pts: Pt[] }[] = [];
  /** Where the run of walkways from zone index i ends (the next ride's first zone, or the last zone). */
  const runEnd = (i: number) => {
    let j = i;
    while (j < n - 1 && modes[j] === "walk") j++;
    return j;
  };
  for (let i = 0; ; ) {
    const j = runEnd(i);
    runs.push(zs.slice(i, j + 1));
    if (j === n - 1) break;
    const mode = modes[j];
    let k = j + 1;
    if (mode !== "landside") while (k < n - 1 && modes[k] === mode) k++;
    const stops = zs.slice(j, k + 1).map((z) => ix.zones[z].anchor);
    if (stops.some((s) => !s)) return null;
    const pts = stops as Pt[];
    if (mode === "bus") {
      // Buses pull in at the facades facing each other.
      pts[0] = busStop(ix, zs[j], pts[1]) ?? pts[0];
      pts[pts.length - 1] = busStop(ix, zs[k], pts[0]) ?? pts[pts.length - 1];
    }
    // Trains are straight hops between stations; buses and trips outside security are arcs, which set off away from
    // the walk that comes in (from its last door) and arrive away from the one that goes on (to its first door).
    let line = pts;
    if (mode !== "train") {
      const from = lastWaypoint(ix, runs[runs.length - 1]) ?? (rides.length ? rides[rides.length - 1].pts[rides[rides.length - 1].pts.length - 1] : start);
      const k2 = runEnd(k);
      const to = firstWaypoint(ix, zs.slice(k, k2 + 1)) ?? (k2 === n - 1 ? end : ix.zones[zs[k2]].anchor);
      const runways = data.runways as Pt[][];
      const area = mode === "bus" ? "airside" : "landside";
      line = pts.slice(1).flatMap((p, x) => arc(ix, runways, area, pts[x], p, x === 0 ? from : null, x === pts.length - 2 ? to : null).slice(x ? 1 : 0));
    }
    rides.push({ mode, from: zs[j], to: zs[k], pts: line });
    i = k;
  }
  // Get on and off each ride where the walks meet it (not past the lounge, or back past your gate): toward the last
  // door (or the start) of the walk before, and the first door (or the lounge, or the next ride) of the walk after.
  rides.forEach((ride, r) => {
    // A train's first and last hops; all of an arc. Getting on in the zone the walk comes through (or off in the one
    // it goes on to) leaves the zone of the stop out of that walk.
    const hops = ride.mode === "train" ? 1 : Infinity;
    const [run, next] = [runs[r], runs[r + 1]];
    const before = r === 0 ? start : rides[r - 1].pts[rides[r - 1].pts.length - 1];
    const on = boardAt(ix, ride.pts, [ride.from, ...run.slice(-2, -1)], lastWaypoint(ix, run) ?? before, hops);
    if (run.length > 1 && on.zone === run[run.length - 2]) runs[r] = run.slice(0, -1);
    const after = r + 1 < rides.length ? rides[r + 1].pts[0] : end;
    const off = boardAt(ix, [...on.pts].reverse(), [ride.to, ...next.slice(1, 2)], firstWaypoint(ix, next) ?? after, hops);
    if (next.length > 1 && off.zone === next[1]) runs[r + 1] = next.slice(1);
    ride.pts = off.pts.reverse();
  });

  const segments: RouteGeometry["segments"] = [];
  const same = (a: Pt, b: Pt) => a[0] === b[0] && a[1] === b[1];
  const push = (mode: SegmentMode, pts: Pt[]) => {
    if (pts.length < 2 || pts.every((p) => same(p, pts[0]))) return;
    const last = segments[segments.length - 1];
    if (last && last.mode === mode && same(last.pts[last.pts.length - 1], pts[0])) last.pts.push(...pts.slice(1));
    else segments.push({ mode, pts: [...pts] });
  };
  let cur = start;
  for (let r = 0; r < runs.length; r++) {
    const ride = rides[r];
    const pieces = walkLeg(ix, runs[r], cur, ride ? ride.pts[0] : end);
    if (!pieces) return null;
    for (const p of pieces) push(p.connector ? "connector" : "walk", p.pts);
    if (!ride) break;
    push(ride.mode, ride.pts);
    cur = ride.pts[ride.pts.length - 1];
  }
  untangle(ix.g, segments);
  return { segments: segments.flatMap((sg) => (sg.mode === "walk" ? splitSeams(ix.g, sg.pts) : [sg])), start, end, startAt };
}

/** Longest stretch of a walk drawn as a walk outside the real outline (m); a longer one is a seam. */
const SEAM = 6;

/**
 * A walk split where it crosses a gap between buildings OSM draws apart (more than SEAM meters outside the real
 * outline, like the 13–16 m between SFO's Boarding Area G and Terminal 3): those stretches are drawn dotted, as seams,
 * rather than as a solid walk over the apron.
 */
function splitSeams(g: WalkGrid, pts: Pt[]): RouteGeometry["segments"] {
  // Meters along the walk where it's outside the real outline, as [from, to] runs.
  const runs: [number, number][] = [];
  let done = 0;
  let runStart = -1;
  for (let i = 1; i < pts.length; i++) {
    const len = dist(pts[i - 1], pts[i]);
    const m = Math.max(1, Math.ceil(len));
    for (let k = 0; k < m; k++) {
      const at = done + ((k + 0.5) * len) / m;
      const c = cellAt(g, pointAt([pts[i - 1], pts[i]], (k + 0.5) * (len / m)));
      const out = c < 0 || g.room[c] === 0;
      if (out && runStart < 0) runStart = at;
      if (!out && runStart >= 0) {
        runs.push([runStart, at]);
        runStart = -1;
      }
    }
    done += len;
  }
  if (runStart >= 0) runs.push([runStart, done]);
  const seams = runs.filter(([a, b]) => b - a > SEAM && a > 0.5 && b < done - 0.5);
  if (!seams.length) return [{ mode: "walk", pts }];
  const out: RouteGeometry["segments"] = [];
  let from = 0;
  for (const [a, b] of seams) {
    out.push({ mode: "walk", pts: slice(pts, from, a) }, { mode: "seam", pts: slice(pts, a, b) });
    from = b;
  }
  out.push({ mode: "walk", pts: slice(pts, from, done) });
  return out.filter((sg) => pathLength(sg.pts) > 0.5);
}

/** The part of a polyline from `a` to `b` meters along it. */
function slice(pts: Pt[], a: number, b: number): Pt[] {
  const head = headOf(pts, b);
  return headOf([...head].reverse(), pathLength(head) - a).reverse();
}

/**
 * The route as map segments: walks inside the buildings (down the middle of concourses, through the doors between
 * zones), train rides as straight hops between the zones' stations, buses and landside trips as arcs. Without
 * building outlines (or if a point can't be placed on them) it falls back to following the gates.
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
  const fromGate = origin.kind === "gate" ? gateStop(data, zones[0], origin.gate?.label) : null;
  const startStop = fromGate ?? exit[0] ?? hubStop(data, zones[0]);
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
  return { segments, start: startStop?.pt ?? null, end: endStop?.pt ?? null, startAt: fromGate ? "gate" : "zone" };
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
