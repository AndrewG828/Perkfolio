import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { annualizedCreditValue, cards, getCard } from "../src/shared/data/cards";
import type { Card } from "../src/shared/data/types";
import { hotelEarning } from "../src/shared/data/travel/hotel-earning";
import { pointValues, unvaluedIds, type PointValue } from "../src/shared/data/points";
import { estimateRewards } from "../src/shared/data/calculator-rates";
import { classifyCard, currencyOfCard } from "../src/shared/lib/points";
import { cardsEarningIn, earnsFully } from "../src/shared/lib/card-currency";
import { statusFor } from "../src/shared/lib/credit-status";
import {
  MEDIAN_SOURCE,
  annualizedCredits,
  basisLabel,
  cardPointValue,
  creditPeriodValue,
  creditValue,
  IGNORED_VARIANTS,
  unlockedValue,
  formatCents,
  noValueReason,
  resolvePointValue,
  returnPercent,
  valueData,
  valueForWallet,
  valueSources,
  type ValueContext,
} from "../src/shared/lib/point-value";
import { firstYearValue, rankNextCards } from "../src/shared/lib/next-card";
import { welcomeValue } from "../src/shared/lib/welcome-offer";
import { portfolioValue } from "../src/shared/lib/trackers";
import { programId, stayPoints, walletCard } from "../src/shared/lib/hotel-points";
import { suggestCards } from "../src/shared/lib/start-flows";
import type { WalletState } from "../src/shared/lib/wallet";

const card = (id: string) => getCard(id) as Card;
const published = (id: string) => pointValues.find((v) => v.id === id) as PointValue;
const wallet = (ids: string[]): WalletState => ({ version: 1, cards: ids, usage: {}, ignored: {}, applications: [] });

test("one value per point: the user's own, else the published median, else nothing for unvalued points", () => {
  for (const v of pointValues) assert.deepEqual(resolvePointValue(v.id), { cents: v.median, basis: "median", id: v.id, published: v, forCards: { low: v.low, median: v.median, high: v.high } }, v.id);
  assert.equal(resolvePointValue("amex-mr", { own: { "amex-mr": 2.5 } })?.cents, 2.5);
  assert.equal(resolvePointValue("amex-mr", { own: { "amex-mr": 2.5 } })?.basis, "own");
  assert.equal(resolvePointValue("amex-mr", { own: { "amex-mr": 2.5 } })?.published, published("amex-mr"), "the default stays known");
  for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) assert.equal(resolvePointValue("amex-mr", { own: { "amex-mr": bad } })?.basis, "median", String(bad));
  // Points no outlet values (and no card earns) have no value until the user sets one: never an estimate.
  for (const id of unvaluedIds) {
    assert.equal(resolvePointValue(id), undefined, id);
    assert.match(noValueReason(id) ?? "", /^Not listed in the November 2026 tables of The Points Guy, Upgraded Points or NerdWallet\.$/);
  }
  assert.equal(resolvePointValue("copa-connectmiles"), undefined);
  assert.equal(noValueReason("copa-connectmiles"), undefined, "not in the outlets' tables' scope, so no reason is claimed");
  assert.equal(resolvePointValue(undefined), undefined);
  assert.equal(MEDIAN_SOURCE, "the median of the November 2026 figures from The Points Guy, Upgraded Points and NerdWallet");
  assert.equal(formatCents(2.225), "2.23¢");
  assert.equal(formatCents(0.73), "0.73¢");
  assert.equal(basisLabel({ basis: "median" }), "November 2026 median");
});

test("the card file's pointValueCents counts only for points no outlet values", () => {
  // Every card's points have a published median today, so the card files' own figures aren't used anywhere.
  for (const c of cards) assert.notEqual(cardPointValue(c).basis, "estimate", c.id);
  // Without a published value, a card's points fall back to its card file's figure (here: United's, as if no outlet listed it).
  const data = { ...valueData, values: pointValues.filter((v) => v.id !== "united-mileageplus") };
  assert.deepEqual(cardPointValue(card("united-club-infinite"), {}, data), { cents: card("united-club-infinite").pointValueCents, basis: "estimate", id: "united-mileageplus" });
  assert.equal(resolvePointValue("united-mileageplus", {}, data)?.basis, "estimate", "balances use the same figure");
  assert.equal(resolvePointValue("united-mileageplus", { own: { "united-mileageplus": 1.5 } }, data)?.cents, 1.5, "the user's own still wins");
  // Cards that earn the same points in full agree on that figure, so the fallback is one value too.
  const byPoints = new Map<string, Set<number>>();
  for (const c of cards) {
    const p = currencyOfCard(c);
    if (!p || (p.kind === "currency" && p.limited)) continue;
    const id = p.kind === "currency" ? p.currency : p.program;
    if (!pointValues.some((v) => v.id === id)) byPoints.set(id, (byPoints.get(id) ?? new Set()).add(c.pointValueCents));
  }
  for (const [id, set] of byPoints) assert.equal(set.size, 1, `${id}: cards disagree on pointValueCents`);
});

test("cash back counts at face value, and cards that need another card to transfer stay cash back until it's there", () => {
  for (const c of cards) {
    const { rule } = classifyCard(c);
    const v = cardPointValue(c, { own: { "chase-ur": 9, "citi-typ": 9, "capital-one": 9, "wells-fargo": 9 } });
    if (rule === "cash-only") assert.deepEqual(v, { cents: 1, basis: "cash" }, c.id);
    if (rule === "limited") {
      assert.equal(v.basis, "cash", `${c.id}: no own value applies to cash back`);
      assert.equal(v.cents, 1, c.id);
      assert.ok(v.limited && !v.limited.unlockedWith, c.id);
    }
  }
  // With a card that unlocks transfers, they're the currency's points, worth what the currency is worth.
  const freedom = cardPointValue(card("chase-freedom-unlimited"), { cards: ["chase-sapphire-preferred"] });
  assert.equal(freedom.basis, "median");
  assert.equal(freedom.cents, resolvePointValue("chase-ur", { cards: ["chase-freedom-unlimited", "chase-sapphire-preferred"] })!.cents);
  assert.equal(freedom.limited?.unlockedWith, "chase-sapphire-preferred");
  assert.equal(cardPointValue(card("chase-freedom-unlimited"), { own: { "chase-ur": 2.4 }, cards: ["chase-sapphire-reserve"] }).cents, 2.4);
  assert.equal(cardPointValue(card("citi-double-cash"), { cards: ["citi-strata-premier"] }).cents, published("citi-typ").median);
  assert.equal(cardPointValue(card("capital-one-savor"), { cards: ["capital-one-venture-x"] }).cents, published("capital-one").median);
  // A card that doesn't unlock them changes nothing.
  assert.equal(cardPointValue(card("chase-freedom-flex"), { cards: ["chase-freedom-unlimited", "amex-gold"] }).basis, "cash");
  // Bilt Points "(plus Bilt Cash)" are points, not cash back.
  assert.equal(cardPointValue(card("bilt-palladium")).cents, published("bilt").median);
});

test("an outlet's figure for the wallet's cards replaces its headline one, like the deal calculator always did", () => {
  const citi = published("citi-typ");
  // NerdWallet's 1.3¢ for "other Citi cards" never applies: those cards' points are cash back until pooled with a
  // Strata card, and then the headline figure does (IGNORED_VARIANTS).
  assert.equal(valueForWallet(citi, ["citi-double-cash"]).median, citi.median);
  assert.equal(valueForWallet(citi, ["citi-double-cash"]).variant, undefined);
  assert.equal(valueForWallet(citi, ["citi-strata-premier", "citi-double-cash"]).median, citi.median);
  assert.equal(valueForWallet(citi, []).variant, undefined);
  // A wallet whose only ThankYou card is a Double Cash earns them as cash back (1¢), as the card itself counts.
  assert.equal(resolvePointValue("citi-typ", { cards: ["citi-double-cash"] })?.cents, 1);
  assert.equal(resolvePointValue("citi-typ", { cards: ["citi-double-cash"] })?.basis, "cash");
  assert.match(resolvePointValue("citi-typ", { cards: ["citi-double-cash"] })?.locked?.note ?? "", /Strata/);
  // Chase: NerdWallet's 1.4¢ for Sapphire Preferred holders moves the low end, not the median.
  const chase = resolvePointValue("chase-ur", { cards: ["chase-sapphire-preferred"] })!;
  assert.equal(chase.cents, published("chase-ur").median);
  assert.equal(chase.forCards?.low, 1.4);
  assert.equal(resolvePointValue("chase-ur", { cards: ["chase-sapphire-preferred", "chase-sapphire-reserve"] })?.forCards?.variant, undefined);
  // The card counts among its own holder's cards: a Strata Premier's points are never valued as a Double Cash's.
  assert.equal(cardPointValue(card("citi-strata-premier"), { cards: ["citi-double-cash"] }).cents, citi.median);
});

/**
 * The point of the resolver: for a given currency and set of cards, every page and tool lands on the same value. Each
 * check goes through the function that page calls.
 */
test("the calculator, Which Card?, the next-card ranking, card pages, the tracker and Points & Miles agree on every currency", () => {
  // One full earner per currency or program the cards earn, with a points welcome offer where there is one.
  const earners = new Map<string, Card>();
  for (const c of cards) {
    const p = currencyOfCard(c);
    if (!p || (p.kind === "currency" && p.limited)) continue;
    const id = p.kind === "currency" ? p.currency : p.program;
    const current = earners.get(id);
    if (!current || (welcomeValue(current).points === undefined && welcomeValue(c).points !== undefined)) earners.set(id, c);
  }
  assert.ok(earners.size >= 14, "every bank currency and co-brand program");
  const spend = { dining: 0, groceries: 0, flights: 0, hotels: 0, otherTravel: 0, gas: 0, streaming: 0, rent: 0, other: 100_000 };
  for (const [id, c] of earners) {
    for (const extra of [{}, { own: { [id]: 2.37 } }, { cards: ["citi-double-cash", "chase-sapphire-preferred"] }] as ValueContext[]) {
      const ctx: ValueContext = { ...extra, cards: [...(extra.cards ?? []), c.id] };
      const label = `${id} with ${JSON.stringify(extra)}`;
      const expected = resolvePointValue(id, ctx)!.cents;
      // Calculator: what a year of spend is worth.
      assert.equal(estimateRewards(c, spend, false, ctx).pointValue.cents, expected, `calculator: ${label}`);
      // Which Card?: return per dollar = rate × value.
      assert.equal(returnPercent(c, 1, ctx), expected, `Which Card?: ${label}`);
      // Card pages: the earning note and the welcome offer.
      assert.equal(cardPointValue(c, ctx).cents, expected, `card page: ${label}`);
      const w = welcomeValue(c, ctx);
      if (w.points) assert.equal(w.points.cents, expected, `card page welcome offer: ${label}`);
      // Next-card ranking: the first-year value of a card you don't hold yet, and the ranking itself.
      const fy = firstYearValue(c, () => false, ctx);
      if (fy.points) assert.equal(fy.points.cents, expected, `next card: ${label}`);
      const others = (ctx.cards ?? []).filter((x) => x !== c.id);
      const ranked = rankNextCards({ wallet: wallet(others), today: new Date(2026, 10, 24), scope: "all", values: { own: ctx.own } });
      const row = [...ranked.eligible, ...ranked.warning, ...ranked.unknown, ...ranked.blocked].find((r) => r.card.id === c.id);
      if (row?.value.points) assert.equal(row.value.points.cents, expected, `next-card ranking: ${label}`);
      // Tracker: a balance of 100 points is worth `cents` dollars.
      assert.ok(Math.abs(portfolioValue({ [id]: { points: 100, updated: "2026-11-24" } }, ctx).totalUsd - expected) < 1e-9, `tracker: ${label}`);
      // Points & Miles: the deal calculator's default and the program page's value come from the same call.
      if (valueSources().some((s) => s.id === id)) assert.equal(resolvePointValue(id, ctx)?.cents, expected, `Points & Miles: ${label}`);
    }
  }
  // The hotel calculator values hotel and card points the same way.
  for (const chain of hotelEarning.chains) {
    const pid = programId(chain.program);
    for (const listed of chain.cards.filter((x) => x.cardId)) {
      const c = card(listed.cardId!);
      const r = stayPoints({ chain, nightlyRate: 200, nights: 1, taxPercent: 0, card: walletCard(c, listed.perDollar), values: { own: { [pid]: 0.9 } } });
      assert.equal(r.hotelCents, 0.9, `${chain.program}: your own value`);
      assert.equal(r.cardCents, cardPointValue(c, { own: { [pid]: 0.9 } }).cents, `${c.id} at ${chain.program}`);
    }
  }
  // Start here suggests cards by the same returns: a huge own value for Bilt points puts a Bilt card first for groceries.
  assert.ok(suggestCards("groceries", "any", "rarely", { own: { bilt: 50 } })[0].startsWith("bilt-"));
});

/**
 * Wallets whose only card for a currency needs another card to transfer (Freedom alone, Double Cash alone, Savor
 * alone): the currency's points and the card's points are one value, cash back, on every page; adding a card that
 * unlocks transfers moves both to the published value.
 */
test("a wallet's points have one value even when its cards can't transfer them yet", () => {
  const limited = cards.filter((c) => {
    const p = currencyOfCard(c);
    return p?.kind === "currency" && p.limited;
  });
  assert.ok(limited.length >= 5);
  for (const c of limited) {
    const p = currencyOfCard(c)!;
    assert.ok(p.kind === "currency" && p.limited);
    const alone: ValueContext = { cards: [c.id] };
    const currency = resolvePointValue(p.currency, alone)!;
    assert.equal(currency.cents, cardPointValue(c, alone).cents, `${c.id}: currency and card agree`);
    assert.equal(currency.cents, 1, `${c.id}: cash back until unlocked`);
    assert.equal(portfolioValue({ [p.currency]: { points: 100, updated: "2026-11-24" } }, alone).totalUsd, 1, `${c.id}: tracker`);
    // With a card that unlocks transfers, both move to the currency's value.
    const unlocked: ValueContext = { cards: [c.id, p.limited.unlockedBy[0]] };
    assert.equal(resolvePointValue(p.currency, unlocked)!.cents, cardPointValue(c, unlocked).cents, `${c.id} unlocked`);
    assert.ok(cardPointValue(c, unlocked).cents > 1, `${c.id} unlocked is worth more than cash`);
  }
  // Without a wallet (or with no card that earns the currency) the published value stands.
  assert.equal(resolvePointValue("chase-ur")!.basis, "median");
  assert.equal(resolvePointValue("chase-ur", { cards: ["amex-platinum"] })!.basis, "median");
});

test("benefits paid in points are valued at the one point value, not a card file's own cents", () => {
  const withPoints = cards.flatMap((c) => c.credits.filter((cr) => cr.points).map((cr) => ({ c, cr })));
  assert.ok(withPoints.length >= 3, "Venture X, Venture X Business and Southwest Priority");
  for (const { c, cr } of withPoints) {
    const median = resolvePointValue(cr.points!.program)!;
    assert.equal(median.basis, "median", `${c.id} ${cr.id}`);
    const atMedian = Math.round((cr.points!.amount * median.cents) / 100);
    assert.equal(cr.annualValue, atMedian, `${c.id} ${cr.id}: annualValue is the points at the median`);
    assert.equal(cr.amountPerPeriod, atMedian, `${c.id} ${cr.id}`);
    assert.equal(creditValue(cr), atMedian);
    assert.equal(creditValue(cr, { own: { [cr.points!.program]: 1 } }), cr.points!.amount / 100, "the visitor's own value");
    assert.doesNotMatch(cr.note ?? "", /\d(\.\d+)? ?(cents|¢)/, `${c.id} ${cr.id}: no cents of its own in the note`);
  }
  const vx = getCard("capital-one-venture-x")!;
  assert.equal(annualizedCredits(vx), annualizedCreditValue(vx));
  assert.equal(annualizedCredits(vx, { own: { "capital-one": 1 } }), annualizedCreditValue(vx) - 180 + 100);
  // Benefits paid in points are annual, so a period's value is the year's (creditPeriodValue, the tracker's rows).
  for (const { c, cr } of withPoints) {
    assert.equal(cr.frequency, "annual", `${c.id} ${cr.id}`);
    assert.equal(creditPeriodValue(cr, { own: { [cr.points!.program]: 1 } }), cr.points!.amount / 100);
  }
});

test("own values reach benefits paid in points on every page: card pages, tiles, the tracker and the next-card ranking", () => {
  const vx = getCard("capital-one-venture-x")!;
  const miles = vx.credits.find((c) => c.id === "anniversary-miles")!;
  const own: ValueContext = { own: { "capital-one": 1 }, cards: [vx.id] };
  // Card pages and tiles (CreditsPerYear, CreditValueCell, ValueAtAGlance) read annualizedCredits / creditValue.
  assert.equal(creditValue(miles, own), 100);
  assert.equal(annualizedCredits(vx, own), annualizedCreditValue(vx) - 80);
  // The tracker passes creditPeriodValue to statusFor: $100 a year, and marking it used once counts all of it.
  const wallet = { version: 1, cards: [vx.id], usage: {}, ignored: {} } as unknown as WalletState;
  const now = new Date(2026, 10, 24);
  const fresh = statusFor(vx, miles, wallet, now, creditPeriodValue(miles, own));
  assert.equal(fresh.amount, 100);
  assert.equal(fresh.annual, 100);
  assert.equal(fresh.remaining, 100);
  const marked = statusFor(vx, miles, { ...wallet, usage: { [`${vx.id}:${miles.id}:${fresh.periodKey}`]: 180 } } as WalletState, now, 100);
  assert.equal(marked.used, 100, "marked at the median before the own value was set: still used in full");
  assert.equal(marked.remaining, 0);
  // Next card: the visitor's value, and nothing for points that post only at renewal in the first year.
  const all = firstYearValue(vx, () => true, own);
  assert.equal(all.credits, vx.credits.filter((c) => !c.afterRenewal).reduce((s, c) => s + creditValue(c, own), 0));
  assert.ok(miles.afterRenewal, "Venture X's anniversary miles post from the first renewal");
  assert.equal(firstYearValue(vx, (id) => id === miles.id, own).credits, 0);
  const sw = getCard("southwest-priority")!;
  assert.equal(firstYearValue(sw, () => true, { own: { "southwest-rapid-rewards": 1 } }).creditsAvailable, 0, "7,500 anniversary points");
  // Every credit marked afterRenewal says so in its own description.
  for (const c of cards) for (const cr of c.credits.filter((x) => x.afterRenewal)) {
    assert.match(cr.description, /renewal|anniversary/i, `${c.id} ${cr.id}`);
    assert.doesNotMatch(cr.description, /opening/i, `${c.id} ${cr.id}: one that also posts at opening counts in year one`);
  }
});

test("no page keeps its own copy of the valuations or compares two of our own figures", () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const f of readdirSync(dir)) {
      const path = join(dir, f);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(ts|tsx)$/.test(f)) files.push(path);
    }
  };
  walk(join(process.cwd(), "src"));
  const offenders = (re: RegExp) => files.filter((f) => re.test(readFileSync(f, "utf8"))).map((f) => f.slice(process.cwd().length + 1));
  // The valuations live in shared/data/points/valuations.ts (generated); everything else reads them through point-value.
  assert.deepEqual(
    files.filter((f) => /valuations\.ts$/.test(f)).map((f) => f.slice(process.cwd().length + 1)),
    ["src/shared/data/points/valuations.ts"],
  );
  // pointValueCents is read only by the resolver (the fallback) and the card data itself.
  assert.deepEqual(
    offenders(/\.pointValueCents\b/),
    ["src/shared/lib/point-value.ts"],
  );
  // welcomeOfferValue (the card file's estimate) only for offers that can't be valued from points and cash.
  assert.deepEqual(offenders(/\.welcomeOfferValue\b/), ["src/shared/lib/welcome-offer.ts"]);
  // No wording that compares the card files' figures with the published ones.
  assert.deepEqual(offenders(/conservative figure|above every published valuation|Earning estimate|card pages use|card pages value/i), []);
});

/**
 * Pages that only value points (the calculator, Compare, Which Card?, the tracker, Start here, the hotel tool) must
 * not pull the whole Points & Miles dataset into their bundles: their shared modules' imports never reach the points
 * index, the points logic or the big generated modules.
 */
test("value-only modules don't import the Points & Miles dataset", () => {
  const HEAVY = [
    "src/shared/data/points/index.ts",
    "src/shared/lib/points.ts",
    "src/shared/data/points/sweet-spots.ts",
    "src/shared/data/points/programs.ts",
    "src/shared/data/points/airlines.ts",
    "src/shared/data/points/booking-rules.ts",
    "src/shared/data/points/hotel-transfers.ts",
  ];
  const resolve = (from: string, spec: string): string | null => {
    let base: string;
    if (spec.startsWith("@/")) base = join("src", spec.slice(2));
    else if (spec.startsWith(".")) base = join(from, "..", spec);
    else return null;
    for (const ext of [".ts", ".tsx", "/index.ts"]) if (existsSync(base + ext)) return base + ext;
    return existsSync(base) && statSync(base).isFile() ? base : null;
  };
  const graph = (entry: string): Map<string, string> => {
    const seen = new Map<string, string>([[entry, entry]]);
    const todo = [entry];
    while (todo.length) {
      const file = todo.pop()!;
      const text = readFileSync(file, "utf8");
      for (const m of text.matchAll(/^(?:import|export)\s+(?!type\b)[^;]*?from\s+"([^"]+)"/gm)) {
        const dep = resolve(file, m[1]);
        if (dep && !seen.has(dep)) {
          seen.set(dep, file);
          todo.push(dep);
        }
      }
    }
    return seen;
  };
  // The lounge list too, except for Start here, whose airport flow lists airports and their lounges.
  assert.ok(!graph("src/shared/lib/point-value.ts").has("src/shared/data/lounges.ts"));
  const keepsOut = (entries: string[], heavyList: string[]) => {
    for (const entry of entries) {
      const reached = graph(entry);
      for (const heavy of heavyList) {
        const via: string[] = [];
        for (let at = heavy; reached.has(at) && at !== entry; at = reached.get(at)!) via.unshift(at);
        assert.ok(!reached.has(heavy), `${entry} reaches ${heavy} via ${[entry, ...via].join(" → ")}`);
      }
    }
  };
  keepsOut(
    [
      "src/shared/lib/point-value.ts",
      "src/shared/data/calculator-rates.ts",
      "src/shared/lib/welcome-offer.ts",
      "src/shared/data/strategy/programs.ts",
      "src/shared/lib/start-flows.ts",
      "src/shared/lib/hotel-points.ts",
      "src/shared/lib/trackers.ts",
      // The browser side: the value context every value-only page reads, and the card page's client islands.
      "src/frontend/state/point-values.ts",
      "src/frontend/state/strategy-prefs.ts",
      "src/frontend/features/points/dated-partner.tsx",
      "src/frontend/features/cards/welcome-value.tsx",
      "src/frontend/features/cards/credit-values.tsx",
      "src/frontend/components/credits-per-year.tsx",
    ],
    HEAVY,
  );
  // The issuer application rules stay with the pages that check eligibility: the value context doesn't need them.
  keepsOut(
    ["src/frontend/state/point-values.ts", "src/frontend/state/strategy-prefs.ts", "src/shared/lib/point-value.ts"],
    ["src/shared/lib/eligibility.ts", "src/shared/data/strategy/application-rules.ts", "src/shared/data/strategy/other-products.ts"],
  );
  // Every page loads the root layout's reminder banner, and with it the card data: never the full transfer list.
  keepsOut(["src/frontend/components/reminder-banner.tsx", "src/shared/data/cards/index.ts"], ["src/shared/data/points/transfers.ts", ...HEAVY]);
});

test("each stored median is the middle of its outlets' figures (as valueForWallet recomputes it)", () => {
  for (const v of pointValues) {
    const s = v.values.map((o) => o.cents).sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    const middle = s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
    assert.ok(Math.abs(middle - v.median) < 0.0011, `${v.id}: stored ${v.median}, outlets give ${middle}`);
    assert.equal(v.low, s[0], `${v.id} low`);
    assert.equal(v.high, s[s.length - 1], `${v.id} high`);
    // Without a variant for the wallet, the wallet's median is the stored one.
    assert.ok(Math.abs(valueForWallet(v, []).median - v.median) < 0.0011, v.id);
  }
});

test("an outlet's lower figure applies only to the cards its own wording names", () => {
  // Every variant in the data is one point-value.ts knows how to apply; a new one fails here until it's wired up.
  const variants = pointValues.flatMap((v) => v.values.flatMap((o) => (o.variants ?? []).map((x) => ({ id: v.id, outlet: o.outlet, appliesTo: x.appliesTo }))));
  assert.deepEqual(
    variants.map((x) => `${x.id}|${x.outlet}|${x.appliesTo}`).sort(),
    ["chase-ur|NerdWallet|Sapphire Preferred and Ink Preferred cardholders", "citi-typ|NerdWallet|other Citi cards"].sort(),
  );
  const chase = pointValues.find((v) => v.id === "chase-ur")!;
  assert.ok(valueForWallet(chase, ["chase-sapphire-preferred"]).variant, "Sapphire Preferred holders");
  assert.ok(valueForWallet(chase, ["chase-ink-business-preferred"]).variant, "Ink Preferred holders");
  assert.equal(valueForWallet(chase, ["chase-sapphire-preferred", "chase-sapphire-reserve"]).variant, undefined, "a Reserve transfers 1:1");
  const citi = pointValues.find((v) => v.id === "citi-typ")!;
  // Left out on purpose, with the reason (IGNORED_VARIANTS): every wallet it would match counts these points as cash.
  assert.ok(IGNORED_VARIANTS["citi-typ"]?.["other Citi cards"], "other Citi cards");
  for (const id of cardsEarningIn("citi-typ", cards).filter((c) => !earnsFully(c, "citi-typ")).map((c) => c.id)) {
    assert.equal(resolvePointValue("citi-typ", { cards: [id] })?.basis, "cash", `${id}: locked, so a variant couldn't set a value`);
  }
  assert.equal(valueForWallet(citi, ["citi-double-cash"]).variant, undefined);
  assert.equal(valueForWallet(citi, ["citi-strata-premier"]).variant, undefined, "a Strata card isn't an other Citi card");
});

test("points a wallet can't transfer yet: one value once they can, and an own value waits until then", () => {
  // The deal calculator's "Transferable, they're worth …" and the card page's "Combined, they're … worth …" both use
  // unlockedValue(): with only a Double Cash, ThankYou points are 1¢ now and the headline median once pooled.
  const alone: ValueContext = { cards: ["citi-double-cash"] };
  assert.equal(resolvePointValue("citi-typ", alone)?.cents, 1);
  assert.equal(unlockedValue("citi-typ", alone)?.cents, published("citi-typ").median, "the Strata median, not a lower figure");
  assert.equal(unlockedValue("citi-typ", alone)?.cents, cardPointValue(card("citi-double-cash"), { cards: ["citi-strata-premier"] }).cents);
  assert.equal(unlockedValue("chase-ur", { cards: ["chase-freedom-unlimited"] })?.cents, published("chase-ur").median);
  // An own value doesn't apply while the points are locked (the Points tab says it waits), and does once unlocked.
  const own: ValueContext = { own: { "chase-ur": 1.5 }, cards: ["chase-freedom-unlimited"] };
  assert.equal(resolvePointValue("chase-ur", own)?.basis, "cash");
  assert.equal(unlockedValue("chase-ur", own)?.cents, 1.5);
  assert.equal(resolvePointValue("chase-ur", { ...own, cards: ["chase-freedom-unlimited", "chase-sapphire-preferred"] })?.cents, 1.5);
  // The deal calculator's note reads the same figure the card page prints for a limited card.
  for (const c of cards.filter((x) => { const p = currencyOfCard(x); return p?.kind === "currency" && p.limited; })) {
    const p = currencyOfCard(c)!;
    if (p.kind !== "currency") continue;
    const ctx: ValueContext = { cards: [c.id] };
    assert.ok(resolvePointValue(p.currency, ctx)?.locked, c.id);
    assert.equal(unlockedValue(p.currency, ctx)?.cents, resolvePointValue(p.currency)?.cents, `${c.id}: transferable value is the headline median`);
  }
});
