import type { Metadata } from "next";
import { cards } from "@/shared/data/cards";
import { PageHero } from "@/frontend/components/page-hero";

export const metadata: Metadata = {
  title: "About our data",
  description: "How Perkfolio researches card terms and values points.",
};

export default function AboutPage() {
  const valuations = Array.from(
    cards
      .filter((c) => !/cash/i.test(c.rewardsCurrency))
      .reduce((m, c) => m.set(c.rewardsCurrency, c.pointValueCents), new Map<string, number>()),
  ).sort((a, b) => b[1] - a[1]);

  return (
    <>
      <PageHero eyebrow="About" title="How we build Perkfolio" subtitle="Independent research, conservative valuations, and your data stays on your device." />
      <div className="container-page grid gap-12 py-12 lg:grid-cols-[1fr_360px]">
        <article className="max-w-3xl space-y-10 text-[15px] leading-relaxed text-ink-2">
          <section className="space-y-3">
            <h2 className="text-2xl font-semibold text-navy">Where the data comes from</h2>
            <p>
              Every card is researched from issuer product pages and cross-checked against recent coverage from established
              points-and-miles publications. Each card shows the date its terms were last verified. Issuers change offers
              frequently — welcome bonuses in particular can vary by applicant and channel — so always confirm on the issuer&apos;s
              site before you apply.
            </p>
          </section>
          <section id="methodology" className="scroll-mt-28 space-y-3">
            <h2 className="text-2xl font-semibold text-navy">How we value points</h2>
            <p>
              We use conservative cents-per-point estimates that reflect realistic redemptions (transfer partners for flexible
              currencies, typical award prices for airline and hotel programs) rather than best-case outliers. Cash-back
              cards are valued at face value. Statement credits are shown at face value; use the calculator&apos;s utilization
              slider or the tracker to see what you actually capture.
            </p>
          </section>
          <section className="space-y-3">
            <h2 className="text-2xl font-semibold text-navy">Your privacy</h2>
            <p>
              Your wallet and benefit usage are stored only in your browser&apos;s local storage. We never ask for card numbers or
              logins. Use Export on the tracker to back up your data or move it to another device.
            </p>
          </section>
          <section id="disclaimer" className="scroll-mt-28 space-y-3">
            <h2 className="text-2xl font-semibold text-navy">Disclaimer</h2>
            <p>
              Perkfolio is an independent tool and is not affiliated with any bank or card network. Card names, trademarks and card
              images belong to their issuers and are used for identification only.
              Nothing here is financial advice.
            </p>
          </section>
        </article>
        <aside className="panel h-fit overflow-hidden">
          <h2 className="border-b border-line px-5 py-4 font-semibold text-navy">Point valuations</h2>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-line">
              {valuations.map(([currency, cents]) => (
                <tr key={currency}>
                  <td className="px-5 py-3 text-ink">{currency}</td>
                  <td className="px-5 py-3 text-right font-semibold text-navy">{cents}¢</td>
                </tr>
              ))}
            </tbody>
          </table>
        </aside>
      </div>
    </>
  );
}
