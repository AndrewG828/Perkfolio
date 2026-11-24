import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight } from "lucide-react";
import { awardPrograms, currencies, partnershipCount, sweetSpots } from "@/shared/data/points";
import { PointsHero } from "@/frontend/features/points/points-hero";
import { PostcardStack } from "@/frontend/features/points/postcard-stack";
import { WalletPointsSummary } from "@/frontend/features/points/wallet-points-summary";
import { FeaturedSweetSpots, ProgramPreview } from "@/frontend/features/points/hub-sections";
import { TransferExplorer, TransferExplorerLive } from "@/frontend/features/points/transfer-explorer";
import { DealCalculator } from "@/frontend/features/points/deal-calculator";
import { SectionHeading } from "@/frontend/features/points/ui";

export const metadata: Metadata = {
  title: "Points & Miles",
  description:
    "Where your credit card points transfer, the award sweet spots worth booking, and guides to airline and hotel loyalty programs.",
};

export default function PointsPage() {
  const airlines = awardPrograms.filter((p) => p.kind === "airline").length;
  const hotels = awardPrograms.length - airlines;
  const stats = [
    [String(currencies.length), "bank currencies"],
    [String(airlines), "airline programs"],
    [String(hotels), "hotel programs"],
    [String(sweetSpots.length), "award sweet spots"],
  ];

  return (
    <>
      <PointsHero
        eyebrow="Points & Miles"
        title="Turn your card points into flights and hotel stays"
        subtitle="Where your bank points transfer, the award sweet spots worth booking, and how each airline and hotel program works."
        aside={<PostcardStack />}
      >
        <WalletPointsSummary />
      </PointsHero>

      <section className="border-b border-line bg-white">
        <dl className="container-page grid grid-cols-2 py-6 text-center md:grid-cols-4 md:divide-x md:divide-line">
          {stats.map(([v, l]) => (
            <div key={l} className="flex flex-col-reverse justify-end px-4 py-2">
              <dt className="mt-1 text-sm text-ink-2">{l}</dt>
              <dd className="text-3xl font-semibold text-navy">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="container-page py-14 md:py-16">
        <FeaturedSweetSpots />
      </div>

      <section className="bg-canvas py-14 md:py-16" aria-labelledby="transfers-title">
        <div className="container-page">
          <SectionHeading
            id="transfers-title"
            eyebrow="Transfer partners"
            title="Where your points can go"
            action={
              <Link href="/points/transfers" className="btn-secondary">
                Full transfer chart <ArrowRight className="h-4 w-4" />
              </Link>
            }
          >
            {partnershipCount} transfer partnerships between {currencies.length} bank currencies and {awardPrograms.length} programs.
            Transfers are one-way, so find award space before you move points.
          </SectionHeading>
          <Suspense fallback={<TransferExplorer />}>
            <TransferExplorerLive />
          </Suspense>
        </div>
      </section>

      <section className="py-14 md:py-16" aria-labelledby="programs-title">
        <div className="container-page">
          <SectionHeading
            id="programs-title"
            eyebrow="Program guides"
            title="Airline and hotel programs"
            action={
              <Link href="/points/programs" className="btn-secondary">
                All {awardPrograms.length} programs <ArrowRight className="h-4 w-4" />
              </Link>
            }
          >
            How each program prices awards, where its points come from and what to watch out for.
          </SectionHeading>
          <ProgramPreview />
        </div>
      </section>

      <section className="bg-canvas py-14 md:py-16" aria-labelledby="deal-title">
        <div className="container-page">
          <SectionHeading id="deal-title" eyebrow="Calculator" title="Is this a good deal?">
            Compare an award with the cash price to see what each point is worth, against the conservative values we use for every
            card.
          </SectionHeading>
          <DealCalculator />
        </div>
      </section>
    </>
  );
}
