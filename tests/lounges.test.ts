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
