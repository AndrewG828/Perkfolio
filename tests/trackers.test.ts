import { test } from "node:test";
import assert from "node:assert/strict";
import { PROGRAMS, programForCard } from "../src/shared/data/strategy/programs";
import { expirationPolicies } from "../src/shared/data/strategy/expiration";
import { valuations } from "../src/shared/data/strategy/valuations";
import { cards, getCard } from "../src/shared/data/cards";
import type { Card } from "../src/shared/data/types";
import type { Certificate } from "../src/shared/lib/wallet";
import { addMonths, daysUntil, formatDate, isoDate } from "../src/shared/lib/dates";
import {
  balanceStatus,
  centsFor,
  centsPerPoint,
  certificateStatus,
  certificateTotals,
  expiryTone,
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

test("redemption stats weight by points and compare with valuations", () => {
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
  // (100k x 1.2 + 25k x 1.7) / 125k = 1.3
  assert.ok(Math.abs((s.valuationCpp ?? 0) - 1.3) < 1e-9);
  // United: 2000 - 1200 = +800; Hyatt: 300 - 425 = -125; the unvalued one is left out.
  assert.ok(Math.abs(s.vsValuationUsd - 675) < 1e-9);
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
  const median = centsFor("chase-ur") as number;
  assert.deepEqual(portfolioValue(balances), { totalUsd: 100_000 * median / 100, valued: 1, unvalued: ["made-up"] });
  assert.equal(portfolioValue(balances, { "chase-ur": 2 }).totalUsd, 2000);
  assert.equal(centsFor("chase-ur", { "chase-ur": -1 }), median);
});

test("strategy data covers every program, and cards map to the currency they earn", () => {
  const ids = PROGRAMS.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(expirationPolicies.programs.map((p) => p.id).sort(), [...ids].sort());
  assert.deepEqual(valuations.valuations.map((v) => v.id).sort(), [...ids].sort());
  for (const v of valuations.valuations) assert.ok(v.low <= v.median && v.median <= v.high && v.median > 0, v.id);
  for (const p of expirationPolicies.programs) {
    if (p.rule === "inactivity" || p.rule === "fixed-term") assert.ok((p.months ?? 0) > 0, p.id);
  }
  const card = (id: string) => getCard(id) as Card;
  assert.equal(programForCard(card("amex-gold")), "amex-mr");
  assert.equal(programForCard(card("chase-freedom-unlimited")), "chase-ur");
  assert.equal(programForCard(card("citi-double-cash")), "citi-typ");
  assert.equal(programForCard(card("wells-fargo-active-cash")), "wells-fargo");
  assert.equal(programForCard(card("amex-blue-cash-everyday")), undefined);
  for (const c of cards) {
    const id = programForCard(c);
    if (id) assert.ok(ids.includes(id), `${c.id} → ${id}`);
  }
});
