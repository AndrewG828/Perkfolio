import type { Metadata } from "next";
import { MoveHandoff } from "@/frontend/features/move/move-handoff";

export const metadata: Metadata = { title: "Moving to the new address", robots: { index: false } };

export default function MovePage() {
  return (
    <div className="container-page py-24 text-center">
      <h1 className="text-2xl font-semibold text-navy">Perkfolio has a new address</h1>
      <p className="mt-3 text-ink-2">Taking you to perkfolio-app.vercel.app…</p>
      <MoveHandoff />
    </div>
  );
}
