import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHero } from "@/frontend/components/page-hero";
import { LoungeFinder } from "@/frontend/features/lounges/lounge-finder";

export const metadata: Metadata = {
  title: "Lounge finder",
  description: "Search any airport and see which lounges your credit cards unlock — Centurion, Sapphire, Capital One, Priority Pass and more.",
};

export default function LoungesPage() {
  return (
    <>
      <PageHero
        eyebrow="Lounge finder"
        title="Every lounge your cards unlock"
        subtitle="Search by airport code or city. We match each lounge against the cards in your wallet — or any card you choose."
      />
      <Suspense fallback={<div className="container-page py-16"><div className="panel h-64 animate-pulse bg-canvas" /></div>}>
        <LoungeFinder />
      </Suspense>
    </>
  );
}
