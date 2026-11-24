"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ArrowRight, Sparkles } from "lucide-react";
import type { WalletState } from "@/frontend/state/wallet-store";
import { useStrategyPrefs } from "@/frontend/state/strategy-prefs";
import { ApplicationsEditor } from "@/frontend/features/next-card/applications-editor";
import { FiveTwentyFourPanel } from "@/frontend/features/next-card/five-24-panel";
import { chase524, historyContext } from "@/shared/lib/eligibility";
import { rankNextCards } from "@/shared/lib/next-card";
import { centsFor } from "@/shared/lib/trackers";
import { usd } from "@/shared/lib/format";
import { TabFrame } from "./tab-parts";

/** Card history (the same editor as /next-card) with the Chase 5/24 counter. */
export function ApplicationsTab({ wallet, now }: { wallet: WalletState; now: Date }) {
  const counter = useMemo(() => chase524(historyContext(wallet, now)), [wallet, now]);
  const { usable, facts, cpp } = useStrategyPrefs();
  const best = useMemo(
    () => rankNextCards({ wallet, today: now, usable, facts, cents: (p) => centsFor(p, cpp) }).eligible[0],
    [wallet, now, usable, facts, cpp],
  );
  return (
    <TabFrame>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="order-last min-w-0 lg:order-none">
          <ApplicationsEditor wallet={wallet} today={now} counter={counter} />
        </div>
        <aside className="space-y-5 lg:sticky lg:top-28 lg:self-start">
          <FiveTwentyFourPanel status={counter} today={now} collapsible />
          <Link href="/next-card" className="panel group flex items-center gap-4 p-5 transition-colors hover:border-brand">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-sky text-brand">
              <Sparkles className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1 text-sm">
              <span className="block font-semibold text-navy">Which card next?</span>
              <span className="text-ink-2">
                {best
                  ? `${best.card.name} leads, worth ${best.value.offer.upTo ? "up to " : ""}${usd(best.value.total)} in year one.`
                  : "See the cards you can get, ranked by first-year value."}
              </span>
            </span>
            <ArrowRight className="h-4 w-4 shrink-0 text-brand transition-transform group-hover:translate-x-1" />
          </Link>
        </aside>
      </div>
    </TabFrame>
  );
}
