import type { Card } from "@/shared/data/types";
import { programForCard } from "@/shared/data/strategy/programs";

/**
 * Reads a card's welcome offer text (src/shared/data/cards: "As high as 175,000 points after $12,000 in purchases
 * in the first 6 months (offers vary)") into parts we can value with the strategy valuations: points in the first
 * spending tier, points across every tier, cash, the spend and window, and flags for "as high as", "offers vary"
 * and limited-time offers. Anything it can't value from its parts (free nights) falls back to the card's own
 * `welcomeOfferValue`. Pure; tests cover every offer in the dataset.
 */
export interface WelcomeOffer {
  /** Points or miles the first spending tier earns (0 for cash offers). */
  points: number;
  /** Points or miles across every tier and add-on (a second spend tier, adding an authorized user). */
  pointsAll: number;
  /** Cash in the first tier: a statement credit, cash bonus or Bilt Cash. */
  cash: number;
  cashAll: number;
  /** Spend for the first tier, USD. */
  spend?: number;
  /** Total spend for every tier, when a later tier needs more. */
  spendAll?: number;
  /** The spend window, e.g. "6 months" or "90 days". */
  within?: string;
  /** Extra points for adding an authorized user (in `pointsAll`, not `points`). */
  authorizedUserPoints?: number;
  /** "As high as": the amount is the most anyone gets. */
  upTo: boolean;
  /** The offer says offers vary by applicant. */
  varies: boolean;
  /** A limited-time offer (an end date, or "limited time"). */
  limited: boolean;
  /** No points or cash to value (free nights): use the card's own estimate. */
  estimate: boolean;
  closed: boolean;
}

const num = (s: string) => Number(s.replace(/,/g, ""));

export function parseWelcomeOffer(text: string): WelcomeOffer {
  const t = text.replace(/\s+/g, " ").trim();
  const closed = /closed to new applicants|^not available/i.test(t);
  let points = 0;
  let cash = 0;
  // An offer stated in dollars is cash, even when it's paid as points ("$200 cash back (20,000 ThankYou points)").
  const leadingCash = /^\$([\d,]+)/.exec(t);
  if (leadingCash) cash = num(leadingCash[1]);
  else {
    const p = /(?:^|as high as )([\d,]+) (?:bonus )?(?:[A-Z][A-Za-z]+ ){0,2}(?:points|miles)\b/i.exec(t);
    if (p) points = num(p[1]);
  }
  const bilt = /plus \$([\d,]+) in Bilt Cash/i.exec(t);
  if (bilt) cash += num(bilt[1]);
  // A second tier: "plus another 150,000 miles and a $1,000 … credit after $120,000 in total purchases".
  const tier = /plus another ([\d,]+) (?:points|miles)(?: and a \$([\d,]+) [^,]*?credit)? after \$([\d,]+) in total purchases/i.exec(t);
  const au = /plus ([\d,]+) (?:points|miles) for adding an authorized user/i.exec(t);
  const spend = /after \$([\d,]+) in (?:[a-z-]+ )?purchases in the first (\d+ (?:months?|days?))/i.exec(t);
  const limitedText = /\blimited[- ]time\b[^)]*/i.exec(t)?.[0] ?? "";
  return {
    points,
    pointsAll: points + (tier ? num(tier[1]) : 0) + (au ? num(au[1]) : 0),
    cash,
    cashAll: cash + (tier?.[2] ? num(tier[2]) : 0),
    ...(spend ? { spend: num(spend[1]), within: spend[2] } : {}),
    ...(tier ? { spendAll: num(tier[3]) } : {}),
    ...(au ? { authorizedUserPoints: num(au[1]) } : {}),
    upTo: /^as high as\b/i.test(t),
    varies: /offers vary/i.test(t),
    // "(the limited-time 125K offer ended Nov 2026)" describes an offer that's gone.
    limited: (Boolean(limitedText) && !/\bended\b/i.test(limitedText)) || /\(through \d/i.test(t),
    estimate: !closed && points === 0 && cash === 0,
    closed,
  };
}

export interface WelcomeValue {
  offer: WelcomeOffer;
  /** The first tier in USD: what the offer is worth if you meet its first spend. */
  usd: number;
  /** Every tier and add-on. */
  usdAll: number;
  /** Program the points are in, and the cents per point used. */
  program?: string;
  cents?: number;
}

/**
 * The welcome offer in dollars: points at `centsFor(program)` (the user's own value or the outlets' median from
 * shared/lib/trackers centsFor), plus cash. Falls back to the card file's `pointValueCents` for a program without
 * a valuation, and to `welcomeOfferValue` for offers we can't split into points and cash.
 */
export function welcomeValue(card: Card, centsFor: (program: string) => number | undefined): WelcomeValue {
  const offer = parseWelcomeOffer(card.welcomeOffer);
  if (offer.closed) return { offer, usd: 0, usdAll: 0 };
  if (offer.estimate) return { offer, usd: card.welcomeOfferValue, usdAll: card.welcomeOfferValue };
  const program = offer.points > 0 ? programForCard(card) : undefined;
  const cents = offer.points > 0 ? ((program ? centsFor(program) : undefined) ?? card.pointValueCents) : undefined;
  const usd = (points: number, cashUsd: number) => Math.round((points * (cents ?? 0)) / 100 + cashUsd);
  return { offer, usd: usd(offer.points, offer.cash), usdAll: usd(offer.pointsAll, offer.cashAll), ...(program ? { program } : {}), ...(cents !== undefined ? { cents } : {}) };
}
