import { test } from "node:test";
import assert from "node:assert/strict";
import { airportNav } from "../src/shared/data/airport-nav";
import { bigAirports, loungesAt } from "../src/shared/lib/lounge-access";
import { parseGate, rankByDistance, resolveOrigin, routeTo, zoneForLounge, zonesForGate } from "../src/shared/lib/wayfinding";

const lounge = (code: string, id: string) => loungesAt(code).find((l) => l.id === id)!;

test("every big airport has wayfinding data, and every lounge there is placed in a zone", () => {
  for (const a of bigAirports) {
    const nav = airportNav[a.code];
    assert.ok(nav, `${a.code} has no wayfinding data`);
    for (const l of loungesAt(a.code)) assert.ok(zoneForLounge(nav, l), `${l.id} isn't in any ${a.code} zone`);
    const ids = new Set(nav.zones.map((z) => z.id));
    for (const link of nav.links) assert.ok(ids.has(link.a) && ids.has(link.b), `${a.code} link ${link.a}-${link.b}`);
  }
});

test("gates parse and map to zones", () => {
  assert.deepEqual(parseGate(" b18 "), { prefix: "B", number: 18, label: "B18" });
  assert.equal(parseGate("lounge"), null);
  assert.deepEqual(zonesForGate(airportNav.LAX, parseGate("64")!).map((z) => z.id), ["6"]);
  assert.deepEqual(zonesForGate(airportNav.PHL, parseGate("A14")!).map((z) => z.id), ["AW"]);
  const jfk = resolveOrigin(airportNav.JFK, "5");
  assert.ok(!jfk.ok && jfk.reason === "ambiguous");
  assert.ok(resolveOrigin(airportNav.JFK, "@8:5").ok);
});

test("ATL: one Plane Train ride with stops merged", () => {
  const r = routeTo(airportNav.ATL, { kind: "gate", zone: "A", gate: parseGate("A10")! }, lounge("ATL", "centurion-atl-e"))!;
  assert.equal(r.reclearsSecurity, false);
  assert.ok(r.steps.some((s) => s.text === "Take the Plane Train 4 stops to Concourse E"));
  assert.deepEqual(r.zones, ["A", "B", "C", "D", "E"]);
});

test("same-concourse walk is short and uses gate distance", () => {
  const r = routeTo(airportNav.ATL, { kind: "gate", zone: "E", gate: parseGate("E14")! }, lounge("ATL", "centurion-atl-e"))!;
  assert.equal(r.steps.length, 1);
  assert.ok(r.minutes <= 3);
});

test("JFK terminals that aren't connected airside go through AirTrain and security", () => {
  const r = routeTo(airportNav.JFK, { kind: "gate", zone: "8" }, lounge("JFK", "centurion-jfk-t4"))!;
  assert.equal(r.reclearsSecurity, true);
  assert.ok(r.steps.some((s) => s.kind === "security"));
  assert.ok(r.steps.some((s) => s.kind === "landside" && /Terminal 4/.test(s.text)));
});

test("routes avoid cautioned links when there's a clean alternative, and ranking puts airside first", () => {
  const r = routeTo(airportNav.ORD, { kind: "gate", zone: "B" }, lounge("ORD", "admirals-club-ord-g"))!;
  assert.ok(r.steps.every((s) => !s.caution));
  const ranked = rankByDistance(airportNav.JFK, { kind: "gate", zone: "4B" }, loungesAt("JFK"));
  assert.equal(ranked[0].route.reclearsSecurity, false);
});

test("Heathrow: no lounges behind another terminal's security once we know your terminal, and gates ask which terminal", async () => {
  const { terminalsSeparate } = await import("../src/shared/lib/wayfinding");
  const lhr = airportNav.LHR;
  const ranked = rankByDistance(lhr, { kind: "gate", zone: "5" }, loungesAt("LHR"));
  assert.ok(ranked.length > 0);
  assert.ok(ranked.every((r) => !r.route.reclearsSecurity && zoneForLounge(lhr, r.lounge)?.id === "5"));
  // JFK still offers other terminals, through security again.
  assert.ok(rankByDistance(airportNav.JFK, { kind: "gate", zone: "8" }, loungesAt("JFK")).some((r) => r.route.reclearsSecurity));
  const a10 = resolveOrigin(lhr, "A10");
  assert.ok(!a10.ok && a10.reason === "terminal" && a10.gate?.label === "A10");
  assert.ok(resolveOrigin(lhr, "@5:A10").ok);
  assert.ok(terminalsSeparate(airportNav.JFK) && terminalsSeparate(lhr));
  assert.ok(!terminalsSeparate(airportNav.ATL) && !terminalsSeparate(airportNav.DFW));
});

test("before a gate is given, no lounge is 'nearest' where each is timed from its own checkpoint", async () => {
  const { nearestNeedsOrigin, terminalsSeparate } = await import("../src/shared/lib/wayfinding");
  for (const [code, nav] of Object.entries(airportNav)) {
    const checkpoints = nav.zones.filter((z) => z.checkpoint).length;
    assert.equal(nearestNeedsOrigin(nav), checkpoints > 1, code);
    // Every airport whose terminals aren't connected has several checkpoints, so it's covered too.
    if (terminalsSeparate(nav)) assert.ok(nearestNeedsOrigin(nav), code);
  }
  // DFW: from before security, the first lounges tie (each from its own terminal's checkpoint).
  const dfw = rankByDistance(airportNav.DFW, { kind: "landside" }, loungesAt("DFW"));
  assert.ok(dfw.length > 1 && dfw[0].route.minutes === dfw[1].route.minutes, "tied, so the first isn't nearest");
  // One checkpoint: the order from security means something.
  assert.ok(!nearestNeedsOrigin(airportNav.DEN));
});

test("the last step keeps names and codes capitalized", async () => {
  const { inSentence } = await import("../src/shared/lib/wayfinding");
  assert.equal(inSentence("Near gate B18"), "near gate B18");
  assert.equal(inSentence("Across from gate B22"), "across from gate B22");
  for (const kept of ["A/B connector", "D/E connector, just past security", "S1 concourse", "Concourse F", "Concourse D atrium, 2nd level", "Lounge F, one level up"]) {
    assert.equal(inSentence(kept), kept);
  }
});
