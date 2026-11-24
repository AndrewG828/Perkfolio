import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
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
import {
  decodeAirports,
  METRO_AIRPORTS,
  metroNamesFor,
  parseRoute,
  parseRouteParam,
  sameAirportLegs,
  searchAirports,
  summarizeRoute,
  type AirportsFile,
} from "../src/shared/lib/airports";
import { buildAirports, parseCsv } from "../scripts/build-airports";
import {
  chainCards,
  currencyIdForCard,
  currencyName,
  hotelRateAt,
  programId,
  programName,
  stayPoints,
  taxesEarnPoints,
  walletCard,
} from "../src/shared/lib/hotel-points";
import {
  cardsWithRules,
  compareOptions,
  copayFor,
  costDetail,
  costLabel,
  effectLabel,
  guestCosts,
  optionFor,
  parseEffect,
  publishedFees,
  unlockKey,
  visitCount,
  visitsLabel,
  type GuestPlace,
} from "../src/shared/lib/guest-cost";
import { networksFor } from "../src/shared/lib/lounge-access";
import { lounges } from "../src/shared/data/lounges";
import { PLACE_NOTES, searchDestinations, usPlaceFor } from "../src/shared/lib/entry-search";
import { namesAirline } from "../src/shared/lib/airline-search";
import { checkTerms } from "../src/shared/lib/card-terms";
import { CARD_TERM_CHECKS } from "../src/shared/data/travel/card-term-checks";
import { regionFor, SWEET_SPOT_REGIONS, sweetSpotsHref } from "../src/shared/data/travel/regions";
import { activeQuestions, answersFrom, feeCheck, flowById, LIVE_FLOWS, nextQuestion, resultsFor, START_FLOWS, suggestCards } from "../src/shared/lib/start-flows";
import { PENDING_ROUTES, routeLive } from "../src/shared/lib/site-routes";
import { TOOLS } from "../src/frontend/features/tools/catalog";
import { formatIsoDate, feeText, linkLabel, possessive, readableDates, sourceLabels, splitUrls, visitorSources } from "../src/shared/lib/travel-format";
import { baggage } from "../src/shared/data/travel/baggage";
import { entryRequirements } from "../src/shared/data/travel/entry-requirements";
import { hotelEarning } from "../src/shared/data/travel/hotel-earning";
import { valuations } from "../src/shared/data/travel/valuations";
import { loungeGuestRules } from "../src/shared/data/travel/lounge-guest-rules";
import { datasetNotice, datasetStatus } from "../src/shared/data/travel/seed-status";
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
  // Too many stops: the origin and destination stay, and the dropped stops are named.
  assert.deepEqual(parseRoute("JFK-LHR-DXB-SIN-SYD-AKL"), ["JFK", "LHR", "DXB", "SIN", "AKL"]);
  assert.deepEqual(parseRouteParam("JFK-LHR-CDG-FRA-MUC-SIN"), { codes: ["JFK", "LHR", "CDG", "FRA", "SIN"], dropped: ["MUC"] });
  assert.deepEqual(parseRouteParam("JFK-LHR").dropped, []);
  assert.deepEqual(sameAirportLegs(["JFK", "JFK"]), [1]);
  assert.deepEqual(sameAirportLegs(["ANC", "ANC", "ANC"]), [1, 2]);
  assert.deepEqual(sameAirportLegs(["JFK", "LHR", "JFK"]), [], "a round trip is fine");
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
  // Metro names find the airports filed under other cities (Narita, Newark), busiest first.
  assert.deepEqual(searchAirports(world, "new york", 3).map((a) => a.code), ["JFK", "EWR", "LGA"]);
  assert.deepEqual(searchAirports(world, "nyc", 3).map((a) => a.code), ["JFK", "EWR", "LGA"]);
  assert.deepEqual(searchAirports(world, "tokyo", 2).map((a) => a.code), ["HND", "NRT"]);
  assert.equal(searchAirports(world, "dallas")[0].code, "DFW");
  // Those results are labelled by the place searched, not the town OurAirports files them under (Ferno, Dulles).
  assert.deepEqual([...metroNamesFor("milan")], [["MXP", "Milan"], ["LIN", "Milan"]]);
  assert.equal(metroNamesFor("washington").get("IAD"), "Washington");
  assert.equal(metroNamesFor("maui").get("OGG"), "Maui");
  assert.equal(metroNamesFor("nyc").get("EWR"), "New York");
  assert.equal(metroNamesFor("sao paulo").get("GRU"), "São Paulo");
  assert.equal(metroNamesFor("jfk").size, 0);
  assert.deepEqual(searchAirports(world, "bay area", 3).map((a) => a.code), ["SFO", "OAK", "SJC"]);
  assert.equal(searchAirports(world, "maui")[0].code, "OGG");
  assert.equal(searchAirports(world, "hawaii")[0].code, "HNL");
  for (const [name, codes] of Object.entries(METRO_AIRPORTS)) {
    for (const c of codes) assert.ok(world.some((a) => a.code === c), `${name}: ${c} in airports.json`);
  }
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

const chainFor = (id: string) => hotelEarning.chains.find((c) => programId(c.program) === id)!;
const marriott = chainFor("marriott-bonvoy");
const hilton = chainFor("hilton-honors");
const hyatt = chainFor("world-of-hyatt");
const ihg = chainFor("ihg-one-rewards");
const V = valuations.valuations;
const median = (id: string) => V.find((v) => v.id === id)!.median;

test("hotel points: base rate on the room rate, elite bonus on base, card points on the total", () => {
  assert.equal(median("marriott-bonvoy"), 0.73, "Marriott at the November 2026 median");
  const brilliant = chainCards(marriott, getCard).find((c) => c.cardId === "amex-marriott-brilliant")!;
  const r = stayPoints({ chain: marriott, nightlyRate: 250, nights: 3, taxPercent: 15, tier: "Gold Elite", card: brilliant, valuations: V });
  assert.equal(r.room, 750);
  assert.equal(r.taxes, 112.5);
  assert.equal(r.total, 862.5);
  assert.equal(r.taxesEarn, false);
  assert.equal(r.eligible, 750, "taxes don't earn Marriott points");
  assert.equal(r.basePoints, 7500);
  assert.equal(r.eliteBonus, 1875, "Gold +25% of base");
  assert.equal(r.hotelPoints, 9375);
  assert.equal(r.cardPoints, 5175, "6x on $862.50");
  assert.ok(r.sameCurrency);
  assert.equal(r.totalPoints, 14550);
  near(r.totalValue!, 14550 * 0.0073, 1e-9, "valued at the 0.73¢ median");
  near(r.returnPercent!, ((14550 * 0.0073) / 862.5) * 100, 1e-9, "return");
});

test("hotel points: lower-earning brands and elite tiers", () => {
  const residence = stayPoints({ chain: marriott, brand: "Residence Inn", nightlyRate: 200, nights: 2, taxPercent: 10, tier: "Platinum Elite", valuations: V });
  assert.equal(residence.perDollar, 5);
  assert.equal(residence.basePoints, 2000);
  assert.equal(residence.eliteBonus, 1000, "Platinum +50% of the brand's base");
  const unknownBrand = stayPoints({ chain: marriott, brand: "JW Marriott", nightlyRate: 200, nights: 2, taxPercent: 10, valuations: V });
  assert.equal(unknownBrand.perDollar, 10, "brands that aren't exceptions earn the base rate");
  // StudioRes: 4 per $1, and elites earn no bonus there.
  const studio = stayPoints({ chain: marriott, brand: "StudioRes (no elite bonus points)", nightlyRate: 100, nights: 1, taxPercent: 0, tier: "Titanium Elite", valuations: V });
  assert.equal(studio.perDollar, 4);
  assert.equal(studio.noEliteAtBrand, true);
  assert.equal(studio.eliteBonus, 0);
  assert.equal(studio.hotelPoints, 400);
  const diamond = stayPoints({ chain: hilton, nightlyRate: 100, nights: 1, taxPercent: 0, tier: "Diamond", valuations: V });
  assert.equal(diamond.hotelPoints, 2000, "Diamond doubles base points");
  const reserve = stayPoints({ chain: hilton, nightlyRate: 100, nights: 1, taxPercent: 0, tier: "Diamond Reserve", valuations: V });
  assert.equal(reserve.hotelPoints, 2200, "Diamond Reserve +120%: 22 per $1");
  const tru = stayPoints({ chain: hilton, brand: "Tru by Hilton", nightlyRate: 100, nights: 1, taxPercent: 0, tier: "Diamond", valuations: V });
  assert.equal(tru.hotelPoints, 1000);
  const studios = stayPoints({ chain: hyatt, brand: "Hyatt Studios", nightlyRate: 100, nights: 2, taxPercent: 0, tier: "Globalist", valuations: V });
  assert.equal(studios.basePoints, 500, "Hyatt Studios at 2.5 per $1");
  assert.equal(studios.eliteBonus, 150, "Globalist +30%");
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
  near(r.cardValue!, 2640 * (median("chase-ur") / 100), 1e-9, "Ultimate Rewards at their median");
  const cash = walletCard(getCard("citi-double-cash")!, 2);
  const c = stayPoints({ chain: hilton, nightlyRate: 100, nights: 1, taxPercent: 0, card: cash, valuations: V });
  near(c.cardValue!, 2, 1e-9, "2% cash back on $100");
  // Bilt Points "(plus Bilt Cash)" are points, valued at the Bilt median, not cash back.
  const bilt = walletCard(getCard("bilt-palladium")!, 2);
  assert.equal(bilt.cashBack, false);
  assert.equal(bilt.currencyId, "bilt");
  const b = stayPoints({ chain: hyatt, nightlyRate: 300, nights: 1, taxPercent: 0, card: bilt, valuations: V });
  near(b.cardValue!, 600 * (median("bilt") / 100), 1e-9, "600 Bilt Points at the Bilt median");
  for (const id of ["bilt-blue", "bilt-obsidian"]) assert.equal(walletCard(getCard(id)!, 1).currencyId, "bilt", id);
  // Airline-mile cards use their program's published median, not the card's own estimate.
  assert.equal(currencyIdForCard(getCard("amex-delta-reserve")!), "delta-skymiles");
  assert.equal(currencyIdForCard(getCard("citi-aadvantage-executive")!), "american-aadvantage");
  assert.equal(currencyIdForCard(getCard("atmos-rewards-summit")!), "atmos-rewards");
  assert.equal(currencyIdForCard(getCard("united-club-infinite")!), "united-mileageplus");
  for (const card of cards) {
    const w = walletCard(card, 1);
    if (!w.cashBack) assert.ok(w.currencyId && V.some((v) => v.id === w.currencyId), `${card.id} (${card.rewardsCurrency}) has a valuation`);
  }
});

test("hotel points: another chain's co-branded card earns its base rate there, and Bilt Points read as Bilt Points", () => {
  const card = (id: string) => getCard(id)!;
  // Each card's hotel bonus is for its own chain (hotel-earning.ts lists them per chain): elsewhere, its base rate.
  assert.equal(hotelRateAt(card("world-of-hyatt"), marriott, 4), 1);
  assert.equal(hotelRateAt(card("amex-hilton-aspire"), hyatt, 14), 3);
  assert.equal(hotelRateAt(card("amex-marriott-brilliant"), hilton, 6), 2);
  assert.equal(hotelRateAt(card("world-of-hyatt"), hyatt, 4), 4, "its own chain keeps the bonus");
  assert.equal(hotelRateAt(card("chase-sapphire-reserve"), marriott, 4), 4, "a general card keeps its hotel rate");
  assert.equal(hotelRateAt(card("bilt-palladium"), marriott, 2), 2);
  const hyattCard = walletCard(card("world-of-hyatt"), 4, marriott);
  assert.equal(hyattCard.perDollar, 1);
  const stay = (c: ReturnType<typeof walletCard>) => stayPoints({ chain: marriott, nightlyRate: 250, nights: 3, taxPercent: 15, card: c, valuations: V });
  assert.equal(stay(hyattCard).cardPoints, 863, "$862.50 × 1");
  // A Marriott card now beats the Hyatt card at a Marriott, and the Aspire no longer earns 14x there.
  const brilliant = chainCards(marriott, getCard).find((c) => c.cardId === "amex-marriott-brilliant")!;
  assert.ok(stay(brilliant).totalValue! > stay(hyattCard).totalValue!);
  assert.equal(walletCard(card("amex-hilton-aspire"), 14, marriott).perDollar, 3);
  // The card data's "(plus Bilt Cash)" isn't counted, so it isn't shown either.
  assert.equal(currencyName(card("bilt-palladium")), "Bilt Points");
  assert.equal(walletCard(card("bilt-palladium"), 2, marriott).currencyLabel, "Bilt Points");
  assert.equal(currencyName(card("chase-sapphire-reserve")), "Chase Ultimate Rewards points");
});

test("hotel helpers: program ids, taxable spend, and what the calculator won't assume", () => {
  assert.equal(programId("Marriott Bonvoy"), "marriott-bonvoy");
  assert.equal(programId("IHG One Rewards"), "ihg-one-rewards");
  assert.equal(programId("World of Hyatt"), "world-of-hyatt");
  assert.equal(programId("ALL - Accor Live Limitless"), "accor-live-limitless");
  assert.equal(programId("marriott-bonvoy"), "marriott-bonvoy", "ids pass through");
  assert.equal(programName("world-of-hyatt"), "World of Hyatt");
  assert.equal(programName("choice-privileges"), "Choice Privileges");
  assert.equal(programName("some-new-program"), "Some New Program");
  assert.equal(programName("Hilton Honors"), "Hilton Honors");
  // A program whose base rate isn't confirmed: card points only, still comparable across cards.
  const unconfirmed = { ...hilton, basePerDollar: null };
  const brilliant = chainCards(marriott, getCard)[0];
  const r = stayPoints({ chain: unconfirmed, nightlyRate: 100, nights: 2, taxPercent: 10, card: walletCard(getCard("chase-sapphire-reserve")!, 4), valuations: V });
  assert.equal(r.partial, true);
  assert.equal(r.hotelPoints, null);
  assert.equal(r.cardPoints, 880);
  near(r.totalValue!, 880 * (median("chase-ur") / 100), 1e-9, "card value only");
  assert.ok(brilliant.currencyLabel.startsWith("Marriott Bonvoy"));
  // A tier whose bonus isn't confirmed: base points only, flagged.
  const noBonus = { ...hilton, eliteBonuses: [{ tier: "Honors Society", percent: null }] };
  const t = stayPoints({ chain: noBonus, nightlyRate: 100, nights: 1, taxPercent: 0, tier: "Honors Society", valuations: V });
  assert.equal(t.eliteUnknown, true);
  assert.equal(t.eliteBonus, null);
  assert.equal(t.hotelPoints, 1000);
  // Taxes: explicit per program (Hyatt and IHG unconfirmed), else read from the wording.
  assert.equal(taxesEarnPoints(marriott), false);
  assert.equal(taxesEarnPoints(hilton), false);
  assert.equal(taxesEarnPoints(hyatt), null);
  assert.equal(taxesEarnPoints(ihg), null);
  const ihgStay = stayPoints({ chain: ihg, nightlyRate: 100, nights: 1, taxPercent: 20, valuations: V });
  assert.equal(ihgStay.taxesEarn, null);
  assert.equal(ihgStay.eligible, 100, "unconfirmed: the room rate only");
  assert.equal(ihgStay.basePoints, 1000);
  const chain = (eligibleSpend: string) => ({ ...marriott, taxesEarn: undefined, eligibleSpend }) as HotelChain;
  assert.equal(taxesEarnPoints(chain("Room rate and incidentals, before taxes and fees")), false);
  assert.equal(taxesEarnPoints(chain("Room rate excluding taxes")), false);
  assert.equal(taxesEarnPoints(chain("Total charges including taxes")), true);
  const withTaxes = stayPoints({ chain: chain("Total charges including taxes"), nightlyRate: 100, nights: 1, taxPercent: 20, valuations: V });
  assert.equal(withTaxes.basePoints, 1200);
});

// --- Lounge guest cost ---------------------------------------------------------------------------------------------

const R = loungeGuestRules;
const best = (cardsIn: string[], networks: LoungeNetwork[], guests: number, reached: string[] = [], place: GuestPlace | null = null) =>
  guestCosts(R, cardsIn, networks, guests, new Set(reached), place);
/** Guest cost at a real lounge from shared/data/lounges, through every network it takes. */
const atLounge = (id: string, cardsIn: string[], guests: number, reached: string[] = []) => {
  const l = lounges.find((x) => x.id === id);
  assert.ok(l, id);
  return best(cardsIn, networksFor(l), guests, reached, { airport: l.airportCode, name: l.name, notes: l.notes });
};

test("guest cost: per-guest fees, free guests and the cheapest card", () => {
  const centurion = best(["amex-platinum"], ["centurion"], 2);
  assert.equal(centurion.options[0].costUsd, 100, "2 × $50");
  assert.equal(centurion.options[0].childGuestFeeUsd, 30, "the child rate is kept");
  // Sapphire Lounges: 2 free guests; Chase doesn't publish the fee for a third, and the page says so.
  const sapphire = best(["chase-sapphire-reserve"], ["chase-sapphire"], 3);
  assert.equal(sapphire.options[0].freeUsed, 2);
  assert.equal(sapphire.options[0].costUsd, null);
  assert.equal(sapphire.options[0].unpriced, "unpublished");
  assert.equal(costLabel(sapphire.options[0]), "Fee not published");
  assert.equal(costDetail(sapphire.options[0], 3), "2 free + 1 more (fee not published)");
  assert.equal(best(["chase-sapphire-reserve"], ["chase-sapphire"], 0).options[0].costUsd, 0);
  const csrPriorityPass = best(["chase-sapphire-reserve"], ["priority-pass"], 3);
  assert.equal(csrPriorityPass.options[0].costUsd, 27, "2 free + 1 × $27");
  const mapleLeaf = best(["chase-sapphire-reserve"], ["air-canada-maple-leaf"], 2);
  assert.equal(mapleLeaf.options[0].costUsd, 59, "1 free + 1 × US$59");

  const pp = best(["capital-one-venture-x", "amex-platinum"], ["priority-pass"], 2);
  assert.equal(pp.best?.cardId, "amex-platinum", "2 free guests beat $35 each");
  assert.deepEqual(pp.options.map((o) => o.costUsd), [0, 70]);

  const missing = best(["amex-gold", "amex-platinum"], ["centurion"], 1);
  assert.deepEqual(missing.missing, ["amex-gold"]);

  // Cards that cost the same are all best: both free with 2 guests.
  const tie = best(["amex-platinum", "chase-sapphire-reserve", "capital-one-venture-x"], ["priority-pass"], 2);
  assert.deepEqual(tie.tied.map((o) => o.cardId).sort(), ["amex-platinum", "chase-sapphire-reserve"]);
});

test("guest cost: a null fee isn't priced at the network's usual fee", () => {
  // Amex publishes no price for Priority Pass guests beyond 2 (Chase charges $27, Capital One $35).
  for (const id of ["amex-platinum", "amex-business-platinum", "amex-marriott-brilliant"]) {
    const o = best([id], ["priority-pass"], 3).options[0];
    assert.equal(o.costUsd, null, id);
    assert.equal(o.unpriced, "unpublished", id);
  }
  // A Plaza Premium lounge that also lists Priority Pass: no $35 "via Priority Pass" for Amex either.
  const lhr = atLounge("plaza-premium-lhr-t2", ["amex-platinum"], 3);
  assert.equal(lhr.options[0].cost, null);
  assert.equal(lhr.best, null);
  assert.deepEqual(publishedFees(R, "priority-pass"), { low: 27, high: 35 });
  assert.equal(publishedFees(R, "chase-sapphire"), null);
});

test("guest cost: Centurion Lounges abroad and Capital One Landings use their own rules", () => {
  const plat = ["amex-platinum"];
  // Mexico City: 2 free guests, then US$70.
  assert.equal(atLounge("centurion-mex-t2", plat, 2).options[0].costUsd, 0);
  assert.equal(atLounge("centurion-mex-t2", plat, 3).options[0].costUsd, 70);
  assert.equal(atLounge("centurion-mex-t2", ["amex-business-platinum"], 2).options[0].costUsd, 0);
  // Up to 3 paid guests there.
  assert.equal(atLounge("centurion-mty-a", plat, 6).options[0].unpriced, "over-limit");
  // Sydney and Melbourne: 1 free, then AUD 65.
  assert.equal(atLounge("centurion-syd-t1", plat, 1).options[0].costUsd, 0);
  const syd = atLounge("centurion-mel-t2", plat, 2).options[0];
  assert.deepEqual(syd.cost, { amount: 65, currency: "AUD" });
  assert.equal(costLabel(syd), "AUD 65");
  // The $75,000 unlock isn't stated to apply there, so it's left out (and said so).
  const sydUnlocked = atLounge("centurion-syd-t1", plat, 2, [unlockKey("amex-platinum", "centurion", 0)]).options[0];
  assert.deepEqual(sydUnlocked.cost, { amount: 65, currency: "AUD" });
  assert.equal(sydUnlocked.unlockIgnored, true);
  // Delhi: 1 free, then US$28. Buenos Aires: 1 free, then US$50, up to 3.
  assert.equal(atLounge("centurion-del-t1", plat, 2).options[0].costUsd, 28);
  assert.equal(atLounge("centurion-eze-a", plat, 1).options[0].costUsd, 0);
  assert.equal(atLounge("centurion-eze-a", plat, 4).options[0].costUsd, 150);
  assert.equal(atLounge("centurion-eze-a", plat, 5).options[0].unpriced, "over-limit");
  // London: the usual allowance in pounds; the unlock still makes 2 free.
  const lhr = atLounge("centurion-lhr-t3", plat, 2).options[0];
  assert.equal(costLabel(lhr), "£70");
  assert.equal(lhr.costUsd, null);
  assert.equal(atLounge("centurion-lhr-t3", plat, 2, [unlockKey("amex-platinum", "centurion", 0)]).options[0].costUsd, 0);
  assert.equal(costLabel(atLounge("centurion-hnd-t3", ["amex-delta-reserve"], 1).options[0]), "JPY 8,300");
  // Rules stated only for the Platinum cards: the Delta Reserve isn't priced there.
  const reserve = atLounge("centurion-syd-t1", ["amex-delta-reserve"], 1).options[0];
  assert.equal(reserve.unpriced, "unconfirmed");
  assert.equal(reserve.location?.covered, false);
  // U.S. lounges keep the usual rules.
  assert.equal(atLounge("centurion-jfk-t4", plat, 2).options[0].costUsd, 100);

  // Capital One: the $75,000 unlock gives 2 free guests at Lounges, 1 at Landings.
  const vx = ["capital-one-venture-x"];
  const unlocked = [unlockKey("capital-one-venture-x", "capital-one", 0)];
  assert.equal(atLounge("capital-one-jfk-t4", vx, 2, unlocked).options[0].costUsd, 0);
  assert.equal(atLounge("capital-one-landing-dca-t2", vx, 2, unlocked).options[0].costUsd, 45);
  assert.equal(atLounge("capital-one-landing-lga-b", vx, 2).options[0].costUsd, 90, "before the unlock, Landings price as Lounges");
});

test("guest cost: limits on guests, family and passes", () => {
  // Sky Club: up to 2 guests, or immediate family, at $50 each.
  const sky = best(["amex-platinum"], ["delta-sky-club"], 4).options[0];
  assert.equal(sky.costUsd, 200);
  assert.match(costDetail(sky, 4), /beyond 2, only your immediate family/);
  const reserve = best(["amex-delta-reserve"], ["delta-sky-club"], 1).options[0];
  assert.match(costDetail(reserve, 1), /One-Time Guest Pass/);
  // Delta Reserve at Centurion: up to 2 paying guests.
  assert.equal(best(["amex-delta-reserve"], ["centurion"], 3).options[0].unpriced, "over-limit");
  // Admirals Club with the Executive card: 2 guests, or immediate family, all free.
  assert.equal(best(["citi-aadvantage-executive"], ["admirals-club"], 3).options[0].costUsd, 0);
  // Strata Elite: every adult who enters uses one of the 4 yearly passes, the cardmember included (up to 3 guests).
  const strata = best(["citi-strata-elite"], ["admirals-club"], 2).options[0];
  assert.equal(strata.unpriced, "passes");
  assert.equal(strata.passes, 3);
  assert.equal(costLabel(strata), "3 passes");
  assert.equal(costDetail(strata, 2), "You and 2 guests: 3 of your 4 passes a year");
  assert.equal(costDetail(best(["citi-strata-elite"], ["admirals-club"], 1).options[0], 1), "You and your guest: 2 of your 4 passes a year");
  const alone = best(["citi-strata-elite"], ["admirals-club"], 0).options[0];
  assert.equal(costLabel(alone), "1 pass", "the cardmember uses a pass too, even alone");
  assert.equal(alone.cost, null);
  assert.equal(visitsLabel(strata.visits, true), "4 passes a year, one for each adult who enters, you included");
  assert.equal(costDetail(best(["citi-strata-elite"], ["admirals-club"], 3).options[0], 3), "You and 3 guests: 4 of your 4 passes a year");
  assert.equal(best(["citi-strata-elite"], ["admirals-club"], 4).options[0].unpriced, "over-limit");
  // United Club: 1 adult guest, 2 with All Access.
  assert.equal(best(["united-club-infinite"], ["united-club"], 2).options[0].unpriced, "over-limit");
  assert.equal(best(["united-club-infinite"], ["united-club"], 2, [unlockKey("united-club-infinite", "united-club", 0)]).options[0].costUsd, 0);
});

test("lounges marked as out of Priority Pass don't take Priority Pass cards", () => {
  const nets = (id: string) => networksFor(lounges.find((l) => l.id === id)!);
  assert.deepEqual(nets("escape-phx-t4"), ["escape"]);
  assert.deepEqual(nets("plaza-premium-first-dfw-d"), ["plaza-premium"]);
  assert.deepEqual(nets("plaza-premium-dfw-d"), ["plaza-premium"]);
  assert.deepEqual(nets("plaza-premium-lhr-t2"), ["plaza-premium", "priority-pass"]);
  assert.deepEqual(nets("alaska-lounge-sfo-t1"), ["alaska-lounge", "priority-pass"]);
  assert.equal(atLounge("escape-phx-t4", ["chase-sapphire-reserve"], 3).options.length, 0);
});

test("guest cost: spend unlocks change the best card", () => {
  const ids = ["capital-one-venture-x", "capital-one-venture-x-business"];
  const before = best(ids, ["capital-one"], 2);
  assert.deepEqual(before.options.map((o) => o.costUsd), [90, 90]);
  assert.deepEqual(before.options.map((o) => o.childGuestFeeUsd), [25, 25]);
  const key = unlockKey("capital-one-venture-x-business", "capital-one", 0);
  const after = best(ids, ["capital-one"], 2, [key]);
  assert.equal(after.best?.cardId, "capital-one-venture-x-business");
  assert.equal(after.best?.costUsd, 0, "$75,000 spend unlocks 2 free guests");
  assert.equal(after.options[1].costUsd, 90, "the other card is unchanged");
  const three = best(["amex-platinum"], ["centurion"], 3, [unlockKey("amex-platinum", "centurion", 0)]);
  assert.equal(three.options[0].costUsd, 50, "2 free after the unlock, the third pays");
});

test("guest cost: networks that open only after an unlock, and allowances that aren't confirmed", () => {
  // United Club Infinite reaches Star Alliance lounges only with All Access ($50,000 a year).
  const locked = best(["united-club-infinite"], ["star-alliance-lounges"], 0);
  assert.equal(locked.options[0].locked, true);
  assert.equal(locked.options[0].costUsd, null);
  assert.equal(locked.best, null);
  const open = best(["united-club-infinite"], ["star-alliance-lounges"], 1, [unlockKey("united-club-infinite", "star-alliance-lounges", 0)]);
  assert.equal(open.options[0].locked, false);
  assert.equal(open.options[0].costUsd, null, "each lounge's own guest policy: not priced");
  // Atmos Rewards Summit: the Alaska Lounge pass terms couldn't be read, so nothing is assumed.
  const summit = best(["atmos-rewards-summit"], ["alaska-lounge"], 1);
  assert.equal(summit.options[0].freeGuestsKnown, false);
  assert.equal(summit.options[0].costUsd, null);
  assert.equal(summit.options[0].visits, null);
  assert.equal(best(["atmos-rewards-summit"], ["alaska-lounge"], 0).options[0].costUsd, 0, "you alone, nothing to price");
  assert.equal(visitCount("10 per year"), 10);
  assert.equal(visitCount("0 per year"), 0);
  assert.equal(visitCount("unlimited"), Infinity);
  assert.equal(visitCount(null), null);
  assert.equal(visitsLabel("0 per year"), "Only after a spend unlock");
});

test("guest cost: a lounge reachable through two networks uses each card's cheaper way in, its own network on a tie", () => {
  // e.g. a Plaza Premium lounge that also takes Priority Pass: Amex checks Platinum cardmembers in under Plaza Premium.
  const r = best(["amex-platinum"], ["plaza-premium", "priority-pass"], 2);
  assert.equal(r.options.length, 1);
  assert.equal(r.options[0].network, "plaza-premium");
  assert.equal(r.options[0].costUsd, 0);
  assert.equal(atLounge("escape-phx-t3", ["amex-platinum"], 1).options[0].network, "escape");
  assert.equal(atLounge("plaza-premium-lhr-t2", ["amex-platinum"], 1).options[0].network, "plaza-premium");
  // A card with only Priority Pass still goes in through it.
  assert.equal(atLounge("escape-phx-t3", ["chase-sapphire-reserve"], 1).options[0].network, "priority-pass");
});

test("guest cost: a lounge's own Priority Pass co-pay, Arlanda's Consumer-only rule and local prices", () => {
  // SFO's Alaska Lounge takes Priority Pass with a $15 co-pay: guests may be free, but the visit isn't.
  assert.deepEqual(copayFor({ airport: "SFO", name: "Alaska Lounge", notes: "Also accessible via Priority Pass ($15 co-pay)" }, "priority-pass"), {
    amount: 15,
    currency: "USD",
  });
  assert.equal(copayFor({ airport: "SFO", name: "Alaska Lounge", notes: "Also accessible via Priority Pass ($15 co-pay)" }, "alaska-lounge"), null);
  const sfo = atLounge("alaska-lounge-sfo-t1", ["amex-platinum", "chase-sapphire-reserve"], 2);
  assert.equal(sfo.best?.costUsd, 0);
  assert.deepEqual(sfo.best?.copay, { amount: 15, currency: "USD" });
  assert.equal(costDetail(sfo.best!, 2), "All 2 guests are free · plus the lounge's $15 Priority Pass co-pay");
  // Without the co-pay, the same price ranks first.
  const noCopay = { ...sfo.best!, copay: null };
  assert.ok(compareOptions(noCopay, sfo.best!) < 0);

  // Arlanda admits Consumer Platinum only: Business Platinum isn't priced as if it got in.
  const arn = atLounge("amex-arn-t5", ["amex-platinum", "amex-business-platinum"], 2);
  const biz = arn.options.find((o) => o.cardId === "amex-business-platinum")!;
  assert.equal(biz.unpriced, "not-admitted");
  assert.equal(costLabel(biz), "Not admitted");
  assert.equal(costDetail(biz, 2), "This lounge doesn't admit this card");
  const plat = arn.options.find((o) => o.cardId === "amex-platinum")!;
  assert.equal(plat.costUsd, 50, "1 free, then $50");
  assert.equal(arn.best?.cardId, "amex-platinum");

  // Maple Leaf guests are US$59 at U.S. lounges; the detail says what they cost abroad.
  const maple = best(["chase-sapphire-reserve"], ["air-canada-maple-leaf"], 2).options[0];
  assert.match(costDetail(maple, 2), /1 × \$59 at U\.S\. lounges \(CA\$59 in Canada, £59 in the UK and €59 elsewhere in Europe\)/);

  // With no wallet, 8 of the 9 Priority Pass cards bring 1 guest free: one line says so instead of 8 badges.
  const pp = best(cardsWithRules(R, ["priority-pass"]), ["priority-pass"], 1);
  assert.equal(pp.options.length, 9);
  assert.equal(pp.tied.length, 8);
});

test("guest cost: effects in words or structure, and no network fallback fees", () => {
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
  // Every unlock in the verified data reads as the change it describes.
  const effects = R.cards.flatMap((c) => c.access.flatMap((a) => a.unlocks.map((u) => `${c.cardId}:${a.network}=${JSON.stringify(parseEffect(u.effect))}`)));
  assert.deepEqual(effects, [
    'amex-platinum:centurion={"freeGuests":2}',
    'amex-platinum:delta-sky-club={"visits":"unlimited"}',
    'amex-business-platinum:centurion={"freeGuests":2}',
    'amex-business-platinum:delta-sky-club={"visits":"unlimited"}',
    'amex-delta-reserve:delta-sky-club={"visits":"unlimited"}',
    'united-club-infinite:united-club={"freeGuests":2}',
    "united-club-infinite:united-club={}",
    'united-club-infinite:star-alliance-lounges={"visits":"unlimited"}',
    'capital-one-venture-x:capital-one={"freeGuests":2}',
    'capital-one-venture-x-business:capital-one={"freeGuests":2}',
  ]);

  const data: LoungeGuestRulesData = {
    cards: [
      {
        cardId: "amex-platinum",
        access: [
          { network: "centurion", visits: "unlimited", conditions: null, freeGuests: 0, guestFeeUsd: null, unlocks: [], notes: null },
          { network: "escape", visits: "unlimited", conditions: null, freeGuests: null, guestFeeUsd: null, unlocks: [], notes: null },
        ],
        sources: [],
      },
    ],
    networkDefaults: [
      { network: "centurion", guestFeeUsd: 50, childGuestFeeUsd: 30, notes: null, sources: [] },
      { network: "escape", guestFeeUsd: 40, notes: null, sources: [] },
    ],
  };
  // A null fee means the issuer doesn't publish one: guests aren't priced at the network's usual fee.
  const o = optionFor(data.cards[0], data.cards[0].access[0], 2, new Set());
  assert.equal(o.costUsd, null);
  assert.equal(o.unpriced, "unpublished");
  assert.equal(o.childGuestFeeUsd, null, "nor at its child rate");
  assert.equal(guestCosts(data, ["amex-platinum"], ["centurion"], 2).best, null, "unpriceable guests sort last rather than looking free");
  const unknownAllowance = optionFor(data.cards[0], data.cards[0].access[1], 1, new Set());
  assert.equal(unknownAllowance.costUsd, null, "no confirmed allowance: not priced");
  assert.equal(unknownAllowance.unpriced, "unconfirmed");
  assert.ok(cardsWithRules(R, ["chase-sapphire"]).includes("chase-sapphire-reserve"));
});

// --- Data integrity ------------------------------------------------------------------------------------------------

/**
 * Access the issuers' pages list (verified November 2026) that shared/data/cards doesn't have yet. Remove an entry
 * once the card data adds it; any other gap fails.
 */
const NOT_IN_CARD_DATA_YET = [
  "amex-delta-reserve:escape",
  "chase-sapphire-reserve-business:air-canada-maple-leaf",
  "chase-sapphire-reserve:air-canada-maple-leaf",
  "united-club-infinite:star-alliance-lounges",
];

test("guest rules reference real cards and networks, with sources and dates", () => {
  assert.equal(R.cards.length, 13);
  assert.equal(R.networkDefaults.length, 16);
  const gaps: string[] = [];
  for (const c of R.cards) {
    const card = getCard(c.cardId);
    assert.ok(card, `card ${c.cardId}`);
    assert.ok(c.sources.length > 0 && c.sources.every((s) => s.startsWith("https://")), `${c.cardId} sources`);
    assert.match(c.asOf ?? "", /^\d{4}-\d{2}$/, `${c.cardId} asOf`);
    for (const a of c.access) {
      assert.ok(loungeNetworks[a.network], `${c.cardId}: network ${a.network}`);
      if (!card.loungeAccess.some((l) => l.network === a.network)) gaps.push(`${c.cardId}:${a.network}`);
      for (const u of a.unlocks) assert.ok(u.spendUsd > 0 && u.period, `${c.cardId} unlock`);
      for (const fee of [a.guestFeeUsd, a.childGuestFeeUsd ?? null]) assert.ok(fee === null || fee > 0, `${c.cardId} ${a.network} fee`);
    }
  }
  assert.deepEqual(gaps.sort(), NOT_IN_CARD_DATA_YET);
  // Every card with lounge access in the card data has guest rules.
  assert.deepEqual(
    cards.filter((c) => c.loungeAccess.length > 0).map((c) => c.id).sort(),
    R.cards.map((c) => c.cardId).sort(),
  );
  for (const d of R.networkDefaults) {
    assert.ok(loungeNetworks[d.network], d.network);
    assert.ok(d.sources.length > 0 && d.sources.every((s) => s.startsWith("https://")), `${d.network} default sources`);
  }
  // Lounge-specific rules: real networks, cards that reach them, lounges that exist, and sources.
  for (const l of R.locationRules ?? []) {
    const where = `${l.network} ${l.airports?.join("/") ?? l.loungeName}`;
    assert.ok(loungeNetworks[l.network], where);
    assert.ok(l.sources.length > 0 && l.notes.trim(), where);
    for (const id of [...l.cards, ...(l.notAdmitted ?? [])]) assert.ok(R.cards.find((c) => c.cardId === id)?.access.some((a) => a.network === l.network), `${where}: ${id}`);
    const here = lounges.filter((x) => x.network === l.network && (!l.airports || l.airports.includes(x.airportCode)) && (!l.loungeName || x.name.includes(l.loungeName)));
    assert.ok(here.length > 0, `${where} matches a lounge`);
  }
  for (const id of ["air-canada-maple-leaf", "star-alliance-lounges"] as LoungeNetwork[]) {
    const n = loungeNetworks[id];
    assert.ok(n.label && n.short && n.description && /^#[0-9a-f]{6}$/i.test(n.color), id);
  }
});

test("hotel data: real card ids, lower-earning exceptions, valuations for every program", () => {
  assert.equal(hotelEarning.chains.length, 4);
  for (const chain of hotelEarning.chains) {
    for (const c of chain.cards) if (c.cardId) assert.ok(getCard(c.cardId), `${chain.program}: ${c.cardId}`);
    const base = chain.basePerDollar;
    if (base !== null) for (const e of chain.brandExceptions) assert.ok(e.perDollar < base, `${chain.program} exception earns less`);
    for (const e of chain.eliteBonuses) assert.ok(e.percent === null || (e.percent > 0 && e.percent <= 200), `${chain.program} ${e.tier}`);
    assert.ok(V.some((v) => v.id === programId(chain.program)), `valuation for ${chain.program}`);
    assert.ok(chain.sources.length > 0 && /^\d{4}-\d{2}/.test(chain.asOf), chain.program);
  }
  assert.equal(V.length, 38);
  for (const v of V) {
    assert.ok(v.values.length > 0, v.id);
    assert.ok(v.low <= v.median && v.median <= v.high, v.id);
    const cents = v.values.map((x) => x.cents).sort((a, b) => a - b);
    const mid = cents.length % 2 ? cents[(cents.length - 1) / 2] : (cents[cents.length / 2 - 1] + cents[cents.length / 2]) / 2;
    near(v.median, mid, 1e-9, `${v.id} median`);
    assert.deepEqual([v.low, v.high], [cents[0], cents[cents.length - 1]], `${v.id} range`);
    for (const x of v.values) {
      assert.ok(x.via && valuations.editions[x.via], `${v.id}: ${x.source} edition`);
      assert.equal(x.url, valuations.editions[x.via!].url, `${v.id}: ${x.source} url`);
    }
  }
  // Programs no outlet values have no value at all, rather than an estimate.
  assert.deepEqual(valuations.missing.map((m) => m.id), ["eva-air-infinity-mileagelands", "tap-miles-and-go", "thai-royal-orchid-plus", "virgin-red"]);
  for (const m of valuations.missing) assert.ok(!V.some((v) => v.id === m.id), m.id);
});

test("baggage data: verified links, labelled candidates, and fees with sources", () => {
  assert.equal(baggage.airlines.length, 19);
  assert.equal(baggage.pendingAirlines.length, 110);
  const codes = [...baggage.airlines, ...baggage.pendingAirlines].map((a) => a.iata);
  assert.equal(new Set(codes).size, codes.length, "unique airline codes across both lists");
  for (const a of [...baggage.airlines, ...baggage.pendingAirlines]) {
    assert.match(a.iata, /^[A-Z0-9]{2}$/);
    assert.ok(a.alliance === null || ["oneworld", "Star Alliance", "SkyTeam"].includes(a.alliance), a.name);
  }
  for (const a of baggage.airlines) assert.match(a.baggageUrl, /^https:\/\//);
  const outlets = ["upgradedpoints.com", "www.nerdwallet.com", "thepointsguy.com"];
  const candidates = baggage.pendingAirlines.filter((a) => a.candidate);
  assert.equal(candidates.length, 16);
  for (const a of candidates) {
    const c = a.candidate!;
    assert.ok(["Upgraded Points", "NerdWallet"].includes(c.citedBy), a.name);
    assert.match(c.month, /^2026-(0[1-9]|1[0-2])$/, a.name);
    assert.match(c.url, /^https:\/\//, a.name);
    assert.ok(!outlets.includes(new URL(c.url).hostname), `${a.name}: the candidate is on the airline's own site`);
    assert.ok(outlets.includes(new URL(c.article).hostname) && a.sources.includes(c.article), `${a.name}: the citing article is a source`);
  }
  assert.equal(baggage.usDomestic.length, 10);
  for (const r of baggage.usDomestic) {
    assert.ok(r.airline.trim() && r.sources.length > 0, `domestic fee row ${r.airline}`);
    assert.ok(!r.iata || baggage.airlines.some((a) => a.iata === r.iata) || r.ceased, `${r.airline} has a verified link or stopped flying`);
  }
  assert.deepEqual(baggage.usDomestic.filter((r) => r.ceased).map((r) => [r.iata, r.ceased]), [["NK", "2026-05-02"]]);
  for (const f of [...baggage.standards, ...baggage.awardRules]) assert.ok(typeof f !== "string" && (f.sources?.length ?? 0) > 0, "facts carry sources");
});

test("entry data: official sources, confirmed links and the counts research delivered", () => {
  const { destinations, transitRules, recentChanges, plannedChanges } = entryRequirements;
  // The Schengen transit rule had no source, so it isn't shipped.
  assert.deepEqual([destinations.length, transitRules.length, recentChanges.length, plannedChanges.length], [74, 13, 15, 2]);
  // Every shipped record names its sources.
  for (const r of [...destinations, ...transitRules, ...recentChanges, ...plannedChanges]) {
    assert.ok(r.sources.length > 0 && r.sources.every((u) => /^https:\/\//.test(u)), `${r.country}: sources`);
  }
  const isos = destinations.map((d) => d.iso2).filter((c) => c !== null);
  assert.equal(new Set(isos).size, isos.length, "one entry per country");
  const official = new Set(["travel.state.gov", "www.gov.uk", "www.canada.ca"]);
  for (const d of destinations) {
    assert.ok(ENTRY_REQUIREMENTS.includes(d.requirement), d.country);
    if (d.iso2 !== null) assert.match(d.iso2, /^[A-Z]{2}$/, d.country);
    assert.ok(official.has(new URL(d.officialSource).hostname), `${d.country}: ${d.officialSource}`);
    assert.match(d.asOf, /^\d{4}-\d{2}(-\d{2})?$/, d.country);
    assert.ok(d.sources.length > 0 && d.confidence, d.country);
    for (const url of [d.authorization?.url, d.authorization?.applyUrl, d.arrivalForm?.url, d.requiredInsurance?.url, d.upcoming?.url]) {
      if (url) assert.match(url, /^https:\/\//, d.country);
    }
  }
  // Only the UK rests on its own government's rules; country pages point to the State Department's advisories index.
  assert.deepEqual(destinations.filter((d) => d.confidence === "high").map((d) => d.iso2), ["GB"]);
  assert.equal(destinations.filter((d) => d.officialSource === "https://travel.state.gov/en/international-travel/travel-advisories.html").length, 72);
  const schengen = destinations.find((d) => d.country === "Schengen Area")!;
  for (const d of destinations.filter((x) => x.schengen)) assert.ok(schengen.members?.includes(d.iso2!), `${d.country} is a member`);
  for (const c of recentChanges) assert.match(c.date, /^\d{4}-\d{2}(-\d{2})?$/);
  for (const t of transitRules) assert.ok(t.rule.trim(), t.country);
});

const DATA_FILES = {
  baggage: "baggage.ts",
  entryRequirements: "entry-requirements.ts",
  hotelEarning: "hotel-earning.ts",
  valuations: "valuations.ts",
  loungeGuestRules: "lounge-guest-rules.ts",
} as const;
const dataText = (file: string) => readFileSync(join(process.cwd(), "src/shared/data/travel", file), "utf8");

test("dataset status: SEED DATA headers match seed flags, and partial datasets say what's missing", () => {
  for (const [key, file] of Object.entries(DATA_FILES) as [keyof typeof DATA_FILES, string][]) {
    const text = dataText(file);
    const header = text.startsWith("// SEED DATA: replaced by verified research before release");
    const status = datasetStatus[key];
    assert.equal(header, status === "seed", `${file}: header and seed-status.ts agree`);
    if (typeof status === "object") assert.ok(status.partial.trim().length > 20, `${key}: says what's partial`);
    assert.ok(!/placeholder/i.test(text), `${file}: no placeholder text`);
  }
  // Baggage stays partly verified (110 airlines without a confirmed link); the rest are verified.
  assert.equal(typeof datasetStatus.baggage, "object");
  assert.deepEqual(
    (Object.keys(DATA_FILES) as (keyof typeof DATA_FILES)[]).filter((k) => datasetStatus[k] === "verified"),
    ["entryRequirements", "hotelEarning", "valuations", "loungeGuestRules"],
  );
  assert.deepEqual(datasetNotice(["entryRequirements", "hotelEarning"]), { seed: false, partial: [] });
});

/** Phrases from how research was done, which visitors shouldn't read: provenance goes in "How this was checked". */
const RESEARCH_WORDING = new RegExp(
  [
    "this session", "from here", "this environment", "\\bthe repo\\b", "repo's", "networks\\.ts", "stillMissing", "see rejected",
    "networkDefaults", "transitRules", "Leads confirmed", "new network id", "search results", "couldn'?t be checked",
    "could not be (?:checked|read)", "wasn'?t checked", "weren'?t checked", "\\bnot checked\\b", "snapshot", "candidate url",
    "second sighting", "sites checked", "when checked", "re-read", "re-checked", "november 2026 check", "certainty:",
    "readme", "previously in the directory", "drop or relabel", "gap-fill", "unreachable", "source code", "main branch",
    "smart-answers", "earlier evidence", "web search", "not opened", "\\bfetched\\b", "independently reports",
    "content item",
  ].join("|"),
  "i",
);

test("shipped data keeps research-process wording out of what visitors read", () => {
  for (const file of Object.values(DATA_FILES)) {
    // Addresses are links, not prose (a dataset's README.md is fine).
    const strings = [...dataText(file).matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]).filter((s) => !/^https?:\/\//.test(s));
    const hits = strings.filter((s) => RESEARCH_WORDING.test(s));
    assert.deepEqual(hits, [], file);
  }
  // Notes shown beside card terms are visitor words too.
  assert.deepEqual(CARD_TERM_CHECKS.map((c) => c.note ?? "").filter((n) => RESEARCH_WORDING.test(n)), []);
});

test("the travel tools' own text keeps research-process wording out too", () => {
  const files = [
    ...readdirSync(join(process.cwd(), "src/frontend/features/tools")).map((f) => `src/frontend/features/tools/${f}`),
    "src/frontend/features/lounges/guest-cost.tsx",
    "src/frontend/features/lounges/lounge-row.tsx",
    "src/frontend/features/start/start-wizard.tsx",
    "src/frontend/components/source-links.tsx",
    "src/shared/lib/guest-cost.ts",
    "src/shared/lib/entry-search.ts",
    "src/shared/lib/start-flows.ts",
  ];
  for (const file of files) {
    // Comments are for developers; strings, template text and JSX text are what visitors read.
    const code = readFileSync(join(process.cwd(), file), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
    const texts = [
      ...[...code.matchAll(/"((?:[^"\\\n]|\\.)*)"/g)].map((m) => m[1]),
      ...[...code.matchAll(/`((?:[^`\\]|\\.)*)`/g)].map((m) => m[1]),
      ...[...code.matchAll(/>([^<>{}]+)</g)].map((m) => m[1]),
    ].filter((t) => !/^https?:\/\//.test(t.trim()));
    const hits = texts.filter((t) => RESEARCH_WORDING.test(t));
    assert.deepEqual(hits, [], file);
  }
});

// --- Start here ----------------------------------------------------------------------------------------------------

/** Whether a link's page exists under src/app (dynamic segments like [code] match any value; route groups add none). */
function pageExists(href: string): boolean {
  const segments = href.split(/[?#]/)[0].split("/").filter(Boolean);
  const walk = (dir: string, i: number): boolean => {
    const dirs = readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
    if (dirs.some((d) => /^\(.+\)$/.test(d) && walk(join(dir, d), i))) return true;
    if (i === segments.length) return existsSync(join(dir, "page.tsx"));
    if (dirs.includes(segments[i]) && walk(join(dir, segments[i]), i + 1)) return true;
    return dirs.some((d) => /^\[[^.\]]+\]$/.test(d) && walk(join(dir, d), i + 1));
  };
  return walk(join(process.cwd(), "src/app"), 0);
}

test("links go only to pages that exist; pending sections are hidden until their routes land", () => {
  assert.ok(pageExists("/lounges/JFK") && pageExists("/cards/amex-platinum") && pageExists("/tools/baggage"));
  assert.ok(!pageExists("/nope") && !pageExists("/tools/nope"));
  // Once a pending route exists, take it off PENDING_ROUTES so its links (tiles, flows, sweet-spots buttons) show.
  for (const r of PENDING_ROUTES) assert.ok(!pageExists(r), `${r} exists now: remove it from PENDING_ROUTES in shared/lib/site-routes.ts`);
  for (const t of TOOLS) assert.ok(pageExists(t.href), `tool tile ${t.href}`);
  // Every section has landed: links to Points & Miles and the next-card page are live.
  assert.equal(routeLive("/points/sweet-spots?region=Japan"), true);
  assert.ok(pageExists("/points/sweet-spots") && pageExists("/next-card"));
});

test("start flows: 2–5 one-tap questions, each ending on pages that exist", () => {
  assert.deepEqual(START_FLOWS.map((f) => f.id), ["points", "card", "fee", "trip", "airport"]);
  // The points flow needs the Points & Miles pages.
  assert.deepEqual(LIVE_FLOWS.map((f) => f.id), START_FLOWS.filter((f) => !f.requires || pageExists(f.requires)).map((f) => f.id));
  assert.equal(flowById("points"), routeLive("/points") ? START_FLOWS[0] : null);
  const ctx = { wallet: [] };
  for (const flow of START_FLOWS) {
    assert.ok(flow.questions.length >= 2 && flow.questions.length <= 5, `${flow.id} question count`);
    // Answer every question with each option in turn (the rest with their first), so every result shape is built.
    const first: Record<string, string> = {};
    for (let q = nextQuestion(flow, first, ctx); q; q = nextQuestion(flow, first, ctx)) {
      const opts = q.options(ctx);
      assert.ok(opts.length >= 2, `${flow.id}.${q.id} has options`);
      assert.equal(new Set(opts.map((o) => o.value)).size, opts.length, `${flow.id}.${q.id} unique values`);
      first[q.id] = opts[0].value;
    }
    const n = activeQuestions(flow, first).length;
    assert.ok(n >= 2 && n <= 5, `${flow.id}: ${n} questions asked`);
    if (!LIVE_FLOWS.includes(flow)) continue;
    for (const q of flow.questions) {
      for (const o of q.options(ctx)) {
        const results = resultsFor(flow, { ...first, [q.id]: o.value }, ctx);
        assert.ok(results.length >= 1, `${flow.id} results with ${q.id}=${o.value}`);
        for (const r of results) assert.ok(pageExists(r.href), `${flow.id}: ${r.href} has no page`);
      }
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
  assert.ok(hrefs.includes("/points/sweet-spots?region=Japan&cabin=business&from=JFK"), "built, for when the page lands");
  const shown = resultsFor(trip, { from: "JFK", to: "HND", cabin: "business" }, { wallet: [] }).map((r) => r.href);
  assert.equal(shown.some((h) => h.startsWith("/points")), routeLive("/points/sweet-spots"));
  const card = START_FLOWS.find((f) => f.id === "card")!;
  const cardResults = resultsFor(card, { spend: "dining", fee: "400", travel: "often" }, { wallet: [] }).map((r) => r.href.split("?")[0]);
  assert.equal(cardResults.includes("/next-card"), routeLive("/next-card"));
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

test("entry search: common names and places find their country", () => {
  const { destinations } = entryRequirements;
  const key = (d: { iso2: string | null; country: string }) => d.iso2 ?? d.country;
  const names: Record<string, string> = { SI: "Slovenia", NL: "Netherlands", CZ: "Czechia" };
  const find = (q: string) => searchDestinations(destinations, q, key, (c) => names[c] ?? c);
  const codes = (q: string) => find(q).matching.map((d) => d.iso2 ?? d.country);
  for (const q of ["UK", "u.k.", "Britain", "Great Britain", "England", "Scotland", "Wales"]) assert.deepEqual(codes(q), ["GB"], q);
  assert.deepEqual(codes("Turkey"), ["TR"]);
  assert.deepEqual(codes("Czech Republic"), ["CZ"]);
  assert.deepEqual(codes("Holland"), ["NL"]);
  assert.deepEqual(codes("Viet Nam"), ["VN"]);
  assert.deepEqual(codes("St. Lucia"), ["LC"]);
  for (const [q, iso] of [["Dubai", "AE"], ["Abu Dhabi", "AE"], ["Bali", "ID"], ["Zanzibar", "TZ"]]) {
    const r = find(q);
    assert.deepEqual(r.matching.map((d) => d.iso2), [iso], q);
    assert.equal(r.via.get(iso), q, `${q} shows as "Includes ${q}"`);
  }
  // A Schengen country without its own row finds the Schengen Area entry.
  const slovenia = find("Slovenia");
  assert.deepEqual(slovenia.matching.map((d) => d.country), ["Schengen Area"]);
  assert.equal(slovenia.via.get("Schengen Area"), "Slovenia");
  assert.deepEqual(codes("Japan"), ["JP"]);
  assert.deepEqual(codes("jp"), ["JP"]);
  assert.deepEqual(codes("Atlantis"), []);
  // Two letters are a code or a short name, else the start of a name, never letters inside one: "US" isn't
  // Austria or Australia, while "ja" still finds Jamaica and Japan as you type.
  assert.deepEqual(codes("US"), []);
  assert.deepEqual(codes("au"), ["AU"]);
  assert.deepEqual(codes("ja"), ["JM", "JP"]);
  assert.deepEqual(codes("j"), ["JM", "JP", "JO"]);
  assert.deepEqual(codes("si"), ["Schengen Area"], "Slovenia's code finds its group");
  assert.deepEqual(codes("aus"), ["AU", "AT"], "three letters still search inside names");
  // U.S. places aren't "countries we're still adding": the page says this guide is for going abroad.
  assert.deepEqual(usPlaceFor("Hawaii"), { name: "Hawaii", kind: "state" });
  assert.deepEqual(usPlaceFor("puerto rico"), { name: "Puerto Rico", kind: "territory" });
  assert.equal(usPlaceFor("U.S.")?.kind, "country");
  assert.deepEqual(usPlaceFor("usa"), { name: "USA", kind: "country" });
  assert.equal(usPlaceFor("Japan"), null);
  assert.equal(usPlaceFor("haw"), null, "only a place named in full");
  for (const q of ["Hawaii", "Puerto Rico", "US", "United States"]) assert.deepEqual(codes(q), [], q);
  // Places with their own charges, which the guide doesn't cover, say so on the row they find.
  assert.match(PLACE_NOTES[find("Bali").via.get("ID")!] ?? "", /tourist levy/);
  assert.match(PLACE_NOTES[find("galapagos").via.get("EC")!] ?? "", /entry fees/);
  assert.equal(PLACE_NOTES[find("Dubai").via.get("AE")!], undefined);
  // Cuba's U.S.-law restriction shows on its row even when it's collapsed.
  assert.match(destinations.find((d) => d.iso2 === "CU")!.caution ?? "", /OFAC/);
});

test("source links and prose: readable dates, page names, linked addresses", () => {
  assert.equal(readableDates("from 2026-09-15, as of 2026-10, in 2026-2027"), "from Sep 15, 2026, as of Oct 2026, in 2026-2027");
  assert.equal(readableDates("see https://x.com/2026-10-11/a"), "see https://x.com/2026-10-11/a");
  const labels = sourceLabels([
    "https://creditcards.chase.com/travel-credit-cards/marriott-bonvoy/boundless",
    "https://creditcards.chase.com/travel-credit-cards/marriott-bonvoy/bold",
    "https://raw.githubusercontent.com/imorte/passport-index-data/main/passport-index.json",
    "https://travel.state.gov/en/international-travel/travel-advisories.html",
  ]);
  assert.deepEqual(labels, ["Chase · Boundless", "Chase · Bold", "Passport Index data (Feb 2026)", "travel.state.gov"]);
  const urls = Array.from(new Set(hotelEarning.chains.flatMap((c) => c.sources)));
  assert.equal(new Set(sourceLabels(urls)).size, urls.length, "labels tell links apart");
  // Pages whose address names them badly get explicit names; dates, running numbers and casing are fixed.
  assert.deepEqual(
    sourceLabels([
      "https://www.gov.uk/eta",
      "https://www.gov.uk/eta/apply",
      "https://www.gov.uk/government/publications/visa-regulations-revised-table/home-office-immigration-and-nationality-fees-8-october-2026",
      "https://www.gov.uk/government/publications/visa-regulations-revised-table/home-office-immigration-and-nationality-fees-21-october-2025",
      "https://www.gov.uk/eta/what-you-can-cannot-do",
      "https://www.gov.uk/foreign-travel-advice/south-korea/entry-requirements",
    ]),
    [
      "GOV.UK · ETA guide",
      "GOV.UK · Apply for an ETA",
      "GOV.UK · Home Office fees, Oct 2026",
      "GOV.UK · Home Office fees, Oct 2025",
      "GOV.UK · What an ETA covers",
      "GOV.UK · South Korea entry advice",
    ],
  );
  assert.deepEqual(
    sourceLabels([
      "https://www.oneworld.com/news/2025-06-30-oneworld-welcomes-oman-air",
      "https://www.oneworld.com/members",
      "https://www.allegiantair.com/baggage-1",
      "https://www.allegiantair.com/military-discount",
      "https://www.alaskaair.com/atmosrewards/content/club-49",
      "https://www.alaskaair.com/content/travel-info/baggage/checked-bags",
      "https://upgradedpoints.com/news/jetblue-checked-bag-fee-increase/",
      "https://upgradedpoints.com/news/x/",
      "https://thepointsguy.com/news/europes-new-ees-digital-border-system/",
      "https://thepointsguy.com/news/y/",
      "https://www.nbcdfw.com/news/local/southwest-becomes-the-latest-airline-to-increase-checked-bag-fees/4007913/",
    ]),
    [
      "oneworld.com · oneworld Welcomes Oman Air",
      "oneworld.com · Members",
      "Allegiant · Baggage",
      "Allegiant · Military Discount",
      "Alaska · Club 49",
      "Alaska · Checked Bags",
      "Upgraded Points · JetBlue Checked Bag Fee…",
      "Upgraded Points · X",
      "TPG · Europe's New EES Digital…",
      "TPG · Y",
      "NBC 5 Dallas-Fort Worth",
    ],
  );
  assert.equal(linkLabel("https://www.united.com/en/us/baggage-calculator/any-flights"), "United · bag fee calculator");
  assert.equal(linkLabel("https://www.united.com/en/us/fly/baggage/carry-on-bags.html"), "United · Carry-on Bags");
  // Files a visitor can't use link the page they belong to, once: GOV.UK's visa checker for its source files.
  const uk = entryRequirements.destinations.find((d) => d.iso2 === "GB")!;
  const visible = visitorSources(uk.sources);
  assert.ok(!visible.some((u) => u.includes("githubusercontent.com/alphagov")));
  assert.equal(visible.filter((u) => u === "https://www.gov.uk/check-uk-visa").length, 1);
  assert.deepEqual(visitorSources(["https://creditcards.chase.com/southwest/plus-credit-card", "https://creditcards.chase.com/travel-credit-cards/southwest/plus"]), [
    "https://creditcards.chase.com/travel-credit-cards/southwest/plus",
  ]);
  // No list the travel tools show numbers its links ("GOV.UK · ETA 2") or names one by a date ("2025 06 30").
  const lists: string[][] = [
    baggage.sources,
    ...baggage.airlines.map((a) => a.sources ?? []),
    ...baggage.pendingAirlines.map((a) => a.sources),
    ...baggage.usDomestic.map((r) => r.sources),
    ...[...baggage.standards, ...baggage.awardRules].map((f) => (typeof f === "string" ? [] : (f.sources ?? []))),
    ...entryRequirements.destinations.map((d) => d.sources),
    ...entryRequirements.transitRules.map((t) => t.sources),
    ...entryRequirements.recentChanges.map((c) => c.sources),
    ...entryRequirements.plannedChanges.map((c) => c.sources),
    ...hotelEarning.chains.map((c) => c.sources),
    ...R.cards.map((c) => c.sources),
    ...R.networkDefaults.map((d) => d.sources),
    ...(R.locationRules ?? []).map((l) => l.sources),
  ];
  for (const list of lists) {
    const shown = visitorSources(list);
    const labels = sourceLabels(shown);
    labels.forEach((l, i) => {
      assert.doesNotMatch(l, / \d$/, `${l} (${shown[i]})`);
      assert.doesNotMatch(l, /\b(?:19|20)\d{2} \d{1,2}\b/, `${l} (${shown[i]})`);
    });
    assert.equal(new Set(labels).size, labels.length, `labels tell apart ${shown.join(", ")}`);
  }
  assert.deepEqual(
    splitUrls("The hub, https://www.britishairways.com/content/information/baggage-essentials, is linked.").map((p) => p.url ?? null),
    [null, "https://www.britishairways.com/content/information/baggage-essentials", null],
  );
});

const noteText = (n: string | string[] | null | undefined) => (Array.isArray(n) ? n.join(" ") : (n ?? ""));

/**
 * Card terms in shared/data/cards that the travel research contradicts or couldn't confirm
 * (shared/data/travel/card-term-checks.ts), flagged to the card data's owner. When the card data is fixed this test
 * fails: remove the entry.
 */
test("card terms the research flags are tracked until the card data is fixed, and shown with the issuer's terms", () => {
  for (const c of CARD_TERM_CHECKS) {
    const card = getCard(c.cardId);
    assert.ok(card, c.cardId);
    const texts = c.where === "perks" ? card.perks : card.loungeAccess.filter((a) => a.network === c.where).map((a) => a.terms);
    assert.ok(texts.some((t) => c.clause.test(t)), `${c.cardId} (${c.where}) fixed: ${c.why} Remove it from CARD_TERM_CHECKS.`);
    assert.ok(c.why.trim() && c.sources.length > 0 && c.sources.every((u) => u.startsWith("https://")), `${c.cardId}: why and sources`);
    if (c.hide) assert.ok(c.note, `${c.cardId}: a hidden clause says what the issuer's terms say instead`);
  }
  // Every clause the review found is tracked, including the ones only listed for the card data's owner.
  const tracked = (id: string, where: string, text: RegExp) => CARD_TERM_CHECKS.some((c) => c.cardId === id && c.where === where && text.test(c.clause.source));
  for (const [id, where, text] of [
    ["chase-sapphire-reserve", "chase-sapphire", /\$27/],
    ["chase-sapphire-reserve-business", "chase-sapphire", /\$27/],
    ["chase-sapphire-reserve", "chase-sapphire", /children under 2/],
    ["chase-sapphire-reserve", "chase-sapphire", /5 hours early/],
    ["chase-sapphire-reserve", "chase-sapphire", /lost access/],
    ["amex-platinum", "escape", /guest fees apply/],
    ["amex-platinum", "airspace", /guest fees apply/],
    ["amex-platinum", "plaza-premium", /guest policy varies/],
    ["amex-platinum", "amex-international", /Sydney/],
    ["amex-platinum", "perks", /Lufthansa/],
    ["amex-business-platinum", "perks", /Lufthansa/],
    ["citi-aadvantage-executive", "admirals-club", /without guest privileges/],
    ["citi-strata-elite", "admirals-club", /primary cardholder only/],
    ["atmos-rewards-summit", "alaska-lounge", /day passes/],
    ["amex-delta-reserve", "perks", /First checked bag/],
    ["amex-delta-platinum", "perks", /First checked bag/],
  ] as [string, string, RegExp][]) assert.ok(tracked(id, where, text), `${id} ${where} ${text}`);

  // Contradicted clauses are left out where the tools show the card's terms, with the issuer's terms underneath.
  const sapphire = getCard("chase-sapphire-reserve")!.loungeAccess.find((a) => a.network === "chase-sapphire")!;
  const shown = checkTerms("chase-sapphire-reserve", "chase-sapphire", sapphire.terms);
  assert.doesNotMatch(shown.text, /\$27/);
  assert.match(shown.text, /^Unlimited Chase Sapphire Lounge by The Club access; 2 complimentary guests \(children under 2 free\)\. Up to 5 hours/);
  assert.equal(shown.notes.length, 2);
  assert.match(shown.notes[0], /publishes no fee/);
  const escape = getCard("amex-platinum")!.loungeAccess.find((a) => a.network === "escape")!;
  assert.deepEqual(checkTerms("amex-platinum", "escape", escape.terms), {
    text: "Cardmember access to Escape Lounges – The Centurion Studio Partner (US).",
    notes: ["Amex's terms give 2 complimentary guests per visit."],
    checks: CARD_TERM_CHECKS.filter((c) => c.cardId === "amex-platinum" && c.where === "escape"),
  });
  const exec = getCard("citi-aadvantage-executive")!.loungeAccess[0];
  assert.match(checkTerms("citi-aadvantage-executive", "admirals-club", exec.terms).text, /Authorized users get their own Admirals Club access\.$/);
  // Terms with nothing flagged pass through untouched.
  assert.deepEqual(checkTerms("amex-platinum", "centurion", "Unlimited visits."), { text: "Unlimited visits.", notes: [], checks: [] });
  // The Delta cards' bag perk gets the second free bag from the verified fee data.
  const deltaPerk = getCard("amex-delta-reserve")!.perks.find((p) => /checked bag/i.test(p))!;
  assert.match(checkTerms("amex-delta-reserve", "perks", deltaPerk).notes[0], /second bag free/);
  assert.match(noteText(baggage.usDomestic.find((r) => r.iata === "DL")!.exemptions), /Since June 4, 2026, the Basic Card Member on those cards also checks a second bag free/);
});

test("baggage search: a stopped airline is found by its code or name, never by 'air' or letters inside a word", () => {
  const spirit = { name: "Spirit Airlines", code: "NK" };
  for (const q of ["spirit", "Spirit Airlines", "spi", "SPIRIT", "NK", "nk", " spirit air "]) assert.ok(namesAirline(spirit, q), q);
  for (const q of ["air", "airline", "airlines", "lines", "it", "ri", "pir", "a", "", "irl"]) assert.ok(!namesAirline(spirit, q), q);
  assert.equal(possessive("Turkish Airlines"), "Turkish Airlines'");
  assert.equal(possessive("Delta"), "Delta's");
});

test("travel formatting needs no Date objects", () => {
  assert.equal(formatIsoDate("2026-11-24"), "Nov 24, 2026");
  assert.equal(formatIsoDate("2026-04"), "Apr 2026");
  assert.equal(formatIsoDate("soon"), "soon");
  assert.equal(feeText(25), "$25");
  assert.equal(feeText(80.9), "$80.90");
  assert.equal(feeText(0), "Free");
  assert.equal(feeText("£16"), "£16");
  assert.equal(feeText("Free for US citizens since 2026-05-25"), "Free for US citizens since May 25, 2026");
  assert.equal(feeText(null), "—");
});
