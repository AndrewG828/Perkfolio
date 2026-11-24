import { test } from "node:test";
import assert from "node:assert/strict";
import { airportNav } from "../src/shared/data/airport-nav";
import { loungesAt } from "../src/shared/lib/lounge-access";
import { gatePoint, loungePoint, routeGeometry, zoneAnchor, zoneAt, type AirportMapData } from "../src/shared/lib/airport-map";
import { parseGate, routeTo } from "../src/shared/lib/wayfinding";
import { build } from "../scripts/build-airport-maps";

// A tiny made-up ATL: concourses as columns 300 m apart, gates 1..20 down each one.
const concourses = ["T", "A", "B", "C", "D", "E", "F"];
const data: AirportMapData = {
  code: "ATL",
  origin: [33.64, -84.43],
  terminals: concourses.map((c, i) => ({ name: `Concourse ${c}`, rings: [[[i * 300 - 20, -400], [i * 300 + 20, -400], [i * 300 + 20, 400], [i * 300 - 20, 400]]] })),
  runways: [],
  gates: concourses.flatMap((c, i) => Array.from({ length: 20 }, (_, n) => ({ ref: `${c}${n + 1}`, x: i * 300, y: -380 + n * 40, t: `Concourse ${c}` }))),
  attribution: "test",
};
const nav = airportNav.ATL;
const zone = (id: string) => nav.zones.find((z) => z.id === id)!;

/** True if a point is inside concourse `c`'s 40 m wide building in the made-up ATL. */
const inConcourse = (c: string, [x, y]: [number, number]) => {
  const cx = concourses.indexOf(c) * 300;
  return x >= cx - 20 && x <= cx + 20 && y >= -400 && y <= 400;
};

test("zone anchors sit in the middle of their gates, inside the building", () => {
  const a = zoneAnchor(data, nav, zone("E"))!;
  assert.ok(inConcourse("E", a), `${a}`);
  assert.ok(Math.abs(a[0] - 1500) <= 3 && Math.abs(a[1]) < 40, `${a}`);
});

test("gate and lounge positions come from the gate refs", () => {
  assert.deepEqual(gatePoint(data, zone("B"), "B18"), [600, -380 + 17 * 40]);
  const centurion = loungesAt("ATL").find((l) => l.id === "centurion-atl-e")!;
  const p = loungePoint(data, nav, centurion)!; // near gate E11
  assert.ok(inConcourse("E", p) && Math.hypot(p[0] - 1500, p[1] - (-380 + 10 * 40)) < 5, `${p}`);
});

test("route geometry: walk to the train, ride A→E as one dashed segment, walk to the lounge", () => {
  const lounge = loungesAt("ATL").find((l) => l.id === "centurion-atl-e")!;
  const origin = { kind: "gate" as const, zone: "A", gate: parseGate("A2")! };
  const route = routeTo(nav, origin, lounge)!;
  const geo = routeGeometry(data, nav, origin, route, lounge);
  assert.ok(geo.start && Math.hypot(geo.start[0] - 300, geo.start[1] - (-380 + 1 * 40)) < 5, `${geo.start}`);
  assert.deepEqual(geo.segments.map((s) => s.mode), ["walk", "train", "walk"]);
  assert.equal(geo.segments[1].pts.length, 5); // A, B, C, D, E
  // The walks stay inside their concourses, down the middle rather than along the gates' facade.
  assert.ok(geo.segments[0].pts.every((p) => inConcourse("A", p)));
  assert.ok(geo.segments[2].pts.every((p) => inConcourse("E", p)));
  assert.ok(geo.segments[0].pts.every(([x]) => Math.abs(x - 300) <= 5));
});

test("build() projects OSM data and tags gates with their terminal", () => {
  const raw: Parameters<typeof build>[1] = {
    elements: [
      { type: "way", id: 1, tags: { aeroway: "terminal", name: "Concourse A" }, geometry: [{ lat: 33.64, lon: -84.431 }, { lat: 33.64, lon: -84.429 }, { lat: 33.641, lon: -84.429 }, { lat: 33.641, lon: -84.431 }, { lat: 33.64, lon: -84.431 }] },
      { type: "node", id: 2, lat: 33.6405, lon: -84.43, tags: { aeroway: "gate", ref: "a 12" } },
    ],
  };
  const out = build("ATL", raw);
  assert.equal(out.gates[0].ref, "A12");
  assert.equal(out.gates[0].t, "Concourse A");
  assert.equal(out.terminals.length, 1);
});

test("route geometry: a walk between concourses crosses where they meet, not through the hubs", () => {
  // Made-up CLT: concourse D along y=0 (D1..D10), concourse E heading north from D's far end (E1 nearest D10).
  const clt: AirportMapData = {
    code: "CLT",
    origin: [35.21, -80.94],
    terminals: [],
    runways: [],
    gates: [
      ...Array.from({ length: 10 }, (_, n) => ({ ref: `D${n + 1}`, x: n * 100, y: 0, t: "Concourse D" })),
      ...Array.from({ length: 10 }, (_, n) => ({ ref: `E${n + 1}`, x: 1000, y: 100 + n * 100, t: "Concourse E" })),
    ],
    attribution: "test",
  };
  const cltNav = airportNav.CLT;
  const lounge = loungesAt("CLT").find((l) => l.id === "admirals-club-clt-d")!;
  const origin = { kind: "gate" as const, zone: "E", gate: parseGate("E10")! };
  const route = routeTo(cltNav, origin, lounge)!;
  const geo = routeGeometry(clt, cltNav, origin, route, lounge);
  assert.deepEqual(geo.segments.map((s) => s.mode), ["walk"]);
  const pts = geo.segments[0].pts.map((p) => p.join(","));
  assert.ok(pts.includes("1000,100"), "leaves E at E1");
  assert.ok(pts.includes("900,0"), "enters D at D10");
});

test("gate refs: several letters cover their gate, and a gate missing from the map is placed by its neighbours", () => {
  // Made-up JFK: Terminal 1's "3AB" and "9", Terminal 8's 8, 10 and 12 (OSM has no gate 9 in Terminal 8).
  const jfk: AirportMapData = {
    code: "JFK",
    origin: [40.64, -73.78],
    terminals: [],
    runways: [],
    gates: [
      { ref: "3AB", x: 0, y: 0, t: "Terminal 1" },
      { ref: "9", x: 500, y: 0, t: "Terminal 1" },
      { ref: "8", x: 0, y: 300, t: "Terminal 8" },
      { ref: "10", x: 40, y: 300, t: "Terminal 8" },
      { ref: "12", x: 80, y: 300, t: "Terminal 8" },
    ],
    attribution: "test",
  };
  const z = (id: string) => airportNav.JFK.zones.find((x) => x.id === id)!;
  assert.deepEqual(gatePoint(jfk, z("1"), "3"), [0, 0]);
  // Terminal 8's gate 9 is between its 8 and 10, not Terminal 1's gate 9.
  assert.deepEqual(gatePoint(jfk, z("8"), "9"), [20, 300]);
  // Nothing numbered near gate 40: not on the map.
  assert.equal(gatePoint(jfk, z("8"), "40"), null);
});

test("a building named for two concourses is split between them (IAD's Concourse A & B)", () => {
  // One 1 km building: B gates on its west half, A gates on its east half.
  const iad: AirportMapData = {
    code: "IAD",
    origin: [38.95, -77.45],
    terminals: [{ name: "Concourse A & B", rings: [[[0, 0], [1000, 0], [1000, 40], [0, 40], [0, 0]]] }],
    runways: [],
    gates: [
      ...Array.from({ length: 10 }, (_, n) => ({ ref: `B${40 + n}`, x: 50 + n * 40, y: 45, t: "Concourse A & B" })),
      ...Array.from({ length: 10 }, (_, n) => ({ ref: `A${14 + n}`, x: 950 - n * 40, y: 45, t: "Concourse A & B" })),
    ],
    attribution: "test",
  };
  const iadNav = airportNav.IAD;
  const z = (id: string) => iadNav.zones.find((x) => x.id === id)!;
  const [a, b] = [zoneAnchor(iad, iadNav, z("A"))!, zoneAnchor(iad, iadNav, z("B"))!];
  assert.ok(b[0] < 500 && a[0] > 500, `A ${a}, B ${b}`);
  assert.equal(zoneAt(iad, iadNav, b), "B");
  // Each concourse's middle is inside the building, not on its wall.
  for (const p of [a, b]) assert.ok(p[1] > 8 && p[1] < 32, `${p}`);
});
