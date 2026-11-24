"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CalendarClock, ChevronDown, PlaneTakeoff, Search, TriangleAlert } from "lucide-react";
import { ENTRY_REQUIREMENTS, type Destination, type EntryRequirement } from "@/shared/data/travel/types";
import { entryRequirements } from "@/shared/data/travel/entry-requirements";
import { feeText, formatIsoDate, latestIso, noteList } from "@/shared/lib/travel-format";
import { fold } from "@/shared/lib/airports";
import { cn } from "@/shared/lib/format";
import { ExternalA, SeedNotice, SourceLinks } from "./ui";

export const REQUIREMENT_INFO: Record<EntryRequirement, { label: string; blurb: string; badge: string; dot: string }> = {
  "visa-free": {
    label: "Visa-free",
    blurb: "Just your passport, for a limited stay.",
    badge: "bg-success/10 text-success",
    dot: "bg-success",
  },
  eta: {
    label: "Travel authorization (ETA)",
    blurb: "A quick online approval before you fly, usually within days.",
    badge: "bg-brand/10 text-brand",
    dot: "bg-brand",
  },
  evisa: {
    label: "e-Visa",
    blurb: "A visa you apply for online before you travel.",
    badge: "bg-[#5a4ea0]/10 text-[#5a4ea0]",
    dot: "bg-[#5a4ea0]",
  },
  "visa-on-arrival": {
    label: "Visa on arrival",
    blurb: "You get the visa at immigration when you land.",
    badge: "bg-gold/15 text-[#7a5f1f]",
    dot: "bg-gold",
  },
  "visa-required": {
    label: "Visa required",
    blurb: "Apply at an embassy or consulate well before you go.",
    badge: "bg-danger/10 text-danger",
    dot: "bg-danger",
  },
};

const SHORT: Record<EntryRequirement, string> = {
  "visa-free": "Visa-free",
  eta: "ETA",
  evisa: "e-Visa",
  "visa-on-arrival": "Visa on arrival",
  "visa-required": "Visa required",
};

const STATE_DEPT = "https://travel.state.gov/content/travel/en/international-travel.html";

export function RequirementBadge({ requirement }: { requirement: EntryRequirement }) {
  const info = REQUIREMENT_INFO[requirement];
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", info.badge)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", info.dot)} aria-hidden />
      {SHORT[requirement]}
    </span>
  );
}

const stayText = (s: Destination["maxStay"]) => (s === null || s === "" ? "Set by your visa" : typeof s === "number" ? `${s} days` : s);

const isRequirement = (v: string | null): v is EntryRequirement => ENTRY_REQUIREMENTS.includes(v as EntryRequirement);

/** Row key and anchor: the ISO code, or the name for a group of countries ("Schengen Area" → "schengen-area"). */
const keyOf = (d: Destination) => d.iso2 ?? fold(d.country).replace(/[^a-z0-9]+/g, "-");

/** Entry requirements for U.S. passport holders: search, filter by requirement, recent changes and transit rules. */
export function EntryRequirements() {
  const params = useSearchParams();
  const [q, setQ] = useState(() => params.get("q") ?? "");
  const [req, setReq] = useState<EntryRequirement | "all">(() => {
    const r = params.get("req");
    return isRequirement(r) ? r : "all";
  });
  const { destinations, recentChanges, transitRules } = entryRequirements;

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    if (q.trim()) sp.set("q", q.trim());
    else sp.delete("q");
    if (req !== "all") sp.set("req", req);
    else sp.delete("req");
    const s = sp.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${s ? `?${s}` : ""}`);
  }, [q, req]);

  const matching = useMemo(() => {
    const query = fold(q.trim());
    return [...destinations]
      .filter((d) => !query || fold(d.country).includes(query) || d.iso2?.toLowerCase() === query)
      .sort((a, b) => a.country.localeCompare(b.country));
  }, [q, destinations]);
  const counts = ENTRY_REQUIREMENTS.reduce<Record<string, number>>((m, r) => ({ ...m, [r]: matching.filter((d) => d.requirement === r).length }), {});
  const shown = matching.filter((d) => req === "all" || d.requirement === req);
  const asOf = latestIso(destinations.map((d) => d.asOf));
  const changes = [...recentChanges].sort((a, b) => (a.date < b.date ? 1 : -1));
  // Rows open on demand; a search that narrows to one country opens it (until it's closed by hand).
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  const [closed, setClosed] = useState<ReadonlySet<string>>(() => new Set());
  const autoOpen = shown.length === 1;
  const flip = (set: ReadonlySet<string>, iso2: string) => {
    const next = new Set(set);
    if (next.has(iso2)) next.delete(iso2);
    else next.add(iso2);
    return next;
  };
  const isOpen = (iso2: string) => (autoOpen ? !closed.has(iso2) : open.has(iso2));
  const toggle = (iso2: string) => (autoOpen ? setClosed((c) => flip(c, iso2)) : setOpen((o) => flip(o, iso2)));

  return (
    <div className="bg-canvas">
      <div className="container-page space-y-6 py-8 md:py-10">
        <div role="note" className="panel flex gap-4 border-l-4 border-l-warn p-5">
          <TriangleAlert className="mt-0.5 h-6 w-6 shrink-0 text-warn" aria-hidden />
          <div className="space-y-1.5">
            <h2 className="font-semibold text-navy">Rules change. Confirm before you travel.</h2>
            <p className="text-sm leading-relaxed text-ink-2">
              Entry requirements can change with little notice. Before every trip, check the U.S. State Department&apos;s page
              for your destination (linked in each country&apos;s details) and the destination government&apos;s own site. This guide
              covers U.S. passport holders visiting as tourists for short stays.
            </p>
            <ExternalA href={STATE_DEPT} className="text-sm">
              travel.state.gov country information
            </ExternalA>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0 space-y-6">
            <section className="panel space-y-4 p-5" aria-label="Search destinations">
              <div className="relative">
                <label htmlFor="destination-search" className="sr-only">
                  Destination
                </label>
                <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden />
                <input
                  id="destination-search"
                  type="search"
                  className="input h-12 pl-9 text-base"
                  placeholder="Search a country, e.g. Japan"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  autoComplete="off"
                />
              </div>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by requirement">
                <FilterChip on={req === "all"} onClick={() => setReq("all")} label="All" count={matching.length} />
                {ENTRY_REQUIREMENTS.map((r) => (
                  <FilterChip key={r} on={req === r} onClick={() => setReq(r)} label={SHORT[r]} count={counts[r]} dot={REQUIREMENT_INFO[r].dot} />
                ))}
              </div>
              <SeedNotice datasets={["entryRequirements"]} />
            </section>

            <p className="text-sm text-ink-2" aria-live="polite">
              {shown.length === 0
                ? "No destination matches. We're adding more countries as we verify them."
                : `${shown.length} destination${shown.length === 1 ? "" : "s"}${asOf ? ` · checked ${formatIsoDate(asOf)}` : ""}`}
            </p>

            {ENTRY_REQUIREMENTS.map((r) => {
              const group = shown.filter((d) => d.requirement === r);
              if (group.length === 0) return null;
              const info = REQUIREMENT_INFO[r];
              return (
                <section key={r} aria-labelledby={`group-${r}`} className="space-y-3">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <h2 id={`group-${r}`} className="flex items-center gap-2 text-lg font-semibold text-navy">
                      <span className={cn("h-2.5 w-2.5 rounded-full", info.dot)} aria-hidden />
                      {info.label}
                    </h2>
                    <p className="text-sm text-ink-2">{info.blurb}</p>
                  </div>
                  <div className="panel overflow-hidden">
                    <table className="w-full text-sm sm:table-fixed">
                      <caption className="sr-only">
                        {info.label}: {group.length} destination{group.length === 1 ? "" : "s"}
                      </caption>
                      <thead className="hidden sm:table-header-group">
                        <tr className="border-b border-line bg-canvas text-left text-xs font-semibold tracking-wide text-ink-3 uppercase">
                          <th scope="col" className="py-2.5 pr-3 pl-5 sm:w-[26%]">
                            Destination
                          </th>
                          <th scope="col" className="px-3 py-2.5 sm:w-[30%]">
                            Max stay
                          </th>
                          <th scope="col" className="px-3 py-2.5">
                            Before you go
                          </th>
                          <th scope="col" className="py-2.5 pr-5 pl-3 text-right sm:w-16 md:w-28">
                            <span className="sr-only">Details</span>
                          </th>
                        </tr>
                      </thead>
                      {group.map((d) => (
                        <DestinationRows key={keyOf(d)} d={d} open={isOpen(keyOf(d))} onToggle={() => toggle(keyOf(d))} />
                      ))}
                    </table>
                  </div>
                </section>
              );
            })}
          </div>

          <aside className="space-y-5 lg:sticky lg:top-28 lg:self-start">
            <section className="panel p-5" aria-labelledby="changes-title">
              <h2 id="changes-title" className="flex items-center gap-2 font-semibold text-navy">
                <CalendarClock className="h-4 w-4 text-brand" aria-hidden /> Recent changes
              </h2>
              <ol className="mt-4 space-y-5 border-l-2 border-line pl-5">
                {changes.map((c) => (
                  <li key={`${c.date}-${c.country}-${c.change}`} className="relative">
                    <span className="absolute top-1.5 -left-[27px] h-3 w-3 rounded-full border-2 border-white bg-brand ring-2 ring-brand/20" aria-hidden />
                    <p className="text-xs font-semibold text-brand">
                      <time dateTime={c.date}>{formatIsoDate(c.date)}</time>
                    </p>
                    <p className="text-sm font-semibold text-ink">{c.country}</p>
                    <p className="text-sm leading-relaxed text-ink-2">{c.change}</p>
                    <SourceLinks sources={c.sources} className="mt-1 text-xs" />
                  </li>
                ))}
              </ol>
            </section>
            <section className="panel p-5" aria-labelledby="transit-title">
              <h2 id="transit-title" className="flex items-center gap-2 font-semibold text-navy">
                <PlaneTakeoff className="h-4 w-4 text-brand" aria-hidden /> Connecting flights
              </h2>
              <p className="mt-1 text-sm text-ink-2">Airside transit rules: staying in the airport between flights.</p>
              <ul className="mt-3 divide-y divide-line">
                {transitRules.map((t) => (
                  <li key={t.country} className="py-3 first:pt-1 last:pb-0">
                    <p className="text-sm font-semibold text-ink">{t.country}</p>
                    <p className="text-sm leading-relaxed text-ink-2">{t.rule}</p>
                    <SourceLinks sources={t.sources} className="mt-1 text-xs" />
                  </li>
                ))}
              </ul>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}

function FilterChip({ on, onClick, label, count, dot }: { on: boolean; onClick: () => void; label: string; count: number; dot?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn("chip cursor-pointer gap-1.5 px-3 py-1.5 text-sm", on && "border-brand bg-sky text-brand")}
    >
      {dot && <span className={cn("h-2 w-2 rounded-full", dot)} aria-hidden />}
      {label}
      <span className={cn("text-xs", on ? "text-brand/70" : "text-ink-3")}>{count}</span>
    </button>
  );
}

function DestinationRows({ d, open, onToggle }: { d: Destination; open: boolean; onToggle: () => void }) {
  const notes = noteList(d.notes);
  const detailsId = `destination-${keyOf(d)}-details`;
  const before = d.authorization
    ? `${d.authorization.name}${d.authorization.fee !== null ? ` · ${feeText(d.authorization.fee)}` : ""}`
    : d.requirement === "visa-required"
      ? "A visa from the embassy or consulate"
      : "No visa or authorization";
  return (
    <tbody id={`destination-${keyOf(d)}`} className="scroll-mt-28 border-b border-line last:border-b-0">
      <tr className={cn("cursor-pointer align-top transition-colors hover:bg-sky/40", open && "bg-sky/40")} onClick={onToggle}>
        <th scope="row" className="py-3 pr-3 pl-4 text-left font-normal sm:pl-5">
          <span className="font-semibold text-ink">{d.country}</span>
          <span className="mt-0.5 block text-xs text-ink-2 sm:hidden">
            {stayText(d.maxStay)} · {before}
          </span>
        </th>
        <td className="hidden px-3 py-3 text-ink sm:table-cell">{stayText(d.maxStay)}</td>
        <td className="hidden px-3 py-3 text-ink-2 sm:table-cell">{before}</td>
        <td className="py-2 pr-3 pl-2 text-right sm:pr-4">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            aria-expanded={open}
            aria-controls={detailsId}
            aria-label={`${open ? "Hide" : "Show"} details for ${d.country}`}
            className="inline-flex h-8 items-center gap-1 rounded px-2 text-xs font-semibold text-brand hover:bg-sky"
          >
            <span className="hidden md:inline">Details</span>
            <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} aria-hidden />
          </button>
        </td>
      </tr>
      <tr id={detailsId} hidden={!open}>
        <td colSpan={4} className="bg-canvas/60 px-4 pt-1 pb-4 sm:px-5">
          <div className="grid gap-x-6 gap-y-3 pt-3 text-sm sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold tracking-wide text-ink-3 uppercase">Before you go</p>
              {d.authorization ? (
                <p className="mt-0.5 text-ink">
                  {d.authorization.name}
                  {d.authorization.fee !== null && <span className="text-ink-2"> · {feeText(d.authorization.fee)}</span>}
                  <span className="block">
                    <ExternalA href={d.authorization.url}>Apply on the official site</ExternalA>
                  </span>
                </p>
              ) : (
                <p className="mt-0.5 text-ink">{before}</p>
              )}
            </div>
            <div>
              <p className="text-xs font-semibold tracking-wide text-ink-3 uppercase">Passport</p>
              <p className="mt-0.5 text-ink">{d.passportValidity ?? "Check the official page"}</p>
            </div>
            {notes.length > 0 && (
              <ul className="space-y-1.5 leading-relaxed text-ink-2 sm:col-span-2">
                {notes.map((n) => (
                  <li key={n} className="flex gap-2">
                    <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-ink-3" aria-hidden />
                    {n}
                  </li>
                ))}
              </ul>
            )}
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-3 sm:col-span-2">
              <RequirementBadge requirement={d.requirement} />
              <span>As of {formatIsoDate(d.asOf)}</span>
              <ExternalA href={d.officialSource} className="text-xs">
                State Department page for {d.country}
              </ExternalA>
            </p>
          </div>
        </td>
      </tr>
    </tbody>
  );
}
