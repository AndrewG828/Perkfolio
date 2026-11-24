import Link from "next/link";
import { ArrowRight, CalendarClock, Luggage, Plane, type LucideIcon } from "lucide-react";
import { cards, featuredCards, annualizedCreditValue } from "@/shared/data/cards";
import { lounges } from "@/shared/data/lounges";
import { sweetSpots } from "@/shared/data/points";
import { CardArt } from "@/frontend/components/card-art";
import { CardTile } from "@/frontend/components/card-tile";
import { CompareTray } from "@/frontend/components/compare-toggle";
import { cn, usd } from "@/shared/lib/format";
import { bigAirports, loungeCountByAirport, loungesAt } from "@/shared/lib/lounge-directory";
import { loungeNetworks } from "@/shared/data/networks";
import { AirportSearch } from "@/frontend/features/lounges/airport-search";
import { WalletLoungeSummary } from "@/frontend/features/lounges/wallet-lounge-summary";

type Section = { href: string; icon: LucideIcon; title: string; body: string; links: { href: string; label: string }[] };

/** After the lounges: one compact row into the site's other sections. */
const SECTIONS: Section[] = [
  {
    href: "/points",
    icon: Plane,
    title: "Points & Miles",
    body: `Where your card points transfer, and ${sweetSpots.length} award sweet spots worth spending them on.`,
    links: [
      { href: "/points/sweet-spots", label: "Sweet spots" },
      { href: "/points/transfers", label: "Transfers" },
      { href: "/points/airlines", label: "Who can book" },
    ],
  },
  {
    href: "/tracker",
    icon: CalendarClock,
    title: "Benefits tracker",
    body: "Statement credits, points balances and certificates, with a reminder before each one lapses.",
    links: [
      { href: "/tracker?tab=points", label: "Points balances" },
      { href: "/tracker?tab=certificates", label: "Certificates" },
      { href: "/tracker?tab=applications", label: "Card history" },
    ],
  },
  {
    href: "/tools",
    icon: Luggage,
    title: "Travel tools",
    body: "Flight distances, bag fees, entry rules for U.S. passports and what a hotel stay earns.",
    links: [
      { href: "/tools/distance", label: "Flight distance" },
      { href: "/tools/baggage", label: "Bag fees" },
      { href: "/tools/entry-requirements", label: "Entry rules" },
    ],
  },
];

const CARD_TOOLS = [
  { href: "/compare", label: "Compare cards" },
  { href: "/best-card", label: "Which card to use" },
  { href: "/next-card", label: "Your next card" },
  { href: "/calculator", label: "Value calculator" },
];

export default function Home() {
  const hero = featuredCards.slice(0, 3);
  const totalCredits = cards.reduce((s, c) => s + annualizedCreditValue(c), 0);
  const airportCount = new Set(lounges.map((l) => l.airportCode)).size;

  return (
    <>
      {/* Hero (overflow-x-clip, not hidden, so the airport search dropdown can extend below it) */}
      <section className="relative z-10 overflow-x-clip bg-navy text-white">
        <div
          className="absolute inset-0 opacity-90"
          style={{
            background:
              "radial-gradient(80% 120% at 85% 10%, #0a5fc2 0%, transparent 60%), radial-gradient(60% 80% at 10% 100%, #0a2472 0%, transparent 70%)",
          }}
        />
        <div className="container-page relative grid items-center gap-12 py-16 md:py-24 lg:grid-cols-[1.1fr_1fr]">
          <div className="space-y-7">
            <p className="text-xs font-semibold tracking-[0.18em] text-white/70 uppercase">Airport lounge finder</p>
            <h1 className="max-w-xl text-4xl leading-[1.08] font-semibold tracking-tight md:text-[56px]">
              Every lounge your cards get you into.
            </h1>
            <p className="max-w-lg text-lg leading-relaxed text-white/80">
              Search an airport for a terminal map of its Centurion, Sapphire, Capital One, Sky Club and Priority Pass
              lounges, matched against the cards in your wallet. Plus a tracker so your card credits never go unused.
            </p>
            <div className="max-w-lg space-y-3">
              <AirportSearch size="lg" />
              <div className="flex flex-wrap gap-2">
                {bigAirports.slice(0, 8).map((a) => (
                  <Link
                    key={a.code}
                    href={`/lounges/${a.code}`}
                    className="rounded-full border border-white/30 px-3 py-1 text-sm font-medium text-white/90 hover:border-white hover:text-white"
                  >
                    {a.code}
                  </Link>
                ))}
              </div>
              <WalletLoungeSummary />
            </div>
          </div>
          <div className="relative mx-auto h-[300px] w-full max-w-[480px] sm:h-[340px]">
            {hero.map((card, i) => (
              <Link
                key={card.id}
                href={`/cards/${card.id}`}
                className="absolute left-1/2 w-[78%] transition-transform duration-500 hover:z-10 hover:-translate-y-3"
                style={{
                  top: `${i * 18}%`,
                  transform: `translateX(-${50 + (1 - i) * 12}%) rotate(${(i - 1) * 6}deg)`,
                  zIndex: 3 - i,
                }}
              >
                <CardArt card={card} size="lg" className="shadow-[0_24px_60px_-20px_rgba(0,0,0,0.7)]" />
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Stat strip */}
      <section className="border-b border-line bg-white">
        <div className="container-page grid grid-cols-2 divide-line py-8 text-center md:grid-cols-4 md:divide-x">
          {[
            [String(lounges.length), "lounges mapped"],
            [String(airportCount), "airports covered"],
            [String(bigAirports.length), "terminal maps"],
            [usd(Math.round(totalCredits / 1000) * 1000), "in card credits tracked"],
          ].map(([v, l]) => (
            <div key={l} className="px-4 py-2">
              <p className="text-3xl font-semibold text-navy">{v}</p>
              <p className="mt-1 text-sm text-ink-2">{l}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Airport maps */}
      <section className="py-16 md:py-20">
        <div className="container-page">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div className="max-w-2xl">
              <p className="eyebrow">Terminal maps</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-navy">The big airports, mapped</h2>
              <p className="mt-3 text-ink-2">See where each lounge is, gate by gate, and which ones your cards open.</p>
            </div>
            <Link href="/lounges" className="btn-secondary">
              All {airportCount} airports <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {bigAirports.slice(0, 12).map((a) => (
              <Link key={a.code} href={`/lounges/${a.code}`} className="panel flex flex-col gap-2 p-4 transition-shadow hover:shadow-[var(--shadow-lift)]">
                <span className="text-2xl font-semibold text-navy">{a.code}</span>
                <span className="truncate text-sm text-ink-2">{a.city}</span>
                <span className="flex items-center gap-1">
                  {Array.from(new Set(loungesAt(a.code).map((l) => l.network))).map((n) => (
                    <span key={n} className="h-2 w-2 rounded-full" style={{ background: loungeNetworks[n].color }} />
                  ))}
                  <span className="ml-auto text-xs text-ink-3">{loungeCountByAirport[a.code]}</span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* The other sections, in one row */}
      <section aria-labelledby="more-sections" className="border-y border-line bg-canvas py-12 md:py-14">
        <div className="container-page">
          <p className="eyebrow">Beyond the lounge</p>
          <h2 id="more-sections" className="mt-2 text-2xl font-semibold tracking-tight text-navy">
            Points, credits and trip planning
          </h2>
          <ul className="mt-6 grid gap-4 lg:grid-cols-3">
            {SECTIONS.map((s) => (
              <li key={s.href} className="panel group relative flex flex-col gap-3 p-4 transition-shadow hover:shadow-[var(--shadow-lift)] sm:p-5">
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-sky text-brand">
                    <s.icon className="h-5 w-5" aria-hidden />
                  </span>
                  <h3 className="text-lg font-semibold text-navy">
                    <Link href={s.href} className="after:absolute after:inset-0 after:rounded-lg group-hover:text-brand focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-brand">
                      {s.title}
                    </Link>
                  </h3>
                  <ArrowRight className="ml-auto h-4 w-4 text-brand transition-transform group-hover:translate-x-1" aria-hidden />
                </div>
                <p className="text-sm leading-relaxed text-ink-2">{s.body}</p>
                <ul className="relative z-10 mt-auto flex flex-wrap gap-1.5" aria-label={`In ${s.title}`}>
                  {s.links.map((l) => (
                    <li key={l.href}>
                      <Link href={l.href} className="chip px-2.5 hover:border-brand hover:text-brand">
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Featured cards */}
      <section className="py-16 md:py-20">
        <div className="container-page">
          <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
            <div className="max-w-2xl">
              <p className="eyebrow">Most popular</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-navy">The cards everyone is talking about</h2>
              <p className="mt-3 text-ink-2">Premium travel cards with the richest credits and lounge access.</p>
              <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm" aria-label="Card tools">
                {CARD_TOOLS.map((t) => (
                  <li key={t.href}>
                    <Link href={t.href} className="link inline-flex items-center gap-1">
                      {t.label} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <Link href="/cards" className="btn-secondary">
              View all {cards.length} cards <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {featuredCards.map((card, i) => (
              // Three on phones, where each tile fills the screen.
              <div key={card.id} className={cn("grid", i >= 3 && "max-sm:hidden")}>
                <CardTile card={card} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA band */}
      <section className="bg-brand text-white">
        <div className="container-page flex flex-col items-start justify-between gap-6 py-12 md:flex-row md:items-center">
          <div>
            <h2 className="text-2xl font-semibold">Is your annual fee paying for itself?</h2>
            <p className="mt-2 text-white/85">Add your cards and see credits captured vs. fees paid, year to date.</p>
          </div>
          <Link href="/tracker" className="btn-light px-6 py-3">
            Build my wallet <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
      <CompareTray />
    </>
  );
}
