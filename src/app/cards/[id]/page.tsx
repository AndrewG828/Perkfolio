import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, Check, ChevronLeft, Info, Plane } from "lucide-react";
import { annualizedCreditValue, cards, categoryLabels, getCard, rateLabel } from "@/shared/data/cards";
import { loungeNetworks } from "@/shared/data/networks";
import { CardArt } from "@/frontend/components/card-art";
import { WalletButton } from "@/frontend/components/wallet-button";
import { CardTransferPartners } from "@/frontend/features/points/card-transfer-partners";
import { CardValueNote } from "@/frontend/features/points/point-value";
import { frequencyLabel, frequencyShort } from "@/shared/lib/periods";
import { usd } from "@/shared/lib/format";

export function generateStaticParams() {
  return cards.map((c) => ({ id: c.id }));
}

export async function generateMetadata({ params }: PageProps<"/cards/[id]">): Promise<Metadata> {
  const { id } = await params;
  const card = getCard(id);
  if (!card) return {};
  return { title: card.name, description: card.tagline };
}

export default async function CardPage({ params }: PageProps<"/cards/[id]">) {
  const { id } = await params;
  const card = getCard(id);
  if (!card) notFound();

  const credits = annualizedCreditValue(card);
  const earn = card.earnRates;
  const similar = cards
    .filter((c) => c.id !== card.id && c.category === card.category)
    .slice(0, 3)
    .map((c) => c.id);

  return (
    <>
      <section className="border-b border-line bg-gradient-to-b from-canvas to-white">
        <div className="container-page py-6">
          <Link href="/cards" className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline">
            <ChevronLeft className="h-4 w-4" /> All cards
          </Link>
        </div>
        <div className="container-page grid items-center gap-10 pb-12 md:grid-cols-[minmax(0,420px)_1fr] lg:gap-16">
          <div className="flex justify-center">
            <CardArt card={card} size="lg" />
          </div>
          <div className="space-y-6">
            <div>
              <p className="eyebrow">
                {card.issuer} · {categoryLabels[card.category]}
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-navy md:text-4xl">{card.name}</h1>
              <p className="mt-3 max-w-xl text-lg text-ink-2">{card.tagline}</p>
            </div>
            <div className="panel border-l-4 border-l-brand p-5">
              <p className="text-xs font-semibold tracking-wide text-ink-3 uppercase">Welcome offer</p>
              <p className="mt-1 text-lg font-semibold text-navy">{card.welcomeOffer}</p>
              {card.welcomeOfferValue > 0 && (
                <p className="mt-1 text-sm text-ink-2">Worth about {usd(card.welcomeOfferValue)} by our valuation.</p>
              )}
            </div>
            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-4">
              {[
                ["Annual fee", card.annualFee === 0 ? "$0" : usd(card.annualFee)],
                ["Credits / yr", credits > 0 ? usd(credits) : "—"],
                ["Rewards", card.rewardsCurrency.replace(/ points| miles/i, "")],
                ["Foreign fees", card.foreignTransactionFee ? "Yes" : "None"],
              ].map(([k, v]) => (
                <div key={k} className="bg-white p-4">
                  <dt className="text-xs text-ink-3">{k}</dt>
                  <dd className="mt-1 truncate font-semibold text-ink" title={v}>
                    {v}
                  </dd>
                </div>
              ))}
            </dl>
            <div className="flex flex-wrap gap-3">
              <WalletButton cardId={card.id} />
              <Link href={`/compare?cards=${[card.id, ...similar].slice(0, 3).join(",")}`} className="btn-secondary">
                Compare with similar
              </Link>
              <a href={card.url} target="_blank" rel="noopener noreferrer" className="btn-ghost">
                Issuer site <ArrowUpRight className="h-4 w-4" />
              </a>
            </div>
          </div>
        </div>
      </section>

      <div className="container-page grid gap-10 py-12 lg:grid-cols-[1fr_340px]">
        <div className="space-y-12">
          <Section title="Earning rewards" id="rewards">
            <div className="panel divide-y divide-line">
              {earn.map((r) => (
                <div key={r.category} className="flex items-start gap-5 p-5">
                  <span className="w-16 shrink-0 text-2xl font-semibold text-brand">{rateLabel(card, r.multiplier)}</span>
                  <div>
                    <p className="font-medium text-ink">{r.category}</p>
                    {r.cap && <p className="mt-0.5 text-sm text-ink-3">{r.cap}</p>}
                  </div>
                </div>
              ))}
              <div className="flex items-start gap-5 p-5">
                <span className="w-16 shrink-0 text-2xl font-semibold text-ink-2">{rateLabel(card, card.baseRate)}</span>
                <p className="font-medium text-ink">All other eligible purchases</p>
              </div>
            </div>
            <CardValueNote card={card} />
          </Section>

          {card.credits.length > 0 && (
            <Section title="Statement credits & annual benefits" id="credits">
              <div className="panel overflow-hidden">
                <table className="w-full text-left text-sm">
                  <thead className="bg-canvas text-xs tracking-wide text-ink-3 uppercase">
                    <tr>
                      <th className="px-5 py-3 font-semibold">Benefit</th>
                      <th className="hidden px-5 py-3 font-semibold sm:table-cell">Cadence</th>
                      <th className="px-5 py-3 text-right font-semibold">Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {card.credits.map((c) => (
                      <tr key={c.id} className="align-top">
                        <td className="px-5 py-4">
                          <p className="font-semibold text-ink">{c.name}</p>
                          <p className="mt-1 text-ink-2">{c.description}</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {c.enrollmentRequired && <span className="chip border-warn/30 bg-warn/5 text-warn">Enrollment required</span>}
                            {c.note && <span className="chip">{c.note}</span>}
                          </div>
                        </td>
                        <td className="hidden px-5 py-4 whitespace-nowrap text-ink-2 sm:table-cell">{frequencyLabel[c.frequency]}</td>
                        <td className="px-5 py-4 text-right whitespace-nowrap">
                          <p className="font-semibold text-navy">{usd(c.annualValue)}</p>
                          {c.frequency !== "annual" && c.frequency !== "one-time" && (
                            <p className="text-xs text-ink-3">
                              {usd(c.amountPerPeriod)}
                              {frequencyShort[c.frequency]}
                            </p>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          {card.loungeAccess.length > 0 && (
            <Section title="Airport lounge access" id="lounges">
              <div className="grid gap-4 sm:grid-cols-2">
                {card.loungeAccess.map((l) => {
                  const net = loungeNetworks[l.network];
                  return (
                    <div key={l.network} className="panel flex gap-4 p-5">
                      <span className="mt-1 h-10 w-1.5 shrink-0 rounded-full" style={{ background: net.color }} />
                      <div>
                        <p className="font-semibold text-ink">{net.label}</p>
                        <p className="mt-1 text-sm text-ink-2">{l.terms}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
              <Link href={`/lounges?card=${card.id}`} className="btn-secondary mt-5">
                <Plane className="h-4 w-4" /> Find lounges for this card
              </Link>
            </Section>
          )}

          {card.perks.length > 0 && (
            <Section title="Other perks & protections" id="perks">
              <ul className="grid gap-3 sm:grid-cols-2">
                {card.perks.map((p) => (
                  <li key={p} className="flex gap-3 text-sm text-ink">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                    {p}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <CardTransferPartners card={card} />
        </div>

        <aside className="space-y-5 lg:sticky lg:top-28 lg:self-start">
          <div className="panel p-6">
            <h2 className="text-sm font-semibold tracking-wide text-ink-3 uppercase">Value at a glance</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <Row label="Annual credits (face value)" value={usd(credits)} />
              <Row label="Annual fee" value={`−${usd(card.annualFee)}`} />
              <div className="border-t border-line pt-3">
                <Row label="If you use every credit" value={usd(credits - card.annualFee)} strong positive={credits - card.annualFee >= 0} />
              </div>
            </dl>
            <p className="mt-4 flex gap-2 text-xs leading-relaxed text-ink-3">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Face value overstates real value for most people. Use the tracker to see what you actually capture.
            </p>
            <Link href="/calculator" className="btn-primary mt-5 w-full">
              Calculate my value
            </Link>
          </div>
          <div className="panel p-6 text-sm">
            <p className="font-semibold text-ink">Best for</p>
            <p className="mt-1 text-ink-2">{card.bestFor}</p>
            {card.authorizedUserFee && (
              <>
                <p className="mt-4 font-semibold text-ink">Authorized users</p>
                <p className="mt-1 text-ink-2">{card.authorizedUserFee}</p>
              </>
            )}
            <p className="mt-4 text-xs text-ink-3">Terms last verified {new Date(card.lastVerified + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}.</p>
          </div>
        </aside>
      </div>
    </>
  );
}

function Section({ title, id, children }: { title: string; id: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-28">
      <h2 className="mb-5 text-2xl font-semibold tracking-tight text-navy">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, value, strong, positive }: { label: string; value: string; strong?: boolean; positive?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className={strong ? "font-semibold text-ink" : "text-ink-2"}>{label}</dt>
      <dd className={strong ? (positive ? "text-lg font-semibold text-success" : "text-lg font-semibold text-danger") : "font-medium text-ink"}>{value}</dd>
    </div>
  );
}
