"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, MapPin, Search, X } from "lucide-react";
import type { Card, Lounge, LoungeNetwork } from "@/shared/data/types";
import { airports, lounges } from "@/shared/data/lounges";
import { cards, getCard } from "@/shared/data/cards";
import { loungeNetworks } from "@/shared/data/networks";
import { CardArt } from "@/frontend/components/card-art";
import { useWallet } from "@/frontend/state/wallet-store";
import { cn } from "@/shared/lib/format";

const airportByCode = new Map(airports.map((a) => [a.code, a]));
const loungeCountByAirport = lounges.reduce<Record<string, number>>((m, l) => {
  m[l.airportCode] = (m[l.airportCode] ?? 0) + 1;
  return m;
}, {});
const POPULAR = ["JFK", "LAX", "SFO", "ATL", "ORD", "DFW", "MIA", "LAS", "SEA", "DEN", "BOS", "IAH", "PHX", "CLT", "LHR", "HKG"].filter(
  (c) => loungeCountByAirport[c],
);

/** Networks a lounge can be entered through (e.g. a Plaza Premium lounge that also takes Priority Pass). */
function networksFor(l: Lounge): LoungeNetwork[] {
  const n: LoungeNetwork[] = [l.network];
  if (l.network !== "priority-pass" && /priority pass/i.test(l.notes ?? "")) n.push("priority-pass");
  return n;
}

function accessFor(l: Lounge, selected: Card[]) {
  const nets = networksFor(l);
  return selected.flatMap((card) =>
    card.loungeAccess.filter((a) => nets.includes(a.network)).map((a) => ({ card, terms: a.terms, via: a.network })),
  );
}

export function LoungeFinder() {
  const params = useSearchParams();
  const router = useRouter();
  const wallet = useWallet();
  const [query, setQuery] = useState("");
  const airportParam = params.get("airport")?.toUpperCase() ?? "";
  const cardParam = params.get("card");
  const [mode, setMode] = useState<"wallet" | "pick" | "all">(cardParam ? "pick" : "wallet");
  const [picked, setPicked] = useState<string[]>(cardParam ? [cardParam] : []);
  const [networkFilter, setNetworkFilter] = useState<LoungeNetwork | "all">("all");
  const [accessibleOnly, setAccessibleOnly] = useState(false);

  const loungeCards = useMemo(() => cards.filter((c) => c.loungeAccess.length > 0), []);
  const selected: Card[] = (
    mode === "wallet" ? wallet.cards : mode === "pick" ? picked : []
  )
    .map(getCard)
    .filter((c): c is Card => Boolean(c));

  const setAirport = (code: string) => {
    const sp = new URLSearchParams(params.toString());
    if (code) sp.set("airport", code);
    else sp.delete("airport");
    router.replace(`/lounges?${sp.toString()}`, { scroll: false });
    setQuery("");
  };

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return airports
      .filter((a) => loungeCountByAirport[a.code] && `${a.code} ${a.name} ${a.city} ${a.country}`.toLowerCase().includes(q))
      .sort((a, b) => Number(b.code.toLowerCase() === q) - Number(a.code.toLowerCase() === q))
      .slice(0, 8);
  }, [query]);

  const airport = airportByCode.get(airportParam);
  const airportLounges = lounges
    .filter((l) => l.airportCode === airportParam)
    .filter((l) => networkFilter === "all" || networksFor(l).includes(networkFilter))
    .map((l) => ({ lounge: l, access: accessFor(l, selected) }))
    .filter((x) => !accessibleOnly || mode === "all" || x.access.length > 0)
    .sort((a, b) => b.access.length - a.access.length || a.lounge.terminal.localeCompare(b.lounge.terminal));

  const networksHere = Array.from(new Set(lounges.filter((l) => l.airportCode === airportParam).flatMap(networksFor)));

  return (
    <div className="bg-canvas">
      <div className="container-page grid gap-8 py-10 lg:grid-cols-[320px_1fr]">
        {/* Sidebar: cards */}
        <aside className="space-y-5 lg:sticky lg:top-28 lg:self-start">
          <div className="panel p-5">
            <h2 className="text-sm font-semibold text-ink">Check access with</h2>
            <div className="mt-3 grid grid-cols-3 gap-1 rounded-md bg-canvas p-1 text-sm" role="radiogroup">
              {(
                [
                  ["wallet", "My wallet"],
                  ["pick", "Choose"],
                  ["all", "All"],
                ] as const
              ).map(([m, label]) => (
                <button
                  key={m}
                  role="radio"
                  aria-checked={mode === m}
                  onClick={() => setMode(m)}
                  className={cn("rounded px-2 py-1.5 font-medium", mode === m ? "bg-white text-brand shadow-sm" : "text-ink-2")}
                >
                  {label}
                </button>
              ))}
            </div>
            {mode === "wallet" && (
              <div className="mt-4 space-y-2">
                {selected.length === 0 ? (
                  <p className="text-sm text-ink-2">
                    Your wallet is empty.{" "}
                    <Link href="/tracker" className="link">
                      Add your cards
                    </Link>{" "}
                    or choose cards here.
                  </p>
                ) : (
                  selected.map((c) => (
                    <div key={c.id} className="flex items-center gap-3 text-sm">
                      <CardArt card={c} size="xs" />
                      <span className="truncate font-medium text-ink">{c.name}</span>
                    </div>
                  ))
                )}
              </div>
            )}
            {mode === "pick" && (
              <div className="mt-4 max-h-[360px] space-y-1 overflow-y-auto pr-1">
                {loungeCards.map((c) => {
                  const on = picked.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      onClick={() => setPicked((p) => (on ? p.filter((x) => x !== c.id) : [...p, c.id]))}
                      className={cn("flex w-full items-center gap-3 rounded-md p-2 text-left text-sm", on ? "bg-sky" : "hover:bg-canvas")}
                    >
                      <CardArt card={c} size="xs" />
                      <span className="flex-1 truncate font-medium text-ink">{c.name}</span>
                      {on && <Check className="h-4 w-4 text-brand" />}
                    </button>
                  );
                })}
              </div>
            )}
            {mode === "all" && <p className="mt-4 text-sm text-ink-2">Showing every lounge without checking card access.</p>}
          </div>
          <div className="panel p-5">
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
        </aside>

        {/* Main */}
        <div className="min-w-0 space-y-6">
          <div className="panel relative p-5">
            <label htmlFor="airport-search" className="text-sm font-semibold text-ink">
              Airport
            </label>
            <div className="relative mt-2">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-3" />
              <input
                id="airport-search"
                className="input h-12 pl-9 text-base"
                placeholder="Search by code or city — e.g. JFK, Denver, London"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && matches[0]) setAirport(matches[0].code);
                }}
                autoComplete="off"
              />
              {matches.length > 0 && (
                <ul className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-md border border-line bg-white shadow-[var(--shadow-lift)]">
                  {matches.map((a) => (
                    <li key={a.code}>
                      <button onClick={() => setAirport(a.code)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-sky">
                        <span className="w-12 font-semibold text-navy">{a.code}</span>
                        <span className="flex-1 truncate text-sm text-ink">
                          {a.name} <span className="text-ink-3">· {a.city}</span>
                        </span>
                        <span className="text-xs text-ink-3">{loungeCountByAirport[a.code]} lounges</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {POPULAR.map((code) => (
                <button
                  key={code}
                  onClick={() => setAirport(code)}
                  className={cn("chip cursor-pointer hover:border-brand hover:text-brand", airportParam === code && "border-brand bg-sky text-brand")}
                >
                  {code}
                </button>
              ))}
            </div>
          </div>

          {!airport ? (
            <AirportDirectory onSelect={setAirport} />
          ) : (
            <>
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="eyebrow flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" /> {airport.city}, {airport.country}
                  </p>
                  <h2 className="mt-1 text-2xl font-semibold text-navy">
                    {airport.name} <span className="text-ink-3">({airport.code})</span>
                  </h2>
                </div>
                <button className="btn-ghost" onClick={() => setAirport("")}>
                  <X className="h-4 w-4" /> Clear
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setNetworkFilter("all")}
                  className={cn("chip cursor-pointer", networkFilter === "all" && "border-brand bg-sky text-brand")}
                >
                  All networks
                </button>
                {networksHere.map((n) => (
                  <button
                    key={n}
                    onClick={() => setNetworkFilter(n)}
                    className={cn("chip cursor-pointer", networkFilter === n && "border-brand bg-sky text-brand")}
                  >
                    <span className="h-2 w-2 rounded-full" style={{ background: loungeNetworks[n].color }} />
                    {loungeNetworks[n].short}
                  </button>
                ))}
                {mode !== "all" && (
                  <label className="ml-auto flex items-center gap-2 text-sm font-medium text-ink-2">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[var(--color-brand)]"
                      checked={accessibleOnly}
                      onChange={(e) => setAccessibleOnly(e.target.checked)}
                    />
                    Only lounges I can enter
                  </label>
                )}
              </div>
              {airportLounges.length === 0 ? (
                <div className="panel p-10 text-center text-ink-2">No lounges match these filters.</div>
              ) : (
                <ul className="space-y-4">
                  {airportLounges.map(({ lounge, access }) => (
                    <LoungeRow key={lounge.id} lounge={lounge} access={access} checking={mode !== "all"} />
                  ))}
                </ul>
              )}
              <p className="text-xs text-ink-3">
                Access rules change often (guest fees, same-day flight requirements, visit caps). Confirm in your issuer&apos;s app
                before you go.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function LoungeRow({
  lounge,
  access,
  checking,
}: {
  lounge: Lounge;
  access: { card: Card; terms: string; via: LoungeNetwork }[];
  checking: boolean;
}) {
  const net = loungeNetworks[lounge.network];
  const ok = access.length > 0;
  return (
    <li className={cn("panel overflow-hidden", checking && !ok && "opacity-75")}>
      <div className="flex">
        <span className="w-1.5 shrink-0" style={{ background: net.color }} />
        <div className="flex-1 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <span className="text-xs font-semibold tracking-wide uppercase" style={{ color: net.color }}>
                {net.label}
              </span>
              <h3 className="mt-0.5 text-lg font-semibold text-ink">{lounge.name}</h3>
              <p className="mt-1 text-sm text-ink-2">
                {lounge.terminal}
                {lounge.location ? ` · ${lounge.location}` : ""}
              </p>
              {lounge.notes && <p className="mt-1 text-sm text-ink-3">{lounge.notes}</p>}
            </div>
            {checking && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold",
                  ok ? "bg-success/10 text-success" : "bg-canvas text-ink-3",
                )}
              >
                {ok ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                {ok ? "You have access" : "No access with selected cards"}
              </span>
            )}
          </div>
          {ok && (
            <ul className="mt-4 space-y-2 border-t border-line pt-4">
              {access.map((a) => (
                <li key={a.card.id + a.via} className="flex items-start gap-3 text-sm">
                  <CardArt card={a.card} size="xs" className="mt-0.5 shrink-0" />
                  <span>
                    <span className="font-semibold text-ink">{a.card.name}</span>
                    {a.via !== lounge.network && <span className="text-ink-3"> via {loungeNetworks[a.via].label}</span>}
                    <span className="block text-ink-2">{a.terms}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </li>
  );
}

function AirportDirectory({ onSelect }: { onSelect: (code: string) => void }) {
  const byCountry = airports
    .filter((a) => loungeCountByAirport[a.code])
    .reduce<Record<string, typeof airports>>((m, a) => {
      const key = a.country === "United States" || a.country === "USA" || a.country === "US" ? "United States" : "International";
      (m[key] ??= []).push(a);
      return m;
    }, {});
  return (
    <div className="space-y-8">
      {["United States", "International"].map((region) =>
        byCountry[region] ? (
          <section key={region}>
            <h2 className="mb-3 text-lg font-semibold text-navy">{region}</h2>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {byCountry[region]
                .sort((a, b) => a.city.localeCompare(b.city))
                .map((a) => (
                  <button
                    key={a.code}
                    onClick={() => onSelect(a.code)}
                    className="flex items-center gap-3 rounded-md border border-line bg-white px-4 py-3 text-left transition-colors hover:border-brand"
                  >
                    <span className="w-11 font-semibold text-navy">{a.code}</span>
                    <span className="min-w-0 flex-1 truncate text-sm text-ink-2">{a.city}</span>
                    <span className="text-xs text-ink-3">{loungeCountByAirport[a.code]}</span>
                  </button>
                ))}
            </div>
          </section>
        ) : null,
      )}
    </div>
  );
}
