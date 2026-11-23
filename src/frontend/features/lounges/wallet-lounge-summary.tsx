"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ArrowRight } from "lucide-react";
import type { Card } from "@/shared/data/types";
import { getCard } from "@/shared/data/cards";
import { accessibleCountByAirport } from "@/shared/lib/lounge-access";
import { useHydrated, useWallet } from "@/frontend/state/wallet-store";

/** One line for the home hero: what the visitor's wallet unlocks, or a nudge to add cards. */
export function WalletLoungeSummary() {
  const wallet = useWallet();
  const hydrated = useHydrated();
  const key = wallet.cards.join(",");
  const open = useMemo(() => {
    const cards = wallet.cards.map(getCard).filter((c): c is Card => Boolean(c));
    return accessibleCountByAirport(cards);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (!hydrated) return <p className="h-6" />;
  const lounges = Object.values(open).reduce((s, n) => s + n, 0);
  const airports = Object.keys(open).length;
  if (wallet.cards.length === 0) {
    return (
      <p className="text-sm text-white/80">
        <Link href="/tracker" className="font-semibold text-white underline underline-offset-4">
          Add your cards
        </Link>{" "}
        to see only the lounges you can get into.
      </p>
    );
  }
  return (
    <Link href="/lounges" className="group inline-flex items-center gap-1 text-sm text-white/90 hover:text-white">
      Your {wallet.cards.length === 1 ? "card opens" : `${wallet.cards.length} cards open`}{" "}
      <strong className="text-white">{lounges} lounges</strong> at <strong className="text-white">{airports} airports</strong>
      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
    </Link>
  );
}
