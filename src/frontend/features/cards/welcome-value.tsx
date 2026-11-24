"use client";

import Link from "next/link";
import { getCard } from "@/shared/data/cards";
import { programName, programUnit } from "@/shared/data/strategy/programs";
import { useValueContext } from "@/frontend/state/point-values";
import { shortCardName } from "@/shared/lib/card-name";
import { num, usd } from "@/shared/lib/format";
import { VALUE_EDITION_LABEL, basisSentence, cardPointValue, formatCents, resolvePointValue } from "@/shared/lib/point-value";
import { welcomeValue } from "@/shared/lib/welcome-offer";

const thousands = (n: number) => `$${num(Math.round(n / 1000))}k`;
/** "Chase Ultimate Rewards points", but "Delta SkyMiles" and "Capital One Miles" (no "points" or "miles" twice). */
const currencyName = (program: string) => {
  const name = programName(program);
  return /(points|miles|avios)$/i.test(name) ? name : `${name} ${programUnit(program)}`;
};

/**
 * What the welcome offer is worth, with its points valued like every other page values them (shared/lib/point-value:
 * the published median, or the user's own value once the page has loaded their preferences).
 */
export function WelcomeValue({ cardId }: { cardId: string }) {
  const values = useValueContext();
  const card = getCard(cardId);
  if (!card) return null;
  const v = welcomeValue(card, values);
  if (v.usd <= 0) return null;
  const o = v.offer;
  let how = "";
  if (o.estimate) how = " by our estimate";
  else if (o.points > 0 && v.points) {
    how = `: ${num(o.points)} ${programUnit(v.points.id)} at ${formatCents(v.points.cents)} each (${basisSentence(v.points)})${o.cash ? `, plus ${usd(o.cash)}` : ""}`;
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
 * The card page's note on point values, under "Earning rewards": the one value every page uses for this card's points
 * (cardPointValue: the user's own value, else the published median; cash back at face value), and for a card whose
 * points transfer only with another card, what changes once they're combined. Renders with the median on the server
 * and the user's own values and cards once they load.
 */
export function PointValueNote({ cardId }: { cardId: string }) {
  const values = useValueContext();
  const card = getCard(cardId);
  if (!card) return null;
  const v = cardPointValue(card, values);
  const link = (
    <Link href="/about#methodology" className="link inline-flex min-h-8 items-center sm:inline sm:min-h-0">
      How we value points
    </Link>
  );
  if (v.basis === "cash") {
    // A card that needs another card to transfer: what its points become once combined.
    const combined = v.limited && v.id ? resolvePointValue(v.id, { own: values.own }) : undefined;
    return (
      <p className="mt-3 text-sm text-ink-3">
        {v.limited && v.id && combined ? (
          <>
            This card&apos;s rewards count as cash back, at face value. {v.limited.note} Combined, they&apos;re{" "}
            {currencyName(v.id)}, worth {formatCents(combined.cents)} each ({basisSentence(combined)}).{" "}
          </>
        ) : (
          "Cash back counts at face value. "
        )}
        {link}
      </p>
    );
  }
  const offer = welcomeValue(card, values).offer;
  const median = v.basis === "own" ? v.forCards?.median : undefined;
  const unlockedBy = v.limited?.unlockedWith ? getCard(v.limited.unlockedWith) : undefined;
  const uses =
    offer.points > 0
      ? "The welcome offer above, your points balances and the calculators all use this value."
      : offer.cash > 0
        ? "Your points balances and the calculators use this value; the welcome offer is a dollar amount, so it counts at face value."
        : "Your points balances and the calculators use this value.";
  return (
    <p className="mt-3 text-sm text-ink-3">
      {unlockedBy
        ? `Your ${shortCardName(unlockedBy.name)} unlocks transfers for these points, so they count in full: each percent above is a point per dollar (5% is 5x, worth ${(5 * v.cents).toLocaleString("en-US", { maximumFractionDigits: 2 })}% at this value). `
        : ""}
      We value {v.id ? currencyName(v.id) : card.rewardsCurrency} at {formatCents(v.cents)} each: {basisSentence(v)}
      {median !== undefined ? ` (the ${VALUE_EDITION_LABEL} median is ${formatCents(median)})` : ""}. {uses} {link}
    </p>
  );
}
