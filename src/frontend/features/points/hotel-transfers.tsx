import Link from "next/link";
import { BedDouble, Info } from "lucide-react";
import { hasProgramPage, hotelRoutesFrom, hotelRuleOf, hotelToAirline, hotelTransferRules, programName, type ProgramId } from "@/shared/data/points";
import { hotelMilesFor } from "@/shared/lib/points";
import { num } from "@/shared/lib/format";
import { SectionHeading, SourceList, formatAsOf, hotelRatio } from "./ui";

// Hotel points converted into airline miles (transfer-extras research). No hooks: rendered on the server.

const EXAMPLE = 60_000;

/** Hotel programs with conversion rows or rules, Marriott (the biggest list) first. */
function hotels(): ProgramId[] {
  const ids = Array.from(new Set([...hotelToAirline.map((r) => r.from), ...hotelTransferRules.map((r) => r.from)]));
  return ids.sort((a, b) => hotelRoutesFrom(b).length - hotelRoutesFrom(a).length || programName(a).localeCompare(programName(b)));
}

export function HotelTransfers() {
  return (
    <section id="hotel-points" aria-labelledby="hotel-points-title" className="scroll-mt-28">
      <SectionHeading id="hotel-points-title" eyebrow="Hotel points to airlines" title="Turn hotel points into miles">
        Most hotel programs convert points into airline miles at poor rates, so it&apos;s a last resort or a way to top up an
        account. Marriott is the exception worth knowing: whole 60,000-point conversions earn bonus miles.
      </SectionHeading>
      <div className="grid gap-5 lg:grid-cols-2">
        {hotels().map((id) => (
          <HotelCard key={id} hotel={id} />
        ))}
      </div>
    </section>
  );
}

function HotelCard({ hotel }: { hotel: ProgramId }) {
  const rows = [...hotelRoutesFrom(hotel)].sort((a, b) => hotelMilesFor(b, EXAMPLE) - hotelMilesFor(a, EXAMPLE) || a.programName.localeCompare(b.programName));
  const rule = hotelRuleOf(hotel);
  const sources = [...(rule?.sources ?? []), ...rows.flatMap((r) => r.sources)];
  const asOf = rule?.asOf ?? rows[0]?.asOf;
  return (
    <article className="panel flex flex-col p-5">
      <h3 className="flex items-center gap-2 text-lg font-semibold text-navy">
        <BedDouble className="h-5 w-5 text-gold" aria-hidden />
        <Link href={`/points/programs/${hotel}`} className="hover:text-brand">
          {programName(hotel)}
        </Link>
        <span className="text-sm font-normal text-ink-3">
          · {rows.length ? `${rows.length} airline${rows.length === 1 ? "" : "s"}` : "rule only"}
        </span>
      </h3>
      {rule && (
        <p className="mt-2 flex gap-2 text-sm leading-relaxed text-ink-2">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-ink-3" aria-hidden />
          <span>{rule.rule}</span>
        </p>
      )}
      {rows.length > 0 && (
        <div className="mt-4 max-h-[26rem] overflow-y-auto rounded-md border border-line">
          <table className="w-full text-sm">
            <caption className="sr-only">
              {programName(hotel)} points to airline miles, with what {num(EXAMPLE)} points become
            </caption>
            <thead className="sticky top-0 bg-canvas text-left text-xs font-semibold tracking-wide text-ink-3 uppercase">
              <tr>
                <th scope="col" className="px-3 py-2">
                  Airline program
                </th>
                <th scope="col" className="px-3 py-2 text-right">
                  Rate
                </th>
                <th scope="col" className="px-3 py-2 text-right">
                  {num(EXAMPLE)} pts →
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => {
                // A minimum of the row's own; the hotel's general one is in its rule above.
                const min = r.minimum !== undefined && r.minimum !== rule?.minimum ? r.minimum : undefined;
                return (
                  <tr key={r.program} className="align-top">
                    <td className="px-3 py-2">
                      {hasProgramPage(r.program) ? (
                        <Link href={`/points/programs/${r.program}`} className="font-medium text-ink hover:text-brand">
                          {r.programName}
                        </Link>
                      ) : (
                        <span className="text-ink-2">{r.programName}</span>
                      )}
                      {r.bonusMilesPer60k !== undefined && (
                        <span className="block text-xs text-ink-3">
                          {r.bonusMilesPer60k > 0 ? `+${num(r.bonusMilesPer60k)} bonus per 60,000` : "No 60,000-point bonus"}
                        </span>
                      )}
                      {min && <span className="block text-xs font-medium text-ink">From {num(min)} points</span>}
                      {r.notes && (
                        <details className="group mt-0.5 text-xs">
                          <summary className="cursor-pointer list-none font-medium text-brand hover:underline [&::-webkit-details-marker]:hidden">
                            <span className="group-open:hidden">Notes</span>
                            <span className="hidden group-open:inline">Hide notes</span>
                          </summary>
                          <span className="mt-1 block max-w-prose leading-relaxed text-ink-2">{r.notes}</span>
                        </details>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold whitespace-nowrap text-ink tabular-nums">{hotelRatio(r)}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap text-ink-2 tabular-nums">{num(hotelMilesFor(r, EXAMPLE))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-3 text-xs text-ink-3">
        {asOf && <span>As of {formatAsOf(asOf)}</span>}
        <SourceList urls={sources} />
      </div>
    </article>
  );
}
