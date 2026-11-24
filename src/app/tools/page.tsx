import type { Metadata } from "next";
import { ToolHero } from "@/frontend/features/tools/tool-hero";
import { ToolsIndex } from "@/frontend/features/tools/tools-index";

export const metadata: Metadata = {
  title: "Tools",
  description:
    "Every Perkfolio tool: lounge finder, flight distance, entry requirements, baggage fees, hotel points, award sweet spots, card picker and more.",
};

export default function ToolsPage() {
  return (
    <>
      <ToolHero
        back={null}
        eyebrow="Tools"
        title="Everything for your next trip and your cards"
        subtitle="Calculators and lookups built on data we check against official sources. Free, no sign-up, and your wallet stays on your device."
      />
      <ToolsIndex />
    </>
  );
}
