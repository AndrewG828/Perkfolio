import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { programName, type BankCurrencyId, type ProgramRef } from "@/shared/data/points";
import { coBrandCards, pointsData, ratioLabel, ratioRangeLabel, ratioVaries, transferSources, type PointsData, type ProgramReach } from "@/shared/lib/points";
import { shortCardName } from "@/shared/lib/card-name";
import { cn } from "@/shared/lib/format";
import { ValueInline } from "./point-value";
import { CURRENCY_ABBR, CURRENCY_COLOR, Dot, PRICING, ProgramMark, SURCHARGES } from "./ui";

/** A program in the directory: the whole tile links to its page. Pass `reach`/`mine` to personalize. */
export function ProgramTile({
  program,
  reach,
  mine,
  data = pointsData,
  compact = false,
}: {
  program: ProgramRef;
  reach?: ProgramReach | null;
  mine?: Set<BankCurrencyId>;
  /** The dataset as it stands today (useWalletReach().data). */
  data?: PointsData;
  compact?: boolean;
}) {
  const sources = transferSources(program.id, data);
  const coBrand = coBrandCards(program.id);
  const meta = program.kind === "hotel" ? "Hotels" : (program.alliance ?? "No alliance");
  const guide = program.guide;

  return (
    <article
      className={cn(
        "panel group relative flex min-w-0 flex-col transition-shadow focus-within:ring-2 focus-within:ring-brand hover:shadow-[var(--shadow-lift)]",
        compact ? "gap-3 p-4" : "gap-4 p-5",
      )}
    >
      <div className="flex items-start gap-3">
        <ProgramMark program={program} size={compact ? "sm" : "md"} />
        <div className="min-w-0">
          <h3 className={cn("leading-snug font-semibold text-navy", compact ? "text-[15px]" : "text-lg")}>
            <Link href={`/points/programs/${program.id}`} className="outline-none after:absolute after:inset-0 after:rounded-lg group-hover:text-brand">
              {program.name}
            </Link>
          </h3>
          <p className="mt-0.5 truncate text-xs text-ink-3">
            {guide ? `${guide.owner} · ` : ""}
            {meta}
          </p>
        </div>
      </div>

      {!compact &&
        (guide ? (
          <>
            <p className="line-clamp-3 text-sm leading-relaxed text-ink-2">{guide.summary}</p>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="chip">{PRICING[guide.pricing].label}</span>
              {guide.partnerSurcharges && <span className="chip">{SURCHARGES[guide.partnerSurcharges].label}</span>}
              <ValueInline id={program.id} className="ml-auto truncate text-xs" />
            </div>
          </>
        ) : (
          <p className="text-sm leading-relaxed text-ink-2">No program guide yet; its page lists the verified transfers and the airlines it books.</p>
        ))}

      <div className={cn("mt-auto", !compact && "border-t border-line pt-3")}>
        {sources.length > 0 ? (
          <>
            <p className="sr-only">Transfer from</p>
            <ul className="flex flex-wrap gap-x-3 gap-y-1.5 text-xs text-ink-2">
              {sources.map(({ currency, partner, via }) => {
                const yours = reach?.routes.find((r) => r.currency === currency && r.via === via)?.partner;
                const varies = !yours && ratioVaries(currency, via ?? program.id, data);
                return (
                  <li
                    key={currency}
                    title={via ? `via ${programName(via)}` : undefined}
                    className={cn("inline-flex items-center gap-1.5", mine?.has(currency) && "font-semibold text-brand")}
                  >
                    <Dot color={CURRENCY_COLOR[currency]} />
                    {CURRENCY_ABBR[currency]}
                    <span className="text-ink-3 tabular-nums">{varies ? ratioRangeLabel(currency, via ?? program.id, data) : ratioLabel(yours ?? partner)}</span>
                    {via && <span className="text-ink-3">via {programName(via)}</span>}
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <p className="text-xs text-ink-3">No bank transfers{coBrand.length ? "; earned with co-brand cards" : ""}</p>
        )}
        {!compact && coBrand.length > 0 && sources.length > 0 && (
          <p className="mt-2 text-xs text-ink-3">
            Also earned with {coBrand.length === 1 ? shortCardName(coBrand[0].name) : `${coBrand.length} co-brand cards`}
          </p>
        )}
        {reach && (
          <p className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-success">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
            {reach.direct.length > 0 && !reach.best ? "You earn these points directly" : "Your cards transfer here"}
            {reach.best && <span className="font-medium text-ink-2">· best {ratioLabel(reach.best.partner)}</span>}
          </p>
        )}
      </div>
    </article>
  );
}
