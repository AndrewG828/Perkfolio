import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { cards, getCard } from "../src/shared/data/cards";
import { loungeNetworks } from "../src/shared/data/networks";
import type { LoungeNetwork } from "../src/shared/data/types";
import {
  EARTH_RADIUS_KM,
  flightMinutes,
  formatDuration,
  greatCirclePoints,
  haversineKm,
  kmToMiles,
  kmToNm,
  linePath,
  unwrapLongitudes,
  viewForRoute,
  wrapLongitude,
} from "../src/shared/lib/geo";
import { decodeAirports, parseRoute, searchAirports, summarizeRoute, type AirportsFile } from "../src/shared/lib/airports";
import { buildAirports, parseCsv } from "../scripts/build-airports";
import { chainCards, programId, programName, stayPoints, taxesEarnPoints, walletCard } from "../src/shared/lib/hotel-points";
import { cardsWithRules, effectLabel, guestCosts, optionFor, parseEffect, unlockKey, visitsLabel } from "../src/shared/lib/guest-cost";
import { regionFor, SWEET_SPOT_REGIONS, sweetSpotsHref } from "../src/shared/data/travel/regions";
import { activeQuestions, answersFrom, feeCheck, nextQuestion, START_FLOWS, suggestCards } from "../src/shared/lib/start-flows";
import { formatIsoDate, feeText } from "../src/shared/lib/travel-format";
import { baggage } from "../src/shared/data/travel/baggage";
import { entryRequirements } from "../src/shared/data/travel/entry-requirements";
import { hotelEarning } from "../src/shared/data/travel/hotel-earning";
import { valuations } from "../src/shared/data/travel/valuations";
import { loungeGuestRules } from "../src/shared/data/travel/lounge-guest-rules";
import { seedData } from "../src/shared/data/travel/seed-status";
import { ENTRY_REQUIREMENTS, type HotelChain, type LoungeGuestRulesData } from "../src/shared/data/travel/types";

const AIRPORTS_JSON = join(process.cwd(), "public", "data", "airports.json");
const airportsFile = JSON.parse(readFileSync(AIRPORTS_JSON, "utf8")) as AirportsFile;
const world = decodeAirports(airportsFile);
const at = (code: string) => {
  const a = world.find((x) => x.code === code);
  assert.ok(a, `${code} in airports.json`);
  return a;
};
const near = (actual: number, expected: number, tolerance: number, what: string) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${what}: ${actual.toFixed(1)} not within ${tolerance} of ${expected}`);

// --- Distance ----------------------------------------------------------------------------------------------------

test("haversine matches known great-circle distances", () => {
  near(haversineKm(at("JFK"), at("LHR")), 5540, 15, "JFK–LHR km");
  near(haversineKm(at("LHR"), at("SIN")), 10885, 25, "LHR–SIN km");
  near(haversineKm(at("LAX"), at("SYD")), 12060, 30, "LAX–SYD km");
  // Exact on the sphere: a quarter of the equator, and one degree of latitude.
  near(haversineKm({ lat: 0, lon: 0 }, { lat: 0, lon: 90 }), (Math.PI / 2) * EARTH_RADIUS_KM, 1e-6, "quarter equator");
  near(haversineKm({ lat: 10, lon: 20 }, { lat: 11, lon: 20 }), 111.195, 0.001, "one degree of latitude");
  assert.equal(haversineKm(at("JFK"), at("JFK")), 0);
  near(haversineKm(at("JFK"), at("LHR")), haversineKm(at("LHR"), at("JFK")), 1e-9, "symmetry");
  // Across the date line, the short way round.
  near(haversineKm({ lat: 0, lon: 179 }, { lat: 0, lon: -179 }), 222.39, 0.01, "date line");
});

test("unit conversions use the stated factors", () => {
  assert.equal(kmToMiles(1000), 621.371);
  assert.equal(kmToNm(1000), 539.957);
  near(kmToMiles(haversineKm(at("JFK"), at("LHR"))), 3442, 10, "JFK–LHR miles");
});

test("flight time is 30 minutes plus an hour per 530 miles", () => {
  assert.equal(flightMinutes(0), 30);
  assert.equal(flightMinutes(530), 90);
  assert.equal(flightMinutes(1060), 150);
  assert.equal(formatDuration(90), "1h 30m");
  assert.equal(formatDuration(42), "40m");
  assert.equal(formatDuration(418), "7h 00m");
  // JFK–LHR: 3,442 mi → 30 + 389.7 min ≈ 7h 00m.
  assert.equal(formatDuration(flightMinutes(kmToMiles(haversineKm(at("JFK"), at("LHR"))))), "7h 00m");
});

test("routes parse from the URL and add up leg by leg", () => {
  assert.deepEqual(parseRoute("jfk-lhr-sin"), ["JFK", "LHR", "SIN"]);
  assert.deepEqual(parseRoute("JFK, LHR → SIN"), ["JFK", "LHR", "SIN"]);
  assert.deepEqual(parseRoute("JFK-LHR-DXB-SIN-SYD-AKL"), ["JFK", "LHR", "DXB", "SIN", "SYD"]);
  assert.deepEqual(parseRoute("JFK-12-xx-LHRX-lhr"), ["JFK", "LHR"]);
  assert.deepEqual(parseRoute(null), []);

  const s = summarizeRoute(["JFK", "LHR", "SIN"].map(at));
  assert.equal(s.legs.length, 2);
  near(s.km, s.legs[0].km + s.legs[1].km, 1e-9, "total is the sum of legs");
  near(s.nonstop!.km, haversineKm(at("JFK"), at("SIN")), 1e-9, "nonstop");
  near(s.extra!.km, s.km - s.nonstop!.km, 1e-9, "extra");
  assert.ok(s.extra!.percent > 5 && s.extra!.percent < 9, `JFK–LHR–SIN is about 7% longer (${s.extra!.percent})`);
  near(s.minutes, s.legs[0].minutes + s.legs[1].minutes, 1e-9, "times add up");

  const roundTrip = summarizeRoute(["JFK", "LHR", "JFK"].map(at));
  assert.equal(roundTrip.nonstop, null);
  assert.equal(roundTrip.extra, null);
  assert.equal(summarizeRoute(["JFK", "LHR"].map(at)).extra, null);
});

test("great-circle arcs bulge poleward and stay continuous across the date line", () => {
  const arc = greatCirclePoints(at("JFK"), at("LHR"), 32);
  assert.equal(arc.length, 33);
  near(arc[0].lat, at("JFK").lat, 1e-9, "starts at JFK");
  near(arc[32].lon, at("LHR").lon, 1e-9, "ends at LHR");
  assert.ok(Math.max(...arc.map((p) => p.lat)) > 51.5, "the arc goes north of both ends");

  assert.deepEqual(unwrapLongitudes([170, -175, -160]), [170, 185, 200]);
  assert.equal(wrapLongitude(190, 0), -170);
  assert.equal(wrapLongitude(-170, 180), 190);

  const pacific = greatCirclePoints(at("LAX"), at("SYD"), 64);
  const lons = unwrapLongitudes(pacific.map((p) => p.lon));
  const view = viewForRoute(pacific, 2);
  assert.ok(view.lon0 < -150 || view.lon0 > 150, `LAX–SYD view centers on the Pacific (${view.lon0})`);
  const xs = [...linePath(view, pacific.map((p) => p.lat), lons).matchAll(/[ML](-?[\d.]+) /g)].map((m) => Number(m[1]));
  assert.ok(xs.every((x, i) => i === 0 || Math.abs(x - xs[i - 1]) < 10), "no jump at the date line");
  assert.ok(xs.every((x) => x >= view.x - 1 && x <= view.x + view.width + 1), "the arc fits the view");
});

// --- Airports dataset ----------------------------------------------------------------------------------------------

test("airports.json is compact, unique and credited to OurAirports", () => {
  assert.ok(statSync(AIRPORTS_JSON).size < 350 * 1024, "under ~350 KB");
  assert.ok(world.length > 3500, `${world.length} airports`);
  assert.equal(new Set(world.map((a) => a.code)).size, world.length, "unique codes");
  assert.equal(airportsFile.source, "OurAirports");
  assert.match(airportsFile.license, /public domain/i);
  for (const a of world) {
    assert.match(a.code, /^[A-Z]{3}$/);
    assert.match(a.country, /^[A-Z]{2}$/, a.code);
    assert.ok(Math.abs(a.lat) <= 90 && Math.abs(a.lon) <= 180, a.code);
  }
  near(at("SIN").lat, 1.35, 0.01, "SIN latitude");
  near(at("JFK").lon, -73.78, 0.01, "JFK longitude");
});

test("airport search ranks codes, cities and names sensibly", () => {
  assert.equal(searchAirports(world, "jfk")[0].code, "JFK");
  assert.equal(searchAirports(world, "london")[0].code, "LHR");
  assert.ok(searchAirports(world, "sao paulo").some((a) => a.code === "GRU"), "accents folded");
  assert.equal(searchAirports(world, "heathrow")[0].code, "LHR");
  assert.deepEqual(searchAirports(world, "new york", 2).map((a) => a.code), ["JFK", "LGA"]);
  assert.deepEqual(searchAirports(world, "   "), []);
});

test("the CSV builder keeps scheduled airports with IATA codes only", () => {
  assert.deepEqual(parseCsv('a,"b, ""c""",d\n1,2,3'), [
    ["a", 'b, "c"', "d"],
    ["1", "2", "3"],
  ]);
  const header = "id,ident,type,name,latitude_deg,longitude_deg,iso_country,municipality,scheduled_service,iata_code";
  const csv = [
    header,
    '1,KJFK,large_airport,"John F. Kennedy International Airport",40.639447,-73.779317,US,"New York",yes,JFK',
    "2,X1,heliport,Some Heliport,40,-73,US,Somewhere,yes,XHP",
    "3,X2,small_airport,No Service Field,41,-74,US,Elsewhere,no,NSF",
    "4,X3,medium_airport,No Code Field,42,-75,US,Elsewhere,yes,",
    "5,EGLL,large_airport,London Heathrow Airport,51.470748,-0.459909,GB,London,yes,LHR",
  ].join("\n");
  const built = buildAirports(csv);
  assert.deepEqual(
    built.airports.map((r) => r[0]),
    ["JFK", "LHR"],
  );
  assert.deepEqual(built.airports[0], ["JFK", "John F. Kennedy International Airport", "New York", "US", 40.639, -73.779]);
});

test("destinations map to sweet-spot regions", () => {
  assert.equal(regionFor("GB"), "Europe");
  assert.equal(regionFor("jp"), "Japan");
  assert.equal(regionFor("US", at("HNL").lat, at("HNL").lon), "Hawaii");
  assert.equal(regionFor("US", at("JFK").lat, at("JFK").lon), "United States");
  assert.equal(regionFor("AQ"), null);
  assert.equal(sweetSpotsHref("Mexico & Central America"), "/points/sweet-spots?region=Mexico+%26+Central+America");
  // Every country in the airport list has a region, except Central Asia (no sweet-spot region covers it).
  const unmapped = new Set(world.filter((a) => !regionFor(a.country, a.lat, a.lon)).map((a) => a.country));
  assert.deepEqual([...unmapped].sort(), ["KG", "KZ", "TJ", "TM", "UZ"].filter((c) => unmapped.has(c)));
  assert.equal(SWEET_SPOT_REGIONS.length, 16);
});

// --- Hotel points --------------------------------------------------------------------------------------------------

const marriott = hotelEarning.chains.find((c) => c.program === "Marriott Bonvoy")!;
const hilton = hotelEarning.chains.find((c) => c.program === "Hilton Honors")!;
const V = valuations.valuations;

test("hotel points: base rate on the room rate, elite bonus on base, card points on the total", () => {
  const brilliant = chainCards(marriott, getCard).find((c) => c.cardId === "amex-marriott-brilliant")!;
  const r = stayPoints({ chain: marriott, nightlyRate: 250, nights: 3, taxPercent: 15, tier: "Gold Elite", card: brilliant, valuations: V });
  assert.equal(r.room, 750);
  assert.equal(r.taxes, 112.5);
  assert.equal(r.total, 862.5);
  assert.equal(r.eligible, 750, "taxes don't earn hotel points");
  assert.equal(r.basePoints, 7500);
  assert.equal(r.eliteBonus, 1875, "Gold +25% of base");
  assert.equal(r.hotelPoints, 9375);
  assert.equal(r.cardPoints, 5175, "6x on $862.50");
  assert.ok(r.sameCurrency);
  assert.equal(r.totalPoints, 14550);
  near(r.totalValue!, 14550 * 0.007, 1e-9, "valued at the 0.7¢ median");
  near(r.returnPercent!, (101.85 / 862.5) * 100, 1e-9, "return");
});

test("hotel points: lower-earning brands and elite tiers", () => {
  const residence = stayPoints({ chain: marriott, brand: "Residence Inn", nightlyRate: 200, nights: 2, taxPercent: 10, tier: "Platinum Elite", valuations: V });
  assert.equal(residence.perDollar, 5);
  assert.equal(residence.basePoints, 2000);
  assert.equal(residence.eliteBonus, 1000, "Platinum +50% of the brand's base");
  const unknownBrand = stayPoints({ chain: marriott, brand: "JW Marriott", nightlyRate: 200, nights: 2, taxPercent: 10, valuations: V });
  assert.equal(unknownBrand.perDollar, 10, "brands that aren't exceptions earn the base rate");
  const diamond = stayPoints({ chain: hilton, nightlyRate: 100, nights: 1, taxPercent: 0, tier: "Diamond", valuations: V });
  assert.equal(diamond.hotelPoints, 2000, "Diamond doubles base points");
  const tru = stayPoints({ chain: hilton, brand: "Tru by Hilton", nightlyRate: 100, nights: 1, taxPercent: 0, tier: "Diamond", valuations: V });
  assert.equal(tru.hotelPoints, 1000);
  const none = stayPoints({ chain: hilton, nightlyRate: -5, nights: 0, taxPercent: 10, valuations: V });
  assert.equal(none.totalPoints, 0, "bad input earns nothing rather than negative points");
});

test("hotel points: a general card earns its own currency, valued separately", () => {
  const csr = walletCard(getCard("chase-sapphire-reserve")!, 4);
  assert.equal(csr.currencyId, "chase-ur");
  const r = stayPoints({ chain: hilton, nightlyRate: 300, nights: 2, taxPercent: 10, card: csr, valuations: V });
  assert.equal(r.sameCurrency, false);
  assert.equal(r.totalPoints, r.hotelPoints, "different currencies aren't added together");
  assert.equal(r.cardPoints, 2640);
  near(r.cardValue!, 2640 * 0.016, 1e-9, "Ultimate Rewards at their median");
  const cash = walletCard(getCard("citi-double-cash")!, 2);
  const c = stayPoints({ chain: hilton, nightlyRate: 100, nights: 1, taxPercent: 0, card: cash, valuations: V });
  near(c.cardValue!, 2, 1e-9, "2% cash back on $100");
});

test("hotel helpers: program ids and taxable spend", () => {
  assert.equal(programId("Marriott Bonvoy"), "marriott-bonvoy");
  assert.equal(programId("IHG One Rewards"), "ihg-one-rewards");
  assert.equal(programId("World of Hyatt"), "world-of-hyatt");
  assert.equal(programId("ALL - Accor Live Limitless"), "accor-live-limitless");
  assert.equal(programId("marriott-bonvoy"), "marriott-bonvoy", "ids pass through");
  assert.equal(programName("world-of-hyatt"), "World of Hyatt");
  assert.equal(programName("choice-privileges"), "Choice Privileges");
  assert.equal(programName("some-new-program"), "Some New Program");
  assert.equal(programName("Hilton Honors"), "Hilton Honors");
  // A program whose base rate isn't confirmed yet: card points only, still comparable across cards.
  const unconfirmed = { ...hilton, basePerDollar: null };
  const brilliant = chainCards(marriott, getCard)[0];
  const r = stayPoints({ chain: unconfirmed, nightlyRate: 100, nights: 2, taxPercent: 10, card: walletCard(getCard("chase-sapphire-reserve")!, 4), valuations: V });
  assert.equal(r.partial, true);
  assert.equal(r.hotelPoints, null);
  assert.equal(r.cardPoints, 880);
  near(r.totalValue!, 880 * 0.016, 1e-9, "card value only");
  assert.ok(brilliant.currencyLabel.startsWith("Marriott Bonvoy"));
  const chain = (eligibleSpend: string) => ({ ...marriott, eligibleSpend }) as HotelChain;
  assert.equal(taxesEarnPoints(chain("Room rate and incidentals, before taxes and fees")), false);
  assert.equal(taxesEarnPoints(chain("Room rate excluding taxes")), false);
  assert.equal(taxesEarnPoints(chain("Total charges including taxes")), true);
  const withTaxes = stayPoints({ chain: chain("Total charges including taxes"), nightlyRate: 100, nights: 1, taxPercent: 20, valuations: V });
  assert.equal(withTaxes.basePoints, 1200);
});

// --- Lounge guest cost ---------------------------------------------------------------------------------------------

const R = loungeGuestRules;
const best = (cardsIn: string[], networks: LoungeNetwork[], guests: number, reached: string[] = []) =>
  guestCosts(R, cardsIn, networks, guests, new Set(reached));

test("guest cost: per-guest fees, free guests and the cheapest card", () => {
  const centurion = best(["amex-platinum"], ["centurion"], 2);
  assert.equal(centurion.options[0].costUsd, 100, "2 × $50");
  const sapphire = best(["chase-sapphire-reserve"], ["chase-sapphire"], 3);
  assert.equal(sapphire.options[0].freeUsed, 2);
  assert.equal(sapphire.options[0].costUsd, 27, "2 free + 1 × $27");
  assert.equal(best(["chase-sapphire-reserve"], ["chase-sapphire"], 0).options[0].costUsd, 0);

  const pp = best(["capital-one-venture-x", "amex-platinum"], ["priority-pass"], 2);
  assert.equal(pp.best?.cardId, "amex-platinum", "2 free guests beat $35 each");
  assert.deepEqual(pp.options.map((o) => o.costUsd), [0, 70]);

  const missing = best(["amex-gold", "amex-platinum"], ["centurion"], 1);
  assert.deepEqual(missing.missing, ["amex-gold"]);
});

test("guest cost: spend unlocks change the best card", () => {
  const ids = ["capital-one-venture-x", "capital-one-venture-x-business"];
  const before = best(ids, ["capital-one"], 2);
  assert.deepEqual(before.options.map((o) => o.costUsd), [90, 90]);
  const key = unlockKey("capital-one-venture-x-business", "capital-one", 0);
  const after = best(ids, ["capital-one"], 2, [key]);
  assert.equal(after.best?.cardId, "capital-one-venture-x-business");
  assert.equal(after.best?.costUsd, 0, "$75,000 spend unlocks 2 free guests");
  assert.equal(after.options[1].costUsd, 90, "the other card is unchanged");
  const three = best(["amex-platinum"], ["centurion"], 3, [unlockKey("amex-platinum", "centurion", 0)]);
  assert.equal(three.options[0].costUsd, 50, "2 free after the unlock, the third pays");
});

test("guest cost: a lounge reachable through two networks uses each card's cheaper way in", () => {
  // e.g. a Plaza Premium lounge that also takes Priority Pass.
  const r = best(["amex-platinum"], ["plaza-premium", "priority-pass"], 2);
  assert.equal(r.options.length, 1);
  assert.equal(r.options[0].network, "priority-pass");
  assert.equal(r.options[0].costUsd, 0);
});

test("guest cost: effects in words or structure, and network fallback fees", () => {
  assert.deepEqual(parseEffect("2 complimentary guests"), { freeGuests: 2 });
  assert.deepEqual(parseEffect("Two free guests at Lounges, one at Landings"), { freeGuests: 2 });
  assert.deepEqual(parseEffect("Unlimited visits"), { visits: "unlimited" });
  assert.deepEqual(parseEffect("Guest fee drops to $25"), { guestFeeUsd: 25 });
  assert.deepEqual(parseEffect("free guests: 2 per visit at Capital One Lounges and 1 at Landings"), { freeGuests: 2 });
  assert.deepEqual(parseEffect("All Access membership: 2 adult guests (or 1 adult plus children)"), { freeGuests: 2 });
  assert.equal(effectLabel(parseEffect("4 one-time passes at each anniversary, if you hold the card"), "4 one-time passes at each anniversary, if you hold the card"), "4 one-time passes at each anniversary");
  assert.equal(visitsLabel("10 per year"), "10 per year");
  assert.equal(visitsLabel(15), "15 visits a year");
  assert.deepEqual(parseEffect({ freeGuests: 1 }), { freeGuests: 1 });

  const data: LoungeGuestRulesData = {
    cards: [
      {
        cardId: "amex-platinum",
        access: [{ network: "centurion", visits: "unlimited", conditions: null, freeGuests: null, guestFeeUsd: null, unlocks: [], notes: null }],
        sources: [],
      },
    ],
    networkDefaults: [{ network: "centurion", guestFeeUsd: 50, notes: null, sources: [] }],
  };
  const o = optionFor(data.cards[0], data.cards[0].access[0], 2, new Set(), data.networkDefaults);
  assert.equal(o.feeFromNetwork, true);
  assert.equal(o.costUsd, 100);
  const noFee = optionFor(data.cards[0], data.cards[0].access[0], 1, new Set(), []);
  assert.equal(noFee.costUsd, null, "unpriceable guests sort last rather than looking free");
  assert.ok(cardsWithRules(R, ["chase-sapphire"]).includes("chase-sapphire-reserve"));
});

// --- Data integrity ------------------------------------------------------------------------------------------------

test("guest rules reference real cards and networks the card actually has", () => {
  for (const c of R.cards) {
    const card = getCard(c.cardId);
    assert.ok(card, `card ${c.cardId}`);
    for (const a of c.access) {
      assert.ok(loungeNetworks[a.network], `${c.cardId}: network ${a.network}`);
      assert.ok(card.loungeAccess.some((l) => l.network === a.network), `${c.cardId} has ${a.network} access in its card data`);
      for (const u of a.unlocks) assert.ok(u.spendUsd > 0 && u.period, `${c.cardId} unlock`);
    }
  }
  for (const d of R.networkDefaults) assert.ok(loungeNetworks[d.network], d.network);
});

test("hotel data: real card ids, lower-earning exceptions, valuations for every program", () => {
  for (const chain of hotelEarning.chains) {
    for (const c of chain.cards) if (c.cardId) assert.ok(getCard(c.cardId), `${chain.program}: ${c.cardId}`);
    const base = chain.basePerDollar;
    if (base !== null) for (const e of chain.brandExceptions) assert.ok(e.perDollar < base, `${chain.program} exception earns less`);
    for (const e of chain.eliteBonuses) assert.ok(e.percent > 0 && e.percent <= 200, `${chain.program} ${e.tier}`);
    assert.ok(V.some((v) => v.id === programId(chain.program)), `valuation for ${chain.program}`);
  }
  for (const v of V) {
    assert.ok(v.low <= v.median && v.median <= v.high, v.id);
    assert.ok(v.values.length > 0, v.id);
  }
});

test("baggage and entry data are well formed", () => {
  const codes = baggage.airlines.map((a) => a.iata);
  assert.equal(new Set(codes).size, codes.length, "unique airline codes");
  for (const a of baggage.airlines) {
    assert.match(a.iata, /^[A-Z0-9]{2}$/);
    assert.ok(a.alliance === null || ["oneworld", "Star Alliance", "SkyTeam"].includes(a.alliance), a.name);
    assert.match(a.baggageUrl, /^https:\/\//);
  }
  for (const r of baggage.usDomestic) assert.ok(r.airline.trim() && r.sources.length > 0, `domestic fee row ${r.airline}`);

  const isos = entryRequirements.destinations.map((d) => d.iso2).filter((c) => c !== null);
  assert.equal(new Set(isos).size, isos.length, "one entry per country");
  for (const d of entryRequirements.destinations) {
    assert.ok(ENTRY_REQUIREMENTS.includes(d.requirement), d.country);
    if (d.iso2 !== null) assert.match(d.iso2, /^[A-Z]{2}$/, d.country);
    assert.match(d.officialSource, /^https:\/\/travel\.state\.gov\//, d.country);
    assert.match(d.asOf, /^\d{4}-\d{2}(-\d{2})?$/, d.country);
    if (d.authorization) assert.match(d.authorization.url, /^https:\/\//, d.country);
  }
  for (const c of entryRequirements.recentChanges) assert.match(c.date, /^\d{4}-\d{2}(-\d{2})?$/);
});

test("seed files carry the SEED DATA header exactly while flagged as seed", () => {
  const files = {
    baggage: "baggage.ts",
    entryRequirements: "entry-requirements.ts",
    hotelEarning: "hotel-earning.ts",
    valuations: "valuations.ts",
    loungeGuestRules: "lounge-guest-rules.ts",
  } as const;
  for (const [key, file] of Object.entries(files) as [keyof typeof files, string][]) {
    const text = readFileSync(join(process.cwd(), "src/shared/data/travel", file), "utf8");
    const header = text.startsWith("// SEED DATA: replaced by verified research before release");
    assert.equal(header, seedData[key], `${file}: header and seed-status.ts agree`);
  }
});

// --- Start here ----------------------------------------------------------------------------------------------------

const KNOWN_ROUTES = [
  "/points", "/points/transfers", "/points/sweet-spots", "/points/programs", "/next-card", "/best-card", "/compare",
  "/calculator", "/tracker", "/cards", "/lounges", "/tools/entry-requirements", "/tools/distance", "/tools/baggage",
  "/tools/hotel-points",
];

test("start flows: 2–5 one-tap questions, each ending on real tools", () => {
  assert.deepEqual(START_FLOWS.map((f) => f.id), ["points", "card", "fee", "trip", "airport"]);
  const ctx = { wallet: [] };
  for (const flow of START_FLOWS) {
    assert.ok(flow.questions.length >= 2 && flow.questions.length <= 5, `${flow.id} question count`);
    // Answer every question with its first option, in order.
    const answers: Record<string, string> = {};
    for (let q = nextQuestion(flow, answers, ctx); q; q = nextQuestion(flow, answers, ctx)) {
      const opts = q.options(ctx);
      assert.ok(opts.length >= 2, `${flow.id}.${q.id} has options`);
      assert.equal(new Set(opts.map((o) => o.value)).size, opts.length, `${flow.id}.${q.id} unique values`);
      answers[q.id] = opts[0].value;
    }
    const n = activeQuestions(flow, answers).length;
    assert.ok(n >= 2 && n <= 5, `${flow.id}: ${n} questions asked`);
    const results = flow.results(answers, ctx);
    assert.ok(results.length >= 1, `${flow.id} results`);
    for (const r of results) {
      const path = r.href.split("?")[0];
      assert.ok(KNOWN_ROUTES.some((k) => path === k || path.startsWith(`${k}/`)), `${flow.id}: ${r.href}`);
    }
  }
});

test("start flows: answers come from the URL, and conditional questions are skipped", () => {
  const airport = START_FLOWS.find((f) => f.id === "airport")!;
  const params = new URLSearchParams("flow=airport&airport=JFK&need=bags&junk=1");
  const answers = answersFrom(airport, params);
  assert.deepEqual(answers, { airport: "JFK", need: "bags" });
  assert.equal(nextQuestion(airport, answers, { wallet: [] })?.id, "airline", "no guest question when only bags are needed");
  const done = airport.results({ ...answers, airline: "DL" }, { wallet: [] });
  assert.deepEqual(done.map((r) => r.href), ["/tools/baggage?airline=DL"]);
  const lounge = airport.results({ airport: "JFK", need: "lounge", guests: "2" }, { wallet: [] });
  assert.deepEqual(lounge.map((r) => r.href), ["/lounges/JFK?guests=2"]);

  const trip = START_FLOWS.find((f) => f.id === "trip")!;
  const hrefs = trip.results({ from: "JFK", to: "HND", cabin: "business" }, { wallet: [] }).map((r) => r.href);
  assert.ok(hrefs.includes("/tools/distance?route=JFK-HND"));
  assert.ok(hrefs.includes("/tools/entry-requirements?q=Japan"));
  assert.ok(hrefs.includes("/points/sweet-spots?region=Japan&cabin=business&from=JFK"));
});

test("start flows: card suggestions respect the fee limit", () => {
  const picks = suggestCards("dining", "0", "rarely");
  assert.equal(picks.length, 3);
  for (const id of picks) assert.equal(getCard(id)!.annualFee, 0, id);
  assert.ok(suggestCards("travel", "any", "often").every((id) => cards.some((c) => c.id === id && c.category !== "business")));
  const fee = feeCheck("amex-platinum", "all")!;
  assert.equal(fee.fee, getCard("amex-platinum")!.annualFee);
  assert.equal(fee.net, fee.credits - fee.fee);
  assert.equal(feeCheck("not-a-card", "all"), null);
});

test("travel formatting needs no Date objects", () => {
  assert.equal(formatIsoDate("2026-11-24"), "Nov 24, 2026");
  assert.equal(formatIsoDate("2026-04"), "Apr 2026");
  assert.equal(formatIsoDate("soon"), "soon");
  assert.equal(feeText(25), "$25");
  assert.equal(feeText(80.9), "$80.90");
  assert.equal(feeText(0), "Free");
  assert.equal(feeText("£16"), "£16");
  assert.equal(feeText(null), "—");
});
