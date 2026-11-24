import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import type { AwardProgram, BankCurrencyId } from "@/shared/data/points";
import { coBrandCards, ratioLabel, ratioVaries, transferSources, type ProgramReach } from "@/shared/lib/points";
import { shortCardName } from "@/shared/lib/card-name";
import { cn } from "@/shared/lib/format";
import { CURRENCY_ABBR, CURRENCY_COLOR, Dot, PRICING, ProgramMark, SURCHARGES } from "./ui";

/** A program in the directory: the whole tile links to its guide. Pass `reach`/`mine` to personalize. */
export function ProgramTile({
  program,
  reach,
  mine,
  compact = false,
}: {
  program: AwardProgram;
  reach?: ProgramReach | null;
  mine?: Set<BankCurrencyId>;
  compact?: boolean;
}) {
  const sources = transferSources(program.id);
  const coBrand = coBrandCards(program.id);
  const meta = program.kind === "hotel" ? "Hotels" : (program.alliance ?? "No alliance");

  return (
    <article
      className={cn(
        "panel group relative flex flex-col transition-shadow focus-within:ring-2 focus-within:ring-brand hover:shadow-[var(--shadow-lift)]",
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
            {program.owner} · {meta}
          </p>
        </div>
      </div>

      {!compact && (
        <>
          <p className="line-clamp-3 text-sm leading-relaxed text-ink-2">{program.summary}</p>
          <div className="flex flex-wrap gap-1.5">
            <span className="chip">{PRICING[program.pricing].label}</span>
            {program.partnerSurcharges && <span className="chip">{SURCHARGES[program.partnerSurcharges].label}</span>}
          </div>
        </>
      )}

      <div className={cn("mt-auto", !compact && "border-t border-line pt-3")}>
        {sources.length > 0 ? (
          <>
            <p className="sr-only">Transfer from</p>
            <ul className="flex flex-wrap gap-x-3 gap-y-1.5 text-xs text-ink-2">
              {sources.map(({ currency, partner }) => {
                const yours = reach?.routes.find((r) => r.currency === currency)?.partner;
                const varies = !yours && ratioVaries(currency, program.id);
                return (
                  <li key={currency} className={cn("inline-flex items-center gap-1.5", mine?.has(currency) && "font-semibold text-brand")}>
                    <Dot color={CURRENCY_COLOR[currency]} />
                    {CURRENCY_ABBR[currency]}
                    <span className="text-ink-3 tabular-nums">
                      {ratioLabel(yours ?? partner)}
                      {varies && <span aria-hidden>*</span>}
                    </span>
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
