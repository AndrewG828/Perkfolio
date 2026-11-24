import { ArrowRight, BedDouble, CheckCircle2, ChevronDown, Plane, TriangleAlert } from "lucide-react";
import { getCurrency, programName, regionPhoto, type BankCurrencyId, type SweetSpot } from "@/shared/data/points";
import {
  bankPointsFor,
  bridgeFrom,
  perLabel,
  pointsData,
  pointsRange,
  ratioLabel,
  ratioVaries,
  transferSources,
  type PointsData,
  type ProgramReach,
} from "@/shared/lib/points";
import { PhotoFrame } from "@/frontend/components/photo-frame";
import { cn, num } from "@/shared/lib/format";
import { shortCardName } from "@/shared/lib/card-name";
import { CABIN_LABEL, CURRENCY_ABBR, CURRENCY_COLOR, Dot, FEES, FeeLevelTag, ProgramBadge, SourceList, currencyProse, formatDate, listJoin, timeLabel } from "./ui";

/**
 * One sweet spot: photo (or styled fallback), program, price, fees, where the points come from, and how to book.
 * No hooks: pass `reach` / `mine` from a client parent to personalize (undefined = not personalized yet).
 */
export function SweetSpotCard({
  spot,
  reach,
  mine,
  data = pointsData,
  className,
}: {
  spot: SweetSpot;
  /** How the wallet reaches the program; null when it can't, undefined before the wallet is known. */
  reach?: ProgramReach | null;
  /** Currencies the wallet transfers (highlighted). */
  mine?: Set<BankCurrencyId>;
  /** The dataset as it stands today (useWalletReach().data), so scheduled ratio changes show from their date. */
  data?: PointsData;
  className?: string;
}) {
  const sources = transferSources(spot.program, data);
  const fee = FEES[spot.kind][spot.fees];
  const photo = regionPhoto(spot.to);
  const flight = spot.kind === "flight";
  const best = reach?.best;

  return (
    <article id={spot.id} className={cn("panel flex scroll-mt-28 flex-col overflow-hidden", className)}>
      <PhotoFrame
        photo={photo}
        region={spot.to}
        label={spot.to}
        sublabel={spot.destinations.join(" · ")}
        icon={flight ? <Plane /> : <BedDouble />}
        className="aspect-[16/9]"
      >
        <span className="absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-white/95 px-2.5 py-1 text-xs font-semibold text-navy shadow-sm">
          {flight ? <Plane className="h-3.5 w-3.5" aria-hidden /> : <BedDouble className="h-3.5 w-3.5" aria-hidden />}
          {flight ? `Flight${spot.cabin ? ` · ${CABIN_LABEL[spot.cabin]}` : ""}` : "Hotel"}
        </span>
        {reach && (
          <span className="absolute top-3 right-3 inline-flex items-center gap-1 rounded-full bg-success px-2.5 py-1 text-xs font-semibold text-white shadow-sm">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> You can book
          </span>
        )}
      </PhotoFrame>

      <div className="flex flex-1 flex-col gap-4 p-5">
        <div className="space-y-2">
          <ProgramBadge program={spot.program} />
          <h3 className="text-lg leading-snug font-semibold text-navy">{spot.title}</h3>
          <p className="text-sm text-ink-2">
            {flight ? (
              <>
                {spot.from} <ArrowRight className="inline h-3.5 w-3.5 align-[-2px] text-ink-3" aria-hidden />
                <span className="sr-only">to</span> {spot.to}
                <span className="text-ink-3"> · on {spot.operatedBy.join(", ")}</span>
              </>
            ) : (
              <>
                {spot.destinations.join(", ")}
                <span className="text-ink-3"> · {spot.operatedBy.join(", ")}</span>
              </>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-y border-line py-3">
          <p className="text-2xl font-semibold tracking-tight text-navy tabular-nums">
            {pointsRange(spot)} <span className="text-base font-semibold">pts</span>
          </p>
          <p className="text-sm text-ink-2">{perLabel[spot.per]}</p>
          <div className="basis-full pt-1">
            <FeeLevelTag kind={spot.kind} level={spot.fees} />
            <p className="mt-0.5 text-sm text-ink-2">{spot.feesNote ?? fee.detail}</p>
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold tracking-wide text-ink-3 uppercase">Transfer from</p>
          {sources.length > 0 ? (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {sources.map(({ currency, partner: general, via }) => {
                const yours = mine?.has(currency) ?? false;
                const name = getCurrency(currency)?.name ?? currency;
                // Show the ratio this wallet gets when the pair has card-specific ratios.
                const own = reach?.routes.find((r) => r.currency === currency && r.via === via);
                const partner = own?.partner ?? general;
                const varies = ratioVaries(currency, via ?? spot.program, data) && !own;
                const through = via ? ` via ${programName(via)}` : "";
                return (
                  <li
                    key={currency}
                    title={`${name}${through} → ${num((partner.to * 1000) / partner.from)} points per 1,000 · ${timeLabel(partner)}${varies ? " · ratio depends on the card" : ""}`}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
                      yours ? "border-brand bg-sky text-brand" : "border-line bg-white text-ink-2",
                    )}
                  >
                    <Dot color={CURRENCY_COLOR[currency]} />
                    {CURRENCY_ABBR[currency]}
                    <span className="font-semibold tabular-nums">
                      {ratioLabel(partner)}
                      {varies && <span aria-hidden>*</span>}
                    </span>
                    {via && <span className="font-normal opacity-80">via {programName(via)}</span>}
                    {yours && <span className="sr-only">(you earn this)</span>}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-1 text-sm text-ink-2">No bank currency transfers here; earn these points directly.</p>
          )}
          {reach && (best || reach.direct.length > 0) && (
            <p className="mt-3 flex gap-2 rounded-md bg-success/8 px-3 py-2 text-sm text-ink">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
              <span>
                <span className="font-semibold">With your cards: </span>
                {best ? (
                  <>
                    {spot.pointsMax ? "from " : ""}
                    <span className="font-semibold tabular-nums">{num(bankPointsFor(best.partner, spot.points))}</span> {currencyProse(best.currency)}
                    <span className="text-ink-2">
                      {" "}
                      · {ratioLabel(best.partner)}
                      {best.via ? ` via ${programName(best.via)}` : ""}
                      {best.cards[0] ? `${best.via ? "," : ""} with your ${shortCardName(best.cards[0].name)}` : ""}
                    </span>
                  </>
                ) : (
                  <>earned directly with {listJoin(reach.direct.map((c) => shortCardName(c.name)))}</>
                )}
                {best?.via && <span className="mt-0.5 block text-xs text-ink-2">{bridgeFrom(best.via)?.note}</span>}
              </span>
            </p>
          )}
        </div>

        <details className="group rounded-md border border-line">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-md px-3 py-2.5 text-sm font-semibold text-navy hover:bg-canvas focus-visible:outline-2 focus-visible:outline-brand [&::-webkit-details-marker]:hidden">
            How to book{spot.caveats ? " & caveats" : ""}
            <ChevronDown className="h-4 w-4 text-ink-3 transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <div className="space-y-3 border-t border-line px-3 py-3 text-sm leading-relaxed text-ink-2">
            <p>{spot.howToBook}</p>
            {spot.caveats && (
              <p className="flex gap-2 text-ink">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warn" aria-hidden />
                <span>{spot.caveats}</span>
              </p>
            )}
          </div>
        </details>

        <footer className="mt-auto flex flex-wrap items-start justify-between gap-x-4 gap-y-1 pt-1 text-xs text-ink-3">
          <SourceList urls={spot.sources} className="min-w-0" />
          <span>Checked {formatDate(spot.lastVerified)}</span>
        </footer>
      </div>
    </article>
  );
}
