import type { Metadata } from "next";
import { Suspense } from "react";
import { PointsHero } from "@/frontend/features/points/points-hero";
import { AirlineFinder, AirlineFinderLive } from "@/frontend/features/points/airline-finder";

export const metadata: Metadata = {
  title: "Who can book which airline",
  description: "Pick an airline and see which loyalty programs can book its award seats, the restrictions, and which of your bank points get you there.",
};

export default function AirlinesPage() {
  return (
    <>
      <PointsHero
        eyebrow="Points & Miles"
        title="Who can book it?"
        subtitle="Pick the airline you want to fly to see every program that sells its award seats, what to watch for, and which of your bank points reach each one."
      />
      <div className="bg-canvas">
        <div className="container-page py-10">
          <Suspense fallback={<AirlineFinder />}>
            <AirlineFinderLive />
          </Suspense>
        </div>
      </div>
    </>
  );
}
