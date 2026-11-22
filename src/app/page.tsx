import Link from "next/link";
import { ArrowRight, BarChart3, CalendarClock, Plane, Scale } from "lucide-react";
import { cards, featuredCards, annualizedCreditValue } from "@/shared/data/cards";
import { lounges } from "@/shared/data/lounges";
import { CardArt } from "@/frontend/components/card-art";
import { CardTile } from "@/frontend/components/card-tile";
import { CompareTray } from "@/frontend/components/compare-toggle";
import { usd } from "@/shared/lib/format";

const FEATURES = [
  {
    href: "/tracker",
    icon: CalendarClock,
    title: "Never miss a credit",
    body: "Monthly, quarterly and semi-annual credits in one dashboard, with reminders of what expires next.",
    cta: "Open Benefits Tracker",
  },
  {
    href: "/lounges",
    icon: Plane,
    title: "Find your lounge",
    body: "Search any airport to see Centurion, Sapphire, Capital One, Priority Pass and airline lounges your cards unlock.",
    cta: "Search lounges",
  },
  {
    href: "/compare",
    icon: Scale,
    title: "Compare side by side",
    body: "Fees, multipliers, credits, lounge access and protections — up to four cards at once.",
    cta: "Compare cards",
  },
  {
    href: "/calculator",
    icon: BarChart3,
    title: "Know your net value",
    body: "Enter your spending and see which card actually earns the most after its annual fee.",
    cta: "Run the numbers",
  },
];

export default function Home() {
  const hero = featuredCards.slice(0, 3);
  const totalCredits = cards.reduce((s, c) => s + annualizedCreditValue(c), 0);
  const airportCount = new Set(lounges.map((l) => l.airportCode)).size;

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-navy text-white">
        <div
          className="absolute inset-0 opacity-90"
          style={{
            background:
              "radial-gradient(80% 120% at 85% 10%, #0a5fc2 0%, transparent 60%), radial-gradient(60% 80% at 10% 100%, #0a2472 0%, transparent 70%)",
          }}
        />
        <div className="container-page relative grid items-center gap-12 py-16 md:py-24 lg:grid-cols-[1.1fr_1fr]">
          <div className="space-y-7">
            <p className="text-xs font-semibold tracking-[0.18em] text-white/70 uppercase">Your cards, fully used</p>
            <h1 className="max-w-xl text-4xl leading-[1.08] font-semibold tracking-tight md:text-[56px]">
              Get every dollar your cards promise.
            </h1>
            <p className="max-w-lg text-lg leading-relaxed text-white/80">
              Track statement credits before they reset, find lounges at any airport, and compare the most popular
              rewards cards — all with terms verified for late 2026.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/tracker" className="btn-light px-6 py-3 text-[15px]">
                Start tracking benefits
              </Link>
              <Link href="/cards" className="btn border border-white/60 px-6 py-3 text-[15px] text-white hover:bg-white/10">
                Explore cards
              </Link>
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
            [String(cards.length), "cards researched"],
            [usd(Math.round(totalCredits / 1000) * 1000), "in annual credits tracked"],
            [String(lounges.length), "lounges mapped"],
            [String(airportCount), "airports covered"],
          ].map(([v, l]) => (
            <div key={l} className="px-4 py-2">
              <p className="text-3xl font-semibold text-navy">{v}</p>
              <p className="mt-1 text-sm text-ink-2">{l}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="bg-canvas py-16 md:py-20">
        <div className="container-page">
          <div className="mb-10 max-w-2xl">
            <p className="eyebrow">Tools</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-navy">Everything your wallet needs</h2>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <Link key={f.href} href={f.href} className="panel group flex flex-col gap-4 p-6 transition-shadow hover:shadow-[var(--shadow-lift)]">
                <span className="grid h-11 w-11 place-items-center rounded-full bg-sky text-brand">
                  <f.icon className="h-5 w-5" />
                </span>
                <h3 className="text-lg font-semibold text-navy">{f.title}</h3>
                <p className="text-sm leading-relaxed text-ink-2">{f.body}</p>
                <span className="mt-auto inline-flex items-center gap-1 text-sm font-semibold text-brand">
                  {f.cta} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </span>
              </Link>
            ))}
          </div>
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
            </div>
            <Link href="/cards" className="btn-secondary">
              View all {cards.length} cards <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {featuredCards.map((card) => (
              <CardTile key={card.id} card={card} />
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
