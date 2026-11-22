"use client";

import { useEffect } from "react";
import { setSyncState, useAccount } from "@/lib/account";
import { getWalletSnapshot, subscribeWallet, walletActions, type WalletState } from "@/lib/wallet-store";

const hasData = (w: WalletState) => w.cards.length > 0 || Object.keys(w.usage).length > 0;

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
        const remote = (await res.json()) as { data: WalletState | null; updatedAt: number };
        const local = getWalletSnapshot();
        if (remote.data && remote.updatedAt > (local.updatedAt ?? 0)) {
          walletActions.applyRemote({ ...remote.data, updatedAt: remote.updatedAt });
          lastSynced = remote.updatedAt;
          setSyncState("synced");
        } else if (hasData(local)) {
          await push(local);
        } else {
          lastSynced = remote.updatedAt;
          setSyncState("synced");
        }
      } catch {
        setSyncState("error");
      }
      ready = true;
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
