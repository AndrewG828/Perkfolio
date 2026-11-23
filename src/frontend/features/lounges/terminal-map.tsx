"use client";

import { Bus, Check, Footprints, Lock, ShieldAlert, TrainFront } from "lucide-react";
import type { Lounge } from "@/shared/data/types";
import type { NavLink } from "@/shared/data/airport-nav";
import { loungeNetworks } from "@/shared/data/networks";
import { gateOf, type LoungeAccessGrant } from "@/shared/lib/lounge-access";
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

/** Short marker label under a pin: the gate if we know it, else the concourse. */
function pinLabel(l: Lounge, rowTitle: string) {
  const gate = gateOf(l);
  if (gate) return gate;
  const rest = l.terminal.startsWith(rowTitle) ? l.terminal.slice(rowTitle.length).replace(/^,\s*/, "") : "";
  return rest.replace(/^Concourse\s+/i, "Conc. ");
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
  checking,
  visible,
  route,
  onPick,
  linkKey,
}: {
  rows: MapRow[];
  grants: Map<string, LoungeAccessGrant[]>;
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
          Terminal map
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
          const open = row.lounges.filter((l) => (grants.get(l.id)?.length ?? 0) > 0).length;
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
                        ? `${open} of ${row.lounges.length} open to you`
                        : `${row.lounges.length} lounge${row.lounges.length === 1 ? "" : "s"}`}
                  </p>
                </div>
                <div className="relative h-[88px]">
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
                        <span key="you" className="absolute top-0 flex w-20 -translate-x-1/2 flex-col items-center" style={{ left }}>
                          <span className="grid h-8 w-8 place-items-center rounded-full border-2 border-white bg-navy text-[10px] font-bold text-white shadow-md ring-4 ring-navy/20">
                            You
                          </span>
                          <span className="mt-[14px] text-[11px] font-semibold text-navy">{it.label}</span>
                        </span>
                      );
                    }
                    const l = it.lounge;
                    const net = loungeNetworks[l.network];
                    const ok = (grants.get(l.id)?.length ?? 0) > 0;
                    const target = route?.targetId === l.id;
                    return (
                      <button
                        key={l.id}
                        type="button"
                        onClick={() => onPick?.(l)}
                        title={`${l.name} (${net.label})${checking ? (ok ? " — you can get in" : " — not with these cards") : ""}. Click for directions.`}
                        aria-label={`Directions to ${l.name}, ${pinLabel(l, row.title) || row.title}`}
                        aria-pressed={target}
                        className="group absolute top-0 flex w-20 -translate-x-1/2 flex-col items-center text-center"
                        style={{ left }}
                      >
                        <span
                          className={cn(
                            "grid h-8 w-8 place-items-center rounded-full border-2 shadow-sm transition-transform group-hover:scale-110",
                            !checking || ok ? "border-white text-white" : "border-ink-3 bg-white text-ink-3",
                            target && "scale-110 ring-4 ring-brand/40",
                          )}
                          style={!checking || ok ? { background: net.color } : undefined}
                        >
                          {checking && !ok ? <Lock className="h-3.5 w-3.5" /> : <Check className="h-4 w-4" />}
                        </span>
                        <span className="mt-[14px] max-w-full truncate text-[11px] font-semibold text-ink-2">{pinLabel(l, row.title)}</span>
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
