import type { Metadata } from "next";
import { Suspense } from "react";
import { PointsHero } from "@/frontend/features/points/points-hero";
import { BookingRulesExplorer, BookingRulesMatrix } from "@/frontend/features/points/booking-rules-matrix";

export const metadata: Metadata = {
  title: "Award booking rules",
  description:
    "Holds, stopovers, phone and partner fees, change and cancel rules, booking windows and fuel surcharges for each airline program, side by side.",
};

export default function BookingRulesPage() {
  return (
    <>
      <PointsHero
        eyebrow="Points & Miles"
        title="Award booking rules"
        subtitle="Holds, stopovers, fees, change rules, how far ahead you can book and who adds fuel surcharges, compared across airline programs. Anything no source confirmed is marked, never guessed."
      />
      <div className="bg-canvas">
        <div className="container-page py-10">
          {/* The fallback is the full, unfiltered matrix, so the page is complete before the URL filters apply. */}
          <Suspense fallback={<BookingRulesMatrix />}>
            <BookingRulesExplorer />
          </Suspense>
        </div>
      </div>
    </>
  );
}
