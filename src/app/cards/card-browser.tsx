"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Search, SlidersHorizontal } from "lucide-react";
import type { CardCategory, Issuer } from "@/data/types";
import { annualizedCreditValue, cards, categoryLabels, issuers } from "@/data/cards";
import { CardTile } from "@/components/card-tile";
import { cn } from "@/lib/format";

type Sort = "popular" | "fee-asc" | "fee-desc" | "credits" | "bonus";
const FEE_BANDS = [
  { id: "any", label: "Any fee", test: () => true },
  { id: "0", label: "$0", test: (f: number) => f === 0 },
  { id: "low", label: "$1–$150", test: (f: number) => f > 0 && f <= 150 },
  { id: "mid", label: "$151–$450", test: (f: number) => f > 150 && f <= 450 },
  { id: "high", label: "$451+", test: (f: number) => f > 450 },
] as const;

export function CardBrowser() {
  const params = useSearchParams();
  const initialCategory = params.get("category") as CardCategory | null;
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CardCategory | "all">(
    initialCategory && initialCategory in categoryLabels ? initialCategory : "all",
  );
  const [issuer, setIssuer] = useState<Issuer | "all">((params.get("issuer") as Issuer) ?? "all");
  const [fee, setFee] = useState<(typeof FEE_BANDS)[number]["id"]>("any");
  const [lounge, setLounge] = useState(false);
  const [sort, setSort] = useState<Sort>("popular");

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const band = FEE_BANDS.find((b) => b.id === fee)!;
    const list = cards.filter(
      (c) =>
        (category === "all" || c.category === category || (category === "airline" && c.category === "hotel")) &&
        (issuer === "all" || c.issuer === issuer) &&
        band.test(c.annualFee) &&
        (!lounge || c.loungeAccess.length > 0) &&
        (!q || `${c.name} ${c.issuer} ${c.rewardsCurrency} ${c.bestFor}`.toLowerCase().includes(q)),
    );
    const sorters: Record<Sort, (a: (typeof cards)[number], b: (typeof cards)[number]) => number> = {
      popular: () => 0,
      "fee-asc": (a, b) => a.annualFee - b.annualFee,
      "fee-desc": (a, b) => b.annualFee - a.annualFee,
      credits: (a, b) => annualizedCreditValue(b) - annualizedCreditValue(a),
      bonus: (a, b) => b.welcomeOfferValue - a.welcomeOfferValue,
    };
    return [...list].sort(sorters[sort]);
  }, [query, category, issuer, fee, lounge, sort]);

  const categories: Array<CardCategory | "all"> = ["all", "premium-travel", "travel", "airline", "cash-back", "business"];

  return (
    <div className="space-y-8">
      <div className="flex gap-2 overflow-x-auto border-b border-line" role="tablist">
        {categories.map((c) => (
          <button
            key={c}
            role="tab"
            aria-selected={category === c}
            onClick={() => setCategory(c)}
            className={cn(
              "relative shrink-0 px-4 pt-2 pb-3 text-[15px] font-medium whitespace-nowrap",
              category === c ? "text-brand" : "text-ink-2 hover:text-ink",
            )}
          >
            {c === "all" ? "All cards" : c === "airline" ? "Airline & hotel" : categoryLabels[c]}
            {category === c && <span className="absolute inset-x-2 bottom-0 h-[3px] rounded-t bg-brand" />}
          </button>
        ))}
      </div>

      <div className="panel flex flex-col gap-4 p-4 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-3" />
          <input
            className="input pl-9"
            placeholder="Search cards, issuers, or rewards (e.g. “Membership Rewards”)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search cards"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <SlidersHorizontal className="hidden h-4 w-4 text-ink-3 md:block" />
          <select className="input w-auto" value={issuer} onChange={(e) => setIssuer(e.target.value as Issuer | "all")} aria-label="Issuer">
            <option value="all">All issuers</option>
            {issuers.map((i) => (
              <option key={i}>{i}</option>
            ))}
          </select>
          <select className="input w-auto" value={fee} onChange={(e) => setFee(e.target.value as typeof fee)} aria-label="Annual fee">
            {FEE_BANDS.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>
          <select className="input w-auto" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort">
            <option value="popular">Sort: Featured</option>
            <option value="credits">Most credits</option>
            <option value="bonus">Biggest welcome offer</option>
            <option value="fee-asc">Annual fee: low to high</option>
            <option value="fee-desc">Annual fee: high to low</option>
          </select>
          <label className="flex items-center gap-2 text-sm font-medium text-ink-2">
            <input type="checkbox" className="h-4 w-4 accent-[var(--color-brand)]" checked={lounge} onChange={(e) => setLounge(e.target.checked)} />
            Lounge access
          </label>
        </div>
      </div>

      <p className="text-sm text-ink-2">
        Showing <span className="font-semibold text-ink">{results.length}</span> of {cards.length} cards
      </p>

      {results.length === 0 ? (
        <div className="panel p-12 text-center text-ink-2">No cards match those filters.</div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((c) => (
            <CardTile key={c.id} card={c} />
          ))}
        </div>
      )}
    </div>
  );
}
