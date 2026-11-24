import type { Metadata } from "next";
import { PageHero } from "@/frontend/components/page-hero";
import { NextCardView } from "@/frontend/features/next-card/next-card-view";

export const metadata: Metadata = {
  title: "Your next card",
  description: "Check issuer rules like Chase 5/24 against your card history and see which cards you can get next, ranked by first-year value.",
};

export default function NextCardPage() {
  return (
    <>
      <PageHero
        eyebrow="Next card"
        title="What should you apply for next?"
        subtitle="We check issuer rules like Chase 5/24 against your card history, then rank the cards you can get by what the first year is worth."
      />
      <NextCardView />
    </>
  );
}
