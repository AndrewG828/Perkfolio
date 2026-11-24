"use client";

import { useMemo } from "react";
import type { BankCurrencyId, ProgramId } from "@/shared/data/points";
import {
  localIsoDate,
  pointsDataOn,
  reachablePrograms,
  walletPoints,
  type PointsData,
  type ProgramReach,
  type WalletPoints,
} from "@/shared/lib/points";
import { useHydrated, useWallet } from "@/frontend/state/wallet-store";

export interface WalletReach {
  /** False during prerender and the first client render: show the neutral version until then. */
  hydrated: boolean;
  /** The viewer's date (YYYY-MM-DD) once hydrated, else null. */
  today: string | null;
  /**
   * The dataset as it stands today (scheduled ratio changes applied once their date comes, pointsDataOn()); the raw
   * dataset before hydration. Pass it to the shared helpers (bestPartnerFor, transferSources, …) so every ratio a view
   * shows after hydration is the current one.
   */
  data: PointsData;
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
  const today = hydrated ? localIsoDate() : null;
  const data = pointsDataOn(today);
  return useMemo(() => {
    const cardIds = key ? key.split(",") : [];
    const points = walletPoints(cardIds, data);
    return {
      hydrated,
      today,
      data,
      cardIds,
      points,
      reach: new Map(reachablePrograms(cardIds, data).map((r) => [r.program, r])),
      mine: new Set(points.currencies.filter((c) => c.transferable).map((c) => c.currency)),
    };
  }, [hydrated, key, today, data]);
}
