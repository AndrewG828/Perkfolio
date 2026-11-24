import { getCard } from "@/shared/data/cards";
import { expirationPolicies } from "@/shared/data/strategy/expiration";
import { programForCard, programForName } from "@/shared/data/strategy/programs";
import type { ExpirationPolicy } from "@/shared/data/strategy/types";
import type { Certificate, PointsBalance, Redemption, WalletState } from "./wallet";
import { accountHistory } from "./eligibility";
import { addMonths, daysSince, daysUntil } from "./dates";
import { resolvePointValue, type ValueContext } from "./point-value";

/**
 * Math for the points, certificate and redemption trackers. Pure: dates come in as `today`.
 */

/** Red under 30 days, amber under 90, "expired" once the date has passed. */
export type ExpiryTone = "expired" | "red" | "amber" | "ok";
export const EXPIRY_RED_DAYS = 30;
export const EXPIRY_AMBER_DAYS = 90;
/** A balance not checked for this many days gets a nudge. */
export const STALE_BALANCE_DAYS = 60;

export function expiryTone(daysLeft: number): ExpiryTone {
  if (daysLeft < 0) return "expired";
  if (daysLeft < EXPIRY_RED_DAYS) return "red";
  if (daysLeft < EXPIRY_AMBER_DAYS) return "amber";
  return "ok";
}

// --- Values ------------------------------------------------------------------------------------------------------

export const pointsValueUsd = (points: number, cents: number) => (points * cents) / 100;

export interface PortfolioValue {
  totalUsd: number;
  /** Programs with a balance and a value. */
  valued: number;
  /** Program ids with a balance but no value (not in the total). */
  unvalued: string[];
}

/** Balances at what their points are worth (resolvePointValue: the user's own value, else the published median). */
export function portfolioValue(balances: Record<string, PointsBalance>, values: ValueContext = {}): PortfolioValue {
  let totalUsd = 0;
  let valued = 0;
  const unvalued: string[] = [];
  for (const [id, b] of Object.entries(balances)) {
    const cents = resolvePointValue(id, values)?.cents;
    if (cents === undefined) unvalued.push(id);
    else {
      totalUsd += pointsValueUsd(b.points, cents);
      valued++;
    }
  }
  return { totalUsd, valued, unvalued };
}

// --- Points expiration ------------------------------------------------------------------------------------------

const policyById = new Map(expirationPolicies.programs.map((p) => [p.id, p]));
export const expirationPolicy = (id: string): ExpirationPolicy | undefined => policyById.get(id);
/** Why a program has no confirmed policy. */
export const missingPolicy = (id: string): string | undefined => expirationPolicies.missing.find((m) => m.id === id)?.reason;

/**
 * The programs the user's own cards earn: open ones, and for each program none of them earns any more, the latest
 * day the user closed one that did. "Own" means wallet cards and card-history entries, never cards they're an
 * authorized user on (someone else's account). Cards we don't list count when their name says the program
 * ("AAdvantage Aviator Red"). Bank currencies last while such a card is open, and co-brand cards stop some
 * programs' points expiring (`cardExemption`).
 */
export interface OwnCards {
  open: Set<string>;
  /** Program → the latest closing date (YYYY-MM or YYYY-MM-DD) of an own card that earned it, when none is open. */
  closed: Map<string, string>;
}

export function ownCardPrograms(wallet: WalletState): OwnCards {
  const open = new Set<string>();
  const closed = new Map<string, string>();
  for (const r of accountHistory(wallet)) {
    if (r.authorizedUser) continue;
    const card = r.cardId ? getCard(r.cardId) : undefined;
    const program = card ? programForCard(card) : programForName(r.name);
    if (!program) continue;
    if (r.open) open.add(program);
    else if (r.closed && r.closed > (closed.get(program) ?? "")) closed.set(program, r.closed);
  }
  for (const id of open) closed.delete(id);
  return { open, closed };
}

export interface BalanceStatus {
  policy?: ExpirationPolicy;
  /**
   * - never: doesn't expire;
   * - date: expires on `expires` (inactivity rule with a last-activity date);
   * - needs-activity: expires after inactivity, but we don't know the last activity;
   * - fixed-term: each batch expires on its own schedule (we can't date it);
   * - while-open: safe while a card that earns them is open (one is in the wallet);
   * - at-risk: kept only while a card that earns them is open, and none is in the wallet;
   * - card-exempt: an inactivity program that doesn't expire points while the member holds its co-brand card
   *   (World of Hyatt, AAdvantage), and the user has one of their own open;
   * - no-data: no policy on file.
   */
  kind: "never" | "date" | "needs-activity" | "fixed-term" | "while-open" | "at-risk" | "card-exempt" | "no-data";
  expires?: string;
  /** The date moved to the day a paused expiry resumes (the last activity is older than the window). */
  resumes?: boolean;
  /** The date is the grace period after the user closed their co-brand card (later than the inactivity date). */
  afterClosing?: boolean;
  daysLeft?: number;
  tone?: ExpiryTone;
  daysSinceUpdate: number;
  /** Not checked for STALE_BALANCE_DAYS days or more. */
  stale: boolean;
}

export function balanceStatus(
  id: string,
  balance: PointsBalance,
  today: Date,
  opts: {
    /** The user has an open card of their own that earns the program (see ownCardPrograms). */
    earningCard: boolean;
    /** When they closed their last own card that earned it (YYYY-MM or YYYY-MM-DD), if none is open. */
    closedCardOn?: string;
    policy?: ExpirationPolicy;
  },
): BalanceStatus {
  const policy = opts.policy ?? expirationPolicy(id);
  const daysSinceUpdate = daysSince(balance.updated, today);
  const base = { policy, daysSinceUpdate, stale: daysSinceUpdate >= STALE_BALANCE_DAYS };
  if (!policy) return { ...base, kind: "no-data" };
  switch (policy.rule) {
    case "never":
      return { ...base, kind: "never" };
    case "fixed-term":
      return { ...base, kind: "fixed-term" };
    case "while-account-open":
      return { ...base, kind: opts.earningCard ? "while-open" : "at-risk", ...(opts.earningCard ? {} : { tone: "amber" as const }) };
    case "inactivity": {
      // Holding the program's co-brand card stops the clock (the policy names the card; a wallet card earning the
      // program is one).
      if (policy.cardExemption && opts.earningCard) return { ...base, kind: "card-exempt" };
      if (!balance.lastActivity || !policy.months) return { ...base, kind: "needs-activity" };
      const due = addMonths(balance.lastActivity, policy.months);
      // After the co-brand card closes, the points last at least `afterClosingMonths` from the closing date (a
      // month-only date counts from its 1st, the earliest it could be).
      const grace = policy.cardExemption?.afterClosingMonths;
      const closedOn = opts.closedCardOn ? (opts.closedCardOn.length >= 10 ? opts.closedCardOn : `${opts.closedCardOn}-01`) : undefined;
      const afterClosing = grace && closedOn ? addMonths(closedOn, grace) : undefined;
      if (afterClosing && afterClosing > due) {
        const daysLeft = daysUntil(afterClosing, today);
        return { ...base, kind: "date", expires: afterClosing, daysLeft, tone: expiryTone(daysLeft), afterClosing: true };
      }
      // Expiry was paused (Aeroplan): a deadline that fell during the pause moves to the day it resumes.
      const expires = policy.expiryResumes && due < policy.expiryResumes ? policy.expiryResumes : due;
      const daysLeft = daysUntil(expires, today);
      return { ...base, kind: "date", expires, daysLeft, tone: expiryTone(daysLeft), ...(expires !== due ? { resumes: true } : {}) };
    }
    default:
      return { ...base, kind: "no-data" };
  }
}

// --- Certificates -----------------------------------------------------------------------------------------------

export interface CertificateStatus {
  /** Days until it expires; undefined when it has no expiry date. */
  daysLeft?: number;
  tone?: ExpiryTone;
}

export function certificateStatus(c: Certificate, today: Date): CertificateStatus {
  if (!c.expires) return {};
  const daysLeft = daysUntil(c.expires, today);
  return { daysLeft, tone: expiryTone(daysLeft) };
}

/** Unused first, soonest expiry first, undated after dated; used ones last (most recent expiry first). */
export function sortCertificates(list: Certificate[]): Certificate[] {
  const exp = (c: Certificate) => c.expires ?? "9999-12-31";
  return [...list].sort((a, b) => {
    if (Boolean(a.used) !== Boolean(b.used)) return a.used ? 1 : -1;
    if (a.used) return exp(b).localeCompare(exp(a)) || a.label.localeCompare(b.label);
    return exp(a).localeCompare(exp(b)) || a.label.localeCompare(b.label);
  });
}

export interface CertificateTotals {
  /** Unused and not expired. */
  openCount: number;
  openValue: number;
  /** Unused and expiring within EXPIRY_AMBER_DAYS. */
  soonCount: number;
  soonValue: number;
  usedCount: number;
  usedValue: number;
  expiredCount: number;
}

export function certificateTotals(list: Certificate[], today: Date): CertificateTotals {
  const t: CertificateTotals = { openCount: 0, openValue: 0, soonCount: 0, soonValue: 0, usedCount: 0, usedValue: 0, expiredCount: 0 };
  for (const c of list) {
    const value = c.valueUsd ?? 0;
    if (c.used) {
      t.usedCount++;
      t.usedValue += value;
      continue;
    }
    const { daysLeft, tone } = certificateStatus(c, today);
    if (tone === "expired") {
      t.expiredCount++;
      continue;
    }
    t.openCount++;
    t.openValue += value;
    if (daysLeft !== undefined && daysLeft < EXPIRY_AMBER_DAYS) {
      t.soonCount++;
      t.soonValue += value;
    }
  }
  return t;
}

// --- Redemptions ------------------------------------------------------------------------------------------------

type Award = Pick<Redemption, "points" | "taxesUsd" | "cashPriceUsd">;

/** Cents per point: (cash price - taxes) / points x 100. Null without points. */
export function centsPerPoint(r: Award): number | null {
  if (!(r.points > 0)) return null;
  return ((r.cashPriceUsd - r.taxesUsd) / r.points) * 100;
}

/** Cash a redemption kept in the user's pocket: the cash price minus the taxes paid. */
export const cashSaved = (r: Award) => r.cashPriceUsd - r.taxesUsd;

export interface RedemptionStats {
  count: number;
  points: number;
  /** Sum of cash price - taxes. */
  savings: number;
  /** Points-weighted average cents per point, across every redemption. */
  averageCpp: number | null;
  /**
   * The redemptions whose program has a valuation (published or the user's own), compared like with like: what
   * they got per point against what those points are worth. The others (no program, or no published value) are
   * left out, and `count - valued.count` says how many.
   */
  valued: {
    count: number;
    points: number;
    /** Their own points-weighted cents per point. */
    cpp: number | null;
    /** Points-weighted valuation across them. */
    valuationCpp: number | null;
    /** Dollars above (or below, if negative) what those points are worth at their valuations. */
    vsValuationUsd: number;
  };
}

export function redemptionStats(list: Redemption[], centsOf: (program?: string) => number | undefined): RedemptionStats {
  let points = 0;
  let savings = 0;
  const valued = { count: 0, points: 0, savings: 0, cents: 0, vs: 0 };
  for (const r of list) {
    points += r.points;
    savings += cashSaved(r);
    const cents = centsOf(r.program);
    if (cents !== undefined && r.points > 0) {
      valued.count++;
      valued.points += r.points;
      valued.savings += cashSaved(r);
      valued.cents += r.points * cents;
      valued.vs += cashSaved(r) - pointsValueUsd(r.points, cents);
    }
  }
  return {
    count: list.length,
    points,
    savings,
    averageCpp: points > 0 ? (savings / points) * 100 : null,
    valued: {
      count: valued.count,
      points: valued.points,
      cpp: valued.points > 0 ? (valued.savings / valued.points) * 100 : null,
      valuationCpp: valued.points > 0 ? valued.cents / valued.points : null,
      vsValuationUsd: valued.vs,
    },
  };
}

export interface PointsVsCash {
  cpp: number | null;
  valuationCents?: number;
  /** "points" when the redemption beats the valuation by more than 5%, "cash" when it falls 5% short. */
  verdict?: "points" | "cash" | "even";
  /** What the points would be worth at the valuation. */
  pointsWorthUsd?: number;
  /** Cash kept by using points: the cash price minus taxes. */
  cashSavedUsd: number;
  /** cashSavedUsd minus what the points are worth: positive means points are the better deal by that much. */
  advantageUsd?: number;
}

export function pointsVsCash(input: Award & { valuationCents?: number }): PointsVsCash {
  const cpp = centsPerPoint(input);
  const cashSavedUsd = cashSaved(input);
  const v = input.valuationCents;
  if (cpp === null || v === undefined || !(v > 0)) return { cpp, cashSavedUsd, ...(v ? { valuationCents: v } : {}) };
  const pointsWorthUsd = pointsValueUsd(input.points, v);
  const ratio = cpp / v;
  return {
    cpp,
    valuationCents: v,
    verdict: ratio > 1.05 ? "points" : ratio < 0.95 ? "cash" : "even",
    pointsWorthUsd,
    cashSavedUsd,
    advantageUsd: cashSavedUsd - pointsWorthUsd,
  };
}
