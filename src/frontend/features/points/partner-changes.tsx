import Link from "next/link";
import { History } from "lucide-react";
import { getCard } from "@/shared/data/cards";
import { currencies, getCurrency, hasProgramPage, partnerChanges, type PartnerChange, type PartnerChangeKind } from "@/shared/data/points";
import { shortCardName } from "@/shared/lib/card-name";
import { cn } from "@/shared/lib/format";
import { ChangeStatus } from "./dated-partner";
import { CURRENCY_COLOR, Dot, SectionHeading, SourceList, formatDate, listJoin } from "./ui";

// The dated log of partner-list changes (transfer-extras research), newest first. No hooks: rendered on the server.

const CHANGE: Record<PartnerChangeKind, { label: string; tone: string }> = {
  added: { label: "Added", tone: "bg-success/10 text-success" },
  removed: { label: "Removed", tone: "bg-danger/10 text-danger" },
  "ratio changed": { label: "Ratio changed", tone: "bg-warn/12 text-warn" },
  "access expanded": { label: "Access expanded", tone: "bg-sky text-brand" },
};

const SHOWN = 12;
/** When the partner lists (and the log applied to them) were last checked. */
const CHECKED = currencies.map((c) => c.lastVerified).sort().at(-1);

export function PartnerChanges() {
  const first = partnerChanges.slice(0, SHOWN);
  const rest = partnerChanges.slice(SHOWN);
  return (
    <section id="partner-changes" aria-labelledby="partner-changes-title" className="scroll-mt-28">
      <SectionHeading id="partner-changes-title" eyebrow="Recent partner changes" title="What changed, and when">
        Partners the banks added or dropped and ratios they changed, newest first. The chart above includes every change that had
        taken effect for the programs we cover when we last checked{CHECKED ? ` (${formatDate(CHECKED)})` : ""}; scheduled changes are
        marked on the rows they will change.
      </SectionHeading>
      <ol className="panel divide-y divide-line">
        {first.map((c, i) => (
          <ChangeRow key={`${c.date}-${c.currency}-${c.programName}-${i}`} change={c} />
        ))}
      </ol>
      {rest.length > 0 && (
        <details className="group mt-3">
          <summary className="btn-secondary cursor-pointer list-none [&::-webkit-details-marker]:hidden">
            <History className="h-4 w-4" aria-hidden />
            <span className="group-open:hidden">Show {rest.length} earlier changes</span>
            <span className="hidden group-open:inline">Hide earlier changes</span>
          </summary>
          <ol className="panel mt-3 divide-y divide-line">
            {rest.map((c, i) => (
              <ChangeRow key={`${c.date}-${c.currency}-${c.programName}-${i}`} change={c} />
            ))}
          </ol>
        </details>
      )}
    </section>
  );
}

function ChangeRow({ change: c }: { change: PartnerChange }) {
  const kind = CHANGE[c.change];
  const cards = (c.cards ?? []).map((id) => getCard(id)).filter(Boolean).map((card) => shortCardName(card!.name));
  return (
    <li className="grid gap-x-5 gap-y-1.5 p-4 sm:grid-cols-[7.5rem_minmax(0,1fr)]">
      <p className="text-sm font-semibold text-ink tabular-nums">
        <time dateTime={c.date}>{formatDate(c.date)}</time>
        {c.status !== "in effect" && (
          <ChangeStatus
            status={c.status}
            date={c.date}
            className="ml-2 rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize sm:mt-1 sm:ml-0 sm:inline-block"
          />
        )}
      </p>
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", kind.tone)}>{kind.label}</span>
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink">
            <Dot color={CURRENCY_COLOR[c.currency]} />
            {getCurrency(c.currency)?.shortName ?? c.currency} →{" "}
            {c.program && hasProgramPage(c.program) ? (
              <Link href={`/points/programs/${c.program}`} className="hover:text-brand">
                {c.programName}
              </Link>
            ) : (
              c.programName
            )}
          </span>
          {cards.length > 0 && <span className="text-xs text-ink-3">{listJoin(cards)}</span>}
        </p>
        <p className="mt-1 text-sm leading-relaxed text-ink-2">{c.detail}</p>
        <div className="mt-1 flex flex-wrap gap-x-4 text-xs text-ink-3">
          {c.announced && <span>Announced {formatDate(c.announced)}</span>}
          <SourceList urls={c.sources} />
        </div>
      </div>
    </li>
  );
}
