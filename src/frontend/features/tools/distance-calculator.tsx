"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowRight, ArrowUpDown, Clock, Info, Plus, RotateCcw, Route, Sparkles, TriangleAlert, X } from "lucide-react";
import { MAX_ROUTE_POINTS, formatRoute, parseRoute, parseRouteParam, sameAirportLegs, summarizeRoute, type WorldAirport } from "@/shared/lib/airports";
import { formatDuration } from "@/shared/lib/geo";
import { regionFor, sweetSpotsHref } from "@/shared/data/travel/regions";
import { whole } from "@/shared/lib/travel-format";
import { cn } from "@/shared/lib/format";
import { useWorldAirports } from "@/frontend/state/airports";
import { AirportInput, countryName } from "./airport-input";
import { RouteMap } from "./route-map";

interface Slot {
  key: number;
  code: string | null;
}

const EXAMPLES = ["JFK-LHR", "JFK-LHR-SIN", "LAX-SYD", "SFO-HND", "ORD-DFW-MIA"];
const MAX_STOPS = MAX_ROUTE_POINTS - 2;

let nextKey = 1;
const slot = (code: string | null): Slot => ({ key: nextKey++, code });

/** [origin, ...stops, destination] from a route parameter, always with an origin and destination slot. */
function slotsFrom(codes: string[]): Slot[] {
  if (codes.length === 0) return [slot(null), slot(null)];
  if (codes.length === 1) return [slot(codes[0]), slot(null)];
  return codes.map(slot);
}

/** Flight distance calculator: origin, up to three stops and a destination; distances, times and a map. */
/** A total as the legs above it show: the sum of each leg rounded, so the Total row adds up to what's printed. */
const legTotal = (summary: ReturnType<typeof summarizeRoute>, unit: "miles" | "km" | "nm") =>
  summary.legs.reduce((t, l) => t + Math.round(l[unit]), 0);

export function DistanceCalculator() {
  const params = useSearchParams();
  const [slots, setSlots] = useState<Slot[]>(() => slotsFrom(parseRoute(params.get("route"))));
  // A shared link with more stops than fit keeps its origin and destination; say which stops were left out.
  const [dropped, setDropped] = useState<string[]>(() => parseRouteParam(params.get("route")).dropped);
  const { status, airports, byCode, retry } = useWorldAirports();
  const loading = status === "idle" || status === "loading";

  // Keep the route in the URL (?route=JFK-LHR-SIN) so it can be shared, without a navigation.
  const codes = slots.map((s) => s.code).filter((c): c is string => Boolean(c));
  const routeParam = formatRoute(codes);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      if (!routeParam) return;
    }
    const sp = new URLSearchParams(window.location.search);
    if (routeParam) sp.set("route", routeParam);
    else sp.delete("route");
    const q = sp.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${q ? `?${q}` : ""}`);
  }, [routeParam]);

  const resolved = useMemo(
    () => (byCode ? codes.map((c) => byCode.get(c)).filter((a): a is WorldAirport => Boolean(a)) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [byCode, routeParam],
  );
  const unknown = byCode ? codes.filter((c) => !byCode.has(c)) : [];
  // Two airports in a row that are the same aren't a flight (JFK-JFK).
  const repeats = sameAirportLegs(slots.map((s) => s.code));
  // Only a route whose every airport is known adds up: a skipped code would quietly change the trip.
  const summary = resolved.length >= 2 && unknown.length === 0 && repeats.length === 0 ? summarizeRoute(resolved) : null;
  const dest = resolved.length >= 2 ? resolved[resolved.length - 1] : null;
  // The sweet-spots link waits for the Points & Miles section's page.
  const region = dest ? regionFor(dest.country, dest.lat, dest.lon) : null;

  const setCode = (key: number, a: WorldAirport | null) =>
    setSlots((ss) => ss.map((s) => (s.key === key ? { ...s, code: a?.code ?? null } : s)));
  // A new stop takes the keyboard focus: the button that added it moves down into the new row.
  const [focusKey, setFocusKey] = useState<number | null>(null);
  const addStop = () => {
    if (slots.length - 2 >= MAX_STOPS) return;
    const added = slot(null);
    setSlots((ss) => [...ss.slice(0, -1), added, ss[ss.length - 1]]);
    setFocusKey(added.key);
  };
  const removeStop = (key: number) => setSlots((ss) => ss.filter((s) => s.key !== key));
  const reverse = () => setSlots((ss) => [...ss].reverse());
  const load = (route: string) => {
    setDropped([]);
    setSlots(slotsFrom(parseRoute(route)));
  };

  return (
    <div className="bg-canvas">
      <div className="container-page grid grid-cols-1 gap-6 py-8 md:py-10 lg:grid-cols-[360px_minmax(0,1fr)] lg:gap-8">
        <aside className="lg:sticky lg:top-28 lg:self-start">
          <form className="panel space-y-4 p-5" onSubmit={(e) => e.preventDefault()} aria-labelledby="route-title">
            <div className="flex items-center justify-between gap-2">
              <h2 id="route-title" className="font-semibold text-navy">
                Your route
              </h2>
              <div className="flex gap-1">
                <button type="button" onClick={reverse} className="btn-ghost px-2.5 py-1.5 text-xs" aria-label="Reverse the route">
                  <ArrowUpDown className="h-3.5 w-3.5" /> Reverse
                </button>
                <button
                  type="button"
                  onClick={() => load("")}
                  className="btn-ghost px-2.5 py-1.5 text-xs"
                  aria-label="Clear the route"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Clear
                </button>
              </div>
            </div>

            {dropped.length > 0 && (
              <p className="flex items-start gap-2 rounded-md bg-[#fdf4ea] px-3 py-2 text-xs leading-relaxed text-[#7a4106]" role="status">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                <span>
                  The link had more than 3 stops, so {dropped.join(", ")} {dropped.length === 1 ? "was" : "were"} left out. The origin
                  and destination are kept.
                </span>
              </p>
            )}
            <ol className="space-y-3">
              {slots.map((s, i) => {
                const isFirst = i === 0;
                const isLast = i === slots.length - 1;
                const label = isFirst ? "From" : isLast ? "To" : `Stop ${i}`;
                return (
                  <li key={s.key}>
                    <AirportInput
                      label={label}
                      kind={isFirst ? "origin" : isLast ? "destination" : "stop"}
                      value={s.code ? (byCode?.get(s.code) ?? null) : null}
                      onChange={(a) => setCode(s.key, a)}
                      airports={airports}
                      loading={loading}
                      focusOnMount={s.key === focusKey}
                      trailing={
                        !isFirst && !isLast ? (
                          <button
                            type="button"
                            onClick={() => removeStop(s.key)}
                            className="grid h-11 w-11 shrink-0 place-items-center rounded text-ink-3 hover:bg-canvas hover:text-danger"
                            aria-label={`Remove stop ${i}`}
                          >
                            <X className="h-4 w-4" />
                          </button>
                        ) : undefined
                      }
                    />
                    {s.code && byCode && !byCode.has(s.code) && (
                      <p className="mt-1 text-xs font-medium text-danger">We couldn&apos;t find an airport with the code {s.code}.</p>
                    )}
                    {repeats.includes(i) && (
                      <p className="mt-1 text-xs font-medium text-danger">Same airport as the one before: pick where this flight goes.</p>
                    )}
                    {i === slots.length - 2 && (
                      <button
                        type="button"
                        onClick={addStop}
                        disabled={slots.length - 2 >= MAX_STOPS}
                        className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-brand hover:underline disabled:cursor-not-allowed disabled:text-ink-3 disabled:no-underline"
                      >
                        <Plus className="h-4 w-4" /> {slots.length - 2 >= MAX_STOPS ? "Up to 3 stops" : "Add a stop"}
                      </button>
                    )}
                  </li>
                );
              })}
            </ol>

            <div className="border-t border-line pt-4">
              <p className="mb-2 text-xs font-semibold tracking-wide text-ink-3 uppercase">Try a route</p>
              <div className="flex flex-wrap gap-2">
                {EXAMPLES.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => load(r)}
                    className={cn("chip cursor-pointer hover:border-brand hover:text-brand", routeParam === r && "border-brand bg-sky text-brand")}
                    aria-pressed={routeParam === r}
                  >
                    {r.split("-").join(" → ")}
                  </button>
                ))}
              </div>
            </div>
          </form>
        </aside>

        <div className="min-w-0 space-y-6">
          {status === "error" && (
            <div className="panel flex flex-wrap items-center justify-between gap-3 border-danger/30 p-4 text-sm text-danger" role="alert">
              <span className="flex items-center gap-2">
                <TriangleAlert className="h-4 w-4" /> We couldn&apos;t load the airport list.
              </span>
              <button type="button" onClick={retry} className="btn-secondary px-3 py-1.5 text-xs">
                Try again
              </button>
            </div>
          )}

          <Summary summary={summary} loading={loading && codes.length >= 2} unknown={unknown} repeats={repeats.map((i) => slots[i].code ?? "")} />

          <section className="panel p-3 sm:p-4" aria-label="Route map">
            {airports ? (
              <RouteMap points={resolved} airports={airports} connect={summary !== null} />
            ) : (
              <div className="aspect-[1.55] w-full animate-pulse rounded-md bg-[#eef5fc] sm:aspect-[2.15]" />
            )}
            <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs text-ink-3">
              {summary && (
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-[3px] w-5 rounded bg-brand" aria-hidden /> Great-circle route
                </span>
              )}
              {summary?.extra && (
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-5 border-t-2 border-dashed border-ink-3" aria-hidden /> Nonstop
                </span>
              )}
              <span>Dots are airports with scheduled flights.</span>
            </p>
          </section>

          {summary && <LegsTable summary={summary} />}

          {/* Only for a route we could measure (not JFK-JFK or one with an unknown airport). */}
          {summary && region && dest && (
            <section className="panel flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-sky text-brand">
                  <Sparkles className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="font-semibold text-navy">Flying to {dest.city || countryName(dest.country)} on points?</h2>
                  <p className="text-sm text-ink-2">Award sweet spots for {region}: where miles go furthest.</p>
                </div>
              </div>
              <Link href={sweetSpotsHref(region)} className="btn-secondary shrink-0">
                {region} sweet spots <ArrowRight className="h-4 w-4" />
              </Link>
            </section>
          )}

          <div className="space-y-2 text-xs leading-relaxed text-ink-3">
            <p className="flex gap-2">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Great-circle distance (the shortest path over the globe, on a sphere of radius 6,371 km). Flights usually
                fly a little farther. Flight time is a rough estimate: 30 minutes plus an hour per 530 miles; real
                schedules vary with winds and routing.
              </span>
            </p>
            <p className="pl-5.5">
              Airport data:{" "}
              <a href="https://ourairports.com/data/" target="_blank" rel="noopener noreferrer" className="link font-medium">
                OurAirports
              </a>{" "}
              (public domain).
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, sub, icon: Icon }: { label: string; value: string; sub?: string; icon: typeof Route }) {
  return (
    <div className="flex gap-3 p-5">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-sky text-brand">
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-semibold tracking-wide text-ink-3 uppercase">{label}</p>
        <p className="mt-0.5 text-2xl font-semibold text-navy tabular-nums">{value}</p>
        {sub && <p className="text-sm text-ink-2 tabular-nums">{sub}</p>}
      </div>
    </div>
  );
}

function Summary({
  summary,
  loading,
  unknown,
  repeats,
}: {
  summary: ReturnType<typeof summarizeRoute> | null;
  loading: boolean;
  unknown: string[];
  /** Airports that repeat right after themselves (JFK-JFK). */
  repeats: string[];
}) {
  if (!summary) {
    return (
      <section className="panel p-5" aria-live="polite">
        {loading ? (
          <div className="h-16 animate-pulse rounded bg-canvas" />
        ) : (
          <div className="flex gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-sky text-brand">
              <Route className="h-5 w-5" />
            </span>
            <div>
              <h2 className="font-semibold text-navy">{unknown.length || repeats.length ? "Check your route" : "Where are you flying?"}</h2>
              <p className="text-sm text-ink-2">
                {unknown.length
                  ? `We couldn't find ${unknown.join(", ")}, so there's nothing to add up yet. Fix or remove ${unknown.length > 1 ? "those codes" : "that code"}.`
                  : repeats.length
                    ? `${repeats[0]} to ${repeats[0]} isn't a flight. Pick a different airport for that leg.`
                    : "Pick an origin and a destination, then add up to three stops to see how much farther they take you."}
              </p>
            </div>
          </div>
        )}
      </section>
    );
  }
  const { extra, nonstop } = summary;
  // The extra distance from the totals as shown (each leg rounded, as the total adds them up), so the numbers agree.
  const shownTotal = legTotal(summary, "miles");
  const shownDirect = nonstop ? Math.round(nonstop.miles) : 0;
  const shownExtra = shownTotal - shownDirect;
  const shownPercent = shownDirect ? (shownExtra / shownDirect) * 100 : 0;
  return (
    <section className="panel grid divide-y divide-line sm:grid-cols-3 sm:divide-x sm:divide-y-0" aria-live="polite" aria-label="Route summary">
      <Stat
        icon={Route}
        label="Total distance"
        value={`${whole(legTotal(summary, "miles"))} mi`}
        sub={`${whole(legTotal(summary, "km"))} km · ${whole(legTotal(summary, "nm"))} nm`}
      />
      <Stat
        icon={Clock}
        label="Flight time"
        value={`≈ ${formatDuration(summary.minutes)}`}
        sub={summary.legs.length > 1 ? `In the air, over ${summary.legs.length} flights` : "Nonstop, gate to gate"}
      />
      {extra && nonstop ? (
        <Stat
          icon={ArrowUpDown}
          label="Versus nonstop"
          value={`+${whole(shownExtra)} mi`}
          sub={`${shownPercent < 0.05 ? "0" : shownPercent.toFixed(shownPercent < 10 ? 1 : 0)}% farther than ${whole(shownDirect)} mi direct`}
        />
      ) : (
        <Stat
          icon={ArrowUpDown}
          label="Versus nonstop"
          value={summary.legs.length > 1 ? "Round trip" : "Nonstop"}
          sub={summary.legs.length > 1 ? "Ends where it starts" : "Add a stop to compare"}
        />
      )}
    </section>
  );
}

function LegsTable({ summary }: { summary: ReturnType<typeof summarizeRoute> }) {
  const many = summary.legs.length > 1;
  return (
    <section className="panel overflow-hidden" aria-labelledby="legs-title">
      <h2 id="legs-title" className="px-5 pt-5 pb-3 font-semibold text-navy">
        {many ? "Leg by leg" : "Your flight"}
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">Distance and estimated flight time for each leg</caption>
          <thead>
            <tr className="border-y border-line bg-canvas text-left text-xs font-semibold tracking-wide text-ink-3 uppercase">
              <th scope="col" className="py-2.5 pr-2 pl-4 sm:pl-5">
                Leg
              </th>
              <th scope="col" className="px-2 py-2.5 text-right sm:px-3">
                Miles
              </th>
              <th scope="col" className="hidden px-3 py-2.5 text-right sm:table-cell">
                Km
              </th>
              <th scope="col" className="hidden px-3 py-2.5 text-right md:table-cell">
                Nm
              </th>
              <th scope="col" className="py-2.5 pr-4 pl-2 text-right sm:pr-5">
                Time
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {summary.legs.map((l, i) => (
              <tr key={i}>
                <th scope="row" className="py-3 pr-2 pl-4 text-left font-normal sm:pl-5">
                  <span className="font-semibold whitespace-nowrap text-navy">
                    {l.from.code} → {l.to.code}
                  </span>
                  <span className="block max-w-[10rem] truncate text-xs text-ink-3 sm:max-w-none">
                    {l.from.city || l.from.name} to {l.to.city || l.to.name}
                  </span>
                </th>
                <td className="px-2 py-3 text-right font-medium text-ink tabular-nums sm:px-3">
                  {whole(l.miles)}
                  <span className="block text-xs font-normal text-ink-3 sm:hidden">{whole(l.km)} km</span>
                </td>
                <td className="hidden px-3 py-3 text-right text-ink-2 tabular-nums sm:table-cell">{whole(l.km)}</td>
                <td className="hidden px-3 py-3 text-right text-ink-2 tabular-nums md:table-cell">{whole(l.nm)}</td>
                <td className="py-3 pr-4 pl-2 text-right whitespace-nowrap text-ink-2 tabular-nums sm:pr-5">{formatDuration(l.minutes)}</td>
              </tr>
            ))}
          </tbody>
          {many && (
            <tfoot>
              <tr className="border-t-2 border-line bg-canvas font-semibold">
                <th scope="row" className="py-3 pr-2 pl-4 text-left text-navy sm:pl-5">
                  Total
                </th>
                <td className="px-2 py-3 text-right text-navy tabular-nums sm:px-3">
                  {whole(legTotal(summary, "miles"))}
                  <span className="block text-xs font-normal text-ink-3 sm:hidden">{whole(legTotal(summary, "km"))} km</span>
                </td>
                <td className="hidden px-3 py-3 text-right text-ink tabular-nums sm:table-cell">{whole(legTotal(summary, "km"))}</td>
                <td className="hidden px-3 py-3 text-right text-ink tabular-nums md:table-cell">{whole(legTotal(summary, "nm"))}</td>
                <td className="py-3 pr-4 pl-2 text-right whitespace-nowrap text-ink tabular-nums sm:pr-5">{formatDuration(summary.minutes)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </section>
  );
}
