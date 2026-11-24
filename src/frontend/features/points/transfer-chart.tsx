"use client";

import Link from "next/link";
import { useRef, type KeyboardEvent } from "react";
import { Info } from "lucide-react";
import {
  ALLIANCES,
  PROGRAM_BRIDGES,
  currencies,
  getCurrency,
  isCurrencyId,
  programList,
  programName,
  type BankCurrency,
  type BankCurrencyId,
  type ProgramId,
  type ProgramRef,
  type TransferPartner,
} from "@/shared/data/points";
import { bestPartnerFor, bridgeFrom, bridgesInto, directRoute, pointsData, ratioLabel, transferSources, type PointsData } from "@/shared/lib/points";
import { getCard } from "@/shared/data/cards";
import { shortCardName } from "@/shared/lib/card-name";
import { cn, num } from "@/shared/lib/format";
import { Segmented, Switch } from "./controls";
import { ALLIANCE_COLOR, CURRENCY_ABBR, CURRENCY_COLOR, Dot, RatioPill, formatDate, monogram, programColor, rulesLine, scheduledLabel, timeLabel } from "./ui";
import type { WalletReach } from "./use-wallet-reach";

// ------------------------------------------------------------------------------------------------------- Chart data

/** "Jan 1": a short date for a cell, the year left out (the tooltip has it). */
const formatShortDate = (iso: string) => formatDate(iso).replace(/, \d{4}$/, "");

interface Cell {
  /** The ratio shown without a wallet. */
  best: TransferPartner;
  /** Every entry for this pair (more than one when the ratio depends on the card). */
  entries: TransferPartner[];
  varies: boolean;
  /** Set when the currency reaches the program only through a bridge program (Capital One to Flying Club via Virgin Red). */
  via?: ProgramId;
}

export interface ChartGroup {
  id: string;
  title: string;
  color: string;
  rows: { program: ProgramRef; cells: Partial<Record<BankCurrencyId, Cell>> }[];
}

function cellFor(currency: BankCurrencyId, program: ProgramRef, data: PointsData): Cell | undefined {
  const entries = data.partners.filter((p) => p.currency === currency && p.program === program.id);
  const best = bestPartnerFor(currency, program.id, data);
  if (best) return { best, entries, varies: entries.length > 1 || entries.some((e) => e.cards) };
  // No direct transfer: a bridge program the currency does transfer to (Virgin Red for Flying Club).
  const bridged = transferSources(program.id, data).find((s) => s.currency === currency && s.via);
  return bridged ? { best: bridged.partner, entries: [bridged.partner], varies: false, via: bridged.via } : undefined;
}

/**
 * Programs with at least one bank transfer, grouped for the chart: airlines by alliance, unaffiliated airlines, then
 * hotels. Alphabetical within. Programs without a guide yet (e.g. Copa ConnectMiles) are rows too. `data` is the
 * dataset as it stands today (useWalletReach().data) once hydrated.
 */
export function chartGroups(data: PointsData = pointsData): ChartGroup[] {
  const groups: ChartGroup[] = [
    ...ALLIANCES.map((a) => ({ id: a, title: a, color: ALLIANCE_COLOR[a], rows: [] as ChartGroup["rows"] })),
    { id: "other", title: "Other airlines", color: programColor({ kind: "airline" }), rows: [] },
    { id: "hotel", title: "Hotels", color: programColor({ kind: "hotel" }), rows: [] },
  ];
  const sorted = programList.filter((p) => data.partners.some((t) => t.program === p.id)).sort((a, b) => a.name.localeCompare(b.name));
  for (const program of sorted) {
    const id = program.kind === "hotel" ? "hotel" : (program.alliance ?? "other");
    const cells: Partial<Record<BankCurrencyId, Cell>> = {};
    for (const c of currencies) {
      const cell = cellFor(c.id, program, data);
      if (cell) cells[c.id] = cell;
    }
    groups.find((g) => g.id === id)!.rows.push({ program, cells });
  }
  return groups.filter((g) => g.rows.length > 0);
}

/**
 * Bridge programs on their rows: "Also Capital One, Bilt via Virgin Red" under Flying Club (banks that reach it only
 * through Virgin Red), and "Books through Virgin Atlantic Flying Club" under Virgin Red.
 */
function BridgeNote({ program, className }: { program: ProgramRef; className?: string }) {
  const through = bridgeFrom(program.id);
  if (through) return <span className={cn("block text-xs text-ink-2", className)}>Books through {programName(through.to)}</span>;
  const via = transferSources(program.id).filter((s) => s.via);
  if (via.length === 0 || bridgesInto(program.id).length === 0) return null;
  return (
    <span className={cn("block text-xs text-ink-2", className)}>
      Also {via.map((s) => CURRENCY_ABBR[s.currency]).join(", ")} via {programName(via[0].via!)}
    </span>
  );
}

/** "with Sapphire Reserve" for card-specific entries. */
function cardsNote(p: TransferPartner): string | null {
  if (!p.cards) return null;
  const names = p.cards.map((id) => getCard(id)).filter(Boolean).map((c) => shortCardName(c!.name));
  return names.length ? `with ${names.join(", ")}` : null;
}

// ---------------------------------------------------------------------------------------------------------- Filters

export interface TransferFilters {
  kind: "all" | "airline" | "hotel";
  /** Only programs the wallet can reach. */
  mine: boolean;
  /** Selected currency tab on phones. */
  currency: BankCurrencyId | null;
}

export const DEFAULT_TRANSFER_FILTERS: TransferFilters = { kind: "all", mine: false, currency: null };

export function readTransferFilters(params: Pick<URLSearchParams, "get">): TransferFilters {
  const kind = params.get("kind");
  const currency = params.get("currency");
  return {
    kind: kind === "airline" || kind === "hotel" ? kind : "all",
    mine: params.get("mine") === "1",
    currency: isCurrencyId(currency) ? currency : null,
  };
}

/** The chart's part of the query string (the transfers page adds its mode and planner fields). */
export function transferFilterParams(f: TransferFilters, sp: URLSearchParams) {
  if (f.kind !== "all") sp.set("kind", f.kind);
  if (f.mine) sp.set("mine", "1");
  if (f.currency) sp.set("currency", f.currency);
}

// ------------------------------------------------------------------------------------------------------------- View

/**
 * Programs × bank currencies. On md+ a table with a sticky header row and first column (ratio details on hover or
 * focus); on phones, one tab per currency with a list. Without `onChange` it renders inert (the prerendered fallback).
 */
export function TransferChart({
  filters = DEFAULT_TRANSFER_FILTERS,
  onChange,
  wallet,
}: {
  filters?: TransferFilters;
  onChange?: (patch: Partial<TransferFilters>) => void;
  wallet?: WalletReach;
}) {
  const personal = Boolean(wallet?.hydrated);
  const hasCards = (wallet?.points.cards.length ?? 0) > 0;
  const mine = wallet?.mine ?? new Set<BankCurrencyId>();
  const groups = chartGroups(wallet?.data)
    .map((g) => ({
      ...g,
      rows: g.rows.filter(
        (r) => (filters.kind === "all" || r.program.kind === filters.kind) && (!filters.mine || Boolean(wallet?.reach.has(r.program.id))),
      ),
    }))
    .filter((g) => g.rows.length > 0);
  const rowCount = groups.reduce((s, g) => s + g.rows.length, 0);
  const defaultTab = currencies.find((c) => mine.has(c.id))?.id ?? currencies[0]?.id ?? null;
  const tab = filters.currency ?? defaultTab;

  /** The ratio this wallet gets (card-specific, or through the same bridge), else the general one. */
  const shown = (currency: BankCurrencyId, program: ProgramRef, cell: Cell) => {
    const reach = wallet?.reach.get(program.id);
    const route = cell.via ? reach?.routes.find((r) => r.currency === currency && r.via === cell.via) : directRoute(reach, currency);
    return route?.partner ?? cell.best;
  };

  return (
    <div className="space-y-5">
      <h2 className="sr-only">Transfer chart</h2>
      <div className="panel flex flex-wrap items-center justify-between gap-x-6 gap-y-3 p-4">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <Segmented<TransferFilters["kind"]>
            label="Programs to show"
            value={filters.kind}
            onChange={onChange && ((kind) => onChange({ kind }))}
            options={[
              { value: "all", label: "All programs" },
              { value: "airline", label: "Airlines" },
              { value: "hotel", label: "Hotels" },
            ]}
          />
          <Switch
            checked={filters.mine}
            onChange={onChange && ((v) => onChange({ mine: v }))}
            disabled={personal && !hasCards && !filters.mine}
            hint={personal && !hasCards ? "Add cards to your wallet first" : undefined}
          >
            Only programs my cards reach
          </Switch>
        </div>
        <p className="text-sm text-ink-2" aria-live="polite">
          <span className="font-semibold text-ink">{rowCount}</span> programs
        </p>
      </div>

      <Legend personal={personal && hasCards} />

      {rowCount === 0 ? (
        <div className="panel p-10 text-center text-ink-2">
          {filters.mine && personal && !hasCards ? (
            <>
              <Link href="/tracker" className="link">
                Add your cards
              </Link>{" "}
              to see the programs they reach.
            </>
          ) : (
            "None of the programs in this view are reachable with your cards."
          )}
          {filters.mine && onChange && (
            <div className="mt-4">
              <button type="button" className="btn-secondary" onClick={() => onChange({ mine: false })}>
                Show all programs
              </button>
            </div>
          )}
        </div>
      ) : (
        <>
          <MatrixTable groups={groups} mine={mine} shown={shown} />
          <PhoneLists groups={groups} tab={tab} mine={mine} shown={shown} onTab={onChange && ((currency) => onChange({ currency }))} />
        </>
      )}
    </div>
  );
}

function Legend({ personal }: { personal: boolean }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-ink-2">
      <li className="flex items-center gap-2">
        <RatioPill partner={{ from: 5, to: 4 }} /> Bank points to program points (5:4 means 1,000 become 800)
      </li>
      {personal && (
        <li className="flex items-center gap-2">
          <RatioPill partner={{ from: 1, to: 1 }} mine /> A currency your cards earn
        </li>
      )}
      <li className="flex items-center gap-2">
        <RatioPill partner={{ from: 1, to: 1 }} varies /> Ratio depends on the card
      </li>
      {PROGRAM_BRIDGES.map((b) => (
        <li key={b.from} className="flex items-center gap-2">
          <span className="text-[10px] font-semibold text-ink-3 uppercase">via {monogram(programName(b.from))}</span> Through {programName(b.from)},
          which shares {programName(b.to)}&apos;s balance
        </li>
      ))}
      <li className="hidden items-center gap-1.5 md:flex">
        <Info className="h-3.5 w-3.5" aria-hidden /> Hover or focus a ratio for transfer time and minimums (&ldquo;not
        confirmed&rdquo; when no source gives a time)
      </li>
    </ul>
  );
}

type Shown = (currency: BankCurrencyId, program: ProgramRef, cell: Cell) => TransferPartner;

function MatrixTable({ groups, mine, shown }: { groups: ChartGroup[]; mine: Set<BankCurrencyId>; shown: Shown }) {
  const cols = currencies.length;
  return (
    <div className="hidden rounded-lg border border-line bg-white shadow-[var(--shadow-card)] md:block">
      <table className="w-full table-fixed border-separate border-spacing-0 text-sm">
        <caption className="sr-only">
          Transfer ratios from each bank points currency (columns) to each airline and hotel program (rows)
        </caption>
        <colgroup>
          <col className="w-[30%] lg:w-[28%]" />
          {currencies.map((c) => (
            <col key={c.id} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th
              scope="col"
              className="sticky top-[97px] left-0 z-30 rounded-tl-lg border-b border-line bg-white px-4 py-3 text-left align-bottom text-xs font-semibold tracking-wide text-ink-3 uppercase"
            >
              Program
            </th>
            {currencies.map((c, i) => (
              <th
                key={c.id}
                scope="col"
                className={cn(
                  "sticky top-[97px] z-20 border-b border-line px-1.5 py-3 align-bottom font-normal",
                  mine.has(c.id) ? "bg-sky" : "bg-white",
                  i === cols - 1 && "rounded-tr-lg",
                )}
              >
                <span className="flex flex-col items-center gap-1 text-center" title={c.name}>
                  <Dot color={CURRENCY_COLOR[c.id]} className="h-2.5 w-2.5" />
                  <span className="text-xs leading-tight font-semibold text-ink">{c.shortName}</span>
                  <span className="text-[11px] leading-tight text-ink-3">{c.issuer}</span>
                  {mine.has(c.id) && (
                    <span className="mt-0.5 rounded-full bg-brand px-2 py-px text-[10px] font-semibold tracking-wide text-white uppercase">You earn</span>
                  )}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        {groups.map((g, gi) => (
          <tbody key={g.id}>
            <tr>
              <th scope="colgroup" colSpan={cols + 1} className="border-b border-line bg-canvas px-4 py-2 text-left">
                <span className="flex items-center gap-2 text-xs font-semibold tracking-wide text-ink-2 uppercase">
                  <Dot color={g.color} /> {g.title}
                  <span className="font-medium text-ink-3 normal-case">· {g.rows.length}</span>
                </span>
              </th>
            </tr>
            {g.rows.map((r, ri) => {
              const last = gi === groups.length - 1 && ri === g.rows.length - 1;
              return (
                <tr key={r.program.id}>
                  <th
                    scope="row"
                    className={cn("sticky left-0 z-10 bg-white px-4 py-2.5 text-left font-normal", last ? "rounded-bl-lg" : "border-b border-line")}
                  >
                    <Link href={`/points/programs/${r.program.id}`} className="font-semibold text-ink hover:text-brand">
                      {r.program.name}
                    </Link>
                    <span className="block truncate text-xs text-ink-3">{r.program.currency ?? "No program guide yet"}</span>
                    <BridgeNote program={r.program} />
                  </th>
                  {currencies.map((c, ci) => {
                    const cell = r.cells[c.id];
                    return (
                      <td
                        key={c.id}
                        className={cn(
                          "px-1 py-2 text-center",
                          !last && "border-b border-line",
                          last && ci === cols - 1 && "rounded-br-lg",
                          mine.has(c.id) && "bg-sky/45",
                        )}
                      >
                        {cell ? (
                          <RatioCell
                            currency={c}
                            program={r.program}
                            cell={cell}
                            partner={shown(c.id, r.program, cell)}
                            mine={mine.has(c.id)}
                            align={ci >= cols - 2 ? "right" : "center"}
                          />
                        ) : (
                          <span className="text-ink-3/70">
                            <span aria-hidden>—</span>
                            <span className="sr-only">No transfer</span>
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        ))}
      </table>
    </div>
  );
}

/** A ratio pill that links to the program and shows the transfer details on hover or keyboard focus. */
function RatioCell({
  currency,
  program,
  cell,
  partner,
  mine,
  align,
}: {
  currency: BankCurrency;
  program: ProgramRef;
  cell: Cell;
  partner: TransferPartner;
  mine: boolean;
  align: "center" | "right";
}) {
  const tip = `tip-${currency.id}-${program.id}`;
  return (
    <span className="group relative inline-flex">
      <Link
        href={`/points/programs/${program.id}`}
        aria-describedby={tip}
        className="inline-flex flex-col items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        <RatioPill partner={partner} mine={mine} varies={cell.varies} />
        {cell.via && (
          <span className="mt-0.5 block text-[10px] leading-none font-semibold text-ink-3 uppercase" aria-hidden>
            via {monogram(programName(cell.via))}
          </span>
        )}
        {/* A scheduled change is marked on the cell itself, not only in its tooltip ("4:3 from Jan 1, 2027"). */}
        {cell.entries.some((e) => e.scheduled) && (
          <span className="mt-0.5 block text-[10px] leading-tight font-semibold whitespace-nowrap text-warn">
            {cell.entries
              .filter((e) => e.scheduled)
              .map((e) => `→ ${ratioLabel(e.scheduled!)} ${formatShortDate(e.scheduled!.date)}`)
              .filter((t, i, all) => all.indexOf(t) === i)
              .join(" · ")}
          </span>
        )}
        <span className="sr-only">
          {" "}
          {currency.shortName} to {program.name}
          {cell.via ? ` via ${programName(cell.via)}` : ""}
          {cell.entries
            .filter((e) => e.scheduled)
            .map((e) => `, changing to ${scheduledLabel(e)}`)
            .join("")}
        </span>
      </Link>
      <span
        role="tooltip"
        id={tip}
        className={cn(
          "pointer-events-none absolute top-full z-40 mt-2 hidden w-60 rounded-md bg-navy px-3 py-2.5 text-left text-xs leading-relaxed font-normal text-white shadow-[var(--shadow-lift)] group-focus-within:block group-hover:block",
          align === "right" ? "right-0" : "left-1/2 -translate-x-1/2",
        )}
      >
        <span className="block font-semibold">
          {currency.shortName} → {cell.via ? `${programName(cell.via)} → ` : ""}
          {program.name}
        </span>
        {cell.via && <span className="mt-1 block text-white/75">{bridgeFrom(cell.via)?.note}</span>}
        {cell.entries.map((e, i) => (
          <span key={i} className="mt-1 block">
            <span className="font-semibold tabular-nums">{ratioLabel(e)}</span>
            {" · "}
            {num(1000)} → {num(Math.floor((1000 * e.to) / e.from))} · <span className={e.time ? undefined : "italic"}>{timeLabel(e)}</span>
            {cardsNote(e) && <span className="block text-white/75">{cardsNote(e)}</span>}
            {e.changedOn && <span className="block text-white/75">Changed {formatDate(e.changedOn)}</span>}
          </span>
        ))}
        {rulesLine(cell.best) && <span className="mt-1 block text-white/75">{rulesLine(cell.best)}</span>}
        {cell.entries.map((e) => scheduledLabel(e) && (
          <span key={`s-${e.scheduled!.date}`} className="mt-1 block font-semibold text-[#ffd479]">
            Scheduled: {scheduledLabel(e)}
          </span>
        ))}
        {cell.entries.map((e) => e.note).filter(Boolean).map((n) => (
          <span key={n} className="mt-1 block text-white/75">
            {n}
          </span>
        ))}
      </span>
    </span>
  );
}

/** Phones: one tab per currency, its partners listed by group with times and minimums inline. */
function PhoneLists({
  groups,
  tab,
  mine,
  shown,
  onTab,
}: {
  groups: ChartGroup[];
  tab: BankCurrencyId | null;
  mine: Set<BankCurrencyId>;
  shown: Shown;
  onTab?: (c: BankCurrencyId) => void;
}) {
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  const current = currencies.find((c) => c.id === tab) ?? currencies[0];
  if (!current) return null;
  const onKey = (e: KeyboardEvent, i: number) => {
    const delta = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const next = (i + delta + currencies.length) % currencies.length;
    onTab?.(currencies[next].id);
    tabs.current[next]?.focus();
  };
  const listed = groups
    .map((g) => ({ ...g, rows: g.rows.filter((r) => r.cells[current.id]) }))
    .filter((g) => g.rows.length > 0);
  const info = getCurrency(current.id);

  return (
    <div className="md:hidden">
      {/* The right edge fades, so the strip reads as scrollable when tabs run off screen. */}
      <div
        role="tablist"
        aria-label="Bank currency"
        className="relative -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [mask-image:linear-gradient(to_right,black_calc(100%-2.5rem),transparent)]"
      >
        {currencies.map((c, i) => {
          const selected = c.id === current.id;
          return (
            <button
              key={c.id}
              ref={(el) => {
                tabs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`tab-${c.id}`}
              aria-selected={selected}
              aria-controls={`panel-${c.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onTab?.(c.id)}
              onKeyDown={(e) => onKey(e, i)}
              className={cn(
                "relative inline-flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-semibold whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand",
                selected ? "border-brand bg-brand text-white" : "border-line bg-white text-ink-2",
              )}
            >
              <Dot color={CURRENCY_COLOR[c.id]} className={selected ? "ring-1 ring-white" : undefined} />
              {CURRENCY_ABBR[c.id]}
              <span className="sr-only">{c.shortName}</span>
              {mine.has(c.id) && <span className={cn("text-[10px] font-semibold uppercase", selected ? "text-white/85" : "text-brand")}>Yours</span>}
            </button>
          );
        })}
      </div>
      <div role="tabpanel" id={`panel-${current.id}`} aria-labelledby={`tab-${current.id}`} className="panel mt-3 overflow-hidden">
        <div className="border-b border-line p-4">
          <p className="font-semibold text-navy">{current.name}</p>
          {info && <p className="mt-1 line-clamp-3 text-sm text-ink-2">Earned with {info.earnedWith}.</p>}
          {info?.restrictions && (
            <details className="group mt-2 rounded-md bg-canvas p-2.5 text-xs leading-relaxed text-ink-2">
              <summary className="flex cursor-pointer list-none items-center gap-2 font-semibold text-ink [&::-webkit-details-marker]:hidden">
                <Info className="h-3.5 w-3.5 shrink-0 text-ink-3" aria-hidden /> Transfer rules
                <span className="font-normal text-brand group-open:hidden">Show</span>
              </summary>
              <p className="mt-1.5">{info.restrictions}</p>
            </details>
          )}
        </div>
        {listed.length === 0 ? (
          <p className="p-4 text-sm text-ink-2">No partners in this view.</p>
        ) : (
          listed.map((g) => (
            <section key={g.id} aria-label={g.title}>
              <h3 className="flex items-center gap-2 bg-canvas px-4 py-2 text-xs font-semibold tracking-wide text-ink-2 uppercase">
                <Dot color={g.color} /> {g.title}
              </h3>
              <ul className="divide-y divide-line">
                {g.rows.map((r) => {
                  const cell = r.cells[current.id]!;
                  const p = shown(current.id, r.program, cell);
                  return (
                    <li key={r.program.id}>
                      <Link href={`/points/programs/${r.program.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-canvas">
                        <span className="min-w-0 flex-1">
                          <span className="block font-semibold text-ink">{r.program.name}</span>
                          <span className="block text-xs text-ink-3">
                            {cell.via ? `via ${programName(cell.via)} · ` : ""}
                            {timeLabel(p)}
                            {rulesLine(p) ? ` · ${rulesLine(p)}` : ""}
                            {cell.varies && cardsNote(p) ? ` · ${cardsNote(p)}` : ""}
                            {scheduledLabel(p) ? ` · ${scheduledLabel(p)}` : ""}
                          </span>
                          {bridgeFrom(r.program.id) && <BridgeNote program={r.program} />}
                        </span>
                        <RatioPill partner={p} mine={mine.has(current.id)} varies={cell.varies} />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
