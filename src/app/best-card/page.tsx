import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHero } from "@/frontend/components/page-hero";
import { BestCardPicker } from "@/frontend/features/best-card/best-card-picker";

export const metadata: Metadata = {
  title: "Which card should I use?",
  description: "Pick what you're buying and see which card in your wallet earns the most on it.",
};

export default function BestCardPage() {
  return (
    <>
      <PageHero
        eyebrow="Which card?"
        title="Use the right card every time"
        subtitle="Pick what you're buying. We rank the cards in your wallet by what they actually return, with points valued at the published median or your own value."
      />
      <Suspense fallback={<div className="container-page py-10"><div className="panel h-96 animate-pulse bg-canvas" /></div>}>
        <BestCardPicker />
      </Suspense>
    </>
  );
}
