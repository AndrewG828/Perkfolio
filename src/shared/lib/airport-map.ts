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
/** "connector": a walk between buildings OSM doesn't connect (a tunnel or bridge that isn't mapped as a terminal). */
export type SegmentMode = "walk" | "train" | "bus" | "landside" | "connector";

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

/** The OSM gates in a zone: by its gate rules, and by the building OSM puts each gate in. */
function gatesInZone(data: AirportMapData, zone: NavZone): MapGate[] {
  let byZone = zoneGateCache.get(data);
  if (!byZone) zoneGateCache.set(data, (byZone = new Map()));
  const hit = byZone.get(zone.id);
  if (hit) return hit;
  const others = (navFor(data.code)?.zones ?? []).filter((z) => z.id !== zone.id);
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
 * B19 and B21), or next to the nearest one when only one side is close (CLT A20 next to A21). Null when no gate within
 * a few numbers is mapped (IAH B12, when only B40 and up are).
 */
function estimateGate(data: AirportMapData, zone: NavZone, label: string): Pt | null {
  const p = parseGate(label);
  if (!p) return null;
  const numbered = gatesInZone(data, zone).flatMap((g) => {
    const q = looseGate(g.ref);
    return q && q.prefix === p.prefix && q.number !== p.number ? [{ n: q.number, pt: [g.x, g.y] as Pt }] : [];
  });
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
export function gatePoint(data: AirportMapData, zone: NavZone, label: string): Pt | null {
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
   * sit. A concourse's roomy core central among its gates (where ATL's and DEN's trains stop, mid-arc on DFW's
   * curved terminals); for a zone without gates (a main hall or atrium), the roomy spot in its building on the side
   * of the zones it connects to, a little away from other zones' gates.
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
}

const MAX_ZONES = 16;
const bit = (k: number) => 1 << k;
const pairKey = (a: number, b: number) => Math.min(a, b) * MAX_ZONES + Math.max(a, b);
const dist = (a: Pt, b: Pt) => Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2);

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

function buildIndex(data: AirportMapData, nav: AirportNav): ZoneIndex | null {
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
  const anchors: (Pt | null)[] = zones.map((_, k) => (gateCells[k].length ? null : gatelessAnchor(k)));
  anchors.forEach((a, k) => a && seeds.push({ cell: cellAt(g, a), label: k }));
  const { label, dist: seedDist } = nearestSeeds(g, seeds);

  // How many of each zone's cells are in each component (building).
  const compCount = new Int32Array(zones.length * g.comps);
  for (let i = 0; i < n; i++) if (label[i] >= 0) compCount[label[i] * g.comps + g.comp[i]]++;
  const comps = zones.map((_, k) => new Set(Array.from({ length: g.comps }, (_, c) => c).filter((c) => compCount[k * g.comps + c] > 0)));

  // Gated zones' middles, in the zone's main building (the biggest one with its gates: JFK's Terminal 1, not the
  // gate-less New Terminal One next door). Candidates every other row and column.
  const candidates: number[][] = zones.map(() => []);
  for (let r = 0; r < g.rows; r += 2) for (let c = 0; c < g.cols; c += 2) if (label[r * g.cols + c] >= 0) candidates[label[r * g.cols + c]].push(r * g.cols + c);
  zones.forEach((_, k) => {
    if (anchors[k] || !zoneGates[k].length) return;
    const withGates = [...new Set(zoneGates[k].map((x) => g.comp[x.cell]))];
    const main = withGates.reduce((a, b) => (compCount[k * g.comps + a] >= compCount[k * g.comps + b] ? a : b));
    let cells = candidates[k].filter((i) => g.comp[i] === main && (inZone[i] & bit(k)) !== 0);
    if (!cells.length) cells = candidates[k].filter((i) => g.comp[i] === main);
    if (!cells.length) {
      anchors[k] = cellCenter(g, zoneGates[k][0].cell);
      return;
    }
    // Roomy (a concourse's core, where the trains stop) but central: the mean distance to the rest of the zone's part
    // of the building grows slowly along a concourse (DEN C's core is well off the middle of its gates) and fast
    // toward the end of an arc (DFW B's middle is mid-arc, not the roomy hall at one end).
    const mean = meanDistances(g, cells, cells.filter((_, x) => x % Math.max(1, Math.floor(cells.length / 400)) === 0).map((i) => cellCenter(g, i)));
    const least = minOf(mean);
    let best = cells[0];
    let bestScore = -Infinity;
    cells.forEach((i, x) => {
      const v = Math.min(g.clear[i], 45) - 0.5 * (mean[x] - least);
      if (v > bestScore) [best, bestScore] = [i, v];
    });
    anchors[k] = cellCenter(g, nudgeCell(g, best, 6, 25, (i) => label[i] === k));
  });

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
function gateSpot(ix: ZoneIndex, data: AirportMapData, k: number, label: string): { p: Pt; exact: boolean } | null {
  const { g } = ix;
  const zone = ix.zones[k].zone;
  const inZone = (i: number) => ix.label[i] === k;
  const snap = (p: Pt, radius: number): Pt | null => {
    const c = nearestCell(g, p, radius, inZone);
    return c < 0 ? null : cellCenter(g, nudgeCell(g, c, 30, 12, inZone));
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
 * A free spot for a pin near `p`, inside zone k, away from the pins already placed, from zone middles and from the
 * train lines into the zone (`rides`), so a train never runs through a pin before it stops.
 */
function freeSpot(ix: ZoneIndex, p: Pt, k: number, placed: Pt[], middles: Pt[], rides: [Pt, Pt][], clearance = MIDDLE_CLEARANCE): Pt {
  const { g } = ix;
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
        return Math.min(g.clear[i], 18) - 0.12 * d - 0.5 * nearRide;
      },
    );
    if (c >= 0) return cellCenter(g, c);
  }
  return p;
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
  const rides = (k: number): [Pt, Pt][] =>
    nav.links
      .filter((l) => l.mode === "train" && (l.a === ix.zones[k].zone.id || l.b === ix.zones[k].zone.id))
      .flatMap((l) => {
        const j = ix.byId.get(l.a === ix.zones[k].zone.id ? l.b : l.a);
        const [a, b] = [ix.zones[k].anchor, j === undefined ? null : ix.zones[j].anchor];
        return a && b ? [[b, a] as [Pt, Pt]] : [];
      });
  for (const { l, k, at, gated } of items) {
    // A lounge by a gate stays there, just off the zone's middle (where the You marker goes) if it's right on it.
    const crowded = placed.some((q) => dist(q, at) < 15) || middles.some((m) => dist(m, at) < (gated ? 15 : MIDDLE_CLEARANCE));
    const p = crowded ? freeSpot(ix, at, k, placed, middles, gated ? [] : rides(k), gated ? 20 : MIDDLE_CLEARANCE) : at;
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
  /** A few other roomy spots in the zone, 80 m+ apart, for its name when the middle is busy with pins. */
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
    for (let t = 0; t < 3; t++) {
      let best: Pt | null = null;
      let bestScore = -Infinity;
      for (const i of cells[k]) {
        if (g.comp[i] !== comp) continue;
        const p = cellCenter(g, i);
        const d = dist(p, anchor);
        if (d > 350 || chosen.some((q) => dist(q, p) < 80)) continue;
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
 * Builds everything the map needs for an airport up front (the walkable grid, zones, pins and zone names), so the
 * page can do it outside a render (it takes ~50–150 ms the first time). Later calls return at once.
 */
export function prepareMap(data: AirportMapData, nav: AirportNav): void {
  const ix = zoneIndex(data, nav);
  if (!ix) return;
  placements(ix, data, nav);
  zoneMarkers(data, nav);
}

/**
 * The same work in three pieces (the walkable grid, the zones, then pins and zone names): does the next one and
 * returns true once everything is ready, so a page can spread it over idle callbacks instead of one long task.
 */
export function prepareMapStep(data: AirportMapData, nav: AirportNav): boolean {
  if (!hasWalkGrid(data)) {
    walkGrid(data);
    return false;
  }
  if (!indexCache.get(data)?.has(nav)) {
    zoneIndex(data, nav);
    return false;
  }
  prepareMap(data, nav);
  return true;
}

/** True once prepareMap has run for this map and nav. */
export function isMapPrepared(data: AirportMapData, nav: AirportNav): boolean {
  const byNav = indexCache.get(data);
  if (!byNav?.has(nav)) return false;
  const ix = byNav.get(nav);
  return !ix || Boolean(ix.placements && ix.markers);
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

/** A gap's two ends moved a few meters in from the walls (the grid's outline is a cell wider than the building's). */
function inward(ix: ZoneIndex, gap: { a: number; b: number; d: number }): Crossing {
  const { g, label } = ix;
  const end = (c: number) => cellCenter(g, nudgeCell(g, c, 9, 6, (i) => label[i] === label[c]));
  return { a: end(gap.a), b: end(gap.b), d: gap.d };
}

/**
 * The one place to cross between two buildings (components) of the zones in `mask` (a zone spread over buildings
 * the map doesn't join, like LAX's Midfield Satellite and Tom Bradley): the narrowest gap between their cells.
 */
function buildingCrossing(ix: ZoneIndex, ca: number, cb: number, mask: number | null): Crossing | null {
  const [lo, hi] = ca < cb ? [ca, cb] : [cb, ca];
  const key = `c${lo}-${hi}-${mask ?? "all"}`;
  if (!ix.crossings.has(key)) {
    const { g, label } = ix;
    const member = (comp: number) => (c: number) => g.comp[c] === comp && (mask === null || (label[c] >= 0 && ((mask >> label[c]) & 1) === 1));
    const gap = fixedGap(g, gapsBetween(g, member(lo), member(hi)));
    ix.crossings.set(key, gap ? inward(ix, gap) : null);
  }
  const c = ix.crossings.get(key)!;
  return c && ca > cb ? { a: c.b, b: c.a, d: c.d } : c;
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
 * One walk through a run of zones joined by walkways (zone indexes in order), from a point to a point: through the
 * doors where consecutive zones meet, each stretch kept to its two zones, then smoothed into a polyline down the
 * middle of the building. Zones that don't touch on the map are joined at their fixed crossing (a dotted connector),
 * unless the buildings connect them by a walk that isn't much longer (through a third zone, like IAH's D West Pier
 * through Terminal C). Connectors only ever join zones of this walk.
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
    const cross = zoneCrossing(ix, a, b);
    if (cross && walkLength(g, prev, cellAt(g, cross.b)) > walkLength(g, prev, cellAt(g, cross.a)) + cross.d + Math.max(150, 3 * cross.d)) {
      subs.push({ from: prev, to: cross.a, allowed }, { from: cross.a, to: cross.b, allowed: null, connector: true });
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
    const cross = buildingCrossing(ix, g.comp[a], g.comp[b], s.allowed);
    const [ca, cb] = cross ? [cellAt(g, cross.a), cellAt(g, cross.b)] : [-1, -1];
    if (!cross || g.comp[ca] !== g.comp[a] || g.comp[cb] !== g.comp[b]) {
      connect(s.from, s.to);
      continue;
    }
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
    if (i >= 0 && ix.label[i] === k && g.comp[i] === g.comp[cellAt(g, anchor)]) return cellCenter(g, nudgeCell(g, i, 20, 10, (c) => ix.label[c] === k));
  }
  return anchor;
}

/**
 * A ride drawn as a gentle arc (buses and trips outside security), so it reads as a ride rather than a walk across
 * whatever is in between. It bows to whichever side crosses fewer buildings.
 */
function arc(g: WalkGrid, a: Pt, b: Pt): Pt[] {
  const len = dist(a, b);
  if (len < 1) return [a, b];
  const bow = Math.min(0.2 * len, 300);
  const [nx, ny] = [-(b[1] - a[1]) / len, (b[0] - a[0]) / len];
  const curve = (side: number): Pt[] => {
    const c: Pt = [(a[0] + b[0]) / 2 + side * nx * bow * 2, (a[1] + b[1]) / 2 + side * ny * bow * 2];
    return Array.from({ length: 25 }, (_, i) => {
      const t = i / 24;
      return [(1 - t) ** 2 * a[0] + 2 * (1 - t) * t * c[0] + t ** 2 * b[0], (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * c[1] + t ** 2 * b[1]] as Pt;
    });
  };
  const indoors = (pts: Pt[]) => pts.filter((p) => g.walk[cellAt(g, p)] === 1).length;
  const [left, right] = [curve(1), curve(-1)];
  return indoors(right) < indoors(left) ? right : left;
}

/** Point at distance `s` along a polyline, and the index of the segment it's on. */
function pointAlong(pts: Pt[], s: number): { p: Pt; i: number } {
  let done = 0;
  for (let i = 1; i < pts.length; i++) {
    const len = dist(pts[i - 1], pts[i]);
    if (done + len >= s && len > 0) {
      const t = (s - done) / len;
      return { p: [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t], i };
    }
    done += len;
  }
  return { p: pts[pts.length - 1], i: pts.length - 1 };
}

const pathLength = (pts: Pt[]) => pts.slice(1).reduce((s, p, i) => s + dist(pts[i], p), 0);

/**
 * How far a walk that starts at `from` runs along the line from `from` toward `toward` (within 14 m of it, never
 * turning back): how much of it retraces a ride on that line. 0 when it heads elsewhere.
 */
function retrace(walk: Pt[], from: Pt, toward: Pt): number {
  const [dx, dy] = [toward[0] - from[0], toward[1] - from[1]];
  const len2 = dx * dx + dy * dy;
  if (len2 < 1) return 0;
  const total = pathLength(walk);
  let last = 0;
  let tMax = -Infinity;
  for (let s = 0; s <= total; s += 2) {
    const { p } = pointAlong(walk, s);
    const t = ((p[0] - from[0]) * dx + (p[1] - from[1]) * dy) / len2;
    if (t < tMax - 0.01 || t > 1 || segDist(p, from, toward) > 14) break;
    tMax = Math.max(tMax, t);
    last = s;
  }
  return last;
}

/** True if a walk sets off from `from` back along the line toward `toward` (within 25° of it). */
function headsAlong(walk: Pt[], from: Pt, toward: Pt): boolean {
  const { p } = pointAlong(walk, Math.min(20, pathLength(walk)));
  const [a, b] = [dist(walk[0], p), dist(from, toward)];
  return a > 1 && b > 1 && ((p[0] - walk[0][0]) * (toward[0] - from[0]) + (p[1] - walk[0][1]) * (toward[1] - from[1])) / (a * b) > Math.cos((25 * Math.PI) / 180);
}

/**
 * Trains stop at zone middles, so a ride can pass the lounge (or the gate you start at) and a walk then double back
 * along the same line. Where a walk runs back along the train line, the ride ends (or starts) where the walk leaves
 * the line instead, and the walk is cut to match. A walk that turns off at an angle is left alone: that's a turn.
 */
function untangle(segments: RouteGeometry["segments"]) {
  for (let s = 0; s < segments.length; s++) {
    const ride = segments[s];
    if (ride.mode !== "train" || ride.pts.length < 2) continue;
    // Each cut swings the line's last (or first) hop a little, so a walk that ran along it at a slight angle may
    // still run along the new one: cut again until it doesn't.
    for (let pass = 0; pass < 8; pass++) {
      const next = segments[s + 1];
      const r = ride.pts;
      if (next?.mode !== "walk" || !headsAlong(next.pts, r[r.length - 1], r[r.length - 2])) break;
      const back = retrace(next.pts, r[r.length - 1], r[r.length - 2]);
      if (back < 2) break;
      const { p, i } = pointAlong(next.pts, back);
      r[r.length - 1] = p;
      next.pts = [p, ...next.pts.slice(i)];
      if (pathLength(next.pts) < 2) segments.splice(s + 1, 1);
    }
    for (let pass = 0; pass < 8; pass++) {
      const prev = segments[s - 1];
      if (prev?.mode !== "walk") break;
      const w = [...prev.pts].reverse();
      if (!headsAlong(w, ride.pts[0], ride.pts[1])) break;
      const back = retrace(w, ride.pts[0], ride.pts[1]);
      if (back < 2) break;
      const { p, i } = pointAlong(w, back);
      ride.pts[0] = p;
      prev.pts = [p, ...w.slice(i)].reverse();
      if (pathLength(prev.pts) < 2) {
        segments.splice(s - 1, 1);
        s--;
      }
    }
  }
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
  const spot = origin.kind === "gate" && origin.gate ? gateSpot(ix, data, zs[0], origin.gate.label) : null;
  const start = spot?.p ?? ix.zones[zs[0]].anchor;
  const startAt: RouteGeometry["startAt"] = spot ? (spot.exact ? "gate" : "near-gate") : "zone";
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
    let ride: { mode: SegmentMode; pts: Pt[] } | null = null;
    let k = j + 1;
    if (j < n - 1) {
      const mode = modes[j];
      if (mode !== "landside") while (k < n - 1 && modes[k] === mode) k++;
      const stops = zs.slice(j, k + 1).map((z) => ix.zones[z].anchor);
      if (stops.some((s) => !s)) return null;
      const pts = stops as Pt[];
      if (mode === "train") ride = { mode, pts };
      else {
        // Buses pull in at the facades facing each other; a trip outside security goes middle to middle. Both as arcs.
        if (mode === "bus") {
          pts[0] = busStop(ix, zs[j], pts[1]) ?? pts[0];
          pts[pts.length - 1] = busStop(ix, zs[k], pts[0]) ?? pts[pts.length - 1];
        }
        ride = { mode, pts: pts.slice(1).flatMap((p, x) => arc(ix.g, pts[x], p).slice(x ? 1 : 0)) };
      }
    }
    const legEnd = ride ? ride.pts[0] : end;
    const pieces = walkLeg(ix, zs.slice(i, j + 1), cur, legEnd);
    if (!pieces) return null;
    for (const p of pieces) push(p.connector ? "connector" : "walk", p.pts);
    if (!ride) break;
    push(ride.mode, ride.pts);
    cur = ride.pts[ride.pts.length - 1];
    i = k;
  }
  untangle(segments);
  return { segments, start, end, startAt };
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
