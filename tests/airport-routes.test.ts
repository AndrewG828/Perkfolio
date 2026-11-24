import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { airportNav } from "../src/shared/data/airport-nav";
import { loungesAt } from "../src/shared/lib/lounge-access";
import { linkKey, parseGate, routeTo, zonesForGate, type Origin, type ParsedGate } from "../src/shared/lib/wayfinding";
import { cellAt, isWalkable, rasterize, terminalRings, walkGrid, type Pt } from "../src/shared/lib/walkable";
import { loungePoint, routeGeometry, zoneAt, zoneMarkers, type AirportMapData } from "../src/shared/lib/airport-map";

/**
 * Every pre-built airport map with wayfinding data, from security, from each zone and from every gate OSM has
 * (each gate to a few lounges, so it stays quick): the start is in the zone you said, walks stay inside the
 * buildings (and, but for the seams between buildings drawn apart, inside their real outlines) as clean polylines,
 * and a connector (a walkway the map doesn't draw, like ORD's B–C tunnel) only joins zones that have a walkway
 * between them, always in the same place.
 */

const dir = join(__dirname, "..", "public", "airport-maps");
/** Longest allowed connector: LAX's Midfield Satellite tunnel to Tom Bradley is about 280 m on the map. */
const MAX_CONNECTOR = 300;

const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
/** Points every ~2 m along a segment. */
const along = (a: Pt, b: Pt) => {
  const n = Math.max(1, Math.ceil(dist(a, b) / 2));
  return Array.from({ length: n + 1 }, (_, i) => [a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n] as Pt);
};

/**
 * How far a walk that starts at `from` heads back along the line from `from` toward `toward` (within 20° of it and
 * 12 m of the line): a walk retracing the ride that just brought you.
 */
function backtrack(walk: Pt[], from: Pt, toward: Pt): number {
  const len = dist(from, toward);
  const [ux, uy] = [(toward[0] - from[0]) / len, (toward[1] - from[1]) / len];
  let done = 0;
  for (let i = 1; i < walk.length; i++) {
    const [a, b] = [walk[i - 1], walk[i]];
    const seg = dist(a, b);
    if (seg < 0.5) continue;
    const along = ((b[0] - a[0]) * ux + (b[1] - a[1]) * uy) / seg;
    const off = Math.abs((b[0] - from[0]) * uy - (b[1] - from[1]) * ux);
    if (along < Math.cos((20 * Math.PI) / 180) || off > 12) break;
    done += seg;
  }
  return done;
}

const maps = readdirSync(dir)
  .map((f) => f.replace(/\.json$/, ""))
  .filter((code) => airportNav[code]);

test("there are pre-built maps to check", () => assert.ok(maps.length >= 10));

for (const code of maps) {
  test(`${code}: routes start where you are and stay inside the terminals`, () => {
    const data: AirportMapData = JSON.parse(readFileSync(join(dir, `${code}.json`), "utf8"));
    const nav = airportNav[code];
    const g = walkGrid(data);
    assert.ok(g, "map has terminal outlines");
    // The real outlines (the walkable grid is a cell wider all round).
    const inside = new Uint8Array(g.cols * g.rows);
    for (const rs of terminalRings(data)) rasterize(g, rs, inside, 1);
    const inOutline = (p: Pt) => inside[cellAt(g, p)] === 1;

    const lounges = loungesAt(code);
    for (const l of lounges) {
      const p = loungePoint(data, nav, l);
      assert.ok(p && isWalkable(g, p), `${l.id} has no pin inside the buildings (${p})`);
    }
    for (const m of zoneMarkers(data, nav)) assert.ok(isWalkable(g, m.p), `${m.zone.id} middle at ${m.p} is outside`);

    const origins: { origin: Origin; name: string; to: typeof lounges }[] = [{ origin: { kind: "landside" }, name: "security", to: lounges }];
    let turn = 0;
    for (const z of nav.zones) {
      origins.push({ origin: { kind: "gate", zone: z.id }, name: `@${z.id}`, to: lounges });
      const gates = new Map<string, ParsedGate>();
      for (const gt of data.gates) {
        const m = /^([A-Z]{0,2})-?(\d{1,3})/.exec(gt.ref);
        const p = m ? parseGate(`${m[1]}${m[2]}`) : null;
        if (p && zonesForGate(nav, p).some((x) => x.id === z.id)) gates.set(p.label, p);
      }
      for (const gate of gates.values()) {
        // A few lounges per gate, a different few each time, so between them the gates reach every lounge.
        const to = lounges.length <= 3 ? lounges : [0, 1, 2].map((k) => lounges[(turn + k * Math.ceil(lounges.length / 3)) % lounges.length]);
        turn++;
        origins.push({ origin: { kind: "gate", zone: z.id, gate }, name: `gate ${gate.label}`, to });
      }
    }

    const walkLinks = new Set(nav.links.filter((l) => l.mode === "walk").map((l) => linkKey(l.a, l.b)));
    const crossings = new Map<string, string>();
    let [walked, outside] = [0, 0];
    for (const { origin, name, to } of origins) {
      for (const l of to) {
        const route = routeTo(nav, origin, l);
        if (!route) continue;
        const geo = routeGeometry(data, nav, origin, route, l);
        const where = `${name} → ${l.id}`;
        for (const p of [geo.start, geo.end]) assert.ok(p && isWalkable(g, p), `${where}: end point ${p} is outside`);
        // The start is in the zone you said (at your gate, or its middle when the gate isn't on the map).
        if (origin.kind === "gate") assert.equal(zoneAt(data, nav, geo.start!), origin.zone, `${where}: starts in ${zoneAt(data, nav, geo.start!)} at ${geo.start}`);
        geo.segments.forEach((s, i) => {
          // A train doesn't run past the lounge for the walk to come back along its line.
          const next = geo.segments[i + 1];
          if (s.mode === "train" && next?.mode === "walk") {
            const back = backtrack(next.pts, s.pts[s.pts.length - 1], s.pts[s.pts.length - 2]);
            assert.ok(back < 25, `${where}: the walk doubles back ${Math.round(back)} m along the train line`);
          }
        });
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
                run = inOutline(p) ? 0 : run + 1;
                if (run) outside++;
                // Only the seams between buildings OSM draws a few meters apart are outside the real outlines.
                assert.ok(run * 2 <= 30, `${where}: walk runs outside the terminal's outline near ${p.map(Math.round)}`);
              }
            }
          }
        }
      }
    }
    assert.ok(outside / Math.max(walked, 1) < 0.02, `${((100 * outside) / walked).toFixed(1)}% of the walking is outside the real outlines`);
  });
}
