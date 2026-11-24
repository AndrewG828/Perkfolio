import { test } from "node:test";
import assert from "node:assert/strict";
import { cards, getCard, isCashBack, rateLabel } from "../src/shared/data/cards";

test("Bilt cards earn points, not cash back, so their rates show as multipliers", () => {
  for (const id of ["bilt-blue", "bilt-obsidian", "bilt-palladium"]) {
    const card = getCard(id)!;
    assert.match(card.rewardsCurrency, /Bilt Cash/, `${id} still mentions Bilt Cash`);
    assert.equal(isCashBack(card), false, id);
    assert.equal(rateLabel(card, 3), "3x", id);
  }
});

test("cash-back cards are recognized by a rewards currency that starts with Cash", () => {
  for (const id of ["chase-freedom-unlimited", "citi-double-cash", "wells-fargo-active-cash", "amex-blue-cash-preferred", "capital-one-savor"]) {
    assert.equal(isCashBack(getCard(id)!), true, id);
    assert.equal(rateLabel(getCard(id)!, 5), "5%", id);
  }
  for (const id of ["chase-sapphire-reserve", "amex-gold", "capital-one-venture-x", "united-quest"]) assert.equal(isCashBack(getCard(id)!), false, id);
  // Every card's label is one or the other, never a percentage for a points card.
  for (const c of cards) assert.equal(isCashBack(c), /^cash\b/i.test(c.rewardsCurrency), c.id);
  assert.equal(isCashBack({ rewardsCurrency: "Points (plus cash back)" }), false);
});

test("the calculator and Which Card? use only rates the card has, and say when a rate holds for some purchases only", async () => {
  const { SPEND_CATEGORIES, estimateRewards, rateCondition, rateFor } = await import("../src/shared/data/calculator-rates");
  for (const c of cards) {
    const own = new Set([c.baseRate, 0, ...c.earnRates.map((r) => r.multiplier)]);
    for (const s of SPEND_CATEGORIES) for (const portal of [false, true]) assert.ok(own.has(rateFor(c, s.id, portal)), `${c.id} ${s.id}`);
  }
  // Restaurants at all other times: Citi Nights' 6x is a Friday and Saturday evening rate, not the dining rate.
  assert.equal(rateFor(getCard("citi-strata-elite")!, "dining", false), 3);
  assert.match(rateCondition(getCard("citi-strata-elite")!, "dining", false) ?? "", /Citi Nights/);
  // Other travel that isn't Lyft earns the base rate on Sapphire Reserve and Southwest Priority.
  for (const id of ["chase-sapphire-reserve", "chase-sapphire-reserve-business", "southwest-priority"]) assert.equal(rateFor(getCard(id)!, "otherTravel", false), 1, id);
  // Brand-only rates name the brand.
  assert.match(rateCondition(getCard("united-club-infinite")!, "flights", false) ?? "", /United/);
  assert.match(rateCondition(getCard("world-of-hyatt")!, "hotels", false) ?? "", /Hyatt/);
  assert.match(rateCondition(getCard("bilt-blue")!, "rent", false) ?? "", /Up to 1\.25x/);
  assert.equal(rateCondition(getCard("amex-gold")!, "dining", false), null);
  // Obsidian's 3x goes to dining or groceries, whichever earns more for the spending entered.
  const spend = { dining: 6_000, groceries: 7_200, flights: 0, hotels: 0, otherTravel: 0, gas: 0, streaming: 0, rent: 0, other: 0 };
  const obsidian = estimateRewards(getCard("bilt-obsidian")!, spend, false);
  assert.equal(obsidian.breakdown.find((b) => b.cat === "groceries")?.rate, 3);
  assert.equal(obsidian.breakdown.find((b) => b.cat === "dining")?.rate, 1);
  assert.equal(obsidian.points, 6_000 + 7_200 * 3);
});

test("card tiles show a flat-rate card's base rate", async () => {
  const active = getCard("wells-fargo-active-cash")!;
  assert.equal(active.earnRates.length, 0);
  assert.equal(active.baseRate, 2);
});
