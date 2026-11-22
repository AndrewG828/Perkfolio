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

export const EMPTY_WALLET: WalletState = { version: 1, cards: [], usage: {}, ignored: {} };

export const usageKey = (cardId: string, creditId: string, periodKey: string) =>
  `${cardId}:${creditId}:${periodKey}`;
