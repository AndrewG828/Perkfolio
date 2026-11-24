import { test } from "node:test";
import assert from "node:assert/strict";
import { cards, getCard } from "../src/shared/data/cards";
import type { Card } from "../src/shared/data/types";
import { resolvePointValue } from "../src/shared/lib/point-value";
import { parseWelcomeOffer, welcomeValue } from "../src/shared/lib/welcome-offer";

const card = (id: string) => getCard(id) as Card;
const median = (p: string) => resolvePointValue(p)?.cents;

test("welcome offers: points, cash, tiers and flags from the offer text", () => {
  const plat = parseWelcomeOffer(card("amex-platinum").welcomeOffer);
  assert.equal(plat.points, 175_000);
  assert.equal(plat.upTo, true);
  assert.equal(plat.varies, true);
  assert.equal(plat.spend, 12_000);
  assert.equal(plat.within, "6 months");

  // Venture X Business: the first tier is what $40k of spend earns; the rest needs $120k.
  const vxb = parseWelcomeOffer(card("capital-one-venture-x-business").welcomeOffer);
  assert.equal(vxb.points, 150_000);
  assert.equal(vxb.pointsAll, 300_000);
  assert.equal(vxb.cash, 0);
  assert.equal(vxb.cashAll, 1000);
  assert.equal(vxb.spend, 40_000);
  assert.equal(vxb.spendAll, 120_000);

  // Dollar offers are cash, even when paid as points.
  const dc = parseWelcomeOffer(card("citi-double-cash").welcomeOffer);
  assert.equal(dc.cash, 200);
  assert.equal(dc.points, 0);
  // Bilt Palladium: points after spend plus Bilt Cash on approval.
  const pall = parseWelcomeOffer(card("bilt-palladium").welcomeOffer);
  assert.equal(pall.points, 50_000);
  assert.equal(pall.cash, 300);
  // United: the authorized-user add-on is counted apart.
  const club = parseWelcomeOffer(card("united-club-infinite").welcomeOffer);
  assert.equal(club.points, 90_000);
  assert.equal(club.authorizedUserPoints, 10_000);
  assert.equal(club.pointsAll, 100_000);
  assert.equal(club.limited, true);
  // A companion fare's price isn't cash.
  const ascent = parseWelcomeOffer(card("atmos-rewards-ascent").welcomeOffer);
  assert.equal(ascent.points, 70_000);
  assert.equal(ascent.cash, 0);
  // An offer that ended isn't limited-time; one that's extended still is.
  assert.equal(parseWelcomeOffer(card("citi-aadvantage-executive").welcomeOffer).limited, false);
  assert.equal(parseWelcomeOffer(card("chase-sapphire-reserve-business").welcomeOffer).limited, true);
  assert.equal(parseWelcomeOffer(card("amex-hilton-aspire").welcomeOffer).limited, true);
  // Free nights can't be split into points or cash: the card's own estimate is used.
  const hyatt = welcomeValue(card("world-of-hyatt"));
  assert.equal(hyatt.offer.estimate, true);
  assert.equal(hyatt.usd, card("world-of-hyatt").welcomeOfferValue);
  assert.equal(parseWelcomeOffer(card("amex-green").welcomeOffer).closed, true);
});

test("welcome values use the one point value (or the user's own), not each card file's cents", () => {
  // 100k Membership Rewards at the outlets' median, the same figure the points tracker uses.
  const gold = welcomeValue(card("amex-gold"));
  assert.equal(gold.points?.cents, median("amex-mr"));
  assert.equal(gold.points?.basis, "median");
  assert.notEqual(gold.points?.cents, card("amex-gold").pointValueCents, "not the card file's own figure");
  assert.equal(gold.usd, Math.round(100_000 * (median("amex-mr") as number) / 100));
  // The Sapphire Preferred and Reserve value Ultimate Rewards the same way.
  assert.equal(welcomeValue(card("chase-sapphire-preferred")).points?.cents, welcomeValue(card("chase-sapphire-reserve")).points?.cents);
  // The user's own value wins.
  assert.equal(welcomeValue(card("amex-gold"), { own: { "amex-mr": 1.5 } }).usd, 1500);
  const vxb = welcomeValue(card("capital-one-venture-x-business"));
  const c1 = median("capital-one") as number;
  assert.equal(vxb.usd, Math.round(150_000 * c1 / 100));
  assert.equal(vxb.usdAll, Math.round(300_000 * c1 / 100 + 1000));
});

test("every open card's offer parses into something we can value", () => {
  for (const c of cards) {
    const o = parseWelcomeOffer(c.welcomeOffer);
    if (o.closed) continue;
    assert.ok(o.points > 0 || o.cash > 0 || o.estimate, c.id);
    assert.ok(o.pointsAll >= o.points && o.cashAll >= o.cash, c.id);
    // A points offer names the number we found.
    if (o.points > 0) assert.ok(c.welcomeOffer.includes(o.points.toLocaleString("en-US")), c.id);
    const v = welcomeValue(c);
    assert.ok(v.usd > 0 && v.usdAll >= v.usd, c.id);
  }
});
