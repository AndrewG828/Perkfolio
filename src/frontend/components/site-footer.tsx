import Link from "next/link";
import { Logo } from "./logo";

const COLUMNS = [
  {
    title: "Lounges & travel",
    links: [
      { href: "/lounges", label: "Lounge finder" },
      { href: "/start", label: "Start here" },
      { href: "/tools/distance", label: "Flight distance" },
      { href: "/tools/baggage", label: "Baggage fees" },
      { href: "/tools/entry-requirements", label: "Entry requirements" },
      { href: "/tools/hotel-points", label: "Hotel points" },
    ],
  },
  {
    title: "Points & miles",
    links: [
      { href: "/points", label: "Overview" },
      { href: "/points/sweet-spots", label: "Sweet spots" },
      { href: "/points/transfers", label: "Transfer partners" },
      { href: "/points/programs", label: "Programs" },
      { href: "/points/airlines", label: "Who can book" },
      { href: "/points/booking-rules", label: "Booking rules" },
    ],
  },
  {
    title: "Cards",
    links: [
      { href: "/cards", label: "Explore cards" },
      { href: "/compare", label: "Compare cards" },
      { href: "/best-card", label: "Which card should I use?" },
      { href: "/next-card", label: "Your next card" },
      { href: "/calculator", label: "Value calculator" },
      { href: "/tracker", label: "Benefits tracker" },
    ],
  },
  {
    title: "Perkfolio",
    links: [
      { href: "/about", label: "About our data" },
      { href: "/about#methodology", label: "Point valuations" },
      { href: "/about#points-data", label: "Sources & photo credits" },
      { href: "/about#disclaimer", label: "Disclaimer" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="mt-auto bg-navy text-white">
      <div className="container-page grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-[1.4fr_repeat(4,1fr)]">
        <div className="space-y-4">
          <Logo inverted />
          <p className="max-w-xs text-sm leading-relaxed text-white/70">
            Track every credit, find every lounge, and know exactly which card in your wallet is paying for itself.
          </p>
        </div>
        {COLUMNS.map((col) => (
          <div key={col.title}>
            <h3 className="mb-4 text-sm font-semibold tracking-wide text-white">{col.title}</h3>
            <ul className="space-y-2.5">
              {col.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-sm text-white/70 hover:text-white hover:underline">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-white/10">
        <div className="container-page py-6 text-xs leading-relaxed text-white/55">
          Perkfolio is an independent tool and is not affiliated with, endorsed by, or sponsored by any card issuer.
          Card names, trademarks and card images belong to their respective issuers and are used for identification only. Terms change frequently — always confirm
          current offers, fees and benefits on the issuer&apos;s website before applying. Not financial advice.
        </div>
      </div>
    </footer>
  );
}
