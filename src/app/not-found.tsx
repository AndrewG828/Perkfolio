import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false },
};

export default function NotFound() {
  return (
    <div className="container-page flex flex-col items-center py-24 text-center">
      <p className="eyebrow">404</p>
      <h1 className="mt-2 text-3xl font-semibold text-navy">We couldn&apos;t find that page</h1>
      <p className="mt-3 text-ink-2">The airport, card or page you&apos;re looking for may have moved.</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href="/lounges" className="btn-primary">
          Find a lounge
        </Link>
        <Link href="/cards" className="btn-secondary">
          Explore cards
        </Link>
        <Link href="/" className="btn-ghost">
          Home
        </Link>
      </div>
    </div>
  );
}
