"use client";

import Link from "next/link";
import { getCard } from "@/shared/data/cards";
import { programForCard, programName, programUnit } from "@/shared/data/strategy/programs";
import { valuations } from "@/shared/data/strategy/valuations";
import { useStrategyPrefs } from "@/frontend/state/strategy-prefs";
import { formatMonth } from "@/shared/lib/dates";
import { num, usd } from "@/shared/lib/format";
import { centsFor, valuationOf } from "@/shared/lib/trackers";
import { welcomeValue } from "@/shared/lib/welcome-offer";

const OUTLETS = Object.values(valuations.datasets).map((d) => d.outlet);
const OUTLET_LIST = `${OUTLETS.slice(0, -1).join(", ")} and ${OUTLETS[OUTLETS.length - 1]}`;
const EDITION = formatMonth(Object.values(valuations.datasets)[0]?.edition ?? valuations.verified.slice(0, 7));
const centsText = (c: number) => `${Number(c.toFixed(3))}¢`;
const thousands = (n: number) => `$${num(Math.round(n / 1000))}k`;
/** "Chase Ultimate Rewards points", but "Delta SkyMiles" and "Citi ThankYou Points" (no "points" twice). */
const currencyName = (program: string) => {
  const name = programName(program);
  return /(points|miles|avios)$/i.test(name) ? name : `${name} ${programUnit(program)}`;
};

/**
 * What the welcome offer is worth, valued like the points tracker and the next-card ranking: points at the
 * outlets' median, or at the user's own value once the page has loaded their preferences.
 */
export function WelcomeValue({ cardId }: { cardId: string }) {
  const { cpp } = useStrategyPrefs();
  const card = getCard(cardId);
  if (!card) return null;
  const v = welcomeValue(card, (p) => centsFor(p, cpp));
  if (v.usd <= 0) return null;
  const o = v.offer;
  const own = v.program !== undefined && cpp[v.program] !== undefined;
  let how = "";
  if (o.estimate) how = " by our estimate";
  else if (o.points > 0 && v.cents !== undefined) {
    const source = own ? "your own value" : `the median of the ${EDITION} figures from ${OUTLET_LIST}`;
    how = `: ${num(o.points)} ${programUnit(v.program)} at ${centsText(v.cents)} each (${source})${o.cash ? `, plus ${usd(o.cash)}` : ""}`;
  }
  const how2 = o.spendAll ? `the full ${thousands(o.spendAll)} spend` : o.authorizedUserPoints ? "an authorized user added" : "every part of the offer";
  const more = v.usdAll > v.usd ? ` ${usd(v.usdAll)} with ${how2}.` : "";
  const qualifier = o.upTo ? "up to " : o.estimate || o.points > 0 ? "about " : "";
  return (
    <p className="mt-1 text-sm text-ink-2">
      Worth {qualifier}
      {usd(v.usd)}
      {how}.{o.upTo ? " Offers vary, so yours may be lower." : ""}
      {more}
    </p>
  );
}

/**
 * The card page's note on point values, under "Earning rewards": the one value this page and the trackers use for
 * the card's currency (the user's own, or the outlets' median), what it applies to (a cash welcome offer counts at
 * face value), and where the methodology lives. Renders with the median on the server and the user's own value
 * once their preferences load.
 */
export function PointValueNote({ cardId }: { cardId: string }) {
  const { cpp } = useStrategyPrefs();
  const card = getCard(cardId);
  if (!card) return null;
  const program = programForCard(card);
  const cents = program ? centsFor(program, cpp) : undefined;
  const link = (
    <Link href="/about#methodology" className="link inline-flex min-h-8 items-center sm:inline sm:min-h-0">
      How we value points
    </Link>
  );
  if (!program || cents === undefined) {
    return (
      <p className="mt-3 text-sm text-ink-3">
        {/cash/i.test(card.rewardsCurrency) ? "Cash back counts at face value. " : ""}
        {link}
      </p>
    );
  }
  const own = cpp[program] !== undefined;
  const median = valuationOf(program)?.median;
  const offer = welcomeValue(card, (p) => centsFor(p, cpp)).offer;
  const uses = offer.points > 0 ? "the welcome offer above and your points balances" : "your points balances";
  return (
    <p className="mt-3 text-sm text-ink-3">
      We value {currencyName(program)} at {centsText(cents)} each:{" "}
      {own
        ? `your own value from the Points tab${median !== undefined ? ` (the ${EDITION} median is ${centsText(median)})` : ""}`
        : `the median of the ${EDITION} figures from ${OUTLET_LIST}`}
      . That&apos;s the value behind {uses}
      {offer.points === 0 && offer.cash > 0 ? ", while the welcome offer is a dollar amount and counts at face value" : ""}.{" "}
      {link}
    </p>
  );
}
