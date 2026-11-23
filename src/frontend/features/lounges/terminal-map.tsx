"use client";

import { Check, Lock } from "lucide-react";
import type { Lounge } from "@/shared/data/types";
import { loungeNetworks } from "@/shared/data/networks";
import { gateOf, type LoungeAccessGrant, type TerminalGroup } from "@/shared/lib/lounge-access";
import { cn } from "@/shared/lib/format";

/** Short marker label under a pin: the gate if we know it, else the concourse. */
function pinLabel(l: Lounge, terminal: string) {
  const gate = gateOf(l);
  if (gate) return gate;
  const rest = l.terminal.slice(terminal.length).replace(/^,\s*/, "");
  return rest.replace(/^Concourse\s+/i, "Conc. ") || "";
}

/**
 * Schematic terminal map: one strip per terminal/concourse in physical order, with a pin per lounge spaced by gate.
 * Pins link to the lounge's entry in the list below. Not to scale — it shows where things are relative to each
 * other, which is what you need between gates.
 */
export function TerminalMap({
  groups,
  grants,
  checking,
  visible,
}: {
  groups: TerminalGroup[];
  grants: Map<string, LoungeAccessGrant[]>;
  checking: boolean;
  visible: (l: Lounge) => boolean;
}) {
  const rows = groups.map((g) => ({ ...g, shown: g.lounges.filter(visible) })).filter((g) => g.shown.length > 0);
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
      {rows.length === 0 ? (
        <p className="mt-6 text-sm text-ink-2">No lounges match these filters.</p>
      ) : (
        <ol className="mt-4">
          {rows.map((g) => {
            const open = g.lounges.filter((l) => (grants.get(l.id)?.length ?? 0) > 0).length;
            return (
              <li key={g.terminal} className="grid gap-x-5 gap-y-1 border-t border-line py-4 sm:grid-cols-[10rem_1fr] sm:items-center">
                <div>
                  <p className="font-semibold text-ink">{g.terminal}</p>
                  <p className="text-xs text-ink-3">
                    {checking ? `${open} of ${g.lounges.length} open to you` : `${g.lounges.length} lounge${g.lounges.length === 1 ? "" : "s"}`}
                  </p>
                </div>
                <div className="relative h-[88px]">
                  {/* the concourse */}
                  <div className="absolute inset-x-0 top-[34px] h-3 rounded-full border border-line bg-canvas" />
                  {g.shown.map((l, i) => {
                    const net = loungeNetworks[l.network];
                    const ok = (grants.get(l.id)?.length ?? 0) > 0;
                    const label = pinLabel(l, g.terminal);
                    return (
                      <a
                        key={l.id}
                        href={`#lounge-${l.id}`}
                        title={`${l.name} (${net.label})${checking ? (ok ? " — you can get in" : " — not with these cards") : ""}`}
                        className="group absolute top-0 flex w-20 -translate-x-1/2 flex-col items-center text-center"
                        style={{ left: `${((i + 0.5) / g.shown.length) * 100}%` }}
                      >
                        <span
                          className={cn(
                            "grid h-8 w-8 place-items-center rounded-full border-2 shadow-sm transition-transform group-hover:scale-110",
                            !checking || ok ? "border-white text-white" : "border-ink-3 bg-white text-ink-3",
                          )}
                          style={!checking || ok ? { background: net.color } : undefined}
                        >
                          {checking && !ok ? <Lock className="h-3.5 w-3.5" /> : <Check className="h-4 w-4" />}
                        </span>
                        <span className="mt-[14px] max-w-full truncate text-[11px] font-semibold text-ink-2">{label}</span>
                        <span className="max-w-full truncate text-[11px] text-ink-3 group-hover:text-brand">{net.short}</span>
                      </a>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
