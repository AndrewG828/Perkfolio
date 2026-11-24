"use client";

import { useSyncExternalStore } from "react";

import {
  EMPTY_WALLET,
  usageKey,
  type BonusProgress,
  type CardApplication,
  type Certificate,
  type PointsBalance,
  type Redemption,
  type WalletState,
} from "@/shared/lib/wallet";
import {
  WALLET_LIMITS,
  isProgramId,
  parseApplication,
  parseBalance,
  parseCertificate,
  parseRedemption,
} from "@/shared/lib/wallet-schema";

export { usageKey, type BonusProgress, type CardApplication, type Certificate, type PointsBalance, type Redemption, type WalletState };

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

/** Random id for list items (applications, certificates, redemptions): lists merge across devices by id. */
export function newId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** Cloud sync accepts bodies up to 256 KB; keep additions comfortably under that. */
const SOFT_MAX_BYTES = 240 * 1024;
const walletBytes = (w: WalletState) => new TextEncoder().encode(JSON.stringify(w)).length;

type ListKey = "applications" | "certificates" | "redemptions";
const LIST_MAX: Record<ListKey, number> = {
  applications: WALLET_LIMITS.applications,
  certificates: WALLET_LIMITS.certificates,
  redemptions: WALLET_LIMITS.redemptions,
};

/**
 * Adds or replaces one list item after validating it with the same schema the server uses, so a saved wallet always
 * syncs. Returns false (and changes nothing) for an invalid item, a full list, or a wallet near the size limit.
 */
function upsertItem<T extends { id: string }>(key: ListKey, item: T | undefined): boolean {
  if (!item) return false;
  const current = getSnapshot();
  const list = (current[key] as T[] | undefined) ?? [];
  const exists = list.some((x) => x.id === item.id);
  if (!exists && list.length >= LIST_MAX[key]) return false;
  const next = { ...current, [key]: exists ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item] } as WalletState;
  if (!exists && walletBytes(next) > SOFT_MAX_BYTES) return false;
  // State only changes inside setState, and this runs synchronously, so `next` is built from the latest copy.
  setState(() => next);
  return true;
}

function removeItem(key: ListKey, id: string) {
  setState((s) => ({ ...s, [key]: ((s[key] as { id: string }[] | undefined) ?? []).filter((x) => x.id !== id) }));
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
  /** Adds a card application; returns false if it's invalid or the list is full. */
  addApplication(app: Omit<CardApplication, "id">): boolean {
    return upsertItem("applications", parseApplication({ ...app, id: newId() }));
  },
  /** Adds several applications at once (prefilling from the wallet). Returns how many were added. */
  addApplications(apps: Omit<CardApplication, "id">[]): number {
    const valid = apps.map((a) => parseApplication({ ...a, id: newId() })).filter((a): a is CardApplication => Boolean(a));
    const current = getSnapshot();
    const list = current.applications ?? [];
    const added = valid.slice(0, Math.max(0, WALLET_LIMITS.applications - list.length));
    const next = { ...current, applications: [...list, ...added] };
    if (added.length === 0 || walletBytes(next) > SOFT_MAX_BYTES) return 0;
    setState(() => next);
    return added.length;
  },
  updateApplication(app: CardApplication): boolean {
    return upsertItem("applications", parseApplication(app));
  },
  removeApplication(id: string) {
    removeItem("applications", id);
  },
  /** Records that the user has no (other) applications to add, so history-based rules can give an answer. */
  confirmNoApplications() {
    setState((s) => (s.applications ? s : { ...s, applications: [] }));
  },
  /** Sets or (with null) removes the balance for a program or bank currency. */
  setBalance(programId: string, balance: PointsBalance | null): boolean {
    if (!isProgramId(programId)) return false;
    if (balance === null) {
      setState((s) => {
        const balances = { ...(s.balances ?? {}) };
        delete balances[programId];
        return { ...s, balances };
      });
      return true;
    }
    const clean = parseBalance(balance);
    if (!clean) return false;
    const current = getSnapshot().balances ?? {};
    if (!Object.prototype.hasOwnProperty.call(current, programId) && Object.keys(current).length >= WALLET_LIMITS.balances) return false;
    setState((s) => ({ ...s, balances: { ...(s.balances ?? {}), [programId]: clean } }));
    return true;
  },
  addCertificate(cert: Omit<Certificate, "id">): boolean {
    return upsertItem("certificates", parseCertificate({ ...cert, id: newId() }));
  },
  updateCertificate(cert: Certificate): boolean {
    return upsertItem("certificates", parseCertificate(cert));
  },
  removeCertificate(id: string) {
    removeItem("certificates", id);
  },
  addRedemption(r: Omit<Redemption, "id">): boolean {
    return upsertItem("redemptions", parseRedemption({ ...r, id: newId() }));
  },
  updateRedemption(r: Redemption): boolean {
    return upsertItem("redemptions", parseRedemption(r));
  },
  removeRedemption(id: string) {
    removeItem("redemptions", id);
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
