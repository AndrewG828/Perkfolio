/**
 * Builds public/data/airports.json for the flight distance tool from OurAirports' airports.csv (public domain,
 * https://ourairports.com/data/): every airport with scheduled passenger service and an IATA code, as compact rows
 * [code, name, city, country, lat, lon], largest airports first. City is OurAirports' municipality, trimmed to the city
 * itself ("Sydney (Mascot)" → "Sydney"). The browser fetches it only on the tools that need it.
 *
 *   npm run airports:build -- path/to/airports.csv   # build from a downloaded copy
 *   npm run airports:build                           # download the current file, then build
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { AIRPORT_FIELDS, type AirportRow, type AirportsFile } from "../src/shared/lib/airports";

const SOURCE_CSV = "https://davidmegginson.github.io/ourairports-data/airports.csv";
/** Heliports, seaplane bases and closed fields are left out, even when they have a code and scheduled service. */
const TYPES = ["large_airport", "medium_airport", "small_airport"];

/** RFC 4180 CSV: quoted fields, doubled quotes, commas and newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const round = (n: number) => Math.round(n * 1000) / 1000;

/** "Sydney (Mascot)" → "Sydney", "Honolulu, Oahu" → "Honolulu": the city people search for and expect to read. */
export const cityName = (municipality: string) =>
  municipality
    .replace(/\s*\([^)]*\)/g, "")
    .split(",")[0]
    .trim();

export function buildAirports(csv: string): AirportsFile {
  const [header, ...rows] = parseCsv(csv);
  const col = (name: string) => {
    const i = header.indexOf(name);
    if (i === -1) throw new Error(`airports.csv has no "${name}" column`);
    return i;
  };
  const c = {
    type: col("type"),
    name: col("name"),
    lat: col("latitude_deg"),
    lon: col("longitude_deg"),
    country: col("iso_country"),
    city: col("municipality"),
    scheduled: col("scheduled_service"),
    iata: col("iata_code"),
  };
  const best = new Map<string, { rank: number; row: AirportRow }>();
  for (const r of rows) {
    const code = (r[c.iata] ?? "").trim().toUpperCase();
    const rank = TYPES.indexOf(r[c.type]);
    const lat = Number(r[c.lat]);
    const lon = Number(r[c.lon]);
    if (r[c.scheduled] !== "yes" || !/^[A-Z]{3}$/.test(code) || rank === -1) continue;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const row: AirportRow = [code, r[c.name].trim(), cityName(r[c.city] ?? ""), r[c.country].trim(), round(lat), round(lon)];
    const seen = best.get(code);
    if (!seen || rank < seen.rank) best.set(code, { rank, row });
  }
  const airports = [...best.values()]
    .sort((a, b) => a.rank - b.rank || a.row[0].localeCompare(b.row[0]))
    .map((x) => x.row);
  return {
    source: "OurAirports",
    license: "Public domain",
    url: "https://ourairports.com/data/",
    fields: AIRPORT_FIELDS,
    airports,
  };
}

async function main() {
  const input = process.argv[2];
  let csv: string;
  if (input) {
    csv = readFileSync(input, "utf8");
  } else {
    console.log(`Downloading ${SOURCE_CSV}`);
    const res = await fetch(SOURCE_CSV, { headers: { "user-agent": "perkfolio-airports-builder/1.0" } });
    if (!res.ok) throw new Error(`Download failed: ${res.status}`);
    csv = await res.text();
  }
  const data = buildAirports(csv);
  const out = join(process.cwd(), "public", "data", "airports.json");
  mkdirSync(dirname(out), { recursive: true });
  const json = JSON.stringify(data);
  writeFileSync(out, json);
  console.log(`${data.airports.length} airports, ${(json.length / 1024).toFixed(0)} KB → ${out}`);
}

if (process.argv[1]?.endsWith("build-airports.ts")) void main();
