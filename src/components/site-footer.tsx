import Link from "next/link";
import { Logo } from "./logo";

const COLUMNS = [
  {
    title: "Cards",
    links: [
      { href: "/cards?category=premium-travel", label: "Premium travel" },
      { href: "/cards?category=travel", label: "Travel rewards" },
      { href: "/cards?category=cash-back", label: "Cash back" },
      { href: "/cards?category=airline", label: "Airline & hotel" },
      { href: "/cards?category=business", label: "Business" },
    ],
  },
  {
    title: "Tools",
    links: [
      { href: "/compare", label: "Compare cards" },
      { href: "/tracker", label: "Benefits tracker" },
      { href: "/lounges", label: "Lounge finder" },
      { href: "/calculator", label: "Value calculator" },
    ],
  },
  {
    title: "Perkfolio",
    links: [
      { href: "/about", label: "About our data" },
      { href: "/about#methodology", label: "Point valuations" },
      { href: "/about#disclaimer", label: "Disclaimer" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="mt-auto bg-navy text-white">
      <div className="container-page grid gap-10 py-14 md:grid-cols-[1.4fr_repeat(3,1fr)]">
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
          Card names and trademarks belong to their respective owners. Terms change frequently — always confirm
          current offers, fees and benefits on the issuer&apos;s website before applying. Not financial advice.
        </div>
      </div>
    </footer>
  );
}
