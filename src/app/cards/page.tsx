import type { Metadata } from "next";
import { Suspense } from "react";
import { cards } from "@/shared/data/cards";
import { CardTile } from "@/frontend/components/card-tile";
import { CompareTray } from "@/frontend/components/compare-toggle";
import { PageHero } from "@/frontend/components/page-hero";
import { CardBrowser } from "@/frontend/features/cards/card-browser";

export const metadata: Metadata = {
  title: "Explore cards",
  description: "Browse and filter the most popular rewards credit cards by issuer, category and annual fee.",
};

export default function CardsPage() {
  return (
    <>
      <PageHero
        eyebrow="Explore cards"
        title="Find the card that fits how you spend"
        subtitle="Filter by issuer, category and annual fee. Every card lists its credits, multipliers and lounge access."
      />
      <div className="container-page py-10">
        <Suspense
          fallback={
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {cards.map((c) => (
                <CardTile key={c.id} card={c} />
              ))}
            </div>
          }
        >
          <CardBrowser />
        </Suspense>
      </div>
      <CompareTray />
    </>
  );
}
