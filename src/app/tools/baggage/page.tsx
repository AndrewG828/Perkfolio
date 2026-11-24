import type { Metadata } from "next";
import { Suspense } from "react";
import { ToolHero, ToolSkeleton } from "@/frontend/features/tools/tool-hero";
import { BaggageLookup } from "@/frontend/features/tools/baggage-lookup";

export const metadata: Metadata = {
  title: "Baggage fee lookup",
  description: "Find an airline's official baggage page, compare U.S. checked-bag fees, and see how bags work on award tickets.",
};

export default function BaggagePage() {
  return (
    <>
      <ToolHero
        eyebrow="Baggage fees"
        title="What will your bags cost?"
        subtitle="Jump to an airline's official baggage page, compare U.S. checked-bag fees, and check the rules for award tickets."
      />
      <Suspense fallback={<ToolSkeleton sidebar={false} />}>
        <BaggageLookup />
      </Suspense>
    </>
  );
}
