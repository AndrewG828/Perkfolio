import type { Metadata } from "next";
import { Suspense } from "react";
import { ToolHero, ToolSkeleton } from "@/frontend/features/tools/tool-hero";
import { DistanceCalculator } from "@/frontend/features/tools/distance-calculator";

export const metadata: Metadata = {
  title: "Flight distance calculator",
  description:
    "Great-circle distance and estimated flight time for any route, with up to three stops, the extra distance versus nonstop, and a map.",
};

export default function DistancePage() {
  return (
    <>
      <ToolHero
        eyebrow="Flight distance"
        title="How far is your trip?"
        subtitle="Great-circle miles for every leg, how much farther your stops make it, and a rough flight time. Handy for distance-based award charts."
      />
      <Suspense fallback={<ToolSkeleton />}>
        <DistanceCalculator />
      </Suspense>
    </>
  );
}
