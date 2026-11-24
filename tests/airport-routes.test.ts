import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { airportNav } from "../src/shared/data/airport-nav";
import { gateOf, loungesAt } from "../src/shared/lib/lounge-access";
import { linkKey, parseGate, routeTo, zoneForLounge, zonesForGate, type Origin, type ParsedGate } from "../src/shared/lib/wayfinding";
import { cellAt, isWalkable, rasterize, terminalRings, walkGrid, type Pt, type WalkGrid } from "../src/shared/lib/walkable";
import { gatePoint, loungePoint, prepareMap, routeGeometry, zoneAt, zoneMarkers, type AirportMapData } from "../src/shared/lib/airport-map";

/**
 * Every pre-built airport map with wayfinding data, from security, from each zone, from every gate OSM has (each
 * gate to a few lounges, so it stays quick) and from every lounge's gate (some of which OSM lacks): the start is in
 * the zone you said; walks stay inside the buildings (and, but for the seams between buildings drawn apart, inside
 * their real outlines) as clean polylines down the middle of the concourses, not along their walls; a walk never
 * runs back over the train, bus or trip outside security it leaves or meets; rides start and end apart from the You
 * marker and the pin; a connector (a walkway the map doesn't draw, like ORD's B–C tunnel) only joins zones that have
 * a walkway between them, always in the same place; and pins and zone middles sit well inside the buildings, pins by
 * their gates.
 *
 * The maps the browser builds from OpenStreetMap when there's no file (LAS, MIA, PHL, PHX) aren't covered: there's
 * no OSM data to build them from here.
 */

const dir = join(__dirname, "..", "public", "airport-maps");
/** Longest allowed connector: LAX's Midfield Satellite tunnel to Tom Bradley is about 280 m on the map. */
const MAX_CONNECTOR = 300;

const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const length = (pts: Pt[]) => pts.slice(1).reduce((s, p, i) => s + dist(pts[i], p), 0);
/** Points every ~2 m along a segment. */
const along = (a: Pt, b: Pt) => {
  const n = Math.max(1, Math.ceil(dist(a, b) / 2));
  return Array.from({ length: n + 1 }, (_, i) => [a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n] as Pt);
};
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
function segDist(p: Pt, a: Pt, b: Pt): number {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

/**
 * Meters of a walk (from 12 m to 100 m along it from where it meets the ride) within 10 m of the ride's first 150 m
 * from there: a walk doubling back over the ride (a train run past the lounge, a trip outside security set off back
 * over the walk to the exit). `walk` and `ride` both start where they meet.
 */
function overRide(walk: Pt[], ride: Pt[]): number {
  const stops: Pt[] = [];
  for (let s = 0; s <= Math.min(150, length(ride)); s += 3) stops.push(pointAt(ride, s));
  let m = 0;
  for (let s = 12; s <= Math.min(100, length(walk)); s += 2) {
    const q = pointAt(walk, s);
    if (stops.slice(1).some((r, i) => segDist(q, stops[i], r) < 10)) m += 2;
  }
  return m;
}

/** The most room from the real outline within `r` meters of a point (how wide the building is there). */
function roomNear(g: WalkGrid, p: Pt, r: number): number {
  const i = cellAt(g, p);
  const R = Math.ceil(r / g.cell);
  const [c0, r0] = [i % g.cols, Math.floor(i / g.cols)];
  let m = 0;
  for (let y = Math.max(0, r0 - R); y <= Math.min(g.rows - 1, r0 + R); y++)
    for (let x = Math.max(0, c0 - R); x <= Math.min(g.cols - 1, c0 + R); x++) m = Math.max(m, g.room[y * g.cols + x]);
  return m;
}

const maps = readdirSync(dir)
  .map((f) => f.replace(/\.json$/, ""))
  .filter((code) => airportNav[code]);

test("there are pre-built maps to check", () => assert.ok(maps.length >= 10));

for (const code of maps) {
  test(`${code}: routes start where you are, stay inside the terminals down the middle, and never double back`, () => {
    const data: AirportMapData = JSON.parse(readFileSync(join(dir, `${code}.json`), "utf8"));
    const nav = airportNav[code];
    const g = walkGrid(data);
    assert.ok(g, "map has terminal outlines");
    prepareMap(data, nav);
    // The real outlines (the walkable grid is a cell wider all round).
    const inside = new Uint8Array(g.cols * g.rows);
    for (const rs of terminalRings(data)) rasterize(g, rs, inside, 1);
    const inOutline = (p: Pt) => inside[cellAt(g, p)] === 1;
    /** Well inside the building: as far from the real wall as `want` meters, or nearly as far as it's wide there. */
    const wellInside = (p: Pt, want: number, r: number) => isWalkable(g, p) && g.room[cellAt(g, p)] >= Math.min(want, roomNear(g, p, r) - 2);

    const lounges = loungesAt(code);
    for (const l of lounges) {
      const p = loungePoint(data, nav, l);
      assert.ok(p && wellInside(p, 6, 15), `${l.id} pin at ${p} is on a wall or outside`);
      // By its gate, when the gate is on the map (Heathrow's lounges too, whose terminals have no gate rules).
      const gate = gateOf(l);
      const zone = zoneForLounge(nav, l);
      const at = gate && zone ? gatePoint(data, zone, gate) : null;
      if (at) assert.ok(dist(p, at) <= 60, `${l.id} is ${Math.round(dist(p, at))} m from gate ${gate}`);
    }
    for (const m of zoneMarkers(data, nav)) assert.ok(wellInside(m.p, 8, 20), `${m.zone.id} middle at ${m.p} is on a wall or outside`);

    const origins: { origin: Origin; name: string; to: typeof lounges }[] = [{ origin: { kind: "landside" }, name: "security", to: lounges }];
    let turn = 0;
    for (const z of nav.zones) {
      origins.push({ origin: { kind: "gate", zone: z.id }, name: `@${z.id}`, to: lounges });
      const gates = new Map<string, ParsedGate>();
      const add = (label: string) => {
        const p = parseGate(label);
        if (p && zonesForGate(nav, p).some((x) => x.id === z.id)) gates.set(p.label, p);
      };
      for (const gt of data.gates) {
        const m = /^([A-Z]{0,2})-?(\d{1,3})/.exec(gt.ref);
        if (m) add(`${m[1]}${m[2]}`);
      }
      // Lounges' own gates, some of which OSM lacks (placed from their neighbours, or at the zone's middle).
      for (const l of lounges) add(gateOf(l) ?? "");
      for (const gate of gates.values()) {
        // A few lounges per gate, a different few each time, so between them the gates reach every lounge.
        const to = lounges.length <= 3 ? lounges : [0, 1, 2].map((k) => lounges[(turn + k * Math.ceil(lounges.length / 3)) % lounges.length]);
        turn++;
        origins.push({ origin: { kind: "gate", zone: z.id, gate }, name: `gate ${gate.label}`, to });
      }
    }

    const walkLinks = new Set(nav.links.filter((l) => l.mode === "walk").map((l) => linkKey(l.a, l.b)));
    const crossings = new Map<string, string>();
    let [walked, outside, nearWall, rides, ridesAtMarker, slowest] = [0, 0, 0, 0, 0, 0];
    for (const { origin, name, to } of origins) {
      for (const l of to) {
        const route = routeTo(nav, origin, l);
        if (!route) continue;
        const t0 = performance.now();
        const geo = routeGeometry(data, nav, origin, route, l);
        slowest = Math.max(slowest, performance.now() - t0);
        const where = `${name} → ${l.id}`;
        for (const p of [geo.start, geo.end]) assert.ok(p && isWalkable(g, p), `${where}: end point ${p} is outside`);
        // The start is in the zone you said (at your gate, or its middle when the gate isn't on the map).
        if (origin.kind === "gate") assert.equal(zoneAt(data, nav, geo.start!), origin.zone, `${where}: starts in ${zoneAt(data, nav, geo.start!)} at ${geo.start}`);
        geo.segments.forEach((s, i) => {
          if (s.mode === "walk" || s.mode === "connector") return;
          // A walk never runs back over the ride it leaves or meets (trains past the lounge, trips outside security
          // set off back over the walk to the exit).
          const [prev, next] = [geo.segments[i - 1], geo.segments[i + 1]];
          if (next?.mode === "walk") assert.ok(overRide(next.pts, [...s.pts].reverse()) < 25, `${where}: the walk after the ${s.mode} runs back over it`);
          if (prev?.mode === "walk") assert.ok(overRide([...prev.pts].reverse(), s.pts) < 25, `${where}: the ${s.mode} sets off back over the walk`);
          rides++;
          if ((geo.start && dist(s.pts[0], geo.start) < 3 && geo.startAt !== "zone" && origin.kind === "gate") || (geo.end && dist(s.pts[s.pts.length - 1], geo.end) < 3)) ridesAtMarker++;
        });
        let routeWalked = 0;
        let routeNear = 0;
        for (const s of geo.segments) {
          if (s.mode === "connector") {
            const [a, b] = [s.pts[0], s.pts[s.pts.length - 1]];
            assert.ok(dist(a, b) <= MAX_CONNECTOR, `${where}: ${Math.round(dist(a, b))} m connector`);
            const [za, zb] = [zoneAt(data, nav, a), zoneAt(data, nav, b)];
            assert.ok(za && zb, `${where}: connector end outside every zone`);
            if (za !== zb) assert.ok(walkLinks.has(linkKey(za, zb)), `${where}: connector between ${za} and ${zb}, which have no walkway`);
            // One walkway, one place, whatever the route.
            const key = [za, zb].sort().join("|");
            const at = [a, b].map((p) => p.map(Math.round).join(",")).sort().join(" ");
            assert.equal(crossings.get(key) ?? at, at, `${where}: the ${key} walkway moved`);
            crossings.set(key, at);
          } else if (s.mode === "seam") {
            // A gap between buildings drawn apart: short, from a building to a building.
            assert.ok(length(s.pts) <= 40, `${where}: ${Math.round(length(s.pts))} m seam near ${s.pts[0].map(Math.round)}`);
            for (const p of [s.pts[0], s.pts[s.pts.length - 1]]) assert.ok(isWalkable(g, p), `${where}: seam ends outside at ${p}`);
          } else if (s.mode === "walk") {
            let steps = 0;
            for (let i = 1; i < s.pts.length; i++) {
              // A clean polyline, not a staircase of grid cells.
              steps = dist(s.pts[i - 1], s.pts[i]) <= g.cell * Math.SQRT2 + 0.01 ? steps + 1 : 0;
              assert.ok(steps < 10, `${where}: walk is a staircase of grid cells near ${s.pts[i].map(Math.round)}`);
              let run = 0;
              for (const p of along(s.pts[i - 1], s.pts[i])) {
                assert.ok(isWalkable(g, p), `${where}: walk leaves the buildings at ${p.map(Math.round)}`);
                walked++;
                routeWalked++;
                run = inOutline(p) ? 0 : run + 1;
                if (run) outside++;
                if (g.room[cellAt(g, p)] < 3) {
                  nearWall++;
                  routeNear++;
                }
                // Only the seams between buildings OSM draws a few meters apart are outside the real outlines.
                assert.ok(run * 2 <= 30, `${where}: walk runs outside the terminal's outline near ${p.map(Math.round)}`);
              }
            }
          }
        }
        // Down the middle: a long walk is mostly clear of the walls (narrow piers and connectors allowing).
        if (routeWalked * 2 > 150) assert.ok(routeNear / routeWalked < 0.7, `${where}: ${Math.round((100 * routeNear) / routeWalked)}% of the walk is along a wall`);
      }
    }
    assert.ok(outside / Math.max(walked, 1) < 0.02, `${((100 * outside) / walked).toFixed(1)}% of the walking is outside the real outlines`);
    assert.ok(nearWall / Math.max(walked, 1) < 0.1, `${((100 * nearWall) / walked).toFixed(1)}% of the walking is within 3 m of a wall`);
    assert.ok(ridesAtMarker <= Math.max(2, rides * 0.01), `${ridesAtMarker} of ${rides} rides start at the You marker or end on the pin`);
    // Once the map is prepared, a route is quick (no grid-wide search while the page renders).
    assert.ok(slowest < 150, `slowest route took ${Math.round(slowest)} ms`);
  });
}
