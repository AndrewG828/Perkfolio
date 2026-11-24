import Link from "next/link";
import { Logo } from "./logo";
import { FOOTER_COLUMNS } from "./site-nav";

export function SiteFooter() {
  return (
    <footer className="mt-auto bg-navy text-white">
      <div className="container-page grid grid-cols-2 gap-x-6 gap-y-10 py-14 lg:grid-cols-[1.4fr_repeat(4,1fr)]">
        <div className="col-span-2 space-y-4 lg:col-span-1">
          <Logo inverted />
          <p className="max-w-xs text-sm leading-relaxed text-white/70">
            Find every lounge your cards open, track every credit and point, and know which card in your wallet is paying for itself.
          </p>
        </div>
        {FOOTER_COLUMNS.map((col) => (
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
