import type { Metadata } from "next";
import { Suspense } from "react";
import { PointsHero } from "@/frontend/features/points/points-hero";
import { ProgramDirectory, ProgramDirectoryExplorer } from "@/frontend/features/points/program-directory";

export const metadata: Metadata = {
  title: "Airline & hotel programs",
  description: "Guides to airline and hotel loyalty programs: how they price awards, where their points come from and what to watch out for.",
};

export default function ProgramsPage() {
  return (
    <>
      <PointsHero
        eyebrow="Points & Miles"
        title="Airline and hotel programs"
        subtitle="How each program prices awards, which bank points transfer in, and what to watch out for before you book."
      />
      <div className="bg-canvas">
        <div className="container-page py-10">
          <Suspense fallback={<ProgramDirectory />}>
            <ProgramDirectoryExplorer />
          </Suspense>
        </div>
      </div>
    </>
  );
}
