"use client";

import { useSyncExternalStore } from "react";

import { EMPTY_WALLET, usageKey, type BonusProgress, type WalletState } from "@/shared/lib/wallet";

export { usageKey, type BonusProgress, type WalletState };

/** The browser copy of the wallet, persisted to localStorage and synced to the account by CloudSync. */
const STORAGE_KEY = "perkfolio:wallet:v1";
const EMPTY = EMPTY_WALLET;

let state: WalletState = EMPTY;
let loaded = false;
/** React views: notified on every change, including ones made in other tabs. */
const listeners = new Set<() => void>();
/** The cloud sync loop: notified only for changes made in this tab. */
const editListeners = new Set<() => void>();

function read() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    state = raw ? { ...EMPTY, ...(JSON.parse(raw) as Partial<WalletState>), version: 1 } : EMPTY;
  } catch {
    state = EMPTY;
  }
}

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  read();
  // Another tab changed the wallet: pick it up so this tab never works from (or syncs) a stale copy.
  window.addEventListener("storage", (e) => {
    if (e.key !== STORAGE_KEY && e.key !== null) return;
    read();
    listeners.forEach((l) => l());
  });
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
  editListeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  load();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  load();
  return state;
}

const getServerSnapshot = () => EMPTY;

/** Non-React access for the cloud sync loop. */
export const getWalletSnapshot = getSnapshot;
/** Called after every change made in this tab (not changes picked up from other tabs). */
export function subscribeWallet(listener: () => void) {
  load();
  editListeners.add(listener);
  return () => {
    editListeners.delete(listener);
  };
}

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
  /** Replace local state with the cloud copy, keeping its stamp so the sync loop knows it's already in the cloud. */
  applyRemote(next: WalletState) {
    setState(() => ({ ...EMPTY, ...next, version: 1 }), { stamp: false });
  },
  importState(next: WalletState) {
    setState(() => ({ ...EMPTY, ...next, version: 1 }));
  },
};
