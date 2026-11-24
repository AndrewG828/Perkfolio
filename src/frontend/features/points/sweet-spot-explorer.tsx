"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Plus, SearchX } from "lucide-react";
import { REGIONS, sweetSpots, type Cabin, type Region, type SweetSpot } from "@/shared/data/points";
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
const cabinSlug = (c: Cabin) => c.replace(" ", "-");

/** Filters from the URL (?type=flight&region=Japan&cabin=business&mine=1&sort=points), ignoring bad values. */
export function readSweetSpotFilters(params: Pick<URLSearchParams, "get">): SweetSpotFilters {
  const type = params.get("type");
  const region = params.get("region");
  const cabin = CABINS.find((c) => cabinSlug(c) === params.get("cabin"));
  return {
    type: type === "flight" || type === "hotel" ? type : "all",
    region: (REGIONS as readonly string[]).includes(region ?? "") ? (region as Region) : "all",
    cabin: cabin ?? "all",
    mine: params.get("mine") === "1",
    sort: params.get("sort") === "points" ? "points" : "featured",
  };
}

function writeSweetSpotFilters(f: SweetSpotFilters) {
  const sp = new URLSearchParams();
  if (f.type !== "all") sp.set("type", f.type);
  if (f.region !== "all") sp.set("region", f.region);
  if (f.cabin !== "all") sp.set("cabin", cabinSlug(f.cabin));
  if (f.mine) sp.set("mine", "1");
  if (f.sort !== "featured") sp.set("sort", f.sort);
  const qs = sp.toString();
  window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
}

export function filterSweetSpots(list: SweetSpot[], f: SweetSpotFilters, w: Pick<WalletReach, "reach">): SweetSpot[] {
  const out = list.filter(
    (s) =>
      (f.type === "all" || s.kind === f.type) &&
      (f.region === "all" || s.to === f.region) &&
      (f.cabin === "all" || s.cabin === f.cabin) &&
      (!f.mine || w.reach.has(s.program)),
  );
  return f.sort === "points" ? [...out].sort((a, b) => a.points - b.points) : out;
}

/** The sweet spot grid with filters kept in the URL. Needs a <Suspense> boundary (useSearchParams). */
export function SweetSpotExplorer() {
  const params = useSearchParams();
  const filters = readSweetSpotFilters(params);
  const wallet = useWalletReach();
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

  return (
    <div className="space-y-6">
      <div className="panel space-y-4 p-4 md:p-5">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <Segmented<SweetSpotFilters["type"]>
            label="Type"
            value={filters.type}
            onChange={onChange && ((type) => onChange({ type, cabin: type === "hotel" ? "all" : filters.cabin }))}
            options={[
              { value: "all", label: "All" },
              { value: "flight", label: "Flights" },
              { value: "hotel", label: "Hotels" },
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
          Showing <span className="font-semibold text-ink">{results.length}</span> of {sweetSpots.length} sweet spots
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
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {results.map((s) => (
            <SweetSpotCard
              key={s.id}
              spot={s}
              reach={personal && hasCards ? (wallet!.reach.get(s.program) ?? null) : undefined}
              mine={wallet?.mine}
            />
          ))}
        </div>
      )}
    </div>
  );
}
