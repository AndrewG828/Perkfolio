import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHero } from "@/frontend/components/page-hero";
import { Calculator } from "@/frontend/features/calculator/calculator";

export const metadata: Metadata = {
  title: "Value calculator",
  description: "Enter your yearly spending and see which credit card earns you the most after its annual fee.",
};

export default function CalculatorPage() {
  return (
    <>
      <PageHero
        eyebrow="Value calculator"
        title="Which card actually pays you the most?"
        subtitle="Tell us roughly what you spend. We estimate rewards, add the credits you'd realistically use, and subtract the fee."
      />
      <Suspense fallback={<div className="container-page py-10"><div className="panel h-96 animate-pulse bg-canvas" /></div>}>
        <Calculator />
      </Suspense>
    </>
  );
}
