import type { Metadata } from "next";
import { PageHero } from "@/components/page-hero";
import { Calculator } from "./calculator";

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
      <Calculator />
    </>
  );
}
