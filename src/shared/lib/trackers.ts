import { expirationPolicies } from "@/shared/data/strategy/expiration";
import { valuations } from "@/shared/data/strategy/valuations";
import type { ExpirationPolicy, Valuation } from "@/shared/data/strategy/types";
import type { Certificate, PointsBalance, Redemption } from "./wallet";
import { addMonths, daysSince, daysUntil } from "./dates";

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

// --- Valuations -------------------------------------------------------------------------------------------------

const valuationById = new Map(valuations.valuations.map((v) => [v.id, v]));
export const valuationOf = (id: string): Valuation | undefined => valuationById.get(id);

/** Cents per point for a program: the user's own figure if they set one, else the median valuation. */
export function centsFor(id: string | undefined, overrides: Record<string, number> = {}): number | undefined {
  if (!id) return undefined;
  const own = overrides[id];
  if (typeof own === "number" && Number.isFinite(own) && own > 0) return own;
  return valuationById.get(id)?.median;
}

export const pointsValueUsd = (points: number, cents: number) => (points * cents) / 100;

export interface PortfolioValue {
  totalUsd: number;
  /** Programs with a balance and a valuation. */
  valued: number;
  /** Program ids with a balance but no valuation (not in the total). */
  unvalued: string[];
}

export function portfolioValue(balances: Record<string, PointsBalance>, overrides: Record<string, number> = {}): PortfolioValue {
  let totalUsd = 0;
  let valued = 0;
  const unvalued: string[] = [];
  for (const [id, b] of Object.entries(balances)) {
    const cents = centsFor(id, overrides);
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

export interface BalanceStatus {
  policy?: ExpirationPolicy;
  /**
   * - never: doesn't expire;
   * - date: expires on `expires` (inactivity rule with a last-activity date);
   * - needs-activity: expires after inactivity, but we don't know the last activity;
   * - fixed-term: each batch expires on its own schedule (we can't date it);
   * - while-open: safe while a card that earns them is open (one is in the wallet);
   * - at-risk: kept only while a card that earns them is open, and none is in the wallet;
   * - no-data: no policy on file.
   */
  kind: "never" | "date" | "needs-activity" | "fixed-term" | "while-open" | "at-risk" | "no-data";
  expires?: string;
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
  opts: { earningCard: boolean; policy?: ExpirationPolicy },
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
      if (!balance.lastActivity || !policy.months) return { ...base, kind: "needs-activity" };
      const expires = addMonths(balance.lastActivity, policy.months);
      const daysLeft = daysUntil(expires, today);
      return { ...base, kind: "date", expires, daysLeft, tone: expiryTone(daysLeft) };
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
  /** Points-weighted average cents per point. */
  averageCpp: number | null;
  /** Points-weighted valuation across the redemptions that have one. */
  valuationCpp: number | null;
  /** Dollars above (or below, if negative) what those points are worth at their valuations. */
  vsValuationUsd: number;
}

export function redemptionStats(list: Redemption[], centsOf: (program?: string) => number | undefined): RedemptionStats {
  let points = 0;
  let savings = 0;
  let valuedPoints = 0;
  let valuedCents = 0;
  let vsValuationUsd = 0;
  for (const r of list) {
    points += r.points;
    savings += cashSaved(r);
    const cents = centsOf(r.program);
    if (cents !== undefined && r.points > 0) {
      valuedPoints += r.points;
      valuedCents += r.points * cents;
      vsValuationUsd += cashSaved(r) - pointsValueUsd(r.points, cents);
    }
  }
  return {
    count: list.length,
    points,
    savings,
    averageCpp: points > 0 ? (savings / points) * 100 : null,
    valuationCpp: valuedPoints > 0 ? valuedCents / valuedPoints : null,
    vsValuationUsd,
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
