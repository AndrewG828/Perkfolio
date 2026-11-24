"use client";

import { useMemo } from "react";
import type { BankCurrencyId, ProgramId } from "@/shared/data/points";
import { reachablePrograms, walletPoints, type ProgramReach, type WalletPoints } from "@/shared/lib/points";
import { useHydrated, useWallet } from "@/frontend/state/wallet-store";

export interface WalletReach {
  /** False during prerender and the first client render: show the neutral version until then. */
  hydrated: boolean;
  cardIds: string[];
  points: WalletPoints;
  /** Programs the wallet can get points in. */
  reach: Map<ProgramId, ProgramReach>;
  /** Bank currencies the wallet can transfer. */
  mine: Set<BankCurrencyId>;
}

/** The wallet's points picture (empty until hydrated, so server and first client render match). */
export function useWalletReach(): WalletReach {
  const wallet = useWallet();
  const hydrated = useHydrated();
  const key = hydrated ? wallet.cards.join(",") : "";
  return useMemo(() => {
    const cardIds = key ? key.split(",") : [];
    const points = walletPoints(cardIds);
    return {
      hydrated,
      cardIds,
      points,
      reach: new Map(reachablePrograms(cardIds).map((r) => [r.program, r])),
      mine: new Set(points.currencies.filter((c) => c.transferable).map((c) => c.currency)),
    };
  }, [hydrated, key]);
}
