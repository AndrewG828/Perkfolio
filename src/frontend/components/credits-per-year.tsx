"use client";

import { getCard } from "@/shared/data/cards";
import { useValueContext } from "@/frontend/state/point-values";
import { usd } from "@/shared/lib/format";
import { annualizedCredits } from "@/shared/lib/point-value";

/**
 * "$510": a card's credits a year (every-4-years credits spread over four), or "—" when it has none. Benefits paid in
 * points (Venture X's anniversary miles) count at the one point value (shared/lib/point-value.ts): the published
 * median on the server, the visitor's own value once their preferences load.
 */
export function CreditsPerYear({ cardId }: { cardId: string }) {
  const values = useValueContext();
  const card = getCard(cardId);
  if (!card) return null;
  const total = annualizedCredits(card, values);
  return <>{total > 0 ? usd(total) : "—"}</>;
}
