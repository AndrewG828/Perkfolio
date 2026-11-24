import type { Metadata } from "next";
import { Suspense } from "react";
import { PointsHero } from "@/frontend/features/points/points-hero";
import { TransferChart, TransferChartExplorer } from "@/frontend/features/points/transfer-chart";
import { CurrencyNotes, TransferTips } from "@/frontend/features/points/transfer-notes";

export const metadata: Metadata = {
  title: "Transfer partners",
  description: "Every bank points currency and the airline and hotel programs it transfers to, with ratios, transfer times and minimums.",
};

export default function TransfersPage() {
  return (
    <>
      <PointsHero
        eyebrow="Points & Miles"
        title="Transfer partners"
        subtitle="Where each bank's points transfer, at what ratio and how fast. The currencies your cards earn are highlighted."
      />
      <div className="bg-canvas">
        <div className="container-page space-y-12 py-10">
          <Suspense fallback={<TransferChart />}>
            <TransferChartExplorer />
          </Suspense>
          <TransferTips />
          <CurrencyNotes />
        </div>
      </div>
    </>
  );
}
