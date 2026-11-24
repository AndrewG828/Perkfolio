"use client";

import { Bus, Check, Clock, Footprints, Lock, ShieldAlert, TrainFront } from "lucide-react";
import type { Lounge } from "@/shared/data/types";
import type { NavLink } from "@/shared/data/airport-nav";
import { loungeNetworks } from "@/shared/data/networks";
import type { LoungeAccessGrant } from "@/shared/lib/lounge-access";
import { gateOf, openOfLabel } from "@/shared/lib/lounge-directory";
import { cn } from "@/shared/lib/format";

export interface MapRow {
  id: string;
  title: string;
  lounges: Lounge[];
  /** Connection to the next row: a direct airside link, or none when they're not connected after security. */
  next?: { link?: NavLink; connected: boolean };
}

export interface MapRoute {
  zones: Set<string>;
  links: Set<string>;
  /** Where "You" is: row id and gate number (if known). */
  you?: { row: string; gate?: number; label: string };
  targetId?: string;
}

const LINK_ICON = { walk: Footprints, train: TrainFront, bus: Bus } as const;
const gateNum = (l: Lounge) => Number(/\d+/.exec(gateOf(l) ?? "")?.[0] ?? NaN);

/**
 * Short marker label under a pin: the gate if we know it, else the concourse, else what sets the lounge apart from
 * its network's name ("First" for Plaza Premium First), so two gate-less pins of one network don't read the same.
 */
function pinLabel(l: Lounge, rowTitle: string) {
  const gate = gateOf(l);
  if (gate) return gate;
  const rest = l.terminal.startsWith(rowTitle) ? l.terminal.slice(rowTitle.length).replace(/^,\s*/, "") : "";
  if (rest) return rest.replace(/^Concourse\s+/i, "Conc. ");
  const net = loungeNetworks[l.network];
  const own = l.name
    .replace(new RegExp(`^${net.short}\\s*`, "i"), "")
    .replace(/^(Lounge|Club)\b\s*/i, "")
    .trim();
  return own && own.toLowerCase() !== l.name.toLowerCase() ? own : "";
}

type Item = { kind: "lounge"; lounge: Lounge } | { kind: "you"; label: string };

/**
 * Schematic terminal map: one strip per concourse/terminal in physical order, a pin per lounge spaced by gate,
 * and (where we have wayfinding data) the train/walkway between strips. A route is drawn by highlighting the strips
 * and links it uses, with a "You" marker at your gate and a ring on the destination. Clicking a pin picks it as the
 * destination. Not to scale.
 */
export function TerminalMap({
  rows,
  grants,
  closed = () => false,
  checking,
  visible,
  route,
  onPick,
  linkKey,
}: {
  rows: MapRow[];
  grants: Map<string, LoungeAccessGrant[]>;
  /** Lounges closed for now: a clock pin, never counted as open. */
  closed?: (l: Lounge) => boolean;
  checking: boolean;
  visible: (l: Lounge) => boolean;
  route?: MapRoute;
  onPick?: (l: Lounge) => void;
  linkKey?: (a: string, b: string) => string;
}) {
  return (
    <section className="panel p-5" aria-labelledby="terminal-map-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="terminal-map-title" className="text-lg font-semibold text-navy">
          Concourse overview
        </h2>
        <div className="flex flex-wrap items-center gap-4 text-xs text-ink-2">
          {checking && (
            <>
              <span className="flex items-center gap-1.5">
                <span className="grid h-4 w-4 place-items-center rounded-full bg-navy text-white">
                  <Check className="h-2.5 w-2.5" />
                </span>
                You can get in (colored by network)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="grid h-4 w-4 place-items-center rounded-full border border-ink-3 bg-white text-ink-3">
                  <Lock className="h-2.5 w-2.5" />
                </span>
                Not with these cards
              </span>
            </>
          )}
          {rows.some((r) => r.lounges.some(closed)) && (
            <span className="flex items-center gap-1.5">
              <span className="grid h-4 w-4 place-items-center rounded-full border border-dashed border-warn bg-white text-warn">
                <Clock className="h-2.5 w-2.5" />
              </span>
              Closed for now
            </span>
          )}
          <span className="text-ink-3">Schematic · not to scale</span>
        </div>
      </div>
      <ol className="mt-4">
        {rows.map((row, idx) => {
          const shown = row.lounges.filter(visible);
          const onRoute = route?.zones.has(row.id);
          const you = route?.you?.row === row.id ? route.you : undefined;
          const items: Item[] = shown.map((lounge) => ({ kind: "lounge", lounge }));
          if (you) {
            const at = you.gate === undefined ? 0 : items.findIndex((it) => it.kind === "lounge" && gateNum(it.lounge) > you.gate!);
            items.splice(at === -1 ? items.length : at, 0, { kind: "you", label: you.label });
          }
          const open = row.lounges.filter((l) => !closed(l) && (grants.get(l.id)?.length ?? 0) > 0).length;
          // Pins closer together than a label is wide: labels alternate between two lines so neighbours don't overlap.
          const crowded = items.length >= 5;
          const next = row.next;
          const nextRow = rows[idx + 1];
          const nextOnRoute = next?.link && linkKey && nextRow && route?.links.has(linkKey(row.id, nextRow.id));
          const Icon = next?.link ? LINK_ICON[next.link.mode] : null;
          return (
            <li key={row.id}>
              <div className={cn("grid gap-x-5 gap-y-1 border-t border-line py-4 sm:grid-cols-[10rem_1fr] sm:items-center", idx > 0 && next === undefined && "")}>
                <div>
                  <p className={cn("font-semibold", onRoute ? "text-brand" : "text-ink")}>{row.title}</p>
                  <p className="text-xs text-ink-3">
                    {row.lounges.length === 0
                      ? "No lounges"
                      : checking
                        ? openOfLabel(open, row.lounges.length, row.lounges.filter(closed).length)
                        : `${row.lounges.length} lounge${row.lounges.length === 1 ? "" : "s"}`}
                  </p>
                </div>
                <div className={cn("relative", crowded ? "h-[112px]" : "h-[88px]")}>
                  <div
                    className={cn(
                      "absolute inset-x-0 top-[34px] h-3 rounded-full border",
                      onRoute ? "border-brand bg-brand/25" : "border-line bg-canvas",
                    )}
                  />
                  {items.map((it, i) => {
                    const left = `${((i + 0.5) / items.length) * 100}%`;
                    if (it.kind === "you") {
                      return (
                        <span
                          key="you"
                          className="absolute top-0 flex -translate-x-1/2 flex-col items-center"
                          style={{ left, width: `min(${crowded ? 7 : 5}rem, ${(crowded ? 2 : 1) * (100 / items.length)}%)` }}
                        >
                          <span className="grid h-8 w-8 place-items-center rounded-full border-2 border-white bg-navy text-[10px] font-bold text-white shadow-md ring-4 ring-navy/20">
                            You
                          </span>
                          <span className={cn("max-w-full truncate text-[11px] font-semibold text-navy", crowded && i % 2 === 1 ? "mt-[46px]" : "mt-[14px]")}>
                            {it.label}
                          </span>
                        </span>
                      );
                    }
                    const l = it.lounge;
                    const net = loungeNetworks[l.network];
                    const shut = closed(l);
                    const ok = !shut && (grants.get(l.id)?.length ?? 0) > 0;
                    const target = route?.targetId === l.id;
                    const label = pinLabel(l, row.title);
                    // Staggered labels may use two slots' width; otherwise one slot's, up to 5rem.
                    const slot = 100 / items.length;
                    const low = crowded && i % 2 === 1;
                    return (
                      <button
                        key={l.id}
                        type="button"
                        onClick={() => onPick?.(l)}
                        title={`${l.name} (${net.label})${shut ? " — closed for now" : checking ? (ok ? " — you can get in" : " — not with these cards") : ""}. Click for directions.`}
                        aria-label={`Directions to ${l.name}, ${label || row.title}${shut ? " (closed for now)" : ""}`}
                        aria-pressed={target}
                        className="group absolute top-0 flex -translate-x-1/2 flex-col items-center text-center"
                        style={{ left, width: `min(${crowded ? 7 : 5}rem, ${(crowded ? 2 : 1) * slot}%)` }}
                      >
                        <span
                          className={cn(
                            "grid h-8 w-8 place-items-center rounded-full border-2 shadow-sm transition-transform group-hover:scale-110",
                            shut
                              ? "border-dashed border-warn bg-white text-warn"
                              : !checking || ok
                                ? "border-white text-white"
                                : "border-ink-3 bg-white text-ink-3",
                            target && "scale-110 ring-4 ring-brand/40",
                          )}
                          style={!shut && (!checking || ok) ? { background: net.color } : undefined}
                        >
                          {shut ? <Clock className="h-3.5 w-3.5" /> : checking && !ok ? <Lock className="h-3.5 w-3.5" /> : <Check className="h-4 w-4" />}
                        </span>
                        <span className={cn("max-w-full truncate text-[11px] font-semibold text-ink-2", low ? "mt-[46px]" : "mt-[14px]")}>
                          {label || "\u00a0"}
                        </span>
                        <span className={cn("max-w-full truncate text-[11px] group-hover:text-brand", target ? "font-semibold text-brand" : "text-ink-3")}>
                          {net.short}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
              {next && nextRow && (
                <div className="flex items-center gap-2 pb-1 pl-0 text-xs sm:pl-[11.25rem]">
                  <span className={cn("h-4 w-px", nextOnRoute ? "bg-brand" : "bg-line")} />
                  {next.link && Icon ? (
                    <span className={cn("inline-flex items-center gap-1", nextOnRoute ? "font-semibold text-brand" : "text-ink-3")}>
                      <Icon className="h-3.5 w-3.5" />
                      {next.link.via ? next.link.via.replace(/^the /, "") : next.link.mode === "walk" ? "Walkway" : next.link.mode}
                      {" · "}
                      {next.link.minutes} min
                      {next.link.caution && <ShieldAlert className="h-3.5 w-3.5 text-warn" aria-label="Restrictions apply" />}
                    </span>
                  ) : next.connected ? (
                    <span className="text-ink-3">Connected after security</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-warn">
                      <ShieldAlert className="h-3.5 w-3.5" /> Not connected after security
                    </span>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
