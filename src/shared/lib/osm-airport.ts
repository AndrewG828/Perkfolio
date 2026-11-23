import { airportGeo } from "@/shared/data/airport-geo";
import type { AirportMapData } from "./airport-map";

/**
 * Turns OpenStreetMap (Overpass) data for an airport into the compact map in AirportMapData: terminal outlines,
 * runways and gates (with the terminal each gate is in), projected to meters. Used by scripts/build-airport-maps.ts
 * to pre-build public/airport-maps/*.json, and by the browser as a fallback when a pre-built file is missing.
 * Map data © OpenStreetMap contributors, ODbL.
 */

type LatLon = { lat: number; lon: number };
export interface OsmElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  tags?: Record<string, string>;
  geometry?: LatLon[];
  members?: { type: string; role: string; geometry?: LatLon[] }[];
}

/** Overpass QL for an airport's terminals, gates and runways (a box around the airport's reference point). */
export function overpassQuery(code: string): string {
  const g = airportGeo[code];
  const dLat = (g.span ?? 0.02) * 1.6;
  const dLon = dLat * 1.9;
  const b = [g.lat - dLat, g.lon - dLon, g.lat + dLat, g.lon + dLon].map((n) => n.toFixed(4)).join(",");
  return `[out:json][timeout:170];(way["aeroway"="terminal"](${b});relation["aeroway"="terminal"](${b});way["building"="terminal"](${b});node["aeroway"="gate"](${b});way["aeroway"="runway"](${b}););out geom;`;
}

/** Douglas–Peucker in meters. */
function simplify(pts: [number, number][], tol: number): [number, number][] {
  if (pts.length < 3) return pts;
  const [a, b] = [pts[0], pts[pts.length - 1]];
  let maxD = 0;
  let idx = 0;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + b[0] * a[1] - b[1] * a[0]) / len;
    if (d > maxD) [maxD, idx] = [d, i];
  }
  if (maxD <= tol) return [a, b];
  return [...simplify(pts.slice(0, idx + 1), tol).slice(0, -1), ...simplify(pts.slice(idx), tol)];
}

/** Simplifies a closed ring by splitting it at the point farthest from the start (DP needs distinct ends). */
function simplifyRing(pts: [number, number][], tol: number): [number, number][] {
  const closed = pts.length > 3 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1];
  if (!closed) return simplify(pts, tol);
  let far = 1;
  for (let i = 1; i < pts.length - 1; i++)
    if (Math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]) > Math.hypot(pts[far][0] - pts[0][0], pts[far][1] - pts[0][1])) far = i;
  return [...simplify(pts.slice(0, far + 1), tol).slice(0, -1), ...simplify(pts.slice(far), tol)];
}

function inside([x, y]: [number, number], ring: [number, number][]) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

const normRef = (ref: string) => ref.toUpperCase().replace(/^GATE\s*/, "").replace(/[\s-]+/g, "");

export function build(code: string, raw: { elements: OsmElement[] }): AirportMapData {
  const g = airportGeo[code];
  const k = Math.cos((g.lat * Math.PI) / 180);
  const proj = (p: LatLon): [number, number] => [Math.round((p.lon - g.lon) * 111_320 * k), Math.round(-(p.lat - g.lat) * 110_540)];
  const seen = new Set<string>();
  const terminals: AirportMapData["terminals"] = [];
  const runways: AirportMapData["runways"] = [];
  const gates: AirportMapData["gates"] = [];

  for (const e of raw.elements) {
    const key = `${e.type}${e.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const t = e.tags ?? {};
    if (t.aeroway === "runway" && e.geometry) {
      runways.push(e.geometry.map(proj));
    } else if ((t.aeroway === "terminal" || t.building === "terminal") && (e.geometry || e.members)) {
      const lines = e.geometry ? [e.geometry] : (e.members ?? []).filter((m) => m.role !== "inner" && m.geometry).map((m) => m.geometry!);
      const rings = lines.map((l) => simplifyRing(l.map(proj), 1.5)).filter((r) => r.length >= 3);
      if (rings.length) terminals.push({ name: t.name ?? t.ref ?? null, rings });
    } else if (t.aeroway === "gate" && e.lat !== undefined && t.ref) {
      const [x, y] = proj({ lat: e.lat, lon: e.lon! });
      gates.push({ ref: normRef(t.ref), x, y, t: null });
    }
  }
  // Which named terminal building each gate is in (or nearest to), to tell apart same-numbered gates (JFK 1 vs 8).
  const named = terminals.filter((tm) => tm.name);
  for (const gate of gates) {
    const hit = named.find((tm) => tm.rings.some((r) => inside([gate.x, gate.y], r)));
    if (hit) gate.t = hit.name;
    else {
      let best: { d: number; name: string | null } = { d: 120, name: null };
      for (const tm of named)
        for (const r of tm.rings)
          for (const [x, y] of r) {
            const d = Math.hypot(x - gate.x, y - gate.y);
            if (d < best.d) best = { d, name: tm.name };
          }
      gate.t = best.name;
    }
  }
  return { code, origin: [g.lat, g.lon], terminals, runways, gates, attribution: "© OpenStreetMap contributors (ODbL)" };
}

