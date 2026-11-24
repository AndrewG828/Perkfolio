import type { Metadata } from "next";
import { Suspense } from "react";
import { PointsHero } from "@/frontend/features/points/points-hero";
import { SweetSpotBrowser, SweetSpotExplorer } from "@/frontend/features/points/sweet-spot-explorer";

export const metadata: Metadata = {
  title: "Award sweet spots",
  description: "Award redemptions where points go furthest, filtered by destination and cabin, matched to the cards you hold.",
};

export default function SweetSpotsPage() {
  return (
    <>
      <PointsHero
        eyebrow="Points & Miles"
        title="Award sweet spots"
        subtitle="Redemptions where points stretch furthest. Filter by where you want to go, then see which ones your cards can book and how."
      />
      <div className="bg-canvas">
        <div className="container-page py-10">
          {/* The fallback is the full, unfiltered list, so the page is complete before the URL filters apply. */}
          <Suspense fallback={<SweetSpotBrowser />}>
            <SweetSpotExplorer />
          </Suspense>
        </div>
      </div>
    </>
  );
}
