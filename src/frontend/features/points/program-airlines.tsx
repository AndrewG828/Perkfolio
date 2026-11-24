import Link from "next/link";
import { ArrowRight, TriangleAlert } from "lucide-react";
import { ALLIANCES, airlinesBookableWith, bookingNoteOf, programName, type ProgramRef } from "@/shared/data/points";
import { bridgeFrom } from "@/shared/lib/points";
import { Dot, LIST_CAVEATS, SourceList, programColor, untilLabel } from "./ui";

// Program page: the airlines whose award seats the program books (from the who-can-book research). No hooks.

export function ProgramAirlines({ program }: { program: ProgramRef }) {
  const airlines = airlinesBookableWith(program.id);
  const note = bookingNoteOf(program.id);
  const bridge = bridgeFrom(program.id);
  if (airlines.length === 0 && !note) {
    return <p className="panel p-5 text-sm text-ink-2">We don&apos;t list any airlines for {program.name} yet.</p>;
  }
  const groups = [...ALLIANCES, null]
    .map((g) => ({ g, list: airlines.filter((a) => (a.alliance ?? null) === g) }))
    .filter((x) => x.list.length > 0);
  return (
    <div className="space-y-4">
      {note && (
        <div className="rounded-md bg-canvas p-4 text-sm leading-relaxed text-ink-2">
          <p>{note.notes}</p>
          <SourceList urls={note.sources} className="mt-2" />
        </div>
      )}
      {bridge && (
        <p className="text-sm text-ink-2">
          Flights are booked through{" "}
          <Link href={`/points/programs/${bridge.to}#airlines`} className="link">
            {programName(bridge.to)}
          </Link>
          , so these are the airlines it books.
        </p>
      )}
      {groups.map(({ g, list }) => (
        <div key={g ?? "none"}>
          <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold tracking-wide text-ink-3 uppercase">
            <Dot color={programColor({ kind: "airline", alliance: g ?? undefined })} /> {g ?? "Outside the alliances"} · {list.length}
          </h3>
          <ul className="flex flex-wrap gap-2">
            {list.map((a) => (
              <li key={a.iata}>
                <Link
                  href={`/points/airlines?airline=${a.iata}`}
                  title={a.restrictions}
                  className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1 text-sm font-medium text-ink transition-colors hover:border-brand hover:text-brand"
                >
                  {a.name}
                  {a.ownProgram === program.id && <span className="text-[10px] font-semibold text-brand uppercase">own</span>}
                  {a.endsOn && <span className="text-[11px] font-semibold text-warn">{untilLabel(a.endsOn)}</span>}
                  {a.restrictions && (
                    <>
                      <TriangleAlert className="h-3.5 w-3.5 text-warn" aria-hidden />
                      <span className="sr-only">(restrictions apply)</span>
                    </>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {LIST_CAVEATS.some((c) => /alliance membership/i.test(c)) && (
        <p className="text-xs leading-relaxed text-ink-3">{LIST_CAVEATS.find((c) => /alliance membership/i.test(c))}</p>
      )}
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-3">
        <span className="inline-flex items-center gap-1">
          <TriangleAlert className="h-3.5 w-3.5 text-warn" aria-hidden /> = booking restrictions; open the airline for details.
        </span>
        <Link href="/points/airlines" className="group inline-flex items-center gap-1 font-semibold text-brand hover:underline">
          Who can book each airline <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
        </Link>
      </p>
    </div>
  );
}
