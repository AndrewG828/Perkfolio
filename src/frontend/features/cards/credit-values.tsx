"use client";

import { getCard } from "@/shared/data/cards";
import type { Card, Credit } from "@/shared/data/types";
import { useValueContext } from "@/frontend/state/point-values";
import { frequencyShort } from "@/shared/lib/periods";
import { usd } from "@/shared/lib/format";
import { annualizedCredits, creditPeriodValue, creditPointsLabel, creditValue } from "@/shared/lib/point-value";

// A card's credits as the visitor would value them: statement credits at face value, benefits paid in points (Venture
// X's anniversary miles) at the one point value (shared/lib/point-value.ts). The server renders the published median;
// the visitor's own values apply once their preferences load, as on every other page. The "Credits / yr" figure is
// frontend/components/credits-per-year.tsx (card tiles show it too).

/** The value column of a credit row: what it's worth a year, the amount each period, and how points are valued. */
export function CreditValueCell({ cardId, creditId }: { cardId: string; creditId: string }) {
  const values = useValueContext();
  const credit = getCard(cardId)?.credits.find((c) => c.id === creditId);
  if (!credit) return null;
  const points = creditPointsLabel(credit, values);
  return (
    <>
      <p className="font-semibold text-navy">{usd(creditValue(credit, values))}</p>
      {credit.frequency !== "annual" && credit.frequency !== "one-time" && (
        <p className="text-xs text-ink-3">
          {usd(creditPeriodValue(credit, values))}
          {frequencyShort[credit.frequency]}
        </p>
      )}
      {points && <p className="text-xs whitespace-normal text-ink-3">{points}</p>}
    </>
  );
}

/** The "Value at a glance" figures: credits a year, the annual fee, and what's left if every credit is used. */
export function ValueAtAGlance({ cardId }: { cardId: string }) {
  const values = useValueContext();
  const card = getCard(cardId);
  if (!card) return null;
  const credits = annualizedCredits(card, values);
  const pointsCredits = card.credits.filter((c) => c.points);
  const net = credits - card.annualFee;
  return (
    <>
      <dl className="mt-4 space-y-3 text-sm">
        <Row label={pointsCredits.length ? "Annual credits" : "Annual credits (face value)"} value={usd(credits)} />
        <Row label="Annual fee" value={`−${usd(card.annualFee)}`} />
        <div className="border-t border-line pt-3">
          <Row label="If you use every credit" value={usd(net)} strong positive={net >= 0} />
        </div>
      </dl>
      {pointsCredits.length > 0 && <p className="mt-3 text-xs leading-relaxed text-ink-3">{pointsNote(card, pointsCredits, values)}</p>}
    </>
  );
}

/** "Statement credits at face value; the 10,000 anniversary bonus miles at 1.8¢ (November 2026 median)." */
function pointsNote(card: Card, pointsCredits: Credit[], values: ReturnType<typeof useValueContext>): string {
  const parts = pointsCredits.map((c) => `the ${c.name.replace(/^\d[\d,]* /, "")} at ${creditPointsLabel(c, values)?.replace(/^[\d,]+ \S+ at /, "") ?? "their point value"}`);
  const hasCash = card.credits.some((c) => !c.points);
  return `${hasCash ? "Statement credits at face value; " : ""}${parts.join("; ")}.`.replace(/^the/, "The");
}

function Row({ label, value, strong, positive }: { label: string; value: string; strong?: boolean; positive?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className={strong ? "font-semibold text-ink" : "text-ink-2"}>{label}</dt>
      <dd className={strong ? (positive ? "text-lg font-semibold text-success" : "text-lg font-semibold text-danger") : "font-medium text-ink"}>{value}</dd>
    </div>
  );
}
