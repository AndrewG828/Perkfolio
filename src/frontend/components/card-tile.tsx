import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { Card } from "@/shared/data/types";
import { categoryLabels, rateLabel } from "@/shared/data/cards";
import { usd } from "@/shared/lib/format";
import { CardArt } from "./card-art";
import { WalletButton } from "./wallet-button";
import { CompareToggle } from "./compare-toggle";
import { CreditsPerYear } from "./credits-per-year";

export function CardTile({ card }: { card: Card }) {
  // The base rate shows too when it's more than 1x (Double Cash's 2%, Venture X's 2x) or the card has no bonus
  // categories (Active Cash): for a flat-rate card it's the whole point.
  const showBase = card.baseRate > 1 || card.earnRates.length === 0;
  const topRates = card.earnRates.slice(0, showBase ? 2 : 3);
  return (
    <article className="panel group flex flex-col overflow-hidden transition-shadow hover:shadow-[var(--shadow-lift)]">
      <Link href={`/cards/${card.id}`} className="flex justify-center bg-gradient-to-b from-canvas to-white px-8 pt-8 pb-6">
        <CardArt card={card} className="transition-transform duration-300 group-hover:-translate-y-1" />
      </Link>
      <div className="flex flex-1 flex-col gap-4 px-6 pb-6">
        <div>
          <p className="text-xs font-medium text-ink-3">
            {card.issuer} · {categoryLabels[card.category]}
          </p>
          <h3 className="mt-1 text-lg leading-snug font-semibold text-navy">
            <Link href={`/cards/${card.id}`} className="hover:text-brand">
              {card.name}
            </Link>
          </h3>
        </div>
        <dl className="grid grid-cols-2 gap-3 border-y border-line py-3 text-sm">
          <div>
            <dt className="text-xs text-ink-3">Annual fee</dt>
            <dd className="font-semibold text-ink">{card.annualFee === 0 ? "$0" : usd(card.annualFee)}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-3">Credits / yr</dt>
            <dd className="font-semibold text-ink">
              <CreditsPerYear cardId={card.id} />
            </dd>
          </div>
        </dl>
        <ul className="space-y-1.5 text-sm text-ink-2">
          {topRates.map((r) => (
            <li key={r.category} className="flex gap-2">
              <span className="w-10 shrink-0 font-semibold text-brand">{rateLabel(card, r.multiplier)}</span>
              <span className="line-clamp-1">{r.category}</span>
            </li>
          ))}
          {showBase && (
            <li className="flex gap-2">
              <span className="w-10 shrink-0 font-semibold text-brand">{rateLabel(card, card.baseRate)}</span>
              <span className="line-clamp-1">{card.earnRates.length ? "Everything else" : "Every purchase"}</span>
            </li>
          )}
        </ul>
        <p className="line-clamp-2 text-sm text-ink-2">
          <span className="font-semibold text-ink">Welcome offer: </span>
          {card.welcomeOffer}
        </p>
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
          <Link href={`/cards/${card.id}`} className="btn-primary">
            View details <ChevronRight className="h-4 w-4" />
          </Link>
          <WalletButton cardId={card.id} compact />
          <CompareToggle cardId={card.id} />
        </div>
      </div>
    </article>
  );
}
