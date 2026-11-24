import type { LoungeNetwork } from "@/shared/data/types";
import type {
  CardGuestRules,
  CardLoungeAccessRule,
  GuestCurrency,
  GuestUnlock,
  LocationGuestRule,
  LoungeGuestRulesData,
  UnlockEffect,
} from "@/shared/data/travel/types";

/**
 * What it costs to bring guests into a lounge with each card, and which card to use. Pure: the lounge pages, the
 * finder's guest control and the tests share it.
 *
 * A card's own rule sets its free guests and fee. A null fee means the issuer doesn't publish one, so those guests
 * aren't priced; the network's usual fee is never assumed, since issuers price the same network differently (Priority
 * Pass: $27 with Chase, $35 with Capital One, unpublished with Amex). Some lounges have their own rules
 * (`locationRules`: Centurion Lounges abroad, Capital One Landings).
 */

export interface Effect {
  freeGuests?: number;
  guestFeeUsd?: number | null;
  visits?: number | "unlimited";
}

const WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };

/** An unlock's effect in structured form; phrases like "2 complimentary guests" or "unlimited visits" are read too. */
export function parseEffect(effect: UnlockEffect): Effect {
  if (typeof effect !== "string") return effect;
  const s = effect.toLowerCase();
  const out: Effect = {};
  const guests = /(\d+|one|two|three|four|five|six)\s+(?:free|complimentary|comp|guest passes|guests?\s+free)\b|(?:free|complimentary)\s+guests?\s*[:=]?\s*(\d+)/.exec(s);
  // An unlock that grants "2 adult guests" means they come in free.
  const allowance = guests ? null : /(\d+|one|two|three|four|five|six)\s+(?:adult\s+)?guests?\b/.exec(s);
  if (guests) {
    const raw = guests[1] ?? guests[2];
    out.freeGuests = WORDS[raw] ?? Number(raw);
  } else if (allowance) {
    out.freeGuests = WORDS[allowance[1]] ?? Number(allowance[1]);
  } else if (/\bguests? (?:are |get in |enter )?free\b|no guest fee/.test(s)) {
    out.guestFeeUsd = 0;
  }
  const fee = /guests?\s+(?:fee|cost|price)s?\s*(?:drops? to|becomes?|of|[:=])?\s*\$(\d+(?:\.\d+)?)/.exec(s);
  if (fee) out.guestFeeUsd = Number(fee[1]);
  if (/unlimited (?:visits|access|entry)/.test(s)) out.visits = "unlimited";
  return out;
}

/** Toggle key for "I've reached this spend threshold" (per card, network and unlock). */
export const unlockKey = (cardId: string, network: LoungeNetwork, index: number) => `${cardId}:${network}:${index}`;

export interface AvailableUnlock {
  key: string;
  unlock: GuestUnlock;
  effect: Effect;
  reached: boolean;
}

/** An amount in a lounge's currency. */
export interface Money {
  amount: number;
  currency: GuestCurrency;
}

/** The lounge being priced, for rules that apply to some lounges of a network only. */
export interface GuestPlace {
  /** IATA code of the airport. */
  airport: string;
  /** The lounge's name ("Capital One Landing"). */
  name: string;
  /** The lounge's notes, which can name a charge of its own ("Also accessible via Priority Pass ($15 co-pay)"). */
  notes?: string | null;
}

/** The lounge's own charge for entering through a network, from its notes: "via Priority Pass ($15 co-pay)". */
export function copayFor(place: GuestPlace | null | undefined, network: LoungeNetwork): Money | null {
  if (network !== "priority-pass" || !place?.notes) return null;
  const m = /priority pass[^.;]*?\(\s*\$(\d+(?:\.\d+)?)\s*co-?pay\b/i.exec(place.notes);
  return m ? { amount: Number(m[1]), currency: "USD" } : null;
}

/**
 * Why guests can't be priced: the allowance isn't confirmed, the issuer publishes no fee, the network is still locked,
 * there are more guests than the terms allow, everyone uses one of the card's passes rather than paying, or this lounge
 * doesn't admit the card at all.
 */
export type Unpriced = "unconfirmed" | "unpublished" | "locked" | "over-limit" | "passes" | "not-admitted";

export interface GuestCostOption {
  cardId: string;
  network: LoungeNetwork;
  rule: CardLoungeAccessRule;
  /** Free guests per visit after any unlocks you've reached (0 when not confirmed; see `freeGuestsKnown`). */
  freeGuests: number;
  /** False when the card's free-guest allowance isn't confirmed: then guests can't be priced. */
  freeGuestsKnown: boolean;
  /** True when the network opens only after a spend unlock you haven't reached ("0 per year" visits). */
  locked: boolean;
  /** Per-guest fee beyond the free ones; null when the issuer doesn't publish one (or it's in another currency). */
  guestFeeUsd: number | null;
  /** The per-guest fee in the lounge's currency (USD or local); null when it isn't published. */
  fee: Money | null;
  /** The child guest rate, where one is published, in the lounge's currency. */
  childFee: Money | null;
  /** The child guest rate in USD, where one is published. */
  childGuestFeeUsd: number | null;
  freeUsed: number;
  paidGuests: number;
  /** Cost per visit for your guests (you get in free), in the lounge's currency; null when it can't be priced. */
  cost: Money | null;
  /** Passes this visit uses when everyone enters on one of the card's passes: your guests and you (`passesOnly`). */
  passes: number | null;
  /** The lounge's own charge for entering through this network (a Priority Pass co-pay), on top of `cost`. */
  copay: Money | null;
  /** `cost` when it's in USD (0 when no one pays), else null. */
  costUsd: number | null;
  /** Why `cost` is null. */
  unpriced: Unpriced | null;
  /** The terms' cap on guests, when this many guests go past it. */
  overLimit: CardLoungeAccessRule["guestLimit"] | null;
  /** Most paid guests at this lounge, when this many guests go past it. */
  overPaidLimit: number | null;
  /**
   * This lounge's own rules: they replaced the card's usual ones (`covered`), aren't stated for this card, or say it
   * isn't admitted (`notAdmitted`).
   */
  location: { rule: LocationGuestRule; covered: boolean; notAdmitted: boolean } | null;
  /** A reached spend unlock that isn't stated to apply at this lounge, so it's left out. */
  unlockIgnored: boolean;
  visits: number | "unlimited" | string | null;
  unlocks: AvailableUnlock[];
}

const toNumber = (n: number | null | undefined) => (typeof n === "number" && Number.isFinite(n) ? n : null);

/** Visits a year as a number ("10 per year" → 10, "unlimited" → Infinity); null when it's unknown or in other words. */
export function visitCount(v: GuestCostOption["visits"]): number | null {
  if (v === "unlimited") return Infinity;
  if (typeof v === "number") return v;
  const m = typeof v === "string" ? /^\s*(\d+)\s+(?:visits?\s+)?(?:per|a|each)\s+year\b/i.exec(v) : null;
  return m ? Number(m[1]) : null;
}

/** The lounge-specific rule for a network at this lounge, if any. */
export function locationRuleFor(
  data: Pick<LoungeGuestRulesData, "locationRules">,
  network: LoungeNetwork,
  place: GuestPlace | null | undefined,
): LocationGuestRule | null {
  if (!place) return null;
  return (
    data.locationRules?.find(
      (l) =>
        l.network === network &&
        (l.airports ? l.airports.includes(place.airport.toUpperCase()) : true) &&
        (l.loungeName ? place.name.toLowerCase().includes(l.loungeName.toLowerCase()) : true),
    ) ?? null
  );
}

const usdMoney = (amount: number | null): Money | null => (amount === null ? null : { amount, currency: "USD" });

export function optionFor(
  rules: CardGuestRules,
  rule: CardLoungeAccessRule,
  guests: number,
  reached: ReadonlySet<string>,
  location: LocationGuestRule | null = null,
  copay: Money | null = null,
): GuestCostOption {
  const covered = location ? location.cards.includes(rules.cardId) : false;
  const notAdmitted = Boolean(location?.notAdmitted?.includes(rules.cardId));
  const here = location && covered ? location : null;
  let freeGuests = Math.max(0, toNumber(here?.freeGuests) ?? toNumber(rule.freeGuests) ?? 0);
  // At a lounge with its own rules that aren't stated for this card, its guests aren't priced.
  let freeGuestsKnown = location && !covered ? false : here?.freeGuests !== undefined || toNumber(rule.freeGuests) !== null;
  let feeUsd = here && here.guestFeeUsd !== undefined ? toNumber(here.guestFeeUsd) : toNumber(rule.guestFeeUsd);
  let visits = rule.visits;
  let unlockIgnored = false;
  const unlocks: AvailableUnlock[] = rule.unlocks.map((unlock, i) => {
    const key = unlockKey(rules.cardId, rule.network, i);
    return { key, unlock, effect: parseEffect(unlock.effect), reached: reached.has(key) };
  });
  for (const u of unlocks) {
    if (!u.reached) continue;
    if (u.effect.freeGuests !== undefined) {
      // A lounge can change what the unlock gives (1 free guest at a Capital One Landing), or not be covered by it.
      const unlocked = here && here.unlockFreeGuests !== undefined ? here.unlockFreeGuests : u.effect.freeGuests;
      if (unlocked === null) unlockIgnored = true;
      else if (freeGuestsKnown || !location) {
        freeGuests = freeGuestsKnown ? Math.max(freeGuests, unlocked) : unlocked;
        freeGuestsKnown = true;
      }
    }
    if (u.effect.guestFeeUsd !== undefined && !here?.fee) feeUsd = u.effect.guestFeeUsd;
    if (u.effect.visits !== undefined) visits = u.effect.visits;
  }
  const fee: Money | null = here?.fee ? { amount: here.fee.adult, currency: here.fee.currency } : usdMoney(feeUsd);
  // The card's child rate doesn't carry over to a lounge whose own rules aren't stated for this card.
  const childFee: Money | null = here?.fee
    ? here.fee.child !== undefined
      ? { amount: here.fee.child, currency: here.fee.currency }
      : null
    : location && !covered
      ? null
      : usdMoney(toNumber(rule.childGuestFeeUsd));

  // "0 per year": the network opens only once an unlock you've reached adds visits.
  const locked = visitCount(visits) === 0;
  const n = Math.max(0, Math.floor(guests));
  // Unknown allowance: no guest counts as free, and the cost stays unknown rather than assumed.
  const freeUsed = freeGuestsKnown ? Math.min(n, freeGuests) : 0;
  let paidGuests = n - freeUsed;

  // The terms' cap: free guests never exceed it (an unlock can raise both), and past it only family may come.
  const limit = rule.guestLimit;
  const max = limit ? Math.max(limit.max, freeGuests) : Infinity;
  const overLimit = limit && n > max ? limit : null;
  if (overLimit?.beyond && overLimit.beyondFree) paidGuests = Math.max(0, Math.min(n, max) - freeUsed);
  const overPaidLimit = here?.maxPaidGuests !== undefined && paidGuests > here.maxPaidGuests ? here.maxPaidGuests : null;

  let unpriced: Unpriced | null = null;
  if (notAdmitted) unpriced = "not-admitted";
  else if (locked) unpriced = "locked";
  else if (overLimit && !overLimit.beyond) unpriced = "over-limit";
  else if (overPaidLimit !== null) unpriced = "over-limit";
  else if (rule.passesOnly) unpriced = "passes";
  else if (paidGuests > 0 && !freeGuestsKnown) unpriced = "unconfirmed";
  else if (paidGuests > 0 && fee === null) unpriced = "unpublished";
  const cost: Money | null =
    unpriced !== null ? null : paidGuests === 0 ? { amount: 0, currency: fee?.currency ?? "USD" } : { amount: paidGuests * fee!.amount, currency: fee!.currency };
  // With passes, each adult who enters uses one: your guests beyond any free ones, and you.
  const passes = unpriced === "passes" ? paidGuests + 1 : null;
  return {
    cardId: rules.cardId,
    network: rule.network,
    rule,
    freeGuests,
    freeGuestsKnown,
    locked,
    guestFeeUsd: fee?.currency === "USD" ? fee.amount : null,
    fee,
    childFee,
    childGuestFeeUsd: childFee?.currency === "USD" ? childFee.amount : null,
    freeUsed,
    paidGuests,
    cost,
    passes,
    copay: notAdmitted || locked ? null : copay,
    costUsd: cost === null ? null : cost.amount === 0 ? 0 : cost.currency === "USD" ? cost.amount : null,
    unpriced,
    overLimit,
    overPaidLimit,
    location: location ? { rule: location, covered, notAdmitted } : null,
    unlockIgnored,
    visits,
    unlocks,
  };
}

const visitRank = (v: GuestCostOption["visits"]) => (v === "unlimited" || v === null ? 0 : 1);

/** Priced in dollars first, then in a lounge's own currency, then unpriceable, then networks still locked. */
const bucket = (o: GuestCostOption) => (o.cost ? (o.cost.amount === 0 || o.cost.currency === "USD" ? 0 : 1) : o.locked ? 3 : 2);

const copayAmount = (o: GuestCostOption) => o.copay?.amount ?? 0;

/** Same price for this visit (both free, or the same amount in the same currency, with the same lounge co-pay). */
export const sameCost = (a: GuestCostOption, b: GuestCostOption) =>
  a.cost !== null &&
  b.cost !== null &&
  a.cost.amount === b.cost.amount &&
  (a.cost.amount === 0 || a.cost.currency === b.cost.currency) &&
  copayAmount(a) === copayAmount(b);

/** Cheapest first; ties go to no lounge co-pay, then more spare free guests, then unlimited visits. */
export function compareOptions(a: GuestCostOption, b: GuestCostOption): number {
  const ba = bucket(a);
  const bb = bucket(b);
  if (ba !== bb || !a.cost || !b.cost) return ba - bb;
  if (a.cost.amount !== 0 && b.cost.amount !== 0 && a.cost.currency !== b.cost.currency) return 0;
  return (
    a.cost.amount - b.cost.amount ||
    copayAmount(a) - copayAmount(b) ||
    b.freeGuests - b.freeUsed - (a.freeGuests - a.freeUsed) ||
    visitRank(a.visits) - visitRank(b.visits)
  );
}

export interface GuestCostResult {
  /** One option per card (its cheapest way in through any of the networks), best first. */
  options: GuestCostOption[];
  /** The card to use, if any option can be priced. */
  best: GuestCostOption | null;
  /** Every option that costs the same as `best` (they're all as good). */
  tied: GuestCostOption[];
  /** Cards asked about that have no guest rules for these networks. */
  missing: string[];
}

/**
 * Guest cost per visit with each card, for a lounge reachable through any of `networks` (e.g. a Plaza Premium lounge
 * that also takes Priority Pass), with `guests` guests and the spend unlocks you've reached. `place` picks up rules
 * that only some lounges have (a Centurion Lounge abroad, a Capital One Landing).
 */
export function guestCosts(
  data: LoungeGuestRulesData,
  cardIds: string[],
  networks: LoungeNetwork[],
  guests: number,
  reached: ReadonlySet<string> = new Set(),
  place: GuestPlace | null = null,
): GuestCostResult {
  const options: GuestCostOption[] = [];
  const missing: string[] = [];
  for (const id of Array.from(new Set(cardIds))) {
    const rules = data.cards.find((c) => c.cardId === id);
    // At a lounge two networks reach (an Escape Lounge that takes Priority Pass), a card that costs the same either way
    // goes in through the lounge's own network: Amex checks Platinum cardmembers in under its own lounge rules.
    const candidates = (rules?.access ?? [])
      .filter((r) => networks.includes(r.network))
      .map((r) => optionFor(rules!, r, guests, reached, locationRuleFor(data, r.network, place), copayFor(place, r.network)))
      .sort((a, b) => compareOptions(a, b) || networks.indexOf(a.network) - networks.indexOf(b.network));
    if (candidates[0]) options.push(candidates[0]);
    else missing.push(id);
  }
  options.sort(compareOptions);
  const best = options[0] && options[0].cost !== null ? options[0] : null;
  const tied = best ? options.filter((o) => sameCost(o, best)) : [];
  return { options, best, tied, missing };
}

/** Every card with guest rules for any of these networks (for when no wallet or selection narrows it). */
export function cardsWithRules(data: LoungeGuestRulesData, networks: LoungeNetwork[]): string[] {
  return data.cards.filter((c) => c.access.some((a) => networks.includes(a.network))).map((c) => c.cardId);
}

/** Networks that have any card rules, for the finder's network picker. */
export function networksWithRules(data: LoungeGuestRulesData): LoungeNetwork[] {
  return Array.from(new Set(data.cards.flatMap((c) => c.access.map((a) => a.network))));
}

/** The per-guest fees cards publish for a network, lowest and highest (null when none does). */
export function publishedFees(data: LoungeGuestRulesData, network: LoungeNetwork): { low: number; high: number } | null {
  const fees = data.cards.flatMap((c) => c.access.filter((a) => a.network === network)).map((a) => toNumber(a.guestFeeUsd));
  const known = fees.filter((f): f is number => f !== null && f > 0);
  return known.length ? { low: Math.min(...known), high: Math.max(...known) } : null;
}

const SYMBOLS: Partial<Record<GuestCurrency, string>> = { USD: "$", GBP: "£", EUR: "€" };

/** "$90", "£70", "HKD 760", "JPY 16,600". */
export function moneyText(m: Money): string {
  const n = m.amount.toLocaleString("en-US", { minimumFractionDigits: Number.isInteger(m.amount) ? 0 : 2, maximumFractionDigits: 2 });
  const symbol = SYMBOLS[m.currency];
  return symbol ? `${symbol}${n}` : `${m.currency} ${n}`;
}

/** An option's guest cost in a few words: "Free", "$90", "£70", "3 passes", or why it can't be priced. */
export function costLabel(o: GuestCostOption): string {
  if (o.cost) return o.cost.amount === 0 ? "Free" : moneyText(o.cost);
  switch (o.unpriced) {
    case "not-admitted":
      return "Not admitted";
    case "locked":
      return "Needs unlock";
    case "over-limit":
      return "Too many guests";
    case "passes":
      return o.passes === 1 ? "1 pass" : `${o.passes} passes`;
    case "unpublished":
      return "Fee not published";
    default:
      return "Not confirmed";
  }
}

/** "the lounge's $15 Priority Pass co-pay", for an option that has one. */
export const copayText = (o: GuestCostOption) => (o.copay ? `the lounge's ${moneyText(o.copay)} Priority Pass co-pay` : "");

/** How the cost comes about, in one line: "1 free + 2 × $45", "2 free + 1 more (fee not published)". */
export function costDetail(o: GuestCostOption, guests: number): string {
  if (o.location?.notAdmitted) return "This lounge doesn't admit this card";
  if (o.locked) return "Opens only after the spend unlock";
  if (o.location && !o.location.covered) return "This lounge has its own guest rules, not stated for this card";
  if (o.unpriced === "passes" && o.passes !== null) {
    // Everyone enters on a pass, the cardmember included: "You and 2 guests: 3 of your 4 passes a year".
    const yearly = visitCount(o.visits);
    const who = guests === 0 ? "Just you" : guests === 1 ? "You and your guest" : `You and ${guests} guests`;
    const of = yearly !== null && Number.isFinite(yearly) ? `${o.passes} of your ${yearly} passes a year` : `${o.passes} pass${o.passes === 1 ? "" : "es"}`;
    return `${who}: ${of}`;
  }
  const copay = o.copay ? `plus ${copayText(o)}` : "";
  if (guests === 0) return ["Just you", copay].filter(Boolean).join(" · ");
  if (o.unpriced === "over-limit") {
    if (o.overPaidLimit !== null) return `Up to ${o.overPaidLimit} paid guest${o.overPaidLimit === 1 ? "" : "s"} here, after ${o.freeGuests} free`;
    const max = o.overLimit?.max ?? 0;
    return `Up to ${max} guest${max === 1 ? "" : "s"} per visit`;
  }
  if (!o.freeGuestsKnown) return "Guest allowance not confirmed";
  const free = o.freeUsed ? `${o.freeUsed} free` : "";
  const family = o.overLimit?.beyond ? `beyond ${o.overLimit.max}, only ${o.overLimit.beyond}${o.overLimit.beyondFree ? " (free)" : ""}` : "";
  let paid = "";
  if (o.paidGuests > 0) {
    // A fee quoted in U.S. dollars that lounges abroad charge in their own currency says so ("at U.S. lounges").
    if (o.fee) paid = `${o.paidGuests} × ${moneyText(o.fee)}${o.rule.localFees && o.fee.currency === "USD" && !o.location ? ` at U.S. lounges (${o.rule.localFees})` : ""}`;
    else paid = `${o.paidGuests} more (fee not published)`;
  }
  const head =
    o.paidGuests === 0 && !family
      ? `${guests === 1 ? "Your guest is" : `All ${guests} guests are`} free`
      : [free, paid].filter(Boolean).join(" + ") || `${guests === 1 ? "Your guest is" : `All ${guests} guests are`} free`;
  return [head, family, o.paidGuests > 0 && o.rule.guestPasses ? `or use ${o.rule.guestPasses}` : "", copay].filter(Boolean).join(" · ");
}

/** "Spend $75,000 per calendar year" */
export const unlockLabel = (u: GuestUnlock) =>
  `$${u.spendUsd.toLocaleString("en-US")} spent per ${u.period.replace(/^(per|a|each)\s+/i, "")}`;

/** "2 free guests", "unlimited visits", "guests $20"; an effect we can't read shows its own words (first clause). */
export function effectLabel(e: Effect, raw?: UnlockEffect): string {
  const parts: string[] = [];
  if (e.freeGuests !== undefined) parts.push(e.freeGuests === 1 ? "1 free guest" : `${e.freeGuests} free guests`);
  if (e.guestFeeUsd !== undefined && e.guestFeeUsd !== null) parts.push(e.guestFeeUsd === 0 ? "free guests" : `guests $${e.guestFeeUsd}`);
  if (e.visits !== undefined) parts.push(e.visits === "unlimited" ? "unlimited visits" : `${e.visits} visits`);
  if (parts.length) return parts.join(", ");
  if (typeof raw === "string" && raw.trim()) return raw.split(/[,;(]/)[0].trim();
  return "better guest terms";
}

/**
 * Visits as words: "Unlimited", "10 visits a year", or the rule as given ("10 per year"); null if unknown. With
 * `passes` (everyone enters on one of the card's passes) the count is of passes: "4 passes a year, one per adult".
 */
export function visitsLabel(v: GuestCostOption["visits"], passes = false): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (v === "unlimited") return passes ? "Unlimited passes" : "Unlimited visits";
  if (visitCount(v) === 0) return "Only after a spend unlock";
  const n = visitCount(v);
  if (passes && n !== null) return `${n} pass${n === 1 ? "" : "es"} a year, one for each adult who enters, you included`;
  return typeof v === "number" ? `${v} visits a year` : `${v.charAt(0).toUpperCase()}${v.slice(1)}`;
}
