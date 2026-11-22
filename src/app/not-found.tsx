import Link from "next/link";

export default function NotFound() {
  return (
    <div className="container-page flex flex-col items-center py-24 text-center">
      <p className="eyebrow">404</p>
      <h1 className="mt-2 text-3xl font-semibold text-navy">We couldn&apos;t find that page</h1>
      <p className="mt-3 text-ink-2">The card or page you&apos;re looking for may have moved.</p>
      <Link href="/cards" className="btn-primary mt-8">Explore cards</Link>
    </div>
  );
}
