import { test } from "node:test";
import assert from "node:assert/strict";
import { cards, getCard } from "../src/shared/data/cards";
import { applicationRules } from "../src/shared/data/strategy/application-rules";
import type { ApplicationRule } from "../src/shared/data/strategy/types";
import type { Card } from "../src/shared/data/types";
import type { CardApplication, WalletState } from "../src/shared/lib/wallet";
import {
  accountHistory,
  chase524,
  dropOffDate,
  evaluateCard,
  historyContext,
  isClosedToApplicants,
  sameIssuer,
} from "../src/shared/lib/eligibility";
import { firstYearValue, rankNextCards } from "../src/shared/lib/next-card";

const TODAY = new Date(2026, 10, 24); // Nov 24, 2026, local time
const card = (id: string) => getCard(id) as Card;
const W = (o: Partial<WalletState> = {}): WalletState => ({ version: 1, cards: [], usage: {}, ignored: {}, ...o });
let n = 0;
const app = (o: Partial<CardApplication> & Pick<CardApplication, "opened">): CardApplication => ({
  id: `a${++n}`,
  issuer: o.cardId ? card(o.cardId).issuer : "Barclays",
  business: o.cardId ? card(o.cardId).category === "business" : false,
  ...o,
});
const rule = (id: string) => applicationRules.rules.find((r) => r.id === id) as ApplicationRule;
const check = (cardId: string, wallet: WalletState, ruleId: string) => {
  const res = evaluateCard(card(cardId), historyContext(wallet, TODAY), [rule(ruleId)]);
  return res.results[0];
};

test("drop-off dates are conservative for month-only dates and exact for full dates", () => {
  assert.equal(dropOffDate("2024-11", 24), "2026-12-01");
  assert.equal(dropOffDate("2024-12", 24), "2027-01-01");
  assert.equal(dropOffDate("2024-11-15", 24), "2026-11-16");
  assert.equal(dropOffDate("2024-02-29", 24), "2026-03-01");
});

test("5/24 counts personal cards from any issuer, with the day each drops off", () => {
  const wallet = W({
    applications: [
      app({ cardId: "amex-gold", opened: "2024-11" }), // counts through Nov 30, 2026
      app({ cardId: "capital-one-venture-x", opened: "2025-06", closed: "2026-01" }), // closed still counts
      app({ name: "Barclays AAdvantage Aviator", issuer: "Barclays", opened: "2026-02" }),
      app({ cardId: "chase-ink-business-preferred", opened: "2026-03" }), // business: doesn't count
      app({ cardId: "citi-strata-premier", opened: "2024-10" }), // dropped off Nov 1, 2026
    ],
  });
  const c = chase524(historyContext(wallet, TODAY));
  assert.equal(c.count, 3);
  assert.equal(c.status, "under");
  assert.deepEqual(
    c.counted.map((x) => [x.record.cardId ?? x.record.name, x.dropOff]),
    [
      ["amex-gold", "2026-12-01"],
      ["capital-one-venture-x", "2027-07-01"],
      ["Barclays AAdvantage Aviator", "2028-03-01"],
    ],
  );
  assert.equal(check("chase-sapphire-preferred", wallet, "chase-5-24").status, "eligible");
});

test("at 5/24 Chase cards are blocked until enough cards drop off", () => {
  const opened = ["2024-12", "2025-02", "2025-05", "2025-09", "2026-01", "2026-06"];
  const wallet = W({ applications: opened.map((o, i) => app({ name: `Card ${i}`, opened: o })) });
  const c = chase524(historyContext(wallet, TODAY));
  assert.equal(c.count, 6);
  assert.equal(c.status, "at-limit");
  // Two have to drop off to get under 5: Dec 2024 (Jan 1, 2027) and Feb 2025 (Mar 1, 2027).
  assert.equal(c.underOn, "2027-03-01");
  const r = check("chase-sapphire-preferred", wallet, "chase-5-24");
  assert.equal(r.status, "blocked");
  assert.equal(r.until, "2027-03-01");
  const all = evaluateCard(card("chase-sapphire-preferred"), historyContext(wallet, TODAY));
  assert.equal(all.status, "blocked");
  assert.equal(all.until, "2027-03-01");
});

test("wallet cards without open dates make the count unknown only when they could matter", () => {
  const apps = ["2025-01", "2025-04", "2025-08"].map((o, i) => app({ name: `Card ${i}`, opened: o }));
  const two = W({ applications: apps, cards: ["amex-platinum", "capital-one-venture-x"] });
  const r = check("chase-sapphire-preferred", two, "chase-5-24");
  assert.equal(r.status, "unknown");
  assert.equal(r.missing?.length, 2);
  // An open date settles it; a business card never counts.
  const dated = W({ ...two, openDates: { "amex-platinum": "2019-05-01" } });
  assert.equal(check("chase-sapphire-preferred", dated, "chase-5-24").status, "eligible");
  const biz = W({ applications: apps, cards: ["amex-business-platinum"] });
  assert.equal(check("chase-sapphire-preferred", biz, "chase-5-24").status, "eligible");
  // An open application covers the wallet card, so it isn't double counted.
  const covered = W({ applications: [...apps, app({ cardId: "amex-platinum", opened: "2021-01" })], cards: ["amex-platinum"] });
  assert.equal(accountHistory(covered).filter((r) => r.cardId === "amex-platinum").length, 1);
});

test("without any application history, rules that need it are unknown (and known blocks still block)", () => {
  const empty = W({ cards: ["amex-gold"] });
  const r = check("chase-sapphire-preferred", empty, "chase-5-24");
  assert.equal(r.status, "unknown");
  assert.deepEqual(r.missing, ["your card history"]);
  assert.equal(check("amex-platinum", empty, "amex-once-per-lifetime").status, "unknown");
  // Holding the card is a known fact.
  assert.equal(check("amex-gold", empty, "amex-once-per-lifetime").status, "blocked");
  // Confirming there's nothing to add gives a real answer.
  assert.equal(check("amex-platinum", W({ cards: ["amex-gold"], applications: [] }), "amex-once-per-lifetime").status, "eligible");
});

test("once per lifetime: having had the card blocks the bonus for good", () => {
  const wallet = W({ applications: [app({ cardId: "amex-platinum", opened: "2019-03", closed: "2021-04", bonusEarned: "2019-06" })] });
  const r = check("amex-platinum", wallet, "amex-once-per-lifetime");
  assert.equal(r.status, "blocked");
  assert.equal(r.permanent, true);
  assert.equal(r.until, undefined);
  assert.match(r.reason, /opened Mar 2019/);
  assert.equal(check("amex-gold", wallet, "amex-once-per-lifetime").status, "eligible");
  const e = evaluateCard(card("amex-platinum"), historyContext(wallet, TODAY));
  assert.equal(e.bonus, "blocked");
  assert.equal(e.permanent, true);
  assert.equal(e.until, undefined);
});

test("family rules: holding a family card or a recent family bonus blocks; lifetime families never clear", () => {
  const holdingCsr = W({ applications: [], cards: ["chase-sapphire-reserve"], openDates: { "chase-sapphire-reserve": "2020-01-10" } });
  const r1 = check("chase-sapphire-preferred", holdingCsr, "chase-sapphire-bonus");
  assert.equal(r1.status, "blocked");
  assert.equal(r1.until, undefined);
  assert.match(r1.action ?? "", /no longer have the Chase Sapphire Reserve/);

  const closedRecent = W({
    applications: [app({ cardId: "chase-sapphire-reserve", opened: "2023-11", closed: "2025-01", bonusEarned: "2024-01" })],
  });
  const r2 = check("chase-sapphire-preferred", closedRecent, "chase-sapphire-bonus");
  assert.equal(r2.status, "blocked");
  assert.equal(r2.until, "2028-02-01");

  const closedOld = W({
    applications: [app({ cardId: "chase-sapphire-reserve", opened: "2019-11", closed: "2021-01", bonusEarned: "2020-01" })],
  });
  assert.equal(check("chase-sapphire-preferred", closedOld, "chase-sapphire-bonus").status, "eligible");

  const hadReserve = W({ applications: [app({ cardId: "amex-delta-reserve", opened: "2018-05", closed: "2019-05" })] });
  const r3 = check("amex-delta-platinum", hadReserve, "amex-delta-family");
  assert.equal(r3.status, "blocked");
  assert.equal(r3.permanent, true);
});

test("cooldown: blocked for the window after a bonus; unknown when a held card's bonus month is missing", () => {
  const earned = W({ applications: [app({ cardId: "citi-strata-premier", opened: "2023-02", closed: "2024-06", bonusEarned: "2023-05" })] });
  const r = check("citi-strata-premier", earned, "citi-48-month");
  assert.equal(r.status, "blocked");
  assert.equal(r.until, "2027-06-01");

  // An application with no bonus month means no bonus was earned.
  const noBonus = W({ applications: [app({ cardId: "citi-strata-premier", opened: "2025-02", closed: "2025-09" })] });
  assert.equal(check("citi-strata-premier", noBonus, "citi-48-month").status, "eligible");

  // A wallet card with no history entry: we can't tell when (or if) its bonus posted.
  const held = W({ applications: [], cards: ["citi-strata-premier"], openDates: { "citi-strata-premier": "2024-08-01" } });
  const u = check("citi-strata-premier", held, "citi-48-month");
  assert.equal(u.status, "unknown");
  assert.match(u.missing?.[0] ?? "", /when you earned the Citi Strata Premier/);
  // ...unless it was opened long enough ago that any bonus is outside the window.
  const old = W({ applications: [], cards: ["citi-strata-premier"], openDates: { "citi-strata-premier": "2019-01-01" } });
  assert.equal(check("citi-strata-premier", old, "citi-48-month").status, "eligible");
});

test("velocity and max-open rules count only the issuer's (or family's) cards", () => {
  const venture = W({ applications: [app({ cardId: "capital-one-venture-x", opened: "2026-08" })] });
  const v = check("capital-one-venture", venture, "capital-one-1-6");
  assert.equal(v.status, "blocked");
  assert.equal(v.until, "2027-03-01");
  assert.equal(check("capital-one-venture", W({ applications: [app({ cardId: "chase-sapphire-preferred", opened: "2026-08" })] }), "capital-one-1-6").status, "eligible");

  const five = ["amex-blue-cash-preferred", "amex-blue-cash-everyday", "amex-delta-reserve", "amex-hilton-aspire", "amex-marriott-brilliant"];
  const full = W({ applications: five.map((id) => app({ cardId: id, opened: "2018-01" })) });
  const m = check("amex-delta-platinum", full, "amex-five-credit-cards");
  assert.equal(m.status, "blocked");
  assert.equal(m.until, undefined);
  // Charge cards (not in the family) don't count; closing one frees a slot.
  const withCharge = W({ applications: [...five.slice(0, 4).map((id) => app({ cardId: id, opened: "2018-01" })), app({ cardId: "amex-platinum", opened: "2018-01" })] });
  assert.equal(check("amex-delta-platinum", withCharge, "amex-five-credit-cards").status, "eligible");
});

test("held and closed cards are left out of the next-card ranking; blocked ones sort by when they clear", () => {
  const wallet = W({
    cards: ["chase-sapphire-preferred"],
    applications: [
      app({ cardId: "chase-sapphire-preferred", opened: "2025-03", bonusEarned: "2025-05" }),
      app({ cardId: "capital-one-venture-x", opened: "2026-09" }),
      app({ cardId: "amex-platinum", opened: "2020-01", closed: "2022-01" }),
    ],
  });
  const ranking = rankNextCards({ wallet, today: TODAY });
  assert.ok(ranking.held.some((c) => c.id === "chase-sapphire-preferred"));
  assert.ok(ranking.closed.some((c) => c.id === "amex-green"));
  assert.ok(ranking.blocked.some((c) => c.card.id === "chase-sapphire-reserve"));
  const dated = ranking.blocked.filter((c) => c.eligibility.until).map((c) => c.eligibility.until as string);
  assert.deepEqual(dated, [...dated].sort());
  const firstPermanent = ranking.blocked.findIndex((c) => c.eligibility.permanent);
  assert.ok(firstPermanent === -1 || ranking.blocked.slice(firstPermanent).every((c) => c.eligibility.permanent));
  for (let i = 1; i < ranking.eligible.length; i++) assert.ok(ranking.eligible[i - 1].value.total >= ranking.eligible[i].value.total);
  assert.ok(ranking.eligible.every((c) => c.card.category !== "business"));
});

test("first-year value adds only the credits the user marks usable", () => {
  const csr = card("chase-sapphire-reserve");
  const none = firstYearValue(csr, () => false);
  assert.equal(none.total, csr.welcomeOfferValue - csr.annualFee);
  const travel = firstYearValue(csr, (id) => id === "travel-credit");
  assert.equal(travel.credits, 300);
  assert.equal(travel.total, none.total + 300);
});

test("seed rules reference real cards and every logic type is well formed", () => {
  const ids = new Set(cards.map((c) => c.id));
  for (const r of applicationRules.rules) {
    for (const id of [...r.appliesTo, ...(r.logic.family ?? [])]) assert.ok(ids.has(id), `${r.id}: unknown card ${id}`);
    if (["max-new-cards", "velocity", "cooldown"].includes(r.logic.type)) assert.ok((r.logic.months ?? 0) > 0, r.id);
    if (["max-new-cards", "velocity", "max-open"].includes(r.logic.type)) assert.ok((r.logic.count ?? 0) > 0, r.id);
    assert.match(r.asOf, /^\d{4}-\d{2}-\d{2}$/);
  }
  assert.ok(sameIssuer("Amex", "American Express"));
  assert.ok(sameIssuer("U.S. Bank", "US Bank"));
  assert.ok(!sameIssuer("Chase", "Citi"));
  assert.ok(isClosedToApplicants(card("amex-green")));
  assert.ok(!isClosedToApplicants(card("amex-gold")));
});
