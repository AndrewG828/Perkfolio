import type { LoungeNetwork } from "@/shared/data/types";
import type {
  CardGuestRules,
  CardLoungeAccessRule,
  GuestUnlock,
  LoungeGuestRulesData,
  NetworkGuestDefault,
  UnlockEffect,
} from "@/shared/data/travel/types";

/**
 * What it costs to bring guests into a lounge with each card, and which card to use. Pure: the lounge pages, the
 * finder's guest control and the tests share it.
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

export interface GuestCostOption {
  cardId: string;
  network: LoungeNetwork;
  rule: CardLoungeAccessRule;
  /** Free guests per visit after any unlocks you've reached. */
  freeGuests: number;
  /** Per-guest fee beyond the free ones; null when extra guests can't be priced. */
  guestFeeUsd: number | null;
  /** True when the fee is the network's usual fee because the card's rule has none. */
  feeFromNetwork: boolean;
  freeUsed: number;
  paidGuests: number;
  /** Cost per visit for your guests (you get in free). Null when some guests can't be priced or admitted. */
  costUsd: number | null;
  visits: number | "unlimited" | string | null;
  unlocks: AvailableUnlock[];
}

const toNumber = (n: number | null | undefined) => (typeof n === "number" && Number.isFinite(n) ? n : null);

export function optionFor(
  rules: CardGuestRules,
  rule: CardLoungeAccessRule,
  guests: number,
  reached: ReadonlySet<string>,
  defaults: NetworkGuestDefault[],
): GuestCostOption {
  let freeGuests = Math.max(0, toNumber(rule.freeGuests) ?? 0);
  let fee = toNumber(rule.guestFeeUsd);
  let visits = rule.visits;
  const unlocks: AvailableUnlock[] = rule.unlocks.map((unlock, i) => {
    const key = unlockKey(rules.cardId, rule.network, i);
    return { key, unlock, effect: parseEffect(unlock.effect), reached: reached.has(key) };
  });
  for (const u of unlocks) {
    if (!u.reached) continue;
    if (u.effect.freeGuests !== undefined) freeGuests = Math.max(freeGuests, u.effect.freeGuests);
    if (u.effect.guestFeeUsd !== undefined) fee = u.effect.guestFeeUsd;
    if (u.effect.visits !== undefined) visits = u.effect.visits;
  }
  let feeFromNetwork = false;
  if (fee === null) {
    const d = toNumber(defaults.find((n) => n.network === rule.network)?.guestFeeUsd);
    if (d !== null) {
      fee = d;
      feeFromNetwork = true;
    }
  }
  const n = Math.max(0, Math.floor(guests));
  const freeUsed = Math.min(n, freeGuests);
  const paidGuests = n - freeUsed;
  const costUsd = paidGuests === 0 ? 0 : fee === null ? null : paidGuests * fee;
  return { cardId: rules.cardId, network: rule.network, rule, freeGuests, guestFeeUsd: fee, feeFromNetwork, freeUsed, paidGuests, costUsd, visits, unlocks };
}

const visitRank = (v: GuestCostOption["visits"]) => (v === "unlimited" || v === null ? 0 : 1);

/** Cheapest first; unpriceable last; ties go to more spare free guests, then unlimited visits. */
export function compareOptions(a: GuestCostOption, b: GuestCostOption): number {
  if (a.costUsd === null || b.costUsd === null) return (a.costUsd === null ? 1 : 0) - (b.costUsd === null ? 1 : 0);
  return (
    a.costUsd - b.costUsd ||
    b.freeGuests - b.freeUsed - (a.freeGuests - a.freeUsed) ||
    visitRank(a.visits) - visitRank(b.visits)
  );
}

export interface GuestCostResult {
  /** One option per card (its cheapest way in through any of the networks), best first. */
  options: GuestCostOption[];
  /** The card to use, if any option can be priced. */
  best: GuestCostOption | null;
  /** Cards asked about that have no guest rules for these networks. */
  missing: string[];
}

/**
 * Guest cost per visit with each card, for a lounge reachable through any of `networks` (e.g. a Plaza Premium lounge
 * that also takes Priority Pass), with `guests` guests and the spend unlocks you've reached.
 */
export function guestCosts(
  data: LoungeGuestRulesData,
  cardIds: string[],
  networks: LoungeNetwork[],
  guests: number,
  reached: ReadonlySet<string> = new Set(),
): GuestCostResult {
  const options: GuestCostOption[] = [];
  const missing: string[] = [];
  for (const id of Array.from(new Set(cardIds))) {
    const rules = data.cards.find((c) => c.cardId === id);
    const candidates = (rules?.access ?? [])
      .filter((r) => networks.includes(r.network))
      .map((r) => optionFor(rules!, r, guests, reached, data.networkDefaults))
      .sort(compareOptions);
    if (candidates[0]) options.push(candidates[0]);
    else missing.push(id);
  }
  options.sort(compareOptions);
  const best = options[0] && options[0].costUsd !== null ? options[0] : null;
  return { options, best, missing };
}

/** Every card with guest rules for any of these networks (for when no wallet or selection narrows it). */
export function cardsWithRules(data: LoungeGuestRulesData, networks: LoungeNetwork[]): string[] {
  return data.cards.filter((c) => c.access.some((a) => networks.includes(a.network))).map((c) => c.cardId);
}

/** Networks that have any card rules, for the finder's network picker. */
export function networksWithRules(data: LoungeGuestRulesData): LoungeNetwork[] {
  return Array.from(new Set(data.cards.flatMap((c) => c.access.map((a) => a.network))));
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

/** Visits as words: "Unlimited", "10 a year", or the rule as given ("10 per year"); null if unknown. */
export function visitsLabel(v: GuestCostOption["visits"]): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (v === "unlimited") return "Unlimited visits";
  return typeof v === "number" ? `${v} visits a year` : `${v.charAt(0).toUpperCase()}${v.slice(1)}`;
}
