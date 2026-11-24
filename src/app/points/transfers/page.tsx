import type { Metadata } from "next";
import { Suspense } from "react";
import { PointsHero } from "@/frontend/features/points/points-hero";
import { TransfersExplorer, TransfersView } from "@/frontend/features/points/transfers-view";
import { TransferBonuses } from "@/frontend/features/points/transfer-bonuses";
import { HotelTransfers } from "@/frontend/features/points/hotel-transfers";
import { PartnerChanges } from "@/frontend/features/points/partner-changes";
import { CurrencyNotes, TransferTips } from "@/frontend/features/points/transfer-notes";
import { SectionHeading } from "@/frontend/features/points/ui";

export const metadata: Metadata = {
  title: "Transfer partners",
  description:
    "Every bank points currency and the airline and hotel programs it transfers to, with ratios, transfer times, current bonuses and a planner for the miles you need.",
};

export default function TransfersPage() {
  return (
    <>
      <PointsHero
        eyebrow="Points & Miles"
        title="Transfer partners"
        subtitle="Where each bank's points transfer, at what ratio and how fast, or how to get the miles you need. The currencies your cards earn are highlighted."
      />
      <div className="bg-canvas">
        <div className="container-page space-y-14 py-10">
          <Suspense fallback={<TransfersView />}>
            <TransfersExplorer />
          </Suspense>
          <section id="bonuses" aria-labelledby="bonuses-title" className="scroll-mt-28">
            <SectionHeading id="bonuses-title" eyebrow="Transfer bonuses" title="Bonuses running now">
              Limited-time extra points on a transfer. Each one disappears from this list once it ends; check the source before you
              move points, since some are targeted.
            </SectionHeading>
            <TransferBonuses />
          </section>
          <HotelTransfers />
          <PartnerChanges />
          <TransferTips />
          <CurrencyNotes />
        </div>
      </div>
    </>
  );
}
