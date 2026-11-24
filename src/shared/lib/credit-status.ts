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
  /** Anniversary credit whose card has no open date yet (not even a month in the card history): calendar year. */
  needsOpenDate: boolean;
  /**
   * The card history knows the month the card was opened but not the day: the card year is counted from the 1st of
   * that month, the earliest it can reset, so a countdown is never later than the real one.
   */
  openMonthOnly: boolean;
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

/**
 * When the card was opened, for anniversary credits: the date the user entered on the tracker, else the open date in
 * their card history (the latest open, non-authorized-user account of this card), which may be a month ("2025-08").
 */
export function openDateFor(card: Pick<Card, "id">, wallet: WalletState): { date: string; monthOnly: boolean } | null {
  const own = wallet.openDates?.[card.id];
  if (own) return { date: own, monthOnly: false };
  const app = (wallet.applications ?? [])
    .filter((a) => a.cardId === card.id && !a.closed && !a.authorizedUser && /^\d{4}-\d{2}(-\d{2})?$/.test(a.opened))
    .sort((a, b) => b.opened.localeCompare(a.opened))[0];
  if (!app) return null;
  return app.opened.length >= 10 ? { date: app.opened, monthOnly: false } : { date: `${app.opened}-01`, monthOnly: true };
}

export function creditPeriod(card: Card, credit: Credit, wallet: WalletState, now: Date): Period {
  const open = openDateFor(card, wallet);
  if (open && isAnniversaryCredit(credit)) return cardmemberYear(open.date, now);
  return periodFor(credit.frequency, now);
}

export function statusFor(card: Card, credit: Credit, wallet: WalletState, now: Date): CreditStatus {
  const anniversary = isAnniversaryCredit(credit);
  const open = anniversary ? openDateFor(card, wallet) : null;
  const p = creditPeriod(card, credit, wallet, now);
  // A card year first counted from its month (card history) and later from the exact day keeps what was marked used.
  const monthKey = p.key.startsWith("cm-") ? `${p.key.slice(0, 10)}-01` : null;
  const used = wallet.usage[usageKey(card.id, credit.id, p.key)] ?? (monthKey ? wallet.usage[usageKey(card.id, credit.id, monthKey)] : undefined) ?? 0;
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
    needsOpenDate: anniversary && !open,
    openMonthOnly: Boolean(open?.monthOnly),
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
