import Link from "next/link";
import { ArrowRight, TriangleAlert } from "lucide-react";
import type { Card } from "@/shared/data/types";
import {
  getCurrency,
  getProgram,
  hasProgramPage,
  programIdFromName,
  programName,
  programRef,
  transferPartners,
  type BankCurrencyId,
  type ProgramId,
  type TransferPartner,
} from "@/shared/data/points";
import { bestPartnerFor, bridgeFrom, currencyOfCard, ratioLabel, transferSources } from "@/shared/lib/points";
import { shortCardName } from "@/shared/lib/card-name";
import { DatedChangeNote, DatedRatioPill } from "./dated-partner";
import { Dot, formatDate, programColor } from "./ui";

/** The transfer this card gets into a program: its own card-specific entry, else the general one. */
function entryForCard(card: Card, currency: BankCurrencyId, program: ProgramId): { partner: TransferPartner; varies: boolean } | null {
  const list = transferPartners.filter((p) => p.currency === currency && p.program === program);
  if (list.length === 0) return null;
  const own = list.find((p) => p.cards?.includes(card.id));
  const general = list.find((p) => !p.cards);
  if (own) return { partner: own, varies: false };
  if (general) return { partner: general, varies: list.length > 1 };
  // Only other cards' ratios exist (e.g. a no-fee card that must be paired): show the best, marked as varying.
  const best = bestPartnerFor(currency, program);
  return best ? { partner: best, varies: true } : null;
}

/**
 * Card page section. Bank-currency cards get structured partners (ratio pills linking to program guides) plus any
 * partner the issuer lists that we don't have details for yet; co-brand cards get a pointer to their program.
 */
export function CardTransferPartners({ card }: { card: Card }) {
  const points = currencyOfCard(card);
  if (!points) return null;

  if (points.kind === "program") {
    const info = getProgram(points.program);
    const sources = transferSources(points.program);
    return (
      <section id="partners" className="scroll-mt-28">
        <h2 className="mb-5 text-2xl font-semibold tracking-tight text-navy">Rewards program</h2>
        <div className="panel flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="max-w-xl">
            <p className="font-semibold text-ink">
              Earns {info ? info.currency : "points"} in {programName(points.program)}
            </p>
            <p className="mt-1 text-sm text-ink-2">
              {sources.length > 0
                ? `You can also top up from ${sources.length} bank points currenc${sources.length === 1 ? "y" : "ies"}.`
                : "These points don't come from bank transfers, so this card is the main way to earn them."}
            </p>
          </div>
          {info && (
            <Link href={`/points/programs/${points.program}`} className="btn-secondary">
              {info.name} guide <ArrowRight className="h-4 w-4" />
            </Link>
          )}
        </div>
      </section>
    );
  }

  const currency = getCurrency(points.currency);
  const programIds = Array.from(new Set(transferPartners.filter((p) => p.currency === points.currency).map((p) => p.program)));
  const rows = programIds
    .map((id) => {
      const entry = entryForCard(card, points.currency, id);
      return entry ? { id, info: programRef(id), ...entry } : null;
    })
    .filter((r): r is NonNullable<typeof r> => Boolean(r))
    .sort((a, b) => programName(a.id).localeCompare(programName(b.id)));
  const covered = new Set<string>(rows.map((r) => r.id));
  const other = (card.transferPartners ?? []).filter((n) => {
    const id = programIdFromName(n);
    return !id || !covered.has(id);
  });
  if (rows.length === 0 && other.length === 0) return null;

  const groups = [
    { title: "Airlines", rows: rows.filter((r) => r.info.kind === "airline") },
    { title: "Hotels", rows: rows.filter((r) => r.info.kind === "hotel") },
  ].filter((g) => g.rows.length > 0);
  const anyVaries = rows.some((r) => r.varies);
  // Times are shown where a source gives one. When none does, or every partner has the same one (Amex's terms give one
  // time for all), it's said once instead of on every row.
  const timed = rows.filter((r) => r.partner.time).length;
  const times = new Set(rows.map((r) => r.partner.time ?? null));
  const sharedTime = times.size === 1 ? [...times][0] : null;
  const perRowTime = times.size > 1;
  // Notes that single out this card as an exception ("not in the hotel-partner list on Chase's Ink Business Preferred
  // page", a rate only coverage reports for it): a clause that names the card and says it isn't listed or rests on
  // coverage. A note that names the card only to say its page does list the partner ("Listed on Chase's Sapphire
  // Preferred page") is no caveat for that card.
  const short = shortCardName(card.name);
  const singlesOut = (note: string | undefined) =>
    Boolean(note) && note!.split(/[;.]\s+|,\s+(?:but|so|while)\s+/).some((clause) => clause.includes(short) && /\bnot\b|n't\b|\bno longer\b|\bper coverage\b|\bcoverage reports\b/i.test(clause));
  const caveats = short.includes(" ") ? rows.filter((r) => singlesOut(r.partner.note)) : [];
  const flagged = new Set(caveats.map((r) => r.id));

  return (
    <section id="partners" className="scroll-mt-28">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-2xl font-semibold tracking-tight text-navy">Transfer partners</h2>
        <Link href={`/points/transfers?currency=${points.currency}`} className="group inline-flex items-center gap-1 text-sm font-semibold text-brand hover:underline">
          Full transfer chart <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </Link>
      </div>
      <p className="mb-4 text-sm text-ink-2">
        Earns {currency?.name ?? points.currency}. Ratios compare your points with the program&apos;s (5:4 means 1,000 points become 800)
        {currency ? `; partner list checked ${formatDate(currency.lastVerified)}` : ""}.{" "}
        {timed === 0
          ? `None of our sources gives transfer times for ${currency?.shortName ?? "these points"}.`
          : sharedTime
            ? `Transfer time for every partner: ${sharedTime.charAt(0).toLowerCase()}${sharedTime.slice(1)}.`
            : timed < rows.length
              ? "Transfer times show where a source gives one."
              : ""}
      </p>
      {points.limited && (
        <p className="mb-5 flex gap-2.5 rounded-md border border-warn/25 bg-[#fdf3e7] p-3.5 text-sm text-ink">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warn" aria-hidden />
          <span>
            <span className="font-semibold">Limited transfers. </span>
            {points.limited.note}
          </span>
        </p>
      )}
      <div className="space-y-5">
        {groups.map((g) => (
          <div key={g.title}>
            <h3 className="mb-2 text-xs font-semibold tracking-wide text-ink-3 uppercase">
              {g.title} · {g.rows.length}
            </h3>
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {g.rows.map((r) => {
                const through = bridgeFrom(r.id);
                const body = (
                  <>
                    <Dot color={programColor(r.info)} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                        <span className="truncate">{programName(r.id)}</span>
                        {flagged.has(r.id) && (
                          <>
                            <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-warn" aria-hidden />
                            <span className="sr-only">(check the note below)</span>
                          </>
                        )}
                      </span>
                      {perRowTime && r.partner.time && <span className="block text-xs text-ink-3">{r.partner.time}</span>}
                      {through && <span className="block text-xs text-ink-3">Books {programName(through.to)} awards</span>}
                      <DatedChangeNote partner={r.partner} />
                    </span>
                    <DatedRatioPill partner={r.partner} varies={r.varies} />
                  </>
                );
                return (
                  <li key={r.id} className="min-w-0">
                    {hasProgramPage(r.id) ? (
                      <Link
                        href={`/points/programs/${r.id}`}
                        className="flex items-center gap-3 rounded-md border border-line bg-white px-3 py-2.5 transition-colors hover:border-brand focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand"
                      >
                        {body}
                      </Link>
                    ) : (
                      <div className="flex items-center gap-3 rounded-md border border-line bg-white px-3 py-2.5">{body}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        {anyVaries && <p className="text-xs text-ink-3">* The ratio depends on which card you transfer from.</p>}
        {caveats.length > 0 && (
          <ul className="space-y-2">
            {caveats.map((r) => (
              <li key={r.id} className="flex gap-2.5 rounded-md border border-warn/25 bg-[#fdf3e7] p-3 text-sm text-ink">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warn" aria-hidden />
                <span>
                  <span className="font-semibold">
                    {programName(r.id)} ({ratioLabel(r.partner)}):{" "}
                  </span>
                  {r.partner.note}
                </span>
              </li>
            ))}
          </ul>
        )}
        {other.length > 0 && (
          <div>
            <h3 className="mb-2 text-xs font-semibold tracking-wide text-ink-3 uppercase">
              {rows.length ? "More partners" : "Partners"}
            </h3>
            <div className="flex flex-wrap gap-2">
              {other.map((n) => {
                const id = programIdFromName(n);
                return id && hasProgramPage(id) ? (
                  <Link key={n} href={`/points/programs/${id}`} className="chip text-sm hover:border-brand hover:text-brand">
                    {n}
                  </Link>
                ) : (
                  <span key={n} className="chip text-sm">
                    {n}
                  </span>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
