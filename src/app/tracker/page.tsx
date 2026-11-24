import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHero } from "@/frontend/components/page-hero";
import { TrackerSkeleton, TrackerView } from "@/frontend/features/tracker/tracker-view";

export const metadata: Metadata = {
  title: "Benefits tracker",
  description: "Track statement credits, points balances, certificates, award redemptions and card applications in one place.",
};

export default function TrackerPage() {
  return (
    <>
      <PageHero
        eyebrow="Benefits tracker"
        title="Your wallet, fully accounted for"
        subtitle="Log credits as you use them, keep points and certificates from expiring, and see what your redemptions were worth."
      />
      <Suspense fallback={<TrackerSkeleton />}>
        <TrackerView />
      </Suspense>
    </>
  );
}
