import type { Metadata } from "next";
import { PageHero } from "@/frontend/components/page-hero";
import { TrackerView } from "@/frontend/features/tracker/tracker-view";

export const metadata: Metadata = {
  title: "Benefits tracker",
  description: "Track every statement credit across your cards and see what expires next.",
};

export default function TrackerPage() {
  return (
    <>
      <PageHero
        eyebrow="Benefits tracker"
        title="Your wallet, fully accounted for"
        subtitle="Log credits as you use them. We reset each one on its own schedule — monthly, quarterly, semi-annually or yearly."
      />
      <TrackerView />
    </>
  );
}
