import type { Card, Credit } from "@/shared/data/types";
import { daysLeft, periodFor, periodsInYear, type Period } from "./periods";
import { usageKey, type WalletState } from "./wallet";

export interface CreditStatus {
  card: Card;
  credit: Credit;
  periodKey: string;
  periodLabel: string;
  periodEnd: Date;
  used: number;
  remaining: number;
  daysLeft: number;
  /** Used in the current year (calendar year, or the current cardmember year for anniversary credits). */
  ytd: number;
  ignored: boolean;
  /** Resets on the card's open-date anniversary rather than Jan 1. */
  anniversary: boolean;
  /** Anniversary credit whose card has no open date yet, so we fall back to the calendar year. */
  needsOpenDate: boolean;
}

const ANNIVERSARY_RE = /anniversar|account year|cardmember year|card ?member year|membership year|renewal/i;

/** True for annual credits that reset on the account anniversary (e.g. Venture X's $300 travel credit). */
export function isAnniversaryCredit(credit: Credit): boolean {
  return credit.frequency === "annual" && ANNIVERSARY_RE.test(`${credit.name} ${credit.description} ${credit.note ?? ""}`);
}

const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

/** The cardmember year containing `now`, given the card's open date (YYYY-MM-DD). */
export function cardmemberYear(openDate: string, now: Date): Period {
  const [, m, d] = openDate.split("-").map(Number);
  let start = new Date(now.getFullYear(), m - 1, d);
  if (start > now) start = new Date(now.getFullYear() - 1, m - 1, d);
  const end = new Date(start.getFullYear() + 1, m - 1, d);
  const last = new Date(end.getTime() - 86_400_000);
  const iso = `${start.getFullYear()}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return { key: `cm-${iso}`, label: `${fmt(start)} – ${fmt(last)}`, start, end };
}

export function creditPeriod(card: Card, credit: Credit, wallet: WalletState, now: Date): Period {
  const open = wallet.openDates?.[card.id];
  if (open && isAnniversaryCredit(credit)) return cardmemberYear(open, now);
  return periodFor(credit.frequency, now);
}

export function statusFor(card: Card, credit: Credit, wallet: WalletState, now: Date): CreditStatus {
  const anniversary = isAnniversaryCredit(credit);
  const p = creditPeriod(card, credit, wallet, now);
  const used = wallet.usage[usageKey(card.id, credit.id, p.key)] ?? 0;
  const ytd = p.key.startsWith("cm-")
    ? used
    : periodsInYear(credit.frequency, now.getFullYear()).reduce(
        (s, per) => s + (wallet.usage[usageKey(card.id, credit.id, per.key)] ?? 0),
        0,
      );
  return {
    card,
    credit,
    periodKey: p.key,
    periodLabel: p.label,
    periodEnd: p.end,
    used,
    remaining: Math.max(0, credit.amountPerPeriod - used),
    daysLeft: daysLeft(p, now),
    ytd,
    ignored: Boolean(wallet.ignored[`${card.id}:${credit.id}`]),
    anniversary,
    needsOpenDate: anniversary && !wallet.openDates?.[card.id],
  };
}

/** Credits with money left that reset within `days`, soonest first. */
export function expiringSoon(statuses: CreditStatus[], days: number): CreditStatus[] {
  return statuses
    .filter(
      (s) =>
        !s.ignored &&
        s.remaining > 0 &&
        s.daysLeft <= days &&
        s.credit.frequency !== "every-4-years" &&
        s.credit.frequency !== "one-time",
    )
    .sort((a, b) => a.daysLeft - b.daysLeft || b.remaining - a.remaining);
}
