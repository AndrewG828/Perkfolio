"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Award, BriefcaseBusiness, Check, CircleHelp, CreditCard, ExternalLink, Luggage, PlaneLanding, Search } from "lucide-react";
import type { Card } from "@/shared/data/types";
import type { Alliance, BaggageAirline, CandidateBaggageLink, DomesticBagFee, Fact, FeeValue } from "@/shared/data/travel/types";
import { baggage } from "@/shared/data/travel/baggage";
import { getCard } from "@/shared/data/cards";
import { feeText, formatIsoDate, formatIsoMonth, hostOf, latestIso, noteList, possessive, visitorSources } from "@/shared/lib/travel-format";
import { fold } from "@/shared/lib/airports";
import { namesAirline } from "@/shared/lib/airline-search";
import { checkTerms } from "@/shared/lib/card-terms";
import { cn } from "@/shared/lib/format";
import { CardArt } from "@/frontend/components/card-art";
import { useHydrated, useWallet } from "@/frontend/state/wallet-store";
import { DataNotice, ExternalA, LinkedText, SourceLinks } from "./ui";

const ALLIANCES: (Alliance | "none")[] = ["oneworld", "Star Alliance", "SkyTeam", "none"];

/** Co-branded cards by airline, to pick out the bag perks that apply to the airline you searched. */
/** The airlines a co-brand card's bag perk covers, by the card's name (Atmos cards: Alaska and Hawaiian flights). */
const CARD_AIRLINE: [RegExp, string[]][] = [
  [/delta/i, ["DL"]],
  [/united/i, ["UA"]],
  [/aadvantage|american airlines/i, ["AA"]],
  [/atmos|alaska/i, ["AS", "HA"]],
  [/southwest/i, ["WN"]],
  [/jetblue/i, ["B6"]],
  [/hawaiian/i, ["HA"]],
];

/** One airline in the directory: verified (with its official baggage page) or still pending. */
interface DirectoryAirline {
  name: string;
  iata: string;
  country: string;
  alliance: Alliance | null;
  /** The confirmed official baggage page; null while it isn't verified. */
  url: string | null;
  /** A likely page that one article links (pending airlines only). */
  candidate?: CandidateBaggageLink;
  verification?: BaggageAirline["verification"];
  note?: string;
  sources: string[];
}

const DIRECTORY: DirectoryAirline[] = [
  ...baggage.airlines.map((a) => ({ ...a, url: a.baggageUrl, sources: a.sources ?? [] })),
  ...baggage.pendingAirlines.map((a) => ({ ...a, url: null })),
];

const byCode = new Map(DIRECTORY.map((a) => [a.iata.toUpperCase(), a]));

/** U.S. carriers still flying, for the fee comparison; ones that stopped flying are listed apart. */
const FLYING = baggage.usDomestic.filter((r) => !r.ceased);
const CEASED = baggage.usDomestic.filter((r) => r.ceased);

const airlineFor = (r: DomesticBagFee): DirectoryAirline | undefined =>
  byCode.get((r.iata ?? r.airline).toUpperCase()) ?? DIRECTORY.find((a) => fold(a.name) === fold(r.airline));

const feeFor = (a: DirectoryAirline) => FLYING.find((r) => airlineFor(r)?.iata === a.iata);

/** Airlines matching a search: exact code first, then names that start with it, then any name or country match. */
function searchAirlines(q: string, alliance: Alliance | "none" | "all"): DirectoryAirline[] {
  const query = fold(q.trim());
  const pool = DIRECTORY.filter((a) => alliance === "all" || (alliance === "none" ? a.alliance === null : a.alliance === alliance));
  const verifiedFirst = (a: DirectoryAirline, b: DirectoryAirline) => Number(b.url !== null) - Number(a.url !== null);
  if (!query) return [...pool].sort((a, b) => verifiedFirst(a, b) || a.name.localeCompare(b.name));
  const rank = (a: DirectoryAirline) => {
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
    .sort((x, y) => x.r - y.r || verifiedFirst(x.a, y.a) || x.a.name.localeCompare(y.a.name))
    .map((x) => x.a);
}

/** "Upgraded Points, Jun 2026" */
const citedLabel = (c: CandidateBaggageLink) => `${c.citedBy}, ${formatIsoMonth(c.month)}`;

/** How a verified link was confirmed, for its "Where this comes from" note. */
function verificationText(a: DirectoryAirline): string | null {
  const v = a.verification;
  if (!v || !a.url) return null;
  const site =
    v.method === "airline-site"
      ? `The address is on ${possessive(a.name)} own website (${hostOf(a.url)}), so it comes straight from the airline.`
      : "Two independent outlets link this address as the airline's baggage page.";
  return v.detail ? `${site} ${v.detail}` : site;
}

/**
 * Airlines that stopped flying (Spirit), found by code or by the start of their name, so a search says so instead of
 * "no match". "air" or "lines" doesn't find them.
 */
function ceasedMatch(q: string): DomesticBagFee | undefined {
  return CEASED.find((r) => namesAirline({ name: r.airline, code: r.iata }, q));
}

/** Links under "All N sources": one per page (two addresses of one page count once). */
const ALL_SOURCES = visitorSources(baggage.sources).length;

/** How many airlines without a verified link show before "Show all". */
const PENDING_PREVIEW = 12;

/** How many rules of thumb each sidebar list shows before "Show all". */
const RULES_PREVIEW = { standards: 9, awardRules: 5 };

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
  const asOf = latestIso(FLYING.map((r) => r.asOf));
  const verified = results.filter((a) => a.url !== null);
  const pending = results.filter((a) => a.url === null);
  const searching = Boolean(q.trim());
  const ceased = searching && !featured ? ceasedMatch(q) : undefined;

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
          {ceased && <CeasedNotice fee={ceased} />}

          {/* On phones the sidebar comes last, so your card's bag perks (first: they answer "do I pay?") and its caveat
              show here instead. */}
          <div className="space-y-5 lg:hidden">
            <CardBagPerks airline={featured?.iata ?? null} idPrefix="m-" />
            <DataNotice datasets={["baggage"]} />
          </div>

          {!(featured && results.length === 1) && !(ceased && results.length === 0) && (
            <section aria-labelledby="airline-results-title" id="airline-results" className="space-y-6">
              <div>
                <div className="mb-3 flex items-baseline justify-between gap-3">
                  <h2 id="airline-results-title" className="font-semibold text-navy">
                    {q.trim() ? "Matching airlines" : "Official baggage pages"}
                  </h2>
                  <p className="text-sm text-ink-3" aria-live="polite">
                    {results.length === 0
                      ? ceased
                        ? "Stopped flying"
                        : "No matches"
                      : searching
                        ? `${results.length} airline${results.length === 1 ? "" : "s"}${pending.length ? ` · ${verified.length} with a verified link` : ""}`
                        : `${verified.length} verified${pending.length ? ` · ${pending.length} more below, not verified yet` : ""}`}
                  </p>
                </div>
                {results.length === 0 ? (
                  ceased ? null : (
                    <p className="panel p-5 text-sm text-ink-2">No airline matches that. Try its two-letter code or another spelling.</p>
                  )
                ) : (
                  verified.length > 0 && (
                    <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                      {verified.map((a) => (
                        <li key={a.iata}>
                          <a
                            href={a.url!}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={cn(
                              "group flex items-center gap-3 rounded-md border bg-white px-3 py-2.5 transition-colors hover:border-brand",
                              featured?.iata === a.iata ? "border-brand" : "border-line",
                            )}
                          >
                            <CodeChip code={a.iata} />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-semibold text-ink group-hover:text-brand">{a.name}</span>
                              <span className="block truncate text-xs text-ink-3">
                                {a.country}
                                {a.alliance ? ` · ${a.alliance}` : ""}
                              </span>
                            </span>
                            <ExternalLink className="h-4 w-4 shrink-0 text-ink-3 group-hover:text-brand" aria-hidden />
                            <span className="sr-only">official baggage page (opens in a new tab)</span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  )
                )}
              </div>

              {searching && pending.length > 0 && <PendingList airlines={pending} featured={featured?.iata ?? null} searching />}
            </section>
          )}

          <DomesticFees highlight={featured?.iata} asOf={asOf} />

          {!searching && pending.length > 0 && <PendingList airlines={pending} featured={null} searching={false} />}
        </div>

        <aside className="min-w-0 space-y-5">
          <div className="hidden space-y-5 lg:block">
            <DataNotice datasets={["baggage"]} />
            <CardBagPerks airline={featured?.iata ?? null} idPrefix="" />
          </div>
          {/* The two lists run long in a narrow column: their first few show, so it ends near the main column. */}
          <RuleList icon={BriefcaseBusiness} title="Carry-on and weight rules of thumb" items={baggage.standards} preview={RULES_PREVIEW.standards} />
          <RuleList icon={Award} title="Bags on award tickets" items={baggage.awardRules} preview={RULES_PREVIEW.awardRules} />
          <div className="space-y-2 px-1 text-xs leading-relaxed text-ink-3">
            <p>
              Fees change often and differ by route, fare and status. The airline&apos;s own page is the final word. Checked{" "}
              {formatIsoDate(baggage.verifiedAt)}.
            </p>
            <details>
              <summary className="cursor-pointer font-medium text-brand">All {ALL_SOURCES} sources</summary>
              <SourceLinks sources={baggage.sources} className="mt-2" />
            </details>
          </div>
        </aside>
      </div>
    </div>
  );
}

function CodeChip({ code, muted = false, large = false }: { code: string; muted?: boolean; large?: boolean }) {
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded font-bold tracking-wide",
        large ? "h-14 w-14 rounded-md text-lg" : "h-9 w-9 text-xs",
        muted ? "border border-line bg-canvas text-ink-2" : "bg-navy text-white",
      )}
      aria-hidden
    >
      {code}
    </span>
  );
}

/** Airlines we list without a verified link: candidate pages labelled with who cites them, the rest plainly unverified. */
function PendingList({ airlines, featured, searching }: { airlines: DirectoryAirline[]; featured: string | null; searching: boolean }) {
  const withCandidate = airlines.filter((a) => a.candidate).length;
  // The full list is long (110 airlines): show the ones with a possible page first, and the rest on request.
  const [all, setAll] = useState(false);
  const folded = !searching && !all && airlines.length > PENDING_PREVIEW + 2;
  const ordered = searching ? airlines : [...airlines].sort((a, b) => Number(Boolean(b.candidate)) - Number(Boolean(a.candidate)));
  const shown = folded ? ordered.slice(0, PENDING_PREVIEW) : ordered;
  return (
    <div>
      <h3 className="font-semibold text-navy">{searching ? "Not verified yet" : `Not verified yet (${airlines.length})`}</h3>
      <p className="mt-1 mb-3 text-sm text-ink-2">
        We haven&apos;t confirmed {airlines.length === 1 ? "this airline's" : "these airlines'"} official baggage page yet, so
        there&apos;s no direct link.
        {withCandidate > 0 &&
          " Where a single article links a likely page on the airline's own site, it's shown as a possible page with that outlet and month. Confirm it on the airline's site."}
      </p>
      <ul className="grid gap-x-4 gap-y-1 rounded-md border border-line bg-white p-2 sm:grid-cols-2 xl:grid-cols-3">
        {shown.map((a) => (
          <li
            key={a.iata}
            className={cn("flex min-w-0 items-start gap-2 rounded px-2 py-1.5 text-sm", featured === a.iata && "bg-sky/60")}
          >
            <span className="mt-0.5 w-7 shrink-0 text-xs font-bold tracking-wide text-ink-2">{a.iata}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-ink">{a.name}</span>
              <span className="block truncate text-xs text-ink-3">{a.alliance ?? "No alliance"}</span>
              {a.candidate ? (
                <span className="mt-0.5 block text-xs leading-snug text-ink-3">
                  <a
                    href={a.candidate.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-medium text-brand hover:underline"
                  >
                    Possible page
                    <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
                    <span className="sr-only">for {a.name}, not verified (opens in a new tab)</span>
                  </a>{" "}
                  · cited by {citedLabel(a.candidate)}, not verified
                </span>
              ) : (
                <span className="mt-0.5 block text-xs text-ink-3">Official link not verified yet</span>
              )}
            </span>
          </li>
        ))}
      </ul>
      {folded && (
        <button type="button" onClick={() => setAll(true)} className="btn-secondary mt-3 w-full sm:w-auto">
          Show all {airlines.length} airlines
        </button>
      )}
    </div>
  );
}

/** A searched airline that stopped flying (Spirit): when, and what it means for bags. */
function CeasedNotice({ fee }: { fee: DomesticBagFee }) {
  return (
    <section className="panel flex gap-4 p-5" aria-labelledby="ceased-airline">
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-md border border-line bg-canvas text-ink-3" aria-hidden>
        <PlaneLanding className="h-5 w-5" />
      </span>
      <div className="min-w-0 space-y-1.5 text-sm">
        <h2 id="ceased-airline" className="text-lg font-semibold text-navy">
          {fee.airline}
          {fee.iata ? <span className="ml-2 text-sm font-semibold text-ink-3">{fee.iata}</span> : null}
        </h2>
        <p className="font-medium text-ink">
          {fee.airline} stopped flying on {formatIsoDate(fee.ceased!)}, so there are no bag fees or baggage page to show.
        </p>
        {noteList(fee.notes).map((n) => (
          <p key={n} className="text-ink-2">
            {n}
          </p>
        ))}
        <SourceLinks sources={fee.sources} max={2} className="text-xs" />
      </div>
    </section>
  );
}

function FeaturedAirline({ airline, fee }: { airline: DirectoryAirline; fee?: DomesticBagFee }) {
  const verification = verificationText(airline);
  // A possible page's note says who links it: that's how it was checked, not a fact about the airline.
  const provenance = airline.candidate ? airline.note : undefined;
  const note = airline.candidate ? undefined : airline.note;
  return (
    <section className="panel overflow-hidden" aria-labelledby="featured-airline">
      <div className="flex flex-wrap items-center gap-4 p-5">
        <CodeChip code={airline.iata} muted={airline.url === null} large />
        <div className="min-w-0 flex-1">
          <h2 id="featured-airline" className="text-xl font-semibold text-navy">
            {airline.name}
          </h2>
          <p className="text-sm text-ink-2">
            {airline.country}
            {airline.alliance ? ` · ${airline.alliance}` : " · Not in an alliance"}
          </p>
        </div>
        {airline.url && (
          <a href={airline.url} target="_blank" rel="noopener noreferrer" className="btn-primary w-full sm:w-auto">
            Official baggage page <ExternalLink className="h-4 w-4" aria-hidden />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        )}
      </div>
      {airline.url === null ? (
        <div className="space-y-2 border-t border-line bg-[#fdf4ea]/60 p-5 text-sm">
          <p className="flex items-start gap-2 font-medium text-ink">
            <CircleHelp className="mt-0.5 h-4 w-4 shrink-0 text-warn" aria-hidden />
            We haven&apos;t verified {possessive(airline.name)} official baggage page yet. Check the bag rules on the airline&apos;s
            own site or your booking.
          </p>
          {airline.candidate && (
            <p className="pl-6 text-ink-2">
              One article links a possible page on the airline&apos;s site:{" "}
              <ExternalA href={airline.candidate.url}>possible baggage page</ExternalA> (cited by{" "}
              <ExternalA href={airline.candidate.article}>{citedLabel(airline.candidate)}</ExternalA>; not verified).
            </p>
          )}
          {note && (
            <p className="pl-6 text-xs leading-relaxed text-ink-2">
              <LinkedText text={note} />
            </p>
          )}
          {provenance && (
            <details className="pl-6 text-xs leading-relaxed text-ink-3">
              <summary className="cursor-pointer font-medium text-brand">About this link</summary>
              <p className="mt-1">
                <LinkedText text={provenance} />
              </p>
            </details>
          )}
        </div>
      ) : (
        (verification || note) && (
          <div className="space-y-2 border-t border-line px-5 py-3 text-xs leading-relaxed text-ink-2">
            {note && (
              <p>
                <LinkedText text={note} />
              </p>
            )}
            {verification && (
              <details className="text-ink-3">
                <summary className="cursor-pointer font-medium text-brand">Where this comes from</summary>
                <p className="mt-1">{verification}</p>
                <SourceLinks sources={airline.sources} max={4} className="mt-1" />
              </details>
            )}
          </div>
        )
      )}
      {fee && (
        <div className="space-y-4 border-t border-line bg-canvas/60 p-5">
          <FeeGrid fee={fee} />
          {/* Open on wide screens; folded on phones, so your cards' bag perks come right after the fees. */}
          <div className="hidden lg:block">
            <FeeDetails fee={fee} open />
          </div>
          <div className="lg:hidden">
            <FeeDetails fee={fee} />
          </div>
          <p className="flex flex-wrap gap-x-2 text-xs text-ink-3">
            <span>U.S. domestic economy, each way · as of {formatIsoDate(fee.asOf)}</span>
            <SourceLinks sources={fee.sources} max={4} />
          </p>
        </div>
      )}
    </section>
  );
}

/** A fee as text: short amounts large, phrases ("$45 prepaid ..., $50 at the airport") at reading size. */
function FeeValueText({ fee }: { fee: FeeValue | undefined }) {
  const text = feeText(fee);
  const short = typeof fee === "number" || text.length <= 8;
  return <span className={cn("text-navy", short ? "text-lg font-semibold tabular-nums" : "text-sm font-medium leading-snug")}>{text}</span>;
}

function FeeGrid({ fee }: { fee: DomesticBagFee }) {
  const cells: [string, FeeValue | undefined][] = [
    ["1st checked bag", fee.firstBag],
    ["2nd checked bag", fee.secondBag],
    ...(fee.thirdBag !== undefined ? ([["3rd bag", fee.thirdBag]] as [string, FeeValue][]) : []),
  ];
  return (
    <dl className="grid gap-x-5 gap-y-3 sm:grid-cols-3">
      {cells.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="text-xs font-semibold tracking-wide text-ink-3 uppercase">{label}</dt>
          <dd className="mt-0.5">
            <FeeValueText fee={value} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Who flies with free bags, how Basic Economy differs, and the fee's notes. */
function FeeDetails({ fee, open = false }: { fee: DomesticBagFee; open?: boolean }) {
  const parts: [string, string[]][] = (
    [
      ["Free bags for", noteList(fee.exemptions)],
      ["Basic Economy", noteList(fee.basicEconomy)],
      ["Good to know", noteList(fee.notes)],
    ] as [string, string[]][]
  ).filter(([, v]) => v.length > 0);
  if (parts.length === 0) return null;
  const body = (
    <div className="space-y-3 text-sm leading-relaxed text-ink-2">
      {parts.map(([label, items]) => (
        <div key={label}>
          <p className="text-xs font-semibold tracking-wide text-ink-3 uppercase">{label}</p>
          {items.map((t) => (
            <p key={t} className="mt-0.5">
              {t}
            </p>
          ))}
        </div>
      ))}
    </div>
  );
  if (open) return body;
  return (
    <details className="group">
      <summary className="cursor-pointer text-sm font-medium text-brand">Free bags, Basic Economy and notes</summary>
      <div className="mt-2">{body}</div>
    </details>
  );
}

function DomesticFees({ highlight, asOf }: { highlight?: string; asOf: string }) {
  return (
    <section className="panel overflow-hidden" aria-labelledby="domestic-title">
      <div className="space-y-3 px-5 pt-5 pb-4">
        <div>
          <h2 id="domestic-title" className="font-semibold text-navy">
            U.S. domestic checked-bag fees
          </h2>
          <p className="text-sm text-ink-2">Economy, each way, per passenger{asOf ? ` · checked ${formatIsoDate(asOf)}` : ""}.</p>
        </div>
        <ul className="space-y-1.5 rounded-md bg-canvas px-3 py-2.5 text-xs leading-relaxed text-ink-2">
          {baggage.notes.map((n) => (
            <li key={n} className="flex gap-2">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-ink-3" aria-hidden />
              {n}
            </li>
          ))}
        </ul>
      </div>
      <ul className="divide-y divide-line border-t border-line">
        {FLYING.map((r) => {
          const a = airlineFor(r);
          return (
            <li key={r.airline} className={cn("space-y-3 px-5 py-4", a && a.iata === highlight && "bg-sky/60")}>
              <h3 className="flex items-center gap-2 font-semibold text-ink">
                {a ? <span className="text-xs font-bold tracking-wide text-ink-3">{a.iata}</span> : null}
                {a?.name ?? r.airline}
                {a?.url && (
                  <ExternalA href={a.url} className="ml-auto text-xs font-medium">
                    Bag page
                  </ExternalA>
                )}
              </h3>
              <FeeGrid fee={r} />
              <FeeDetails fee={r} />
              <p className="flex flex-wrap gap-x-2 gap-y-1 text-xs text-ink-3">
                <span>As of {formatIsoDate(r.asOf)}</span>
                <SourceLinks sources={r.sources} max={3} />
              </p>
            </li>
          );
        })}
      </ul>
      {CEASED.map((r) => (
        <p key={r.airline} className="border-t border-line bg-canvas/60 px-5 py-3 text-xs leading-relaxed text-ink-3">
          <span className="font-semibold text-ink-2">{r.airline}</span> stopped flying on {formatIsoDate(r.ceased!)}, so it&apos;s
          left out of the comparison. {noteList(r.notes).join(" ")} <SourceLinks sources={r.sources} max={2} className="align-baseline" />
        </p>
      ))}
    </section>
  );
}

function RuleList({ icon: Icon, title, items, preview }: { icon: typeof Luggage; title: string; items: Fact[]; preview?: number }) {
  const [all, setAll] = useState(false);
  const id = useId();
  const foldable = preview !== undefined && items.length > preview + 1;
  const shown = foldable && !all ? items.slice(0, preview) : items;
  return (
    <section className="panel p-5">
      <h2 className="flex items-center gap-2 font-semibold text-navy">
        <Icon className="h-4 w-4 text-brand" aria-hidden /> {title}
      </h2>
      <ul id={`${id}-rules`} className="mt-3 space-y-2.5 text-sm leading-relaxed text-ink-2">
        {shown.map((item) => {
          const text = typeof item === "string" ? item : item.fact;
          const sources = typeof item === "string" ? [] : (item.sources ?? []);
          const status = typeof item === "string" ? undefined : item.status;
          return (
            <li key={text} className="flex gap-2">
              <Check className="mt-1 h-3.5 w-3.5 shrink-0 text-success" aria-hidden />
              <span>
                {text}
                {status && (
                  <span className="ml-1.5 rounded bg-canvas px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap text-ink-3">
                    {status.charAt(0).toUpperCase() + status.slice(1)}
                  </span>
                )}
                {sources.length > 0 && <SourceLinks sources={sources} max={2} className="ml-1.5 align-baseline text-xs" />}
              </span>
            </li>
          );
        })}
      </ul>
      {foldable && (
        <button
          type="button"
          onClick={() => setAll((a) => !a)}
          aria-expanded={all}
          aria-controls={`${id}-rules`}
          className="mt-3 text-sm font-semibold text-brand hover:underline"
        >
          {all ? "Show fewer" : `Show all ${items.length}`}
        </button>
      )}
    </section>
  );
}

/** Free-bag perks from the cards in the wallet (matching the searched airline first). */
function CardBagPerks({ airline, idPrefix }: { airline: string | null; idPrefix: string }) {
  const hydrated = useHydrated();
  const wallet = useWallet();
  const owned = wallet.cards.map(getCard).filter((c): c is Card => Boolean(c));
  const perks = owned
    .map((c) => ({ card: c, perk: c.perks.find((p) => /checked bag|free bag/i.test(p)), airlines: CARD_AIRLINE.find(([re]) => re.test(c.name))?.[1] ?? [] }))
    .filter((x): x is { card: Card; perk: string; airlines: string[] } => Boolean(x.perk))
    // The airline's own fee data can be newer than the card's perk (Delta's second free bag since June 2026).
    .map((x) => ({ ...x, notes: checkTerms(x.card.id, "perks", x.perk).notes, here: Boolean(airline && x.airlines.includes(airline)) }))
    .sort((a, b) => Number(b.here) - Number(a.here));

  return (
    <section className="panel p-5" aria-labelledby={`${idPrefix}bag-perks-title`}>
      <h2 id={`${idPrefix}bag-perks-title`} className="flex items-center gap-2 font-semibold text-navy">
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
          {perks.map(({ card, perk, here, notes }) => (
            <li key={card.id} className="flex items-start gap-3 text-sm">
              <CardArt card={card} size="xs" className="mt-0.5 shrink-0" />
              <span>
                <span className="font-semibold text-ink">{card.name}</span>
                {here && <span className="ml-1.5 rounded bg-success/10 px-1.5 py-0.5 text-[11px] font-semibold text-success">This airline</span>}
                <span className="block text-ink-2">{perk}</span>
                {notes.map((n) => (
                  <span key={n} className="mt-0.5 block text-ink-2">
                    <strong className="font-semibold text-success">Also:</strong> {n}
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
