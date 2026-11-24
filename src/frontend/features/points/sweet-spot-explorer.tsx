"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronDown, Plus, SearchX, SlidersHorizontal } from "lucide-react";
import { REGIONS, sweetSpots, type Cabin, type Region, type SweetSpot } from "@/shared/data/points";
import { cn } from "@/shared/lib/format";
import { SelectField, Segmented, Switch, ToggleChip } from "./controls";
import { SweetSpotCard } from "./sweet-spot-card";
import { CABIN_LABEL } from "./ui";
import { useWalletReach, type WalletReach } from "./use-wallet-reach";

export interface SweetSpotFilters {
  type: "all" | "flight" | "hotel";
  region: Region | "all";
  cabin: Cabin | "all";
  /** Only sweet spots the wallet can book. */
  mine: boolean;
  sort: "featured" | "points";
}

export const DEFAULT_SWEET_SPOT_FILTERS: SweetSpotFilters = { type: "all", region: "all", cabin: "all", mine: false, sort: "featured" };

const CABINS: Cabin[] = ["economy", "premium economy", "business", "first"];
/** Cards shown before "Show more" (a phone fits one per screen, so the full list would run for metres). */
const PAGE = 12;
const cabinSlug = (c: Cabin) => c.replace(" ", "-");

/**
 * Filters from the URL (?type=flight&region=Japan&cabin=business&mine=1&sort=points), ignoring bad values. Hotels have
 * no cabin, so a cabin with type=hotel is dropped (it would match nothing, with its chip disabled).
 */
export function readSweetSpotFilters(params: Pick<URLSearchParams, "get">): SweetSpotFilters {
  const raw = params.get("type");
  const type = raw === "flight" || raw === "hotel" ? raw : "all";
  const region = params.get("region");
  const cabin = CABINS.find((c) => cabinSlug(c) === params.get("cabin"));
  return {
    type,
    region: (REGIONS as readonly string[]).includes(region ?? "") ? (region as Region) : "all",
    cabin: type === "hotel" ? "all" : (cabin ?? "all"),
    mine: params.get("mine") === "1",
    sort: params.get("sort") === "points" ? "points" : "featured",
  };
}

const FILTER_KEYS = ["type", "region", "cabin", "mine", "sort"];

/** The canonical query string for these filters (defaults left out). */
function sweetSpotQuery(f: SweetSpotFilters): string {
  const sp = new URLSearchParams();
  if (f.type !== "all") sp.set("type", f.type);
  if (f.region !== "all") sp.set("region", f.region);
  if (f.cabin !== "all") sp.set("cabin", cabinSlug(f.cabin));
  if (f.mine) sp.set("mine", "1");
  if (f.sort !== "featured") sp.set("sort", f.sort);
  return sp.toString();
}

function writeSweetSpotFilters(f: SweetSpotFilters) {
  const qs = sweetSpotQuery(f);
  window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`);
}

/**
 * Filtered, in featured order or by fewest points. With a wallet that reaches any program, featured order puts the
 * sweet spots it can book first (each group keeps the featured order).
 */
export function filterSweetSpots(list: SweetSpot[], f: SweetSpotFilters, w: Pick<WalletReach, "reach">): SweetSpot[] {
  const out = list.filter(
    (s) =>
      (f.type === "all" || s.kind === f.type) &&
      (f.region === "all" || s.to === f.region) &&
      (f.cabin === "all" || s.cabin === f.cabin) &&
      (!f.mine || w.reach.has(s.program)),
  );
  if (f.sort === "points") return [...out].sort((a, b) => a.points - b.points);
  return w.reach.size > 0 ? [...out.filter((s) => w.reach.has(s.program)), ...out.filter((s) => !w.reach.has(s.program))] : out;
}

/** The sweet spot grid with filters kept in the URL. Needs a <Suspense> boundary (useSearchParams). */
export function SweetSpotExplorer() {
  const params = useSearchParams();
  const filters = readSweetSpotFilters(params);
  const wallet = useWalletReach();
  // A link with values the page can't use (?type=bogus, a cabin with type=hotel) shows what it can; the URL says so too.
  const query = params.toString();
  useEffect(() => {
    const sp = new URLSearchParams(query);
    const ours = new URLSearchParams([...sp].filter(([k]) => FILTER_KEYS.includes(k))).toString();
    const clean = readSweetSpotFilters(sp);
    if (ours !== sweetSpotQuery(clean)) writeSweetSpotFilters(clean);
  }, [query]);
  return <SweetSpotBrowser filters={filters} onChange={(patch) => writeSweetSpotFilters({ ...filters, ...patch })} wallet={wallet} />;
}

/** Filter bar + grid. Without `onChange` it renders the unfiltered list, inert (the prerendered fallback). */
export function SweetSpotBrowser({
  filters = DEFAULT_SWEET_SPOT_FILTERS,
  onChange,
  wallet,
}: {
  filters?: SweetSpotFilters;
  onChange?: (patch: Partial<SweetSpotFilters>) => void;
  wallet?: WalletReach;
}) {
  const personal = Boolean(wallet?.hydrated);
  const hasCards = (wallet?.points.cards.length ?? 0) > 0;
  const results = filterSweetSpots(sweetSpots, filters, { reach: wallet?.reach ?? new Map() });
  const regions = REGIONS.filter((r) => sweetSpots.some((s) => s.to === r));
  const bookable = wallet ? sweetSpots.filter((s) => wallet.reach.has(s.program)).length : 0;
  const filtered =
    filters.type !== "all" || filters.region !== "all" || filters.cabin !== "all" || filters.mine || filters.sort !== "featured";
  // How many cards show, reset to one page whenever the filters change. A link to one card
  // (/points/sweet-spots#<id>) starts with enough pages to include it. The live list renders only in the browser
  // (it reads the URL), so the hash can be read while it first renders.
  const sig = JSON.stringify(filters);
  const [page, setPage] = useState(() => {
    const id = onChange && typeof window !== "undefined" ? decodeURIComponent(window.location.hash.slice(1)) : "";
    const at = id ? results.findIndex((s) => s.id === id) : -1;
    return { sig, count: at < PAGE ? PAGE : Math.ceil((at + 1) / PAGE) * PAGE };
  });
  const count = page.sig === sig ? page.count : PAGE;
  const visible = results.slice(0, count);
  useEffect(() => {
    if (!onChange) return;
    const id = decodeURIComponent(window.location.hash.slice(1));
    // The browser scrolled before the card existed; bring it into view now.
    if (id && results.findIndex((s) => s.id === id) >= PAGE) window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: "start" }), 50);
    // Only on arrival: later filter changes shouldn't jump back to the linked card.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // On phones the filters fold behind one button so the first sweet spots show on the first screen.
  const [showFilters, setShowFilters] = useState(false);
  const active = [filters.type !== "all", filters.region !== "all", filters.cabin !== "all", filters.mine, filters.sort !== "featured"].filter(Boolean).length;

  return (
    <div className="space-y-6">
      <button
        type="button"
        className="btn-secondary w-full justify-between sm:hidden"
        aria-expanded={showFilters}
        aria-controls="sweet-spot-filters"
        onClick={() => setShowFilters((o) => !o)}
      >
        <span className="inline-flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4" aria-hidden /> Filters{active ? ` · ${active} on` : ""}
        </span>
        <ChevronDown className={cn("h-4 w-4 transition-transform", showFilters && "rotate-180")} aria-hidden />
      </button>
      <div id="sweet-spot-filters" className={cn("panel space-y-4 p-4 md:p-5", !showFilters && "hidden sm:block")}>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <Segmented<SweetSpotFilters["type"]>
            label="Type"
            value={filters.type}
            onChange={onChange && ((type) => onChange({ type, cabin: type === "hotel" ? "all" : filters.cabin }))}
            options={[
              { value: "all", label: "All" },
              { value: "flight", label: "Flights" },
              // Disabled while no hotel sweet spot is verified (more are coming through the importer).
              { value: "hotel", label: "Hotels", disabled: !sweetSpots.some((s) => s.kind === "hotel") && filters.type !== "hotel" },
            ]}
          />
          <div role="group" aria-label="Cabin" className="flex flex-wrap gap-1.5">
            <ToggleChip pressed={filters.cabin === "all"} onToggle={onChange && (() => onChange({ cabin: "all" }))} disabled={filters.type === "hotel"}>
              Any cabin
            </ToggleChip>
            {CABINS.map((c) => (
              <ToggleChip
                key={c}
                pressed={filters.cabin === c}
                disabled={filters.type === "hotel"}
                onToggle={onChange && (() => onChange({ cabin: filters.cabin === c ? "all" : c, type: "flight" }))}
              >
                {CABIN_LABEL[c]}
              </ToggleChip>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-x-5 gap-y-3 border-t border-line pt-4">
          <SelectField<SweetSpotFilters["region"]>
            id="sweet-spot-region"
            label="Destination"
            value={filters.region}
            onChange={onChange && ((region) => onChange({ region }))}
            options={[{ value: "all", label: "All regions" }, ...regions.map((r) => ({ value: r, label: r }))]}
            className="w-full sm:w-56"
          />
          <SelectField<SweetSpotFilters["sort"]>
            id="sweet-spot-sort"
            label="Sort"
            value={filters.sort}
            onChange={onChange && ((sort) => onChange({ sort }))}
            options={[
              { value: "featured", label: "Featured" },
              { value: "points", label: "Fewest points" },
            ]}
            className="w-full sm:w-44"
          />
          <div className="pb-1.5">
            <Switch
              checked={filters.mine}
              onChange={onChange && ((mine) => onChange({ mine }))}
              disabled={personal && !hasCards && !filters.mine}
              hint={personal && !hasCards ? "Add cards to your wallet first" : undefined}
            >
              Bookable with my cards
              {personal && hasCards && <span className="text-ink-3"> ({bookable})</span>}
            </Switch>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-2" aria-live="polite">
          {results.length === sweetSpots.length ? (
            <>
              <span className="font-semibold text-ink">{results.length}</span> sweet spots
            </>
          ) : (
            <>
              <span className="font-semibold text-ink">{results.length}</span> of {sweetSpots.length} sweet spots match
            </>
          )}
          {results.length > visible.length && <span className="text-ink-3"> · showing {visible.length}</span>}
          {personal && hasCards && bookable > 0 && !filters.mine && filters.sort === "featured" && (
            <span className="text-ink-3"> · the ones your cards can book first</span>
          )}
        </p>
        {filtered && onChange && (
          <button type="button" className="text-sm font-semibold text-brand hover:underline" onClick={() => onChange(DEFAULT_SWEET_SPOT_FILTERS)}>
            Clear filters
          </button>
        )}
      </div>

      <h2 className="sr-only">Sweet spots</h2>
      {results.length === 0 ? (
        <div className="panel flex flex-col items-center gap-3 p-10 text-center">
          <SearchX className="h-8 w-8 text-ink-3" aria-hidden />
          {filters.mine && personal && !hasCards ? (
            <>
              <p className="font-semibold text-navy">Add your cards to see what you can book</p>
              <p className="max-w-md text-sm text-ink-2">We match each sweet spot against the points your cards earn.</p>
              <Link href="/tracker" className="btn-primary mt-1">
                <Plus className="h-4 w-4" /> Add my cards
              </Link>
            </>
          ) : (
            <>
              <p className="font-semibold text-navy">No sweet spots match these filters</p>
              <p className="max-w-md text-sm text-ink-2">
                {filters.mine ? "Your cards don't reach any of these yet. Try another region or cabin." : "Try another region or cabin."}
              </p>
              {onChange && (
                <button type="button" className="btn-secondary mt-1" onClick={() => onChange(DEFAULT_SWEET_SPOT_FILTERS)}>
                  Clear filters
                </button>
              )}
            </>
          )}
        </div>
      ) : (
        <>
          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((s) => (
              <SweetSpotCard
                key={s.id}
                spot={s}
                reach={personal && hasCards ? (wallet!.reach.get(s.program) ?? null) : undefined}
                mine={wallet?.mine}
                data={wallet?.data}
              />
            ))}
          </div>
          {results.length > visible.length && (
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                className="btn-secondary"
                disabled={!onChange}
                onClick={() => setPage({ sig, count: count + PAGE })}
              >
                Show {Math.min(PAGE, results.length - visible.length)} more
              </button>
              <button
                type="button"
                className="text-sm font-semibold text-brand hover:underline disabled:opacity-50"
                disabled={!onChange}
                onClick={() => setPage({ sig, count: results.length })}
              >
                Show all {results.length}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
