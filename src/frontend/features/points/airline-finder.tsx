"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowRight, CheckCircle2, ClipboardList, Info, Plane, TriangleAlert, XCircle } from "lucide-react";
import {
  ALLIANCES,
  bookableAirlines,
  bookingRulesOf,
  getAirline,
  getCurrency,
  programName,
  whoCanBookAsOf,
  type BankCurrencyId,
  type BookableAirline,
} from "@/shared/data/points";
import { bookingOptionsFor, bookingPrograms, ratioLabel, type BookingOption } from "@/shared/lib/points";
import { shortCardName } from "@/shared/lib/card-name";
import { cn } from "@/shared/lib/format";
import { AllianceBadge, CURRENCY_ABBR, CURRENCY_COLOR, Dot, LIST_CAVEATS, SourceList, formatAsOf, formatDate, listJoin, programColor, untilLabel } from "./ui";
import { useWalletReach, type WalletReach } from "./use-wallet-reach";

const GROUPS = [...ALLIANCES, null] as const;

const groupTitle = (g: (typeof GROUPS)[number]) => g ?? "Outside the alliances";

function airlinesIn(g: (typeof GROUPS)[number]): BookableAirline[] {
  return bookableAirlines.filter((a) => (a.alliance ?? null) === g).sort((a, b) => a.name.localeCompare(b.name));
}

/** True once a dated listing (Asiana leaving Star Alliance) has ended, by the viewer's date (null before hydration). */
const listingEnded = (a: Pick<BookableAirline, "endsOn">, today: string | null | undefined) => Boolean(a.endsOn && today && today >= a.endsOn);

function writeAirline(iata: string | null) {
  const sp = new URLSearchParams(window.location.search);
  if (iata) sp.set("airline", iata);
  else sp.delete("airline");
  const qs = sp.toString();
  window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`);
}

/** The finder with the airline in the URL (?airline=NH). Needs a <Suspense> boundary (useSearchParams). */
export function AirlineFinderLive() {
  const params = useSearchParams();
  const wallet = useWalletReach();
  const raw = params.get("airline");
  const airline = getAirline(raw)?.iata ?? null;
  // A link with an airline we don't list (?airline=ZZ) shows the directory; drop the value from the URL too.
  useEffect(() => {
    if (raw !== null && raw !== airline) writeAirline(airline);
  }, [raw, airline]);
  const pick = (iata: string | null) => {
    writeAirline(iata);
    // After the result renders, bring it into view (the directory it replaces can be scrolled far down).
    if (iata) window.setTimeout(() => document.getElementById("airline-result")?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  };
  return <AirlineFinder airline={airline} onPick={pick} wallet={wallet} />;
}

/** Pick an airline, see every program that books its award seats. Without `onPick` it renders the directory, inert. */
export function AirlineFinder({ airline, onPick, wallet }: { airline?: string | null; onPick?: (iata: string | null) => void; wallet?: WalletReach }) {
  const selected = getAirline(airline);
  const personal = Boolean(wallet?.hydrated && wallet.points.cards.length > 0);
  const today = wallet?.today;
  const options =
    selected && !listingEnded(selected, today) ? bookingOptionsFor(selected.iata, personal ? wallet!.cardIds : undefined, wallet?.data) : [];

  return (
    <div className="space-y-8">
      <div className="panel flex flex-wrap items-end gap-x-6 gap-y-3 p-4 md:p-5">
        <label className="flex min-w-0 flex-1 basis-64 flex-col gap-1">
          <span className="text-xs font-semibold tracking-wide text-ink-3 uppercase">Airline you want to fly</span>
          <select className="input h-11 text-base" value={selected?.iata ?? ""} onChange={(e) => onPick?.(e.target.value || null)} disabled={!onPick}>
            <option value="">Choose an airline…</option>
            {GROUPS.map((g) => (
              <optgroup key={g ?? "none"} label={groupTitle(g)}>
                {airlinesIn(g).map((a) => (
                  <option key={a.iata} value={a.iata}>
                    {a.name} ({a.iata})
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <p className="pb-2 text-sm text-ink-2">
          {bookableAirlines.length} airlines · programs from our {personal ? "directory, matched to your cards" : "directory"}
        </p>
      </div>

      {selected ? (
        <AirlineResult
          airline={selected}
          options={options}
          wallet={wallet}
          personal={personal}
          ended={listingEnded(selected, today)}
          onClear={onPick && (() => onPick(null))}
        />
      ) : (
        <AirlineDirectory onPick={onPick} today={today} />
      )}
      <ListCaveats />
    </div>
  );
}

/** How the lists were built: alliance-based listings weren't checked one program at a time. */
export function ListCaveats({ className }: { className?: string }) {
  if (LIST_CAVEATS.length === 0) return null;
  return (
    <aside aria-label="How these lists are built" className={cn("rounded-md border border-line bg-white p-4 text-sm text-ink-2", className)}>
      <p className="flex items-center gap-2 font-semibold text-ink">
        <Info className="h-4 w-4 text-ink-3" aria-hidden /> How these lists are built
      </p>
      <ul className="mt-2 list-disc space-y-1 pl-5 leading-relaxed">
        <li>
          Within an alliance, each member&apos;s program is listed for every member airline, since alliance members&apos; programs
          book each other&apos;s flights. Other partnerships come from the sources listed under each airline.
        </li>
        {LIST_CAVEATS.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-ink-3">As of {formatAsOf(whoCanBookAsOf)}.</p>
    </aside>
  );
}

function AirlineDirectory({ onPick, today }: { onPick?: (iata: string) => void; today?: string | null }) {
  return (
    <div className="space-y-8">
      {GROUPS.map((g) => {
        const list = airlinesIn(g);
        if (list.length === 0) return null;
        return (
          <section key={g ?? "none"} aria-labelledby={`airlines-${g ?? "none"}`}>
            <h2 id={`airlines-${g ?? "none"}`} className="mb-3 flex items-center gap-2 text-lg font-semibold text-navy">
              <Dot color={programColor({ kind: "airline", alliance: g ?? undefined })} className="h-2.5 w-2.5" /> {groupTitle(g)}
              <span className="font-normal text-ink-3">· {list.length}</span>
            </h2>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {list.map((a) => (
                <li key={a.iata}>
                  <Link
                    href={`/points/airlines?airline=${a.iata}`}
                    onClick={(e) => {
                      if (!onPick) return;
                      e.preventDefault();
                      onPick(a.iata);
                    }}
                    className="flex items-center gap-3 rounded-md border border-line bg-white px-3 py-2.5 transition-colors hover:border-brand focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand"
                  >
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded bg-canvas text-xs font-bold text-navy">{a.iata}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-ink">{a.name}</span>
                      <span className="block text-xs text-ink-3">
                        {listingEnded(a, today) ? (
                          "No longer bookable"
                        ) : (
                          <>
                            {bookingPrograms(a).length} program{bookingPrograms(a).length === 1 ? "" : "s"}
                            {a.endsOn ? ` · ${untilLabel(a.endsOn)}` : a.restrictions ? " · has restrictions" : ""}
                          </>
                        )}
                      </span>
                    </span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-ink-3" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function AirlineResult({
  airline,
  options,
  wallet,
  personal,
  ended,
  onClear,
}: {
  airline: BookableAirline;
  options: BookingOption[];
  wallet?: WalletReach;
  personal: boolean;
  /** The listing has ended (BookableAirline.endsOn): no program is offered as a way to book it. */
  ended: boolean;
  onClear?: () => void;
}) {
  const reachable = options.filter((o) => o.reach);
  return (
    <section id="airline-result" aria-labelledby="airline-title" className="scroll-mt-28 space-y-6">
      <div className="panel p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-md bg-navy text-base font-bold text-white">{airline.iata}</span>
            <div>
              <h2 id="airline-title" className="text-2xl font-semibold tracking-tight text-navy">
                {airline.name}
              </h2>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-2">
                <AllianceBadge alliance={airline.alliance} />
                {airline.endsOn && (
                  <span className="rounded-full bg-warn/12 px-2.5 py-0.5 text-xs font-semibold text-warn">
                    {ended ? `Not bookable since ${formatDate(airline.endsOn)}` : untilLabel(airline.endsOn)}
                  </span>
                )}
                {airline.ownProgram ? (
                  <span>
                    Own program:{" "}
                    <Link href={`/points/programs/${airline.ownProgram}`} className="link">
                      {programName(airline.ownProgram)}
                    </Link>
                  </span>
                ) : (
                  <span className="text-ink-3">Its own program isn&apos;t one we cover</span>
                )}
              </div>
            </div>
          </div>
          {onClear && (
            <button type="button" className="btn-secondary" onClick={onClear}>
              All airlines
            </button>
          )}
        </div>
        {airline.restrictions && (
          <p className="mt-4 flex gap-2.5 rounded-md border border-warn/25 bg-[#fdf3e7] p-3.5 text-sm text-ink">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warn" aria-hidden />
            <span>{airline.restrictions}</span>
          </p>
        )}
        {airline.notes && (
          <p className="mt-3 flex gap-2.5 text-sm text-ink-2">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-ink-3" aria-hidden />
            <span>{airline.notes}</span>
          </p>
        )}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-xs text-ink-3">
          <span>As of {formatAsOf(airline.asOf)} · bookable doesn&apos;t mean seats are open: airlines release few premium award seats to partners.</span>
          <SourceList urls={airline.sources} />
        </div>
      </div>

      {ended ? (
        <p className="panel p-5 text-sm text-ink-2">
          Since {formatDate(airline.endsOn!)}, none of the programs we list books {airline.name} award seats.
        </p>
      ) : (
      <div>
        <h3 className="mb-1 text-lg font-semibold text-navy">
          {options.length} program{options.length === 1 ? "" : "s"} can book {airline.name} award seats
        </h3>
        <p className="mb-4 text-sm text-ink-2">
          {personal
            ? reachable.length
              ? `Your cards reach ${reachable.length} of them; those come first, the airline's own program leading.`
              : "None of your cards' points reach these programs yet; the transfer chips show which bank points would."
            : "Add your cards to see which of these your points reach. Each chip is a bank currency and its best ratio."}
        </p>
        <ul className="grid gap-4 lg:grid-cols-2">
          {options.map((o) => (
            <OptionCard key={o.program.id} option={o} mine={wallet?.mine} personal={personal} />
          ))}
        </ul>
      </div>
      )}
    </section>
  );
}

function OptionCard({ option, mine, personal }: { option: BookingOption; mine?: Set<BankCurrencyId>; personal: boolean }) {
  const { program, reach, sources, note, own, bridges } = option;
  const best = reach?.best;
  const rules = bookingRulesOf(program.id);
  const bridged = sources.filter((s) => s.via);
  return (
    <li className={cn("panel flex flex-col gap-3 p-4", reach && "ring-2 ring-success/50")}>
      <div className="flex items-start justify-between gap-3">
        <Link href={`/points/programs/${program.id}`} className="flex min-w-0 items-center gap-2 font-semibold text-navy hover:text-brand">
          <Plane className="h-4 w-4 shrink-0 text-ink-3" aria-hidden />
          <span className="truncate">{program.name}</span>
        </Link>
        {own && <span className="shrink-0 rounded-full bg-sky px-2 py-0.5 text-[11px] font-semibold text-brand">Its own program</span>}
      </div>

      {personal &&
        (reach ? (
          <p className="flex items-start gap-2 rounded-md bg-success/8 px-3 py-2 text-sm text-ink">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
            <span>
              {best ? (
                <>
                  Best with your cards: <span className="font-semibold">{getCurrency(best.currency)?.shortName}</span> at{" "}
                  <span className="font-semibold tabular-nums">{ratioLabel(best.partner)}</span>
                  {best.via ? ` via ${programName(best.via)}` : ""}
                  {best.cards[0] ? `${best.via ? "," : ""} with your ${shortCardName(best.cards[0].name)}` : ""}
                </>
              ) : (
                <>Earned directly with {listJoin(reach.direct.map((c) => shortCardName(c.name)))}</>
              )}
            </span>
          </p>
        ) : (
          <p className="flex items-center gap-2 text-sm text-ink-3">
            <XCircle className="h-4 w-4 shrink-0" aria-hidden /> Not with your cards
          </p>
        ))}

      {sources.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="Transfer from">
          {sources.map(({ currency, partner, via }) => {
            const yours = mine?.has(currency) ?? false;
            const ratio = reach?.routes.find((r) => r.currency === currency && r.via === via)?.partner ?? partner;
            return (
              <li
                key={currency}
                title={`${getCurrency(currency)?.name}${via ? ` via ${programName(via)}` : ""}`}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
                  yours ? "border-brand bg-sky text-brand" : "border-line bg-white text-ink-2",
                )}
              >
                <Dot color={CURRENCY_COLOR[currency]} />
                {CURRENCY_ABBR[currency]}
                <span className="font-semibold tabular-nums">{ratioLabel(ratio)}</span>
                {via && <span className="font-normal opacity-80">via {programName(via)}</span>}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-xs text-ink-3">No bank currency transfers here; earn these points with a co-brand card or flying.</p>
      )}
      {bridges.map(({ bridge }) => (
        <p key={bridge.from} className="text-xs leading-relaxed text-ink-2">
          {bridged.length > 0 && (
            <span className="font-semibold text-ink">
              {listJoin(bridged.filter((s) => s.via === bridge.from).map((s) => CURRENCY_ABBR[s.currency]))} via {programName(bridge.from)}:{" "}
            </span>
          )}
          {bridge.note}
        </p>
      ))}

      {(note || bridges.some((b) => b.note)) && (
        <details className="group text-sm">
          <summary className="cursor-pointer list-none text-xs font-semibold text-brand hover:underline [&::-webkit-details-marker]:hidden">
            How {program.name} books partner awards
          </summary>
          {note && <p className="mt-1.5 leading-relaxed text-ink-2">{note.notes}</p>}
          {bridges.map(({ bridge, note: n }) => n && <p key={bridge.from} className="mt-1.5 leading-relaxed text-ink-2">{n.notes}</p>)}
          <SourceList urls={[...(note?.sources ?? []), ...bridges.flatMap((b) => b.note?.sources ?? [])]} className="mt-1.5" />
        </details>
      )}
      {rules && (
        <Link href={`/points/programs/${program.id}#booking-rules`} className="mt-auto inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline">
          <ClipboardList className="h-3.5 w-3.5" aria-hidden /> Booking rules
        </Link>
      )}
    </li>
  );
}
