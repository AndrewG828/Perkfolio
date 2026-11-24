import type { Card } from "@/shared/data/types";
import { getCard } from "@/shared/data/cards";
import { applicationRules } from "@/shared/data/strategy/application-rules";
import type { ApplicationRule, RuleScope } from "@/shared/data/strategy/types";
import type { WalletState } from "./wallet";
import { addDays, addMonths, firstOfMonth, formatMonth, isoDate, monthIndex } from "./dates";

/**
 * Card eligibility: evaluates issuer rules (shared/data/strategy/application-rules) against the user's card
 * history and today's date. Every rule ends up eligible, blocked (with the date it clears, when there is one) or
 * unknown (with what's missing). Pure: pass `today` in.
 */

export type Verdict = "eligible" | "blocked" | "unknown";

/** One card account: an application the user entered, or a wallet card no open application covers. */
export interface HistoryRecord {
  /** Application id, or `wallet:<cardId>`. */
  key: string;
  source: "application" | "wallet";
  cardId?: string;
  name: string;
  issuer: string;
  business: boolean;
  /** "YYYY-MM", or "YYYY-MM-DD" for a wallet card's open date. Undefined when unknown. */
  opened?: string;
  closed?: string;
  /** Month the bonus posted. Undefined: none recorded. Null: unknown (a wallet card with no history entry). */
  bonusEarned?: string | null;
  open: boolean;
}

export interface HistoryContext {
  history: HistoryRecord[];
  /** False until the user starts their application history; rules that depend on it are then unknown. */
  historyKnown: boolean;
  /** Today as YYYY-MM-DD. */
  today: string;
}

export interface CountedCard {
  record: HistoryRecord;
  /** First day the card no longer counts (YYYY-MM-DD). */
  dropOff: string;
}

export interface RuleResult {
  rule: ApplicationRule;
  status: Verdict;
  /** One sentence for the user. */
  reason: string;
  /** First day the rule stops blocking (YYYY-MM-DD). */
  until?: string;
  /** Blocked for good (e.g. a once-per-lifetime bonus). */
  permanent?: boolean;
  /**
   * Blocked until the user does something, phrased to follow "once" or "if" (e.g. "you close one of them").
   * With `until` too, both must happen: the date passes and the user acts.
   */
  action?: string;
  /** What the user can add to settle an unknown. */
  missing?: string[];
  /** Count-based rules: the cards that counted, soonest drop-off first. */
  counted?: CountedCard[];
}

export interface CardEligibility {
  card: Card;
  /** Worst of approval and bonus: blocked, then unknown, then eligible. */
  status: Verdict;
  approval: Verdict;
  bonus: Verdict;
  /** The user has this card open now. */
  held: boolean;
  closedToApplicants: boolean;
  results: RuleResult[];
  blocking: RuleResult[];
  /** When every blocking rule has cleared. Undefined if one is permanent or waits on an action. */
  until?: string;
  permanent: boolean;
  historyKnown: boolean;
}

const DEFAULT_524 = { count: 5, months: 24, scope: "personal" as RuleScope };
const ORDER: Record<Verdict, number> = { eligible: 0, unknown: 1, blocked: 2 };
const worst = (vs: Verdict[]): Verdict => vs.reduce<Verdict>((w, v) => (ORDER[v] > ORDER[w] ? v : w), "eligible");

export const isClosedToApplicants = (card: Pick<Card, "welcomeOffer">) => /closed to new applicants/i.test(card.welcomeOffer);

const ISSUER_ALIASES: Record<string, string> = {
  amex: "american express",
  "bank of america": "bofa",
  bofa: "bofa",
  boa: "bofa",
  "u s bank": "us bank",
  usbank: "us bank",
  citibank: "citi",
  capitalone: "capital one",
  "jpmorgan chase": "chase",
  "chase bank": "chase",
};
const normIssuer = (s: string) => {
  const k = s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return ISSUER_ALIASES[k] ?? k;
};
export const sameIssuer = (a: string, b: string) => normIssuer(a) === normIssuer(b);

/**
 * The first day a card opened on `opened` stops counting toward a `months`-month window. A month-only date might be
 * the last day of that month, so it counts through the end of month + `months` (conservative by up to a month).
 */
export function dropOffDate(opened: string, months: number): string {
  const m = Math.ceil(months);
  if (opened.length === 7) return firstOfMonth(monthIndex(opened) + m + 1);
  return addDays(addMonths(opened, m), 1);
}

const monthOf = (date: string) => date.slice(0, 7);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** "A", "A or B", "A, B or C" ("and" for lists of things the user has). */
const nameList = (names: string[], conj: "or" | "and" = "or") => {
  const u = [...new Set(names)];
  return u.length <= 1 ? (u[0] ?? "") : `${u.slice(0, -1).join(", ")} ${conj} ${u[u.length - 1]}`;
};
const cardName = (id: string) => getCard(id)?.name ?? id;
/** "the Platinum Card from American Express": a card name ready for a sentence (no ®, no doubled "the"). */
export function thePhrase(name: string): string {
  const clean = name.replace(/[®℠™]/g, "").replace(/\s+/g, " ").trim();
  return /^the /i.test(clean) ? `the${clean.slice(3)}` : "the " + clean;
}
/** "your Platinum Card from American Express". */
const yourPhrase = (name: string) => `your ${thePhrase(name).slice(4)}`;

/** Applications, plus wallet cards that no open application covers (their open date may be unknown). */
export function accountHistory(wallet: WalletState): HistoryRecord[] {
  const apps = Array.isArray(wallet.applications) ? wallet.applications : [];
  const records: HistoryRecord[] = apps.map((a) => ({
    key: a.id,
    source: "application",
    ...(a.cardId ? { cardId: a.cardId } : {}),
    name: a.name ?? (a.cardId ? cardName(a.cardId) : "Card"),
    issuer: a.issuer,
    business: a.business,
    opened: a.opened,
    ...(a.closed ? { closed: a.closed } : {}),
    ...(a.bonusEarned ? { bonusEarned: a.bonusEarned } : {}),
    open: !a.closed,
  }));
  const covered = new Set(apps.filter((a) => !a.closed && a.cardId).map((a) => a.cardId));
  for (const id of wallet.cards) {
    const card = getCard(id);
    if (!card || covered.has(id)) continue;
    const opened = wallet.openDates?.[id];
    records.push({
      key: `wallet:${id}`,
      source: "wallet",
      cardId: id,
      name: card.name,
      issuer: card.issuer,
      business: card.category === "business",
      ...(opened ? { opened } : {}),
      bonusEarned: null,
      open: true,
    });
  }
  return records;
}

export function historyContext(wallet: WalletState, today: Date): HistoryContext {
  return { history: accountHistory(wallet), historyKnown: Array.isArray(wallet.applications), today: isoDate(today) };
}

function inScope(r: HistoryRecord, issuer: string, scope: RuleScope, family?: Set<string>): boolean {
  const mine = sameIssuer(r.issuer, issuer);
  switch (scope) {
    case "personal":
      return !r.business;
    case "business":
      return r.business;
    case "issuer":
      return mine;
    case "issuer-personal":
      return mine && !r.business;
    case "issuer-business":
      return mine && r.business;
    case "family":
      return Boolean(r.cardId && family?.has(r.cardId));
    default:
      return true;
  }
}

function describeScope(scope: RuleScope, issuer: string, n: number): string {
  const word = n === 1 ? "card" : "cards";
  switch (scope) {
    case "personal":
      return `personal ${word}`;
    case "business":
      return `business ${word}`;
    case "issuer":
      return `${issuer} ${word}`;
    case "issuer-personal":
      return `personal ${issuer} ${word}`;
    case "issuer-business":
      return `${issuer} business ${word}`;
    case "family":
      return `${issuer} ${word} this rule counts`;
    default:
      return word;
  }
}

/** Cards in scope opened inside the window (soonest drop-off first), plus in-scope cards with no open date. */
function countWithin(ctx: HistoryContext, issuer: string, scope: RuleScope, months: number, family?: Set<string>) {
  const pool = ctx.history.filter((r) => inScope(r, issuer, scope, family));
  const counted = pool
    .filter((r): r is HistoryRecord & { opened: string } => Boolean(r.opened))
    .map((record) => ({ record, dropOff: dropOffDate(record.opened, months) }))
    .filter((c) => c.dropOff > ctx.today)
    .sort((a, b) => a.dropOff.localeCompare(b.dropOff) || a.record.name.localeCompare(b.record.name));
  const undated = pool.filter((r) => !r.opened);
  return { counted, undated };
}

const familyOf = (rule: ApplicationRule, card: Card) => new Set(rule.logic.family?.length ? rule.logic.family : [card.id]);
/** The `missing` entry for rules that need the user's application history. */
export const NEEDS_HISTORY = "your card history";

function countRule(rule: ApplicationRule, ctx: HistoryContext): RuleResult {
  const { type, count = 1, months = 12 } = rule.logic;
  const scope = rule.logic.scope ?? (type === "max-new-cards" ? "personal" : "issuer");
  const family = rule.logic.family ? new Set(rule.logic.family) : undefined;
  const { counted, undated } = countWithin(ctx, rule.issuer, scope, months, family);
  const n = counted.length;
  const what = describeScope(scope, rule.issuer, n);
  const window = `in the past ${months} months`;
  if (n >= count) {
    return {
      rule,
      status: "blocked",
      reason: `You've opened ${n} ${what} ${window}; this rule blocks at ${count}.`,
      until: counted[n - count].dropOff,
      counted,
    };
  }
  if (n + undated.length >= count) {
    return {
      rule,
      status: "unknown",
      reason: `${n} ${what} ${window}, plus ${plural(undated.length, "card")} without an open date.`,
      missing: undated.map((r) => `the open date for ${yourPhrase(r.name)}`),
      counted,
    };
  }
  const tally = n === 0 ? `No ${describeScope(scope, rule.issuer, 2)} opened ${window}` : `${n} of ${count}: ${n} ${what} opened ${window}`;
  if (!ctx.historyKnown) {
    return { rule, status: "unknown", reason: `${tally} that we know of. Add your card history to be sure.`, missing: [NEEDS_HISTORY], counted };
  }
  return { rule, status: "eligible", reason: `${tally}.`, counted };
}

function oncePerLifetime(rule: ApplicationRule, card: Card, ctx: HistoryContext): RuleResult {
  const fam = familyOf(rule, card);
  const had = ctx.history.filter((r) => r.cardId && fam.has(r.cardId));
  const famNames = nameList([...fam].map(cardName));
  if (had.length) {
    const current = had.find((r) => r.open);
    const first = current ?? had[0];
    return {
      rule,
      status: "blocked",
      permanent: true,
      reason: current
        ? `You have ${thePhrase(first.name)}.`
        : `You had ${thePhrase(first.name)}${first.opened ? ` (opened ${formatMonth(first.opened)})` : ""}.`,
    };
  }
  if (!ctx.historyKnown) {
    return { rule, status: "unknown", reason: `Only if you've never had ${thePhrase(famNames)}.`, missing: [NEEDS_HISTORY] };
  }
  return { rule, status: "eligible", reason: `You haven't had ${thePhrase(famNames)}.` };
}

function familyBonus(rule: ApplicationRule, card: Card, ctx: HistoryContext): RuleResult {
  const fam = familyOf(rule, card);
  const famNames = nameList([...fam].map(cardName));
  const members = ctx.history.filter((r) => r.cardId && fam.has(r.cardId));
  const { months } = rule.logic;

  if (months === undefined) {
    if (members.length) {
      return { rule, status: "blocked", permanent: true, reason: `You have or had ${thePhrase(nameList(members.map((r) => r.name), "and"))}.` };
    }
    if (!ctx.historyKnown) return { rule, status: "unknown", reason: `Only if you've never had ${thePhrase(famNames)}.`, missing: [NEEDS_HISTORY] };
    return { rule, status: "eligible", reason: `You haven't had ${thePhrase(famNames)}.` };
  }

  const holding = members.filter((r) => r.open);
  const recent = members
    .filter((r): r is HistoryRecord & { bonusEarned: string } => typeof r.bonusEarned === "string")
    .map((r) => ({ r, clears: firstOfMonth(monthIndex(r.bonusEarned) + Math.ceil(months) + 1) }))
    .filter((x) => x.clears > ctx.today)
    .sort((a, b) => b.clears.localeCompare(a.clears));
  if (holding.length || recent.length) {
    const held = thePhrase(nameList(holding.map((r) => r.name), "and"));
    const last = recent[0];
    const when = last ? formatMonth(last.r.bonusEarned) : "";
    const reason = !last
      ? `You have ${held}.`
      : !holding.length
        ? `You earned a bonus on ${thePhrase(last.r.name)} in ${when}.`
        : holding.some((h) => h.key === last.r.key)
          ? `You have ${held} and earned its bonus in ${when}.`
          : `You have ${held} and earned a bonus on ${thePhrase(last.r.name)} in ${when}.`;
    return {
      rule,
      status: "blocked",
      reason,
      ...(last ? { until: last.clears } : {}),
      ...(holding.length ? { action: `you no longer have ${held}` } : {}),
    };
  }
  if (!ctx.historyKnown) {
    return {
      rule,
      status: "unknown",
      reason: `Only if you don't have ${thePhrase(famNames)} and haven't earned one's bonus in the past ${months} months.`,
      missing: [NEEDS_HISTORY],
    };
  }
  return { rule, status: "eligible", reason: `You don't have ${thePhrase(famNames)} and haven't earned one's bonus in the past ${months} months.` };
}

function cooldown(rule: ApplicationRule, card: Card, ctx: HistoryContext): RuleResult {
  const months = Math.ceil(rule.logic.months ?? 0);
  const fam = familyOf(rule, card);
  const famNames = nameList([...fam].map(cardName));
  const members = ctx.history.filter((r) => r.cardId && fam.has(r.cardId));
  let latest: { r: HistoryRecord; clears: string } | undefined;
  const unsure: HistoryRecord[] = [];
  for (const r of members) {
    if (typeof r.bonusEarned === "string") {
      const clears = firstOfMonth(monthIndex(r.bonusEarned) + months + 1);
      if (clears > ctx.today && (!latest || clears > latest.clears)) latest = { r, clears };
    } else if (r.bonusEarned === null) {
      // A wallet card we know nothing about. If it was opened long enough ago, any bonus on it is too old to matter
      // (bonuses post within months of opening; allow six).
      if (r.opened && firstOfMonth(monthIndex(monthOf(r.opened)) + months + 7) <= ctx.today) continue;
      unsure.push(r);
    }
  }
  if (latest && typeof latest.r.bonusEarned === "string") {
    return { rule, status: "blocked", reason: `You earned a bonus on ${thePhrase(latest.r.name)} in ${formatMonth(latest.r.bonusEarned)}.`, until: latest.clears };
  }
  if (unsure.length) {
    return {
      rule,
      status: "unknown",
      reason: `Depends on when you earned the bonus on ${yourPhrase(nameList(unsure.map((r) => r.name)))}.`,
      missing: unsure.map((r) => `when you earned ${thePhrase(r.name)} bonus (add it to your card history)`),
    };
  }
  if (!ctx.historyKnown) {
    return { rule, status: "unknown", reason: `Only if you haven't earned a ${famNames} bonus in the past ${months} months.`, missing: [NEEDS_HISTORY] };
  }
  return { rule, status: "eligible", reason: `No ${famNames} bonus in the past ${months} months.` };
}

function maxOpen(rule: ApplicationRule, ctx: HistoryContext): RuleResult {
  const count = rule.logic.count ?? 1;
  const family = rule.logic.family?.length ? new Set(rule.logic.family) : undefined;
  const scope = rule.logic.scope ?? (family ? "family" : "issuer");
  const open = ctx.history.filter((r) => r.open && inScope(r, rule.issuer, scope, family));
  const n = open.length;
  const what = describeScope(scope, rule.issuer, n);
  if (n >= count) {
    return { rule, status: "blocked", reason: `You have ${n} open ${what}; the limit is ${count}.`, action: "you close one of them" };
  }
  if (!ctx.historyKnown) {
    return { rule, status: "unknown", reason: `${n} of ${count} open that we know of. Add your card history to be sure.`, missing: [NEEDS_HISTORY] };
  }
  return { rule, status: "eligible", reason: `${n} of ${count} open.` };
}

export function evaluateRule(rule: ApplicationRule, card: Card, ctx: HistoryContext): RuleResult {
  switch (rule.logic.type) {
    case "max-new-cards":
    case "velocity":
      return countRule(rule, ctx);
    case "once-per-lifetime":
      return oncePerLifetime(rule, card, ctx);
    case "family-bonus":
      return familyBonus(rule, card, ctx);
    case "cooldown":
      return cooldown(rule, card, ctx);
    case "max-open":
      return maxOpen(rule, ctx);
    default:
      return { rule, status: "unknown", reason: "We can't check this rule yet." };
  }
}

export function evaluateCard(card: Card, ctx: HistoryContext, rules: ApplicationRule[] = applicationRules.rules): CardEligibility {
  const results = rules.filter((r) => r.appliesTo.includes(card.id)).map((r) => evaluateRule(r, card, ctx));
  const blocking = results.filter((r) => r.status === "blocked");
  const approval = worst(results.filter((r) => r.rule.kind === "approval").map((r) => r.status));
  const bonus = worst(results.filter((r) => r.rule.kind === "bonus").map((r) => r.status));
  const open = blocking.some((r) => !r.until || r.action);
  return {
    card,
    status: worst([approval, bonus]),
    approval,
    bonus,
    held: ctx.history.some((r) => r.open && r.cardId === card.id),
    closedToApplicants: isClosedToApplicants(card),
    results,
    blocking,
    ...(blocking.length && !open ? { until: blocking.reduce((max, r) => (r.until! > max ? r.until! : max), "") } : {}),
    permanent: blocking.some((r) => r.permanent),
    historyKnown: ctx.historyKnown,
  };
}

export function evaluateCards(cards: Card[], wallet: WalletState, today: Date, rules?: ApplicationRule[]): CardEligibility[] {
  const ctx = historyContext(wallet, today);
  return cards.map((c) => evaluateCard(c, ctx, rules));
}

export interface NewCardCount {
  rule?: ApplicationRule;
  limit: number;
  months: number;
  /** Cards that count now, soonest drop-off first. */
  counted: CountedCard[];
  /** Personal cards in the wallet without an open date (they might count). */
  undated: HistoryRecord[];
  count: number;
  historyKnown: boolean;
  /** "at-limit": the rule blocks now. "unknown": undated cards or a missing history could change the answer. */
  status: "under" | "at-limit" | "unknown";
  /** When the count goes back under the limit, if it's at or over now. */
  underOn?: string;
}

/** The Chase 5/24 counter: personal cards from any issuer opened in the window, with the day each drops off. */
export function chase524(ctx: HistoryContext, rules: ApplicationRule[] = applicationRules.rules): NewCardCount {
  const rule = rules.find((r) => r.logic.type === "max-new-cards" && sameIssuer(r.issuer, "Chase"));
  const limit = rule?.logic.count ?? DEFAULT_524.count;
  const months = rule?.logic.months ?? DEFAULT_524.months;
  const scope = rule?.logic.scope ?? DEFAULT_524.scope;
  const family = rule?.logic.family ? new Set(rule.logic.family) : undefined;
  const { counted, undated } = countWithin(ctx, rule?.issuer ?? "Chase", scope, months, family);
  const count = counted.length;
  const status = count >= limit ? "at-limit" : count + undated.length >= limit || !ctx.historyKnown ? "unknown" : "under";
  return {
    ...(rule ? { rule } : {}),
    limit,
    months,
    counted,
    undated,
    count,
    historyKnown: ctx.historyKnown,
    status,
    ...(count >= limit ? { underOn: counted[count - limit].dropOff } : {}),
  };
}
