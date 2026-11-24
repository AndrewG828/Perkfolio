import type { Metadata } from "next";
import { Suspense } from "react";
import { ToolHero, ToolSkeleton } from "@/frontend/features/tools/tool-hero";
import { EntryRequirements } from "@/frontend/features/tools/entry-requirements";

export const metadata: Metadata = {
  title: "Entry requirements for U.S. passport holders",
  description:
    "Visa-free stays, electronic travel authorizations, e-visas and visas by destination for U.S. citizens, with recent changes and transit rules.",
};

export default function EntryRequirementsPage() {
  return (
    <>
      <ToolHero
        eyebrow="Entry requirements"
        title="Do I need a visa?"
        subtitle="What U.S. passport holders need to visit, by destination: visa-free stays, travel authorizations, e-visas and visas."
      />
      <Suspense fallback={<ToolSkeleton sidebar={false} />}>
        <EntryRequirements />
      </Suspense>
    </>
  );
}
