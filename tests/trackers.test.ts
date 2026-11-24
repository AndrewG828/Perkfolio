import { test } from "node:test";
import assert from "node:assert/strict";
import { PROGRAMS, programForCard, programName, programUnit } from "../src/shared/data/strategy/programs";
import { currencyOfCard } from "../src/shared/lib/card-currency";
import { expirationPolicies } from "../src/shared/data/strategy/expiration";
import { BANK_CURRENCY_IDS, PROGRAM_IDS, awardPrograms, getCurrency, pointValues, programNames, unvaluedIds } from "../src/shared/data/points";
import { noValueReason, resolvePointValue } from "../src/shared/lib/point-value";
import { cards, getCard } from "../src/shared/data/cards";
import type { Card } from "../src/shared/data/types";
import type { Certificate, WalletState } from "../src/shared/lib/wallet";
import { addMonths, daysUntil, formatDate, isoDate } from "../src/shared/lib/dates";
import {
  balanceStatus,
  ownCardPrograms,
  centsPerPoint,
  certificateStatus,
  certificateTotals,
  expiryTone,
  missingPolicy,
  pointsVsCash,
  portfolioValue,
  redemptionStats,
  sortCertificates,
} from "../src/shared/lib/trackers";

const TODAY = new Date(2026, 10, 24, 15, 30); // Nov 24, 2026, mid-afternoon local time

test("date helpers work in local calendar days", () => {
  assert.equal(isoDate(TODAY), "2026-11-24");
  assert.equal(daysUntil("2026-11-24", TODAY), 0);
  assert.equal(daysUntil("2026-11-25", TODAY), 1);
  assert.equal(daysUntil("2026-11-23", TODAY), -1);
  assert.equal(daysUntil("2027-03-24", TODAY), 120);
  assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(addMonths("2024-11-15", 24), "2026-11-15");
  assert.equal(formatDate("2027-03-01"), "Mar 1, 2027");
});

test("expiry tones: red under 30 days, amber under 90, expired once past", () => {
  assert.equal(expiryTone(-1), "expired");
  assert.equal(expiryTone(0), "red");
  assert.equal(expiryTone(29), "red");
  assert.equal(expiryTone(30), "amber");
  assert.equal(expiryTone(89), "amber");
  assert.equal(expiryTone(90), "ok");
});

const cert = (o: Partial<Certificate>): Certificate => ({ id: Math.random().toString(36).slice(2), kind: "free-night", label: "Night", ...o });

test("certificates sort by expiry, classify by days left and total their value", () => {
  const list = [
    cert({ label: "Later", expires: "2027-06-01", valueUsd: 300 }),
    cert({ label: "Soon", expires: "2026-12-10", valueUsd: 200 }), // 16 days: red
    cert({ label: "No expiry", expires: null, valueUsd: 50 }),
    cert({ label: "Amber", expires: "2027-01-20", valueUsd: 100 }), // 57 days
    cert({ label: "Used", expires: "2026-12-01", valueUsd: 500, used: true }),
    cert({ label: "Expired", expires: "2026-11-01", valueUsd: 75 }),
  ];
  assert.deepEqual(
    sortCertificates(list).map((c) => c.label),
    ["Expired", "Soon", "Amber", "Later", "No expiry", "Used"],
  );
  assert.equal(certificateStatus(list[1], TODAY).tone, "red");
  assert.equal(certificateStatus(list[3], TODAY).tone, "amber");
  assert.equal(certificateStatus(list[0], TODAY).tone, "ok");
  assert.equal(certificateStatus(list[2], TODAY).tone, undefined);
  assert.equal(certificateStatus(list[5], TODAY).tone, "expired");
  const t = certificateTotals(list, TODAY);
  assert.deepEqual(t, { openCount: 4, openValue: 650, soonCount: 2, soonValue: 300, usedCount: 1, usedValue: 500, expiredCount: 1 });
});

test("cents per point is (cash - taxes) / points x 100", () => {
  assert.equal(centsPerPoint({ points: 60_000, taxesUsd: 5.5, cashPriceUsd: 1205.5 }), 2);
  assert.equal(centsPerPoint({ points: 0, taxesUsd: 0, cashPriceUsd: 100 }), null);
  // Taxes above the cash price is a bad redemption, and shows as negative.
  assert.ok((centsPerPoint({ points: 1000, taxesUsd: 50, cashPriceUsd: 40 }) ?? 0) < 0);
});

test("redemption stats weight by points and compare only the redemptions that have a valuation", () => {
  const cents = (p?: string) => (p === "united-mileageplus" ? 1.2 : p === "world-of-hyatt" ? 1.7 : undefined);
  const s = redemptionStats(
    [
      { id: "a", date: "2026-03-01", label: "SFO-NRT", program: "united-mileageplus", points: 100_000, taxesUsd: 50, cashPriceUsd: 2050 },
      { id: "b", date: "2026-05-01", label: "Park Hyatt", program: "world-of-hyatt", points: 25_000, taxesUsd: 0, cashPriceUsd: 300 },
      { id: "c", date: "2026-06-01", label: "Mystery", points: 10_000, taxesUsd: 0, cashPriceUsd: 100 },
    ],
    cents,
  );
  assert.equal(s.count, 3);
  assert.equal(s.points, 135_000);
  assert.equal(s.savings, 2400);
  assert.ok(Math.abs((s.averageCpp ?? 0) - (2400 / 135_000) * 100) < 1e-9);
  // Like with like: the two valued redemptions got (2000 + 300) / 125k = 1.84¢ against (100k x 1.2 + 25k x 1.7) / 125k = 1.3¢.
  assert.equal(s.valued.count, 2);
  assert.equal(s.valued.points, 125_000);
  assert.ok(Math.abs((s.valued.cpp ?? 0) - 1.84) < 1e-9);
  assert.ok(Math.abs((s.valued.valuationCpp ?? 0) - 1.3) < 1e-9);
  // United: 2000 - 1200 = +800; Hyatt: 300 - 425 = -125; the unvalued one is left out.
  assert.ok(Math.abs(s.valued.vsValuationUsd - 675) < 1e-9);
  // The review's case: a redemption with no published value doesn't inflate the comparison.
  const mixed = redemptionStats(
    [
      { id: "h", date: "2026-03-01", label: "Hilton", program: "hilton-honors", points: 100_000, taxesUsd: 0, cashPriceUsd: 190 },
      { id: "t", date: "2026-04-01", label: "TAP", program: "tap-miles-and-go", points: 50_000, taxesUsd: 40, cashPriceUsd: 3500 },
    ],
    (p) => resolvePointValue(p)?.cents,
  );
  assert.equal(mixed.valued.count, 1);
  assert.ok(Math.abs((mixed.valued.cpp ?? 0) - 0.19) < 1e-9);
  assert.ok((mixed.averageCpp ?? 0) > 2);
});

test("points vs cash gives a verdict against the valuation and the dollars at stake", () => {
  const good = pointsVsCash({ points: 50_000, taxesUsd: 100, cashPriceUsd: 1100, valuationCents: 1.5 });
  assert.equal(good.cpp, 2);
  assert.equal(good.verdict, "points");
  assert.equal(good.pointsWorthUsd, 750);
  assert.equal(good.cashSavedUsd, 1000);
  assert.equal(good.advantageUsd, 250);
  const bad = pointsVsCash({ points: 50_000, taxesUsd: 0, cashPriceUsd: 400, valuationCents: 1.5 });
  assert.equal(bad.verdict, "cash");
  assert.equal(bad.advantageUsd, -350);
  assert.equal(pointsVsCash({ points: 10_000, taxesUsd: 0, cashPriceUsd: 151, valuationCents: 1.5 }).verdict, "even");
  assert.equal(pointsVsCash({ points: 10_000, taxesUsd: 0, cashPriceUsd: 150 }).verdict, undefined);
});

test("balances: inactivity expiry from the last activity, stale nudges, bank points need an open card", () => {
  const aa = balanceStatus("american-aadvantage", { points: 40_000, updated: "2026-11-20", lastActivity: "2025-01-10" }, TODAY, { earningCard: false });
  assert.equal(aa.kind, "date");
  assert.equal(aa.expires, "2027-01-10");
  assert.equal(aa.tone, "amber");
  const soon = balanceStatus("american-aadvantage", { points: 1, updated: "2026-11-20", lastActivity: "2024-12-01" }, TODAY, { earningCard: false });
  assert.equal(soon.tone, "red");
  assert.equal(balanceStatus("american-aadvantage", { points: 1, updated: "2026-11-20" }, TODAY, { earningCard: false }).kind, "needs-activity");
  assert.equal(balanceStatus("delta-skymiles", { points: 1, updated: "2026-11-20" }, TODAY, { earningCard: false }).kind, "never");
  assert.equal(balanceStatus("amex-mr", { points: 1, updated: "2026-11-20" }, TODAY, { earningCard: true }).kind, "while-open");
  const risk = balanceStatus("amex-mr", { points: 1, updated: "2026-11-20" }, TODAY, { earningCard: false });
  assert.equal(risk.kind, "at-risk");
  const stale = balanceStatus("delta-skymiles", { points: 1, updated: "2026-09-25" }, TODAY, { earningCard: false });
  assert.equal(stale.daysSinceUpdate, 60);
  assert.equal(stale.stale, true);
  assert.equal(balanceStatus("delta-skymiles", { points: 1, updated: "2026-09-26" }, TODAY, { earningCard: false }).stale, false);
});

test("portfolio value uses the median valuation unless the user overrides it", () => {
  const balances = { "chase-ur": { points: 100_000, updated: "2026-11-01" }, "made-up": { points: 5, updated: "2026-11-01" } };
  const median = resolvePointValue("chase-ur")!.cents;
  assert.equal(median, pointValues.find((v) => v.id === "chase-ur")!.median);
  assert.deepEqual(portfolioValue(balances), { totalUsd: 100_000 * median / 100, valued: 1, unvalued: ["made-up"] });
  assert.equal(portfolioValue(balances, { own: { "chase-ur": 2.5 } }).totalUsd, 2500);
  assert.equal(resolvePointValue("chase-ur", { own: { "chase-ur": -1 } })!.cents, median, "a nonsense own value is ignored");
  // A wallet that earns ThankYou points only on a Double Cash can't transfer them at full value: they're cash back, 1¢,
  // as the card itself is everywhere else. With a Strata Premier they're worth the published median.
  const citi = { "citi-typ": { points: 10_000, updated: "2026-11-01" } };
  assert.equal(portfolioValue(citi, { cards: ["citi-double-cash"] }).totalUsd, 100);
  assert.equal(resolvePointValue("citi-typ", { cards: ["citi-double-cash"] })!.basis, "cash");
  assert.equal(resolvePointValue("citi-typ", { cards: ["citi-double-cash", "citi-strata-premier"] })!.cents, 1.9);
});

test("strategy data: the program list is the Points & Miles list, and every program has a policy or a reason", () => {
  const ids = PROGRAMS.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
  // Derived from the Points & Miles data, so names can't drift: every bank currency and every program id, named the same.
  assert.deepEqual(ids.slice(), [...BANK_CURRENCY_IDS, ...PROGRAM_IDS]);
  for (const id of BANK_CURRENCY_IDS) assert.equal(programName(id), getCurrency(id)!.name, id);
  for (const id of PROGRAM_IDS) assert.equal(programName(id), programNames[id].name, id);
  assert.equal(PROGRAMS.find((p) => p.id === "virgin-red")?.kind, "other", "a bridge program is grouped apart");
  // Units come from program-names.ts (no Points & Miles guides loaded): each must match its guide's currency.
  for (const g of awardPrograms) {
    const unit = /\bavios\b/i.test(g.currency) ? "Avios" : /miles/i.test(g.currency) ? "miles" : "points";
    assert.equal(programUnit(g.id), unit, `${g.id}: ${g.currency}`);
  }
  assert.ok(ids.includes("copa-connectmiles"));
  // Units read from what each program calls its points.
  for (const id of ["british-airways-club", "iberia-club", "aer-lingus-aerclub", "qatar-privilege-club", "finnair-plus"]) assert.equal(programUnit(id), "Avios", id);
  for (const id of ["capital-one", "united-mileageplus", "delta-skymiles", "american-aadvantage", "avianca-lifemiles", "copa-connectmiles"]) assert.equal(programUnit(id), "miles", id);
  for (const id of ["amex-mr", "chase-ur", "world-of-hyatt", "southwest-rapid-rewards", "virgin-atlantic-flying-club", "qantas-frequent-flyer"]) assert.equal(programUnit(id), "points", id);
  const policyIds = expirationPolicies.programs.map((p) => p.id);
  const noPolicy = expirationPolicies.missing.map((m) => m.id);
  for (const id of [...policyIds, ...noPolicy, ...pointValues.map((v) => v.id), ...unvaluedIds]) assert.ok(ids.includes(id), `unknown program ${id}`);
  for (const id of policyIds) assert.ok(!noPolicy.includes(id), `policy for ${id}`);
  assert.equal(policyIds.length, 41);
  assert.deepEqual(noPolicy, ["thai-royal-orchid-plus"]);
  // Copa ConnectMiles joined the list with the Points & Miles data: no policy or value researched yet, so none is shown.
  assert.deepEqual(ids.filter((id) => !policyIds.includes(id) && !noPolicy.includes(id)), ["copa-connectmiles"]);
  assert.equal(resolvePointValue("copa-connectmiles"), undefined);
  assert.equal(missingPolicy("copa-connectmiles"), undefined);
  for (const p of expirationPolicies.programs) {
    if (p.rule === "inactivity" || p.rule === "fixed-term") assert.ok((p.months ?? 0) > 0, p.id);
    assert.match(p.asOf, /^\d{4}-\d{2}$/);
    assert.ok(p.sources.length > 0, p.id);
    assert.doesNotMatch(`${p.activity} ${p.notes}`, /correction|seed|placeholder|single report/i, p.id);
  }
  const card = (id: string) => getCard(id) as Card;
  assert.equal(programForCard(card("amex-gold")), "amex-mr");
  assert.equal(programForCard(card("chase-freedom-unlimited")), "chase-ur");
  assert.equal(programForCard(card("citi-double-cash")), "citi-typ");
  // One classifier: the tracker files a card's points where every value comes from (currencyOfCard).
  assert.equal(programForCard(card("wells-fargo-active-cash")), undefined, "cash back, as everywhere else");
  assert.equal(programForCard(card("capital-one-savor")), "capital-one");
  assert.equal(programForCard(card("amex-blue-cash-everyday")), undefined);
  for (const c of cards) {
    const id = programForCard(c);
    if (id) assert.ok(ids.includes(id), `${c.id} → ${id}`);
    const p = currencyOfCard(c);
    assert.equal(id, p ? (p.kind === "currency" ? p.currency : p.program) : undefined, c.id);
  }
});

test("programs without a valuation or a policy still work: no value until the user sets one, no expiry guess", () => {
  assert.equal(resolvePointValue("virgin-red"), undefined);
  assert.deepEqual(resolvePointValue("virgin-red", { own: { "virgin-red": 1.1 } }), { cents: 1.1, basis: "own", id: "virgin-red" });
  assert.equal(noValueReason("virgin-red"), "Not listed in the November 2026 tables of The Points Guy, Upgraded Points or NerdWallet.");
  assert.equal(noValueReason("chase-ur"), undefined);
  const balances = { "virgin-red": { points: 10_000, updated: "2026-11-01" }, "united-mileageplus": { points: 10_000, updated: "2026-11-01" } };
  assert.deepEqual(portfolioValue(balances), { totalUsd: 120, valued: 1, unvalued: ["virgin-red"] });
  assert.equal(portfolioValue(balances, { own: { "virgin-red": 1 } }).totalUsd, 220);
  assert.equal(pointsVsCash({ points: 10_000, taxesUsd: 0, cashPriceUsd: 150, valuationCents: resolvePointValue("tap-miles-and-go")?.cents }).verdict, undefined);
  const thai = balanceStatus("thai-royal-orchid-plus", { points: 1, updated: "2026-11-20" }, TODAY, { earningCard: false });
  assert.equal(thai.kind, "no-data");
  assert.ok(missingPolicy("thai-royal-orchid-plus"));
  assert.equal(balanceStatus("virgin-red", { points: 1, updated: "2026-11-20" }, TODAY, { earningCard: false }).kind, "never");
});

test("co-brand cardholders: World of Hyatt and AAdvantage points don't expire while the card is open", () => {
  const old = { points: 40_000, updated: "2026-11-20", lastActivity: "2024-08-01" };
  // With a card that earns them in the wallet, the inactivity clock doesn't apply (the policy says so).
  assert.equal(balanceStatus("world-of-hyatt", old, TODAY, { earningCard: true }).kind, "card-exempt");
  assert.equal(balanceStatus("american-aadvantage", old, TODAY, { earningCard: true }).kind, "card-exempt");
  assert.equal(balanceStatus("american-aadvantage", old, TODAY, { earningCard: true }).tone, undefined);
  // Without one, the 24 months count from the last activity.
  const lapsed = balanceStatus("world-of-hyatt", old, TODAY, { earningCard: false });
  assert.equal(lapsed.kind, "date");
  assert.equal(lapsed.tone, "expired");
  // Programs whose notes give no card exemption aren't affected by holding a card.
  assert.equal(balanceStatus("hilton-honors", old, TODAY, { earningCard: true }).kind, "date");
  assert.equal(balanceStatus("marriott-bonvoy", old, TODAY, { earningCard: true }).kind, "date");
  const hyatt = expirationPolicies.programs.find((p) => p.id === "world-of-hyatt");
  assert.match(hyatt?.notes ?? "", /points don't expire while the card account is open/);
});

test("fixed-term programs carry a caveat from their notes instead of 'whatever you do'", () => {
  for (const p of expirationPolicies.programs.filter((x) => x.rule === "fixed-term")) {
    assert.ok(p.caveat, `${p.id}: caveat`);
    assert.doesNotMatch(p.caveat ?? "", /whatever you do/i, p.id);
  }
  const eva = expirationPolicies.programs.find((p) => p.id === "eva-air-infinity-mileagelands");
  assert.match(eva?.caveat ?? "", /disagree/);
  assert.match(eva?.activity ?? "", /sources disagree/);
  const turkish = expirationPolicies.programs.find((p) => p.id === "turkish-miles-and-smiles");
  assert.match(turkish?.caveat ?? "", /for a fee/);
  // Wyndham keeps each outlet's own wording: TPG on points the cardmember earns, Upgraded Points on points earned with the card.
  const wyndham = expirationPolicies.programs.find((p) => p.id === "wyndham-rewards");
  assert.match(wyndham?.notes ?? "", /TPG says points they earn don't expire/);
  assert.match(wyndham?.notes ?? "", /Upgraded Points says points earned with the card don't expire/);
});

test("Aeroplan: a deadline that fell during the expiry pause moves to the day expiry resumes", () => {
  const old = balanceStatus("air-canada-aeroplan", { points: 50_000, updated: "2026-11-20", lastActivity: "2024-06-01" }, TODAY, { earningCard: false });
  assert.equal(old.expires, "2026-11-30");
  assert.equal(old.resumes, true);
  assert.equal(old.tone, "red");
  const recent = balanceStatus("air-canada-aeroplan", { points: 1, updated: "2026-11-20", lastActivity: "2026-01-10" }, TODAY, { earningCard: false });
  assert.equal(recent.expires, "2027-07-10");
  assert.equal(recent.resumes, undefined);
});

test("co-brand exemptions go by the user's own cards: history-only cards count, authorized-user cards don't", () => {
  const W = (o: Partial<WalletState>): WalletState => ({ version: 1, cards: [], usage: {}, ignored: {}, ...o });
  const old = { points: 60_000, updated: "2026-11-20", lastActivity: "2024-06-01" };
  const status = (w: WalletState) => {
    const own = ownCardPrograms(w);
    return balanceStatus("american-aadvantage", old, TODAY, { earningCard: own.open.has("american-aadvantage"), closedCardOn: own.closed.get("american-aadvantage") });
  };
  // An authorized user on someone's AAdvantage Executive isn't a primary cardmember: the 24 months apply.
  const au = W({ cards: ["citi-aadvantage-executive"], applications: [{ id: "a1", issuer: "Citi", cardId: "citi-aadvantage-executive", opened: "2025-02", business: false, authorizedUser: true }] });
  assert.equal(ownCardPrograms(au).open.has("american-aadvantage"), false);
  const lapsed = status(au);
  assert.equal(lapsed.kind, "date");
  assert.equal(lapsed.tone, "expired");
  // The user's own card, in the wallet only, still counts.
  assert.equal(status(W({ cards: ["citi-aadvantage-executive"] })).kind, "card-exempt");
  // A Barclays Aviator exists only in the card history (we don't list it): its name says AAdvantage.
  const aviator = W({ applications: [{ id: "a2", issuer: "Barclays", name: "AAdvantage Aviator Red", opened: "2023-05", business: false }] });
  assert.equal(status(aviator).kind, "card-exempt");
  // Closed in Oct 2026: miles last four months after closing when that's later than 24 months after the last activity.
  const closed = W({ applications: [{ id: "a3", issuer: "Barclays", name: "Aviator Red", opened: "2023-05", closed: "2026-10", business: false }] });
  const grace = status(closed);
  assert.equal(grace.kind, "date");
  assert.equal(grace.expires, "2027-02-01");
  assert.equal(grace.afterClosing, true);
  // Bank points: a card the user is an authorized user on doesn't keep their own balance safe.
  const mr = W({ cards: ["amex-gold"], applications: [{ id: "a4", issuer: "American Express", cardId: "amex-gold", opened: "2024-01", business: false, authorizedUser: true }] });
  assert.equal(balanceStatus("amex-mr", { points: 1, updated: "2026-11-20" }, TODAY, { earningCard: ownCardPrograms(mr).open.has("amex-mr") }).kind, "at-risk");
  const aa = expirationPolicies.programs.find((p) => p.id === "american-aadvantage");
  assert.equal(aa?.cardExemption?.primary, true);
});

test("inactivity programs whose research narrows or disputes what counts as activity carry a caveat", () => {
  const caveat = (id: string) => expirationPolicies.programs.find((p) => p.id === id)?.caveat ?? "";
  assert.match(caveat("etihad-guest"), /Only a flight/);
  assert.match(caveat("accor-live-limitless"), /only an eligible hotel stay/);
  assert.match(caveat("qatar-privilege-club"), /disagree on what resets/);
  assert.match(caveat("avianca-lifemiles"), /not redeeming/);
  assert.match(caveat("finnair-plus"), /British Airways Club/);
  assert.match(caveat("air-france-klm-flying-blue"), /co-brand card/);
  // Aeroméxico's "doesn't expire" rests on its card terms and TPG; Upgraded Points still gives 24 months.
  assert.match(caveat("aeromexico-rewards"), /one report still describes a 24-month/);
  assert.match(expirationPolicies.programs.find((p) => p.id === "aeromexico-rewards")?.notes ?? "", /Some 2026 guides still give a 24-month inactivity rule/);
});

test("anniversary credits count from the card history's open date when none is entered on the tracker", async () => {
  const { openDateFor, statusFor } = await import("../src/shared/lib/credit-status");
  const { getCard: get } = await import("../src/shared/data/cards");
  const vx = get("capital-one-venture-x")!;
  const miles = vx.credits.find((c) => c.id === "anniversary-miles")!;
  const now = new Date(2026, 10, 24);
  const base: WalletState = { version: 1, cards: [vx.id], usage: {}, ignored: {} };
  // No date anywhere: the calendar year, and the tracker asks for the open date.
  const none = statusFor(vx, miles, base, now);
  assert.equal(none.needsOpenDate, true);
  assert.equal(none.daysLeft, 38, "to Dec 31");
  // Opened Aug 2025 (month only, from the card history): the card year runs from Aug 1, so no December countdown.
  const history = { ...base, applications: [{ id: "a1", issuer: "Capital One", cardId: vx.id, opened: "2025-08", business: false }] };
  assert.deepEqual(openDateFor(vx, history), { date: "2025-08-01", monthOnly: true });
  const fromMonth = statusFor(vx, miles, history, now);
  assert.equal(fromMonth.needsOpenDate, false);
  assert.equal(fromMonth.openMonthOnly, true);
  assert.ok(fromMonth.daysLeft > 240, `${fromMonth.daysLeft} days left`);
  // Marked used on the month's card year, it stays used once the exact day is entered.
  const used = { ...history, usage: { [`${vx.id}:${miles.id}:${fromMonth.periodKey}`]: miles.amountPerPeriod } };
  const exact = statusFor(vx, miles, { ...used, openDates: { [vx.id]: "2025-08-15" } }, now);
  assert.equal(exact.openMonthOnly, false);
  assert.equal(exact.used, miles.amountPerPeriod);
  // The calendar export dates them the same way: the card year from Aug 1, reminded 30 days before, not "reset Jan 1".
  const { buildCalendar } = await import("../src/frontend/lib/ics");
  // (Lines are folded at 75 octets: unfold them first.)
  const ics = buildCalendar([vx], history, now).replace(/\r\n /g, "");
  assert.match(ics, /reset on your card anniversary/);
  assert.doesNotMatch(ics, /reset Jan 1/);
  assert.match(ics, /DTSTART;VALUE=DATE:20270702/, "30 days before Aug 1, 2027");
  // A closed account or an authorized-user card doesn't set the date.
  assert.equal(openDateFor(vx, { ...base, applications: [{ id: "a2", issuer: "Capital One", cardId: vx.id, opened: "2025-08", business: false, closed: "2026-01" }] }), null);
  assert.equal(openDateFor(vx, { ...base, applications: [{ id: "a3", issuer: "Capital One", cardId: vx.id, opened: "2025-08", business: false, authorizedUser: true }] }), null);
});
