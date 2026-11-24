import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { cards, getCard } from "../src/shared/data/cards";
import { airports, lounges } from "../src/shared/data/lounges";
import {
  ALLIANCES,
  BANK_CURRENCY_IDS,
  BOOKING_RULE_KEYS,
  PROGRAM_BRIDGES,
  PROGRAM_IDS,
  REGIONS,
  airportPhotos,
  allPhotos,
  airlinesBookableWith,
  awardPrograms,
  bankCurrencies,
  bookableAirlines,
  bookingRules,
  changeLogApplied,
  getAirline,
  hasProgramPage,
  hotelToAirline,
  hotelTransferRules,
  loungePhotos,
  partnerChanges,
  pointValues,
  programBookingNotes,
  programIdFromName,
  programList,
  programNames,
  programRef,
  regionPhotos,
  sweetSpots,
  transferBonuses,
  transferPartnerNames,
  transferPartners,
  unvaluedIds,
  whoCanBookCaveats,
  type AwardProgram,
  type Photo,
  type ProgramId,
  type SweetSpot,
  type TransferBonus,
  type TransferPartner,
} from "../src/shared/data/points";
import {
  bankPointsFor,
  bankPointsWithBonus,
  bestPartnerFor,
  bonusOn,
  bookingOptionsFor,
  cardPageValue,
  centsPerPoint,
  classifyCard,
  currencyOfCard,
  daysBetween,
  hotelMilesFor,
  hotelPointsFor,
  judgeRedemption,
  liveBonuses,
  milesPlan,
  partnerPointsFor,
  plannableTargets,
  pointsData,
  pointsDataOn,
  ratioLabel,
  reachablePrograms,
  sweetSpotsFor,
  transferSources,
  transferSpeedRank,
  trimCents,
  valueForWallet,
  valueRelation,
  valueSources,
  walletPoints,
  type PointsData,
} from "../src/shared/lib/points";

const isIsoDate = (s: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
const isMonthOrDate = (s: string) => isIsoDate(s) || /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
const isHttps = (s: string | undefined) => {
  try {
    return new URL(s ?? "").protocol === "https:";
  } catch {
    return false;
  }
};
const dupes = (xs: string[]) => xs.filter((x, i) => xs.indexOf(x) !== i);
const filled = (xs: unknown) => Array.isArray(xs) && xs.length > 0 && xs.every((x) => typeof x === "string" && x.trim() !== "");
const allHttps = (xs: string[]) => xs.length > 0 && xs.every(isHttps);
const isProgram = (id: string): id is ProgramId => (PROGRAM_IDS as readonly string[]).includes(id);
/** Research-process wording that must never reach the UI. */
const PROCESS =
  /not one of ours|this session|canonical list|new program id|stillMissing|gap-fill|this environment|SEED DATA|Placeholder|treat as weak|drop or relabel|\bPARTIAL\b|see rejected|can't be (reached|fetched)/i;

// ------------------------------------------------------------------------------------------------- Data integrity

test("data modules are generated from research: no seed markers or placeholder text", () => {
  const dir = join(__dirname, "../src/shared/data/points");
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".ts"))) {
    const text = readFileSync(join(dir, f), "utf8");
    assert.doesNotMatch(text, /SEED DATA|Placeholder/, f);
  }
});

test("all six bank currencies have exactly one entry, with https sources and ISO dates", () => {
  assert.deepEqual([...bankCurrencies.map((c) => c.id)].sort(), [...BANK_CURRENCY_IDS].sort());
  for (const c of bankCurrencies) {
    assert.ok(c.name && c.shortName && c.issuer && c.earnedWith, c.id);
    assert.ok(allHttps(c.sources), `${c.id} sources`);
    assert.ok(isIsoDate(c.lastVerified), `${c.id} lastVerified`);
  }
});

test("programs use the fixed ids, once each, with valid fields and sources", () => {
  const ids = awardPrograms.map((p) => p.id);
  assert.deepEqual(dupes(ids), []);
  assert.equal(awardPrograms.length, 36);
  for (const p of awardPrograms) {
    assert.ok(isProgram(p.id), `unknown program id ${p.id}`);
    assert.equal(p.kind, programNames[p.id].kind, `${p.id} kind`);
    assert.equal(p.name, programNames[p.id].name, `${p.id} uses the display name`);
    assert.ok(["award chart", "distance-based", "dynamic", "hybrid"].includes(p.pricing), `${p.id} pricing`);
    if (p.alliance) {
      assert.ok((ALLIANCES as readonly string[]).includes(p.alliance), `${p.id} alliance`);
      assert.equal(p.kind, "airline", `${p.id}: only airlines join alliances`);
    }
    if (p.partnerSurcharges) assert.ok(["none", "low", "mixed", "high"].includes(p.partnerSurcharges), p.id);
    assert.ok(p.name && p.owner && p.currency && p.summary, p.id);
    assert.ok(filled(p.strengths), `${p.id} strengths`);
    assert.ok(Array.isArray(p.watchOuts), `${p.id} watch-outs`);
    if (p.perks) assert.ok(filled(p.perks), `${p.id} perks`);
    assert.ok(isHttps(p.officialUrl), `${p.id} officialUrl`);
    if (p.chartUrl !== undefined) assert.ok(isHttps(p.chartUrl), `${p.id} chartUrl`);
    assert.ok(allHttps(p.sources), `${p.id} sources`);
    assert.ok(isIsoDate(p.lastVerified), `${p.id} lastVerified`);
  }
});

test("every program with a guide or a transfer has a page; programs without a guide still render", () => {
  const listed = new Set(programList.map((p) => p.id));
  for (const p of awardPrograms) assert.ok(listed.has(p.id), p.id);
  for (const t of transferPartners) assert.ok(hasProgramPage(t.program), `${t.program} has no page`);
  const copa = programRef("copa-connectmiles");
  assert.equal(copa.guide, undefined, "Copa has no researched guide");
  assert.equal(copa.name, "Copa ConnectMiles");
  assert.equal(copa.alliance, "Star Alliance", "alliance comes from the airline that runs it");
  assert.ok(hasProgramPage("copa-connectmiles"));
  assert.equal(hasProgramPage("not-a-program"), false);
});

test("transfers reference real currencies, programs and cards, with positive ratios and https sources", () => {
  const currencyIds = new Set<string>(bankCurrencies.map((c) => c.id));
  const keys = transferPartners.map((t) => `${t.currency}→${t.program}${t.cards ? `[${[...t.cards].sort().join(",")}]` : ""}`);
  assert.deepEqual(dupes(keys), []);
  for (const t of transferPartners) {
    const key = `${t.currency}→${t.program}`;
    assert.ok(currencyIds.has(t.currency), `${key}: unknown currency`);
    assert.ok(isProgram(t.program), `${key}: unknown program`);
    for (const n of [t.from, t.to]) assert.ok(Number.isFinite(n) && n > 0, `${key}: ratio must be > 0`);
    if (t.minimum !== undefined) assert.ok(t.minimum > 0, `${key} minimum`);
    if (t.increment !== undefined) assert.ok(t.increment > 0, `${key} increment`);
    // An unconfirmed time is left out (shown as "not confirmed"), never stored as text.
    if (t.time !== undefined) assert.ok(t.time.trim() && !/not confirmed|not verified/i.test(t.time), `${key} time`);
    assert.ok(allHttps(t.sources), `${key} sources`);
    if (t.changedOn) assert.ok(isIsoDate(t.changedOn), `${key} changedOn`);
    if (t.note) assert.doesNotMatch(t.note, PROCESS, `${key} note`);
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
  // A pair with several ratios says which cards get which.
  const pairs = new Map<string, TransferPartner[]>();
  for (const t of transferPartners) pairs.set(`${t.currency}>${t.program}`, [...(pairs.get(`${t.currency}>${t.program}`) ?? []), t]);
  for (const [pair, list] of pairs) if (list.length > 1) assert.ok(list.every((t) => t.cards), `${pair}: every ratio needs a card list`);
  // Copa is a researched Capital One partner at 2:1.5.
  const copa = transferPartners.find((t) => t.currency === "capital-one" && t.program === "copa-connectmiles");
  assert.deepEqual([copa?.from, copa?.to], [2, 1.5]);
});

test("the partner list follows the dated partner-change log", { skip: !changeLogApplied && "imported with --no-change-log" }, () => {
  const has = (currency: string, program: string) => transferPartners.some((t) => t.currency === currency && t.program === program);
  // Every in-effect removal of a covered program is gone from the list...
  for (const c of partnerChanges.filter((c) => c.status === "in effect" && c.change === "removed" && c.program && isProgram(c.program))) {
    const later = partnerChanges.some((x) => x.currency === c.currency && x.program === c.program && x.date > c.date && x.status === "in effect");
    if (!later) assert.equal(has(c.currency, c.program!), false, `${c.currency} → ${c.program} was removed on ${c.date}`);
  }
  // ...and every in-effect addition is on it.
  for (const c of partnerChanges.filter((c) => c.status === "in effect" && c.change === "added" && c.program && isProgram(c.program) && !c.cards)) {
    assert.ok(has(c.currency, c.program!), `${c.currency} → ${c.program} was added on ${c.date}`);
  }
  // Rows that come from the log carry its date and sources.
  for (const t of transferPartners.filter((t) => t.changedOn)) assert.ok(partnerChanges.some((c) => c.date === t.changedOn && c.currency === t.currency));
});

test("sweet spots are valid: programs have guides, regions and cabins make sense, sources are https", () => {
  const programIds = new Set<string>(awardPrograms.map((p) => p.id));
  assert.deepEqual(dupes(sweetSpots.map((s) => s.id)), []);
  assert.ok(sweetSpots.length > 0);
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
    assert.ok(allHttps(s.sources), `${s.id} sources`);
    assert.ok(isIsoDate(s.lastVerified), `${s.id} lastVerified`);
  }
});

test("featured order mixes programs and destinations up front", () => {
  const first = sweetSpots.slice(0, 3);
  assert.equal(new Set(first.map((s) => s.program)).size, 3, "the hub's three sweet spots come from three programs");
  assert.equal(new Set(first.map((s) => s.to)).size, 3, "...and go to three regions");
  for (let i = 1; i < sweetSpots.length; i++) {
    const [a, b] = [sweetSpots[i - 1], sweetSpots[i]];
    assert.ok(!(a.program === b.program && a.to === b.to), `${a.id} and ${b.id} are back to back`);
  }
});

test("photos are keyed by real regions, airports and lounges, credited, and openly licensed", () => {
  const checkPhoto = (key: string, p: Photo | undefined) => {
    assert.ok(p, key);
    assert.match(p!.src, /^\/photos\/[\w./-]+\.(webp|jpe?g|png|avif)$/i, `${key} src`);
    assert.ok(p!.width > 0 && p!.height > 0, `${key} size`);
    assert.ok(p!.alt.trim() && p!.title.trim() && p!.author.trim() && p!.license.trim(), `${key} credit fields`);
    assert.match(p!.license, /^(cc0|public domain|pd|cc[- ]by(-sa)?[- ]\d)/i, `${key} license`);
    assert.doesNotMatch(p!.license, /\b(nc|nd)\b/i, `${key} license`);
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

test("booking rules: airline programs, one entry each; every rule is text or null (unknown)", () => {
  assert.deepEqual(dupes(bookingRules.map((r) => r.program)), []);
  assert.ok(bookingRules.length >= 20);
  for (const r of bookingRules) {
    assert.ok(isProgram(r.program) && programNames[r.program].kind === "airline", r.program);
    for (const k of BOOKING_RULE_KEYS) {
      const v = r[k];
      if (k === "bookingWindowDays") assert.ok(v === null || (Number.isInteger(v) && (v as number) > 0), `${r.program} window`);
      else assert.ok(v === null || (typeof v === "string" && v.trim() !== ""), `${r.program} ${k}`);
    }
    assert.ok(isMonthOrDate(r.asOf), `${r.program} asOf`);
    assert.ok(allHttps(r.sources), `${r.program} sources`);
  }
  // Some rules are genuinely unknown, and they stay null rather than empty strings.
  assert.ok(bookingRules.some((r) => r.holds === null));
});

test("who can book: real programs and airlines, unique codes, no research-process wording", () => {
  // 63 researched airlines, plus the ones flight sweet spots book that the research left out (Condor, STARLUX).
  assert.ok(bookableAirlines.length >= 63);
  assert.deepEqual(dupes(bookableAirlines.map((a) => a.iata)), []);
  for (const a of bookableAirlines) {
    assert.match(a.iata, /^[A-Z0-9]{2}$/, a.name);
    assert.ok(a.bookableWith.length > 0 && a.bookableWith.every(isProgram), `${a.iata} programs`);
    if (a.ownProgram) assert.ok(a.bookableWith.includes(a.ownProgram), `${a.iata}: its own program books it`);
    if (a.alliance) assert.ok((ALLIANCES as readonly string[]).includes(a.alliance), `${a.iata} alliance`);
    assert.ok(isMonthOrDate(a.asOf) && allHttps(a.sources), a.iata);
    for (const t of [a.restrictions, a.notes]) if (t) assert.doesNotMatch(t, PROCESS, `${a.iata}: ${t}`);
  }
  for (const n of programBookingNotes) {
    assert.ok(isProgram(n.program), n.program);
    assert.doesNotMatch(n.notes, PROCESS, n.program);
  }
  // The research's caveats reach readers in plain words (no program ids, no "alliance rule" jargon).
  assert.ok(whoCanBookCaveats.length > 0);
  for (const c of whoCanBookCaveats) {
    assert.doesNotMatch(c, PROCESS, c);
    for (const id of PROGRAM_IDS) assert.equal(c.includes(id), false, `program id ${id} in: ${c}`);
    assert.doesNotMatch(c, /alliance rule/i, c);
  }
  // Caveats the research attached to alliance-based listings are kept, reworded.
  assert.match(getAirline("WY")?.notes ?? "", /oneworld membership; each one's Oman Air coverage wasn't checked/);
  assert.ok(programBookingNotes.some((n) => n.program === "copa-connectmiles"), "Copa's note survives without its process preface");
});

/** "LATAM Airlines" and "LATAM" → "latam" (the importer matches sweet-spot operators the same way). */
const airlineKey = (name: string) =>
  name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(?:airlines?|airways|air lines)\b/g, "")
    .replace(/[^a-z0-9]/g, "");

test("who can book never contradicts a sweet spot: every flight's operator lists the sweet spot's program", () => {
  const missing: string[] = [];
  for (const s of sweetSpots.filter((x) => x.kind === "flight")) {
    for (const op of s.operatedBy) {
      const a = bookableAirlines.find((x) => airlineKey(x.name) === airlineKey(op));
      if (!a) missing.push(`${s.id}: ${op} isn't in who-can-book`);
      else if (!a.bookableWith.includes(s.program)) missing.push(`${s.id}: ${op} (${a.iata}) doesn't list ${s.program}`);
    }
  }
  assert.deepEqual(missing, []);
  assert.ok(getAirline("LA")?.bookableWith.includes("virgin-atlantic-flying-club"), "Flying Club books LATAM");
  assert.ok(getAirline("EI")?.bookableWith.includes("atmos-rewards"), "Atmos books Aer Lingus");
  assert.deepEqual(getAirline("DE")?.bookableWith.sort(), ["atmos-rewards", "jetblue-trueblue"]);
  assert.deepEqual(getAirline("JX")?.bookableWith, ["atmos-rewards"]);
  // Virgin Red is listed wherever Flying Club is (it books through Flying Club).
  for (const a of bookableAirlines) if (a.bookableWith.includes("virgin-atlantic-flying-club")) assert.ok(a.bookableWith.includes("virgin-red"), a.iata);
});

test("valuations: real ids, consistent ranges, nothing invented for unvalued ids", () => {
  assert.deepEqual(dupes(pointValues.map((v) => v.id)), []);
  for (const v of pointValues) {
    assert.ok(isProgram(v.id) || (BANK_CURRENCY_IDS as readonly string[]).includes(v.id), v.id);
    const cents = v.values.map((o) => o.cents);
    assert.ok(cents.every((c) => c > 0), v.id);
    assert.equal(v.low, Math.min(...cents), `${v.id} low`);
    assert.equal(v.high, Math.max(...cents), `${v.id} high`);
    assert.ok(v.median >= v.low && v.median <= v.high, `${v.id} median`);
    for (const o of v.values) assert.ok(o.outlet && isHttps(o.url) && isMonthOrDate(o.asOf), `${v.id} ${o.outlet}`);
  }
  for (const id of unvaluedIds) assert.equal(pointValues.some((v) => v.id === id), false, `${id} must not have a value`);
  for (const id of BANK_CURRENCY_IDS) assert.ok(pointValues.some((v) => v.id === id), `${id} has a value`);
  assert.equal(pointValues.some((v) => v.id === "copa-connectmiles"), false);
  // The calculator offers exactly the valued ids, at their median.
  const sources = valueSources();
  assert.equal(sources.length, pointValues.length);
  for (const id of unvaluedIds) assert.equal(sources.some((s) => s.id === id), false);
  assert.equal(sources.find((s) => s.id === "amex-mr")?.cents, pointValues.find((v) => v.id === "amex-mr")?.median);
});

test("hotel conversions, bonuses and the change log reference real ids", () => {
  for (const r of hotelToAirline) {
    assert.equal(programNames[r.from].kind, "hotel", `${r.from} is a hotel program`);
    assert.ok(r.fromPoints > 0 && r.toMiles > 0 && r.programName.trim(), `${r.from} → ${r.program}`);
    if (isProgram(r.program)) assert.equal(programNames[r.program].kind, "airline", r.program);
    assert.ok(isIsoDate(r.asOf) && allHttps(r.sources), `${r.from} → ${r.program}`);
  }
  for (const r of hotelTransferRules) assert.ok(programNames[r.from].kind === "hotel" && r.rule.trim() && !PROCESS.test(r.rule), r.from);
  for (const b of transferBonuses) {
    const key = `${b.currency} → ${b.program}`;
    assert.ok(isProgram(b.program) && isIsoDate(b.starts) && isIsoDate(b.ends) && b.starts <= b.ends, key);
    assert.ok(b.from > 0 && b.to > 0 && b.bonusPercent > 0 && allHttps(b.sources), key);
    for (const id of b.cards ?? []) assert.ok(getCard(id), `${key}: unknown card ${id}`);
    // The boosted ratio is the usual ratio plus the bonus.
    const usual = bestPartnerFor(b.currency, b.program);
    assert.ok(usual, `${key}: no usual transfer`);
    const expected = (usual!.to / usual!.from) * (1 + b.bonusPercent / 100);
    assert.ok(Math.abs(b.to / b.from - expected) / expected < 0.005, `${key}: ${b.to / b.from} vs ${expected}`);
  }
  const dates = partnerChanges.map((c) => c.date);
  assert.deepEqual(dates, [...dates].sort().reverse(), "newest first");
  for (const c of partnerChanges) {
    assert.ok(isIsoDate(c.date) && c.programName && c.detail && allHttps(c.sources), `${c.date} ${c.currency}`);
    assert.ok(["added", "removed", "ratio changed", "access expanded"].includes(c.change), c.change);
    assert.ok(["in effect", "scheduled", "ended"].includes(c.status), c.status);
    assert.doesNotMatch(c.detail, PROCESS, `${c.date} ${c.currency}`);
  }
});

test("every fixed program id has a name, and card partner lists come from the structured data", () => {
  assert.deepEqual(Object.keys(programNames).sort(), [...PROGRAM_IDS].sort());
  const unknown = cards.flatMap((c) => (c.transferPartners ?? []).filter((n) => !programIdFromName(n)).map((n) => `${c.id}: ${n}`));
  assert.deepEqual(unknown, []);
  assert.equal(programIdFromName("British Airways Avios"), "british-airways-club");
  assert.equal(programIdFromName("Turkish Miles&Smiles"), "turkish-miles-and-smiles");
  assert.equal(programIdFromName("Not A Program"), null);

  // Each card that fully earns a bank currency lists exactly the programs its points can reach.
  for (const c of cards) {
    const p = currencyOfCard(c);
    if (p?.kind !== "currency" || p.limited) continue;
    const expected = new Set(transferPartners.filter((t) => t.currency === p.currency && (!t.cards || t.cards.includes(c.id))).map((t) => t.program));
    assert.deepEqual(new Set((c.transferPartners ?? []).map((n) => programIdFromName(n))), expected, c.id);
    assert.deepEqual(c.transferPartners, transferPartnerNames(p.currency, c.id), c.id);
  }
  const names = (id: string) => getCard(id)!.transferPartners ?? [];
  assert.ok(names("amex-platinum").includes("Aeromexico Rewards"));
  for (const n of ["Aeromexico Rewards", "Qatar Airways Privilege Club", "Japan Airlines Mileage Bank", "Copa ConnectMiles", "JetBlue TrueBlue", "I Prefer Hotel Rewards"])
    assert.ok(names("capital-one-venture-x").includes(n), `Venture X: ${n}`);
  assert.ok(names("chase-sapphire-reserve").includes("World of Hyatt"));
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
  sources: ["https://example.com/"],
  lastVerified: "2026-01-01",
});
const partner = (t: Omit<TransferPartner, "sources"> & { sources?: string[] }): TransferPartner => ({ sources: ["https://example.com/"], ...t });
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
  ...pointsData,
  programs: [program("air-canada-aeroplan"), program("emirates-skywards"), program("world-of-hyatt", "hotel"), program("finnair-plus")],
  partners: [
    partner({ currency: "amex-mr", program: "air-canada-aeroplan", from: 1, to: 1, time: "Up to 2 days" }),
    partner({ currency: "chase-ur", program: "air-canada-aeroplan", from: 1, to: 1, time: "Instant" }),
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

test("best ratio wins across currencies; ties go to the faster (or confirmed) transfer", () => {
  const reach = new Map(reachablePrograms(["amex-platinum", "chase-sapphire-preferred", "capital-one-venture-x"], fixture).map((r) => [r.program, r]));
  const aeroplan = reach.get("air-canada-aeroplan")!;
  assert.equal(aeroplan.routes.length, 2);
  assert.equal(aeroplan.best?.currency, "chase-ur", "1:1 instant beats 1:1 in two days");
  const emirates = reach.get("emirates-skywards")!;
  assert.equal(emirates.best?.currency, "amex-mr", "5:4 (0.8) beats 2:1.5 (0.75)");
  assert.deepEqual(emirates.routes.map((r) => r.currency), ["amex-mr", "capital-one"]);
  assert.equal(reach.has("finnair-plus"), false);
});

test("card-specific ratios: Chase to Hyatt is 1:1 with Sapphire Reserve, 4:3 with Sapphire Preferred and Ink Preferred", () => {
  const hyatt = (ids: string[]) => reachablePrograms(ids).find((r) => r.program === "world-of-hyatt");
  assert.equal(hyatt(["chase-sapphire-reserve"])?.best?.ratio, 1);
  assert.equal(hyatt(["chase-sapphire-reserve-business"])?.best?.ratio, 1);
  assert.equal(hyatt(["chase-sapphire-preferred"])?.best?.ratio, 0.75);
  assert.equal(hyatt(["chase-ink-business-preferred"])?.best?.ratio, 0.75);
  assert.equal(hyatt(["chase-sapphire-preferred", "chase-sapphire-reserve"])?.best?.ratio, 1, "the best card's ratio wins");
  assert.equal(hyatt(["chase-freedom-unlimited"]), undefined, "Freedom points need a Sapphire or Ink Preferred card");
  const pooled = hyatt(["chase-freedom-unlimited", "chase-sapphire-preferred"]);
  assert.equal(pooled?.best?.ratio, 0.75);
  assert.deepEqual(pooled?.best?.cards.map((c) => c.id), ["chase-sapphire-preferred", "chase-freedom-unlimited"]);
  // Bilt's 1:1 beats Chase's 4:3 for a wallet with both.
  assert.equal(hyatt(["chase-sapphire-preferred", "bilt-blue"])?.best?.currency, "bilt");
  // Without a wallet a chart shows a general entry when there is one, else the best card-specific one.
  assert.equal(bestPartnerFor("chase-ur", "world-of-hyatt")?.to, 1);
  assert.equal(bestPartnerFor("citi-typ", "finnair-plus", fixture)?.to, 1);
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
  const all = sweetSpotsFor(["amex-platinum", "chase-sapphire-preferred", "capital-one-venture-x"]);
  for (const { spot: s, reach } of all) assert.equal(s.program, reach.program);
  assert.ok(all.length <= pointsData.sweetSpots.length);
});

test("airlines come before hotels in reach lists", () => {
  const kinds = reachablePrograms(["chase-sapphire-reserve", "amex-platinum"]).map((r) => r.kind);
  assert.deepEqual(kinds, [...kinds].sort((a, b) => Number(a === "hotel") - Number(b === "hotel")));
});

// --------------------------------------------------------------------------------------------------- Bonuses

const bonus = (b: Partial<TransferBonus>): TransferBonus => ({
  currency: "amex-mr",
  program: "air-canada-aeroplan",
  bonusPercent: 30,
  from: 1,
  to: 1.3,
  starts: "2026-11-01",
  startsBasis: "stated",
  ends: "2026-11-30",
  targeted: false,
  sources: ["https://example.com/"],
  ...b,
});

test("transfer bonuses disappear after their end date and count the days left", () => {
  const data = {
    bonuses: [
      bonus({ ends: "2026-11-24" }),
      bonus({ program: "british-airways-club", ends: "2026-11-23" }),
      bonus({ program: "emirates-skywards", starts: "2026-12-01", ends: "2026-12-31" }),
      bonus({ currency: "chase-ur", ends: "2026-12-01" }),
    ],
  };
  const live = liveBonuses("2026-11-24", data);
  assert.deepEqual(
    live.map((b) => [b.bonus.currency, b.bonus.program, b.daysLeft, b.started]),
    [
      ["amex-mr", "air-canada-aeroplan", 0, true],
      ["chase-ur", "air-canada-aeroplan", 7, true],
      ["amex-mr", "emirates-skywards", 37, false],
    ],
    "the bonus that ended yesterday is gone, one ending today stays, an upcoming one comes last",
  );
  assert.equal(liveBonuses("2026-11-25", data).some((b) => b.bonus.program === "air-canada-aeroplan" && b.bonus.currency === "amex-mr"), false);
  assert.equal(bonusOn("amex-mr", "emirates-skywards", "2026-11-24", data), undefined, "not started yet");
  assert.equal(bonusOn("amex-mr", "emirates-skywards", "2026-12-01", data)?.program, "emirates-skywards");
  assert.equal(daysBetween("2026-11-24", "2026-12-01"), 7);
  assert.equal(daysBetween("2026-12-31", "2027-01-01"), 1);
  // The real list: all running on Nov 24, 2026; none left after the last one ends.
  const last = [...transferBonuses].sort((a, b) => b.ends.localeCompare(a.ends))[0].ends;
  assert.equal(liveBonuses("2026-11-24").length, transferBonuses.filter((b) => b.ends >= "2026-11-24").length);
  assert.equal(liveBonuses(`${Number(last.slice(0, 4)) + 1}-01-01`).length, 0);
});

// ----------------------------------------------------------------------------------------- "I need miles" planner

test("hotel conversions: Marriott's 60,000-point bonus and minimums", () => {
  const marriott = { fromPoints: 3, toMiles: 1, bonusMilesPer60k: 5000 };
  assert.equal(hotelMilesFor(marriott, 60_000), 25_000);
  assert.equal(hotelMilesFor(marriott, 120_000), 50_000);
  assert.equal(hotelPointsFor(marriott, 25_000), 60_000);
  assert.equal(hotelPointsFor(marriott, 21_000), 60_000, "a 60,000-point block beats 63,000 points at 3:1");
  assert.equal(hotelPointsFor(marriott, 26_000), 63_000, "one block plus 1,000 miles at 3:1");
  assert.equal(hotelPointsFor({ fromPoints: 3, toMiles: 1, bonusMilesPer60k: 0 }, 20_000), 60_000, "no bonus: straight 3:1");
  assert.equal(hotelPointsFor({ fromPoints: 5, toMiles: 1, minimum: 5000 }, 500), 5000, "the minimum applies");
});

test("two-step routes: direct transfers first, then bank → hotel → airline", () => {
  const plan = milesPlan("united-mileageplus", 60_000, { cardIds: ["amex-platinum"], today: "2026-11-24" });
  // Amex doesn't transfer to United; Chase and Bilt do, 1:1.
  assert.deepEqual(plan.direct.map((r) => [r.currency, r.bankPoints]).sort(), [["bilt", 60_000], ["chase-ur", 60_000]]);
  assert.ok(plan.direct.every((r) => r.cards.length === 0), "the Platinum card can't make a direct transfer");
  assert.ok(plan.viaHotel.length > 0 && plan.viaHotel.every((r) => r.kind === "via-hotel" && r.hotel));
  // Amex → Marriott 1:1 → United at 3:1 plus 10,000 per 60,000: 120,000 Marriott points.
  const viaMarriott = plan.viaHotel.find((r) => r.currency === "amex-mr" && r.hotel!.row.from === "marriott-bonvoy")!;
  assert.equal(viaMarriott.hotel!.points, 120_000);
  assert.equal(viaMarriott.bankPoints, 120_000);
  assert.ok(hotelMilesFor(viaMarriott.hotel!.row, viaMarriott.hotel!.points) >= 60_000);
  assert.deepEqual(viaMarriott.cards.map((c) => c.id), ["amex-platinum"]);
  assert.equal(plan.viaHotel[0].cards.length > 0, true, "routes the wallet can take come first");
  // A bonus running that day on the bank step is applied (Amex → Marriott +35% until Dec 10, 2026).
  if (bonusOn("amex-mr", "marriott-bonvoy", "2026-11-24")) assert.ok(viaMarriott.bonus && viaMarriott.bonus.bankPoints < viaMarriott.bankPoints);
  // Without a date, no bonus is assumed.
  assert.equal(milesPlan("united-mileageplus", 60_000).viaHotel.some((r) => r.bonus), false);
  // Every direct route really yields the miles.
  for (const r of plan.direct) assert.ok(partnerPointsFor(r.partner, r.bankPoints) >= 60_000);
  // Hotels have no two-step routes; co-brand cards are noted.
  assert.equal(milesPlan("world-of-hyatt", 30_000).viaHotel.length, 0);
  assert.deepEqual(milesPlan("united-mileageplus", 10_000, { cardIds: ["united-quest"] }).coBrand.map((c) => c.id), ["united-quest"]);
  assert.ok(plannableTargets().includes("copa-connectmiles"));
});

// ------------------------------------------------------------------------------------------------- Who can book

test("who can book: an airline's programs, with the wallet's best routes first", () => {
  assert.equal(getAirline("nh")?.name, "ANA");
  const ana = bookingOptionsFor("NH");
  assert.ok(ana.length > 0);
  assert.equal(ana.find((o) => o.own)?.program.id, "ana-mileage-club");
  assert.ok(ana.every((o) => o.reach === undefined), "no wallet, no reach");
  const withChase = bookingOptionsFor("NH", ["chase-sapphire-preferred"]);
  const firstMissing = withChase.findIndex((o) => !o.reach);
  assert.ok(firstMissing > 0, "some programs are reachable with Chase points");
  assert.ok(withChase.slice(firstMissing).every((o) => !o.reach), "reachable programs come first");
  assert.ok(withChase.some((o) => o.program.id === "united-mileageplus" && o.reach?.best?.currency === "chase-ur"));
  assert.deepEqual(bookingOptionsFor("ZZ"), []);
  // Program side: Copa books Copa (its own airline first).
  assert.equal(airlinesBookableWith("copa-connectmiles")[0]?.iata, "CM");
  for (const a of bookableAirlines) for (const p of a.bookableWith) assert.ok(airlinesBookableWith(p).includes(a));
});

// ------------------------------------------------------------------------------------- Bridges (Virgin Red → Flying Club)

test("Virgin Red is a bridge into Flying Club: Capital One and Bilt reach Flying Club through it", () => {
  assert.deepEqual(PROGRAM_BRIDGES.map((b) => `${b.from}>${b.to}`), ["virgin-red>virgin-atlantic-flying-club"]);
  // The research states the shared balance on both programs' guides.
  const guide = (id: ProgramId) => awardPrograms.find((p) => p.id === id)!;
  assert.ok([...(guide("virgin-atlantic-flying-club").perks ?? []), ...guide("virgin-atlantic-flying-club").strengths].some((t) => /Virgin Red/.test(t)));
  assert.ok(guide("virgin-red").strengths.some((t) => /share one Virgin Points balance/.test(t)));

  const c1 = ["capital-one-venture-x"];
  const flyingClub = reachablePrograms(c1).find((r) => r.program === "virgin-atlantic-flying-club");
  assert.ok(flyingClub, "a Capital One wallet reaches Flying Club");
  assert.equal(flyingClub!.best?.via, "virgin-red");
  assert.equal(flyingClub!.best?.currency, "capital-one");
  assert.equal(flyingClub!.best?.ratio, 1);
  // Its Flying Club sweet spots are bookable.
  const spots = sweetSpotsFor(c1).map((s) => s.spot);
  const virgin = sweetSpots.filter((s) => s.program === "virgin-atlantic-flying-club");
  assert.ok(virgin.length > 0 && virgin.every((s) => spots.includes(s)));
  // A direct transfer beats a bridged one at the same ratio.
  const both = reachablePrograms(["capital-one-venture-x", "amex-platinum"]).find((r) => r.program === "virgin-atlantic-flying-club")!;
  assert.equal(both.best?.currency, "amex-mr");
  assert.equal(both.best?.via, undefined);
  assert.ok(both.routes.some((r) => r.via === "virgin-red"));

  // "Transfer from" lists them, marked as going through Virgin Red.
  const sources = transferSources("virgin-atlantic-flying-club");
  assert.deepEqual(
    sources.filter((s) => s.via).map((s) => [s.currency, s.via]),
    [
      ["capital-one", "virgin-red"],
      ["bilt", "virgin-red"],
    ],
  );
  assert.ok(sources.filter((s) => !s.via).every((s) => s.partner.program === "virgin-atlantic-flying-club"));

  // Who can book ANA: Flying Club is reachable with Capital One, and Virgin Red is folded into it.
  const ana = bookingOptionsFor("NH", c1);
  const vs = ana.find((o) => o.program.id === "virgin-atlantic-flying-club")!;
  assert.ok(vs.reach?.best?.via === "virgin-red");
  assert.equal(ana.some((o) => o.program.id === "virgin-red"), false);
  assert.deepEqual(vs.bridges.map((b) => b.bridge.from), ["virgin-red"]);
  // Virgin Red's page lists the airlines Flying Club books.
  assert.ok(airlinesBookableWith("virgin-red").some((a) => a.iata === "LA"));

  // The planner offers Capital One → Virgin Red → Flying Club first for that wallet, not hotel routes.
  const plan = milesPlan("virgin-atlantic-flying-club", 85_000, { cardIds: c1 });
  assert.equal(plan.direct[0].currency, "capital-one");
  assert.equal(plan.direct[0].via, "virgin-red");
  assert.equal(plan.direct[0].bankPoints, 85_000);
  assert.ok(plan.direct[0].cards.length > 0);
  assert.deepEqual(plan.direct.filter((r) => r.via).map((r) => r.currency).sort(), ["bilt", "capital-one"]);
});

// ------------------------------------------------------------------------------------ Data fixes from the review

test("Amex transfer rows cite a source that lists the partner and ratio; Qantas and JetBlue minimums", () => {
  const generic = new Set([
    "https://www.americanexpress.com/content/dam/amex/us/rewards/membership-rewards/mr-terms-conditions-september-2026.pdf",
    "https://global.americanexpress.com/rewards/transfer",
  ]);
  for (const t of transferPartners.filter((t) => t.currency === "amex-mr")) {
    assert.ok(t.sources.some((u) => !generic.has(u)), `amex-mr → ${t.program} cites only Amex's terms and partner page`);
  }
  const qantas = transferPartners.find((t) => t.currency === "amex-mr" && t.program === "qantas-frequent-flyer")!;
  assert.equal(qantas.minimum, 500);
  assert.equal(qantas.increment, undefined);
  assert.equal(milesPlan("qantas-frequent-flyer", 600, { cardIds: ["amex-platinum"] }).direct.find((r) => r.currency === "amex-mr")?.bankPoints, 600);
  assert.equal(transferPartners.find((t) => t.currency === "amex-mr" && t.program === "jetblue-trueblue")?.minimum, 250);
});

test("program text names every bank the change log added", () => {
  const summary = (id: ProgramId) => awardPrograms.find((p) => p.id === id)!.summary;
  assert.match(summary("cathay-pacific-asia-miles"), /Chase points also transfer in at 1:1, since November 18, 2026/);
  assert.match(summary("qantas-frequent-flyer"), /Chase/);
  assert.match(summary("japan-airlines-mileage-bank"), /Citi points also transfer in at 1:1, since September 20, 2026/);
  for (const c of partnerChanges) assert.doesNotMatch(c.detail, /Cathay Pacific Cathay/, "display names in prose");
});

test("hotel conversions carry the minimums the research states in notes and rules", () => {
  const row = (from: ProgramId, to: string) => hotelToAirline.find((r) => r.from === from && r.program === to)!;
  assert.equal(row("hilton-honors", "air-france-klm-flying-blue").minimum, 20_000);
  assert.equal(row("hilton-honors", "aeromexico-rewards").minimum, 25_000);
  const rule = (from: ProgramId) => hotelTransferRules.find((r) => r.from === from)!;
  assert.deepEqual([rule("marriott-bonvoy").minimum, rule("marriott-bonvoy").dailyMax], [3000, 240_000]);
  assert.deepEqual([rule("ihg-one-rewards").minimum, rule("ihg-one-rewards").increment], [10_000, 10_000]);
  assert.deepEqual([rule("wyndham-rewards").minimum, rule("wyndham-rewards").maxPerTransfer], [6000, 60_000]);
  // Marriott converts at least 3,000 points, even for 500 miles.
  assert.equal(hotelPointsFor(row("marriott-bonvoy", "united-mileageplus"), 500, rule("marriott-bonvoy")), 3000);
  assert.equal(hotelPointsFor({ fromPoints: 5, toMiles: 1 }, 1, { minimum: 10_000, increment: 10_000 }), 10_000);
  assert.equal(hotelPointsFor({ fromPoints: 5, toMiles: 1 }, 2100, { increment: 10_000 }), 20_000, "rounded up to the hotel's steps");
  // The planner never proposes a conversion below the minimum: 1,000 Flying Blue miles through Hilton take 20,000 points.
  const viaHilton = milesPlan("air-france-klm-flying-blue", 1000).viaHotel.filter((r) => r.hotel!.row.from === "hilton-honors");
  assert.ok(viaHilton.length > 0 && viaHilton.every((r) => r.hotel!.points >= 20_000));
});

test("bonuses: a cap limits the bonus miles, and card-only bonuses apply only to those cards", () => {
  const turkish = transferBonuses.find((b) => b.currency === "citi-typ" && b.program === "turkish-miles-and-smiles");
  if (!turkish) return;
  assert.equal(turkish.maxBonusMiles, 50_000);
  const usual = transferPartners.find((t) => t.currency === "citi-typ" && t.program === "turkish-miles-and-smiles" && !t.cards)!;
  assert.equal(bankPointsWithBonus(usual, turkish, 200_000), 150_000, "50,000 bonus miles, the rest at 1:1");
  assert.equal(bankPointsWithBonus(usual, turkish, 140_000), 100_000, "under the cap the full 1:1.4 applies");
  const day = turkish.starts;
  const premier = milesPlan("turkish-miles-and-smiles", 200_000, { cardIds: ["citi-strata-premier"], today: day });
  assert.equal(premier.direct.find((r) => r.currency === "citi-typ" && r.cards.length > 0)?.bonus?.bankPoints, 150_000);
  // Double Cash alone transfers at its own reduced rate, which the Strata-only bonus doesn't cover.
  const doubleCash = milesPlan("turkish-miles-and-smiles", 10_000, { cardIds: ["citi-double-cash"], today: day });
  for (const r of doubleCash.direct.filter((r) => r.currency === "citi-typ" && r.cards.length > 0)) assert.equal(r.bonus, undefined);
});

test("scheduled ratio changes ride on their row and apply in the planner from their date", () => {
  const hyatt = transferPartners.find((t) => t.currency === "bilt" && t.program === "world-of-hyatt")!;
  assert.deepEqual([hyatt.from, hyatt.to, hyatt.scheduled?.date, hyatt.scheduled?.from, hyatt.scheduled?.to], [1, 1, "2027-01-01", 4, 3]);
  const bilt = (today: string) => milesPlan("world-of-hyatt", 30_000, { cardIds: ["bilt-palladium"], today }).direct.find((r) => r.currency === "bilt")!;
  assert.equal(bilt("2026-12-31").bankPoints, 30_000);
  assert.equal(bilt("2027-01-01").bankPoints, 40_000);
  for (const t of transferPartners.filter((t) => t.scheduled)) assert.ok(isIsoDate(t.scheduled!.date) && allHttps(t.scheduled!.sources), t.program);
});

test("booking rules: a bridge program points at the rules it uses instead of counting them; notes are user-facing", () => {
  const red = bookingRules.find((r) => r.program === "virgin-red")!;
  assert.equal(red.sameAs, "virgin-atlantic-flying-club");
  for (const k of BOOKING_RULE_KEYS) assert.equal(red[k], null, `virgin-red ${k}`);
  // No program repeats one sentence across its rules (the pattern a bridge program used to have).
  for (const r of bookingRules) {
    const texts = BOOKING_RULE_KEYS.map((k) => r[k]).filter((v): v is string => typeof v === "string");
    assert.ok(texts.length < 3 || new Set(texts).size > 1, `${r.program} repeats one rule text`);
  }
  for (const r of bookingRules) for (const n of r.notes ?? []) assert.doesNotMatch(n, PROCESS, `${r.program}: ${n}`);
  assert.ok(bookingRules.find((r) => r.program === "japan-airlines-mileage-bank")?.notes?.some((n) => /360-day window is for JAL-operated flights/.test(n)));
});

test("values for a wallet: an outlet's figure for the wallet's cards, and the card pages' own value", () => {
  const citi = pointValues.find((v) => v.id === "citi-typ")!;
  assert.equal(valueForWallet(citi, ["citi-double-cash"]).median, 1.6, "NerdWallet's 1.3¢ for other Citi cards");
  assert.equal(valueForWallet(citi, ["citi-double-cash"]).variant?.cents, 1.3);
  assert.equal(valueForWallet(citi, ["citi-strata-premier", "citi-double-cash"]).median, citi.median);
  assert.equal(valueForWallet(citi, []).variant, undefined);
  const chase = cardPageValue("chase-ur")!;
  assert.deepEqual([chase.low, chase.high], [1.5, 1.7]);
  assert.ok(chase.cards.every((c) => currencyOfCard(c)?.kind === "currency"), "the cards behind the figure earn the currency in full");
  assert.equal(cardPageValue("copa-connectmiles"), null);
});

test("card-page values are worded by how they compare with the published median, never assumed conservative", () => {
  const rel = (id: string) => {
    const card = cardPageValue(id as ProgramId)!;
    return valueRelation(card, pointValues.find((v) => v.id === id)!);
  };
  // World of Hyatt (1.7¢ vs 1.55–1.65¢) and Hilton (0.5¢ vs 0.4–0.41¢) sit above every outlet.
  assert.deepEqual(rel("world-of-hyatt"), { relation: "above", aboveAll: true, belowAll: false });
  assert.deepEqual(rel("hilton-honors"), { relation: "above", aboveAll: true, belowAll: false });
  assert.equal(rel("united-mileageplus").relation, "same");
  assert.equal(rel("amex-mr").relation, "below");
  assert.equal(valueRelation({ low: 1.5, high: 1.7 }, { low: 1, median: 1.6, high: 2 }).relation, "spans");
  assert.equal(valueRelation({ low: 1.2, high: 1.2 }, { low: 1.2, median: 1.2000001, high: 1.2 }).relation, "same", "to the hundredth of a cent");
});

test("partners the change log adds take the bank's minimum and steps, so the planner never proposes too little", { skip: !changeLogApplied && "imported with --no-change-log" }, () => {
  const added = transferPartners.filter((t) =>
    partnerChanges.some((c) => c.change === "added" && c.date === t.changedOn && c.currency === t.currency && c.program === t.program),
  );
  assert.ok(added.some((t) => t.currency === "chase-ur" && t.program === "qantas-frequent-flyer"));
  for (const t of added) {
    const others = transferPartners.filter((x) => x.currency === t.currency && !x.cards && !x.changedOn);
    const keys = new Set(others.map((x) => `${x.minimum ?? ""}|${x.increment ?? ""}`));
    if (keys.size !== 1 || keys.has("|")) continue;
    assert.deepEqual([t.minimum, t.increment], [others[0].minimum, others[0].increment], `${t.currency} → ${t.program}`);
  }
  // 600 Qantas points from Chase, or 600 JAL miles from Citi, still take a 1,000-point transfer.
  const bank = (program: ProgramId, currency: string) => milesPlan(program, 600).direct.find((r) => r.currency === currency)!.bankPoints;
  assert.equal(bank("qantas-frequent-flyer", "chase-ur"), 1000);
  assert.equal(bank("cathay-pacific-asia-miles", "chase-ur"), 1000);
  assert.equal(bank("japan-airlines-mileage-bank", "citi-typ"), 1000);
  assert.equal(bank("copa-connectmiles", "citi-typ"), 1000);
});

test("Hilton converts from 10,000 points (Upgraded Points' table), so no plan proposes a smaller conversion", () => {
  const rule = hotelTransferRules.find((r) => r.from === "hilton-honors")!;
  assert.equal(rule.minimum, 10_000);
  assert.ok(rule.sources.includes("https://upgradedpoints.com/travel/hotels/hilton-honors-transfer-partners/"));
  assert.match(rule.rule, /10,000-point minimum/);
  for (const program of ["virgin-atlantic-flying-club", "qantas-frequent-flyer", "united-mileageplus"] as ProgramId[]) {
    const hilton = milesPlan(program, 600).viaHotel.filter((r) => r.hotel!.row.from === "hilton-honors");
    assert.ok(hilton.length > 0 && hilton.every((r) => r.hotel!.points >= 10_000), program);
  }
});

test("scheduled ratio changes take effect from their date on every view's dataset", () => {
  assert.equal(pointsDataOn(null), pointsData);
  assert.equal(pointsDataOn("2026-11-24"), pointsData, "nothing due yet: the same dataset");
  const after = pointsDataOn("2027-01-02");
  assert.equal(pointsDataOn("2027-03-01"), after, "the same object until another change is due");
  const hyatt = bestPartnerFor("bilt", "world-of-hyatt", after)!;
  assert.deepEqual([hyatt.from, hyatt.to, hyatt.scheduled, hyatt.changedOn], [4, 3, undefined, "2027-01-01"]);
  assert.equal(transferSources("world-of-hyatt", after).find((s) => s.currency === "bilt")!.partner.to, 3);
  const reach = reachablePrograms(["bilt-palladium"], after).find((r) => r.program === "world-of-hyatt")!;
  assert.equal(reach.best?.ratio, 0.75);
  // Before the date the row is as researched, with its scheduled change.
  assert.equal(bestPartnerFor("bilt", "world-of-hyatt")!.scheduled?.date, "2027-01-01");
});

test("research prose reads like the pages: no ISO dates, ratios written as the ratio pills write them", () => {
  const pill = new Set(transferPartners.map((t) => (t.to / t.from).toFixed(6)));
  const texts: [string, string][] = [
    ...bankCurrencies.flatMap((c) => [[`${c.id} rules`, c.restrictions ?? ""]] as [string, string][]),
    ...awardPrograms.flatMap((p) => [p.summary, ...p.strengths, ...p.watchOuts].map((t): [string, string] => [p.id, t])),
    ...transferPartners.map((t): [string, string] => [`${t.currency} → ${t.program}`, t.note ?? ""]),
    ...partnerChanges.map((c): [string, string] => [`change ${c.date}`, `${c.programName} ${c.detail}`]),
    ...transferBonuses.map((b): [string, string] => [`bonus ${b.program}`, b.notes ?? ""]),
    ...bookingRules.flatMap((r) => (r.notes ?? []).map((n): [string, string] => [`${r.program} note`, n])),
    ...bookableAirlines.flatMap((a) => [[a.iata, `${a.restrictions ?? ""} ${a.notes ?? ""}`]] as [string, string][]),
    ...pointValues.map((v): [string, string] => [`${v.id} value`, v.note ?? ""]),
    ...sweetSpots.map((s): [string, string] => [s.id, `${s.howToBook} ${s.caveats ?? ""} ${s.feesNote ?? ""}`]),
  ];
  for (const [where, t] of texts) {
    assert.doesNotMatch(t, /\b\d{4}-\d{2}-\d{2}\b/, `${where}: ${t}`);
    for (const m of t.matchAll(/(?<![\w.,:])(\d+\.\d+|\d+):(\d+\.\d+|\d+)(?![\w:]|\.\d)/g)) {
      if (!m[0].includes(".")) continue;
      assert.ok(!pill.has((Number(m[2]) / Number(m[1])).toFixed(6)), `${where}: "${m[0]}" is a rate the pills write as ${ratioLabel({ from: Number(m[1]), to: Number(m[2]) })}`);
    }
  }
  // Hotel tables and their rules write rates the same way ("10:1.5" → "20:3").
  for (const r of hotelTransferRules) assert.doesNotMatch(r.rule, /\b\d+:\d+\.\d\b/, r.from);
});

test("a dated listing ends on its date; Aeroplan's booking window cites a page that states it", () => {
  assert.equal(getAirline("OZ")?.endsOn, "2026-12-17", "Asiana leaves Star Alliance at the end of December 16, 2026");
  for (const a of bookableAirlines) if (a.endsOn) assert.ok(isIsoDate(a.endsOn), a.iata);
  const aeroplan = bookingRules.find((r) => r.program === "air-canada-aeroplan")!;
  if (aeroplan.bookingWindowDays === 355) assert.ok(aeroplan.sources.includes("https://upgradedpoints.com/travel/airlines/when-do-airlines-release-award-seats/"));
  // The research's caveat on how Aeroplan's and American's rules were checked is kept, without process wording.
  assert.ok(aeroplan.notes?.some((n) => /long-standing Aeroplan rules as reported by major points blogs/.test(n)));
  assert.ok(bookingRules.find((r) => r.program === "american-aadvantage")?.notes?.some((n) => /come from Citi's pages/.test(n)));
  assert.match(getAirline("WY")!.restrictions!, /American AAdvantage isn't listed/);
});

test("every photo file under public/photos is credited", () => {
  const root = join(__dirname, "../public/photos");
  const files: string[] = [];
  const walk = (dir: string) => {
    let names: string[] = [];
    try {
      names = readdirSync(dir);
    } catch {
      return;
    }
    for (const n of names) {
      const p = join(dir, n);
      if (statSync(p).isDirectory()) walk(p);
      else files.push(`/photos/${relative(root, p).split("\\").join("/")}`);
    }
  };
  walk(root);
  const credited = new Set(allPhotos().map((p) => p.src));
  assert.deepEqual(files.filter((f) => !credited.has(f)), [], "re-run the importer, or keep uncredited files out of public/photos");
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
  assert.equal(judgeRedemption({ cashPrice: 1200, taxes: 80, points: 60000, baselineCents: Number.NaN }), null, "no value, no verdict");
});

test("transfer math: labels, amounts, minimums and increments, speed", () => {
  assert.equal(ratioLabel({ from: 1, to: 1 }), "1:1");
  // Equal rates read the same, in smallest whole numbers.
  for (const r of [{ from: 5, to: 4 }, { from: 1, to: 0.8 }, { from: 1000, to: 800 }, { from: 250, to: 200 }]) assert.equal(ratioLabel(r), "5:4");
  for (const r of [{ from: 2, to: 1.5 }, { from: 4, to: 3 }, { from: 1, to: 0.75 }]) assert.equal(ratioLabel(r), "4:3");
  assert.equal(ratioLabel({ from: 1, to: 1.6 }), "5:8");
  assert.equal(ratioLabel({ from: 1, to: 2 }), "1:2");
  assert.equal(ratioLabel({ from: 3, to: 2 }), "3:2");
  assert.equal(ratioLabel({ from: 1, to: 0.7 }), "10:7");
  assert.equal(ratioLabel({ from: 150_000, to: 61_000 }), "1:0.41", "rates that don't reduce keep one side at 1");
  assert.equal(trimCents(2.225), "2.23");
  assert.equal(trimCents(1.9), "1.9");
  assert.equal(partnerPointsFor({ from: 2, to: 1.5 }, 1000), 750);
  assert.equal(bankPointsFor({ from: 2, to: 1.5, minimum: 1000, increment: 1000 }, 120000), 160000);
  assert.equal(bankPointsFor({ from: 1, to: 1, increment: 1000 }, 60500), 61000);
  assert.equal(bankPointsFor({ from: 1, to: 2, minimum: 1000 }, 500), 1000);
  const order = ["Instant", "Up to 24 hours", "Typically 48 hours", "1–2 days", "Up to 7 days", "Varies", undefined].map(transferSpeedRank);
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
  assert.equal(transferSpeedRank(undefined), 100, "an unconfirmed time sorts last");
});
