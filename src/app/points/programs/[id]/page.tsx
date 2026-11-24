import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { ArrowUpRight, Check, Sparkles, TriangleAlert } from "lucide-react";
import { awardPrograms, getProgram } from "@/shared/data/points";
import { PointsHero } from "@/frontend/features/points/points-hero";
import { ProgramAccess, ProgramSources, ProgramSweetSpots } from "@/frontend/features/points/program-detail";
import { AllianceBadge, PRICING, ProgramMark, SURCHARGES, formatDate, hostOf } from "@/frontend/features/points/ui";

export function generateStaticParams() {
  return awardPrograms.map((p) => ({ id: p.id }));
}

export async function generateMetadata({ params }: PageProps<"/points/programs/[id]">): Promise<Metadata> {
  const { id } = await params;
  const program = getProgram(id);
  if (!program) return {};
  return { title: program.name, description: program.summary };
}

export default async function ProgramPage({ params }: PageProps<"/points/programs/[id]">) {
  const { id } = await params;
  const program = getProgram(id);
  if (!program) notFound();

  const facts: [string, ReactNode][] = [
    ["Points", program.currency],
    ["Pricing", <Fact key="p" label={PRICING[program.pricing].label} detail={PRICING[program.pricing].detail} />],
    program.partnerSurcharges
      ? ["Partner surcharges", <Fact key="s" label={SURCHARGES[program.partnerSurcharges].label} detail={SURCHARGES[program.partnerSurcharges].detail} />]
      : ["Type", program.kind === "hotel" ? "Hotel loyalty program" : "Airline loyalty program"],
    program.kind === "airline" ? ["Alliance", program.alliance ?? "Not in an alliance"] : ["Run by", program.owner],
  ];

  return (
    <>
      <PointsHero
        back={{ href: "/points/programs", label: "All programs" }}
        eyebrow={program.kind === "hotel" ? "Hotel program" : "Airline program"}
        title={program.name}
        mark={<ProgramMark program={program} size="lg" onDark />}
        subtitle={`Run by ${program.owner}. Earns ${program.currency}.`}
      >
        <div className="flex flex-wrap gap-2">
          {program.kind === "airline" && <AllianceBadge alliance={program.alliance} onDark />}
          <span className="inline-flex items-center rounded-full bg-white/12 px-2.5 py-0.5 text-xs font-semibold text-white ring-1 ring-white/25">
            {PRICING[program.pricing].label}
          </span>
          {program.partnerSurcharges && (
            <span className="inline-flex items-center rounded-full bg-white/12 px-2.5 py-0.5 text-xs font-semibold text-white ring-1 ring-white/25">
              {SURCHARGES[program.partnerSurcharges].label}
            </span>
          )}
        </div>
      </PointsHero>

      <div className="container-page grid gap-10 py-12 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-14">
        <div className="min-w-0 space-y-12">
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

          <section aria-labelledby="pros-cons" className="grid gap-5 md:grid-cols-2">
            <h2 id="pros-cons" className="sr-only">
              Strengths and watch-outs
            </h2>
            <div className="panel p-5">
              <h3 className="flex items-center gap-2 font-semibold text-navy">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-success/10 text-success">
                  <Check className="h-4 w-4" aria-hidden />
                </span>
                Strengths
              </h3>
              <ul className="mt-4 space-y-2.5 text-sm text-ink">
                {program.strengths.map((s) => (
                  <li key={s} className="flex gap-2.5">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
                    {s}
                  </li>
                ))}
              </ul>
            </div>
            <div className="panel p-5">
              <h3 className="flex items-center gap-2 font-semibold text-navy">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-warn/10 text-warn">
                  <TriangleAlert className="h-4 w-4" aria-hidden />
                </span>
                Watch out for
              </h3>
              <ul className="mt-4 space-y-2.5 text-sm text-ink">
                {program.watchOuts.map((s) => (
                  <li key={s} className="flex gap-2.5">
                    <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warn" aria-hidden />
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section id="earn" aria-labelledby="earn-title" className="scroll-mt-28">
            <h2 id="earn-title" className="mb-5 text-2xl font-semibold tracking-tight text-navy">
              How to get {program.currency}
            </h2>
            <ProgramSources program={program} />
          </section>

          {program.perks && program.perks.length > 0 && (
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
              Sweet spots with {program.name}
            </h2>
            <ProgramSweetSpots program={program} />
          </section>
        </div>

        <aside className="space-y-5 lg:sticky lg:top-28 lg:self-start">
          <ProgramAccess program={program} />
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
            <p className="mt-4 border-t border-line pt-3 text-xs text-ink-3">Last verified {formatDate(program.lastVerified)}.</p>
          </div>
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
