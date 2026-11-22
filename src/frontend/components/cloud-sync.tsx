"use client";

import { useEffect } from "react";
import { setSyncState, useAccount } from "@/frontend/state/account";
import { getWalletSnapshot, subscribeWallet, walletActions, type WalletState } from "@/frontend/state/wallet-store";
import { hasWalletData, isWalletLike, mergeWallets3 } from "@/shared/lib/wallet-merge";

const POLL_MS = 30_000;
const PUSH_DEBOUNCE_MS = 800;
const MAX_CONFLICT_RETRIES = 3;
const META_KEY = "perkfolio:sync:v2";

/**
 * What this browser last agreed on with the cloud, per account:
 * - `version`: the server's version of the cloud copy;
 * - `base`: the wallet as it was at that moment (the common ancestor for three-way merges).
 * A local wallet whose stamp differs from `base.updatedAt` has changes the cloud doesn't have yet.
 */
interface SyncMeta {
  account: string;
  version: number;
  base: WalletState;
}

function readMeta(account: string): SyncMeta | null {
  try {
    const m = JSON.parse(window.localStorage.getItem(META_KEY) ?? "null") as SyncMeta | null;
    return m && m.account === account && isWalletLike(m.base) && Number.isFinite(m.version) ? m : null;
  } catch {
    return null;
  }
}

function writeMeta(meta: SyncMeta) {
  try {
    window.localStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch {
    // Private mode without storage: sync still works for this page view.
  }
}

const isDirty = (local: WalletState, meta: SyncMeta | null) =>
  meta ? local.updatedAt !== meta.base.updatedAt : hasWalletData(local);

async function errorText(res: Response) {
  if (res.status === 401) return "You've been signed out. Sign in again to keep syncing.";
  try {
    const j = await res.json();
    return `${res.status}: ${j.error ?? res.statusText}`;
  } catch {
    return `${res.status}: ${res.statusText}`;
  }
}

/**
 * Keeps this browser's wallet and the signed-in account's cloud copy in step:
 * - on load, on tab focus and every 30s while visible, pull the cloud copy;
 * - after any local change, push it (debounced).
 * Saves are versioned by the server, so a stale device can't overwrite newer data: it gets a conflict, merges
 * the cloud copy in (three-way, against the last copy both agreed on) and saves again.
 */
export function CloudSync() {
  const { user, sync } = useAccount();
  const account = user?.email?.toLowerCase() ?? null;

  useEffect(() => {
    if (!account || !sync) return;
    const acct = account;
    let cancelled = false;
    let running = false;
    let again: "pull" | "push" | null = null;
    let ready = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    /** Bring a cloud copy into this browser, merging if this browser also has unsaved changes. */
    function integrate(remote: WalletState, version: number): boolean {
      const meta = readMeta(acct);
      const local = getWalletSnapshot();
      if (!isDirty(local, meta) || (!meta && !hasWalletData(local))) {
        // Record the sync before applying, so the change listener sees nothing new to push.
        writeMeta({ account: acct, version, base: remote });
        walletActions.applyRemote(remote);
        return false;
      }
      const merged = mergeWallets3(meta?.base ?? null, local, remote);
      writeMeta({ account: acct, version, base: remote });
      walletActions.importState(merged); // stamped, so it's pushed next
      return true;
    }

    async function push(): Promise<void> {
      for (let attempt = 0; attempt <= MAX_CONFLICT_RETRIES; attempt++) {
        if (cancelled) return;
        const meta = readMeta(acct);
        const local = getWalletSnapshot();
        if (!isDirty(local, meta)) return;
        const res = await fetch("/api/wallet", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ data: local, base: meta?.version ?? 0 }),
        });
        if (res.status === 409) {
          // Another device saved first: merge its copy in and try again.
          const latest = (await res.json()) as { data: unknown; version: number };
          if (isWalletLike(latest.data)) integrate(latest.data, latest.version);
          else writeMeta({ account: acct, version: latest.version, base: meta?.base ?? local });
          continue;
        }
        if (!res.ok) throw new Error(await errorText(res));
        const { version } = (await res.json()) as { version: number };
        writeMeta({ account: acct, version, base: local });
        return;
      }
      throw new Error("Couldn't save: another device keeps changing this wallet. Try Sync now.");
    }

    async function pull(): Promise<void> {
      const res = await fetch("/api/wallet", { cache: "no-store" });
      if (!res.ok) throw new Error(await errorText(res));
      const { data, version } = (await res.json()) as { data: unknown; version: number };
      if (cancelled) return;
      const meta = readMeta(acct);
      const local = getWalletSnapshot();

      if (meta && meta.version === version) {
        // Cloud unchanged since our last sync: just send anything new from here.
        if (isDirty(local, meta)) await push();
        return;
      }
      if (!isWalletLike(data)) {
        // Nothing saved for this account yet: upload this browser's wallet (or note that both are empty).
        if (hasWalletData(local)) await push();
        else writeMeta({ account: acct, version, base: local });
        return;
      }
      if (integrate(data, version)) await push();
    }

    async function run(kind: "pull" | "push") {
      if (running) {
        again = again === "pull" || kind === "pull" ? "pull" : "push";
        return;
      }
      running = true;
      if (kind === "push" || !ready) setSyncState("syncing");
      try {
        if (kind === "pull") await pull();
        else await push();
        if (!cancelled) setSyncState("synced");
      } catch (e) {
        if (!cancelled) setSyncState("error", e instanceof Error ? e.message : String(e));
      } finally {
        running = false;
        ready = true;
        if (again && !cancelled) {
          const next = again;
          again = null;
          void run(next);
        }
      }
    }

    void run("pull");

    const unsubscribe = subscribeWallet(() => {
      if (!ready || !isDirty(getWalletSnapshot(), readMeta(acct))) return;
      clearTimeout(timer);
      timer = setTimeout(() => void run("push"), PUSH_DEBOUNCE_MS);
    });
    // Don't lose a just-made change if the tab closes before the debounce fires.
    const flush = () => {
      if (document.visibilityState === "hidden" && timer) {
        clearTimeout(timer);
        timer = undefined;
        void run("push");
      }
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") void run("pull");
    };
    const poll = setInterval(() => {
      if (document.visibilityState === "visible") void run("pull");
    }, POLL_MS);
    const syncNow = () => void run("pull");
    document.addEventListener("visibilitychange", onVisible);
    document.addEventListener("visibilitychange", flush);
    window.addEventListener("focus", onVisible);
    window.addEventListener("perkfolio:sync-now", syncNow);

    return () => {
      cancelled = true;
      unsubscribe();
      clearTimeout(timer);
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      document.removeEventListener("visibilitychange", flush);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("perkfolio:sync-now", syncNow);
    };
  }, [account, sync]);

  return null;
}
