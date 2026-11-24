"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Info, Trophy } from "lucide-react";
import type { Card } from "@/shared/data/types";
import { cards, getCard } from "@/shared/data/cards";
import { SPEND_CATEGORIES, rateCondition, rateFor, type SpendCategory } from "@/shared/data/calculator-rates";
import { CardArt } from "@/frontend/components/card-art";
import { Meter } from "@/frontend/components/meter";
import { useHydrated, useWallet, type WalletState } from "@/frontend/state/wallet-store";
import { useValueContext } from "@/frontend/state/point-values";
import { limitPeriod, limitsFor, tallyKey } from "@/shared/lib/limits";
import { cardPointValue, formatCents, MEDIAN_SOURCE, returnPercent, type CardPointValue } from "@/shared/lib/point-value";
import { cn } from "@/shared/lib/format";

/** "3% cash back", or "3x × 2¢ per point" (a card whose transfers another card unlocks earns points, not cash). */
const returnText = (rate: number, v: CardPointValue) => (v.basis === "cash" ? `${rate}% cash back` : `${rate}x × ${formatCents(v.cents)} per point`);

const CAT_MATCH: Partial<Record<SpendCategory, RegExp>> = {
  dining: /restaurant|dining/i,
  groceries: /supermarket|grocer/i,
  gas: /\bgas\b/i,
  flights: /flight|air/i,
};

/** If the user has logged spend past this card's cap for the category, the bonus no longer applies. */
function capReached(card: Card, cat: SpendCategory, wallet: WalletState, now: Date): boolean {
  const re = CAT_MATCH[cat];
  if (!re) return false;
  return limitsFor(card).some(
    (l) => l.kind === "spend" && re.test(l.label) && (wallet.tally?.[tallyKey(card.id, l.id, limitPeriod(l, now).key)] ?? 0) >= l.limit,
  );
}

export function BestCardPicker() {
  const hydrated = useHydrated();
  const wallet = useWallet();
  // ?category=groceries (from Start here) picks the category to start on.
  const params = useSearchParams();
  const [cat, setCat] = useState<SpendCategory>(() => SPEND_CATEGORIES.find((c) => c.id === params.get("category"))?.id ?? "dining");
  const [portal, setPortal] = useState(false);
  const values = useValueContext();
  const owned = wallet.cards.map(getCard).filter((c): c is Card => Boolean(c));
  const [scopeChoice, setScope] = useState<"wallet" | "all" | null>(null);
  const scope = scopeChoice ?? (owned.length ? "wallet" : "all");

  const ranked = useMemo(() => {
    const pool = scope === "wallet" ? owned : cards.filter((c) => c.category !== "business");
    return pool
      .map((card) => {
        const capped = scope === "wallet" && capReached(card, cat, wallet, new Date());
        const rate = capped ? card.baseRate : rateFor(card, cat, portal);
        // Return in percent: the earn rate × what a point is worth (3x at 2¢ = 6%); cash-back rates are already percent.
        // A rate that holds only for some purchases (one airline or hotel brand, a choice, a tier) says so on its row.
        const only = capped ? null : rateCondition(card, cat, portal);
        return { card, rate, value: cardPointValue(card, values), pct: returnPercent(card, rate, values), capped, only };
      })
      .filter((r) => r.rate > 0)
      .sort((a, b) => b.pct - a.pct)
      .slice(0, scope === "wallet" ? 50 : 10);
  }, [owned, scope, cat, portal, wallet, values]);

  const best = ranked[0]?.pct ?? 1;
  const catLabel = SPEND_CATEGORIES.find((c) => c.id === cat)?.label ?? "";

  return (
    <div className="bg-canvas">
      <div className="container-page space-y-6 py-10">
        <div className="panel space-y-5 p-5">
          <div>
            <p className="mb-2 text-sm font-semibold text-ink">What are you buying?</p>
            <div className="flex flex-wrap gap-2">
              {SPEND_CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setCat(c.id)}
                  className={cn("chip cursor-pointer px-4 py-2 text-sm", cat === c.id && "border-brand bg-sky text-brand")}
                  aria-pressed={cat === c.id}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-line pt-4 text-sm">
            <div className="flex gap-1 rounded-md bg-canvas p-1" role="radiogroup" aria-label="Cards to compare">
              {(
                [
                  ["wallet", `My wallet${hydrated ? ` (${owned.length})` : ""}`],
                  ["all", "All cards"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  role="radio"
                  aria-checked={scope === id}
                  onClick={() => setScope(id)}
                  className={cn("rounded px-3 py-1.5 font-medium", scope === id ? "bg-white text-brand shadow-sm" : "text-ink-2")}
                >
                  {label}
                </button>
              ))}
            </div>
            {["flights", "hotels", "otherTravel"].includes(cat) && (
              <label className="flex items-center gap-2 font-medium text-ink">
                <input type="checkbox" className="h-4 w-4 accent-[var(--color-brand)]" checked={portal} onChange={(e) => setPortal(e.target.checked)} />
                Booking through the card&apos;s travel portal
              </label>
            )}
          </div>
        </div>

        {scope === "wallet" && hydrated && owned.length === 0 ? (
          <div className="panel p-10 text-center text-ink-2">
            Your wallet is empty. <Link href="/tracker" className="link">Add your cards</Link> or switch to All cards.
          </div>
        ) : (
          <ol className="space-y-3" aria-label={`Best cards for ${catLabel}`}>
            {ranked.map(({ card, rate, value, pct, capped, only }, i) => (
              <li key={card.id} className={cn("panel flex flex-wrap items-center gap-5 p-5", i === 0 && "ring-2 ring-brand")}>
                <CardArt card={card} size="sm" />
                <div className="min-w-[200px] flex-1">
                  {i === 0 && (
                    <p className="eyebrow mb-1 flex items-center gap-1">
                      <Trophy className="h-3.5 w-3.5" /> Use this card
                    </p>
                  )}
                  <Link href={`/cards/${card.id}`} className="font-semibold text-navy hover:text-brand">
                    {card.name}
                  </Link>
                  <Meter className="mt-2 max-w-md" value={pct} max={best} tone="brand" label={`${card.name} return on ${catLabel}`} />
                </div>
                <div className="text-right">
                  <p className="text-2xl font-semibold text-navy">{pct.toFixed(1)}%</p>
                  <p className="text-xs text-ink-3">
                    {returnText(rate, value)}
                    {value.basis === "own" ? " (your value)" : ""}
                  </p>
                  {capped && <p className="text-xs font-semibold text-warn">Bonus cap reached this year</p>}
                  {only && <p className="mt-0.5 max-w-[16rem] text-xs font-medium text-warn">{only}</p>}
                </div>
              </li>
            ))}
          </ol>
        )}
        <p className="flex gap-2 text-xs leading-relaxed text-ink-3">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Return = earn rate × what a point is worth: {MEDIAN_SOURCE}, or your own value from the tracker&apos;s Points tab
          (cash back at face value). A rate marked in orange holds only for some purchases (one airline or hotel brand,
          a category you pick, a tier); anything else earns the card&apos;s base rate. Check the Caps &amp; allowances
          section of your tracker — once a bonus category&apos;s cap is reached, that card drops to its base rate.
        </p>
      </div>
    </div>
  );
}
