import type { Card } from "@/shared/data/types";
import { getCard } from "@/shared/data/cards";
import { applicationRules } from "@/shared/data/strategy/application-rules";
import { OTHER_PRODUCT_MATCHERS, matchOtherProduct, otherProductCardType, type OtherProductMatch } from "@/shared/data/strategy/other-products";
import type { ApplicationRule, CardType, RuleCondition, RuleEffect, RuleEvent, Segment, UserFact } from "@/shared/data/strategy/types";
import { NO_BONUS, type WalletState } from "./wallet";
import { addDays, addMonths, firstOfMonth, formatDateOrMonth, formatMonth, isoDate, monthIndex } from "./dates";

/**
 * Card eligibility: evaluates issuer rules (shared/data/strategy/application-rules) against the user's card
 * history and today's date. Each rule ends up:
 * - eligible: nothing in the history triggers it;
 * - warning: a soft limit, a bonus the issuer "may" withhold (its discretion), or a card that counts only if the
 *   rule covers it (an authorized-user card where no outlet says, a co-brand under a "branded cards" rule), with
 *   `until` when it clears;
 * - unknown: we need something (an exact day, an open date, a bonus month, the card history, or an answer);
 * - blocked: the issuer's wording rules it out, or a firm reported limit is reached (`until`, `action`,
 *   `permanent` say when it clears);
 * - notice: nothing to compute (or the history can't show it, like declined applications): shown as a caveat.
 * Pure: pass `today` in.
 */

export type Verdict = "eligible" | "warning" | "unknown" | "blocked";
export type RuleStatus = Verdict | "notice";

/** One card account: an application the user entered, or a wallet card no open application covers. */
export interface HistoryRecord {
  /** Application id, or `wallet:<cardId>`. */
  key: string;
  source: "application" | "wallet";
  cardId?: string;
  name: string;
  issuer: string;
  business: boolean;
  /** "YYYY-MM", or "YYYY-MM-DD" when the day is known. Undefined when unknown (a wallet card without a date). */
  opened?: string;
  /** "YYYY-MM" or "YYYY-MM-DD". */
  closed?: string;
  /** Month the bonus posted. Undefined: the user says there was none. Null: not recorded. */
  bonusEarned?: string | null;
  open: boolean;
  /** The user is an authorized user on someone else's account. */
  authorizedUser?: boolean;
}

/** Answers to the questions some rules depend on, e.g. whether the user banks with Bank of America. */
export type UserFacts = Partial<Record<UserFact, boolean>>;

export const USER_FACTS: Record<UserFact, { question: string; yes: string; no: string; short: string }> = {
  hasBankOfAmericaDepositAccount: {
    question: "Do you have a Bank of America deposit account, like checking or savings?",
    yes: "you have a Bank of America deposit account",
    no: "you don't have a Bank of America deposit account",
    short: "Bank of America deposit account",
  },
};

export interface HistoryContext {
  history: HistoryRecord[];
  /** False until the user starts their application history; rules that depend on it are then unknown. */
  historyKnown: boolean;
  /** Today as YYYY-MM-DD. */
  today: string;
  facts: UserFacts;
}

export interface CountedCard {
  record: HistoryRecord;
  /** First day the card no longer counts (YYYY-MM-DD). With only a month to go on, the latest it could be. */
  dropOff: string;
}

export interface RuleResult {
  rule: ApplicationRule;
  status: RuleStatus;
  /** One or two sentences for the user. */
  reason: string;
  /** What the rule does when it bites (for blocked and warning results). */
  effect?: RuleEffect;
  /** First day the rule stops blocking or warning (YYYY-MM-DD). */
  until?: string;
  /** No time limit (a once-per-lifetime bonus, say). */
  permanent?: boolean;
  /**
   * Cleared by something the user does, phrased to follow "once" or "if" (e.g. "you close one of them").
   * With `until` too, both must happen: the date passes and the user acts.
   */
  action?: string;
  /** What the user can add to settle an unknown (or to see whether a block lasts longer). */
  missing?: string[];
  /** A question to answer: the rule applies only for one answer, and it would bite. */
  question?: UserFact;
  /** The history entries (`HistoryRecord.key`) that `missing` is about, so the page can link to them. */
  records?: string[];
  /** Things we can't check that could change the answer, and assumptions we made. */
  caveats?: string[];
  /** Count-based rules: the cards that counted in the binding window, soonest drop-off first. */
  counted?: CountedCard[];
}

export interface CardEligibility {
  card: Card;
  /** Worst of approval and bonus: blocked, then unknown, then warning, then eligible. */
  status: Verdict;
  approval: Verdict;
  bonus: Verdict;
  /** The user has this card open now (their own account, not an authorized-user card). */
  held: boolean;
  closedToApplicants: boolean;
  /** Every rule that applies, worst first (notices last). */
  results: RuleResult[];
  blocking: RuleResult[];
  warnings: RuleResult[];
  /** Questions that would settle an unknown. */
  questions: UserFact[];
  /** When every blocking rule has cleared. Undefined if one is permanent or waits on an action. */
  until?: string;
  permanent: boolean;
  historyKnown: boolean;
}

const RANK: Record<Verdict, number> = { eligible: 0, warning: 1, unknown: 2, blocked: 3 };
const worst = (vs: Verdict[]): Verdict => vs.reduce<Verdict>((w, v) => (RANK[v] > RANK[w] ? v : w), "eligible");
const RESULT_ORDER: Record<RuleStatus, number> = { blocked: 0, unknown: 1, warning: 2, eligible: 3, notice: 4 };

/** Warning for a bonus the issuer may withhold, or a soft limit; a block otherwise. */
export const statusOfEffect = (effect: RuleEffect, soft?: boolean): Verdict =>
  effect === "bonus-at-risk" || (effect === "likely-denied" && soft) ? "warning" : "blocked";

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
  "j p morgan": "chase",
  "jp morgan": "chase",
  jpmorgan: "chase",
  td: "td bank",
  "td bank n a": "td bank",
  "td bank na": "td bank",
};
const normIssuer = (s: string) => {
  const k = s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return ISSUER_ALIASES[k] ?? k;
};
export const sameIssuer = (a: string, b: string) => normIssuer(a) === normIssuer(b);
const shortIssuer = (s: string) => (sameIssuer(s, "American Express") ? "Amex" : s);

// --- Dates and windows ------------------------------------------------------------------------------------------

/** A window to count back from today: days, or months (calendar months for Chase 5/24). */
export interface Window {
  days?: number;
  months?: number;
  calendar?: boolean;
}

/**
 * The first day an event on `day` (YYYY-MM-DD) no longer falls inside the window: N days later for day windows;
 * the day after the N-month anniversary for month windows; the 1st of the month N + 1 months on for calendar
 * windows (opened Oct 2024 → stops counting toward 5/24 on Nov 1, 2026).
 */
export function windowEnd(day: string, w: Window): string {
  if (w.days !== undefined) return addDays(day, w.days);
  const months = Math.ceil(w.months ?? 0);
  if (w.calendar) return firstOfMonth(monthIndex(day.slice(0, 7)) + months + 1);
  return addDays(addMonths(day, months), 1);
}

/** The first and last day a history date could be: a month runs to its last day, but never past today. */
function daySpan(date: string, today: string): { first: string; last: string } {
  if (date.length >= 10) return { first: date, last: date };
  const first = `${date}-01`;
  const end = addDays(firstOfMonth(monthIndex(date) + 1), -1);
  return { first, last: end <= today ? end : today < first ? first : today };
}

/**
 * The first day an account opened on `opened` stops counting toward a `months`-month window. A month-only date is
 * taken as the last day of that month, so it's on the safe side by up to a month (Chase's calendar-month windows
 * don't depend on the day at all).
 */
export function dropOffDate(opened: string, months: number, calendar = false): string {
  return windowEnd(daySpan(opened, "9999-12-31").last, { months, calendar });
}

type Position = { state: "in" | "maybe"; end: string } | "undated" | null;

/**
 * Where a history date sits relative to a window counted back from today. Month windows take a month-only date
 * as its last day (a conservative "in"); day windows need the day, so a month that straddles the edge is "maybe".
 */
function position(date: string | undefined, w: Window, today: string): Position {
  if (!date) return "undated";
  const s = daySpan(date, today);
  const end = windowEnd(s.last, w);
  if (end <= today) return null;
  if (w.days !== undefined && windowEnd(s.first, w) <= today) return { state: "maybe", end };
  return { state: "in", end };
}

const windowOf = (c: { withinDays?: number; withinMonths?: number }): Window | undefined =>
  c.withinDays !== undefined ? { days: c.withinDays } : c.withinMonths !== undefined ? { months: c.withinMonths } : undefined;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const windowText = (w: Window) => (w.days !== undefined ? plural(w.days, "day") : plural(w.months ?? 0, "month"));
const lcFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const ucFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const latest = (ds: string[]) => ds.reduce((m, d) => (d > m ? d : m), "");
const uniq = <T,>(xs: T[]) => [...new Set(xs)];
/** "on Oct 1, 2026" or "in Oct 2026". */
const when = (date: string) => (date.length >= 10 ? `on ${formatDateOrMonth(date)}` : `in ${formatMonth(date)}`);
/** "no" for zero, else the number. */
const howMany = (n: number) => (n === 0 ? "no" : String(n));

// --- Names ------------------------------------------------------------------------------------------------------

/** "A", "A or B", "A, B or C" ("and" for lists of things the user has). */
const nameList = (names: string[], conj: "or" | "and" = "or") => {
  const u = uniq(names);
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
/** A label from the research ready for a sentence: "the Citi Premier Card", "any other United Club credit card". */
const labelPhrase = (label: string) => (/^(any|earlier) /i.test(label) ? label : thePhrase(label));

// --- History ----------------------------------------------------------------------------------------------------

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
    // No month and no "none": not recorded, which bonus rules treat as unknown.
    ...(a.bonusEarned === NO_BONUS ? {} : { bonusEarned: a.bonusEarned ?? null }),
    open: !a.closed,
    ...(a.authorizedUser ? { authorizedUser: true } : {}),
  }));
  // An open application covers the wallet card it describes, the user's own or an authorized-user card.
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

export function historyContext(wallet: WalletState, today: Date, facts: UserFacts = {}): HistoryContext {
  return { history: accountHistory(wallet), historyKnown: Array.isArray(wallet.applications), today: isoDate(today), facts };
}

/** The `missing` entry for rules that need the user's application history. */
export const NEEDS_HISTORY = "your card history";

const cardTypeOf = (r: HistoryRecord): CardType | undefined =>
  r.cardId ? applicationRules.cardTypes[r.cardId] : otherProductCardType(r, sameIssuer);

/** For Chase 5/24: whether a business card shows on the personal credit report (most don't). */
function onPersonalReport(r: HistoryRecord, rule: ApplicationRule): boolean {
  const known = rule.logic.businessCardsOnPersonalReport ?? {};
  if (r.cardId) return known[r.cardId] ?? false;
  for (const [label, reported] of Object.entries(rule.logic.businessCardsOnPersonalReportOther ?? {})) {
    if (matchOtherProduct(label, r, sameIssuer).match) return reported;
  }
  return false;
}

/**
 * Why a card may or may not count toward a numeric rule: an authorized-user card where no outlet reports whether
 * they count, a card we don't list under a rule that counts one brand only (Wells Fargo-branded cards), or a card
 * the research leaves as an open question for the rule (`counts.mayCount`: Discover cards under Capital One's six
 * months, the Green Card under Amex's credit-card cap; `note` says why).
 */
type Uncertainty = "authorized-user" | "brand" | "may-count";

interface Counts {
  ok: boolean;
  /** Counts only if it's a credit card, and we don't know its type. */
  assumedCredit?: boolean;
  uncertain?: Uncertainty;
  /** For "may-count": the research's note. */
  note?: string;
}

/** A card inside a numeric rule's scope that counts only if the rule covers it. */
interface UncertainCard {
  record: HistoryRecord;
  why: Uncertainty;
  note?: string;
}

/** Whether a record counts toward a numeric rule. */
function countsToward(r: HistoryRecord, rule: ApplicationRule, segments: Segment[]): Counts {
  const c = rule.logic.counts;
  if (!c) return { ok: false };
  let uncertain: Uncertainty | undefined;
  if (r.authorizedUser) {
    // Only rules that say so count cards on someone else's account (5/24 does; the Amex cap doesn't). Pacing rules
    // count the user's own applications and accounts, which an authorized-user card isn't. Null: no outlet says.
    if (c.includeAuthorizedUser === null) uncertain = "authorized-user";
    else if (c.includeAuthorizedUser !== true) return { ok: false };
  }
  const segment: Segment = r.business ? "business" : "personal";
  const inSegment =
    segments.includes(segment) || (segment === "business" && Boolean(c.includeBusinessIfOnPersonalReport) && onPersonalReport(r, rule));
  // Cards the research can't place (a Discover card under Capital One's rule): "may count", whatever their issuer or type.
  const may = c.mayCount?.find((m) => (r.cardId !== undefined && m.cards?.includes(r.cardId)) || m.issuers?.some((i) => sameIssuer(r.issuer, i)));
  if (may) return inSegment ? { ok: true, uncertain: uncertain ?? "may-count", note: may.note } : { ok: false };
  if (c.issuers !== "any" && !c.issuers.some((i) => sameIssuer(r.issuer, i))) return { ok: false };
  if (!inSegment) return { ok: false };
  // Our dataset's cards from the issuer carry its brand; a card we don't list may be a co-brand.
  if (c.brand && !r.cardId) uncertain ??= "brand";
  const extra = uncertain ? { uncertain } : {};
  if (c.cardTypes && c.cardTypes.length === 1) {
    const type = cardTypeOf(r);
    if (type && type !== c.cardTypes[0]) return { ok: false };
    if (!type) return { ok: true, assumedCredit: c.cardTypes[0] === "credit", ...extra };
  }
  return { ok: true, ...extra };
}

function segmentsFor(rule: ApplicationRule, card: Pick<Card, "category">): Segment[] {
  const s = rule.logic.counts?.segments;
  if (s === "same-as-applied-card") return [card.category === "business" ? "business" : "personal"];
  return s ?? ["personal", "business"];
}

/** "personal cards from any bank", "Amex credit cards", "personal Bank of America cards". */
function describeCounted(rule: ApplicationRule, segments: Segment[], n: number): string {
  const c = rule.logic.counts;
  const issuers = !c || c.issuers === "any" ? "" : `${nameList(c.issuers.map(shortIssuer))} `;
  const type = c?.cardTypes?.length === 1 ? `${c.cardTypes[0]} ` : "";
  const segment = segments.length === 1 ? `${segments[0]} ` : "";
  const from = !c || c.issuers === "any" ? " from any bank" : "";
  return `${segment}${issuers}${type}${n === 1 ? "card" : "cards"}${from}`;
}

/** "You've ___ 2 cards". */
const EVENT_VERB: Partial<Record<RuleEvent, string>> = {
  opened: "opened",
  approved: "been approved for",
  applied: "applied for",
};

interface WindowCount {
  w: { count: number; note?: string } & Window;
  segments: Segment[];
  /** Surely inside the window and counted. */
  counted: CountedCard[];
  /** A month-only date that may be inside a day window. */
  maybe: CountedCard[];
  /** No open date: may be inside. */
  undated: HistoryRecord[];
  /** Inside the window, but the rule may not count them (`why`). */
  uncertain: (CountedCard & UncertainCard)[];
  assumed: string[];
  blocked: boolean;
  until?: string;
}

const byDropOff = (a: CountedCard, b: CountedCard) => a.dropOff.localeCompare(b.dropOff) || a.record.name.localeCompare(b.record.name);

function countWindow(rule: ApplicationRule, w: WindowCount["w"], segments: Segment[], ctx: HistoryContext): WindowCount {
  const counted: CountedCard[] = [];
  const maybe: CountedCard[] = [];
  const undated: HistoryRecord[] = [];
  const uncertain: WindowCount["uncertain"] = [];
  const assumed: string[] = [];
  for (const record of ctx.history) {
    const k = countsToward(record, rule, segments);
    if (!k.ok) continue;
    const pos = position(record.opened, w, ctx.today);
    if (pos === null) continue;
    if (k.assumedCredit) assumed.push(record.name);
    if (pos === "undated") undated.push(record);
    else if (k.uncertain) uncertain.push({ record, dropOff: pos.end, why: k.uncertain, ...(k.note ? { note: k.note } : {}) });
    else (pos.state === "in" ? counted : maybe).push({ record, dropOff: pos.end });
  }
  counted.sort(byDropOff);
  maybe.sort(byDropOff);
  uncertain.sort(byDropOff);
  const blocked = counted.length >= w.count;
  // Conservative: an account that may still be inside the window keeps it blocked until it surely isn't.
  const all = [...counted, ...maybe].sort(byDropOff);
  return { w, segments, counted, maybe, undated, uncertain, assumed, blocked, ...(blocked ? { until: all[all.length - w.count].dropOff } : {}) };
}

// --- Numeric rules (max-new-cards, velocity, max-open) ----------------------------------------------------------

/** What a numeric rule's limit means, as a sentence: "Amex reportedly approves no more than 1 in 5 days." */
function limitSentence(rule: ApplicationRule, w: Window & { count: number }): string {
  const issuer = shortIssuer(rule.issuer);
  const L = rule.logic;
  if (L.type === "max-new-cards") {
    return L.soft ? `At ${w.count} or more, ${issuer} is less likely to approve you; it's a soft limit.` : `At ${w.count} or more, ${issuer} likely declines.`;
  }
  const applied = L.counts?.event === "applied";
  const what = applied ? `${plural(w.count, "application")}` : String(w.count);
  const verb = applied ? "accept" : "approve";
  if (L.soft) return `${issuer} tends to ${verb} no more than ${what} in ${windowText(w)}, though it's a soft limit.`;
  if (rule.certainty === "official") return `${issuer} may not ${verb} more than ${what} in ${windowText(w)}.`;
  return `${issuer} reportedly ${verb}s no more than ${what} in ${windowText(w)}.`;
}

/** The same, shortened for a passing result: "the limit is 2", "Chase likely declines at 5". */
function limitShort(rule: ApplicationRule, count: number): string {
  if (rule.logic.type === "max-new-cards") {
    return rule.logic.soft ? `approval gets less likely at ${count}` : `${shortIssuer(rule.issuer)} likely declines at ${count}`;
  }
  return `${rule.logic.soft ? "the soft limit is" : "the limit is"} ${count}`;
}

/**
 * Cards that count only if the rule covers them, for a sentence: "the Discover it Cash Back", "2 cards you're an
 * authorized user on (the Chase Sapphire Preferred and the American Express Gold Card)".
 */
function uncertainList(items: UncertainCard[]): string {
  const au = uniq(items.filter((u) => u.why === "authorized-user").map((u) => thePhrase(u.record.name)));
  const parts = uniq(items.filter((u) => u.why !== "authorized-user").map((u) => thePhrase(u.record.name)));
  if (au.length) parts.push(`${au.length === 1 ? "a card" : `${au.length} cards`} you're an authorized user on (${nameList(au, "and")})`);
  return nameList(parts, "and");
}
/** How many cards `items` names (an authorized user's card and a co-brand are two). */
const uncertainCount = (items: UncertainCard[]) => new Set(items.map((u) => u.record.key)).size;

/** Why the cards in `items` may not count, as caveats. */
function uncertaintyCaveats(rule: ApplicationRule, items: UncertainCard[]): string[] {
  const out: string[] = [];
  if (items.some((u) => u.why === "authorized-user")) out.push("No outlet reports whether cards you're an authorized user on count toward this rule.");
  if (items.some((u) => u.why === "brand") && rule.logic.counts?.brand) {
    out.push(`This rule counts only ${rule.logic.counts.brand}, and the disclosure doesn't say whether co-branded cards count.`);
  }
  out.push(...items.map((u) => u.note).filter((n): n is string => Boolean(n)));
  return uniq(out);
}

function numericRule(rule: ApplicationRule, card: Card, ctx: HistoryContext): RuleResult {
  const L = rule.logic;
  const event = L.counts?.event ?? "opened";
  const effect = L.effect ?? "likely-denied";
  const status = statusOfEffect(effect, L.soft);
  const base = segmentsFor(rule, card);
  const issuer = shortIssuer(rule.issuer);
  const caveats: string[] = [];
  if (L.counts?.includeDenied) caveats.push("Declined applications count too, and the history only shows the cards you opened.");
  const withCaveats = <T extends object>(x: T) => (caveats.length ? { ...x, caveats: uniq(caveats) } : x);

  if (L.type === "max-open") {
    const count = L.count ?? 1;
    const open = ctx.history.filter((r) => r.open).map((r) => ({ r, k: countsToward(r, rule, base) })).filter((x) => x.k.ok);
    const sure = open.filter((x) => !x.k.uncertain).map((x) => x.r);
    const unsure: UncertainCard[] = open.filter((x) => x.k.uncertain).map((x) => ({ record: x.r, why: x.k.uncertain!, ...(x.k.note ? { note: x.k.note } : {}) }));
    const assumed = open.filter((x) => x.k.assumedCredit).map((x) => x.r.name);
    if (assumed.length) caveats.push(assumedCreditCaveat(assumed));
    const what = describeCounted(rule, base, sure.length);
    const cap = `${issuer} ${L.soft ? "tends to stop" : "stops"} at about ${count}`;
    if (sure.length >= count) {
      return withCaveats({ rule, status, effect, reason: `You have ${sure.length} open ${what}; ${cap}.`, action: "you close one of them" });
    }
    if (sure.length + unsure.length >= count) {
      caveats.push(...uncertaintyCaveats(rule, unsure));
      return withCaveats({
        rule,
        status: "warning",
        effect,
        reason: `You have ${howMany(sure.length)} open ${what}, plus ${uncertainList(unsure)}; if ${uncertainCount(unsure) === 1 ? "that counts" : "those count"}, you're at the limit: ${cap}.`,
        action: "you close one of them",
      });
    }
    if (!ctx.historyKnown) {
      return withCaveats({ rule, status: "unknown", reason: `You have ${howMany(sure.length)} open ${what} that we know of; ${cap}. Add your card history to be sure.`, missing: [NEEDS_HISTORY] });
    }
    return withCaveats({ rule, status: "eligible", reason: `You have ${howMany(sure.length)} open ${what}; ${cap}.` });
  }

  const windows = L.windows?.length ? L.windows : [{ count: L.count ?? 1, months: L.months, days: L.days }];
  const per = windows.map((w) => countWindow(rule, { ...w, calendar: L.calendarMonths }, w.segments ?? base, ctx));
  const verb = EVENT_VERB[event] ?? "opened";
  const assumed = uniq(per.flatMap((p) => p.assumed));
  if (assumed.length) caveats.push(assumedCreditCaveat(assumed));
  const youve = (p: WindowCount, n: number) => `You've ${verb} ${howMany(n)} ${describeCounted(rule, p.segments, n)} in the last ${windowText(p.w)}`;
  // A window's note matters once something is in that window (Citi's softer 8 days, BofA's 30-day reading).
  const notesFor = (ps: WindowCount[]) => ps.filter((p) => p.w.note && p.counted.length + p.maybe.length + p.uncertain.length > 0).map((p) => p.w.note!);

  const blocking = per.filter((p) => p.blocked);
  if (blocking.length) {
    const binding = blocking.reduce((a, b) => ((b.until ?? "") > (a.until ?? "") ? b : a));
    caveats.unshift(...notesFor([binding]));
    // Cards without an open date could be inside the window too, which would keep the block longer.
    const undated = uniq(blocking.flatMap((p) => p.undated));
    if (undated.length) {
      caveats.push(`We don't know when you opened ${nameList(undated.map((r) => yourPhrase(r.name)), "or")}: if it was recently, this lasts longer.`);
    }
    const unsure = blocking.flatMap((p) => p.uncertain);
    if (unsure.length) {
      caveats.push(`If ${uncertainList(unsure)} ${uncertainCount(unsure) === 1 ? "counts" : "count"} too, this may last longer.`, ...uncertaintyCaveats(rule, unsure));
    }
    return withCaveats({
      rule,
      status,
      effect,
      reason: `${youve(binding, binding.counted.length)}. ${limitSentence(rule, binding.w)}`,
      until: latest(blocking.map((p) => p.until ?? "")),
      counted: binding.counted,
      ...(undated.length ? { missing: undated.map((r) => `the open date for ${yourPhrase(r.name)}`), records: undated.map((r) => r.key) } : {}),
    });
  }

  const unsure = per.filter((p) => p.counted.length + p.maybe.length + p.undated.length >= p.w.count);
  if (unsure.length) {
    const p = unsure[0];
    const extra = p.maybe.length + p.undated.length;
    caveats.unshift(...notesFor(unsure));
    const missing = uniq([
      ...unsure.flatMap((u) => u.maybe.map((m) => `the day you opened ${yourPhrase(m.record.name)}`)),
      ...unsure.flatMap((u) => u.undated.map((r) => `the open date for ${yourPhrase(r.name)}`)),
    ]);
    const records = uniq(unsure.flatMap((u) => [...u.maybe.map((m) => m.record.key), ...u.undated.map((r) => r.key)]));
    return withCaveats({
      rule,
      status: "unknown",
      reason: `${youve(p, p.counted.length)}, plus ${plural(extra, "card")} that may count. ${limitSentence(rule, p.w)}`,
      missing,
      records,
      counted: p.counted,
    });
  }

  // Cards that count only if the rule covers them (authorized-user cards no outlet rules on, co-brands under a
  // "branded cards" rule) would reach the limit: a warning, since we can't tell.
  const scope = per.filter((p) => p.counted.length + p.maybe.length + p.undated.length + p.uncertain.length >= p.w.count);
  if (scope.length) {
    const ends = scope.map((p) => {
      const all = [...p.counted, ...p.maybe, ...p.uncertain].sort(byDropOff);
      return { p, until: all[all.length - p.w.count].dropOff };
    });
    const binding = ends.reduce((a, b) => (b.until > a.until ? b : a));
    const p = binding.p;
    caveats.unshift(...notesFor([p]));
    caveats.push(...uncertaintyCaveats(rule, p.uncertain));
    return withCaveats({
      rule,
      status: "warning",
      effect,
      reason: `${youve(p, p.counted.length)}, plus ${uncertainList(p.uncertain)}, which may count. ${limitSentence(rule, p.w)}`,
      until: binding.until,
      counted: p.counted,
    });
  }

  // One sentence per set of windows that count the same cards: "You've been approved for no personal Bank of
  // America cards in the last 2 months, 1 in the last 12 months and 1 in the last 24 months; the limits are 2, 3
  // and 4."
  const groups: WindowCount[][] = [];
  for (const p of per) {
    const last = groups[groups.length - 1];
    if (last && last[0].segments.join() === p.segments.join()) last.push(p);
    else groups.push([p]);
  }
  const tally = groups
    .map((g) => {
      if (g.length === 1) return `${youve(g[0], g[0].counted.length)}; ${limitShort(rule, g[0].w.count)}.`;
      const counts = g.map((p, i) => (i === 0 ? youve(p, p.counted.length) : `${p.counted.length} in the last ${windowText(p.w)}`));
      const limits = g.map((p) => String(p.w.count));
      return `${counts.slice(0, -1).join(", ")} and ${counts[counts.length - 1]}; the limits are ${limits.slice(0, -1).join(", ")} and ${limits[limits.length - 1]}.`;
    })
    .join(" ");
  caveats.unshift(...notesFor(per));
  const counted = per[per.length - 1].counted;
  if (!ctx.historyKnown) {
    return withCaveats({ rule, status: "unknown", reason: `${tally} That's what we know of: add your card history to be sure.`, missing: [NEEDS_HISTORY], counted });
  }
  return withCaveats({ rule, status: "eligible", reason: tally, counted });
}

const assumedCreditCaveat = (names: string[]) =>
  `We counted ${nameList(names.map(thePhrase), "and")} as ${names.length === 1 ? "a credit card" : "credit cards"}; charge cards don't count toward this limit.`;

// --- Condition rules (once-per-lifetime, family-bonus, cooldown) ------------------------------------------------

interface Hit {
  status: Verdict;
  effect: RuleEffect;
  certain: boolean;
  reason: string;
  until?: string;
  permanent?: boolean;
  action?: string;
  /** When several conditions ask for an action, the stricter one wins ("24 months after you close it" > "close it"). */
  actionRank?: number;
  missing?: string[];
  /** History entries `missing` is about. */
  records?: string[];
}

/**
 * A bonus left blank in the history is "not recorded". When the card opened long enough ago, any welcome bonus on it
 * posted too long ago to fall inside a bonus rule's window: we assume it posted within this many months of opening
 * (spend windows run up to six months, and the bonus posts after that) and say so in a caveat. The research gives
 * no figure, so it's generous. Conditions that also cover upgrade offers never take the shortcut.
 */
export const BONUS_POSTS_WITHIN_MONTHS = 12;

const UNTRACKED: RuleEvent[] = ["declined", "converted-after-bonus", "product-change"];

function resolveProducts(c: RuleCondition, rule: ApplicationRule, card: Card): string[] {
  return (c.products ?? []).flatMap((p) => (p === "$self" ? [card.id] : p === "blockersByTarget" ? (rule.logic.blockersByTarget?.[card.id] ?? []) : [p]));
}

/** "this card", "this card or the Platinum Card from American Express", "the Marriott Bonvoy Boundless (Chase)". */
function whoOf(ids: string[], labels: string[], card: Card): string {
  const names = [...ids.map((id) => (id === card.id ? "this card" : thePhrase(cardName(id)))), ...labels.map(labelPhrase)];
  return nameList(names);
}

/** A rule that only "may" apply to a card warns instead of blocking. */
const downgrade = (v: Verdict): Verdict => (v === "blocked" ? "warning" : v);

function evaluateCondition(c: RuleCondition, rule: ApplicationRule, card: Card, ctx: HistoryContext) {
  const ids = resolveProducts(c, rule, card);
  const labels = c.otherProducts ?? [];
  const named = labels.filter((l) => OTHER_PRODUCT_MATCHERS[l]);
  const descriptive = labels.filter((l) => !OTHER_PRODUCT_MATCHERS[l]);
  const matchOf = (r: HistoryRecord): OtherProductMatch => {
    if (r.cardId) return { match: ids.includes(r.cardId) };
    const ms = named.map((l) => matchOtherProduct(l, r, sameIssuer)).filter((m) => m.match);
    return ms.find((m) => !m.uncertain) ?? ms[0] ?? { match: false };
  };
  const matched = ctx.history.map((r) => ({ r, m: matchOf(r) })).filter((x) => x.m.match);
  // Cards on someone else's account aren't the user's own: product and bonus rules don't count them.
  const authorized = matched.filter((x) => x.r.authorizedUser).map((x) => x.r);
  const members = matched.filter((x) => !x.r.authorizedUser).map((x) => x.r);
  const uncertainOf = new Map(matched.filter((x) => x.m.uncertain).map((x) => [x.r, x.m.uncertain!]));
  const who = whoOf(ids, named, card);
  const status = statusOfEffect(c.effect, rule.logic.soft);
  const win = windowOf(c);
  const hits: Hit[] = [];
  const hit = (r: HistoryRecord, h: Omit<Hit, "status" | "effect">) => {
    const unsure = uncertainOf.get(r);
    hits.push({
      status: unsure ? downgrade(status) : status,
      effect: c.effect,
      ...h,
      ...(h.missing?.length ? { records: [r.key] } : {}),
      ...(unsure ? { reason: `${h.reason} ${unsure}` } : {}),
    });
  };
  const caveats: string[] = [];
  const its = (r: HistoryRecord) => (r.cardId === card.id ? "it" : thePhrase(r.name));
  let clause = "";
  let passed = "";
  let needsHistory = true;

  switch (c.event) {
    case "currently-holds": {
      needsHistory = false;
      const open = members.filter((r) => r.open);
      const sure = open.filter((r) => !uncertainOf.has(r));
      const action = `you no longer have ${open.length === 1 ? its(open[0]) : "them"}`;
      if (sure.length) hits.push({ status, effect: c.effect, certain: true, reason: `You have ${nameList(sure.map((r) => thePhrase(r.name)), "and")}.`, action, actionRank: 1 });
      for (const r of open.filter((x) => uncertainOf.has(x))) hit(r, { certain: true, reason: `You have ${thePhrase(r.name)}.`, action, actionRank: 1 });
      clause = `you don't have ${who}`;
      break;
    }
    case "ever-held": {
      for (const r of members) {
        if (!win) {
          hit(r, {
            certain: true,
            permanent: true,
            reason: r.open ? `You have ${thePhrase(r.name)}.` : `You had ${thePhrase(r.name)}${r.opened ? ` (opened ${formatDateOrMonth(r.opened)})` : ""}.`,
          });
        } else if (r.open) {
          hit(r, { certain: true, reason: `You have ${thePhrase(r.name)}.`, action: `${windowText(win)} have passed since you closed ${its(r)}`, actionRank: 2 });
        } else {
          const pos = position(r.closed, win, ctx.today);
          if (pos === null || pos === "undated") continue;
          if (pos.state === "in") hit(r, { certain: true, reason: `You closed ${thePhrase(r.name)} ${when(r.closed!)}, within ${windowText(win)}.`, until: pos.end });
          else hit(r, { certain: false, reason: `You closed ${thePhrase(r.name)} ${when(r.closed!)}.`, until: pos.end, missing: [`the day you closed ${yourPhrase(r.name)}`] });
        }
      }
      clause = win ? `you haven't held ${who} in the last ${windowText(win)}` : `you've never had ${who}`;
      break;
    }
    case "opened":
    case "approved":
    case "applied": {
      for (const r of members) {
        if (!win) {
          hit(r, { certain: true, permanent: true, reason: `You opened ${thePhrase(r.name)}${r.opened ? ` ${when(r.opened)}` : ""}.` });
          continue;
        }
        const pos = position(r.opened, win, ctx.today);
        if (pos === null) continue;
        if (pos === "undated") hit(r, { certain: false, reason: `We don't know when you opened ${yourPhrase(r.name)}.`, missing: [`the open date for ${yourPhrase(r.name)}`] });
        else if (pos.state === "in") hit(r, { certain: true, reason: `You opened ${thePhrase(r.name)} ${when(r.opened!)}, within ${windowText(win)}.`, until: pos.end });
        else hit(r, { certain: false, reason: `You opened ${thePhrase(r.name)} ${when(r.opened!)}.`, until: pos.end, missing: [`the day you opened ${yourPhrase(r.name)}`] });
      }
      clause = win ? `you haven't opened ${who} in the last ${windowText(win)}` : `you've never opened ${who}`;
      break;
    }
    case "bonus-received": {
      const upgrades = Boolean(c.includesUpgradeBonuses);
      const bonusWord = upgrades ? "a bonus or upgrade offer" : "the bonus";
      const assumedOld: HistoryRecord[] = [];
      for (const r of members) {
        if (typeof r.bonusEarned === "string") {
          if (!win) {
            hit(r, { certain: true, permanent: true, reason: `You earned a bonus on ${thePhrase(r.name)} in ${formatMonth(r.bonusEarned)}.` });
            continue;
          }
          const pos = position(r.bonusEarned, win, ctx.today);
          if (pos === null || pos === "undated") continue;
          hit(r, {
            certain: pos.state === "in",
            reason: `You earned a bonus on ${thePhrase(r.name)} in ${formatMonth(r.bonusEarned)}${pos.state === "in" ? `, within ${windowText(win)}` : ""}.`,
            until: pos.end,
            ...(pos.state === "maybe" ? { missing: [`when you earned the bonus on ${yourPhrase(r.name)}`] } : {}),
          });
        } else if (r.bonusEarned === null) {
          // Not recorded. If the card opened long enough ago, a welcome bonus on it is too old to matter (see
          // BONUS_POSTS_WITHIN_MONTHS); an upgrade offer can come at any time, so those are always asked about.
          if (!upgrades && win && r.opened && windowEnd(addMonths(daySpan(r.opened, ctx.today).last, BONUS_POSTS_WITHIN_MONTHS), win) <= ctx.today) {
            assumedOld.push(r);
            continue;
          }
          const ask = win ? "whether and when" : "whether";
          hit(r, {
            certain: false,
            reason: `We don't know ${win ? "whether or when" : "whether"} you earned ${bonusWord} on ${yourPhrase(r.name)}.`,
            missing: [`${ask} you earned ${bonusWord} on ${yourPhrase(r.name)}${r.source === "wallet" ? " (add the card to your history)" : ""}`],
          });
        }
      }
      if (assumedOld.length) {
        const names = nameList(assumedOld.map((r) => yourPhrase(r.name)), "or");
        caveats.push(
          `Your history has no bonus month for ${names}: we took any bonus to have posted within ${BONUS_POSTS_WITHIN_MONTHS} months of opening, too long ago to count. If it posted later, add the month.`,
        );
      }
      // The history's bonus answer is about the welcome bonus, and this condition also counts upgrade offers: say so
      // for cards whose answer ("no bonus", or a month outside the window) clears them.
      const cleared = members.filter(
        (r) => r.bonusEarned === undefined || (typeof r.bonusEarned === "string" && win !== undefined && position(r.bonusEarned, win, ctx.today) === null),
      );
      if (upgrades && cleared.length) {
        caveats.push(
          `This also counts upgrade offers, and the history records only welcome bonuses: if you got an upgrade offer on ${nameList(cleared.map((r) => yourPhrase(r.name)), "or")}${win ? ` in the last ${windowText(win)}` : ""}, it applies.`,
        );
      }
      clause = win ? `you haven't earned a bonus on ${who} in the last ${windowText(win)}` : `you've never earned a bonus on ${who}`;
      // What the history shows, not a fact about the user: a bonus left blank is "not recorded" and asked about.
      passed = win ? `your history shows no bonus on ${who} in the last ${windowText(win)}` : `your history shows no bonus on ${who}`;
      break;
    }
    default:
      needsHistory = false;
  }
  const authorizedCaveat = authorized.length
    ? `Not counted: ${nameList(authorized.map((r) => thePhrase(r.name)), "and")}, which you're an authorized user on (not your own account).`
    : undefined;
  return {
    hits,
    clause,
    passed: passed || clause,
    who,
    event: c.event,
    lifetime: !win,
    needsHistory,
    status,
    descriptive: UNTRACKED.includes(c.event) ? [] : descriptive,
    authorizedCaveat,
    caveats,
  };
}

function untrackedCaveat(c: RuleCondition, rule: ApplicationRule): string {
  const win = windowOf(c);
  const span = win ? ` in the last ${windowText(win)}` : "";
  if (c.event === "converted-after-bonus") {
    return `The history doesn't show product changes: this also applies if you converted another ${rule.issuer} card that earned a new-account bonus${span} into this one.`;
  }
  if (c.event === "declined") return `The history doesn't show declined applications: if ${rule.issuer} declined you${span}, this applies.`;
  return `The history doesn't show product changes${span}.`;
}

function conditionRule(rule: ApplicationRule, card: Card, ctx: HistoryContext): RuleResult {
  const conditions = rule.logic.conditions ?? [];
  const evaluated = conditions.filter((c) => !UNTRACKED.includes(c.event)).map((c) => evaluateCondition(c, rule, card, ctx));
  const untracked = conditions.filter((c) => UNTRACKED.includes(c.event));
  const caveats = uniq([
    ...untracked.map((c) => untrackedCaveat(c, rule)),
    ...evaluated.flatMap((e) => e.descriptive).map((l) => `Also counts: ${l}.`),
    ...evaluated.map((e) => e.authorizedCaveat).filter((x): x is string => Boolean(x)),
    ...evaluated.flatMap((e) => e.caveats),
  ]);
  const withCaveats = <T extends object>(x: T) => (caveats.length ? { ...x, caveats } : x);

  // Nothing we can check: a rule about declines or product changes.
  if (!evaluated.length) {
    return { rule, status: "notice", reason: untracked.length ? untrackedNotice(rule, untracked[0]) : rule.summary };
  }

  const hits = evaluated.flatMap((e) => e.hits);
  const certain = hits.filter((h) => h.certain);
  const top = worst(certain.map((h) => h.status));
  const risky = hits.filter((h) => !h.certain && RANK[h.status] > RANK[top]);
  const historyWorst = worst(evaluated.filter((e) => e.needsHistory).map((e) => e.status));
  const historyGap = !ctx.historyKnown && RANK[historyWorst] > RANK[top];
  // Leave out clauses another one implies: having had a card at all covers having it now or earning its bonus.
  const hadEver = new Set(evaluated.filter((e) => e.event === "ever-held").map((e) => e.who));
  const hadAtAll = new Set(evaluated.filter((e) => e.event === "ever-held" && e.lifetime).map((e) => e.who));
  const shown = evaluated.filter((e) => !(e.event === "currently-holds" && hadEver.has(e.who)) && !(e.event === "bonus-received" && hadAtAll.has(e.who)));
  const onlyIf = nameList(shown.map((e) => e.clause).filter(Boolean), "and");

  if (risky.length || historyGap) {
    const known = certain.filter((h) => h.status === top).map((h) => h.reason);
    const missing = uniq([...risky.flatMap((h) => h.missing ?? []), ...(historyGap ? [NEEDS_HISTORY] : [])]);
    const records = uniq(risky.flatMap((h) => h.records ?? []));
    const reason = risky.length ? [...known, ...risky.map((h) => h.reason)].join(" ") : [...known, `Only if ${onlyIf}.`].join(" ");
    return withCaveats({ rule, status: "unknown", reason, missing, ...(records.length ? { records } : {}) });
  }
  if (top === "eligible") return withCaveats({ rule, status: "eligible", reason: `${ucFirst(nameList(shown.map((e) => e.passed).filter(Boolean), "and"))}.` });

  const final = certain.filter((h) => h.status === top);
  const permanent = final.some((h) => h.permanent);
  const dated = final.filter((h) => h.until).map((h) => h.until!);
  const action = final.filter((h) => h.action).sort((a, b) => (b.actionRank ?? 0) - (a.actionRank ?? 0))[0]?.action;
  // Something we can't date could make it last longer (a Chase Marriott bonus that may have posted, say).
  const until = dated.length ? latest(dated) : undefined;
  const longer = permanent ? [] : hits.filter((h) => !h.certain && h.status === top && (!h.until || !until || h.until > until));
  if (longer.length) caveats.push(...longer.map((h) => `It could last longer: ${lcFirst(h.reason)}`));
  const missing = uniq(longer.flatMap((h) => h.missing ?? []));
  const records = uniq(longer.flatMap((h) => h.records ?? []));
  return withCaveats({
    rule,
    status: top,
    effect: final[0].effect,
    reason: uniq(final.map((h) => h.reason)).join(" "),
    ...(permanent ? { permanent: true } : { ...(until ? { until } : {}), ...(action ? { action } : {}) }),
    ...(missing.length ? { missing } : {}),
    ...(records.length ? { records } : {}),
  });
}

function untrackedNotice(rule: ApplicationRule, c: RuleCondition): string {
  const win = windowOf(c);
  if (c.event === "declined" && win) {
    return `If ${rule.issuer} declined an application from you in the last ${windowText(win)}, wait until ${windowText(win)} have passed before applying again. The history doesn't show declined applications.`;
  }
  return rule.summary;
}

// --- Rules and cards --------------------------------------------------------------------------------------------

function evaluateLogic(rule: ApplicationRule, card: Card, ctx: HistoryContext): RuleResult {
  const L = rule.logic;
  switch (L.type) {
    case "notice":
      return { rule, status: "notice", reason: rule.summary };
    case "max-new-cards":
    case "velocity":
    case "max-open": {
      const event = L.counts?.event;
      if (event && UNTRACKED.includes(event)) {
        const w = L.windows?.[0] ?? { count: L.count ?? 1, months: L.months, days: L.days };
        return {
          rule,
          status: "notice",
          reason: `At most ${w.count} ${event === "product-change" ? (w.count === 1 ? "upgrade or downgrade" : "upgrades or downgrades") : "application"} in any ${windowText(w)}. The history doesn't show product changes, so check the date of your last one.`,
        };
      }
      return numericRule(rule, card, ctx);
    }
    case "once-per-lifetime":
    case "family-bonus":
    case "cooldown":
      return conditionRule(rule, card, ctx);
    default:
      return { rule, status: "unknown", reason: "We can't check this rule yet." };
  }
}

/** One rule for one card, or null when the user's answers say it doesn't apply to them. */
export function evaluateRule(rule: ApplicationRule, card: Card, ctx: HistoryContext): RuleResult | null {
  const applies = rule.logic.appliesWhen;
  const answer = applies ? ctx.facts[applies.userFact] : undefined;
  if (applies && answer !== undefined && answer !== applies.equals) return null;
  const r = evaluateLogic(rule, card, ctx);
  if (!applies) return r;
  const fact = USER_FACTS[applies.userFact];
  const condition = applies.equals ? fact.yes : fact.no;
  if (answer !== undefined) return { ...r, reason: `${r.reason} (Applies because ${condition}.)` };
  // Unanswered: if the rule passes anyway, the answer doesn't matter; otherwise ask.
  if (r.status === "eligible" || r.status === "notice") return { ...r, reason: `${r.reason} (Applies only if ${condition}.)` };
  // Without the card history the rule stays unknown whatever the answer, so the card doesn't ask (the next-card
  // page's "About you" still does, for later).
  if (r.missing?.includes(NEEDS_HISTORY)) return { ...r, status: "unknown", reason: `If ${condition}: ${lcFirst(r.reason)}` };
  return { ...r, status: "unknown", question: applies.userFact, reason: `If ${condition}: ${lcFirst(r.reason)}` };
}

export function evaluateCard(card: Card, ctx: HistoryContext, rules: ApplicationRule[] = applicationRules.rules): CardEligibility {
  const results = rules
    .filter((r) => r.appliesTo.includes(card.id))
    .map((r) => evaluateRule(r, card, ctx))
    .filter((r): r is RuleResult => r !== null)
    .sort((a, b) => RESULT_ORDER[a.status] - RESULT_ORDER[b.status]);
  const verdicts = results.filter((r): r is RuleResult & { status: Verdict } => r.status !== "notice");
  const approval = worst(verdicts.filter((r) => r.rule.kind === "approval").map((r) => r.status));
  const bonus = worst(verdicts.filter((r) => r.rule.kind === "bonus").map((r) => r.status));
  const blocking = verdicts.filter((r) => r.status === "blocked");
  const open = blocking.some((r) => !r.until || r.action || r.permanent);
  return {
    card,
    status: worst([approval, bonus]),
    approval,
    bonus,
    held: ctx.history.some((r) => r.open && r.cardId === card.id && !r.authorizedUser),
    closedToApplicants: isClosedToApplicants(card),
    results,
    blocking,
    warnings: verdicts.filter((r) => r.status === "warning"),
    questions: uniq(results.map((r) => r.question).filter((q): q is UserFact => Boolean(q))),
    ...(blocking.length && !open ? { until: latest(blocking.map((r) => r.until!)) } : {}),
    permanent: blocking.some((r) => r.permanent),
    historyKnown: ctx.historyKnown,
  };
}

export function evaluateCards(cards: Card[], wallet: WalletState, today: Date, rules?: ApplicationRule[], facts?: UserFacts): CardEligibility[] {
  const ctx = historyContext(wallet, today, facts);
  return cards.map((c) => evaluateCard(c, ctx, rules));
}

// --- Chase 5/24 -------------------------------------------------------------------------------------------------

export interface NewCardCount {
  rule?: ApplicationRule;
  limit: number;
  months: number;
  /** Cards that count now, soonest drop-off first. */
  counted: CountedCard[];
  /** Cards in the wallet without an open date (they might count). */
  undated: HistoryRecord[];
  count: number;
  historyKnown: boolean;
  /** "at-limit": the rule blocks now. "unknown": undated cards or a missing history could change the answer. */
  status: "under" | "at-limit" | "unknown";
  /** When the count goes back under the limit, if it's at or over now. */
  underOn?: string;
}

const FALLBACK_524: ApplicationRule = {
  id: "chase-5-24",
  issuer: "Chase",
  name: "5/24 rule",
  summary: "",
  kind: "approval",
  logic: { type: "max-new-cards", count: 5, months: 24, scope: "", calendarMonths: true, counts: { issuers: "any", segments: ["personal"], event: "opened" } },
  appliesTo: [],
  certainty: "widely reported",
  asOf: "",
  lastVerified: "",
  sources: [],
};

/** The Chase 5/24 counter: personal cards from any bank opened in the window, with the day each drops off. */
export function chase524(ctx: HistoryContext, rules: ApplicationRule[] = applicationRules.rules): NewCardCount {
  const rule = rules.find((r) => r.logic.type === "max-new-cards" && sameIssuer(r.issuer, "Chase"));
  const r = rule ?? FALLBACK_524;
  const limit = r.logic.count ?? 5;
  const months = r.logic.months ?? 24;
  const segments = r.logic.counts?.segments;
  const p = countWindow(r, { count: limit, months, calendar: r.logic.calendarMonths }, Array.isArray(segments) ? segments : ["personal"], ctx);
  const undated = [...p.undated, ...p.maybe.map((m) => m.record), ...p.uncertain.map((u) => u.record)];
  const count = p.counted.length;
  const status = count >= limit ? "at-limit" : count + undated.length >= limit || !ctx.historyKnown ? "unknown" : "under";
  return {
    ...(rule ? { rule } : {}),
    limit,
    months,
    counted: p.counted,
    undated,
    count,
    historyKnown: ctx.historyKnown,
    status,
    ...(count >= limit ? { underOn: p.counted[count - limit].dropOff } : {}),
  };
}
