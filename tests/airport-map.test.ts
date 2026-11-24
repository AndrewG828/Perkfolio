import { test } from "node:test";
import assert from "node:assert/strict";
import { airportNav } from "../src/shared/data/airport-nav";
import { loungesAt } from "../src/shared/lib/lounge-access";
import { gatePoint, loungePoint, routeGeometry, zoneAnchor, type AirportMapData } from "../src/shared/lib/airport-map";
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

test("zone anchors sit in the middle of their gates", () => {
  const a = zoneAnchor(data, zone("E"))!;
  assert.equal(a[0], 1500);
  assert.ok(Math.abs(a[1]) < 30);
});

test("gate and lounge positions come from the gate refs", () => {
  assert.deepEqual(gatePoint(data, zone("B"), "B18"), [600, -380 + 17 * 40]);
  const centurion = loungesAt("ATL").find((l) => l.id === "centurion-atl-e")!;
  assert.deepEqual(loungePoint(data, nav, centurion), [1500, -380 + 10 * 40]); // near gate E11
});

test("route geometry: walk to the train, ride A→E as one dashed segment, walk to the lounge", () => {
  const lounge = loungesAt("ATL").find((l) => l.id === "centurion-atl-e")!;
  const origin = { kind: "gate" as const, zone: "A", gate: parseGate("A2")! };
  const route = routeTo(nav, origin, lounge)!;
  const geo = routeGeometry(data, nav, origin, route, lounge);
  assert.deepEqual(geo.start, [300, -380 + 1 * 40]);
  assert.deepEqual(geo.segments.map((s) => s.mode), ["walk", "train", "walk"]);
  assert.equal(geo.segments[1].pts.length, 5); // A, B, C, D, E
  // The first walk follows the gates down the concourse (A3, A4, ...) rather than cutting straight across.
  assert.ok(geo.segments[0].pts.length > 3);
  assert.ok(geo.segments[0].pts.every(([x]) => x === 300));
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
