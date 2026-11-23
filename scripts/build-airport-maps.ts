/**
 * Builds the indoor-style airport maps in public/airport-maps/<CODE>.json from OpenStreetMap data:
 * terminal outlines, runways, and gate positions (with each gate's terminal building), projected to meters.
 *
 *   npm run maps:build                 # fetch from Overpass (public mirrors, with retries) and build
 *   npm run maps:build -- <raw-dir>    # build from Overpass JSON already saved as <raw-dir>/<CODE>.json
 *
 * Map data © OpenStreetMap contributors, ODbL. The app credits it under each map.
 */
import { mkdirSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { airportNav } from "../src/shared/data/airport-nav";
import { build, overpassQuery as query, type OsmElement } from "../src/shared/lib/osm-airport";

export { build };

const MIRRORS = ["https://overpass.private.coffee/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://overpass-api.de/api/interpreter"];


async function fetchRaw(code: string): Promise<{ elements: OsmElement[] }> {
  for (let attempt = 0; attempt < 9; attempt++) {
    const url = MIRRORS[attempt % MIRRORS.length];
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "perkfolio-map-builder/1.0" },
        body: new URLSearchParams({ data: query(code) }),
        signal: AbortSignal.timeout(200_000),
      });
      if (res.ok) return (await res.json()) as { elements: OsmElement[] };
      console.warn(code, url, res.status);
    } catch (err) {
      console.warn(code, url, (err as Error).message);
    }
    await new Promise((r) => setTimeout(r, 30_000));
  }
  throw new Error(`Couldn't fetch ${code} from any Overpass mirror`);
}

async function main() {
  const rawDir = process.argv[2];
  const outDir = join(process.cwd(), "public", "airport-maps");
  mkdirSync(outDir, { recursive: true });
  for (const code of Object.keys(airportNav)) {
    const file = rawDir ? join(rawDir, `${code}.json`) : null;
    if (file && !existsSync(file)) {
      console.warn(`${code}: no raw data, skipped`);
      continue;
    }
    const raw = file ? JSON.parse(readFileSync(file, "utf8")) : await fetchRaw(code);
    const data = build(code, raw);
    writeFileSync(join(outDir, `${code}.json`), JSON.stringify(data));
    console.log(`${code}: ${data.terminals.length} terminal shapes, ${data.gates.length} gates, ${data.runways.length} runways`);
  }
}

if (process.argv[1]?.endsWith("build-airport-maps.ts")) void main();
