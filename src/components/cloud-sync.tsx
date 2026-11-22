"use client";

import { useEffect } from "react";
import { setSyncState, useAccount } from "@/lib/account";
import { getWalletSnapshot, subscribeWallet, walletActions, type WalletState } from "@/lib/wallet-store";
import { hasWalletData, isWalletLike, mergeWallets } from "@/lib/wallet-merge";

/** Keeps the browser wallet and the signed-in user's cloud copy in step. Renders nothing. */
export function CloudSync() {
  const { user, sync } = useAccount();
  const who = user?.email ?? null;

  useEffect(() => {
    if (!who || !sync) return;
    let lastSynced = 0;
    let ready = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function push(w: WalletState) {
      const updatedAt = w.updatedAt ?? Date.now();
      setSyncState("syncing");
      try {
        const res = await fetch("/api/wallet", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ data: w, updatedAt }),
        });
        if (!res.ok) throw new Error(String(res.status));
        lastSynced = updatedAt;
        setSyncState("synced");
      } catch {
        setSyncState("error");
      }
    }

    (async () => {
      setSyncState("syncing");
      try {
        const res = await fetch("/api/wallet", { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const remote = (await res.json()) as { data: unknown; updatedAt: number };
        const local = getWalletSnapshot();
        const cloud = isWalletLike(remote.data) ? { ...remote.data, updatedAt: remote.updatedAt } : null;
        if (cloud && hasWalletData(local)) {
          // Both sides have data (e.g. cards picked before signing in): combine them, never overwrite.
          const merged = { ...mergeWallets(local, cloud), updatedAt: Date.now() };
          walletActions.applyRemote(merged);
          await push(merged);
        } else if (cloud) {
          walletActions.applyRemote(cloud);
          lastSynced = cloud.updatedAt ?? 0;
          setSyncState("synced");
        } else if (hasWalletData(local)) {
          await push({ ...local, updatedAt: local.updatedAt ?? Date.now() });
        } else {
          setSyncState("synced");
        }
      } catch {
        setSyncState("error");
      }
      ready = true;
      // Push anything changed while the first sync was in flight.
      const w = getWalletSnapshot();
      if ((w.updatedAt ?? 0) > lastSynced) push(w);
    })();

    const unsubscribe = subscribeWallet(() => {
      if (!ready) return;
      const w = getWalletSnapshot();
      if ((w.updatedAt ?? 0) <= lastSynced) return;
      clearTimeout(timer);
      timer = setTimeout(() => push(getWalletSnapshot()), 1200);
    });
    return () => {
      unsubscribe();
      clearTimeout(timer);
    };
  }, [who, sync]);

  return null;
}
