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
/** Buildings that reach past that margin (DEN's Jeppesen Terminal) are kept whole, up to this much further out. */
const OVERHANG = 600;
/** Bigger grids get coarser cells, to bound memory and build time. */
const MAX_CELLS = 1_200_000;
/**
 * Building the grid yields after about this many cells, and a search over all of it after settling a quarter as many,
 * so each piece takes a few milliseconds.
 */
const STEP_CELLS = 250_000;
/**
 * Paths keep to the middle of corridors: a cell costs extra by how far it is from the middle of the corridor it's in
 * (its room from the real outline, as a share of the room at the corridor's middle nearby), up to this much room (m)
 * in halls wider than twice that, and up to WALL_PENALTY extra right at a wall.
 */
const CENTRE_ROOM = 15;
const WALL_PENALTY = 3;
/**
 * Smoothing shortcuts keep this share of the room the path they replace has from the real outline, up to SHORTCUT_ROOM
 * meters: so a route through a wide concourse runs down its middle and turns well clear of the corners.
 */
const SHORTCUT_SHARE = 0.7;
const SHORTCUT_ROOM = 10;
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
  /**
   * Meters from each cell to the real outline (the buildings as OSM draws them, not dilated): 0 outside it, so 0 in
   * the dilated ring and the seams between buildings drawn apart. What routes and pins keep clear of the walls by.
   */
  room: Float32Array;
  /** A* cost multiplier per cell (≥ 1): 1 down the middle of a corridor, more toward its walls. */
  cost: Float32Array;
  /**
   * Connected component of each walkable cell (-1 outside). 4-connected, which is exactly what paths can reach:
   * they move diagonally only where both orthogonal neighbours are walkable.
   */
  comp: Int32Array;
  /** Number of components. */
  comps: number;
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
const gridJobs = new WeakMap<AirportMapData, Generator<void, WalkGrid | null>>();

/** True once the walkable grid for this map has been built (walkGrid returns it at once). */
export const hasWalkGrid = (data: AirportMapData) => gridCache.has(data);

/** The walkable grid for a map (built once per map object), or null when the map has no terminal outlines. */
export function walkGrid(data: AirportMapData): WalkGrid | null {
  while (!walkGridStep(data));
  return gridCache.get(data)!;
}

/**
 * Builds the next piece of a map's walkable grid (each a few milliseconds, so a page can spread the work over idle
 * callbacks); true once the grid is built.
 */
export function walkGridStep(data: AirportMapData): boolean {
  if (gridCache.has(data)) return true;
  let job = gridJobs.get(data);
  if (!job) gridJobs.set(data, (job = buildGrid(data)));
  const step = job.next();
  if (!step.done) return false;
  gridCache.set(data, step.value);
  gridJobs.delete(data);
  return true;
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

function* buildGrid(data: AirportMapData): Generator<void, WalkGrid | null> {
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
  const minX = Math.max(ax - OVERHANG, sx);
  const minY = Math.max(ay - OVERHANG, sy);
  const maxX = Math.min(bx + OVERHANG, ex);
  const maxY = Math.min(by + OVERHANG, ey);
  let cell = CELL;
  while (((maxX - minX) / cell + 6) * ((maxY - minY) / cell + 6) > MAX_CELLS) cell += 0.5;
  const x0 = minX - 3 * cell;
  const y0 = minY - 3 * cell;
  const cols = Math.ceil((maxX - minX) / cell) + 6;
  const rows = Math.ceil((maxY - minY) / cell) + 6;
  const n = cols * rows;
  const dims = { x0, y0, cell, cols, rows };

  const inside = new Uint8Array(n);
  for (const rs of inArea) rasterize(dims, rs, inside, 1);
  yield;

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

  // Clearance from the walkable area's edge, and room from the real outline: a cell inside it is half a cell from the
  // wall on average when it's next to one.
  yield;
  const d = yield* chamfer(walk, cols, rows);
  for (let i = 0; i < n; i++) d[i] *= cell;
  const room = yield* chamfer(inside, cols, rows);
  for (let i = 0; i < n; i++) room[i] = inside[i] ? (room[i] - 0.5) * cell : 0;
  yield;

  // A* cost: by a cell's room as a share of the room at the middle of its corridor (the most room nearby), so paths
  // keep to the middle of narrow piers and wide concourses alike; in halls, anywhere CENTRE_ROOM clear of the walls.
  const middle = maxFilter(room, cols, rows, Math.ceil(CENTRE_ROOM / cell));
  yield;
  const halfCols = Math.ceil(cols / 2);
  const cost = new Float32Array(n).fill(1);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      if (!walk[i]) continue;
      const target = Math.max(cell / 2, Math.min(middle[(r >> 1) * halfCols + (c >> 1)], CENTRE_ROOM));
      const short = 1 - Math.min(1, room[i] / target);
      cost[i] = 1 + WALL_PENALTY * short * short;
    }
  }

  yield;

  // Connected components (4-connected flood fill), in pieces.
  const comp = new Int32Array(n).fill(-1);
  const fill = { stack: new Int32Array(n), sp: 0, i: 0, next: 0 };
  while (!fillComponents(walk, cols, comp, fill, STEP_CELLS)) yield;
  return { cell, x0, y0, cols, rows, walk, clear: d, room, cost, comp, comps: fill.next };
}

/**
 * Labels the next `budget` cells or so of a 4-connected flood fill of `walk` into components (`comp`, -1 for none
 * yet), carrying on from `state`; true once every cell is done. A plain loop (not a generator's), so it runs fast.
 */
function fillComponents(walk: Uint8Array, cols: number, comp: Int32Array, state: { stack: Int32Array; sp: number; i: number; next: number }, budget: number): boolean {
  const n = comp.length;
  const { stack } = state;
  let { sp, i, next } = state;
  let work = 0;
  for (;;) {
    while (sp) {
      const cur = stack[--sp];
      const cx = cur % cols;
      for (let k = 0; k < 4; k++) {
        const ni = k === 0 ? (cx > 0 ? cur - 1 : -1) : k === 1 ? (cx < cols - 1 ? cur + 1 : -1) : k === 2 ? cur - cols : cur + cols;
        if (ni >= 0 && ni < n && walk[ni] && comp[ni] < 0) {
          comp[ni] = next - 1;
          stack[sp++] = ni;
        }
      }
      if (++work >= budget) {
        Object.assign(state, { sp, i, next });
        return false;
      }
    }
    while (i < n && (!walk[i] || comp[i] >= 0)) i++;
    if (i >= n) {
      Object.assign(state, { sp, i, next });
      return true;
    }
    comp[i] = next++;
    stack[sp++] = i;
    work += 1;
  }
}

/**
 * Two-pass chamfer distance (1, √2), in cells, from each cell of a mask to the nearest cell outside it (0 outside);
 * the grid's edge counts as outside. Yields every STEP_CELLS cells or so.
 */
function* chamfer(mask: Uint8Array, cols: number, rows: number): Generator<void, Float32Array> {
  const d = new Float32Array(cols * rows);
  for (let i = 0; i < d.length; i++) d[i] = mask[i] ? 1e9 : 0;
  const every = Math.max(1, Math.ceil(STEP_CELLS / cols));
  for (let r = 0; r < rows; r += every) {
    chamferRows(mask, d, cols, rows, r, Math.min(rows, r + every), true);
    yield;
  }
  for (let r = rows; r > 0; r -= every) {
    chamferRows(mask, d, cols, rows, Math.max(0, r - every), r, false);
    yield;
  }
  return d;
}

/** One pass of chamfer over rows [from, to): forward (top-left to bottom-right) or back. */
function chamferRows(mask: Uint8Array, d: Float32Array, cols: number, rows: number, from: number, to: number, forward: boolean) {
  if (forward) {
    for (let r = from; r < to; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        if (!mask[i]) continue;
        let v = Math.min(d[i], c > 0 ? d[i - 1] + 1 : 1);
        if (r > 0) v = Math.min(v, d[i - cols] + 1, c > 0 ? d[i - cols - 1] + SQ2 : 1, c < cols - 1 ? d[i - cols + 1] + SQ2 : 1);
        else v = Math.min(v, 1);
        d[i] = v;
      }
    }
    return;
  }
  for (let r = to - 1; r >= from; r--) {
    for (let c = cols - 1; c >= 0; c--) {
      const i = r * cols + c;
      if (!mask[i]) continue;
      let v = Math.min(d[i], c < cols - 1 ? d[i + 1] + 1 : 1);
      if (r < rows - 1) v = Math.min(v, d[i + cols] + 1, c < cols - 1 ? d[i + cols + 1] + SQ2 : 1, c > 0 ? d[i + cols - 1] + SQ2 : 1);
      else v = Math.min(v, 1);
      d[i] = v;
    }
  }
}

/**
 * Roughly the largest value within ±r cells (a square window) of each cell: on a grid of 2×2 blocks (so the window is
 * a cell or two wider), in linear time (van Herk / Gil–Werman: running maxima within blocks of the window's width,
 * forward and back, so any window is a suffix of one block and a prefix of the next). Plenty for how wide a corridor
 * is, at a fraction of the cost.
 */
function maxFilter(src: Float32Array, cols: number, rows: number, r: number): Float32Array {
  // The result is per 2×2 block: cell (x, y)'s value is at (y >> 1) * ceil(cols / 2) + (x >> 1).
  const [cw, ch] = [Math.ceil(cols / 2), Math.ceil(rows / 2)];
  const coarse = new Float32Array(cw * ch);
  for (let y = 0; y < rows; y++) {
    const o = y * cols;
    const co = (y >> 1) * cw;
    for (let x = 0; x < cols; x++) {
      const v = src[o + x];
      if (v > coarse[co + (x >> 1)]) coarse[co + (x >> 1)] = v;
    }
  }
  const rc = Math.ceil(r / 2);
  const across = new Float32Array(cw * ch);
  const both = new Float32Array(cw * ch);
  maxPass(coarse, across, cw, ch, 1, cw, rc);
  maxPass(across, both, ch, cw, cw, 1, rc);
  return both;
}

/** One direction of maxFilter: along `lines` lines of `len` values (`step` apart, lines `stride` apart). */
function maxPass(from: Float32Array, to: Float32Array, len: number, lines: number, step: number, stride: number, r: number) {
  const w = 2 * r + 1;
  const L = len + 2 * r;
  const line = new Float32Array(L);
  const pre = new Float32Array(L);
  const suf = new Float32Array(L);
  for (let k = 0; k < lines; k++) {
    const o = k * stride;
    for (let x = 0; x < len; x++) line[x + r] = from[o + x * step];
    for (let b = 0; b < L; b += w) {
      const e = b + w < L ? b + w : L;
      let m = 0;
      for (let x = b; x < e; x++) pre[x] = m = line[x] > m ? line[x] : m;
      m = 0;
      for (let x = e - 1; x >= b; x--) suf[x] = m = line[x] > m ? line[x] : m;
    }
    for (let x = 0; x < len; x++) {
      const a = suf[x];
      const c = pre[x + w - 1];
      to[o + x * step] = a > c ? a : c;
    }
  }
}

/**
 * Marks the cells whose centres are inside any of a shape's rings, OR-ing `value` into `out`. Rings are unioned, not
 * even-odd: the map keeps only outer rings (inner ones are dropped when it's built), and outer rings that overlap
 * (DEN Concourse C's core over its concourse) mustn't cancel out. Used for the walkable mask and for which zone's
 * buildings a cell is in.
 */
export function rasterize(
  g: Pick<WalkGrid, "x0" | "y0" | "cell" | "cols" | "rows">,
  rings: Pt[][],
  out: Uint8Array | Uint16Array,
  value: number,
) {
  for (const r of rings) rasterizeRing(g, r, out, value);
}

function rasterizeRing(g: Pick<WalkGrid, "x0" | "y0" | "cell" | "cols" | "rows">, r: Pt[], out: Uint8Array | Uint16Array, value: number) {
  const { x0, y0, cell, cols, rows } = g;
  // Edges as [top y, bottom y, x at the top, dx/dy], by top y; a scanline only looks at the edges it crosses.
  const edges: [number, number, number, number][] = [];
  let maxY = -Infinity;
  for (let i = 0; i < r.length; i++) {
    const a = r[i];
    const b = r[(i + 1) % r.length];
    if (a[1] === b[1]) continue;
    const [p, q] = a[1] < b[1] ? [a, b] : [b, a];
    edges.push([p[1], q[1], p[0], (q[0] - p[0]) / (q[1] - p[1])]);
    maxY = Math.max(maxY, q[1]);
  }
  if (!edges.length) return;
  edges.sort((e, f) => e[0] - f[0]);
  const r0 = Math.max(0, Math.floor((edges[0][0] - y0) / cell - 0.5));
  const r1 = Math.min(rows - 1, Math.ceil((maxY - y0) / cell - 0.5));
  let next = 0;
  let active: [number, number, number, number][] = [];
  const xs: number[] = [];
  for (let row = r0; row <= r1; row++) {
    const yc = y0 + (row + 0.5) * cell;
    while (next < edges.length && edges[next][0] <= yc) active.push(edges[next++]);
    // An edge crosses the scanline when top ≤ y < bottom (so a shared vertex counts once).
    active = active.filter((e) => e[1] > yc);
    xs.length = 0;
    for (const e of active) xs.push(e[2] + (yc - e[0]) * e[3]);
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const c0 = Math.max(0, Math.ceil((xs[k] - x0) / cell - 0.5));
      const c1 = Math.min(cols - 1, Math.floor((xs[k + 1] - x0) / cell - 0.5));
      for (let c = c0; c <= c1; c++) out[row * cols + c] |= value;
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
 * From a cell, the best nearby cell to stand in: more clearance (up to `cap` meters, in `field`: the walkable area's
 * clearance, or `g.room` for room from the real outline) within `radius`, in the same component and in plain sight,
 * slightly preferring cells close by. Moves a pin off the facade into the concourse.
 */
export function nudgeCell(
  g: WalkGrid,
  from: number,
  radius = 15,
  cap = 12,
  accept?: (cell: number) => boolean,
  field: Float32Array = g.clear,
): number {
  const fc = from % g.cols;
  const fr = (from - fc) / g.cols;
  const R = Math.ceil(radius / g.cell);
  let best = from;
  let bestScore = Math.min(field[from], cap);
  const origin = cellCenter(g, from);
  for (let y = Math.max(0, fr - R); y <= Math.min(g.rows - 1, fr + R); y++) {
    for (let x = Math.max(0, fc - R); x <= Math.min(g.cols - 1, fc + R); x++) {
      const i = y * g.cols + x;
      if (!g.walk[i] || g.comp[i] !== g.comp[from]) continue;
      const d = Math.sqrt((x - fc) ** 2 + (y - fr) ** 2) * g.cell;
      if (d > radius) continue;
      const score = Math.min(field[i], cap) - 0.12 * d;
      if (score > bestScore + 1e-6 && (!accept || accept(i)) && visible(g, origin, cellCenter(g, i), 0)) [best, bestScore] = [i, score];
    }
  }
  return best;
}

/**
 * From a cell in a thin arm of a building (a jet bridge or a gate's stub that OSM draws as part of the terminal), the
 * nearest cell by walking, within `reach` meters, with room from the real outline of at least min(`want`, `share` × the
 * most room within `radius` meters): out of the arm into the corridor it comes off. The cell itself when it already
 * has that much room, or when nothing within reach does. Only cells `accept` allows, in the cell's component, count.
 */
export function outOfArm(
  g: WalkGrid,
  from: number,
  opts: { want?: number; share?: number; radius?: number; reach?: number; accept?: (cell: number) => boolean } = {},
): number {
  const { want = 8, share = 0.7, radius = 50, reach = 60, accept } = opts;
  const { cols, rows, cell } = g;
  const ok = (i: number) => g.walk[i] === 1 && g.comp[i] === g.comp[from] && (!accept || accept(i));
  const fc = from % cols;
  const fr = (from - fc) / cols;
  const R = Math.ceil(radius / cell);
  let most = 0;
  for (let y = Math.max(0, fr - R); y <= Math.min(rows - 1, fr + R); y++) {
    for (let x = Math.max(0, fc - R); x <= Math.min(cols - 1, fc + R); x++) {
      const i = y * cols + x;
      if ((x - fc) ** 2 + (y - fr) ** 2 <= R * R && g.room[i] > most && ok(i)) most = g.room[i];
    }
  }
  const target = Math.min(want, share * most);
  if (g.room[from] >= target) return from;
  // Nearest first (Dijkstra over the few hundred cells within reach).
  const seen = new Map<number, number>([[from, 0]]);
  const heap = new Heap();
  heap.push(0, from);
  while (heap.size) {
    const d = heap.keys[0];
    const cur = heap.pop();
    if (d > seen.get(cur)!) continue;
    if (g.room[cur] >= target) return cur;
    const cx = cur % cols;
    const cy = (cur - cx) / cols;
    for (let k = 0; k < 8; k++) {
      const nx = cx + DX[k];
      const ny = cy + DY[k];
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const ni = ny * cols + nx;
      if (!ok(ni) || (k >= 4 && (!g.walk[cy * cols + nx] || !g.walk[ny * cols + cx]))) continue;
      const nd = d + (k >= 4 ? SQ2 : 1) * cell;
      if (nd <= reach && nd < (seen.get(ni) ?? Infinity)) {
        seen.set(ni, nd);
        heap.push(nd, ni);
      }
    }
  }
  return from;
}

/** A point moved onto the walkable area (nearest cell within `radius`, then nudged inward), or null if too far. */
export function snapPoint(
  g: WalkGrid,
  p: Pt,
  opts: { radius?: number; nudge?: number; cap?: number; accept?: (cell: number) => boolean } = {},
): Pt | null {
  const i = nearestCell(g, p, opts.radius ?? 150, opts.accept);
  if (i < 0) return null;
  const j = (opts.nudge ?? 15) > 0 ? nudgeCell(g, i, opts.nudge ?? 15, opts.cap ?? 12, opts.accept) : i;
  return j === i && cellAt(g, p) === i ? p : cellCenter(g, j);
}

/**
 * True if the straight segment a→b stays on walkable cells with at least `minClear` meters of clearance (and in
 * cells `accept` allows). `minClear` can vary along the segment: a function of t (0 at a, 1 at b), and is measured in
 * `field` (the walkable area's clearance, or `g.room` for room from the real outline). Walks every cell the segment
 * touches (Amanatides–Woo), so it can't clip a wall's corner; through a cell corner both side cells must pass.
 */
export function visible(
  g: WalkGrid,
  a: Pt,
  b: Pt,
  minClear: number | ((t: number) => number),
  accept?: (cell: number) => boolean,
  field: Float32Array = g.clear,
): boolean {
  const { x0, y0, cell, cols, rows, walk } = g;
  let t = 0;
  const ok = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= cols || y >= rows) return false;
    const i = y * cols + x;
    return walk[i] === 1 && field[i] >= (typeof minClear === "number" ? minClear : minClear(Math.min(t, 1))) && (!accept || accept(i));
  };
  let cx = Math.floor((a[0] - x0) / cell);
  let cy = Math.floor((a[1] - y0) / cell);
  const ex = Math.floor((b[0] - x0) / cell);
  const ey = Math.floor((b[1] - y0) / cell);
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const sx = dx > 0 ? 1 : -1;
  const sy = dy > 0 ? 1 : -1;
  const tdx = dx !== 0 ? cell / Math.abs(dx) : Infinity;
  const tdy = dy !== 0 ? cell / Math.abs(dy) : Infinity;
  let tx = dx !== 0 ? ((dx > 0 ? x0 + (cx + 1) * cell - a[0] : a[0] - (x0 + cx * cell)) / Math.abs(dx)) : Infinity;
  let ty = dy !== 0 ? ((dy > 0 ? y0 + (cy + 1) * cell - a[1] : a[1] - (y0 + cy * cell)) / Math.abs(dy)) : Infinity;
  for (let n = Math.abs(ex - cx) + Math.abs(ey - cy); ; n--) {
    if (!ok(cx, cy)) return false;
    if (n <= 0 || (cx === ex && cy === ey)) return true;
    if (Math.abs(tx - ty) < 1e-9) {
      // Through a corner: both cells beside it must be fine too.
      t = tx;
      if (!ok(cx + sx, cy) || !ok(cx, cy + sy)) return false;
      cx += sx;
      cy += sy;
      tx += tdx;
      ty += tdy;
      n--;
    } else if (tx < ty) {
      t = tx;
      cx += sx;
      tx += tdx;
    } else {
      t = ty;
      cy += sy;
      ty += tdy;
    }
  }
}

// --- Search -----------------------------------------------------------------------------------------------------

/** Binary min-heap of (key, cell) pairs on typed arrays. */
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

/** Scratch arrays for A*, reused across searches on one grid (stamps instead of clearing). */
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

/** Sets up a grid's search scratch arrays (each the size of the grid) ahead of its first route, memory and all. */
export function prepareSearch(g: WalkGrid): void {
  const s = searchState(g);
  for (const a of [s.cost, s.parent, s.seen, s.done]) a.fill(0);
}

/**
 * Cheapest 8-connected cell path from s to t (A*, octile heuristic; no squeezing diagonally past a corner), or null
 * when they aren't connected. A cell costs more toward the walls of its corridor (WalkGrid.cost), so paths keep to
 * the middle. `penalty` multiplies a cell's cost (≥ 1), e.g. to discourage cutting through a concourse the route
 * doesn't use.
 */
export function cellPath(g: WalkGrid, s: number, t: number, penalty?: (cell: number) => number): number[] | null {
  if (s < 0 || t < 0 || !g.walk[s] || !g.walk[t] || g.comp[s] !== g.comp[t]) return null;
  if (s === t) return [s];
  const { cost, parent, seen, done, stamp, heap } = searchState(g);
  const { cols, rows, walk, cell } = g;
  const wallCost = g.cost;
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
    const pc = wallCost[cur] * (penalty ? penalty(cur) : 1);
    for (let k = 0; k < 8; k++) {
      const nx = cx + DX[k];
      const ny = cy + DY[k];
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const ni = ny * cols + nx;
      if (!walk[ni] || done[ni] === stamp) continue;
      if (k >= 4 && (!walk[cy * cols + nx] || !walk[ny * cols + cx])) continue;
      const pn = wallCost[ni] * (penalty ? penalty(ni) : 1);
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
 * Turns a cell path into a clean polyline: line-of-sight shortcuts (string pulling) that keep most of the room from
 * the real outline that the path they replace has at the same point (SHORTCUT_SHARE of it, up to SHORTCUT_ROOM
 * meters), then drops points that are in line. The room is local, so one narrow spot on the way (a doorway, the seam
 * between two buildings) doesn't let a long shortcut hug the walls everywhere else. `from`/`to` replace the first and
 * last cell centres; `accept` limits which cells a shortcut may cross.
 */
export function smoothCells(g: WalkGrid, cells: number[], from?: Pt, to?: Pt, accept?: (cell: number) => boolean): Pt[] {
  const pts = cells.map((c) => cellCenter(g, c));
  if (from) pts[0] = from;
  if (to) pts[pts.length - 1] = to;
  if (pts.length <= 2) return pts;
  const n = pts.length;
  // The room the path keeps around each of its points (the least within two cells), and how far along the path each
  // point is.
  const need = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    let lo = Infinity;
    for (let j = Math.max(0, k - 2); j <= Math.min(n - 1, k + 2); j++) lo = Math.min(lo, g.room[cells[j]]);
    need[k] = Math.min(SHORTCUT_SHARE * lo, SHORTCUT_ROOM);
  }
  const s = new Float64Array(n);
  for (let k = 1; k < n; k++) s[k] = s[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
  /** What a shortcut from point i to point j must keep at t: what the path has at the same share of its length. */
  const needAt = (i: number, j: number) => (t: number) => {
    const at = s[i] + t * (s[j] - s[i]);
    let [lo, hi] = [i, j];
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (s[mid] <= at) lo = mid;
      else hi = mid;
    }
    return Math.min(need[lo], need[hi]);
  };
  const out: Pt[] = [pts[0]];
  let i = 0;
  while (i < n - 1) {
    let j = i + 1;
    while (j + 1 < n && visible(g, pts[i], pts[j + 1], needAt(i, j + 1), accept, g.room)) j++;
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
    if (cross / len < 0.75 && visible(g, a, c, 0, accept)) continue;
    res.push(b);
  }
  res.push(out[out.length - 1]);
  return res;
}

/**
 * Multi-source geodesic distance over the walkable cells (Dijkstra, 8-connected): which seed each cell is closest
 * to by walking, and how far. Used to split buildings between the zones (concourses, halls) they hold.
 */
export function nearestSeeds(g: WalkGrid, seeds: { cell: number; label: number }[]): { label: Int16Array; dist: Float32Array } {
  const search = seedSearch(g);
  search.seed(seeds);
  while (!search.step(Infinity));
  return search;
}

/** nearestSeeds in pieces: yields after setting up, seeding, and every STEP_CELLS / 10 cells it settles. */
export function* nearestSeedsJob(g: WalkGrid, seeds: { cell: number; label: number }[]): Generator<void, { label: Int16Array; dist: Float32Array }> {
  const search = seedSearch(g);
  yield;
  search.seed(seeds);
  yield;
  while (!search.step(STEP_CELLS / 10)) yield;
  return search;
}

/**
 * A nearestSeeds search: `seed` it, then `step` settles `budget` cells at a time (true once it's done). The work is in
 * plain functions, not a generator's body, so it runs at full speed.
 */
function seedSearch(g: WalkGrid) {
  const { cols, rows, walk, cell } = g;
  const n = cols * rows;
  const label = new Int16Array(n).fill(-1);
  const dist = new Float32Array(n).fill(Infinity);
  const heap = new Heap();
  const seed = (seeds: { cell: number; label: number }[]) => {
    const seeded: number[] = [];
    for (const s of seeds) {
      if (s.cell < 0 || !walk[s.cell] || dist[s.cell] === 0) continue;
      dist[s.cell] = 0;
      label[s.cell] = s.label;
      seeded.push(s.cell);
    }
    // Only seeds at the edge of the seeded area spread (inside it, every cell is already a seed's).
    for (const i of seeded) {
      const cx = i % cols;
      const cy = (i - cx) / cols;
      for (let k = 0; k < 8; k++) {
        const nx = cx + DX[k];
        const ny = cy + DY[k];
        if (nx >= 0 && ny >= 0 && nx < cols && ny < rows && walk[ny * cols + nx] && dist[ny * cols + nx] !== 0) {
          heap.push(0, i);
          break;
        }
      }
    }
  };
  const step = (budget: number): boolean => {
    let work = 0;
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
        // Rounded as stored, so the heap's key matches the distance kept for the cell.
        const nd = Math.fround(d + (k >= 4 ? SQ2 : 1) * cell);
        if (nd < dist[ni]) {
          dist[ni] = nd;
          label[ni] = label[cur];
          heap.push(nd, ni);
        }
      }
      if (++work >= budget) return heap.size === 0;
    }
    return true;
  };
  return { label, dist, seed, step };
}

const wallCache = new WeakMap<WalkGrid, Int32Array>();

/** Walkable cells on a wall of a building (a 4-neighbour isn't walkable), off the grid's edge; worked out once. */
export function wallCells(g: WalkGrid): Int32Array {
  let out = wallCache.get(g);
  if (out) return out;
  const list: number[] = [];
  const { cols, rows, walk } = g;
  for (let r = 1; r < rows - 1; r++) {
    for (let c = 1; c < cols - 1; c++) {
      const i = r * cols + c;
      if (walk[i] && (!walk[i - 1] || !walk[i + 1] || !walk[i - cols] || !walk[i + cols])) list.push(i);
    }
  }
  wallCache.set(g, (out = Int32Array.from(list)));
  return out;
}

/** Walkable cells of a set that are on a wall of the building. */
function edgeCells(g: WalkGrid, member: (cell: number) => boolean): number[] {
  const out: number[] = [];
  for (const i of wallCells(g)) if (member(i)) out.push(i);
  return out;
}

export interface Gap {
  /** Edge cell on the `a` side and on the `b` side. */
  a: number;
  b: number;
  /** Meters between them. */
  d: number;
}

/**
 * Where two separate walkable areas (cells `a` and `b` accept, e.g. two buildings joined by a tunnel or bridge
 * that isn't mapped as a terminal) come closest: every pair of wall cells within `slack` meters of the smallest gap,
 * closest first, so the caller can pick the one that suits the route. Empty if they're more than `maxGap` apart.
 */
export function gapsBetween(g: WalkGrid, a: (cell: number) => boolean, b: (cell: number) => boolean, maxGap = 400, slack = 25): Gap[] {
  const ea = edgeCells(g, a);
  const eb = edgeCells(g, b);
  if (!ea.length || !eb.length) return [];
  const { cols, cell } = g;
  // Bucket b's edge cells (8×8-cell buckets) for nearest-neighbour lookups.
  const B = 8;
  const bc = Math.ceil(cols / B);
  const buckets = new Map<number, number[]>();
  for (const i of eb) {
    const x = i % cols;
    const k = Math.floor((i - x) / cols / B) * bc + Math.floor(x / B);
    const list = buckets.get(k);
    if (list) list.push(i);
    else buckets.set(k, [i]);
  }
  // b's bounding box (in cells), for a quick lower bound on how far each a cell is from anything in b.
  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const j of eb) {
    const x = j % cols;
    const y = (j - x) / cols;
    [minX, minY, maxX, maxY] = [Math.min(minX, x), Math.min(minY, y), Math.max(maxX, x), Math.max(maxY, y)];
  }
  const maxR = Math.ceil(maxGap / cell / B) + 1;
  const found: Gap[] = [];
  let bestD = Infinity;
  for (const i of ea) {
    const x = i % cols;
    const y = (i - x) / cols;
    const lower = Math.hypot(Math.max(minX - x, 0, x - maxX), Math.max(minY - y, 0, y - maxY)) * cell;
    if (lower > Math.min(maxGap, bestD + slack)) continue;
    const bx = Math.floor(x / B);
    const by = Math.floor(y / B);
    let best = -1;
    let bd = Infinity;
    const visit = (xx: number, yy: number) => {
      if (xx < 0 || yy < 0 || xx >= bc) return;
      const list = buckets.get(yy * bc + xx);
      if (!list) return;
      for (const j of list) {
        const jx = j % cols;
        const d = (jx - x) ** 2 + ((j - jx) / cols - y) ** 2;
        if (d < bd) [bd, best] = [d, j];
      }
    };
    for (let r = 0; r <= maxR; r++) {
      // Every cell in ring r of buckets is at least (r - 1)·B cells away.
      const ringMin = (r - 1) * B * cell;
      if ((best >= 0 && ringMin > Math.sqrt(bd) * cell) || ringMin > Math.min(maxGap, bestD + slack)) break;
      if (r === 0) visit(bx, by);
      for (let k = -r; r > 0 && k <= r; k++) {
        visit(bx + k, by - r);
        visit(bx + k, by + r);
        if (k > -r && k < r) {
          visit(bx - r, by + k);
          visit(bx + r, by + k);
        }
      }
    }
    if (best < 0) continue;
    const d = Math.sqrt(bd) * cell;
    if (d > maxGap || d > bestD + slack) continue;
    bestD = Math.min(bestD, d);
    found.push({ a: i, b: best, d });
  }
  return found.filter((f) => f.d <= bestD + slack).sort((p, q) => p.d - q.d);
}

/**
 * One place to cross between two areas, the same whatever the route (a tunnel is where it is): among the gaps within
 * `gapsBetween`'s slack of the narrowest, the one with the lowest `extra` cost (e.g. far from both zones' middles).
 */
export function fixedGap(g: WalkGrid, gaps: Gap[], extra: (a: Pt, b: Pt) => number = () => 0): Gap | null {
  let best: Gap | null = null;
  let bestCost = Infinity;
  for (const gap of gaps) {
    const cost = gap.d + extra(cellCenter(g, gap.a), cellCenter(g, gap.b));
    if (cost < bestCost) [best, bestCost] = [gap, cost];
  }
  return best;
}
