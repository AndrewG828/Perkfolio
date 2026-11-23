"use client";

import { AlertTriangle, ArrowRight, Bus, DoorOpen, Flag, Footprints, MapPinned, Navigation, ShieldCheck, TrainFront } from "lucide-react";
import type { Airport, Lounge } from "@/shared/data/types";
import type { AirportNav } from "@/shared/data/airport-nav";
import { loungeNetworks } from "@/shared/data/networks";
import { appleMapsUrl, googleMapsUrl, type OriginResult, type Route, type StepKind } from "@/shared/lib/wayfinding";
import { cn } from "@/shared/lib/format";

const STEP_ICON: Record<StepKind, typeof Footprints> = {
  walk: Footprints,
  train: TrainFront,
  bus: Bus,
  security: ShieldCheck,
  exit: DoorOpen,
  landside: TrainFront,
  arrive: Flag,
};

export interface RankedLounge {
  lounge: Lounge;
  route: Route;
  open: boolean;
}

/**
 * "Where are you → which lounge": type a gate (or pick a concourse / "before security"), get step-by-step directions
 * to the chosen lounge (by default the nearest one your cards open), then hand off to Apple or Google Maps for
 * their indoor walking maps.
 */
export function DirectionsPanel({
  airport,
  nav,
  from,
  setFrom,
  fromSecurityDefault,
  resolved,
  target,
  setTarget,
  autoTarget,
  route,
  ranked,
  lounges,
  checking,
}: {
  airport: Airport;
  nav: AirportNav | null;
  from: string;
  setFrom: (v: string) => void;
  /** No gate given yet, so the route shown starts at security. */
  fromSecurityDefault: boolean;
  resolved: OriginResult | null;
  target: Lounge | null;
  setTarget: (id: string) => void;
  autoTarget: boolean;
  route: Route | null;
  ranked: RankedLounge[];
  lounges: Lounge[];
  checking: boolean;
}) {
  const gateText = from === "landside" || from.startsWith("@") ? "" : from;
  const pickedZone = from.startsWith("@") ? from.slice(1).split(":")[0] : null;
  const nearby = ranked.filter((r) => !checking || r.open).slice(0, 4);

  return (
    <section className="panel overflow-hidden" aria-labelledby="directions-title">
      <div className="border-b border-line bg-sky/60 p-5">
        <h2 id="directions-title" className="flex items-center gap-2 text-lg font-semibold text-navy">
          <Navigation className="h-5 w-5 text-brand" /> Directions
        </h2>
        {nav ? (
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="from-gate" className="text-sm font-medium text-ink-2">
                I&apos;m at gate
              </label>
              <input
                id="from-gate"
                className="input h-11 w-28 text-base font-semibold uppercase placeholder:font-normal placeholder:normal-case placeholder:text-ink-3"
                placeholder="Gate #"
                aria-describedby="from-hint"
                value={gateText}
                onChange={(e) => setFrom(e.target.value.toUpperCase())}
                autoComplete="off"
                inputMode="text"
                maxLength={6}
              />
              <span className="text-sm text-ink-3">or</span>
              <button
                type="button"
                onClick={() => setFrom(from === "landside" ? "" : "landside")}
                className={cn("chip cursor-pointer", from === "landside" && "border-brand bg-white text-brand")}
                aria-pressed={from === "landside"}
              >
                <DoorOpen className="h-3.5 w-3.5" /> Before security
              </button>
            </div>
            {resolved && !resolved.ok && resolved.reason !== "empty" && (
              <p className="text-sm text-warn">
                {resolved.reason === "ambiguous"
                  ? `Gate ${resolved.gate?.label} is in more than one terminal at ${airport.code}. Which one?`
                  : `We don't know that gate at ${airport.code}. Pick where you are:`}
              </p>
            )}
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Or pick where you are">
              {(resolved && !resolved.ok ? resolved.options : nav.zones).map((z) => (
                <button
                  key={z.id}
                  type="button"
                  onClick={() => setFrom(resolved && !resolved.ok && resolved.gate ? `@${z.id}:${resolved.gate.label}` : `@${z.id}`)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs font-medium",
                    pickedZone === z.id || (resolved?.ok && resolved.origin.kind === "gate" && resolved.origin.zone === z.id)
                      ? "border-brand bg-white text-brand"
                      : "border-line bg-white/70 text-ink-2 hover:border-brand",
                  )}
                >
                  {z.name}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <p className="mt-2 text-sm text-ink-2">
            Step-by-step directions inside the airport are available at our 17 big airports (ATL, JFK, LAX, ORD and more). Here,
            open the lounge in Apple or Google Maps for walking directions.
          </p>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <label htmlFor="to-lounge" className="text-sm font-medium text-ink-2">
            Going to
          </label>
          <select
            id="to-lounge"
            className="input h-11 max-w-full min-w-0 flex-1 text-sm"
            value={autoTarget ? "" : (target?.id ?? "")}
            onChange={(e) => setTarget(e.target.value)}
          >
            <option value="">{checking ? "Nearest lounge I can get into" : "Nearest lounge"}</option>
            {lounges.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} — {l.terminal}
                {l.location ? `, ${l.location}` : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="p-5">
        {!target ? (
          <p className="text-sm text-ink-2">
            {checking ? "None of your cards gets you into a lounge here. Pick any lounge to see the way." : "Pick a lounge to see the way."}
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold tracking-wide uppercase" style={{ color: loungeNetworks[target.network].color }}>
                  {autoTarget ? "Nearest lounge for you" : loungeNetworks[target.network].label}
                </p>
                <p className="text-lg font-semibold text-ink">{target.name}</p>
                <p className="text-sm text-ink-2">
                  {target.terminal}
                  {target.location ? ` · ${target.location}` : ""}
                </p>
              </div>
              {route && (
                <p className="text-right">
                  <span className="text-2xl font-semibold text-navy">~{route.minutes}</span>{" "}
                  <span className="text-sm text-ink-2">min</span>
                  {route.reclearsSecurity && <span className="block text-xs font-semibold text-warn">Includes security</span>}
                </p>
              )}
            </div>

            {fromSecurityDefault && (
              <p id="from-hint" className="mt-4 rounded-md bg-sky p-3 text-sm text-navy">
                Showing the way from security. <strong>Enter your gate above</strong> to start from there instead.
              </p>
            )}

            {route && (
              <ol className="mt-4 space-y-0">
                {route.steps.map((s, i) => {
                  const Icon = STEP_ICON[s.kind];
                  const last = i === route.steps.length - 1;
                  return (
                    <li key={i} className="relative flex gap-3 pb-4 last:pb-0">
                      {!last && <span className="absolute top-8 bottom-0 left-[15px] w-px bg-line" aria-hidden />}
                      <span
                        className={cn(
                          "relative grid h-8 w-8 shrink-0 place-items-center rounded-full",
                          last ? "bg-brand text-white" : s.kind === "security" || s.kind === "exit" ? "bg-warn/10 text-warn" : "bg-sky text-brand",
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 pt-1">
                        <p className="text-sm font-medium text-ink">
                          {s.text} <span className="font-normal text-ink-3">· {s.minutes} min</span>
                        </p>
                        {s.caution && (
                          <p className="mt-1 flex items-start gap-1 text-xs text-warn">
                            <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" /> {s.caution}
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}

            <div className="mt-5 flex flex-wrap gap-2">
              <a className={cn(nav ? "btn-secondary" : "btn-primary", "px-4")} href={appleMapsUrl(target, airport.name)} target="_blank" rel="noopener noreferrer">
                <MapPinned className="h-4 w-4" /> Apple Maps
              </a>
              <a className="btn-secondary px-4" href={googleMapsUrl(target, airport.name)} target="_blank" rel="noopener noreferrer">
                <MapPinned className="h-4 w-4" /> Google Maps
              </a>
              <a className="btn-ghost px-3" href={`#lounge-${target.id}`}>
                Lounge details <ArrowRight className="h-4 w-4" />
              </a>
            </div>
            <p className="mt-3 text-xs text-ink-3">
              Times are estimates. Follow airport signs; connections can change during construction. Apple and Google Maps
              show indoor walking maps at many large airports.
              {nav?.note ? ` ${nav.note}` : ""}
            </p>
          </>
        )}

        {nav && nearby.length > 1 && (
          <div className="mt-5 border-t border-line pt-4">
            <p className="text-sm font-semibold text-ink">{checking ? "Lounges you can get into, nearest first" : "Nearest lounges"}</p>
            <ul className="mt-2 grid gap-2 sm:grid-cols-2">
              {nearby.map(({ lounge, route: r }) => (
                <li key={lounge.id}>
                  <button
                    type="button"
                    onClick={() => setTarget(lounge.id)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm",
                      target?.id === lounge.id ? "border-brand bg-sky" : "border-line hover:border-brand",
                    )}
                  >
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: loungeNetworks[lounge.network].color }} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-ink">{lounge.name}</span>
                      <span className="block truncate text-xs text-ink-3">{lounge.location ? `${lounge.terminal.split(",")[0]} · ${lounge.location}` : lounge.terminal}</span>
                    </span>
                    <span className="shrink-0 text-right text-xs">
                      <span className="font-semibold text-navy">~{r.minutes} min</span>
                      {r.reclearsSecurity && <span className="block text-warn">+ security</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
