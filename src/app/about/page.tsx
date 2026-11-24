import type { Metadata } from "next";
import { cards } from "@/shared/data/cards";
import { programForCard } from "@/shared/data/strategy/programs";
import { valuations as outletValuations } from "@/shared/data/strategy/valuations";
import { PageHero } from "@/frontend/components/page-hero";
import { formatMonth } from "@/shared/lib/dates";
import { valuationOf } from "@/shared/lib/trackers";

export const metadata: Metadata = {
  title: "About our data",
  description: "How Perkfolio researches card terms and values points.",
};

/** "2¢", "0.73¢" */
const cents = (c: number) => `${Number(c.toFixed(3))}¢`;

export default function AboutPage() {
  // One row per rewards currency the cards earn: the outlets' median (what welcome offers, balances and the
  // next-card ranking use) and the card files' own estimate (what the earning tools use).
  const valuations = Array.from(
    cards
      .filter((c) => !/cash/i.test(c.rewardsCurrency))
      .reduce((m, c) => {
        const program = programForCard(c);
        return m.set(c.rewardsCurrency, { median: program ? valuationOf(program)?.median : undefined, earning: c.pointValueCents });
      }, new Map<string, { median?: number; earning: number }>()),
  ).sort((a, b) => (b[1].median ?? b[1].earning) - (a[1].median ?? a[1].earning));
  const outlets = Object.values(outletValuations.datasets).map((d) => d.outlet);
  const outletList = `${outlets.slice(0, -1).join(", ")} and ${outlets[outlets.length - 1]}`;
  const edition = formatMonth(Object.values(outletValuations.datasets)[0]?.edition ?? outletValuations.verified.slice(0, 7));

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
              Welcome offers, your points balances, the next-card ranking and redemption comparisons value points at the
              median of the {edition} cents-per-point figures from {outletList}, or at your own value if you set one on the
              Points tab. The Points tab shows each outlet&apos;s figure, the range and the month of its table.
            </p>
            <p>
              The earning calculator, Compare and the Which Card? tool use our own estimates, set for realistic redemptions (transfer
              partners for flexible currencies, typical award prices for airline and hotel programs) rather than best-case
              ones. The table lists both. Cash-back cards are valued at face value. Statement credits are shown at face value;
              use the calculator&apos;s utilization slider or the tracker to see what you actually capture.
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
            <thead className="text-left text-xs text-ink-3">
              <tr>
                <th className="px-5 pt-3 pb-1 font-medium">Currency</th>
                <th className="px-2 pt-3 pb-1 text-right font-medium">
                  Median <span className="block font-normal">{edition}</span>
                </th>
                <th className="py-1 pt-3 pr-5 pl-2 text-right font-medium">
                  Earning <span className="block font-normal">estimate</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {valuations.map(([currency, v]) => (
                <tr key={currency}>
                  <td className="px-5 py-3 text-ink">{currency}</td>
                  <td className="px-2 py-3 text-right font-semibold text-navy">{v.median !== undefined ? cents(v.median) : "—"}</td>
                  <td className="py-3 pr-5 pl-2 text-right text-ink-2">{cents(v.earning)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-line px-5 py-3 text-xs leading-relaxed text-ink-3">
            Median: the middle of {outletList}&apos;s {edition} figures, used for welcome offers, balances and the next-card
            ranking. Earning estimate: used by the calculator, Compare and the Which Card? tool.
          </p>
        </aside>
      </div>
    </>
  );
}
