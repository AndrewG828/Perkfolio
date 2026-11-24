import type { Metadata } from "next";
import { Suspense } from "react";
import { ToolHero } from "@/frontend/features/tools/tool-hero";
import { StartWizard } from "@/frontend/features/start/start-wizard";

export const metadata: Metadata = {
  title: "Start here",
  description: "A few one-tap questions about your points, cards or trip, then the right Perkfolio tools with your answers filled in.",
};

export default function StartPage() {
  return (
    <>
      <ToolHero
        compact
        eyebrow="Start here"
        title="What would you like to do?"
        subtitle="Answer a couple of one-tap questions and we'll take you to the right tools, already filled in."
      />
      <Suspense
        fallback={
          <div className="bg-canvas">
            <div className="container-page grid gap-4 py-12 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="panel h-44 animate-pulse bg-white" />
              ))}
            </div>
          </div>
        }
      >
        <StartWizard />
      </Suspense>
    </>
  );
}
