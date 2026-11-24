/**
 * The user's wallet and benefit usage: everything they enter. The browser keeps a copy in localStorage
 * (frontend/state/wallet-store) and the backend stores it per user as JSON (backend/repositories/wallets).
 */
export interface WalletState {
  version: 1;
  /** Card ids the user holds, in the order added. */
  cards: string[];
  /** Dollars used per credit per period. Key: `${cardId}:${creditId}:${periodKey}` */
  usage: Record<string, number>;
  /** Credits the user doesn't care about (excluded from totals). Key: `${cardId}:${creditId}` */
  ignored: Record<string, true>;
  /** Welcome-bonus minimum-spend progress per card. Optional so older saved wallets still load. */
  bonus?: Record<string, BonusProgress>;
  /** Running tallies for caps and visit limits. Key: `${cardId}:${limitId}:${periodKey}` → dollars or visits. */
  tally?: Record<string, number>;
  /** Card open dates (YYYY-MM-DD), used for credits that reset on the card anniversary. */
  openDates?: Record<string, string>;
  /**
   * Cards the user has opened, including closed ones and cards that aren't in our dataset, for issuer rules like
   * Chase 5/24. `undefined` means the user hasn't set up their history yet (rules that need it report "unknown");
   * an empty list means they have nothing to add.
   */
  applications?: CardApplication[];
  /** Points balances. Key: a bank currency or loyalty program id (see shared/data/strategy/programs). */
  balances?: Record<string, PointsBalance>;
  /** Free nights, companion passes, vouchers and gift cards. */
  certificates?: Certificate[];
  /** Award redemptions the user logged, for cents-per-point tracking. */
  redemptions?: Redemption[];
  /** Last local change (ms since epoch), used to merge with cloud sync. */
  updatedAt?: number;
}

export interface BonusProgress {
  /** Required spend in USD, e.g. 8000 */
  target: number;
  /** Spend so far in USD */
  spent: number;
  /** Last day to hit the target, ISO date (YYYY-MM-DD) */
  deadline: string;
}

/** A card account the user opened. Months are "YYYY-MM". */
export interface CardApplication {
  /** Random id, stable across devices (lists merge by id). */
  id: string;
  /** Display name of the issuing bank, e.g. "Chase". */
  issuer: string;
  /** Our card id when the card is in the dataset. */
  cardId?: string;
  /** Name for cards that aren't in the dataset. */
  name?: string;
  opened: string;
  business: boolean;
  closed?: string;
  /** Month the welcome bonus posted. Absent: no bonus earned (or not recorded). */
  bonusEarned?: string;
}

export interface PointsBalance {
  points: number;
  /** When the user last checked this balance (YYYY-MM-DD). */
  updated: string;
  /** Last earning or redeeming activity (YYYY-MM-DD), for programs that expire after inactivity. */
  lastActivity?: string;
}

export type CertificateKind = "free-night" | "companion" | "voucher" | "gift-card" | "other";

export interface Certificate {
  id: string;
  kind: CertificateKind;
  /** Loyalty program id, if it belongs to one. */
  program?: string;
  label: string;
  valueUsd?: number;
  /** Points cap, e.g. a free night up to 35,000 points. */
  points?: number;
  /** YYYY-MM-DD; null means it doesn't expire. */
  expires?: string | null;
  used?: boolean;
  notes?: string;
}

export interface Redemption {
  id: string;
  date: string;
  label: string;
  /** Program or bank currency id the points came from. */
  program?: string;
  points: number;
  taxesUsd: number;
  /** What the same booking would have cost in cash. */
  cashPriceUsd: number;
  notes?: string;
}

export const EMPTY_WALLET: WalletState = { version: 1, cards: [], usage: {}, ignored: {} };

export const usageKey = (cardId: string, creditId: string, periodKey: string) =>
  `${cardId}:${creditId}:${periodKey}`;
