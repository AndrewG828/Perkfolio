import type { Metadata } from "next";
import { PageHero } from "@/components/page-hero";
import { ImportWallet } from "./import-wallet";

export const metadata: Metadata = { title: "Import your wallet", robots: { index: false } };

export default function ImportPage() {
  return (
    <>
      <PageHero eyebrow="Welcome back" title="Bring your wallet along" subtitle="We found cards you saved at Perkfolio's old address." />
      <ImportWallet />
    </>
  );
}
