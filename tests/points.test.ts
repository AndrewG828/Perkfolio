import { test } from "node:test";
import assert from "node:assert/strict";
import { cards, getCard } from "../src/shared/data/cards";
import { airports, lounges } from "../src/shared/data/lounges";
import {
  ALLIANCES,
  BANK_CURRENCY_IDS,
  PROGRAM_IDS,
  REGIONS,
  airportPhotos,
  awardPrograms,
  bankCurrencies,
  loungePhotos,
  programIdFromName,
  programNames,
  regionPhotos,
  sweetSpots,
  transferPartners,
  type AwardProgram,
  type Photo,
  type ProgramId,
  type SweetSpot,
  type TransferPartner,
} from "../src/shared/data/points";
import {
  bankPointsFor,
  baselineCents,
  bestPartnerFor,
  centsPerPoint,
  classifyCard,
  currencyOfCard,
  judgeRedemption,
  partnerPointsFor,
  pointsData,
  ratioLabel,
  reachablePrograms,
  sweetSpotsFor,
  transferSpeedRank,
  walletPoints,
  type PointsData,
} from "../src/shared/lib/points";

const isIsoDate = (s: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
const isHttps = (s: string | undefined) => {
  try {
    return new URL(s ?? "").protocol === "https:";
  } catch {
    return false;
  }
};
const dupes = (xs: string[]) => xs.filter((x, i) => xs.indexOf(x) !== i);
const filled = (xs: unknown) => Array.isArray(xs) && xs.length > 0 && xs.every((x) => typeof x === "string" && x.trim() !== "");

// ------------------------------------------------------------------------------------------------- Data integrity

test("all six bank currencies have exactly one entry, with https sources and ISO dates", () => {
  assert.deepEqual([...bankCurrencies.map((c) => c.id)].sort(), [...BANK_CURRENCY_IDS].sort());
  for (const c of bankCurrencies) {
    assert.ok(c.name && c.shortName && c.issuer && c.earnedWith, c.id);
    assert.ok(isHttps(c.sourceUrl), `${c.id} sourceUrl`);
    assert.ok(isIsoDate(c.lastVerified), `${c.id} lastVerified`);
  }
});

test("programs use the fixed ids, once each, with valid fields", () => {
  const ids = awardPrograms.map((p) => p.id);
  assert.deepEqual(dupes(ids), []);
  for (const p of awardPrograms) {
    assert.ok((PROGRAM_IDS as readonly string[]).includes(p.id), `unknown program id ${p.id}`);
    assert.equal(p.kind, programNames[p.id].kind, `${p.id} kind`);
    assert.ok(["airline", "hotel"].includes(p.kind), p.id);
    assert.ok(["award chart", "distance-based", "dynamic", "hybrid"].includes(p.pricing), `${p.id} pricing`);
    if (p.alliance) {
      assert.ok((ALLIANCES as readonly string[]).includes(p.alliance), `${p.id} alliance`);
      assert.equal(p.kind, "airline", `${p.id}: only airlines join alliances`);
    }
    if (p.partnerSurcharges) assert.ok(["none", "low", "mixed", "high"].includes(p.partnerSurcharges), p.id);
    assert.ok(p.name && p.owner && p.currency && p.summary, p.id);
    assert.ok(filled(p.strengths) && filled(p.watchOuts), `${p.id} strengths/watch-outs`);
    if (p.perks) assert.ok(filled(p.perks), `${p.id} perks`);
    assert.ok(isHttps(p.officialUrl), `${p.id} officialUrl`);
    if (p.chartUrl !== undefined) assert.ok(isHttps(p.chartUrl), `${p.id} chartUrl`);
    assert.ok(isIsoDate(p.lastVerified), `${p.id} lastVerified`);
  }
});

test("transfers reference real currencies, programs and cards, with positive ratios", () => {
  const currencyIds = new Set<string>(bankCurrencies.map((c) => c.id));
  const programIds = new Set<string>(awardPrograms.map((p) => p.id));
  const keys = transferPartners.map((t) => `${t.currency}→${t.program}${t.cards ? `[${[...t.cards].sort().join(",")}]` : ""}`);
  assert.deepEqual(dupes(keys), []);
  for (const t of transferPartners) {
    const key = `${t.currency}→${t.program}`;
    assert.ok(currencyIds.has(t.currency), `${key}: unknown currency`);
    assert.ok(programIds.has(t.program), `${key}: unknown program`);
    for (const n of [t.from, t.to]) assert.ok(Number.isFinite(n) && n > 0, `${key}: ratio must be > 0`);
    if (t.minimum !== undefined) assert.ok(t.minimum > 0, `${key} minimum`);
    if (t.increment !== undefined) assert.ok(t.increment > 0, `${key} increment`);
    assert.ok(t.time.trim(), `${key} time`);
    if (t.cards) {
      assert.ok(t.cards.length > 0, `${key}: empty cards list`);
      for (const id of t.cards) {
        const card = getCard(id);
        assert.ok(card, `${key}: unknown card ${id}`);
        const p = currencyOfCard(card!);
        assert.ok(p?.kind === "currency" && p.currency === t.currency, `${key}: ${id} doesn't earn ${t.currency}`);
      }
    }
  }
});

test("sweet spots are valid: programs exist, regions and cabins make sense, sources are https", () => {
  const programIds = new Set<string>(awardPrograms.map((p) => p.id));
  assert.deepEqual(dupes(sweetSpots.map((s) => s.id)), []);
  for (const s of sweetSpots) {
    assert.match(s.id, /^[a-z0-9]+(-[a-z0-9]+)*$/, `${s.id} is kebab-case`);
    assert.ok(programIds.has(s.program), `${s.id}: unknown program ${s.program}`);
    assert.ok((REGIONS as readonly string[]).includes(s.from), `${s.id} from`);
    assert.ok((REGIONS as readonly string[]).includes(s.to), `${s.id} to`);
    if (s.kind === "flight") {
      assert.ok(s.cabin && ["economy", "premium economy", "business", "first"].includes(s.cabin), `${s.id} cabin`);
      assert.ok(s.per === "one-way" || s.per === "round-trip", `${s.id}: flights are priced one-way or round-trip`);
    } else {
      assert.equal(s.cabin, undefined, `${s.id}: hotels have no cabin`);
      assert.equal(s.per, "night", `${s.id}: hotels are priced per night`);
      assert.equal(s.from, s.to, `${s.id}: a hotel's from and to are the same region`);
      assert.equal(programNames[s.program].kind, "hotel", `${s.id}: hotel sweet spot in an airline program`);
    }
    assert.ok(Number.isInteger(s.points) && s.points > 0, `${s.id} points`);
    if (s.pointsMax !== undefined) assert.ok(s.pointsMax >= s.points, `${s.id} pointsMax`);
    assert.ok(["low", "moderate", "high"].includes(s.fees), `${s.id} fees`);
    assert.ok(s.title && s.howToBook, s.id);
    assert.ok(filled(s.operatedBy) && filled(s.destinations), `${s.id} operatedBy/destinations`);
    assert.ok(s.sources.length > 0 && s.sources.every(isHttps), `${s.id} sources`);
    assert.ok(isIsoDate(s.lastVerified), `${s.id} lastVerified`);
  }
});

test("photos are keyed by real regions, airports and lounges, and every one is credited", () => {
  const checkPhoto = (key: string, p: Photo | undefined) => {
    assert.ok(p, key);
    assert.match(p!.src, /^\/photos\/[\w./-]+\.(webp|jpe?g|png|avif)$/i, `${key} src`);
    assert.ok(p!.width > 0 && p!.height > 0, `${key} size`);
    assert.ok(p!.alt.trim() && p!.title.trim() && p!.author.trim() && p!.license.trim(), `${key} credit fields`);
    assert.ok(isHttps(p!.sourcePage), `${key} sourcePage`);
    if (p!.licenseUrl !== undefined) assert.ok(isHttps(p!.licenseUrl), `${key} licenseUrl`);
  };
  for (const [k, p] of Object.entries(regionPhotos)) {
    assert.ok((REGIONS as readonly string[]).includes(k), `unknown region ${k}`);
    checkPhoto(`region ${k}`, p);
  }
  const codes = new Set(airports.map((a) => a.code));
  for (const [k, p] of Object.entries(airportPhotos)) {
    assert.ok(codes.has(k), `unknown airport ${k}`);
    checkPhoto(`airport ${k}`, p);
  }
  const loungeIds = new Set(lounges.map((l) => l.id));
  for (const [k, p] of Object.entries(loungePhotos)) {
    assert.ok(loungeIds.has(k), `unknown lounge ${k}`);
    checkPhoto(`lounge ${k}`, p);
  }
});

test("every fixed program id has a name, and card partner names all map to programs", () => {
  assert.deepEqual(Object.keys(programNames).sort(), [...PROGRAM_IDS].sort());
  const unknown = cards.flatMap((c) => (c.transferPartners ?? []).filter((n) => !programIdFromName(n)).map((n) => `${c.id}: ${n}`));
  assert.deepEqual(unknown, []);
  assert.equal(programIdFromName("British Airways Avios"), "british-airways-club");
  assert.equal(programIdFromName("Turkish Miles&Smiles"), "turkish-miles-and-smiles");
  assert.equal(programIdFromName("Not A Program"), null);
});

// ---------------------------------------------------------------------------------------------------- Wallet logic

test("every card is classified on purpose", () => {
  const unclassified = cards.filter((c) => classifyCard(c).rule === "unclassified").map((c) => `${c.id} (${c.rewardsCurrency})`);
  assert.deepEqual(unclassified, [], "add these cards to LIMITED, CASH_ONLY or a pattern in shared/lib/points.ts");
  const expect: Record<string, string | null> = {
    "amex-platinum": "amex-mr",
    "chase-sapphire-preferred": "chase-ur",
    "chase-freedom-unlimited": "chase-ur (limited)",
    "chase-freedom-flex": "chase-ur (limited)",
    "capital-one-venture-x": "capital-one",
    "capital-one-savor": "capital-one (limited)",
    "citi-strata-premier": "citi-typ",
    "citi-double-cash": "citi-typ (limited)",
    "citi-custom-cash": "citi-typ (limited)",
    "bilt-palladium": "bilt",
    "wells-fargo-autograph-journey": "wells-fargo",
    "wells-fargo-active-cash": null,
    "amex-blue-cash-everyday": null,
    "united-quest": "program united-mileageplus",
    "amex-delta-reserve": "program delta-skymiles",
    "atmos-rewards-summit": "program atmos-rewards",
    "citi-aadvantage-executive": "program american-aadvantage",
    "southwest-priority": "program southwest-rapid-rewards",
    "world-of-hyatt": "program world-of-hyatt",
    "amex-marriott-brilliant": "program marriott-bonvoy",
    "amex-hilton-aspire": "program hilton-honors",
  };
  for (const [id, want] of Object.entries(expect)) {
    const p = currencyOfCard(getCard(id)!);
    const got = p === null ? null : p.kind === "program" ? `program ${p.program}` : `${p.currency}${p.limited ? " (limited)" : ""}`;
    assert.equal(got, want, id);
  }
  // Cash-back strings never fall through to "full transferable points".
  for (const c of cards.filter((c) => /^cash/i.test(c.rewardsCurrency))) {
    assert.ok(["limited", "cash-only"].includes(classifyCard(c).rule), c.id);
  }
});

const program = (id: ProgramId, kind: AwardProgram["kind"] = "airline"): AwardProgram => ({
  id,
  name: programNames[id].name,
  owner: "Test",
  kind,
  currency: "points",
  pricing: "award chart",
  summary: "Test",
  strengths: ["a"],
  watchOuts: ["b"],
  officialUrl: "https://example.com/",
  lastVerified: "2026-01-01",
});
const partner = (t: Omit<TransferPartner, "time"> & { time?: string }): TransferPartner => ({ time: "Instant", ...t });
const spot = (id: string, programId: ProgramId): SweetSpot => ({
  id,
  kind: "flight",
  program: programId,
  title: id,
  operatedBy: ["X"],
  from: "United States",
  to: "Europe",
  destinations: ["Paris"],
  cabin: "business",
  points: 50000,
  per: "one-way",
  fees: "low",
  howToBook: "x",
  sources: ["https://example.com/"],
  lastVerified: "2026-01-01",
});

const fixture: PointsData = {
  cards,
  currencies: bankCurrencies,
  programs: [program("air-canada-aeroplan"), program("emirates-skywards"), program("world-of-hyatt", "hotel"), program("finnair-plus")],
  partners: [
    partner({ currency: "amex-mr", program: "air-canada-aeroplan", from: 1, to: 1, time: "Up to 2 days" }),
    partner({ currency: "chase-ur", program: "air-canada-aeroplan", from: 1, to: 1 }),
    partner({ currency: "capital-one", program: "emirates-skywards", from: 2, to: 1.5 }),
    partner({ currency: "amex-mr", program: "emirates-skywards", from: 5, to: 4 }),
    partner({ currency: "chase-ur", program: "world-of-hyatt", from: 1, to: 1, cards: ["chase-sapphire-reserve"] }),
    partner({ currency: "chase-ur", program: "world-of-hyatt", from: 4, to: 3, cards: ["chase-sapphire-preferred"] }),
    partner({ currency: "citi-typ", program: "finnair-plus", from: 1, to: 0.5, cards: ["citi-double-cash"] }),
    partner({ currency: "citi-typ", program: "finnair-plus", from: 1, to: 1 }),
  ],
  sweetSpots: [
    spot("aeroplan-spot", "air-canada-aeroplan"),
    spot("emirates-spot", "emirates-skywards"),
    spot("finnair-spot", "finnair-plus"),
    spot("united-spot", "united-mileageplus"),
  ],
};

test("best ratio wins across currencies; ties go to the faster transfer", () => {
  const reach = new Map(reachablePrograms(["amex-platinum", "chase-sapphire-preferred", "capital-one-venture-x"], fixture).map((r) => [r.program, r]));
  const aeroplan = reach.get("air-canada-aeroplan")!;
  assert.equal(aeroplan.routes.length, 2);
  assert.equal(aeroplan.best?.currency, "chase-ur", "1:1 instant beats 1:1 in two days");
  const emirates = reach.get("emirates-skywards")!;
  assert.equal(emirates.best?.currency, "amex-mr", "5:4 (0.8) beats 2:1.5 (0.75)");
  assert.deepEqual(emirates.routes.map((r) => r.currency), ["amex-mr", "capital-one"]);
  assert.equal(reach.has("finnair-plus"), false);
});

test("card-specific ratios apply only with that card, and the best one is picked", () => {
  const hyatt = (ids: string[]) => reachablePrograms(ids, fixture).find((r) => r.program === "world-of-hyatt");
  assert.equal(hyatt(["chase-sapphire-preferred"])?.best?.ratio, 0.75);
  assert.equal(hyatt(["chase-sapphire-preferred", "chase-sapphire-reserve"])?.best?.ratio, 1);
  assert.equal(hyatt(["chase-ink-business-preferred"]), undefined, "no entry covers Ink Preferred in this fixture");
  // Without a wallet, a chart shows the general entry when there is one.
  assert.equal(bestPartnerFor("citi-typ", "finnair-plus", fixture)?.to, 1);
  assert.equal(bestPartnerFor("chase-ur", "world-of-hyatt", fixture)?.to, 1);
});

test("limited cards transfer only alongside a card that unlocks them", () => {
  const alone = walletPoints(["chase-freedom-unlimited"], fixture);
  assert.equal(alone.currencies[0].currency, "chase-ur");
  assert.equal(alone.currencies[0].transferable, false);
  assert.match(alone.currencies[0].limited?.note ?? "", /Sapphire/);
  assert.equal(reachablePrograms(["chase-freedom-unlimited"], fixture).length, 0);

  const paired = reachablePrograms(["chase-freedom-unlimited", "chase-sapphire-preferred"], fixture);
  const aeroplan = paired.find((r) => r.program === "air-canada-aeroplan")!;
  assert.deepEqual(aeroplan.best?.cards.map((c) => c.id), ["chase-sapphire-preferred", "chase-freedom-unlimited"]);
  assert.equal(walletPoints(["chase-freedom-unlimited", "chase-sapphire-preferred"], fixture).currencies[0].transferable, true);

  // A no-fee card's own reduced-ratio entry works alone; the full ratio needs a Strata card.
  assert.equal(reachablePrograms(["citi-double-cash"], fixture).find((r) => r.program === "finnair-plus")?.best?.ratio, 0.5);
  assert.equal(
    reachablePrograms(["citi-double-cash", "citi-strata-premier"], fixture).find((r) => r.program === "finnair-plus")?.best?.ratio,
    1,
  );
  assert.deepEqual(walletPoints(["wells-fargo-active-cash", "bogus-card"], fixture).cashOnly.map((c) => c.id), ["wells-fargo-active-cash"]);
});

test("co-brand cards reach their program directly, and sweet spots follow the wallet", () => {
  const united = reachablePrograms(["united-quest"], fixture);
  assert.deepEqual(united.map((r) => [r.program, r.direct.map((c) => c.id), r.best]), [["united-mileageplus", ["united-quest"], null]]);
  assert.deepEqual(sweetSpotsFor(["united-quest"], fixture).map((s) => s.spot.id), ["united-spot"]);
  assert.deepEqual(sweetSpotsFor(["amex-gold"], fixture).map((s) => s.spot.id), ["aeroplan-spot", "emirates-spot"]);
  assert.deepEqual(sweetSpotsFor([], fixture), []);
  // With the real dataset, every reachable sweet spot's program is reachable.
  const all = sweetSpotsFor(["amex-platinum", "chase-sapphire-preferred", "capital-one-venture-x"]);
  for (const { spot: s, reach } of all) assert.equal(s.program, reach.program);
  assert.ok(all.length <= pointsData.sweetSpots.length);
});

test("airlines come before hotels in reach lists", () => {
  const kinds = reachablePrograms(["chase-sapphire-reserve", "amex-platinum"], fixture).map((r) => r.kind);
  assert.deepEqual(kinds, [...kinds].sort((a, b) => Number(a === "hotel") - Number(b === "hotel")));
});

// ------------------------------------------------------------------------------------------------------ Calculator

test("cents per point and the deal verdict", () => {
  assert.equal(centsPerPoint(1200, 80, 60000)?.toFixed(4), "1.8667");
  assert.equal(centsPerPoint(100, 120, 10000), 0, "taxes above the cash price give no value, not a negative one");
  assert.equal(centsPerPoint(500, 0, 0), null);
  assert.equal(centsPerPoint(-1, 0, 1000), null);
  assert.equal(centsPerPoint(Number.NaN, 0, 1000), null);

  const at = (baselineCents: number) => judgeRedemption({ cashPrice: 1200, taxes: 80, points: 60000, baselineCents });
  assert.equal(at(1.2)?.verdict, "great");
  assert.equal(at(1.5)?.verdict, "good");
  assert.equal(at(2.2)?.verdict, "fair");
  assert.equal(at(2.4)?.verdict, "poor");
  assert.equal(Math.round(at(1.5)!.vsBaseline), 220);
  assert.equal(judgeRedemption({ cashPrice: 1200, taxes: 80, points: 60000, baselineCents: 0 }), null);
});

test("baseline values are the conservative card valuations", () => {
  const mr = cards.filter((c) => /membership rewards/i.test(c.rewardsCurrency)).map((c) => c.pointValueCents);
  assert.equal(baselineCents("amex-mr"), Math.min(...mr));
  // Freedom cards are valued as cash back (1¢); the Ultimate Rewards baseline ignores them.
  assert.ok((baselineCents("chase-ur") ?? 0) > 1);
  assert.equal(baselineCents("united-mileageplus"), getCard("united-quest")!.pointValueCents);
  assert.equal(baselineCents("air-canada-aeroplan"), null, "no card earns Aeroplan points directly");
});

test("transfer math: labels, amounts, minimums and increments, speed", () => {
  assert.equal(ratioLabel({ from: 1, to: 1 }), "1:1");
  assert.equal(ratioLabel({ from: 2, to: 1.5 }), "2:1.5");
  assert.equal(ratioLabel({ from: 1000, to: 800 }), "1:0.8");
  assert.equal(partnerPointsFor({ from: 2, to: 1.5 }, 1000), 750);
  assert.equal(bankPointsFor({ from: 2, to: 1.5, minimum: 1000, increment: 1000 }, 120000), 160000);
  assert.equal(bankPointsFor({ from: 1, to: 1, increment: 1000 }, 60500), 61000);
  assert.equal(bankPointsFor({ from: 1, to: 2, minimum: 1000 }, 500), 1000);
  const order = ["Instant", "Up to 24 hours", "1–2 days", "Up to 7 days", "Varies"].map(transferSpeedRank);
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
});
