"use client";

import { useSyncExternalStore } from "react";

/**
 * The user's wallet and benefit usage, persisted to localStorage.
 * Kept deliberately small so it can later be synced to a backend (see README "Roadmap").
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

const STORAGE_KEY = "perkfolio:wallet:v1";
const EMPTY: WalletState = { version: 1, cards: [], usage: {}, ignored: {} };

let state: WalletState = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<WalletState>;
      state = { ...EMPTY, ...parsed, version: 1 };
    }
  } catch {
    state = EMPTY;
  }
}

function persist() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage may be unavailable (private mode); keep working in memory.
  }
}

function setState(updater: (s: WalletState) => WalletState, opts: { stamp?: boolean } = {}) {
  load();
  state = updater(state);
  if (opts.stamp !== false) state = { ...state, updatedAt: Date.now() };
  persist();
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      loaded = false;
      load();
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function getSnapshot() {
  load();
  return state;
}

const getServerSnapshot = () => EMPTY;

export function useWallet(): WalletState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** True once the client has hydrated and read localStorage. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

export const usageKey = (cardId: string, creditId: string, periodKey: string) =>
  `${cardId}:${creditId}:${periodKey}`;

export const walletActions = {
  addCard(cardId: string) {
    setState((s) => (s.cards.includes(cardId) ? s : { ...s, cards: [...s.cards, cardId] }));
  },
  removeCard(cardId: string) {
    setState((s) => ({ ...s, cards: s.cards.filter((c) => c !== cardId) }));
  },
  toggleCard(cardId: string) {
    setState((s) =>
      s.cards.includes(cardId)
        ? { ...s, cards: s.cards.filter((c) => c !== cardId) }
        : { ...s, cards: [...s.cards, cardId] },
    );
  },
  setUsage(cardId: string, creditId: string, periodKey: string, amount: number) {
    const key = usageKey(cardId, creditId, periodKey);
    setState((s) => {
      const usage = { ...s.usage };
      if (amount <= 0) delete usage[key];
      else usage[key] = Math.round(amount * 100) / 100;
      return { ...s, usage };
    });
  },
  toggleIgnored(cardId: string, creditId: string) {
    const key = `${cardId}:${creditId}`;
    setState((s) => {
      const ignored = { ...s.ignored };
      if (ignored[key]) delete ignored[key];
      else ignored[key] = true;
      return { ...s, ignored };
    });
  },
  setBonus(cardId: string, progress: BonusProgress | null) {
    setState((s) => {
      const bonus = { ...(s.bonus ?? {}) };
      if (progress) bonus[cardId] = progress;
      else delete bonus[cardId];
      return { ...s, bonus };
    });
  },
  setTally(key: string, value: number) {
    setState((s) => {
      const tally = { ...(s.tally ?? {}) };
      if (value <= 0) delete tally[key];
      else tally[key] = Math.round(value * 100) / 100;
      return { ...s, tally };
    });
  },
  setOpenDate(cardId: string, date: string | null) {
    setState((s) => {
      const openDates = { ...(s.openDates ?? {}) };
      if (date) openDates[cardId] = date;
      else delete openDates[cardId];
      return { ...s, openDates };
    });
  },
  reset() {
    setState(() => EMPTY);
  },
  importState(next: WalletState) {
    setState(() => ({ ...EMPTY, ...next, version: 1 }));
  },
};
