"use client";

import { useEffect } from "react";
import { setSyncState, useAccount } from "@/lib/account";
import { getWalletSnapshot, subscribeWallet, walletActions, type WalletState } from "@/lib/wallet-store";
import { hasWalletData, isWalletLike, mergeWallets } from "@/lib/wallet-merge";

const POLL_MS = 30_000;
const PUSH_DEBOUNCE_MS = 1_000;

async function errorText(res: Response) {
  try {
    const j = await res.json();
    return `${res.status}: ${j.error ?? res.statusText}`;
  } catch {
    return `${res.status}: ${res.statusText}`;
  }
}

/**
 * Keeps this browser's wallet and the signed-in user's cloud copy in step:
 * - on load, on tab focus and every 30s while visible, pull the cloud copy;
 * - after any local change, push (debounced).
 * If both sides changed since the last sync, they're merged so nothing is lost.
 */
export function CloudSync() {
  const { user, sync } = useAccount();
  const who = user?.email ?? null;

  useEffect(() => {
    if (!who || !sync) return;
    /** updatedAt of the wallet version both sides agree on. */
    let lastSynced = -1;
    let busy = false;
    let ready = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function push(w: WalletState): Promise<void> {
      const updatedAt = w.updatedAt ?? Date.now();
      setSyncState("syncing");
      try {
        const res = await fetch("/api/wallet", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ data: w, updatedAt }),
        });
        if (!res.ok) throw new Error(await errorText(res));
        const body = (await res.json()) as { saved?: boolean };
        lastSynced = updatedAt;
        setSyncState("synced");
        // The cloud already had something newer (another device): pull and merge it in.
        if (body.saved === false) void pull();
      } catch (e) {
        lastSynced = -1; // treat local as unsynced so the next pull retries
        setSyncState("error", e instanceof Error ? e.message : String(e));
      }
    }

    async function pull(): Promise<void> {
      if (busy) return;
      busy = true;
      try {
        const res = await fetch("/api/wallet", { cache: "no-store" });
        if (!res.ok) throw new Error(await errorText(res));
        const remote = (await res.json()) as { data: unknown; updatedAt: number };
        const cloud = isWalletLike(remote.data) ? { ...remote.data, updatedAt: remote.updatedAt } : null;
        const local = getWalletSnapshot();
        const localAt = local.updatedAt ?? 0;
        const localChanged = hasWalletData(local) && localAt !== lastSynced && localAt !== (cloud?.updatedAt ?? -2);

        if (!cloud) {
          if (hasWalletData(local)) await push({ ...local, updatedAt: localAt || Date.now() });
          else setSyncState("synced");
        } else if (cloud.updatedAt === localAt) {
          lastSynced = localAt; // already identical
          setSyncState("synced");
        } else if (localChanged) {
          const merged = { ...mergeWallets(local, cloud), updatedAt: Date.now() };
          lastSynced = merged.updatedAt; // set before applying so the change listener doesn't push it twice
          walletActions.applyRemote(merged);
          await push(merged);
        } else if (cloud.updatedAt > lastSynced) {
          lastSynced = cloud.updatedAt;
          walletActions.applyRemote(cloud);
          setSyncState("synced");
        } else {
          setSyncState("synced");
        }
      } catch (e) {
        setSyncState("error", e instanceof Error ? e.message : String(e));
      } finally {
        busy = false;
        ready = true;
      }
    }

    setSyncState("syncing");
    void pull();

    const unsubscribe = subscribeWallet(() => {
      if (!ready) return;
      const w = getWalletSnapshot();
      if ((w.updatedAt ?? 0) === lastSynced) return; // came from the cloud
      clearTimeout(timer);
      timer = setTimeout(() => void push(getWalletSnapshot()), PUSH_DEBOUNCE_MS);
    });

    const onVisible = () => {
      if (document.visibilityState === "visible") void pull();
    };
    const poll = setInterval(() => {
      if (document.visibilityState === "visible") void pull();
    }, POLL_MS);
    const syncNow = () => void pull();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    window.addEventListener("perkfolio:sync-now", syncNow);

    return () => {
      unsubscribe();
      clearTimeout(timer);
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("perkfolio:sync-now", syncNow);
    };
  }, [who, sync]);

  return null;
}
