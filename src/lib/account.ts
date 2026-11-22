"use client";

import { useSyncExternalStore } from "react";

export interface Account {
  status: "loading" | "ready";
  enabled: boolean;
  sync: boolean;
  user: { name: string | null; email: string | null; image: string | null } | null;
  syncState?: "idle" | "syncing" | "synced" | "error";
  /** Wall-clock time of the last successful sync. */
  lastSyncedAt?: number;
  syncError?: string;
}

const INITIAL: Account = { status: "loading", enabled: false, sync: false, user: null };
let account: Account = INITIAL;
let started = false;
const listeners = new Set<() => void>();

function set(next: Partial<Account>) {
  account = { ...account, ...next };
  listeners.forEach((l) => l());
}

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  fetch("/api/me", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : { enabled: false, sync: false, user: null }))
    .then((d) => set({ status: "ready", enabled: Boolean(d.enabled), sync: Boolean(d.sync), user: d.user ?? null }))
    .catch(() => set({ status: "ready" }));
}

export function setSyncState(syncState: Account["syncState"], error?: string) {
  set(
    syncState === "synced"
      ? { syncState, lastSyncedAt: Date.now(), syncError: undefined }
      : syncState === "error"
        ? { syncState, syncError: error ?? "Sync failed" }
        : { syncState },
  );
}

/** Ask the sync loop to pull and push right away (e.g. from a "Sync now" button). */
export function requestSync() {
  window.dispatchEvent(new Event("perkfolio:sync-now"));
}

export function useAccount(): Account {
  return useSyncExternalStore(
    (l) => {
      start();
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => account,
    () => INITIAL,
  );
}
