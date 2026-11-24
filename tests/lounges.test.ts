import { test } from "node:test";
import assert from "node:assert/strict";
import { getCard } from "../src/shared/data/cards";
import { airports, lounges } from "../src/shared/data/lounges";
import { airportGeo, osmEmbedUrl } from "../src/shared/data/airport-geo";
import { accessFor, accessibleCountByAirport, bigAirports, gateOf, terminalsAt } from "../src/shared/lib/lounge-access";
import type { Card } from "../src/shared/data/types";

const card = (id: string) => getCard(id) as Card;

test("every airport with lounges has map coordinates", () => {
  const missing = airports.filter((a) => lounges.some((l) => l.airportCode === a.code) && !airportGeo[a.code]);
  assert.deepEqual(missing.map((a) => a.code), []);
  assert.match(osmEmbedUrl("ATL") ?? "", /^https:\/\/www\.openstreetmap\.org\/export\/embed\.html\?bbox=/);
});

test("ATL concourses come out in physical order (T, A–F), not alphabetical", () => {
  assert.deepEqual(
    terminalsAt("ATL").map((g) => g.terminal),
    ["Concourse T", "Concourse A", "Concourse B", "Concourse C", "Concourse D", "Concourse E", "Concourse F"],
  );
});

test("gates are parsed from locations and lounges sort by gate", () => {
  const e = terminalsAt("ATL").find((g) => g.terminal === "Concourse E")!;
  assert.deepEqual(e.lounges.map(gateOf).slice(0, 2), ["E11", "E15"]);
  assert.equal(gateOf({ ...e.lounges[0], location: "Mezzanine level near gate 64" }), "64");
  assert.equal(gateOf({ ...e.lounges[0], location: "After security" }), null);
});

test("access follows the card's lounge networks", () => {
  const centurion = lounges.find((l) => l.id === "centurion-atl-e")!;
  assert.ok(accessFor(centurion, [card("amex-platinum")]).length > 0);
  assert.equal(accessFor(centurion, [card("capital-one-venture-x")]).length, 0);
  assert.deepEqual(accessibleCountByAirport([]), {});
});

test("big airports all have at least five lounges", () => {
  assert.ok(bigAirports.length >= 10);
  for (const a of bigAirports) assert.ok(lounges.filter((l) => l.airportCode === a.code).length >= 5, a.code);
});

test("closed lounges aren't counted, ranked or offered as the nearest, and say until when", async () => {
  const { isClosed, closedLabel, openToCards } = await import("../src/shared/lib/lounge-access");
  const plat = [card("amex-platinum")];
  const phl = lounges.find((l) => l.id === "centurion-phl-a")!;
  const aspire = lounges.find((l) => l.id === "pp-lhr-club-aspire-t3")!;
  // A closure is always explained in the lounge's notes.
  for (const l of lounges.filter((x) => x.closed)) assert.match(l.notes ?? "", /closed/i, l.id);
  assert.deepEqual(lounges.filter((l) => l.closed).map((l) => l.id).sort(), ["centurion-bom-t2", "centurion-phl-a", "pp-lhr-club-aspire-t3"]);
  assert.ok(isClosed(phl) && isClosed(phl, "2026-11-24"));
  assert.ok(!isClosed(phl, "2026-10-15"), "not before it closes");
  assert.ok(!isClosed(phl, "2028-01-01"), "the expected reopening ends it");
  assert.equal(closedLabel(phl), "Closed until end of 2027 (expected)");
  assert.equal(closedLabel(aspire), "Closed until Apr 16, 2027 (reported)");
  assert.ok(accessFor(phl, plat).length > 0, "the card still opens it once it reopens");
  assert.ok(!openToCards(phl, plat, "2026-11-24"));
  const before = accessibleCountByAirport(plat, "2026-10-01").PHL;
  assert.equal(accessibleCountByAirport(plat, "2026-11-24").PHL, before - 1);
});

test("a lounge's own rules can turn a card away (Arlanda admits only the consumer Platinum)", async () => {
  const { refusedAt } = await import("../src/shared/lib/lounge-access");
  const arn = lounges.find((l) => l.id === "amex-arn-t5")!;
  assert.equal(accessFor(arn, [card("amex-business-platinum")]).length, 0);
  assert.equal(accessibleCountByAirport([card("amex-business-platinum")]).ARN, undefined);
  assert.ok(accessFor(arn, [card("amex-platinum")]).length > 0);
  const refused = refusedAt(arn, [card("amex-business-platinum"), card("amex-platinum")]);
  assert.deepEqual(refused.map((r) => r.card.id), ["amex-business-platinum"]);
  assert.match(refused[0].reason, /admits only Consumer Platinum cards/);
  // Card access to Plaza Premium First isn't confirmed by any card's terms.
  const first = lounges.find((l) => l.id === "plaza-premium-first-dfw-d")!;
  assert.equal(accessFor(first, [card("amex-platinum")]).length, 0);
});

test("only pre-built maps are fetched, and the list matches the folder", async () => {
  const { readdirSync } = await import("node:fs");
  const { PREBUILT_AIRPORT_MAPS } = await import("../src/shared/data/airport-map-files");
  const files = readdirSync("public/airport-maps").filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, ""));
  assert.deepEqual([...PREBUILT_AIRPORT_MAPS].sort(), files.sort());
});
