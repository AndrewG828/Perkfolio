import type { Metadata } from "next";
import Link from "next/link";
import { cards, isCashBack } from "@/shared/data/cards";
import { pointValueOf, programName, shownPhotos, valuationEditions, type ProgramId } from "@/shared/data/points";
import { cardPageValue, currencyOfCard, valueRelation } from "@/shared/lib/points";
import { PageHero } from "@/frontend/components/page-hero";

export const metadata: Metadata = {
  title: "About our data",
  description: "How Perkfolio researches card terms and values points.",
};

export default function AboutPage() {
  const photos = shownPhotos();
  // Programs whose card-page value is above the outlets' median (World of Hyatt, Hilton Honors): named, not called conservative.
  const above = Array.from(
    new Set(cards.flatMap((c) => {
      const p = currencyOfCard(c);
      return p?.kind === "program" ? [p.program] : [];
    })),
  ).filter((id: ProgramId) => {
    const card = cardPageValue(id);
    const v = pointValueOf(id);
    return card && v && valueRelation(card, v).relation === "above";
  });
  const valuations = Array.from(
    cards
      .filter((c) => !isCashBack(c))
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
          <section id="points-data" className="scroll-mt-28 space-y-3">
            <h2 className="text-2xl font-semibold text-navy">Points &amp; miles data</h2>
            <p>
              Transfer ratios, award prices and program rules in{" "}
              <Link href="/points" className="link">
                Points &amp; Miles
              </Link>{" "}
              come from the banks&apos; and programs&apos; own published partner lists, award charts and terms, cross-checked against
              points-and-miles coverage. Every sweet spot links its sources and shows when it was last checked, and every program and
              currency shows its last-verified date. Where no source confirms a detail (a transfer time, a booking rule, a value) we
              say so instead of guessing. Award prices and partner lists change without notice, so search for space before you
              transfer: transfers can&apos;t be undone.
            </p>
            <p>
              Values per point in Points &amp; Miles are the outlets&apos; own published figures (
              {valuationEditions.map((e, i) => (
                <span key={e.outlet}>
                  {i > 0 ? ", " : ""}
                  <a href={e.url} target="_blank" rel="noopener noreferrer" className="link">
                    {e.outlet}
                  </a>
                </span>
              ))}
              ), with the median used as the deal calculator&apos;s starting point. The card values in the table here are our own
              estimates for comparing cards, most of them below the outlets&apos; medians
              {above.length > 0 ? <> ({above.map((id) => programName(id)).join(" and ")} {above.length === 1 ? "is" : "are"} above)</> : null}; the
              Points &amp; Miles pages show both numbers.
            </p>
            <p>
              Photos are used under their licenses and always credited: each one shows its author and license, linked to the page it
              came from.
            </p>
            {photos.length > 0 && (
              <ul className="space-y-1 text-sm">
                {photos.map((p) => (
                  <li key={p.src}>
                    <a href={p.sourcePage} target="_blank" rel="noopener noreferrer" className="link font-medium">
                      {p.title}
                    </a>{" "}
                    · {p.author} ·{" "}
                    {p.licenseUrl ? (
                      <a href={p.licenseUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                        {p.license}
                      </a>
                    ) : (
                      p.license
                    )}
                  </li>
                ))}
              </ul>
            )}
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
