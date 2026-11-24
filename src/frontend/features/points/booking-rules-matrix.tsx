"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowDownWideNarrow, ChevronDown, Search } from "lucide-react";
import {
  ALLIANCES,
  BOOKING_RULE_KEYS,
  bookingRules,
  programRef,
  type Alliance,
  type BookingRuleKey,
  type BookingRules,
  type ProgramId,
} from "@/shared/data/points";
import { cn } from "@/shared/lib/format";
import { BOOKING_RULE_LABEL, SameRulesLink, knownRuleCount, ruleText, windowNotes } from "./booking-rules";
import { Segmented, SelectField, ToggleChip } from "./controls";
import { Dot, SourceList, Unknown, formatAsOf, programColor } from "./ui";

export interface RuleFilters {
  q: string;
  alliance: Alliance | "none" | "all";
  sort: "name" | "window" | "known";
  /** Rule columns to show. */
  cols: BookingRuleKey[];
}

/** Most rules confirmed first by default, so the page opens on what's known rather than on gaps. */
export const DEFAULT_RULE_FILTERS: RuleFilters = { q: "", alliance: "all", sort: "known", cols: [...BOOKING_RULE_KEYS] };

const ALLIANCE_SLUG: Record<Alliance | "none", string> = { "Star Alliance": "star-alliance", oneworld: "oneworld", SkyTeam: "skyteam", none: "none" };
/** Rules each phone card shows before "All rules". */
const PHONE_RULES = 3;

export function readRuleFilters(params: Pick<URLSearchParams, "get">): RuleFilters {
  const slug = params.get("alliance");
  const alliance = (Object.keys(ALLIANCE_SLUG) as (Alliance | "none")[]).find((a) => ALLIANCE_SLUG[a] === slug) ?? "all";
  const sort = params.get("sort");
  const cols = (params.get("rules") ?? "").split(",").filter((k): k is BookingRuleKey => (BOOKING_RULE_KEYS as readonly string[]).includes(k));
  return {
    q: params.get("q") ?? "",
    alliance,
    sort: sort === "window" || sort === "name" ? sort : "known",
    cols: cols.length ? BOOKING_RULE_KEYS.filter((k) => cols.includes(k)) : [...BOOKING_RULE_KEYS],
  };
}

/** The canonical query string for these filters (defaults left out). */
function ruleQuery(f: RuleFilters): string {
  const sp = new URLSearchParams();
  if (f.q.trim()) sp.set("q", f.q);
  if (f.alliance !== "all") sp.set("alliance", ALLIANCE_SLUG[f.alliance]);
  if (f.sort !== "known") sp.set("sort", f.sort);
  if (f.cols.length && f.cols.length < BOOKING_RULE_KEYS.length) sp.set("rules", f.cols.join(","));
  return sp.toString();
}

function writeRuleFilters(f: RuleFilters) {
  const qs = ruleQuery(f);
  window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`);
}

/** The matrix with filters in the URL (?q=&alliance=oneworld&sort=window&rules=holds,stopovers). Needs <Suspense>. */
export function BookingRulesExplorer() {
  const params = useSearchParams();
  const filters = readRuleFilters(params);
  // Values the page can't use (?alliance=nope&rules=bogus) are dropped from the URL, as the planner does. A search
  // being typed is left alone (only the other filters are compared).
  const query = params.toString();
  useEffect(() => {
    const sp = new URLSearchParams(query);
    const ours = new URLSearchParams([...sp].filter(([k]) => ["alliance", "sort", "rules"].includes(k))).toString();
    const clean = readRuleFilters(sp);
    const cleanOurs = new URLSearchParams([...new URLSearchParams(ruleQuery(clean))].filter(([k]) => k !== "q")).toString();
    if (ours !== cleanOurs) writeRuleFilters(clean);
  }, [query]);
  return <BookingRulesMatrix filters={filters} onChange={(patch) => writeRuleFilters({ ...filters, ...patch })} />;
}

interface Row {
  rules: BookingRules;
  id: ProgramId;
  name: string;
  alliance?: Alliance;
  known: number;
}

export function filterRules(f: RuleFilters): Row[] {
  const q = f.q.trim().toLowerCase();
  const rows = bookingRules.map((rules): Row => {
    const ref = programRef(rules.program);
    return { rules, id: rules.program, name: ref.name, alliance: ref.alliance, known: knownRuleCount(rules) };
  });
  const out = rows.filter(
    (r) =>
      (f.alliance === "all" || (f.alliance === "none" ? !r.alliance : r.alliance === f.alliance)) &&
      (!q || r.name.toLowerCase().includes(q) || f.cols.some((k) => (ruleText(r.rules, k) ?? "").toLowerCase().includes(q))),
  );
  const days = (r: Row) => r.rules.bookingWindowDays ?? -1;
  // A program that uses another's rules (Virgin Red) has nothing of its own to rank, so it goes last.
  const borrowed = (r: Row) => Number(Boolean(r.rules.sameAs));
  return out.sort((a, b) =>
    f.sort === "window"
      ? borrowed(a) - borrowed(b) || days(b) - days(a) || a.name.localeCompare(b.name)
      : f.sort === "known"
        ? borrowed(a) - borrowed(b) || b.known - a.known || a.name.localeCompare(b.name)
        : a.name.localeCompare(b.name),
  );
}

/**
 * Programs × booking rules. md+: a table (first column sticky, scrolls sideways inside its panel); phones: one card
 * per program. Unknown rules read "Not confirmed". Without `onChange` it renders unfiltered and inert (prerender).
 */
export function BookingRulesMatrix({ filters = DEFAULT_RULE_FILTERS, onChange }: { filters?: RuleFilters; onChange?: (patch: Partial<RuleFilters>) => void }) {
  const [open, setOpen] = useState<Set<ProgramId>>(new Set());
  const rows = filterRules(filters);
  const cols = filters.cols;
  const toggle = (id: ProgramId) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleCol = (k: BookingRuleKey) => {
    const next = cols.includes(k) ? cols.filter((c) => c !== k) : BOOKING_RULE_KEYS.filter((c) => c === k || cols.includes(c));
    onChange?.({ cols: next.length ? next : [k] });
  };
  const unknownCount = rows.filter((r) => !r.rules.sameAs).reduce((n, r) => n + cols.filter((k) => ruleText(r.rules, k) === null).length, 0);

  return (
    <div className="space-y-5">
      <div className="panel space-y-4 p-4 md:p-5">
        <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
          <label className="flex min-w-0 flex-1 basis-56 flex-col gap-1">
            <span className="text-xs font-semibold tracking-wide text-ink-3 uppercase">Search</span>
            <span className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden />
              <input
                type="search"
                className="input h-10 pl-9"
                placeholder="Program or rule, e.g. stopover"
                value={filters.q}
                onChange={(e) => onChange?.({ q: e.target.value })}
                disabled={!onChange}
              />
            </span>
          </label>
          <SelectField<RuleFilters["sort"]>
            id="rules-sort"
            label="Sort"
            value={filters.sort}
            onChange={onChange && ((sort) => onChange({ sort }))}
            options={[
              { value: "known", label: "Most rules confirmed" },
              { value: "window", label: "Longest booking window" },
              { value: "name", label: "Program name" },
            ]}
            className="w-full sm:w-56"
          />
        </div>
        <Segmented<RuleFilters["alliance"]>
          label="Alliance"
          value={filters.alliance}
          onChange={onChange && ((alliance) => onChange({ alliance }))}
          className="flex-wrap"
          options={[
            { value: "all", label: "Any alliance" },
            ...ALLIANCES.map((a) => ({ value: a, label: a })),
            { value: "none", label: "No alliance" },
          ]}
        />
        <div role="group" aria-label="Rules to compare" className="flex flex-wrap items-center gap-1.5 border-t border-line pt-4">
          <span className="mr-1 text-xs font-semibold tracking-wide text-ink-3 uppercase">Compare</span>
          {BOOKING_RULE_KEYS.map((k) => (
            <ToggleChip key={k} pressed={cols.includes(k)} onToggle={onChange && (() => toggleCol(k))}>
              {BOOKING_RULE_LABEL[k].short}
            </ToggleChip>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-ink-2" aria-live="polite">
        <p>
          <span className="font-semibold text-ink">{rows.length}</span> of {bookingRules.length} programs
          {unknownCount > 0 && (
            <>
              {" "}
              · <Unknown>Not confirmed</Unknown> marks the {unknownCount} rule{unknownCount === 1 ? "" : "s"} no source confirmed
            </>
          )}{" "}
          · <abbr title="The Points Guy">TPG</abbr> = The Points Guy, <abbr title="Upgraded Points">UP</abbr> = Upgraded Points
        </p>
        {onChange && (filters.q || filters.alliance !== "all" || filters.sort !== "known" || cols.length < BOOKING_RULE_KEYS.length) && (
          <button type="button" className="font-semibold text-brand hover:underline" onClick={() => onChange(DEFAULT_RULE_FILTERS)}>
            Clear filters
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="panel flex flex-col items-center gap-3 p-10 text-center text-ink-2">
          <p>No program or rule matches {filters.q.trim() ? <>&ldquo;{filters.q.trim()}&rdquo;</> : "these filters"}.</p>
          {onChange && (
            <button type="button" className="btn-secondary" onClick={() => onChange(DEFAULT_RULE_FILTERS)}>
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <>
          {cols.length > 3 && (
            <p className="hidden text-xs text-ink-3 md:block">Scroll the table sideways for every rule, or pick the rules to compare above.</p>
          )}
          <div className="panel hidden overflow-x-auto md:block">
            <table className="w-full border-separate border-spacing-0 text-sm" style={{ minWidth: 240 + cols.length * 230 }}>
              <caption className="sr-only">Booking rules by airline program</caption>
              <thead>
                <tr>
                  <th scope="col" className="sticky left-0 z-10 w-60 border-b border-line bg-white px-4 py-3 text-left align-bottom">
                    <SortHeader label="Program" active={filters.sort === "name"} onClick={onChange && (() => onChange({ sort: "name" }))} />
                  </th>
                  {cols.map((k) => (
                    <th key={k} scope="col" className="border-b border-line px-3 py-3 text-left align-bottom">
                      {k === "bookingWindowDays" ? (
                        <SortHeader label={BOOKING_RULE_LABEL[k].label} active={filters.sort === "window"} onClick={onChange && (() => onChange({ sort: "window" }))} />
                      ) : (
                        <span className="text-xs font-semibold tracking-wide text-ink-3 uppercase">{BOOKING_RULE_LABEL[k].label}</span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const expanded = open.has(r.id);
                  const last = i === rows.length - 1;
                  return (
                    <tr key={r.id} className="align-top">
                      <th scope="row" className={cn("sticky left-0 z-10 bg-white px-4 py-3 text-left font-normal", !last && "border-b border-line")}>
                        <Link href={`/points/programs/${r.id}#booking-rules`} className="flex items-center gap-2 font-semibold text-ink hover:text-brand">
                          <Dot color={programColor({ kind: "airline", alliance: r.alliance })} /> {r.name}
                        </Link>
                        <span className="mt-0.5 block text-xs text-ink-3">
                          {r.alliance ?? "No alliance"} · {r.rules.sameAs ? "uses another program's rules" : `${r.known}/${BOOKING_RULE_KEYS.length} confirmed`} ·{" "}
                          {formatAsOf(r.rules.asOf)}
                        </span>
                        {!r.rules.sameAs && (
                          <button
                            type="button"
                            onClick={() => toggle(r.id)}
                            aria-expanded={expanded}
                            className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline"
                          >
                            {expanded ? "Shorter" : "Full text"} <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-180")} aria-hidden />
                          </button>
                        )}
                      </th>
                      {r.rules.sameAs ? (
                        <td colSpan={cols.length} className={cn("px-3 py-3 text-[13px] leading-relaxed text-ink-2", !last && "border-b border-line")}>
                          <p>{r.rules.notes?.[0]}</p>
                          <SameRulesLink rules={r.rules} className="mt-1 inline-flex items-center gap-1 font-semibold text-brand hover:underline" />
                        </td>
                      ) : (
                        cols.map((k) => {
                          const text = ruleText(r.rules, k);
                          const qualifiers = k === "bookingWindowDays" && text ? windowNotes(r.rules) : [];
                          return (
                            <td key={k} className={cn("px-3 py-3 text-[13px] leading-relaxed text-ink", !last && "border-b border-line", text === null && "bg-canvas/70")}>
                              {text === null ? <Unknown>Not confirmed</Unknown> : <p className={cn(!expanded && "line-clamp-5")}>{text}</p>}
                              {qualifiers.map((q) => (
                                <p key={q} className={cn("mt-1 text-xs text-ink-2", !expanded && "line-clamp-3")}>
                                  {q}
                                </p>
                              ))}
                            </td>
                          );
                        })
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <ul className="space-y-4 md:hidden">
            {rows.map((r) => {
              const expanded = open.has(r.id);
              const known = cols.filter((k) => ruleText(r.rules, k) !== null);
              const unknown = cols.filter((k) => ruleText(r.rules, k) === null);
              // Phones show the first few rules; the rest (and every rule's full text) open on request.
              const shown = expanded ? known : known.slice(0, PHONE_RULES);
              return (
                <li key={r.id} className="panel p-4">
                  <Link href={`/points/programs/${r.id}#booking-rules`} className="flex items-center gap-2 font-semibold text-navy">
                    <Dot color={programColor({ kind: "airline", alliance: r.alliance })} /> {r.name}
                  </Link>
                  <p className="mt-0.5 text-xs text-ink-3">
                    {r.alliance ?? "No alliance"} · {r.rules.sameAs ? "uses another program's rules" : `${r.known}/${BOOKING_RULE_KEYS.length} confirmed`} ·{" "}
                    {formatAsOf(r.rules.asOf)}
                  </p>
                  {r.rules.sameAs ? (
                    <div className="mt-3 space-y-1 text-sm text-ink-2">
                      <p>{r.rules.notes?.[0]}</p>
                      <SameRulesLink rules={r.rules} />
                    </div>
                  ) : (
                    <>
                      <dl className="mt-3 space-y-2.5">
                        {shown.map((k) => (
                          <div key={k}>
                            <dt className="text-xs font-semibold tracking-wide text-ink-3 uppercase">{BOOKING_RULE_LABEL[k].short}</dt>
                            <dd className={cn("mt-0.5 text-sm text-ink", !expanded && "line-clamp-3")}>{ruleText(r.rules, k)}</dd>
                            {k === "bookingWindowDays" &&
                              windowNotes(r.rules).map((q) => (
                                <dd key={q} className={cn("mt-0.5 text-xs text-ink-2", !expanded && "line-clamp-2")}>
                                  {q}
                                </dd>
                              ))}
                          </div>
                        ))}
                      </dl>
                      {unknown.length > 0 && (
                        <p className="mt-2.5 rounded-md bg-canvas px-2.5 py-1.5 text-xs text-ink-2">
                          <Unknown>Not confirmed</Unknown>: {unknown.map((k) => BOOKING_RULE_LABEL[k].short).join(", ")}
                        </p>
                      )}
                    </>
                  )}
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    {!r.rules.sameAs && known.length > 0 && (
                      <button type="button" onClick={() => toggle(r.id)} aria-expanded={expanded} className="text-xs font-semibold text-brand hover:underline">
                        {expanded ? "Shorter" : known.length > PHONE_RULES ? `All ${known.length} rules, full text` : "Full text"}
                      </button>
                    )}
                    <SourceList urls={r.rules.sources} />
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

function SortHeader({ label, active, onClick }: { label: string; active: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1 text-xs font-semibold tracking-wide uppercase",
        active ? "text-brand" : "text-ink-3 hover:text-ink",
      )}
    >
      {label}
      <ArrowDownWideNarrow className={cn("h-3.5 w-3.5", !active && "opacity-40")} aria-hidden />
    </button>
  );
}
