import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHero } from "@/components/page-hero";
import { CompareView } from "./compare-view";

export const metadata: Metadata = {
  title: "Compare cards",
  description: "Compare annual fees, earning rates, statement credits and lounge access side by side.",
};

export default function ComparePage() {
  return (
    <>
      <PageHero
        eyebrow="Compare"
        title="Side by side, line by line"
        subtitle="Pick up to four cards. The best value in each row is highlighted."
      />
      <Suspense fallback={<div className="container-page py-16"><div className="panel h-96 animate-pulse bg-canvas" /></div>}>
        <CompareView />
      </Suspense>
    </>
  );
}
