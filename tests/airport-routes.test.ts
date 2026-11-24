import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { airportNav } from "../src/shared/data/airport-nav";
import { loungesAt } from "../src/shared/lib/lounge-access";
import { parseGate, routeTo, zonesForGate, type Origin } from "../src/shared/lib/wayfinding";
import { isWalkable, walkGrid, type Pt } from "../src/shared/lib/walkable";
import { loungePoint, routeGeometry, zoneMarkers, type AirportMapData } from "../src/shared/lib/airport-map";

/**
 * Every pre-built airport map with wayfinding data: routes from the first and last gate of each zone (and from
 * security) to every lounge there must walk inside the buildings, and every pin and point must be inside.
 * Connectors (walks between buildings the map doesn't join, like ORD's B–C tunnel) are allowed but short.
 */

const dir = join(__dirname, "..", "public", "airport-maps");
/** Longest allowed connector: LAX's Midfield Satellite tunnel to Tom Bradley is about 280 m on the map. */
const MAX_CONNECTOR = 300;

/** Points every ~2 m along a segment. */
const along = (a: Pt, b: Pt) => {
  const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 2));
  return Array.from({ length: n + 1 }, (_, i) => [a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n] as Pt);
};

const maps = readdirSync(dir)
  .map((f) => f.replace(/\.json$/, ""))
  .filter((code) => airportNav[code]);

test("there are pre-built maps to check", () => assert.ok(maps.length >= 10));

for (const code of maps) {
  test(`${code}: routes stay inside the terminals`, () => {
    const data: AirportMapData = JSON.parse(readFileSync(join(dir, `${code}.json`), "utf8"));
    const nav = airportNav[code];
    const g = walkGrid(data);
    assert.ok(g, "map has terminal outlines");
    const lounges = loungesAt(code);
    for (const l of lounges) {
      const p = loungePoint(data, nav, l);
      assert.ok(!p || isWalkable(g, p), `${l.id} pin at ${p} is outside`);
    }
    for (const m of zoneMarkers(data, nav)) assert.ok(isWalkable(g, m.p), `${m.zone.id} middle at ${m.p} is outside`);

    const origins: { origin: Origin; name: string }[] = [{ origin: { kind: "landside" }, name: "security" }];
    for (const z of nav.zones) {
      const gates = data.gates
        .map((gt) => /^([A-Z]{0,2})-?(\d{1,3})/.exec(gt.ref))
        .map((m) => (m ? parseGate(`${m[1]}${m[2]}`) : null))
        .filter((p): p is NonNullable<typeof p> => p !== null && zonesForGate(nav, p).some((x) => x.id === z.id))
        .sort((a, b) => a.prefix.localeCompare(b.prefix) || a.number - b.number);
      if (!gates.length) origins.push({ origin: { kind: "gate", zone: z.id }, name: `@${z.id}` });
      for (const gate of gates.length ? [gates[0], gates[gates.length - 1]] : [])
        origins.push({ origin: { kind: "gate", zone: z.id, gate }, name: `gate ${gate.label}` });
    }

    for (const { origin, name } of origins) {
      for (const l of lounges) {
        const route = routeTo(nav, origin, l);
        if (!route) continue;
        const geo = routeGeometry(data, nav, origin, route, l);
        const where = `${name} → ${l.id}`;
        for (const p of [geo.start, geo.end]) assert.ok(p && isWalkable(g, p), `${where}: end point ${p} is outside`);
        for (const s of geo.segments) {
          if (s.mode === "connector") {
            const len = Math.hypot(s.pts[1][0] - s.pts[0][0], s.pts[1][1] - s.pts[0][1]);
            assert.ok(len <= MAX_CONNECTOR, `${where}: ${Math.round(len)} m connector`);
          } else if (s.mode === "walk") {
            for (let i = 1; i < s.pts.length; i++) {
              const out = along(s.pts[i - 1], s.pts[i]).find((p) => !isWalkable(g, p));
              assert.ok(!out, `${where}: walk leaves the buildings at ${out?.map(Math.round)}`);
            }
          }
        }
      }
    }
  });
}
