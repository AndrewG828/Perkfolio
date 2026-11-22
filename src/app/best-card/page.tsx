import type { Metadata } from "next";
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
        subtitle="Pick what you're buying. We rank the cards in your wallet by what they actually return, using our point valuations."
      />
      <BestCardPicker />
    </>
  );
}
