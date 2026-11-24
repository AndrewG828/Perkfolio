"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Info } from "lucide-react";
import type { Card } from "@/shared/data/types";
import { cards, categoryLabels, rateLabel } from "@/shared/data/cards";
import { SPEND_CATEGORIES, estimateRewards, isBrandOnly, rateCondition, rateFor, type SpendCategory } from "@/shared/data/calculator-rates";
import { CardArt } from "@/frontend/components/card-art";
import { useWallet } from "@/frontend/state/wallet-store";
import { useValueContext } from "@/frontend/state/point-values";
import { MEDIAN_SOURCE, annualizedCredits } from "@/shared/lib/point-value";
import { welcomeValue } from "@/shared/lib/welcome-offer";
import { USAGE } from "@/shared/lib/credit-usage";
import { cn, usd } from "@/shared/lib/format";

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
  const values = useValueContext();
  const [spend, setSpend] = useState(DEFAULT_SPEND);
  const [portal, setPortal] = useState(false);
  // ?credits=all|half|little (from Start here's "Is my card worth its fee?") sets how much of the credits count.
  const params = useSearchParams();
  const [utilization, setUtilization] = useState(() => {
    const share = USAGE[params.get("credits") ?? ""]?.share;
    return share === undefined ? 60 : Math.round(share * 100);
  });
  const [includeBonus, setIncludeBonus] = useState(false);
  // A co-brand card's bonus on flights or hotels counts only on that airline's or chain's purchases: off by default,
  // those categories earn the card's base rate.
  const [brand, setBrand] = useState(false);
  const [scope, setScope] = useState<"all" | "wallet" | "premium-travel" | "travel" | "cash-back">("all");

  const results = useMemo(() => {
    const annualSpend = Object.fromEntries(Object.entries(spend).map(([k, v]) => [k, v * 12])) as Record<SpendCategory, number>;
    return cards
      .filter((c) => (scope === "all" ? c.category !== "business" : scope === "wallet" ? wallet.cards.includes(c.id) : c.category === scope))
      .map((card) => {
        const { points, value, breakdown } = estimateRewards(card, annualSpend, portal, values, { brand });
        const credits = annualizedCredits(card, values) * (utilization / 100);
        const bonus = includeBonus ? welcomeValue(card, values).usd : 0;
        return { card, points, rewards: value, credits, bonus, breakdown, conditions: conditionsFor(card, breakdown, portal), net: value + credits + bonus - card.annualFee };
      })
      .sort((a, b) => b.net - a.net);
  }, [spend, portal, utilization, includeBonus, brand, scope, wallet.cards, values]);

  const totalMonthly = Object.values(spend).reduce((a, b) => a + b, 0);
  const max = Math.max(1, ...results.map((r) => r.net));

  return (
    <div className="bg-canvas">
      <div className="container-page grid gap-8 py-10 lg:grid-cols-[360px_1fr]">
        <aside className="panel h-fit space-y-6 p-6 lg:sticky lg:top-28 lg:max-h-[calc(100dvh-8rem)] lg:overflow-y-auto lg:overscroll-contain">
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
            <label className="flex items-start gap-2 text-sm font-medium text-ink">
              <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-brand)]" checked={brand} onChange={(e) => setBrand(e.target.checked)} />
              <span>
                My flights and hotels are with the card&apos;s own airline or hotel chain
                <span className="block text-xs font-normal text-ink-3">Co-brand bonuses (United&apos;s 5x on United purchases, say) count only then.</span>
              </span>
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
                {r.conditions.length > 0 && (
                  <ul className="mt-3 space-y-0.5 border-t border-line pt-2 text-xs text-ink-3 sm:pl-11">
                    {r.conditions.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
          <p className="flex gap-2 text-xs leading-relaxed text-ink-3">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Points are valued at {MEDIAN_SOURCE}, or at your own value from the tracker&apos;s Points tab; cash back counts at face
            value. Estimates ignore spending caps beyond those noted on each card. A rate that holds only for some purchases says
            so under its card, and a co-brand airline or hotel bonus counts only when you tick that your spending is with that
            brand. Credits are counted at face value × your utilization (benefits paid in points at their point value). Real
            results depend on how you redeem.
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * The conditions behind a card's estimate, for the categories with spending: "Flights at 1x: the 5x is for United
 * purchases only" when a co-brand bonus isn't counted, else "Flights at 5x: United purchases only".
 */
function conditionsFor(card: Card, breakdown: { cat: SpendCategory; rate: number }[], portal: boolean): string[] {
  return breakdown.flatMap(({ cat, rate }) => {
    const condition = rateCondition(card, cat, portal);
    if (!condition) return [];
    const label = SPEND_CATEGORIES.find((c) => c.id === cat)?.label ?? cat;
    const full = rateFor(card, cat, portal);
    if (rate < full) {
      return isBrandOnly(card, cat)
        ? [`${label} at ${rateLabel(card, rate)}: the ${rateLabel(card, full)} is for ${condition.replace(/ only$/, "")} only`]
        : [`${label} at ${rateLabel(card, rate)}: ${condition}, and another category earns more for your spending`];
    }
    return [`${label} at ${rateLabel(card, full)}: ${condition}`];
  });
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
