"use client";

import Link from "next/link";
import { useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight } from "lucide-react";
import type { LoungeNetwork } from "@/shared/data/types";
import { airports, lounges } from "@/shared/data/lounges";
import { loungeNetworks } from "@/shared/data/networks";
import {
  accessibleCountByAirport,
  bigAirports,
  closedCountByAirport,
  loungeCountByAirport,
  loungesAt,
  networksFor,
} from "@/shared/lib/lounge-access";
import { openOfLabel } from "@/shared/lib/lounge-directory";
import { isoDate } from "@/shared/lib/dates";
import { useHydrated } from "@/frontend/state/wallet-store";
import { AccessPicker, useAccessSelection } from "./access-picker";
import { AirportSearch } from "./airport-search";
import { GuestCostFinder } from "./guest-cost";

/** Lounge finder home: search, the big airports with your access at each, and every airport we cover. */
export function LoungeFinder() {
  const params = useSearchParams();
  const router = useRouter();
  const access = useAccessSelection();
  const hydrated = useHydrated();
  const checking = access.mode !== "all" && access.selected.length > 0 && hydrated;
  const selectedKey = access.selected.map((c) => c.id).join(",");
  // Closed lounges aren't counted (dated closures only once the visitor's date is known).
  const today = hydrated ? isoDate(new Date()) : null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const openAt = useMemo(() => accessibleCountByAirport(access.selected, today), [selectedKey, today]);
  // Closed lounges aren't counted against your cards: tiles say "5 of 5 open lounges · 1 closed", as airport pages do.
  const closedAt = useMemo(() => closedCountByAirport(today), [today]);
  const totalOpen = Object.values(openAt).reduce((s, n) => s + n, 0);
  const airportsOpen = Object.keys(openAt).length;

  // Old links (/lounges?airport=JFK) go to the airport's own page.
  const legacy = params.get("airport")?.toUpperCase();
  useEffect(() => {
    if (legacy && loungeCountByAirport[legacy]) router.replace(`/lounges/${legacy}${access.carry}`);
  }, [legacy, router, access.carry]);

  return (
    <div className="bg-canvas">
      {/*
        Two columns on large screens: the sidebar (access, guests, networks) and the main column (search, big airports,
        directory). On phones both wrappers dissolve (display: contents) so their panels interleave by `order`: search
        first, then your access, the big airports, the guest calculator, networks and the directory.
      */}
      <div className="container-page grid grid-cols-1 gap-8 py-10 lg:grid-cols-[320px_1fr]">
        <div className="aside-sticky contents lg:block lg:space-y-5">
          <div className="order-2">
            <AccessPicker access={access} />
          </div>
          <div className="order-4">
            <GuestCostFinder
              cardIds={access.mode === "all" ? "all" : access.selected.map((c) => c.id)}
              ready={access.mode !== "wallet" || hydrated}
            />
          </div>
          <div className="panel order-5 p-5">
            <h2 className="text-sm font-semibold text-ink">Lounge networks</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {(Object.keys(loungeNetworks) as LoungeNetwork[])
                .filter((n) => lounges.some((l) => networksFor(l).includes(n)))
                .map((n) => (
                  <li key={n} className="flex items-center gap-2 text-ink-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: loungeNetworks[n].color }} />
                    {loungeNetworks[n].label}
                    <span className="ml-auto text-xs text-ink-3">{lounges.filter((l) => networksFor(l).includes(n)).length}</span>
                  </li>
                ))}
            </ul>
          </div>
        </div>

        <div className="contents lg:block lg:min-w-0 lg:space-y-8">
          <div className="panel relative order-1 min-w-0 p-5">
            <p className="mb-2 text-sm font-semibold text-ink">Find an airport</p>
            <AirportSearch carry={access.carry} />
            {checking && (
              <p className="mt-4 text-sm text-ink-2">
                Your cards open <strong className="text-navy">{totalOpen} lounges</strong> across{" "}
                <strong className="text-navy">{airportsOpen} airports</strong> in our directory.
              </p>
            )}
          </div>

          <section className="order-3 min-w-0">
            <h2 className="mb-1 text-lg font-semibold text-navy">Big airports</h2>
            <p className="mb-4 text-sm text-ink-2">Each has a terminal map showing where every lounge is.</p>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {bigAirports.map((a) => {
                const nets = Array.from(new Set(loungesAt(a.code).map((l) => l.network)));
                const open = openAt[a.code] ?? 0;
                return (
                  <Link
                    key={a.code}
                    href={`/lounges/${a.code}${access.carry}`}
                    className="panel group flex flex-col gap-3 p-4 transition-shadow hover:shadow-[var(--shadow-lift)]"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-2xl font-semibold text-navy">{a.code}</span>
                      <span className="truncate text-sm text-ink-2">{a.city}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      {nets.map((n) => (
                        <span key={n} title={loungeNetworks[n].label} className="h-2.5 w-2.5 rounded-full" style={{ background: loungeNetworks[n].color }} />
                      ))}
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-ink-2">
                        {checking ? (
                          <>
                            <strong className={open ? "text-success" : "text-ink-3"}>{open}</strong>{" "}
                            {openOfLabel(open, loungeCountByAirport[a.code], closedAt[a.code] ?? 0).replace(/^\d+ /, "")}
                          </>
                        ) : (
                          `${loungeCountByAirport[a.code]} lounges`
                        )}
                      </span>
                      <span className="inline-flex items-center gap-1 font-semibold text-brand">
                        Map <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>

          <div className="order-6 min-w-0">
            <AirportDirectory openAt={openAt} closedAt={closedAt} checking={checking} carry={access.carry} />
          </div>
        </div>
      </div>
    </div>
  );
}

function AirportDirectory({
  openAt,
  closedAt,
  checking,
  carry,
}: {
  openAt: Record<string, number>;
  closedAt: Record<string, number>;
  checking: boolean;
  carry: string;
}) {
  const byRegion = airports
    .filter((a) => loungeCountByAirport[a.code])
    .reduce<Record<string, typeof airports>>((m, a) => {
      (m[a.country === "United States" ? "United States" : "International"] ??= []).push(a);
      return m;
    }, {});
  return (
    <div className="space-y-8">
      {["United States", "International"].map((region) =>
        byRegion[region] ? (
          <section key={region}>
            <h2 className="mb-3 text-lg font-semibold text-navy">{region}</h2>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {byRegion[region]
                .sort((a, b) => a.city.localeCompare(b.city))
                .map((a) => (
                  <Link
                    key={a.code}
                    href={`/lounges/${a.code}${carry}`}
                    className="flex items-center gap-3 rounded-md border border-line bg-white px-4 py-3 text-left transition-colors hover:border-brand"
                  >
                    <span className="w-11 font-semibold text-navy">{a.code}</span>
                    <span className="min-w-0 flex-1 truncate text-sm text-ink-2">{a.city}</span>
                    <span className="text-xs text-ink-3">
                      {checking ? `${openAt[a.code] ?? 0}/${loungeCountByAirport[a.code] - (closedAt[a.code] ?? 0)}` : loungeCountByAirport[a.code]}
                    </span>
                  </Link>
                ))}
            </div>
          </section>
        ) : null,
      )}
    </div>
  );
}
