import { test } from "node:test";
import assert from "node:assert/strict";
import { cards, getCard } from "../src/shared/data/cards";
import { applicationRules } from "../src/shared/data/strategy/application-rules";
import { DESCRIPTIVE_ONLY, NAMED_PRODUCTS, OTHER_PRODUCT_MATCHERS, matchesOtherProduct } from "../src/shared/data/strategy/other-products";
import type { ApplicationRule } from "../src/shared/data/strategy/types";
import type { Card } from "../src/shared/data/types";
import { NO_BONUS, type CardApplication, type WalletState } from "../src/shared/lib/wallet";
import {
  accountHistory,
  chase524,
  dropOffDate,
  evaluateCard,
  historyContext,
  isClosedToApplicants,
  sameIssuer,
  windowEnd,
  type UserFacts,
} from "../src/shared/lib/eligibility";
import { byRankValue, firstYearValue, rankNextCards } from "../src/shared/lib/next-card";
import { resolvePointValue } from "../src/shared/lib/point-value";

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
/** A card the dataset doesn't list, entered by name. */
const other = (name: string, issuer: string, o: Partial<CardApplication> & Pick<CardApplication, "opened">) => app({ name, issuer, ...o });
const rule = (id: string) => {
  const r = applicationRules.rules.find((x) => x.id === id);
  assert.ok(r, `no rule ${id}`);
  return r as ApplicationRule;
};
const check = (cardId: string, wallet: WalletState, ruleId: string, facts: UserFacts = {}) =>
  evaluateCard(card(cardId), historyContext(wallet, TODAY, facts), [rule(ruleId)]).results[0];

test("windows: calendar months for 5/24, exact days for day windows, month-only dates on the safe side", () => {
  // The research's example: opened in October 2024, it no longer counts from November 1, 2026.
  assert.equal(dropOffDate("2024-10", 24, true), "2026-11-01");
  assert.equal(dropOffDate("2024-10-15", 24, true), "2026-11-01");
  assert.equal(dropOffDate("2024-10-01", 24, true), "2026-11-01");
  // Other month windows run through the same day N months later; a month alone is taken as its last day.
  assert.equal(dropOffDate("2024-11", 24), "2026-12-01");
  assert.equal(dropOffDate("2024-11-15", 24), "2026-11-16");
  assert.equal(dropOffDate("2024-02-29", 24), "2026-03-01");
  // Day windows: an event on day D counts for N days.
  assert.equal(windowEnd("2026-11-20", { days: 8 }), "2026-11-28");
  assert.equal(windowEnd("2026-09-05", { days: 90 }), "2026-12-04");
  assert.equal(windowEnd("2026-11-21", { days: 5 }), "2026-11-26");
});

test("5/24 counts personal cards from any bank, plus business cards that show on personal reports", () => {
  const wallet = W({
    applications: [
      app({ cardId: "amex-gold", opened: "2024-10-15" }), // dropped off Nov 1, 2026
      app({ cardId: "capital-one-venture-x", opened: "2025-06", closed: "2026-01" }), // closed still counts
      other("AAdvantage Aviator Red", "Barclays", { opened: "2026-02" }),
      app({ cardId: "chase-ink-business-preferred", opened: "2026-03" }), // Chase business: doesn't count
      app({ cardId: "amex-business-gold", opened: "2026-04" }), // Amex business: doesn't count
      app({ cardId: "capital-one-venture-x-business", opened: "2026-05" }), // not on personal reports
      other("Spark Miles for Business", "Capital One", { business: true, opened: "2025-05" }), // reported: counts
      other("Spark Cash Plus", "Capital One", { business: true, opened: "2025-07" }), // not reported
    ],
  });
  const c = chase524(historyContext(wallet, TODAY));
  assert.equal(c.count, 3);
  assert.equal(c.status, "under");
  assert.deepEqual(
    c.counted.map((x) => [x.record.cardId ?? x.record.name, x.dropOff]),
    [
      ["Spark Miles for Business", "2027-06-01"],
      ["capital-one-venture-x", "2027-07-01"],
      ["AAdvantage Aviator Red", "2028-03-01"],
    ],
  );
  assert.equal(check("chase-sapphire-preferred", wallet, "chase-5-24").status, "eligible");
});

test("at 5/24 every Chase card is likely declined, business cards included, until enough drop off", () => {
  const opened = ["2024-12", "2025-02", "2025-05", "2025-09", "2026-01", "2026-06"];
  const wallet = W({ applications: opened.map((o, i) => other(`Card ${i}`, "Barclays", { opened: o })) });
  const c = chase524(historyContext(wallet, TODAY));
  assert.equal(c.count, 6);
  assert.equal(c.status, "at-limit");
  // Two have to drop off to get under 5: Dec 2024 (Jan 1, 2027) and Feb 2025 (Mar 1, 2027).
  assert.equal(c.underOn, "2027-03-01");
  const r = check("chase-ink-business-preferred", wallet, "chase-5-24");
  assert.equal(r.status, "blocked");
  assert.equal(r.effect, "likely-denied");
  assert.equal(r.until, "2027-03-01");
  const all = evaluateCard(card("chase-sapphire-preferred"), historyContext(wallet, TODAY));
  assert.equal(all.status, "blocked");
  assert.equal(all.until, "2027-03-01");
});

test("wallet cards without open dates make 5/24 unknown only when they could matter", () => {
  const apps = ["2025-01", "2025-04", "2025-08"].map((o, i) => other(`Card ${i}`, "Barclays", { opened: o }));
  const two = W({ applications: apps, cards: ["amex-platinum", "capital-one-venture-x"] });
  const r = check("chase-sapphire-preferred", two, "chase-5-24");
  assert.equal(r.status, "unknown");
  assert.equal(r.missing?.length, 2);
  const dated = W({ ...two, openDates: { "amex-platinum": "2019-05-01" } });
  assert.equal(check("chase-sapphire-preferred", dated, "chase-5-24").status, "eligible");
  assert.equal(check("chase-sapphire-preferred", W({ applications: apps, cards: ["amex-business-platinum"] }), "chase-5-24").status, "eligible");
  // An open application covers the wallet card, so it isn't double counted.
  const covered = W({ applications: [...apps, app({ cardId: "amex-platinum", opened: "2021-01" })], cards: ["amex-platinum"] });
  assert.equal(accountHistory(covered).filter((x) => x.cardId === "amex-platinum").length, 1);
});

test("Citi 8/65 counts days, and asks for the exact day when a month can't settle it", () => {
  const near = W({ applications: [app({ cardId: "citi-strata-premier", opened: "2026-11-20" })] });
  const r = check("citi-double-cash", near, "citi-8-65");
  assert.equal(r.status, "blocked");
  assert.equal(r.until, "2026-11-28");
  assert.ok(r.caveats?.some((c) => /Declined applications count/.test(c)));
  // November 1-24 could be inside the 8 days or not.
  const month = check("citi-double-cash", W({ applications: [app({ cardId: "citi-strata-premier", opened: "2026-11" })] }), "citi-8-65");
  assert.equal(month.status, "unknown");
  assert.deepEqual(month.missing, ["the day you opened your Citi Strata Premier Card"]);
  // Two weeks ago: clear of the 8 days, one of two in 65.
  const clear = check("citi-double-cash", W({ applications: [app({ cardId: "citi-strata-premier", opened: "2026-11-10" })] }), "citi-8-65");
  assert.equal(clear.status, "eligible");
  assert.match(clear.reason, /applied for 1 Citi card in the last 65 days; the limit is 2/);
  assert.ok(clear.caveats?.some((c) => /real cutoff is 60 days/.test(c)), "the 65-day window's note shows once a card is in it");
  // Two in 65 days: blocked until the older one is 65 days old.
  const two = W({ applications: [app({ cardId: "citi-strata-premier", opened: "2026-09-25" }), app({ cardId: "citi-strata-elite", opened: "2026-10-30" })] });
  assert.equal(check("citi-double-cash", two, "citi-8-65").until, "2026-11-29");
  // A business application counts toward the 65 days but not the 8.
  const biz = W({
    applications: [other("Citi business card", "Citi", { business: true, opened: "2026-11-20" }), app({ cardId: "citi-double-cash", opened: "2026-10-01" })],
  });
  const b = check("citi-strata-premier", biz, "citi-8-65");
  assert.equal(b.status, "blocked");
  assert.equal(b.until, "2026-12-05");
});

test("Amex: 1 credit card per 5 days blocks, 2 per 90 days is a soft warning, charge cards don't count", () => {
  const two = W({ applications: [app({ cardId: "amex-blue-cash-everyday", opened: "2026-09-05" }), app({ cardId: "amex-delta-platinum", opened: "2026-11-02" })] });
  const soft = check("amex-hilton-aspire", two, "amex-2-in-90-days");
  assert.equal(soft.status, "warning");
  assert.equal(soft.effect, "likely-denied");
  assert.equal(soft.until, "2026-12-04");
  const e = evaluateCard(card("amex-hilton-aspire"), historyContext(two, TODAY));
  assert.equal(e.approval, "warning");
  assert.equal(e.status, "warning");
  assert.equal(e.blocking.length, 0);

  const recent = W({ applications: [app({ cardId: "amex-delta-platinum", opened: "2026-11-21" })] });
  const hard = check("amex-hilton-aspire", recent, "amex-1-in-5-days");
  assert.equal(hard.status, "blocked");
  assert.equal(hard.until, "2026-11-26");

  const charge = W({ applications: [app({ cardId: "amex-gold", opened: "2026-11-21" }), app({ cardId: "amex-platinum", opened: "2026-10-01" })] });
  assert.equal(check("amex-hilton-aspire", charge, "amex-1-in-5-days").status, "eligible");
  assert.equal(check("amex-hilton-aspire", charge, "amex-2-in-90-days").status, "eligible");

  // A card we don't list counts as a credit card, and the result says so.
  const surpass = check("amex-marriott-brilliant", W({ applications: [other("Hilton Honors Surpass", "American Express", { opened: "2026-11-22" })] }), "amex-1-in-5-days");
  assert.equal(surpass.status, "blocked");
  assert.ok(surpass.caveats?.some((c) => /as a credit card/.test(c)));
});

test("max-open: about five open Amex credit cards is a soft limit; charge cards and closed cards don't count", () => {
  const five = ["amex-blue-cash-preferred", "amex-blue-cash-everyday", "amex-delta-reserve", "amex-hilton-aspire", "amex-marriott-brilliant"];
  const full = W({ applications: five.map((id) => app({ cardId: id, opened: "2018-01" })) });
  const m = check("amex-delta-platinum", full, "amex-credit-card-cap");
  assert.equal(m.status, "warning");
  assert.equal(m.action, "you close one of them");
  const mixed = W({
    applications: [
      ...five.slice(0, 4).map((id) => app({ cardId: id, opened: "2018-01" })),
      app({ cardId: "amex-platinum", opened: "2018-01" }),
      app({ cardId: "amex-marriott-brilliant", opened: "2018-01", closed: "2020-01" }),
    ],
  });
  assert.equal(check("amex-delta-platinum", mixed, "amex-credit-card-cap").status, "eligible");
});

test("Capital One: one new card per six months, personal and business together", () => {
  const month = check("capital-one-venture", W({ applications: [app({ cardId: "capital-one-venture-x", opened: "2026-08" })] }), "capital-one-6-months");
  assert.equal(month.status, "blocked");
  assert.equal(month.until, "2027-03-01");
  const day = check("capital-one-venture", W({ applications: [app({ cardId: "capital-one-venture-x", opened: "2026-08-10" })] }), "capital-one-6-months");
  assert.equal(day.until, "2027-02-11");
  const business = W({ applications: [app({ cardId: "capital-one-venture-x-business", opened: "2026-07-15" })] });
  assert.equal(check("capital-one-savor", business, "capital-one-6-months").status, "blocked");
  assert.equal(check("capital-one-venture", W({ applications: [app({ cardId: "chase-sapphire-preferred", opened: "2026-10" })] }), "capital-one-6-months").status, "eligible");
});

test("Bank of America 2/3/4: its own personal cards in 2, 12 and 24 months; business cards don't count", () => {
  const twoIn2 = W({ applications: [other("Customized Cash Rewards", "Bank of America", { opened: "2026-10-05" }), other("Travel Rewards", "Bank of America", { opened: "2026-11-01" })] });
  const r = check("atmos-rewards-summit", twoIn2, "bofa-2-3-4");
  assert.equal(r.status, "blocked");
  assert.equal(r.until, "2026-12-06");
  const threeIn12 = W({ applications: ["2026-01", "2026-04", "2026-07"].map((o) => other("Bank of America card", "Bank of America", { opened: o })) });
  const t = check("atmos-rewards-ascent", threeIn12, "bofa-2-3-4");
  assert.equal(t.status, "blocked");
  assert.equal(t.until, "2027-02-01");
  const biz = W({ applications: ["2026-09", "2026-10", "2026-11"].map((o) => other("Business Advantage", "Bank of America", { business: true, opened: o })) });
  assert.equal(check("atmos-rewards-ascent", biz, "bofa-2-3-4").status, "eligible");
});

test("Bank of America 7/12 or 3/12 depends on a deposit account, and we only ask when the answer matters", () => {
  const three = W({ applications: ["2026-02", "2026-04", "2026-07"].map((o, i) => other(`Card ${i}`, "Barclays", { opened: o })) });
  const ctx = historyContext(three, TODAY);
  const unanswered = evaluateCard(card("atmos-rewards-summit"), ctx);
  assert.deepEqual(unanswered.questions, ["hasBankOfAmericaDepositAccount"]);
  assert.equal(unanswered.results.find((r) => r.rule.id === "bofa-3-12")?.status, "unknown");
  assert.equal(unanswered.results.find((r) => r.rule.id === "bofa-7-12")?.status, "eligible");

  const no = evaluateCard(card("atmos-rewards-summit"), historyContext(three, TODAY, { hasBankOfAmericaDepositAccount: false }));
  const low = no.results.find((r) => r.rule.id === "bofa-3-12");
  assert.equal(low?.status, "warning"); // soft: a warning, never a block
  assert.equal(low?.until, "2027-03-01");
  assert.ok(!no.results.some((r) => r.rule.id === "bofa-7-12"));
  assert.equal(no.status, "warning");

  const yes = evaluateCard(card("atmos-rewards-summit"), historyContext(three, TODAY, { hasBankOfAmericaDepositAccount: true }));
  assert.ok(!yes.results.some((r) => r.rule.id === "bofa-3-12"));
  assert.equal(yes.results.find((r) => r.rule.id === "bofa-7-12")?.status, "eligible");
  assert.equal(yes.status, "eligible");

  // With one new card, neither threshold is near: no question.
  const one = W({ applications: [other("Card", "Barclays", { opened: "2026-05" })] });
  assert.deepEqual(evaluateCard(card("atmos-rewards-summit"), historyContext(one, TODAY)).questions, []);
});

test("Bank of America: the same card held in the last 24 months is likely declined", () => {
  const closed = check("atmos-rewards-ascent", W({ applications: [app({ cardId: "atmos-rewards-ascent", opened: "2023-02", closed: "2025-06" })] }), "bofa-24-month-same-card");
  assert.equal(closed.status, "blocked");
  assert.equal(closed.until, "2027-07-01");
  const held = check("atmos-rewards-ascent", W({ applications: [], cards: ["atmos-rewards-ascent"] }), "bofa-24-month-same-card");
  assert.equal(held.status, "blocked");
  assert.match(held.action ?? "", /24 months have passed since you closed it/);
  // Per card: the Summit isn't affected.
  assert.equal(check("atmos-rewards-summit", W({ applications: [app({ cardId: "atmos-rewards-ascent", opened: "2025-01" })] }), "bofa-24-month-same-card").status, "eligible");
});

test("Amex family ladders: Gold after Platinum, Delta Platinum after Reserve, Everyday after Preferred", () => {
  const hadPlatinum = W({ applications: [app({ cardId: "amex-platinum", opened: "2019-03", closed: "2021-04", bonusEarned: "2019-06" })] });
  const gold = check("amex-gold", hadPlatinum, "amex-gold-bonus");
  assert.equal(gold.status, "warning"); // Amex "may not" give the offer: a risk, not a firm no
  assert.equal(gold.effect, "bonus-at-risk");
  assert.equal(gold.permanent, true);
  assert.match(gold.reason, /opened Mar 2019/);
  const goldCard = evaluateCard(getCard("amex-gold") as Card, historyContext(hadPlatinum, TODAY));
  assert.equal(goldCard.bonus, "warning");
  assert.equal(goldCard.blocking.length, 0);
  // The ladder only goes one way.
  const hadGold = W({ applications: [app({ cardId: "amex-gold", opened: "2020-01" })] });
  assert.equal(check("amex-platinum", hadGold, "amex-platinum-bonus").status, "eligible");
  assert.equal(check("amex-platinum", W({ applications: [app({ cardId: "amex-business-platinum", opened: "2020-01" })] }), "amex-platinum-bonus").status, "eligible");
  const schwab = W({ applications: [other("Platinum Card Exclusively for Charles Schwab", "American Express", { opened: "2021-05" })] });
  assert.equal(check("amex-gold", schwab, "amex-gold-bonus").status, "warning");
  assert.equal(check("amex-platinum", schwab, "amex-platinum-bonus").status, "warning");

  const hadReserve = W({ applications: [app({ cardId: "amex-delta-reserve", opened: "2018-05", closed: "2019-05" })] });
  assert.equal(check("amex-delta-platinum", hadReserve, "amex-delta-platinum-bonus").status, "warning");
  assert.equal(check("amex-delta-reserve", W({ applications: [app({ cardId: "amex-delta-platinum", opened: "2018-05" })] }), "amex-delta-reserve-bonus").status, "eligible");

  const hadBcp = W({ applications: [app({ cardId: "amex-blue-cash-preferred", opened: "2022-01" })] });
  assert.equal(check("amex-blue-cash-everyday", hadBcp, "amex-blue-cash-everyday-bonus").status, "warning");
  assert.equal(check("amex-blue-cash-preferred", W({ applications: [app({ cardId: "amex-blue-cash-everyday", opened: "2022-01" })] }), "amex-blue-cash-preferred-bonus").status, "eligible");
});

test("Marriott Brilliant vs Chase Marriott cards: 90 days after opening, 24 months after a bonus, 30 days after a Ritz-Carlton", () => {
  const opened = check("amex-marriott-brilliant", W({ applications: [other("Marriott Bonvoy Boundless", "Chase", { opened: "2026-10-01" })] }), "amex-marriott-brilliant-bonus");
  assert.equal(opened.status, "blocked");
  assert.equal(opened.effect, "no-bonus");
  assert.equal(opened.until, "2026-12-30");
  // Its bonus month isn't recorded: if it posted, the 24-month window would hold the offer much longer.
  assert.ok(opened.caveats?.some((c) => /could last longer/.test(c)));
  assert.ok(opened.missing?.some((m) => /whether and when you earned a bonus or upgrade offer on your Marriott Bonvoy Boundless/.test(m)));
  const noBonus = check("amex-marriott-brilliant", W({ applications: [other("Marriott Bonvoy Boundless", "Chase", { opened: "2026-10-01", bonusEarned: NO_BONUS })] }), "amex-marriott-brilliant-bonus");
  assert.equal(noBonus.missing, undefined);
  // The 24 months also count upgrade offers, which can come years after opening: an old card with no bonus month is
  // asked about, and "no bonus" (a welcome-bonus answer) passes with a caveat about upgrade offers.
  const old = check("amex-marriott-brilliant", W({ applications: [other("Marriott Bonvoy Boundless", "Chase", { opened: "2021-03" })] }), "amex-marriott-brilliant-bonus");
  assert.equal(old.status, "unknown");
  assert.deepEqual(old.missing, ["whether and when you earned a bonus or upgrade offer on your Marriott Bonvoy Boundless"]);
  assert.equal(old.records?.length, 1);
  const oldNone = check("amex-marriott-brilliant", W({ applications: [other("Marriott Bonvoy Boundless", "Chase", { opened: "2021-03", bonusEarned: NO_BONUS })] }), "amex-marriott-brilliant-bonus");
  assert.equal(oldNone.status, "eligible");
  assert.ok(oldNone.caveats?.some((c) => /also counts upgrade offers/.test(c)));
  // August 1-31: maybe inside the 90 days.
  const month = check("amex-marriott-brilliant", W({ applications: [other("Marriott Bonvoy Boundless", "Chase", { opened: "2026-08", bonusEarned: NO_BONUS })] }), "amex-marriott-brilliant-bonus");
  assert.equal(month.status, "unknown");
  assert.deepEqual(month.missing, ["the day you opened your Marriott Bonvoy Boundless"]);
  // A Bold bonus from June 2025 holds the Brilliant's offer for 24 months; typed names are recognized too.
  const bonus = check("amex-marriott-brilliant", W({ applications: [other("Bonvoy Bold", "Chase", { opened: "2025-03", bonusEarned: "2025-06" })] }), "amex-marriott-brilliant-bonus");
  assert.equal(bonus.status, "blocked");
  assert.equal(bonus.until, "2027-07-01");
  const ritz = check("amex-marriott-brilliant", W({ applications: [other("The Ritz-Carlton Credit Card", "J.P. Morgan", { opened: "2022-01", closed: "2026-11-10" })] }), "amex-marriott-brilliant-bonus");
  assert.equal(ritz.status, "blocked");
  assert.equal(ritz.until, "2026-12-10");
  // Having had the Brilliant itself: a risk with no time limit. The Bevy isn't named, so it doesn't count.
  const self = check("amex-marriott-brilliant", W({ applications: [app({ cardId: "amex-marriott-brilliant", opened: "2020-01" })] }), "amex-marriott-brilliant-bonus");
  assert.equal(self.status, "warning");
  assert.equal(self.permanent, true);
  assert.equal(check("amex-marriott-brilliant", W({ applications: [other("Marriott Bonvoy Bevy", "American Express", { opened: "2026-10-01" })] }), "amex-marriott-brilliant-bonus").status, "eligible");
});

test("Chase: one Sapphire Preferred at a time, a past one puts the bonus at risk, the Reserve doesn't count", () => {
  const holding = check("chase-sapphire-preferred", W({ applications: [], cards: ["chase-sapphire-preferred"] }), "chase-sapphire-preferred-bonus");
  assert.equal(holding.status, "blocked");
  assert.equal(holding.effect, "ineligible");
  assert.equal(holding.action, "you no longer have it");
  const past = check("chase-sapphire-preferred", W({ applications: [app({ cardId: "chase-sapphire-preferred", opened: "2018-01", closed: "2020-01", bonusEarned: "2018-04" })] }), "chase-sapphire-preferred-bonus");
  assert.equal(past.status, "warning");
  assert.equal(past.permanent, true);
  assert.equal(check("chase-sapphire-preferred", W({ applications: [], cards: ["chase-sapphire-reserve"] }), "chase-sapphire-preferred-bonus").status, "eligible");
});

test("Chase 24-month bonus rules and the Southwest and United Club families", () => {
  const fu = check("chase-freedom-unlimited", W({ applications: [app({ cardId: "chase-freedom-unlimited", opened: "2025-03", closed: "2026-02", bonusEarned: "2025-06" })] }), "chase-freedom-unlimited-bonus");
  assert.equal(fu.status, "blocked");
  assert.equal(fu.until, "2027-07-01");
  const plus = W({ applications: [other("Southwest Rapid Rewards Plus Credit Card", "Chase", { opened: "2023-01" })] });
  const sw = check("southwest-priority", plus, "chase-southwest-personal-bonus");
  assert.equal(sw.status, "blocked");
  assert.match(sw.action ?? "", /no longer have/);
  const swBiz = W({ applications: [other("Southwest Rapid Rewards Premier Business", "Chase", { business: true, opened: "2026-01", bonusEarned: "2026-03" })] });
  assert.equal(check("southwest-priority", swBiz, "chase-southwest-personal-bonus").status, "eligible");
  const club = W({ applications: [other("United Club Visa Signature Card", "Chase", { opened: "2015-01" })] });
  assert.equal(check("united-club-infinite", club, "chase-united-club-bonus").status, "blocked");
});

test("Capital One bonus rules: a Venture X bonus blocks the Venture; a past business card puts the VX Business bonus at risk", () => {
  const vx = check("capital-one-venture", W({ applications: [app({ cardId: "capital-one-venture-x", opened: "2023-11", bonusEarned: "2024-01" })] }), "capital-one-venture-bonus");
  assert.equal(vx.status, "blocked");
  assert.equal(vx.until, "2028-02-01");
  const spark = W({ applications: [other("Spark Cash Plus", "Capital One", { business: true, opened: "2021-01" })] });
  const r = check("capital-one-venture-x-business", spark, "capital-one-venture-x-business-bonus");
  assert.equal(r.status, "warning");
  assert.equal(r.effect, "bonus-at-risk");
});

test("Wells Fargo: one card per 4 months, and the same card within 48 months puts the bonus at risk", () => {
  const recent = check("wells-fargo-autograph-journey", W({ applications: [app({ cardId: "wells-fargo-active-cash", opened: "2026-09" })] }), "wells-fargo-4-month-approval");
  assert.equal(recent.status, "blocked");
  assert.equal(recent.until, "2027-01-31");
  const same = check("wells-fargo-autograph-journey", W({ applications: [app({ cardId: "wells-fargo-autograph-journey", opened: "2023-06", closed: "2024-01" })] }), "wells-fargo-48-month-bonus");
  assert.equal(same.status, "warning");
  assert.equal(same.until, "2027-07-01");
});

test("notices and untracked events never change the verdict", () => {
  const none = W({ applications: [] });
  const plat = evaluateCard(card("amex-platinum"), historyContext(none, TODAY));
  assert.equal(plat.results.find((r) => r.rule.id === "amex-approval-preview")?.status, "notice");
  assert.equal(plat.status, "eligible");
  const bilt = evaluateCard(card("bilt-obsidian"), historyContext(none, TODAY));
  assert.equal(bilt.results.find((r) => r.rule.id === "bilt-reapply-after-decline")?.status, "notice");
  assert.equal(bilt.results.find((r) => r.rule.id === "bilt-product-change-limit")?.status, "notice");
  assert.equal(bilt.status, "eligible");
  // Citi's conversion clause can't be checked: it's a caveat on a passing rule.
  const dc = check("citi-double-cash", none, "citi-double-cash-bonus");
  assert.equal(dc.status, "eligible");
  assert.ok(dc.caveats?.some((c) => /product changes/.test(c)));
  // A Bilt welcome bonus is once per person across Blue, Obsidian and Palladium.
  const blue = check("bilt-palladium", W({ applications: [app({ cardId: "bilt-blue", opened: "2026-02", bonusEarned: "2026-03" })] }), "bilt-welcome-bonus-once");
  assert.equal(blue.status, "blocked");
  assert.equal(blue.permanent, true);
});

test("without any card history, rules that need it are unknown (and known facts still count)", () => {
  const empty = W({ cards: ["amex-gold"] });
  const r = check("chase-sapphire-preferred", empty, "chase-5-24");
  assert.equal(r.status, "unknown");
  assert.deepEqual(r.missing, ["your card history"]);
  assert.equal(check("amex-platinum", empty, "amex-platinum-bonus").status, "unknown");
  // Holding the card is a known fact.
  assert.equal(check("amex-gold", empty, "amex-gold-bonus").status, "warning");
  // Confirming there's nothing to add gives a real answer.
  assert.equal(check("amex-platinum", W({ cards: ["amex-gold"], applications: [] }), "amex-platinum-bonus").status, "eligible");
});

test("a wallet card's bonus date: unknown when it could fall in the window, settled when the card is old", () => {
  const held = W({ applications: [], cards: ["capital-one-venture-x"], openDates: { "capital-one-venture-x": "2024-08-01" } });
  const u = check("capital-one-venture-x", held, "capital-one-venture-x-bonus");
  assert.equal(u.status, "unknown");
  assert.match(u.missing?.[0] ?? "", /whether and when you earned the bonus on your Capital One Venture X/);
  const old = W({ applications: [], cards: ["capital-one-venture-x"], openDates: { "capital-one-venture-x": "2019-01-01" } });
  assert.equal(check("capital-one-venture-x", old, "capital-one-venture-x-bonus").status, "eligible");
  // An application with no bonus month isn't "no bonus": it's not recorded, so a recent card is unknown...
  const blank = check("citi-double-cash", W({ applications: [app({ cardId: "citi-double-cash", opened: "2025-02", closed: "2025-09" })] }), "citi-double-cash-bonus");
  assert.equal(blank.status, "unknown");
  assert.match(blank.missing?.[0] ?? "", /whether and when you earned the bonus on your Citi Double Cash/);
  // ...until the user says there was none.
  const none = check("citi-double-cash", W({ applications: [app({ cardId: "citi-double-cash", opened: "2025-02", closed: "2025-09", bonusEarned: NO_BONUS })] }), "citi-double-cash-bonus");
  assert.equal(none.status, "eligible");
  assert.match(none.reason, /history shows no bonus/);
});

test("review: a Venture X opened in Aug 2025 with no bonus month doesn't make the Venture 'likely eligible'", () => {
  const seeded = W({
    cards: ["amex-platinum", "chase-sapphire-preferred", "capital-one-venture-x"],
    applications: [
      app({ cardId: "chase-sapphire-preferred", opened: "2024-12" }),
      app({ cardId: "amex-platinum", opened: "2025-02" }),
      app({ cardId: "capital-one-venture-x", opened: "2025-08" }),
    ],
  });
  const r = check("capital-one-venture", seeded, "capital-one-venture-bonus");
  assert.equal(r.status, "unknown");
  assert.deepEqual(r.missing, ["whether and when you earned the bonus on your Capital One Venture X Rewards Credit Card"]);
  const ranking = rankNextCards({ wallet: seeded, today: TODAY });
  assert.ok(!ranking.eligible.some((c) => c.card.id === "capital-one-venture"));
  assert.ok(ranking.unknown.some((c) => c.card.id === "capital-one-venture"));
  // The one-click wallet prefill used to add the card with no bonus question; a wallet-only card asks too.
  const walletOnly = W({ applications: [], cards: ["capital-one-venture-x"], openDates: { "capital-one-venture-x": "2025-08-01" } });
  assert.equal(check("capital-one-venture", walletOnly, "capital-one-venture-bonus").status, "unknown");
  // Saying there was no bonus settles it, worded as what the history shows.
  const none = W({ applications: [app({ cardId: "capital-one-venture-x", opened: "2025-08", bonusEarned: NO_BONUS })] });
  const ok = check("capital-one-venture", none, "capital-one-venture-bonus");
  assert.equal(ok.status, "eligible");
  assert.match(ok.reason, /^Your history shows no bonus on this card or the Capital One Venture X Rewards Credit Card in the last 48 months/);
  const earned = W({ applications: [app({ cardId: "capital-one-venture-x", opened: "2025-08", bonusEarned: "2025-10" })] });
  assert.equal(check("capital-one-venture", earned, "capital-one-venture-bonus").until, "2029-11-01");
});

test("authorized-user cards count only where a rule says so", () => {
  const au = (o: Partial<CardApplication> & Pick<CardApplication, "opened">) => app({ authorizedUser: true, ...o });
  // 5/24 counts them (the research: includeAuthorizedUser true).
  const c = chase524(historyContext(W({ applications: [au({ cardId: "amex-blue-cash-everyday", opened: "2026-01" })] }), TODAY));
  assert.equal(c.count, 1);
  // The Amex cap counts only cards where you're the primary cardholder (includeAuthorizedUser false).
  const four = ["amex-blue-cash-preferred", "amex-delta-reserve", "amex-hilton-aspire", "amex-marriott-brilliant"].map((id) => app({ cardId: id, opened: "2018-01" }));
  const cap = check("amex-delta-platinum", W({ applications: [...four, au({ cardId: "amex-blue-cash-everyday", opened: "2018-01" })] }), "amex-credit-card-cap");
  assert.equal(cap.status, "eligible");
  assert.match(cap.reason, /You have 4 open Amex credit cards/);
  // It isn't the user's own account: an authorized-user Sapphire Preferred doesn't block one of their own.
  const sapphire = W({ applications: [au({ cardId: "chase-sapphire-preferred", opened: "2024-03" })], cards: ["chase-sapphire-preferred"] });
  const own = check("chase-sapphire-preferred", sapphire, "chase-sapphire-preferred-bonus");
  assert.equal(own.status, "eligible");
  assert.ok(own.caveats?.some((x) => /authorized user/.test(x)));
  assert.equal(evaluateCard(card("chase-sapphire-preferred"), historyContext(sapphire, TODAY)).held, false);
  // Pacing rules count the user's own approvals.
  assert.equal(check("capital-one-venture", W({ applications: [au({ cardId: "capital-one-venture-x", opened: "2026-10" })] }), "capital-one-6-months").status, "eligible");
  assert.equal(check("chase-sapphire-preferred", W({ applications: [au({ cardId: "chase-freedom-flex", opened: "2026-11-10" }), app({ cardId: "chase-freedom-unlimited", opened: "2026-11-12" })] }), "chase-2-in-30-days").status, "eligible");
  // BofA 3/12: no outlet reports whether they count (null), so reaching the limit only with one is a warning.
  const bofa = W({ applications: [other("Card A", "Barclays", { opened: "2026-02" }), other("Card B", "Barclays", { opened: "2026-04" }), au({ cardId: "amex-gold", opened: "2026-07" })] });
  const r = check("atmos-rewards-summit", bofa, "bofa-3-12", { hasBankOfAmericaDepositAccount: false });
  assert.equal(r.status, "warning");
  assert.match(r.reason, /plus a card you're an authorized user on \(the American Express Gold Card\), which may count\./);
  // Two of them read as one list, not "X, which you're an authorized user on and Y, which you're an authorized user on".
  const two = W({ applications: [other("Card A", "Barclays", { opened: "2026-02" }), au({ cardId: "chase-sapphire-preferred", opened: "2026-04" }), au({ cardId: "amex-gold", opened: "2026-07" })] });
  assert.match(
    check("atmos-rewards-summit", two, "bofa-3-12", { hasBankOfAmericaDepositAccount: false }).reason,
    /plus 2 cards you're an authorized user on \(the Chase Sapphire Preferred and the American Express Gold Card\), which may count\./,
  );
  assert.ok(r.caveats?.some((x) => /No outlet reports whether cards you're an authorized user on count/.test(x)));
});

test("rules that leave a card's scope open warn instead of blocking", () => {
  // Wells Fargo counts "Wells Fargo-branded" cards; the disclosure doesn't say whether co-brands are.
  const choice = W({ applications: [other("Choice Privileges Select Mastercard", "Wells Fargo", { opened: "2026-09" })] });
  const wf = check("wells-fargo-active-cash", choice, "wells-fargo-4-month-approval");
  assert.equal(wf.status, "warning");
  assert.equal(wf.until, "2027-01-31");
  assert.ok(wf.caveats?.some((x) => /co-branded/.test(x)));
  // Chase's "any United Club credit card" may or may not include the United Club Business Card.
  const biz = W({ applications: [other("United Club Business Card", "Chase", { business: true, opened: "2024-01", bonusEarned: NO_BONUS })] });
  const club = check("united-club-infinite", biz, "chase-united-club-bonus");
  assert.equal(club.status, "warning");
  assert.match(club.reason, /don't say whether the United Club Business Card counts/);
  // The Schwab and Morgan Stanley Platinum cards are charge cards: outside Amex's credit-card pacing.
  const schwab = W({ applications: [other("Platinum Card Exclusively for Charles Schwab", "American Express", { opened: "2026-11-21" })] });
  const pace = check("amex-blue-cash-preferred", schwab, "amex-1-in-5-days");
  assert.equal(pace.status, "eligible");
  assert.equal(pace.caveats, undefined);
});

test("blocked windows mention undated cards that could extend them; TD Bank is recognized as TD", () => {
  const w = W({ applications: [app({ cardId: "capital-one-venture-x", opened: "2026-08-15", bonusEarned: NO_BONUS })], cards: ["capital-one-savor"] });
  const r = check("capital-one-venture", w, "capital-one-6-months");
  assert.equal(r.status, "blocked");
  assert.equal(r.until, "2027-02-16");
  assert.deepEqual(r.missing, ["the open date for your Capital One Savor Cash Rewards Credit Card"]);
  assert.ok(r.caveats?.some((x) => /if it was recently, this lasts longer/.test(x)));
  const td = chase524(historyContext(W({ applications: [other("TD Business Solutions", "TD", { business: true, opened: "2025-02" })] }), TODAY));
  assert.equal(td.count, 1);
  assert.ok(sameIssuer("TD Bank, N.A.", "TD Bank"));
});

test("Bank of America 2/3/4 keeps The Points Guy's 30-day reading of the first window as a note", () => {
  const first = rule("bofa-2-3-4").logic.windows?.[0];
  assert.match(first?.note ?? "", /30 days instead of two months/);
  const twoIn2 = W({ applications: [other("Customized Cash Rewards", "Bank of America", { opened: "2026-10-05" }), other("Travel Rewards", "Bank of America", { opened: "2026-11-01" })] });
  assert.ok(check("atmos-rewards-summit", twoIn2, "bofa-2-3-4").caveats?.some((c) => /30 days instead of two months/.test(c)));
});

test("titles match the effect, and 'widely reported' bases say why", () => {
  for (const r of applicationRules.rules) {
    const effects = (r.logic.conditions ?? []).map((c) => c.effect);
    // A "may" rule never reads as a firm outcome: not "blocked", "once per lifetime" or "no bonus".
    if (effects.length && effects.every((e) => e === "bonus-at-risk")) assert.doesNotMatch(r.name, /block|once per lifetime|\bno (?:bonus|intro)|not available|ineligible/i, r.id);
    if (r.certainty === "widely reported") assert.ok(r.basis, r.id);
  }
  assert.match(rule("bofa-24-month-same-card").basis ?? "", /couldn't be read/);
  assert.match(rule("amex-gold-bonus").basis ?? "", /Amex's own offer-terms wording/);
  assert.equal(rule("amex-gold-bonus").name, "Gold: a past Gold or Platinum may cost the bonus");
  assert.equal(rule("wells-fargo-48-month-bonus").name, "Same card within 48 months: bonus and intro APR may not apply");
});

test("the ranking leaves out held and closed cards and lists warnings and unknowns apart from blocks", () => {
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
  assert.ok(ranking.blocked.some((c) => c.card.id === "capital-one-venture"));
  // Having had the Platinum puts the Gold's bonus at risk: a warning, not a block.
  assert.ok(ranking.warning.some((c) => c.card.id === "amex-gold"));
  const dated = ranking.blocked.filter((c) => c.eligibility.until).map((c) => c.eligibility.until as string);
  assert.deepEqual(dated, [...dated].sort());
  const firstPermanent = ranking.blocked.findIndex((c) => c.eligibility.permanent);
  assert.ok(firstPermanent === -1 || ranking.blocked.slice(firstPermanent).every((c) => c.eligibility.permanent));
  for (let i = 1; i < ranking.eligible.length; i++) assert.ok(ranking.eligible[i - 1].rankValue >= ranking.eligible[i].rankValue);
  assert.ok(ranking.eligible.every((c) => c.card.category !== "business"));
});

test("first-year value adds only the credits the user marks usable, valuing points like the points tracker", () => {
  const csr = card("chase-sapphire-reserve");
  const none = firstYearValue(csr, () => false);
  const ur = resolvePointValue("chase-ur")!.cents;
  assert.equal(none.points?.cents, ur);
  assert.equal(none.welcome, Math.round(100_000 * ur / 100));
  assert.equal(none.total, none.welcome - csr.annualFee);
  const travel = firstYearValue(csr, (id) => id === "travel-credit");
  assert.equal(travel.credits, 300);
  assert.equal(travel.total, none.total + 300);
  // The user's own value for the program wins.
  assert.equal(firstYearValue(csr, () => false, { own: { "chase-ur": 1 } }).welcome, 1000);
});

test("a bonus at risk ranks on the value without it, below clean results", () => {
  // Holding the Platinum puts the Gold's offer at risk (Amex "may not" give it).
  const wallet = W({ cards: ["amex-platinum"], applications: [] });
  const ranking = rankNextCards({ wallet, today: TODAY });
  const gold = ranking.warning.find((c) => c.card.id === "amex-gold");
  assert.ok(gold);
  assert.equal(gold.bonusAtRisk, true);
  assert.equal(gold.rankValue, gold.value.credits - gold.value.fee);
  // Without a card history, the page ranks everything together: the Gold isn't the highest value any more.
  const noHistory = rankNextCards({ wallet: W({ cards: ["amex-platinum"] }), today: TODAY });
  const together = [...noHistory.eligible, ...noHistory.warning, ...noHistory.unknown].sort(byRankValue);
  assert.notEqual(together[0].card.id, "amex-gold");
  const goldAt = together.findIndex((c) => c.card.id === "amex-gold");
  assert.ok(together.slice(0, goldAt).length > 5);
  // A tiered offer ranks on its first tier.
  const vxb = rankNextCards({ wallet: W({ applications: [] }), today: TODAY, scope: "business" }).eligible.find((c) => c.card.id === "capital-one-venture-x-business");
  assert.ok(vxb && vxb.value.welcomeAll > vxb.value.welcome && vxb.rankValue === vxb.value.total);
});

test("open questions in the research warn instead of passing: Discover under Capital One, the Green Card under the Amex cap", () => {
  // Discover cards (now Capital One): nobody covers whether they count toward the six months.
  const discover = W({ applications: [other("Discover it Cash Back", "Discover", { opened: "2026-10" })] });
  const six = check("capital-one-venture-x", discover, "capital-one-6-months");
  assert.equal(six.status, "warning");
  assert.match(six.reason, /plus the Discover it Cash Back, which may count/);
  assert.ok(six.caveats?.some((c) => /Whether Discover cards, now part of Capital One, count toward the six months/.test(c)));
  assert.match(rule("capital-one-6-months").notes ?? "", /Discover cards, now part of Capital One/);
  // An older Discover card is outside the window either way.
  assert.equal(check("capital-one-venture-x", W({ applications: [other("Discover it", "Discover", { opened: "2025-01" })] }), "capital-one-6-months").status, "eligible");
  // Four Amex credit cards plus the Green: Doctor of Credit reported Amex counting the Green as a credit card.
  const four = ["amex-blue-cash-preferred", "amex-delta-platinum", "amex-hilton-aspire", "amex-marriott-brilliant"].map((id) => app({ cardId: id, opened: "2021-01" }));
  const cap = check("amex-blue-cash-everyday", W({ applications: [...four, app({ cardId: "amex-green", opened: "2020-01" })] }), "amex-credit-card-cap");
  assert.equal(cap.status, "warning");
  assert.match(cap.reason, /You have 4 open Amex credit cards, plus the American Express Classic Green Card; if that counts, you're at the limit/);
  assert.ok(cap.caveats?.some((c) => /Green Card as a credit card/.test(c)));
  // Below the cap the Green changes nothing.
  assert.equal(check("amex-blue-cash-everyday", W({ applications: [four[0], app({ cardId: "amex-green", opened: "2020-01" })] }), "amex-credit-card-cap").status, "eligible");
});

test("a bonus month left blank: asked about unless the card is old enough, and the assumption is a caveat", () => {
  // Opened Apr 2024: with a year for the bonus to post, it could still fall inside the 24 months.
  const recent = check("world-of-hyatt", W({ applications: [app({ cardId: "world-of-hyatt", opened: "2024-04", closed: "2025-01" })] }), "chase-world-of-hyatt-bonus");
  assert.equal(recent.status, "unknown");
  assert.deepEqual(recent.missing, ["whether and when you earned the bonus on your World of Hyatt Credit Card"]);
  // Opened Oct 2023: too long ago, but the page says what it assumed.
  const old = check("world-of-hyatt", W({ applications: [app({ cardId: "world-of-hyatt", opened: "2023-10", closed: "2025-01" })] }), "chase-world-of-hyatt-bonus");
  assert.equal(old.status, "eligible");
  assert.ok(old.caveats?.some((c) => /we took any bonus to have posted within 12 months of opening/.test(c)));
});

test("without a card history, a deposit-account answer can't settle the BofA rules, so cards don't ask it", () => {
  const empty = evaluateCard(card("atmos-rewards-summit"), historyContext(W(), TODAY));
  assert.deepEqual(empty.questions, []);
  assert.equal(empty.status, "unknown");
  assert.ok(empty.results.some((r) => /^If you (?:don't )?have a Bank of America deposit account/.test(r.reason)));
});

test("the ranking counts only bonuses you can count on: not an 'as high as' top, an unconfirmed bonus or one at risk", () => {
  // Empty wallet: the Platinum's "as high as 175,000" no longer leads; it ranks on credits minus the fee.
  const empty = rankNextCards({ wallet: W(), today: TODAY });
  const together = [...empty.eligible, ...empty.warning, ...empty.unknown].sort(byRankValue);
  assert.ok(!together[0].value.offer.upTo, together[0].card.id);
  const plat = together.find((c) => c.card.id === "amex-platinum");
  assert.ok(plat);
  assert.equal(plat.bonus, "varies");
  assert.equal(plat.rankValue, plat.value.credits - plat.value.fee);
  // Business cards with nothing in the history: a fixed offer leads, not the Business Platinum's "as high as 300,000".
  const biz = rankNextCards({ wallet: W({ applications: [] }), today: TODAY, scope: "business" });
  assert.notEqual(biz.eligible[0].card.id, "amex-business-platinum");
  assert.equal(biz.eligible[0].bonus, "counted");
  // A Venture X with no bonus month: the Venture's bonus is unconfirmed, so it ranks without it.
  const vx = W({ cards: ["capital-one-venture-x"], applications: [app({ cardId: "capital-one-venture-x", opened: "2025-08" })] });
  const venture = rankNextCards({ wallet: vx, today: TODAY }).unknown.find((c) => c.card.id === "capital-one-venture");
  assert.ok(venture);
  assert.equal(venture.bonus, "unconfirmed");
  assert.equal(venture.rankValue, venture.value.credits - venture.value.fee);
  assert.equal(venture.bonusRule?.rule.id, "capital-one-venture-bonus");
  assert.ok(venture.bonusRule?.records?.length);
  // A missing card history alone doesn't count against the bonus (every card would lose it).
  const sapphire = together.find((c) => c.card.id === "chase-sapphire-preferred");
  assert.equal(sapphire?.bonus, "counted");
  assert.equal(sapphire?.rankValue, sapphire?.value.total);
});

test("rule data: real card ids, recognizable products, well-formed logic, dates and sources", () => {
  const ids = new Set(cards.map((c) => c.id));
  const rules = applicationRules.rules;
  assert.equal(rules.length, 49);
  assert.equal(rules.filter((r) => r.certainty === "official").length, 32);
  assert.equal(rules.filter((r) => r.certainty === "widely reported").length, 17);
  assert.equal(new Set(rules.map((r) => r.id)).size, rules.length);
  for (const c of cards) assert.ok(applicationRules.cardTypes[c.id], `no card type for ${c.id}`);
  const product = (_r: ApplicationRule, id: string) => id === "$self" || id === "blockersByTarget" || ids.has(id);
  for (const r of rules) {
    const L = r.logic;
    for (const id of r.appliesTo) {
      assert.ok(ids.has(id), `${r.id}: unknown card ${id}`);
      assert.ok(!isClosedToApplicants(card(id)), `${r.id}: ${id} is closed to applicants`);
    }
    for (const id of L.family ?? []) assert.ok(product(r, id), `${r.id}: unknown family card ${id}`);
    for (const [target, blockers] of Object.entries(L.blockersByTarget ?? {})) {
      for (const id of [target, ...blockers]) assert.ok(ids.has(id), `${r.id}: unknown card ${id}`);
    }
    for (const c of L.conditions ?? []) {
      for (const id of c.products ?? []) assert.ok(product(r, id), `${r.id}: unknown product ${id}`);
      if (r.appliesTo.length) {
        for (const label of c.otherProducts ?? []) {
          assert.ok(OTHER_PRODUCT_MATCHERS[label] || DESCRIPTIVE_ONLY.has(label), `${r.id}: no way to recognize "${label}"`);
        }
      }
    }
    for (const id of Object.keys(L.businessCardsOnPersonalReport ?? {})) assert.ok(ids.has(id), `${r.id}: unknown card ${id}`);
    for (const label of Object.keys(L.businessCardsOnPersonalReportOther ?? {})) assert.ok(OTHER_PRODUCT_MATCHERS[label], `${r.id}: no matcher for "${label}"`);
    if (["max-new-cards", "velocity", "max-open"].includes(L.type)) {
      assert.ok(L.counts, `${r.id}: counts`);
      const windows = L.windows ?? [{ count: L.count ?? 0, months: L.months, days: L.days }];
      if (L.type !== "max-open") for (const w of windows) assert.ok(w.count > 0 && ((w.months ?? 0) > 0 || (w.days ?? 0) > 0), `${r.id}: window`);
      else assert.ok((L.count ?? 0) > 0, r.id);
    }
    if (["once-per-lifetime", "family-bonus", "cooldown"].includes(L.type)) assert.ok(L.conditions?.length, `${r.id}: conditions`);
    assert.match(r.asOf, /^\d{4}-\d{2}$/);
    assert.match(r.lastVerified, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(r.sources.length > 0 && r.sources.every((s) => /^https:\/\//.test(s)), `${r.id}: sources`);
    for (const text of [r.name, r.summary, r.notes ?? "", L.scope]) assert.doesNotMatch(text, /seed|placeholder|awardhack/i, r.id);
  }
  // Each card the history editor offers is recognized by the rules that name it.
  for (const p of NAMED_PRODUCTS) {
    assert.ok(
      Object.keys(OTHER_PRODUCT_MATCHERS).some((label) => matchesOtherProduct(label, p, sameIssuer)),
      `${p.name} isn't recognized`,
    );
  }
  assert.ok(sameIssuer("Amex", "American Express"));
  assert.ok(sameIssuer("U.S. Bank", "US Bank"));
  assert.ok(sameIssuer("J.P. Morgan", "Chase"));
  assert.ok(!sameIssuer("Chase", "Citi"));
  assert.ok(isClosedToApplicants(card("amex-green")));
  assert.ok(!isClosedToApplicants(card("amex-gold")));
});
