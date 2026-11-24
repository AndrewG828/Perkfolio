"use client";

import { useMemo } from "react";
import type { ValueContext } from "@/shared/lib/point-value";
import { useStrategyPrefs } from "./strategy-prefs";
import { useHydrated, useWallet } from "./wallet-store";

export interface ValueContextState extends ValueContext {
  /** False during prerender and the first client render, when the context is empty (published medians). */
  hydrated: boolean;
}

/**
 * What point values depend on for this visitor, for shared/lib/point-value.ts: their own values (the tracker's Points
 * tab, localStorage `perkfolio:strategy:v1`) and the cards in their wallet. Both live in localStorage, so they're read
 * only after hydration; until then the context is empty and every value is the published median, so the server render
 * and the first client render match.
 */
export function useValueContext(): ValueContextState {
  const hydrated = useHydrated();
  const { cpp } = useStrategyPrefs();
  const { cards } = useWallet();
  return useMemo(() => (hydrated ? { hydrated, own: cpp, cards } : { hydrated }), [hydrated, cpp, cards]);
}
