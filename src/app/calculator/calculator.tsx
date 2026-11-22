"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Info } from "lucide-react";
import type { Card } from "@/data/types";
import { annualizedCreditValue, cards, categoryLabels } from "@/data/cards";
import { SPEND_CATEGORIES, estimateRewards, type SpendCategory } from "@/data/calculator-rates";
import { CardArt } from "@/components/card-art";
import { useWallet } from "@/lib/wallet-store";
import { cn, usd } from "@/lib/format";

const DEFAULT_SPEND: Record<SpendCategory, number> = {
  dining: 500,
  groceries: 600,
  flights: 250,
  hotels: 150,
  otherTravel: 100,
  gas: 150,
  streaming: 40,
  rent: 0,
  other: 1500,
};

export function Calculator() {
  const wallet = useWallet();
  const [spend, setSpend] = useState(DEFAULT_SPEND);
  const [portal, setPortal] = useState(false);
  const [utilization, setUtilization] = useState(60);
  const [includeBonus, setIncludeBonus] = useState(false);
  const [scope, setScope] = useState<"all" | "wallet" | "premium-travel" | "travel" | "cash-back">("all");

  const results = useMemo(() => {
    const annualSpend = Object.fromEntries(Object.entries(spend).map(([k, v]) => [k, v * 12])) as Record<SpendCategory, number>;
    return cards
      .filter((c) => (scope === "all" ? c.category !== "business" : scope === "wallet" ? wallet.cards.includes(c.id) : c.category === scope))
      .map((card) => {
        const { points, value, breakdown } = estimateRewards(card, annualSpend, portal);
        const credits = annualizedCreditValue(card) * (utilization / 100);
        const bonus = includeBonus ? card.welcomeOfferValue : 0;
        return { card, points, rewards: value, credits, bonus, breakdown, net: value + credits + bonus - card.annualFee };
      })
      .sort((a, b) => b.net - a.net);
  }, [spend, portal, utilization, includeBonus, scope, wallet.cards]);

  const totalMonthly = Object.values(spend).reduce((a, b) => a + b, 0);
  const max = Math.max(1, ...results.map((r) => r.net));

  return (
    <div className="bg-canvas">
      <div className="container-page grid gap-8 py-10 lg:grid-cols-[360px_1fr]">
        <aside className="panel h-fit space-y-6 p-6 lg:sticky lg:top-28">
          <div>
            <h2 className="font-semibold text-navy">Monthly spending</h2>
            <p className="text-sm text-ink-3">{usd(totalMonthly)}/mo · {usd(totalMonthly * 12)}/yr</p>
          </div>
          <div className="space-y-3">
            {SPEND_CATEGORIES.map((cat) => (
              <label key={cat.id} className="grid grid-cols-[1fr_120px] items-center gap-3 text-sm">
                <span>
                  <span className="font-medium text-ink">{cat.label}</span>
                  {cat.hint && <span className="block text-xs text-ink-3">{cat.hint}</span>}
                </span>
                <span className="relative">
                  <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3">$</span>
                  <input
                    type="number"
                    min={0}
                    step={25}
                    inputMode="numeric"
                    className="input pl-6 text-right"
                    value={spend[cat.id] || ""}
                    placeholder="0"
                    onChange={(e) => setSpend((s) => ({ ...s, [cat.id]: Math.max(0, Number(e.target.value) || 0) }))}
                  />
                </span>
              </label>
            ))}
          </div>
          <div className="space-y-4 border-t border-line pt-5">
            <label className="block text-sm">
              <span className="flex justify-between font-medium text-ink">
                Credits you&apos;d actually use <span className="text-brand">{utilization}%</span>
              </span>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={utilization}
                onChange={(e) => setUtilization(Number(e.target.value))}
                className="mt-2 w-full accent-[var(--color-brand)]"
              />
            </label>
            <label className="flex items-center gap-2 text-sm font-medium text-ink">
              <input type="checkbox" className="h-4 w-4 accent-[var(--color-brand)]" checked={portal} onChange={(e) => setPortal(e.target.checked)} />
              I book travel through card portals
            </label>
            <label className="flex items-center gap-2 text-sm font-medium text-ink">
              <input type="checkbox" className="h-4 w-4 accent-[var(--color-brand)]" checked={includeBonus} onChange={(e) => setIncludeBonus(e.target.checked)} />
              Include first-year welcome offer
            </label>
          </div>
        </aside>

        <div className="min-w-0 space-y-5">
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["all", "All personal cards"],
                ["wallet", "My wallet"],
                ["premium-travel", categoryLabels["premium-travel"]],
                ["travel", categoryLabels.travel],
                ["cash-back", categoryLabels["cash-back"]],
              ] as const
            ).map(([id, label]) => (
              <button key={id} onClick={() => setScope(id)} className={cn("chip cursor-pointer px-4 py-1.5 text-sm", scope === id && "border-brand bg-sky text-brand")}>
                {label}
              </button>
            ))}
          </div>
          {results.length === 0 && (
            <div className="panel p-10 text-center text-ink-2">
              {scope === "wallet" ? (
                <>
                  Your wallet is empty. <Link href="/tracker" className="link">Add your cards</Link> first.
                </>
              ) : (
                "No cards in this group."
              )}
            </div>
          )}
          <ol className="space-y-3">
            {results.map((r, i) => (
              <li key={r.card.id} className={cn("panel p-5", i === 0 && "ring-2 ring-brand")}>
                <div className="flex flex-wrap items-center gap-5">
                  <span className="w-6 text-center text-lg font-semibold text-ink-3">{i + 1}</span>
                  <CardArt card={r.card} size="sm" />
                  <div className="min-w-[180px] flex-1">
                    {i === 0 && <p className="eyebrow">Top pick for you</p>}
                    <Link href={`/cards/${r.card.id}`} className="font-semibold text-navy hover:text-brand">
                      {r.card.name}
                    </Link>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-canvas">
                      <div className="h-full rounded-full bg-brand" style={{ width: `${Math.max(0, (r.net / max) * 100)}%` }} />
                    </div>
                  </div>
                  <dl className="grid grid-cols-4 gap-4 text-right text-sm">
                    <Cell label="Rewards" value={usd(r.rewards)} />
                    <Cell label="Credits" value={usd(r.credits)} />
                    <Cell label="Fee" value={r.card.annualFee ? `−${usd(r.card.annualFee)}` : "$0"} />
                    <Cell label={includeBonus ? "Net yr 1" : "Net / yr"} value={usd(r.net)} strong tone={r.net >= 0 ? "pos" : "neg"} />
                  </dl>
                </div>
              </li>
            ))}
          </ol>
          <p className="flex gap-2 text-xs leading-relaxed text-ink-3">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Estimates use our point valuations and ignore spending caps beyond those noted on each card. Credits are counted at
            face value × your utilization. Real results depend on how you redeem.
          </p>
        </div>
      </div>
    </div>
  );
}

function Cell({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: "pos" | "neg" }) {
  return (
    <div>
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className={cn("font-semibold", strong ? (tone === "neg" ? "text-base text-danger" : "text-base text-success") : "text-ink")}>{value}</dd>
    </div>
  );
}

export type { Card };
