import type { Metadata } from "next";
import { Suspense } from "react";
import { ToolHero, ToolSkeleton } from "@/frontend/features/tools/tool-hero";
import { HotelPointsCalculator } from "@/frontend/features/tools/hotel-points";

export const metadata: Metadata = {
  title: "Hotel points calculator",
  description:
    "Hotel points, card points and their value for a paid stay at Marriott, Hilton, Hyatt or IHG, with brand exceptions and elite bonuses.",
};

export default function HotelPointsPage() {
  return (
    <>
      <ToolHero
        eyebrow="Hotel points"
        title="What will this stay earn?"
        subtitle="Hotel points, card points and what they're worth for a paid stay, with lower-earning brands and elite bonuses counted."
      />
      <Suspense fallback={<ToolSkeleton />}>
        <HotelPointsCalculator />
      </Suspense>
    </>
  );
}
