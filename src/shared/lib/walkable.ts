import type { AirportMapData } from "./airport-map";

/**
 * The walkable area of an airport map: terminal buildings rasterized into a grid of ~3 m cells, so routes can be
 * drawn inside the buildings (down the middle of concourses, turning where the building turns) instead of as
 * straight lines across the apron. Pure (typed arrays, no DOM), shared by the airport page and the tests.
 *
 * Coordinates are the map's projected meters (x east, y south). Grid cell (c, r) covers
 * [x0 + c·cell, x0 + (c+1)·cell) × [y0 + r·cell, y0 + (r+1)·cell).
 */

export type Pt = [number, number];

/** Cell size in meters. */
const CELL = 3;
/** The grid covers the gates' bounding box plus this margin (passenger areas, not cargo sheds across the field). */
const MARGIN = 300;
/** Bigger grids get coarser cells, to bound memory and build time. */
const MAX_CELLS = 1_200_000;
/** Clearance (m) below which cells cost extra, and how much extra right at a wall. */
const PREFERRED_CLEARANCE = 10;
const WALL_PENALTY = 3;
const SQ2 = Math.SQRT2;
/** Neighbour offsets: 4 orthogonal, then 4 diagonal. */
const DX = [1, -1, 0, 0, 1, 1, -1, -1];
const DY = [0, 0, 1, -1, 1, -1, 1, -1];

export interface WalkGrid {
  cell: number;
  x0: number;
  y0: number;
  cols: number;
  rows: number;
  /** 1 inside a terminal (dilated by one cell, which closes slivers and joins buildings that touch). */
  walk: Uint8Array;
  /** Meters from each walkable cell to the nearest non-walkable one (0 outside). */
  clear: Float32Array;
  /** Connected component of each walkable cell (-1 outside). */
  comp: Int32Array;
}

// --- Rings ------------------------------------------------------------------------------------------------------

const near = (a: Pt, b: Pt, tol: number) => Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol;
const isClosed = (r: Pt[]) => r.length >= 4 && near(r[0], r[r.length - 1], 0.5);

/**
 * Closed rings for one terminal shape. OSM multipolygons often come as several open ways that together make one
 * ring; drawing or filling each piece on its own adds chords across the building. Pieces that share endpoints are
 * joined; whatever is left is chained nearest-end-first and closed.
 */
export function stitchRings(rings: Pt[][]): Pt[][] {
  const out: Pt[][] = [];
  const open: Pt[][] = [];
  for (const r of rings) {
    if (r.length < 2) continue;
    if (isClosed(r)) out.push(r);
    else open.push(r.slice());
  }
  const chains: Pt[][] = [];
  while (open.length) {
    let cur = open.pop()!;
    for (let grew = true; grew && !isClosed(cur); ) {
      grew = false;
      for (let i = 0; i < open.length; i++) {
        const p = open[i];
        const [s, e] = [cur[0], cur[cur.length - 1]];
        let joined: Pt[] | null = null;
        if (near(p[0], e, 1)) joined = cur.concat(p.slice(1));
        else if (near(p[p.length - 1], e, 1)) joined = cur.concat(p.slice(0, -1).reverse());
        else if (near(p[p.length - 1], s, 1)) joined = p.concat(cur.slice(1));
        else if (near(p[0], s, 1)) joined = p.slice(1).reverse().concat(cur);
        if (joined) {
          cur = joined;
          open.splice(i, 1);
          grew = true;
          break;
        }
      }
    }
    (isClosed(cur) ? out : chains).push(cur);
  }
  if (chains.length) {
    // Gaps between pieces (ways missing from the download): join the rest end to nearest end, then close.
    let cur = chains.pop()!;
    while (chains.length) {
      const e = cur[cur.length - 1];
      let best = 0;
      let rev = false;
      let bestD = Infinity;
      chains.forEach((c, i) => {
        const d0 = Math.hypot(c[0][0] - e[0], c[0][1] - e[1]);
        const d1 = Math.hypot(c[c.length - 1][0] - e[0], c[c.length - 1][1] - e[1]);
        if (d0 < bestD) [bestD, best, rev] = [d0, i, false];
        if (d1 < bestD) [bestD, best, rev] = [d1, i, true];
      });
      const next = chains.splice(best, 1)[0];
      cur = cur.concat(rev ? next.slice().reverse() : next);
    }
    if (cur.length >= 3) out.push([...cur, cur[0]]);
  }
  return out;
}

const ringCache = new WeakMap<AirportMapData, Pt[][][]>();

/** Every terminal's rings, stitched closed (see stitchRings). Same order as data.terminals. */
export function terminalRings(data: AirportMapData): Pt[][][] {
  let r = ringCache.get(data);
  if (!r) {
    r = data.terminals.map((t) => stitchRings(t.rings as Pt[][]));
    ringCache.set(data, r);
  }
  return r;
}

// --- Grid -------------------------------------------------------------------------------------------------------

const gridCache = new WeakMap<AirportMapData, WalkGrid | null>();

/** The walkable grid for a map (built once per map object), or null when the map has no terminal outlines. */
export function walkGrid(data: AirportMapData): WalkGrid | null {
  if (gridCache.has(data)) return gridCache.get(data)!;
  const g = buildGrid(data);
  gridCache.set(data, g);
  return g;
}

function buildGrid(data: AirportMapData): WalkGrid | null {
  const shapes = terminalRings(data).filter((rs) => rs.length);
  if (!shapes.length) return null;
  // Passenger area: around the gates (or every terminal when the map has no gates).
  const focus = data.gates.length ? data.gates.map((g) => [g.x, g.y] as Pt) : shapes.flat(2);
  let [ax, ay, bx, by] = box(focus);
  [ax, ay, bx, by] = [ax - MARGIN, ay - MARGIN, bx + MARGIN, by + MARGIN];
  const inArea = shapes.filter((rs) => {
    const [sx, sy, ex, ey] = box(rs.flat());
    return ex >= ax && sx <= bx && ey >= ay && sy <= by;
  });
  if (!inArea.length) return null;
  const [sx, sy, ex, ey] = box(inArea.flat(2));
  const minX = Math.max(ax, sx);
  const minY = Math.max(ay, sy);
  const maxX = Math.min(bx, ex);
  const maxY = Math.min(by, ey);
  let cell = CELL;
  while (((maxX - minX) / cell + 6) * ((maxY - minY) / cell + 6) > MAX_CELLS) cell += 0.5;
  const x0 = minX - 3 * cell;
  const y0 = minY - 3 * cell;
  const cols = Math.ceil((maxX - minX) / cell) + 6;
  const rows = Math.ceil((maxY - minY) / cell) + 6;
  const n = cols * rows;

  const inside = new Uint8Array(n);
  for (const rs of inArea) fillShape(inside, rs, x0, y0, cell, cols, rows);

  // Dilate by one cell (3×3), separably.
  const tmp = new Uint8Array(n);
  for (let r = 0; r < rows; r++) {
    const o = r * cols;
    for (let c = 0; c < cols; c++) tmp[o + c] = inside[o + c] | (c > 0 ? inside[o + c - 1] : 0) | (c < cols - 1 ? inside[o + c + 1] : 0);
  }
  const walk = new Uint8Array(n);
  for (let r = 0; r < rows; r++) {
    const o = r * cols;
    for (let c = 0; c < cols; c++) walk[o + c] = tmp[o + c] | (r > 0 ? tmp[o + c - cols] : 0) | (r < rows - 1 ? tmp[o + c + cols] : 0);
  }

  // Clearance: two-pass chamfer distance (1, √2) to the nearest non-walkable cell; the grid's edge counts as a wall.
  const d = new Float32Array(n);
  for (let i = 0; i < n; i++) d[i] = walk[i] ? 1e9 : 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      if (!walk[i]) continue;
      let v = d[i];
      v = Math.min(v, c > 0 ? d[i - 1] + 1 : 1);
      if (r > 0) {
        v = Math.min(v, d[i - cols] + 1, c > 0 ? d[i - cols - 1] + SQ2 : 1, c < cols - 1 ? d[i - cols + 1] + SQ2 : 1);
      } else v = Math.min(v, 1);
      d[i] = v;
    }
  }
  for (let r = rows - 1; r >= 0; r--) {
    for (let c = cols - 1; c >= 0; c--) {
      const i = r * cols + c;
      if (!walk[i]) continue;
      let v = d[i];
      v = Math.min(v, c < cols - 1 ? d[i + 1] + 1 : 1);
      if (r < rows - 1) {
        v = Math.min(v, d[i + cols] + 1, c < cols - 1 ? d[i + cols + 1] + SQ2 : 1, c > 0 ? d[i + cols - 1] + SQ2 : 1);
      } else v = Math.min(v, 1);
      d[i] = v;
    }
  }
  const clear = d;
  for (let i = 0; i < n; i++) clear[i] *= cell;

  // Connected components (8-connected).
  const comp = new Int32Array(n).fill(-1);
  const stack = new Int32Array(n);
  let next = 0;
  for (let i = 0; i < n; i++) {
    if (!walk[i] || comp[i] >= 0) continue;
    let sp = 0;
    stack[sp++] = i;
    comp[i] = next;
    while (sp) {
      const cur = stack[--sp];
      const cx = cur % cols;
      const cy = (cur - cx) / cols;
      for (let k = 0; k < 8; k++) {
        const nx = cx + DX[k];
        const ny = cy + DY[k];
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const ni = ny * cols + nx;
        if (walk[ni] && comp[ni] < 0) {
          comp[ni] = next;
          stack[sp++] = ni;
        }
      }
    }
    next++;
  }
  return { cell, x0, y0, cols, rows, walk, clear, comp };
}

function box(pts: Pt[]): [number, number, number, number] {
  let [ax, ay, bx, by] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of pts) {
    if (x < ax) ax = x;
    if (y < ay) ay = y;
    if (x > bx) bx = x;
    if (y > by) by = y;
  }
  return [ax, ay, bx, by];
}

/** Scanline fill of one shape's rings (even-odd across its rings) into the mask, at cell centers. */
function fillShape(mask: Uint8Array, rings: Pt[][], x0: number, y0: number, cell: number, cols: number, rows: number) {
  const ex: number[] = [];
  let minY = Infinity;
  let maxY = -Infinity;
  for (const r of rings) {
    for (let i = 0; i < r.length; i++) {
      const a = r[i];
      const b = r[(i + 1) % r.length];
      if (a[1] === b[1]) continue;
      ex.push(a[0], a[1], b[0], b[1]);
      minY = Math.min(minY, a[1], b[1]);
      maxY = Math.max(maxY, a[1], b[1]);
    }
  }
  const r0 = Math.max(0, Math.floor((minY - y0) / cell - 0.5));
  const r1 = Math.min(rows - 1, Math.ceil((maxY - y0) / cell - 0.5));
  const xs: number[] = [];
  for (let row = r0; row <= r1; row++) {
    const yc = y0 + (row + 0.5) * cell;
    xs.length = 0;
    for (let k = 0; k < ex.length; k += 4) {
      const [ax, ay, bx, by] = [ex[k], ex[k + 1], ex[k + 2], ex[k + 3]];
      if (ay <= yc !== by <= yc) xs.push(ax + ((yc - ay) * (bx - ax)) / (by - ay));
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const c0 = Math.max(0, Math.ceil((xs[k] - x0) / cell - 0.5));
      const c1 = Math.min(cols - 1, Math.floor((xs[k + 1] - x0) / cell - 0.5));
      for (let c = c0; c <= c1; c++) mask[row * cols + c] = 1;
    }
  }
}

// --- Cells and points -------------------------------------------------------------------------------------------

/** The grid cell containing a point, or -1 off the grid. */
export function cellAt(g: WalkGrid, p: Pt): number {
  const c = Math.floor((p[0] - g.x0) / g.cell);
  const r = Math.floor((p[1] - g.y0) / g.cell);
  return c < 0 || r < 0 || c >= g.cols || r >= g.rows ? -1 : r * g.cols + c;
}

/** Center of a cell, in map meters. */
export function cellCenter(g: WalkGrid, i: number): Pt {
  const c = i % g.cols;
  return [g.x0 + (c + 0.5) * g.cell, g.y0 + ((i - c) / g.cols + 0.5) * g.cell];
}

/** True if the point is in a walkable cell. */
export function isWalkable(g: WalkGrid, p: Pt): boolean {
  const i = cellAt(g, p);
  return i >= 0 && g.walk[i] === 1;
}

/** Meters from the point to the nearest wall (0 outside the walkable area). */
export function clearanceAt(g: WalkGrid, p: Pt): number {
  const i = cellAt(g, p);
  return i >= 0 ? g.clear[i] : 0;
}

/** Nearest walkable cell to a point within `radius` meters (optionally only cells `accept` allows), or -1. */
export function nearestCell(g: WalkGrid, p: Pt, radius = 150, accept?: (cell: number) => boolean): number {
  const fx = (p[0] - g.x0) / g.cell - 0.5;
  const fy = (p[1] - g.y0) / g.cell - 0.5;
  const maxR = Math.ceil(radius / g.cell);
  for (const rr of [2, 8, 24, maxR]) {
    const r = Math.min(rr, maxR);
    let best = -1;
    let bestD = Infinity;
    const c0 = Math.max(0, Math.floor(fx - r));
    const c1 = Math.min(g.cols - 1, Math.ceil(fx + r));
    const r0 = Math.max(0, Math.floor(fy - r));
    const r1 = Math.min(g.rows - 1, Math.ceil(fy + r));
    for (let y = r0; y <= r1; y++) {
      for (let x = c0; x <= c1; x++) {
        const i = y * g.cols + x;
        if (!g.walk[i]) continue;
        const d = (x - fx) ** 2 + (y - fy) ** 2;
        if (d < bestD && (!accept || accept(i))) [bestD, best] = [d, i];
      }
    }
    // A hit inside the window's inscribed circle is the nearest overall.
    if (best >= 0 && (Math.sqrt(bestD) <= r || r === maxR)) return Math.sqrt(bestD) * g.cell <= radius + g.cell ? best : -1;
    if (r === maxR) break;
  }
  return -1;
}

/**
 * From a cell, the best nearby cell to stand in: more clearance (up to `cap` meters) within `radius`, in the same
 * component and in plain sight, slightly preferring cells close by. Moves a pin off the facade into the concourse.
 */
export function nudgeCell(g: WalkGrid, from: number, radius = 15, cap = 12, accept?: (cell: number) => boolean): number {
  const fc = from % g.cols;
  const fr = (from - fc) / g.cols;
  const R = Math.ceil(radius / g.cell);
  let best = from;
  let bestScore = Math.min(g.clear[from], cap);
  const origin = cellCenter(g, from);
  for (let y = Math.max(0, fr - R); y <= Math.min(g.rows - 1, fr + R); y++) {
    for (let x = Math.max(0, fc - R); x <= Math.min(g.cols - 1, fc + R); x++) {
      const i = y * g.cols + x;
      if (!g.walk[i] || g.comp[i] !== g.comp[from]) continue;
      const d = Math.hypot(x - fc, y - fr) * g.cell;
      if (d > radius) continue;
      const score = Math.min(g.clear[i], cap) - 0.12 * d;
      if (score > bestScore + 1e-6 && (!accept || accept(i)) && visible(g, origin, cellCenter(g, i), 0)) [best, bestScore] = [i, score];
    }
  }
  return best;
}

/** A point moved onto the walkable area (nearest cell within `radius`, then nudged inward), or null if too far. */
export function snapPoint(g: WalkGrid, p: Pt, opts: { radius?: number; nudge?: number; cap?: number; accept?: (cell: number) => boolean } = {}): Pt | null {
  const i = nearestCell(g, p, opts.radius ?? 150, opts.accept);
  if (i < 0) return null;
  const j = (opts.nudge ?? 15) > 0 ? nudgeCell(g, i, opts.nudge ?? 15, opts.cap ?? 12, opts.accept) : i;
  return j === i && isWalkable(g, p) && (!opts.accept || opts.accept(i)) ? p : cellCenter(g, j);
}

/** True if the straight segment a→b stays on walkable cells with at least `minClear` meters of clearance. */
export function visible(g: WalkGrid, a: Pt, b: Pt, minClear: number, accept?: (cell: number) => boolean): boolean {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const steps = Math.max(1, Math.ceil(len / (g.cell * 0.5)));
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const i = cellAt(g, [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    if (i < 0 || !g.walk[i] || g.clear[i] < minClear || (accept && !accept(i))) return false;
  }
  return true;
}

// --- Search -----------------------------------------------------------------------------------------------------

class Heap {
  keys = new Float64Array(4096);
  vals = new Int32Array(4096);
  size = 0;
  push(key: number, val: number) {
    if (this.size === this.keys.length) {
      const k = new Float64Array(this.size * 2);
      const v = new Int32Array(this.size * 2);
      k.set(this.keys);
      v.set(this.vals);
      this.keys = k;
      this.vals = v;
    }
    const { keys, vals } = this;
    let i = this.size++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p] <= key) break;
      keys[i] = keys[p];
      vals[i] = vals[p];
      i = p;
    }
    keys[i] = key;
    vals[i] = val;
  }
  pop(): number {
    const { keys, vals } = this;
    const top = vals[0];
    const n = --this.size;
    const k = keys[n];
    const v = vals[n];
    let i = 0;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= n) break;
      if (c + 1 < n && keys[c + 1] < keys[c]) c++;
      if (keys[c] >= k) break;
      keys[i] = keys[c];
      vals[i] = vals[c];
      i = c;
    }
    keys[i] = k;
    vals[i] = v;
    return top;
  }
}

interface SearchState {
  cost: Float32Array;
  parent: Int32Array;
  seen: Uint32Array;
  done: Uint32Array;
  stamp: number;
  heap: Heap;
}
const searchCache = new WeakMap<WalkGrid, SearchState>();

function searchState(g: WalkGrid): SearchState {
  let s = searchCache.get(g);
  const n = g.cols * g.rows;
  if (!s) {
    s = { cost: new Float32Array(n), parent: new Int32Array(n), seen: new Uint32Array(n), done: new Uint32Array(n), stamp: 0, heap: new Heap() };
    searchCache.set(g, s);
  }
  if (s.stamp >= 0xfffffff0) {
    s.seen.fill(0);
    s.done.fill(0);
    s.stamp = 0;
  }
  s.stamp++;
  s.heap.size = 0;
  return s;
}

/** Cost multiplier for standing in a cell: near walls costs more, so paths keep to the middle of corridors. */
const wallCost = (clear: number) => (clear >= PREFERRED_CLEARANCE ? 1 : 1 + WALL_PENALTY * (1 - clear / PREFERRED_CLEARANCE) ** 2);

/**
 * Cheapest 8-connected cell path from s to t (A*, octile heuristic; no squeezing diagonally past a corner).
 * `extra` multiplies a cell's cost (≥ 1), e.g. to discourage cutting through a concourse the route doesn't use.
 */
export function cellPath(g: WalkGrid, s: number, t: number, extra?: (cell: number) => number): number[] | null {
  if (s < 0 || t < 0 || !g.walk[s] || !g.walk[t] || g.comp[s] !== g.comp[t]) return null;
  if (s === t) return [s];
  const st = searchState(g);
  const { cost, parent, seen, done, stamp, heap } = st;
  const { cols, rows, walk, clear, cell } = g;
  const tx = t % cols;
  const ty = (t - tx) / cols;
  const h = (i: number) => {
    const x = i % cols;
    const dx = Math.abs(x - tx);
    const dy = Math.abs((i - x) / cols - ty);
    return (dx > dy ? dx + (SQ2 - 1) * dy : dy + (SQ2 - 1) * dx) * cell;
  };
  cost[s] = 0;
  seen[s] = stamp;
  parent[s] = -1;
  heap.push(h(s), s);
  while (heap.size) {
    const cur = heap.pop();
    if (done[cur] === stamp) continue;
    done[cur] = stamp;
    if (cur === t) break;
    const cx = cur % cols;
    const cy = (cur - cx) / cols;
    const base = cost[cur];
    const pc = wallCost(clear[cur]) * (extra ? extra(cur) : 1);
    for (let k = 0; k < 8; k++) {
      const nx = cx + DX[k];
      const ny = cy + DY[k];
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const ni = ny * cols + nx;
      if (!walk[ni] || done[ni] === stamp) continue;
      if (k >= 4 && (!walk[cy * cols + nx] || !walk[ny * cols + cx])) continue;
      const pn = wallCost(clear[ni]) * (extra ? extra(ni) : 1);
      const c = base + (k >= 4 ? SQ2 : 1) * cell * 0.5 * (pc + pn);
      if (seen[ni] !== stamp || c < cost[ni]) {
        seen[ni] = stamp;
        cost[ni] = c;
        parent[ni] = cur;
        heap.push(c + h(ni), ni);
      }
    }
  }
  if (done[t] !== stamp) return null;
  const out: number[] = [];
  for (let i = t; i !== -1; i = parent[i]) out.push(i);
  return out.reverse();
}

/**
 * Turns a cell path into a clean polyline: line-of-sight shortcuts (string pulling) that keep clear of walls, at
 * least as clear as the path they replace (up to `minClear` meters), then drops points that are in line.
 */
export function smoothCells(g: WalkGrid, cells: number[], from?: Pt, to?: Pt, accept?: (cell: number) => boolean, minClear = 7.5): Pt[] {
  const pts = cells.map((c) => cellCenter(g, c));
  if (from) pts[0] = from;
  if (to) pts[pts.length - 1] = to;
  if (pts.length <= 2) return pts;
  const out: Pt[] = [pts[0]];
  let i = 0;
  while (i < pts.length - 1) {
    let j = i + 1;
    let low = Math.min(g.clear[cells[i]], g.clear[cells[j]]);
    while (j + 1 < pts.length) {
      const c = Math.min(low, g.clear[cells[j + 1]]);
      if (!visible(g, pts[i], pts[j + 1], Math.min(minClear, c) * 0.9, accept)) break;
      low = c;
      j++;
    }
    out.push(pts[j]);
    i = j;
  }
  // Drop points that are (nearly) in line with their neighbours, as long as the shortcut stays inside.
  const res: Pt[] = [out[0]];
  for (let k = 1; k < out.length - 1; k++) {
    const a = res[res.length - 1];
    const b = out[k];
    const c = out[k + 1];
    const cross = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
    const len = Math.hypot(c[0] - a[0], c[1] - a[1]) || 1;
    if (cross / len < 0.75 && visible(g, a, c, 0)) continue;
    res.push(b);
  }
  res.push(out[out.length - 1]);
  return res;
}

/** A walkable polyline from a to b (both on the walkable area and in one component), or null. */
export function walkPath(g: WalkGrid, a: Pt, b: Pt, extra?: (cell: number) => number, accept?: (cell: number) => boolean): Pt[] | null {
  const cells = cellPath(g, cellAt(g, a), cellAt(g, b), extra);
  return cells ? smoothCells(g, cells, a, b, accept) : null;
}

/**
 * Multi-source geodesic distance over the walkable cells (Dijkstra, 8-connected): which seed each cell is closest
 * to by walking, and how far. Used to split a building between the zones (concourses, halls) it holds.
 */
export function nearestSeeds(g: WalkGrid, seeds: { cell: number; label: number }[]): { label: Int16Array; dist: Float32Array } {
  const n = g.cols * g.rows;
  const label = new Int16Array(n).fill(-1);
  const dist = new Float32Array(n).fill(Infinity);
  const heap = new Heap();
  for (const s of seeds) {
    if (s.cell < 0 || !g.walk[s.cell] || dist[s.cell] === 0) continue;
    dist[s.cell] = 0;
    label[s.cell] = s.label;
    heap.push(0, s.cell);
  }
  const { cols, rows, walk, cell } = g;
  while (heap.size) {
    const d = heap.keys[0];
    const cur = heap.pop();
    if (d > dist[cur]) continue;
    const cx = cur % cols;
    const cy = (cur - cx) / cols;
    for (let k = 0; k < 8; k++) {
      const nx = cx + DX[k];
      const ny = cy + DY[k];
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const ni = ny * cols + nx;
      if (!walk[ni]) continue;
      if (k >= 4 && (!walk[cy * cols + nx] || !walk[ny * cols + cx])) continue;
      const nd = d + (k >= 4 ? SQ2 : 1) * cell;
      if (nd < dist[ni]) {
        dist[ni] = nd;
        label[ni] = label[cur];
        heap.push(nd, ni);
      }
    }
  }
  return { label, dist };
}

/** Walkable cells of a set that touch a non-member (4-neighbourhood): the set's outline. */
export function outlineCells(g: WalkGrid, member: (cell: number) => boolean): number[] {
  const out: number[] = [];
  const { cols, rows } = g;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      if (!g.walk[i] || !member(i)) continue;
      if (c === 0 || r === 0 || c === cols - 1 || r === rows - 1 || !member(i - 1) || !member(i + 1) || !member(i - cols) || !member(i + cols)) out.push(i);
    }
  }
  return out;
}

/** The closest pair of cells between two cell lists (e.g. two buildings' outlines), with their distance in meters. */
export function closestPair(g: WalkGrid, a: number[], b: number[]): { a: number; b: number; d: number } | null {
  if (!a.length || !b.length) return null;
  const { cols, cell } = g;
  const bx = Float64Array.from(b, (i) => i % cols);
  const by = Float64Array.from(b, (i) => Math.floor(i / cols));
  let best = { a: a[0], b: b[0], d: Infinity };
  for (const i of a) {
    const x = i % cols;
    const y = (i - x) / cols;
    for (let k = 0; k < b.length; k++) {
      const d = (bx[k] - x) ** 2 + (by[k] - y) ** 2;
      if (d < best.d) best = { a: i, b: b[k], d };
    }
  }
  return { ...best, d: Math.sqrt(best.d) * cell };
}
