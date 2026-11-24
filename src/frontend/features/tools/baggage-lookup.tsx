"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Award, BriefcaseBusiness, Check, CreditCard, ExternalLink, Luggage, Search } from "lucide-react";
import type { Card } from "@/shared/data/types";
import type { Alliance, BaggageAirline, DomesticBagFee, Fact } from "@/shared/data/travel/types";
import { baggage } from "@/shared/data/travel/baggage";
import { getCard } from "@/shared/data/cards";
import { feeText, formatIsoDate, latestIso, noteList } from "@/shared/lib/travel-format";
import { fold } from "@/shared/lib/airports";
import { cn } from "@/shared/lib/format";
import { CardArt } from "@/frontend/components/card-art";
import { useHydrated, useWallet } from "@/frontend/state/wallet-store";
import { SeedNotice, SourceLinks } from "./ui";

const ALLIANCES: (Alliance | "none")[] = ["oneworld", "Star Alliance", "SkyTeam", "none"];

/** Co-branded cards by airline, to pick out the bag perks that apply to the airline you searched. */
const CARD_AIRLINE: [RegExp, string][] = [
  [/delta/i, "DL"],
  [/united/i, "UA"],
  [/aadvantage|american airlines/i, "AA"],
  [/atmos|alaska/i, "AS"],
  [/southwest/i, "WN"],
  [/jetblue/i, "B6"],
  [/hawaiian/i, "HA"],
];

const airlineFor = (name: string): BaggageAirline | undefined =>
  baggage.airlines.find((a) => a.iata.toUpperCase() === name.toUpperCase() || fold(a.name) === fold(name));

/** Airlines matching a search: exact code first, then names that start with it, then any name or country match. */
function searchAirlines(q: string, alliance: Alliance | "none" | "all"): BaggageAirline[] {
  const query = fold(q.trim());
  const pool = baggage.airlines.filter((a) => alliance === "all" || (alliance === "none" ? a.alliance === null : a.alliance === alliance));
  if (!query) return [...pool].sort((a, b) => a.name.localeCompare(b.name));
  const rank = (a: BaggageAirline) => {
    if (a.iata.toLowerCase() === query) return 0;
    const name = fold(a.name);
    if (name.startsWith(query)) return 1;
    if (name.includes(query)) return 2;
    if (fold(a.country).includes(query)) return 3;
    return -1;
  };
  return pool
    .map((a) => ({ a, r: rank(a) }))
    .filter((x) => x.r >= 0)
    .sort((x, y) => x.r - y.r || x.a.name.localeCompare(y.a.name))
    .map((x) => x.a);
}

/** Baggage lookup: airline search with official links, U.S. domestic fees, standards and award-ticket rules. */
export function BaggageLookup() {
  const params = useSearchParams();
  const [q, setQ] = useState(() => params.get("airline") ?? params.get("q") ?? "");
  const [alliance, setAlliance] = useState<Alliance | "none" | "all">("all");
  const results = useMemo(() => searchAirlines(q, alliance), [q, alliance]);
  const exact = results.length > 0 && results[0].iata.toLowerCase() === q.trim().toLowerCase() ? results[0] : null;
  // One airline in focus (searched by code or full name, or the only match): show its details up top.
  const named = q.trim() ? results.find((a) => fold(a.name) === fold(q.trim())) : undefined;
  const featured = exact ?? named ?? (q.trim() && results.length === 1 ? results[0] : null);
  const asOf = latestIso(baggage.usDomestic.map((r) => r.asOf));

  // Keep the search in the URL (?airline=DL for a code, ?q= otherwise) without a navigation.
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    sp.delete("airline");
    sp.delete("q");
    const v = q.trim();
    if (v) sp.set(/^[a-z0-9]{2}$/i.test(v) ? "airline" : "q", v);
    const s = sp.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${s ? `?${s}` : ""}`);
  }, [q]);

  return (
    <div className="bg-canvas">
      <div className="container-page grid grid-cols-1 gap-8 py-8 md:py-10 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-8">
          <section className="panel space-y-4 p-5" aria-labelledby="airline-search-title">
            <h2 id="airline-search-title" className="font-semibold text-navy">
              Find your airline
            </h2>
            <div className="relative">
              <label htmlFor="airline-search" className="sr-only">
                Airline name or code
              </label>
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden />
              <input
                id="airline-search"
                type="search"
                className="input h-12 pl-9 text-base"
                placeholder="Airline or code, e.g. Delta, BA"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                autoComplete="off"
                aria-controls="airline-results"
              />
            </div>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by alliance">
              {(["all", ...ALLIANCES] as const).map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setAlliance(a)}
                  aria-pressed={alliance === a}
                  className={cn("chip cursor-pointer px-3 py-1.5 text-sm", alliance === a && "border-brand bg-sky text-brand")}
                >
                  {a === "all" ? "All airlines" : a === "none" ? "No alliance" : a}
                </button>
              ))}
            </div>
          </section>

          {featured && <FeaturedAirline airline={featured} fee={feeFor(featured)} />}

          {!(featured && results.length === 1) && (
            <section aria-labelledby="airline-results-title">
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <h2 id="airline-results-title" className="font-semibold text-navy">
                  {q.trim() ? "Matching airlines" : "Airline baggage pages"}
                </h2>
                <p className="text-sm text-ink-3" aria-live="polite">
                  {results.length === 0 ? "No matches" : `${results.length} airline${results.length === 1 ? "" : "s"}`}
                </p>
              </div>
              {results.length === 0 ? (
                <p className="panel p-5 text-sm text-ink-2">No airline matches that. Try its two-letter code or another spelling.</p>
              ) : (
                <ul id="airline-results" className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {results.map((a) => (
                    <li key={a.iata}>
                      <a
                        href={a.baggageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cn(
                          "group flex items-center gap-3 rounded-md border bg-white px-3 py-2.5 transition-colors hover:border-brand",
                          featured?.iata === a.iata ? "border-brand" : "border-line",
                        )}
                      >
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded bg-navy text-xs font-bold tracking-wide text-white" aria-hidden>
                          {a.iata}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-ink group-hover:text-brand">{a.name}</span>
                          <span className="block truncate text-xs text-ink-3">
                            {a.country}
                            {a.alliance ? ` · ${a.alliance}` : ""}
                          </span>
                        </span>
                        <ExternalLink className="h-4 w-4 shrink-0 text-ink-3 group-hover:text-brand" aria-hidden />
                        <span className="sr-only">baggage page (opens in a new tab)</span>
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          <DomesticTable rows={baggage.usDomestic} highlight={featured?.iata} asOf={asOf} />
        </div>

        <aside className="space-y-5 lg:sticky lg:top-28 lg:self-start">
          <SeedNotice datasets={["baggage"]} />
          <CardBagPerks airline={featured?.iata ?? null} />
          <RuleList icon={BriefcaseBusiness} title="Carry-on and weight rules of thumb" items={baggage.standards} />
          <RuleList icon={Award} title="Bags on award tickets" items={baggage.awardRules} />
          <p className="px-1 text-xs leading-relaxed text-ink-3">
            Fees change often and differ by route, fare and status. The airline&apos;s own page is the final word.{" "}
            <SourceLinks sources={baggage.sources} className="align-baseline" />
          </p>
        </aside>
      </div>
    </div>
  );
}

const feeFor = (a: BaggageAirline) => baggage.usDomestic.find((r) => airlineFor(r.airline)?.iata === a.iata);

function FeaturedAirline({ airline, fee }: { airline: BaggageAirline; fee?: DomesticBagFee }) {
  const free = noteList(fee?.exemptions);
  return (
    <section className="panel overflow-hidden" aria-labelledby="featured-airline">
      <div className="flex flex-wrap items-center gap-4 p-5">
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-md bg-navy text-lg font-bold tracking-wide text-white" aria-hidden>
          {airline.iata}
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="featured-airline" className="text-xl font-semibold text-navy">
            {airline.name}
          </h2>
          <p className="text-sm text-ink-2">
            {airline.country}
            {airline.alliance ? ` · ${airline.alliance}` : " · Not in an alliance"}
          </p>
        </div>
        <a href={airline.baggageUrl} target="_blank" rel="noopener noreferrer" className="btn-primary w-full sm:w-auto">
          Official baggage page <ExternalLink className="h-4 w-4" aria-hidden />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      </div>
      {fee && (
        <div className="border-t border-line bg-canvas/60 p-5">
          <dl className="grid gap-4 text-sm sm:grid-cols-[auto_auto_1fr]">
            <div>
              <dt className="text-xs font-semibold tracking-wide text-ink-3 uppercase">1st checked bag</dt>
              <dd className="mt-0.5 text-lg font-semibold text-navy">{feeText(fee.firstBag)}</dd>
            </div>
            <div className="sm:border-l sm:border-line sm:pl-4">
              <dt className="text-xs font-semibold tracking-wide text-ink-3 uppercase">2nd checked bag</dt>
              <dd className="mt-0.5 text-lg font-semibold text-navy">{feeText(fee.secondBag)}</dd>
            </div>
            <div className="sm:border-l sm:border-line sm:pl-4">
              <dt className="text-xs font-semibold tracking-wide text-ink-3 uppercase">Free bags for</dt>
              <dd className="mt-0.5 text-ink-2">{free.length ? free.join("; ") : "No standard exemptions listed"}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-ink-3">
            U.S. domestic economy, each way · as of {formatIsoDate(fee.asOf)} · <SourceLinks sources={fee.sources} />
          </p>
        </div>
      )}
    </section>
  );
}

function DomesticTable({ rows, highlight, asOf }: { rows: DomesticBagFee[]; highlight?: string; asOf: string }) {
  return (
    <section className="panel overflow-hidden" aria-labelledby="domestic-title">
      <div className="flex flex-wrap items-end justify-between gap-2 px-5 pt-5 pb-3">
        <div>
          <h2 id="domestic-title" className="font-semibold text-navy">
            U.S. domestic checked-bag fees
          </h2>
          <p className="text-sm text-ink-2">Economy, each way, per passenger{asOf ? ` · checked ${formatIsoDate(asOf)}` : ""}.</p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">First and second checked bag fees on U.S. domestic flights, and who flies with free bags</caption>
          <thead>
            <tr className="border-y border-line bg-canvas text-left text-xs font-semibold tracking-wide text-ink-3 uppercase">
              <th scope="col" className="px-5 py-2.5">
                Airline
              </th>
              <th scope="col" className="hidden w-44 px-3 py-2.5 text-right whitespace-nowrap sm:table-cell">
                1st bag
              </th>
              <th scope="col" className="hidden w-44 py-2.5 pr-5 pl-3 text-right whitespace-nowrap sm:table-cell">
                2nd bag
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => {
              const a = airlineFor(r.airline);
              const free = noteList(r.exemptions);
              return (
                <tr key={r.airline} className={cn("align-top", a && a.iata === highlight && "bg-sky/60")}>
                  <th scope="row" className="px-4 py-3 text-left font-normal sm:px-5">
                    <span className="font-semibold text-ink">{a?.name ?? r.airline}</span>
                    {/* Phones: the fee columns fold into the airline cell. */}
                    <span className="mt-1 grid grid-cols-[4.5rem_1fr] gap-x-2 gap-y-0.5 text-sm sm:hidden">
                      <span className="text-ink-3">1st bag</span>
                      <span className="font-semibold text-navy">{feeText(r.firstBag)}</span>
                      <span className="text-ink-3">2nd bag</span>
                      <span className="font-semibold text-navy">{feeText(r.secondBag)}</span>
                    </span>
                    {free.length > 0 && <span className="mt-1 block text-xs leading-relaxed text-ink-3">Free for: {free.join("; ")}.</span>}
                    <span className="mt-1 flex flex-wrap gap-x-2 text-xs text-ink-3">
                      <span>As of {formatIsoDate(r.asOf)}</span>
                      <SourceLinks sources={r.sources} />
                    </span>
                  </th>
                  <td className="hidden px-3 py-3 text-right font-semibold text-navy tabular-nums sm:table-cell">
                    <span className="text-balance">{feeText(r.firstBag)}</span>
                  </td>
                  <td className="hidden py-3 pr-5 pl-3 text-right font-semibold text-navy tabular-nums sm:table-cell">
                    <span className="text-balance">{feeText(r.secondBag)}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RuleList({ icon: Icon, title, items }: { icon: typeof Luggage; title: string; items: Fact[] }) {
  return (
    <section className="panel p-5">
      <h2 className="flex items-center gap-2 font-semibold text-navy">
        <Icon className="h-4 w-4 text-brand" aria-hidden /> {title}
      </h2>
      <ul className="mt-3 space-y-2.5 text-sm leading-relaxed text-ink-2">
        {items.map((item) => {
          const text = typeof item === "string" ? item : item.fact;
          const sources = typeof item === "string" ? [] : (item.sources ?? []);
          return (
            <li key={text} className="flex gap-2">
              <Check className="mt-1 h-3.5 w-3.5 shrink-0 text-success" aria-hidden />
              <span>
                {text}
                {sources.length > 0 && <SourceLinks sources={sources.slice(0, 2)} className="ml-1.5 align-baseline text-xs" />}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Free-bag perks from the cards in the wallet (matching the searched airline first). */
function CardBagPerks({ airline }: { airline: string | null }) {
  const hydrated = useHydrated();
  const wallet = useWallet();
  const owned = wallet.cards.map(getCard).filter((c): c is Card => Boolean(c));
  const perks = owned
    .map((c) => ({ card: c, perk: c.perks.find((p) => /checked bag|free bag/i.test(p)), airline: CARD_AIRLINE.find(([re]) => re.test(c.name))?.[1] }))
    .filter((x): x is { card: Card; perk: string; airline: string | undefined } => Boolean(x.perk))
    .sort((a, b) => Number(b.airline === airline) - Number(a.airline === airline));

  return (
    <section className="panel p-5" aria-labelledby="bag-perks-title">
      <h2 id="bag-perks-title" className="flex items-center gap-2 font-semibold text-navy">
        <CreditCard className="h-4 w-4 text-brand" aria-hidden /> Free bags from your cards
      </h2>
      {!hydrated ? (
        <div className="mt-3 h-12 animate-pulse rounded bg-canvas" />
      ) : owned.length === 0 ? (
        <p className="mt-2 text-sm text-ink-2">
          <Link href="/tracker" className="link">
            Add your cards
          </Link>{" "}
          to see which ones check bags for free.
        </p>
      ) : perks.length === 0 ? (
        <p className="mt-2 text-sm text-ink-2">None of your cards includes a free checked bag. Airline co-branded cards usually do.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {perks.map(({ card, perk, airline: code }) => (
            <li key={card.id} className="flex gap-3 text-sm">
              <CardArt card={card} size="xs" className="mt-0.5 shrink-0" />
              <span>
                <span className="font-semibold text-ink">{card.name}</span>
                {code && code === airline && <span className="ml-1.5 rounded bg-success/10 px-1.5 py-0.5 text-[11px] font-semibold text-success">This airline</span>}
                <span className="block text-ink-2">{perk}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
