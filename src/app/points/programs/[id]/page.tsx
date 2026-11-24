import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, BedDouble, Check, Info, Sparkles, TriangleAlert } from "lucide-react";
import {
  bookingRulesOf,
  hasProgramPage,
  hotelRoutesInto,
  hotelRuleOf,
  programList,
  programName as nameOf,
  programRef,
  type ProgramRef,
} from "@/shared/data/points";
import { hotelLimits, hotelMilesFor } from "@/shared/lib/points";
import { num } from "@/shared/lib/format";
import { PointsHero } from "@/frontend/features/points/points-hero";
import { PlanTransferLink, ProgramAccess, ProgramSources, ProgramSweetSpots } from "@/frontend/features/points/program-detail";
import { ProgramAirlines } from "@/frontend/features/points/program-airlines";
import { BookingRulesPanel } from "@/frontend/features/points/booking-rules";
import { PointValuePanel } from "@/frontend/features/points/point-value";
import {
  AllianceBadge,
  PRICING,
  ProgramMark,
  SURCHARGES,
  SourceList,
  formatAsOf,
  formatDate,
  hostOf,
  hotelRatio,
} from "@/frontend/features/points/ui";

// An unknown id must answer 404 on its first request too: wait for the complete static page (which calls notFound())
// instead of streaming the route's shell with a 200 first (ISR with Cache Components serves unlisted params that way).
export const ensureStatic = "navigation";

export function generateStaticParams() {
  return programList.map((p) => ({ id: p.id }));
}

export async function generateMetadata({ params }: PageProps<"/points/programs/[id]">): Promise<Metadata> {
  const { id } = await params;
  if (!hasProgramPage(id)) return { title: "Page not found" };
  const ref = programRef(id);
  return {
    title: ref.name,
    description: ref.guide?.summary ?? `How to get ${ref.name} points by transferring bank points, and the airlines it books.`,
  };
}

export default async function ProgramPage({ params }: PageProps<"/points/programs/[id]">) {
  const { id } = await params;
  if (!hasProgramPage(id)) notFound();
  const ref = programRef(id);
  const program = ref.guide;
  const rules = bookingRulesOf(id);
  const hotelRows = hotelRoutesInto(id);
  const airline = ref.kind === "airline";
  const facts: [string, ReactNode][] = program
    ? [
        ["Points", program.currency],
        ["Pricing", <Fact key="p" label={PRICING[program.pricing].label} detail={PRICING[program.pricing].detail} />],
        program.partnerSurcharges
          ? ["Partner surcharges", <Fact key="s" label={SURCHARGES[program.partnerSurcharges].label} detail={SURCHARGES[program.partnerSurcharges].detail} />]
          : ["Type", program.kind === "hotel" ? "Hotel loyalty program" : "Airline loyalty program"],
        program.kind === "airline" ? ["Alliance", program.alliance ?? "Not in an alliance"] : ["Run by", program.owner],
      ]
    : [];

  return (
    <>
      <PointsHero
        back={{ href: "/points/programs", label: "All programs" }}
        eyebrow={airline ? "Airline program" : "Hotel program"}
        title={ref.name}
        mark={<ProgramMark program={ref} size="lg" onDark />}
        subtitle={program ? `Run by ${program.owner}. Earns ${program.currency}.` : `The transfers into ${ref.name} and the airlines it books.`}
      >
        <div className="flex flex-wrap gap-2">
          {airline && <AllianceBadge alliance={ref.alliance} onDark />}
          {program && (
            <span className="inline-flex items-center rounded-full bg-white/12 px-2.5 py-0.5 text-xs font-semibold text-white ring-1 ring-white/25">
              {PRICING[program.pricing].label}
            </span>
          )}
          {program?.partnerSurcharges && (
            <span className="inline-flex items-center rounded-full bg-white/12 px-2.5 py-0.5 text-xs font-semibold text-white ring-1 ring-white/25">
              {SURCHARGES[program.partnerSurcharges].label}
            </span>
          )}
        </div>
      </PointsHero>

      <div className="container-page grid gap-10 py-12 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-14">
        <div className="min-w-0 space-y-12">
          {program ? (
            <>
              <section aria-label="Overview" className="space-y-6">
                <p className="max-w-3xl text-lg leading-relaxed text-ink-2">{program.summary}</p>
                <dl className="grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2">
                  {facts.map(([k, v]) => (
                    <div key={k} className="bg-white p-4">
                      <dt className="text-xs text-ink-3">{k}</dt>
                      <dd className="mt-1 font-semibold text-ink">{v}</dd>
                    </div>
                  ))}
                </dl>
              </section>

              <section aria-labelledby="pros-cons" className={program.watchOuts.length > 0 ? "grid gap-5 md:grid-cols-2" : "grid gap-5"}>
                <h2 id="pros-cons" className="sr-only">
                  {program.watchOuts.length > 0 ? "Strengths and watch-outs" : "Strengths"}
                </h2>
                <ListPanel title="Strengths" items={program.strengths} tone="success" />
                {program.watchOuts.length > 0 && <ListPanel title="Watch out for" items={program.watchOuts} tone="warn" />}
              </section>
            </>
          ) : (
            <p className="panel flex gap-3 p-5 text-sm leading-relaxed text-ink-2">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-ink-3" aria-hidden />
              <span>
                No program guide yet: we only publish pricing, strengths and watch-outs once they&apos;re verified. The transfers,
                airlines and conversion rates below are verified.
              </span>
            </p>
          )}

          <section id="earn" aria-labelledby="earn-title" className="scroll-mt-28">
            <h2 id="earn-title" className="mb-5 text-2xl font-semibold tracking-tight text-navy">
              How to get {program?.currency ?? `${ref.name} points`}
            </h2>
            <ProgramSources program={ref} />
            {hotelRows.length > 0 && <HotelInto program={ref} />}
          </section>

          {airline && (
            <section id="airlines" aria-labelledby="airlines-title" className="scroll-mt-28">
              <h2 id="airlines-title" className="mb-5 text-2xl font-semibold tracking-tight text-navy">
                Airlines you can book with {ref.name}
              </h2>
              <ProgramAirlines program={ref} />
            </section>
          )}

          {airline && (
            <section id="booking-rules" aria-labelledby="rules-title" className="scroll-mt-28">
              <h2 id="rules-title" className="mb-5 text-2xl font-semibold tracking-tight text-navy">
                Booking rules
              </h2>
              {rules ? (
                <BookingRulesPanel rules={rules} programName={ref.name} />
              ) : (
                <p className="panel p-5 text-sm text-ink-2">
                  We haven&apos;t confirmed the booking rules for {ref.name} yet.{" "}
                  <Link href="/points/booking-rules" className="link">
                    Compare the programs we have
                  </Link>
                </p>
              )}
            </section>
          )}

          {program?.perks && program.perks.length > 0 && (
            <section aria-labelledby="perks-title">
              <h2 id="perks-title" className="mb-5 text-2xl font-semibold tracking-tight text-navy">
                Perks
              </h2>
              <ul className="grid gap-3 sm:grid-cols-2">
                {program.perks.map((p) => (
                  <li key={p} className="flex gap-3 text-sm text-ink">
                    <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden />
                    {p}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section id="sweet-spots" aria-labelledby="spots-title" className="scroll-mt-28">
            <h2 id="spots-title" className="mb-5 text-2xl font-semibold tracking-tight text-navy">
              Sweet spots with {ref.name}
            </h2>
            <ProgramSweetSpots program={ref} />
          </section>
        </div>

        <aside className="aside-sticky space-y-5">
          <ProgramAccess program={ref} />
          <PointValuePanel id={ref.id} name={ref.name} />
          <PlanTransferLink program={ref} />
          {program && (
            <div className="panel p-5 text-sm">
              <h2 className="font-semibold text-navy">Official links</h2>
              <ul className="mt-3 space-y-2">
                <li>
                  <a href={program.officialUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-brand hover:underline">
                    {program.name} site <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                  </a>
                  <span className="block text-xs text-ink-3">{hostOf(program.officialUrl)}</span>
                </li>
                {program.chartUrl && (
                  <li>
                    <a href={program.chartUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-brand hover:underline">
                      Award chart <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                    </a>
                    <span className="block text-xs text-ink-3">{hostOf(program.chartUrl)}</span>
                  </li>
                )}
              </ul>
              <div className="mt-4 space-y-2 border-t border-line pt-3 text-xs text-ink-3">
                <p>Guide last verified {formatDate(program.lastVerified)}.</p>
                <SourceList urls={program.sources} label="Guide sources" />
              </div>
            </div>
          )}
        </aside>
      </div>
    </>
  );
}

function Fact({ label, detail }: { label: string; detail: string }) {
  return (
    <>
      {label}
      <span className="mt-0.5 block text-sm font-normal text-ink-2">{detail}</span>
    </>
  );
}

function ListPanel({ title, items, tone }: { title: string; items: string[]; tone: "success" | "warn" }) {
  const Icon = tone === "success" ? Check : TriangleAlert;
  return (
    <div className="panel p-5">
      <h3 className="flex items-center gap-2 font-semibold text-navy">
        <span className={tone === "success" ? "grid h-7 w-7 place-items-center rounded-full bg-success/10 text-success" : "grid h-7 w-7 place-items-center rounded-full bg-warn/10 text-warn"}>
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        {title}
      </h3>
      <ul className="mt-4 space-y-2.5 text-sm text-ink">
        {items.map((s) => (
          <li key={s} className="flex gap-2.5">
            <Icon className={tone === "success" ? "mt-0.5 h-4 w-4 shrink-0 text-success" : "mt-0.5 h-4 w-4 shrink-0 text-warn"} aria-hidden />
            {s}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Hotel programs that convert into this airline, with what 60,000 hotel points become. */
function HotelInto({ program }: { program: ProgramRef }) {
  const rows = [...hotelRoutesInto(program.id)].sort((a, b) => hotelMilesFor(b, 60_000) - hotelMilesFor(a, 60_000));
  return (
    <div className="mt-6">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold tracking-wide text-ink-3 uppercase">
        <BedDouble className="h-4 w-4" aria-hidden /> Convert hotel points
      </h3>
      <ul className="panel divide-y divide-line">
        {rows.map((r) => {
          // The row's own minimum, else the hotel's general one (Hilton converts from 10,000 points).
          const minimum = hotelLimits(r, hotelRuleOf(r.from)).minimum;
          return (
          <li key={r.from} className="flex flex-wrap items-start justify-between gap-3 p-4 text-sm">
            <span className="min-w-0 flex-1">
              <Link href={`/points/programs/${r.from}`} className="font-semibold text-ink hover:text-brand">
                {nameOf(r.from)}
              </Link>
              <span className="block text-ink-2">
                {num(60_000)} points → {num(hotelMilesFor(r, 60_000))} {program.currency ?? "miles"}
                {r.bonusMilesPer60k ? ` (includes ${num(r.bonusMilesPer60k)} bonus)` : ""}
                {minimum ? ` · from ${num(minimum)} points` : ""}
              </span>
              {r.notes && <span className="mt-1 block text-xs text-ink-3">{r.notes}</span>}
            </span>
            <span className="shrink-0 text-right">
              <span className="block font-semibold text-ink tabular-nums">{hotelRatio(r)}</span>
              <span className="block text-xs text-ink-3">as of {formatAsOf(r.asOf)}</span>
            </span>
          </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs text-ink-3">
        Hotel conversions are slow and usually poor value; see{" "}
        <Link href="/points/transfers#hotel-points" className="link">
          each hotel&apos;s rules
        </Link>
        .
      </p>
    </div>
  );
}
