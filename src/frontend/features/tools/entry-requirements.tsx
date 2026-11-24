"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { CalendarClock, ChevronDown, Hourglass, Info, PlaneTakeoff, Search, TriangleAlert } from "lucide-react";
import { ENTRY_REQUIREMENTS, type Confidence, type Destination, type EntryRequirement } from "@/shared/data/travel/types";
import { entryRequirements } from "@/shared/data/travel/entry-requirements";
import { feeText, formatIsoDate, hostOf, noteList, readableDates } from "@/shared/lib/travel-format";
import { fold } from "@/shared/lib/airports";
import { PLACE_NOTES, searchDestinations, usPlaceFor } from "@/shared/lib/entry-search";
import { cn } from "@/shared/lib/format";
import { DataNotice, ExternalA, SourceLinks } from "./ui";

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

/** "Japan is visa-free", "Kenya needs an e-Visa": what a filter hides, in a few words. */
const NEEDS: Record<EntryRequirement, string> = {
  "visa-free": "is visa-free",
  eta: "needs a travel authorization (ETA)",
  evisa: "needs an e-Visa",
  "visa-on-arrival": "gives visas on arrival",
  "visa-required": "needs a visa",
};

/** The State Department's travel advisories index: the one page of theirs confirmed after its 2026 move. */
const ADVISORIES = "https://travel.state.gov/en/international-travel/travel-advisories.html";

const CONFIDENCE: Record<Confidence, string> = {
  high: "From the destination government's own rules",
  medium: "From secondary sources (travel outlets, GOV.UK's advice or a visa dataset), not the destination's own site",
  low: "Thinly sourced",
};

export function RequirementBadge({ requirement }: { requirement: EntryRequirement }) {
  const info = REQUIREMENT_INFO[requirement];
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", info.badge)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", info.dot)} aria-hidden />
      {SHORT[requirement]}
    </span>
  );
}

/** Max stay in words; null stays unknown. */
const stayText = (s: Destination["maxStay"]) =>
  s === null || s === "" ? "Not confirmed" : typeof s === "number" ? `${s} days` : readableDates(s);

/** Prose from the data, with ISO dates written out like the page's headings. */
const prose = (s: string) => readableDates(s);

/** A fee as published, or where to find it when it isn't confirmed. */
const feeOrCheck = (fee: number | string | null) => (fee === null || fee === "" ? "Check the official site" : feeText(fee));

const isRequirement = (v: string | null): v is EntryRequirement => ENTRY_REQUIREMENTS.includes(v as EntryRequirement);

/** Row key and anchor: the ISO code, or the name for a group of countries ("Schengen Area" → "schengen-area"). */
const keyOf = (d: Destination) => d.iso2 ?? fold(d.country).replace(/[^a-z0-9]+/g, "-");

/** Country names for ISO codes (a group's members), from the browser; codes when it can't name them. */
const regionNames = (() => {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" });
  } catch {
    return null;
  }
})();
const countryName = (code: string) => {
  try {
    return regionNames?.of(code) ?? code;
  } catch {
    return code;
  }
};

/** What the official-source link points at, in words. */
function officialLabel(d: Destination): string {
  const host = hostOf(d.officialSource);
  if (host === "travel.state.gov") return `State Department travel advisories (find ${d.members ? "each country you'll visit" : d.country})`;
  if (host === "gov.uk") return "GOV.UK: check if you need a UK visa";
  if (host === "canada.ca") return "Canada.ca: visiting Canada";
  return `Official source (${host})`;
}

/** The "Before you go" summary for a row: what to get, and any form or insurance on top. */
function beforeText(d: Destination): string {
  const a = d.authorization;
  const fee = a && a.fee !== null && feeText(a.fee).length <= 24 ? ` · ${feeText(a.fee)}` : "";
  const main = a
    ? `${a.name}${fee}`
    : d.requirement === "visa-required"
      ? "A visa from the embassy or consulate"
      : d.requirement === "visa-on-arrival"
        ? "Get the visa on arrival"
        : d.upcoming
          ? "No visa or authorization for now; see what's planned"
          : d.schengen
            ? "No visa or authorization for now; ETIAS is planned for the Schengen Area"
            : "No visa or authorization";
  const extras = [d.arrivalForm?.required && "an arrival form", d.requiredInsurance && "required insurance"].filter(Boolean);
  return extras.length ? `${main}, plus ${extras.join(" and ")}` : main;
}

/** Entry requirements for U.S. passport holders: search, filter by requirement, recent changes and transit rules. */
export function EntryRequirements() {
  const params = useSearchParams();
  const [q, setQuery] = useState(() => params.get("q") ?? "");
  const [req, setReq] = useState<EntryRequirement | "all">(() => {
    const r = params.get("req");
    return isRequirement(r) ? r : "all";
  });
  const { destinations, recentChanges, plannedChanges, transitRules, verifiedAt } = entryRequirements;
  const setQ = (v: string) => {
    setQuery(v);
    setAllSide(false);
  };

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    if (q.trim()) sp.set("q", q.trim());
    else sp.delete("q");
    if (req !== "all") sp.set("req", req);
    else sp.delete("req");
    const s = sp.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${s ? `?${s}` : ""}`);
  }, [q, req]);

  // Names people type ("UK", "Turkey", "Dubai") find their country, and a country inside a group (Slovenia, in the
  // Schengen Area) finds the group.
  const { matching, via } = useMemo(() => searchDestinations(destinations, q, keyOf, countryName), [q, destinations]);
  const counts = ENTRY_REQUIREMENTS.reduce<Record<string, number>>((m, r) => ({ ...m, [r]: matching.filter((d) => d.requirement === r).length }), {});
  const shown = matching.filter((d) => req === "all" || d.requirement === req);
  // Nothing shows: the filter hides what the search found, or the search names a U.S. place, or nothing matches.
  const hiddenByFilter = shown.length === 0 && matching.length > 0;
  const usPlace = matching.length === 0 && q.trim() ? usPlaceFor(q) : null;
  // A search for a few countries narrows the side panels to them too (Thailand's own change and transit rule), with a
  // way back to the full lists.
  const [allSide, setAllSide] = useState(false);
  const focus = q.trim() && shown.length > 0 && shown.length <= 3 && !allSide ? shown : null;
  const about = (country: string, text = "") => {
    if (!focus) return true;
    const names = focus.flatMap((d) => [d.country, ...(d.schengen ? ["Schengen Area"] : [])]);
    return names.some((n) => fold(country).includes(fold(n)) || fold(text).includes(fold(n)));
  };
  const changes = [...recentChanges].sort((a, b) => (a.date < b.date ? 1 : -1)).filter((c) => about(c.country));
  const transit = transitRules.filter((t) => about(t.country, t.rule));
  const planned = plannedChanges.filter((c) => about(c.country));
  const narrowed = focus !== null && (changes.length < recentChanges.length || transit.length < transitRules.length);
  const showAll = () => setAllSide(true);
  // Member rows point to the Schengen Area entry: search for it, so it opens on its own.
  const openGroup = (name: string) => {
    setReq("all");
    setQ(name);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
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
            <h2 className="font-semibold text-navy">Rules change. Confirm with the official source before you travel.</h2>
            <p className="text-sm leading-relaxed text-ink-2">
              Entry requirements can change with little notice. Before every trip, look up your destination on the U.S. State
              Department&apos;s travel advisories pages (the &ldquo;Entry, exit and visa requirements&rdquo; section) and check the
              destination government&apos;s own site. Only the UK entry here comes straight from its government&apos;s rules; the
              others rest on secondary sources, so treat them as a starting point. This guide covers U.S. passport holders
              visiting as tourists for short stays.
            </p>
            <ExternalA href={ADVISORIES} className="text-sm">
              State Department travel advisories
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
              <DataNotice datasets={["entryRequirements"]} />
            </section>

            <p className="text-sm text-ink-2" aria-live="polite">
              {hiddenByFilter ? (
                <>
                  {matching.length === 1
                    ? `${matching[0].country} ${NEEDS[matching[0].requirement]}, so the ${SHORT[req as EntryRequirement]} filter hides it.`
                    : `${matching.length} destinations match your search, but the ${SHORT[req as EntryRequirement]} filter hides them all.`}{" "}
                  <button type="button" onClick={() => setReq("all")} className="font-semibold text-brand hover:underline">
                    Show all requirements
                  </button>
                </>
              ) : shown.length > 0 ? (
                `${shown.length} destination${shown.length === 1 ? "" : "s"} · checked ${formatIsoDate(verifiedAt)}`
              ) : usPlace ? (
                usPlace.kind === "country" ? (
                  "This guide is for U.S. citizens going abroad, so the United States itself isn't listed."
                ) : (
                  `${usPlace.name} ${usPlace.kind === "territory" ? "is a U.S. territory" : "is in the United States"}, so it isn't listed: this guide is for U.S. citizens going abroad.`
                )
              ) : (
                "No destination matches. We're adding more countries as we verify them."
              )}
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
                        <DestinationRows
                          key={keyOf(d)}
                          d={d}
                          via={via.get(keyOf(d))}
                          open={isOpen(keyOf(d))}
                          onToggle={() => toggle(keyOf(d))}
                          onOpenGroup={openGroup}
                        />
                      ))}
                    </table>
                  </div>
                </section>
              );
            })}
          </div>

          <aside className="min-w-0 space-y-5">
            {narrowed && (
              <p className="flex flex-wrap items-baseline gap-x-2 text-sm text-ink-2" aria-live="polite">
                Showing changes and connections for your search.
                <button type="button" onClick={showAll} className="font-semibold text-brand hover:underline">
                  Show all
                </button>
              </p>
            )}
            {planned.length > 0 && (
              <section className="panel p-5" aria-labelledby="planned-title">
                <h2 id="planned-title" className="flex items-center gap-2 font-semibold text-navy">
                  <Hourglass className="h-4 w-4 text-brand" aria-hidden /> Coming up
                </h2>
                <ul className="mt-3 space-y-4">
                  {planned.map((c) => (
                    <li key={`${c.country}-${c.change}`}>
                      <p className="text-sm font-semibold text-ink">{c.country}</p>
                      <p className="text-sm leading-relaxed text-ink-2">{prose(c.change)}</p>
                      <p className="mt-1 text-xs leading-relaxed text-ink-3">
                        <span className="font-semibold text-ink-2">Status ({formatIsoDate(c.asOf)}):</span> {prose(c.status)}
                      </p>
                      <SourceLinks sources={c.sources} max={2} className="mt-1 text-xs" />
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {changes.length > 0 && (
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
                    <p className="text-sm leading-relaxed text-ink-2">{prose(c.change)}</p>
                    <SourceLinks sources={c.sources} max={2} className="mt-1 text-xs" />
                  </li>
                ))}
              </ol>
            </section>
            )}
            {transit.length > 0 && (
            <section className="panel p-5" aria-labelledby="transit-title">
              <h2 id="transit-title" className="flex items-center gap-2 font-semibold text-navy">
                <PlaneTakeoff className="h-4 w-4 text-brand" aria-hidden /> Connecting flights
              </h2>
              <p className="mt-1 text-sm text-ink-2">Changing planes, staying airside, and stopovers that leave the airport.</p>
              <ul className="mt-3 divide-y divide-line">
                {transit.map((t) => (
                  <li key={t.country} className="py-2 first:pt-1 last:pb-0">
                    <details className="group" open={focus !== null && t.country.includes(focus[0].country) ? true : undefined}>
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 py-1 text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden">
                        {t.country}
                        <ChevronDown className="h-4 w-4 shrink-0 text-brand transition-transform group-open:rotate-180" aria-hidden />
                      </summary>
                      <p className="mt-1 text-sm leading-relaxed text-ink-2">{prose(t.rule)}</p>
                      {t.confidence && <p className="mt-1.5 text-xs text-ink-3">{CONFIDENCE[t.confidence]}.</p>}
                      {t.evidence && <p className="mt-1 text-xs leading-relaxed text-ink-3">Where this comes from: {prose(t.evidence.replace(/\.$/, ""))}.</p>}
                      <SourceLinks sources={t.sources} max={3} className="mt-1 text-xs" />
                    </details>
                  </li>
                ))}
              </ul>
            </section>
            )}
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

function Detail({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={cn("min-w-0", wide && "sm:col-span-2")}>
      <p className="text-xs font-semibold tracking-wide text-ink-3 uppercase">{label}</p>
      <div className="mt-0.5 space-y-1 text-ink">{children}</div>
    </div>
  );
}

/** One line of facts, skipping the empty ones: "Valid 2 years · Allow up to 3 working days". */
const facts = (...parts: (string | null | undefined | false)[]) => parts.filter(Boolean).join(" · ");

function DestinationRows({
  d,
  via,
  open,
  onToggle,
  onOpenGroup,
}: {
  d: Destination;
  via?: string;
  open: boolean;
  onToggle: () => void;
  /** Show a group's entry (the Schengen Area, for a member country). */
  onOpenGroup: (name: string) => void;
}) {
  // Member rows say "see the Schengen Area entry" in their own block below, with a link.
  const notes = noteList(d.notes)
    .filter((n) => !(d.schengen && /^Schengen rules apply; see the Schengen Area entry\.?$/.test(n)))
    .map(prose);
  const detailsId = `destination-${keyOf(d)}-details`;
  const before = beforeText(d);
  const a = d.authorization;
  const form = d.arrivalForm;
  const ins = d.requiredInsurance;
  const up = d.upcoming;
  return (
    <tbody id={`destination-${keyOf(d)}`} className="scroll-mt-28 border-b border-line last:border-b-0">
      <tr className={cn("cursor-pointer align-top transition-colors hover:bg-sky/40", open && "bg-sky/40")} onClick={onToggle}>
        <th scope="row" className="py-3 pr-3 pl-4 text-left font-normal sm:pl-5">
          <span className="font-semibold text-ink">{d.country}</span>
          {via && <span className="block text-xs text-ink-3">Includes {via}</span>}
          {via && PLACE_NOTES[via] && (
            <span className="mt-1 flex items-start gap-1 text-xs leading-snug font-medium text-[#7a4106]">
              <Info className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
              {PLACE_NOTES[via]}
            </span>
          )}
          {d.caution && (
            <span className="mt-1 flex items-start gap-1 text-xs leading-snug font-semibold text-danger">
              <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
              {d.caution}
            </span>
          )}
          <span className="mt-0.5 block text-xs text-ink-2 sm:hidden">
            {stayText(d.maxStay)} · {before}
          </span>
        </th>
        <td className={cn("hidden px-3 py-3 sm:table-cell", d.maxStay === null ? "text-ink-3" : "text-ink")}>{stayText(d.maxStay)}</td>
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
          <div className="grid gap-x-6 gap-y-4 pt-3 text-sm sm:grid-cols-2">
            <Detail label="Before you go">
              {a ? (
                <>
                  <p>{a.name}</p>
                  <p className="text-ink-2">
                    <span className="text-ink-3">Fee:</span> {feeOrCheck(a.fee)}
                  </p>
                  {(a.validity || a.processing || a.howToApply) && (
                    <p className="text-ink-2">{prose(facts(a.validity && `Valid: ${a.validity}`, a.processing, a.howToApply))}</p>
                  )}
                  {a.feeNote && <p className="text-xs leading-relaxed text-ink-3">On the fee: {prose(a.feeNote)}</p>}
                  <p className="flex flex-wrap gap-x-3">
                    {a.url ? (
                      <ExternalA href={a.url}>Official site</ExternalA>
                    ) : (
                      <span className="text-ink-3">Official site not confirmed yet: start from the State Department page below.</span>
                    )}
                    {a.applyUrl && <ExternalA href={a.applyUrl}>Application form</ExternalA>}
                  </p>
                </>
              ) : (
                <p>{before}</p>
              )}
            </Detail>
            <Detail label="Stay and passport">
              <p>
                <span className="text-ink-3">Max stay:</span> {d.maxStay === null ? "Not confirmed: check the official source" : stayText(d.maxStay)}
              </p>
              <p>
                <span className="text-ink-3">Passport:</span> {d.passportValidity ?? "Not confirmed: check the official source"}
              </p>
            </Detail>
            {form && (
              <Detail label="Arrival form">
                <p>
                  {form.name} <span className="text-ink-2">· {form.required ? "required" : "optional"}</span>
                </p>
                <p className="text-ink-2">{prose(facts(form.window, `Fee: ${form.fee ?? "check the official site"}`))}</p>
                {form.url ? (
                  <ExternalA href={form.url}>Official form</ExternalA>
                ) : (
                  <p className="text-ink-3">Official site not confirmed yet. Use only the government&apos;s own site.</p>
                )}
              </Detail>
            )}
            {ins && (
              <Detail label={`Required insurance, since ${formatIsoDate(ins.from)}`}>
                <p>{ins.name}</p>
                <p className="text-ink-2">
                  <span className="text-ink-3">Price:</span> {ins.fee ? prose(ins.fee) : "Not confirmed: check the official site"}
                </p>
                <p className="text-xs leading-relaxed text-ink-2">{prose(ins.note)}</p>
                <p className="flex flex-wrap gap-x-3">
                  <ExternalA href={ins.url}>Official insurance portal</ExternalA>
                  {ins.zanzibarUrl && <ExternalA href={ins.zanzibarUrl}>Arriving in Zanzibar</ExternalA>}
                </p>
              </Detail>
            )}
            {up && (
              <Detail label="Coming up" wide>
                <p>{up.name}</p>
                <p className="text-xs leading-relaxed text-ink-2">{prose(up.status)}</p>
                {(up.fee || up.validity) && <p className="text-xs text-ink-2">{prose(facts(up.fee && `Planned fee: ${up.fee}`, up.validity))}</p>}
                {up.url && <ExternalA href={up.url}>Official site</ExternalA>}
              </Detail>
            )}
            {d.schengen && (
              <Detail label="Schengen rules" wide>
                <p className="text-ink-2">
                  Days here count toward the Schengen Area&apos;s shared 90-day limit. The EU&apos;s Entry/Exit System registers
                  you at the border, and ETIAS is planned.{" "}
                  <button type="button" onClick={() => onOpenGroup("Schengen Area")} className="font-semibold text-brand hover:underline">
                    See the Schengen Area entry
                  </button>
                </p>
              </Detail>
            )}
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
            <div className="space-y-1.5 text-xs text-ink-3 sm:col-span-2">
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <RequirementBadge requirement={d.requirement} />
                <span>Sources as of {formatIsoDate(d.asOf)}</span>
                {d.confidence && <span>{CONFIDENCE[d.confidence]}</span>}
              </p>
              <p className="flex flex-wrap gap-x-2 gap-y-1">
                <span>Confirm on:</span>
                <ExternalA href={d.officialSource} className="text-xs">
                  {officialLabel(d)}
                </ExternalA>
              </p>
              {d.evidence && (
                <details>
                  <summary className="cursor-pointer font-medium text-brand">Where this comes from</summary>
                  <p className="mt-1 leading-relaxed">{prose(d.evidence)}</p>
                  <SourceLinks sources={d.sources} className="mt-1" />
                </details>
              )}
              {!d.evidence && <SourceLinks sources={d.sources} max={3} />}
            </div>
          </div>
        </td>
      </tr>
    </tbody>
  );
}
