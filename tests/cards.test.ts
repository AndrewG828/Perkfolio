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
