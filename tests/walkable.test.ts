import { test } from "node:test";
import assert from "node:assert/strict";
import type { AirportMapData } from "../src/shared/lib/airport-map";
import {
  cellAt,
  cellPath,
  gapsBetween,
  isWalkable,
  nearestSeeds,
  nearestSeedsJob,
  outOfArm,
  smoothCells,
  snapPoint,
  stitchRings,
  visible,
  walkGrid,
  type Pt,
} from "../src/shared/lib/walkable";

// A made-up L-shaped terminal: a 200 m arm along the top and one down the left, both 40 m wide.
const L: Pt[] = [[0, 0], [200, 0], [200, 40], [40, 40], [40, 200], [0, 200], [0, 0]];
const map = (rings: Pt[][][]): AirportMapData => ({
  code: "TST",
  origin: [0, 0],
  terminals: rings.map((r, i) => ({ name: `T${i}`, rings: r })),
  runways: [],
  gates: [],
  attribution: "test",
});

/** Points every meter along a polyline. */
const samples = (pts: Pt[]) =>
  pts.slice(1).flatMap((b, i) => {
    const a = pts[i];
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1])));
    return Array.from({ length: n + 1 }, (_, k) => [a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n] as Pt);
  });

test("walkable grid: inside the L is walkable, the empty quadrant isn't", () => {
  const g = walkGrid(map([[L]]))!;
  assert.ok(isWalkable(g, [20, 20]) && isWalkable(g, [180, 20]) && isWalkable(g, [20, 180]));
  assert.ok(!isWalkable(g, [120, 120]));
  assert.equal(g.comp[cellAt(g, [180, 20])], g.comp[cellAt(g, [20, 180])]);
  // No line of sight across the empty quadrant.
  assert.ok(!visible(g, [180, 20], [20, 180], 0));
  assert.ok(visible(g, [180, 20], [20, 20], 0));
});

test("path from one arm to the other goes around the corner, down the middle", () => {
  const g = walkGrid(map([[L]]))!;
  const a: Pt = [185, 20];
  const b: Pt = [20, 185];
  const pts = smoothCells(g, cellPath(g, cellAt(g, a), cellAt(g, b))!, a, b);
  assert.deepEqual(pts[0], a);
  assert.deepEqual(pts[pts.length - 1], b);
  for (const p of samples(pts)) {
    assert.ok(isWalkable(g, p), `${p} is outside`);
    assert.ok(!(p[0] > 44 && p[1] > 44), `${p} cuts across the empty quadrant`);
  }
  // It turns in the corner square, and keeps off the walls on the way.
  assert.ok(pts.some(([x, y]) => x < 44 && y < 44));
  assert.ok(pts.length <= 5, `${pts.length} points: should be a clean polyline`);
});

test("snapping moves a gate on the apron into the building", () => {
  const g = walkGrid(map([[L]]))!;
  const p = snapPoint(g, [120, 70])!; // 30 m south of the top arm
  assert.ok(isWalkable(g, p) && p[1] < 40, `${p}`);
  assert.equal(snapPoint(g, [400, 400]), null); // too far from anything
});

test("separate buildings are separate components, and the gap between them is measured", () => {
  const a: Pt[] = [[0, 0], [100, 0], [100, 30], [0, 30], [0, 0]];
  const b: Pt[] = [[0, 90], [100, 90], [100, 120], [0, 120], [0, 90]];
  const g = walkGrid(map([[a], [b]]))!;
  const ca = g.comp[cellAt(g, [50, 15])];
  const cb = g.comp[cellAt(g, [50, 105])];
  assert.notEqual(ca, cb);
  const gaps = gapsBetween(g, (c) => g.comp[c] === ca, (c) => g.comp[c] === cb);
  assert.ok(gaps.length > 0);
  // 60 m between the walls, less a cell of dilation on each side.
  assert.ok(gaps[0].d > 45 && gaps[0].d < 60, `${gaps[0].d}`);
});

test("rings split into several OSM ways are stitched back into one closed ring", () => {
  const rings = stitchRings([
    [[0, 0], [10, 0], [10, 10]],
    [[0, 10], [0, 0]],
    [[10, 10], [0, 10]],
  ]);
  assert.equal(rings.length, 1);
  assert.deepEqual(rings[0][0], rings[0][rings[0].length - 1]);
  assert.equal(rings[0].length, 5);
});

test("overlapping outer rings are unioned, not cut out of each other", () => {
  // A concourse with its core drawn as a second ring over it (DEN Concourse C).
  const concourse: Pt[] = [[0, 0], [300, 0], [300, 40], [0, 40], [0, 0]];
  const core: Pt[] = [[120, -30], [180, -30], [180, 70], [120, 70], [120, -30]];
  const g = walkGrid(map([[concourse, core]]))!;
  assert.ok(isWalkable(g, [150, 20]), "where the rings overlap");
  assert.ok(isWalkable(g, [150, 60]) && isWalkable(g, [20, 20]));
});

test("smoothing keeps off the walls even when the path starts against one", () => {
  // A hall with a 30 m pillar in the middle, entered right at its west wall: the tight start mustn't let the
  // shortcut around the pillar graze it (the clearance a shortcut keeps is the path's own, where it is).
  const hall: Pt[][] = [
    [[0, 0], [60, 0], [60, 90], [0, 90], [0, 0]],
    [[90, 0], [150, 0], [150, 90], [90, 90], [90, 0]],
    [[60, 0], [90, 0], [90, 30], [60, 30], [60, 0]],
    [[60, 60], [90, 60], [90, 90], [60, 90], [60, 60]],
  ];
  const g = walkGrid(map(hall.map((r) => [r])))!;
  const a: Pt = [-2, 45];
  const b: Pt = [147, 45];
  assert.ok(g.clear[cellAt(g, a)] <= 4, "starts against the wall");
  const pts = smoothCells(g, cellPath(g, cellAt(g, a), cellAt(g, b))!, a, b);
  for (const p of samples(pts)) {
    assert.ok(isWalkable(g, p), `${p} is outside`);
    if (p[0] > 50 && p[0] < 100) assert.ok(g.clear[cellAt(g, p)] >= 6, `${p.map(Math.round)} grazes the pillar (${g.clear[cellAt(g, p)]} m clear)`);
  }
});

test("paths keep to the middle of a wide corridor, round the bend too, not along its inside wall", () => {
  // A 60 m wide L: from the end of one arm to the end of the other, the shortest way hugs the inner corner.
  const wide: Pt[] = [[0, 0], [400, 0], [400, 60], [60, 60], [60, 400], [0, 400], [0, 0]];
  const g = walkGrid(map([[wide]]))!;
  const a: Pt = [380, 30];
  const b: Pt = [30, 380];
  const pts = smoothCells(g, cellPath(g, cellAt(g, a), cellAt(g, b))!, a, b);
  for (const p of samples(pts)) {
    if (Math.hypot(p[0] - a[0], p[1] - a[1]) < 20 || Math.hypot(p[0] - b[0], p[1] - b[1]) < 20) continue;
    assert.ok(g.room[cellAt(g, p)] >= 8, `${p.map(Math.round)} is ${g.room[cellAt(g, p)]} m from the wall`);
  }
});

test("room is measured from the real outline: none outside it, about the distance to the wall inside", () => {
  const g = walkGrid(map([[L]]))!;
  assert.equal(g.room[cellAt(g, [-2, 100])], 0); // in the walkable ring around the building, outside its outline
  assert.ok(Math.abs(g.room[cellAt(g, [20, 100])] - 20) <= 3, `${g.room[cellAt(g, [20, 100])]}`); // the arm's middle
  assert.ok(g.cost[cellAt(g, [20, 100])] < g.cost[cellAt(g, [4, 100])], "the middle costs less than the wall");
});


test("a point in a jet bridge or gate stub moves out into the concourse it comes off", () => {
  // A 40 m wide concourse along the top, with a 9 m wide, 40 m long stub hanging off it.
  const concourse: Pt[] = [[0, 0], [300, 0], [300, 40], [160, 40], [160, 80], [151, 80], [151, 40], [0, 40], [0, 0]];
  const g = walkGrid(map([[concourse]]))!;
  const tip = cellAt(g, [155.5, 76]);
  assert.ok(g.room[tip] < 5, `room at the stub's tip ${g.room[tip]}`);
  const out = outOfArm(g, tip);
  assert.ok(g.room[out] >= 8, `moved to a cell with room ${g.room[out]}`);
  const [x, y] = [(out % g.cols + 0.5) * g.cell + g.x0, (Math.floor(out / g.cols) + 0.5) * g.cell + g.y0];
  assert.ok(y < 40 && Math.abs(x - 155.5) < 20, `out at ${x},${y}`);
  // Already roomy: stays put.
  const mid = cellAt(g, [100, 20]);
  assert.equal(outOfArm(g, mid), mid);
});

test("the seed search gives the same zones in pieces as all at once", () => {
  const g = walkGrid(map([[L]]))!;
  const seeds = [
    { cell: cellAt(g, [185, 20]), label: 0 },
    { cell: cellAt(g, [20, 185]), label: 1 },
  ];
  const whole = nearestSeeds(g, seeds);
  const job = nearestSeedsJob(g, seeds);
  let step = job.next();
  let pieces = 0;
  while (!step.done) [step, pieces] = [job.next(), pieces + 1];
  assert.ok(pieces >= 2);
  assert.deepEqual(Array.from(step.value.label), Array.from(whole.label));
  // Every walkable cell is reached, and the corner is about as far from each seed.
  for (let i = 0; i < g.walk.length; i++) if (g.walk[i]) assert.ok(whole.label[i] >= 0);
  const corner = cellAt(g, [20, 20]);
  assert.ok(Math.abs(whole.dist[corner] - 165) < 15, `${whole.dist[corner]}`);
});
