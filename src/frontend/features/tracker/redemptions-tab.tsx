"use client";

import { useState } from "react";
import { Pencil, Plane, Plus, Trash2, X } from "lucide-react";
import { programName, programUnit } from "@/shared/data/strategy/programs";
import { PointsVsCash, type PointsVsCashValues } from "@/frontend/components/points-vs-cash";
import { ProgramSelect } from "@/frontend/components/program-select";
import { useStrategyPrefs } from "@/frontend/state/strategy-prefs";
import { walletActions, type Redemption, type WalletState } from "@/frontend/state/wallet-store";
import { cleanLabel, cleanNotes, WALLET_LIMITS } from "@/shared/lib/wallet-schema";
import { cashSaved, centsPerPoint, redemptionStats } from "@/shared/lib/trackers";
import { resolvePointValue } from "@/shared/lib/point-value";
import { formatDate, isoDate } from "@/shared/lib/dates";
import { cn, num, usd } from "@/shared/lib/format";
import { EmptyState, Stat, StatRow, TabFrame } from "./tab-parts";

const cents = (c: number) => `${c.toFixed(2).replace(/\.?0+$/, "")}¢`;
const money = (n: number) => usd(n, { cents: n % 1 !== 0 });

type Draft = { date: string; label: string; program: string; points: string; taxes: string; cash: string; notes: string };

const draftOf = (r: Redemption): Draft => ({
  date: r.date,
  label: r.label,
  program: r.program ?? "",
  points: String(r.points),
  taxes: String(r.taxesUsd),
  cash: String(r.cashPriceUsd),
  notes: r.notes ?? "",
});

function toRedemption(d: Draft): Omit<Redemption, "id"> | string {
  const label = cleanLabel(d.label);
  const notes = cleanNotes(d.notes);
  const points = Math.round(Number(d.points));
  const taxes = d.taxes.trim() === "" ? 0 : Number(d.taxes);
  const cash = Number(d.cash);
  if (!d.date) return "Add the date you booked or flew.";
  if (!label) return "Say what you booked, like \"SFO to Tokyo, business\".";
  if (!(points > 0)) return "Enter the points you used.";
  if (d.cash.trim() === "" || !(cash >= 0)) return "Enter what it would have cost in cash.";
  if (!(taxes >= 0)) return "Taxes and fees should be a dollar amount.";
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    date: d.date,
    label,
    ...(d.program ? { program: d.program } : {}),
    points,
    taxesUsd: round(taxes),
    cashPriceUsd: round(cash),
    ...(notes ? { notes } : {}),
  };
}

/** Award redemptions with cents per point against the program's valuation, lifetime savings and the average. */
export function RedemptionsTab({ wallet, now }: { wallet: WalletState; now: Date }) {
  const prefs = useStrategyPrefs();
  const [form, setForm] = useState<{ key: string; draft: Draft } | null>(null);
  const list = [...(wallet.redemptions ?? [])].sort((a, b) => b.date.localeCompare(a.date) || a.label.localeCompare(b.label));
  // The one value every page uses (shared/lib/point-value.ts): the user's own, else the published median for their cards.
  const centsOf = (program?: string) => resolvePointValue(program, { own: prefs.cpp, cards: wallet.cards })?.cents;
  const s = redemptionStats(list, centsOf);
  const blank = (): Draft => ({ date: isoDate(now), label: "", program: "", points: "", taxes: "", cash: "", notes: "" });
  const fromCalculator = (v: PointsVsCashValues) =>
    setForm({
      key: `calc-${Date.now()}`,
      draft: { ...blank(), program: v.program ?? "", points: String(v.points), taxes: String(v.taxesUsd), cash: String(v.cashPriceUsd) },
    });

  return (
    <TabFrame>
      <StatRow>
        <Stat
          label="Lifetime savings"
          value={usd(s.savings)}
          tone={s.savings > 0 ? "success" : undefined}
          sub={s.count === 0 ? "Cash prices minus taxes, once you log a redemption" : `Cash prices minus taxes, across ${s.count} redemption${s.count === 1 ? "" : "s"}`}
        />
        <Stat
          label="Average value"
          value={s.averageCpp === null ? "—" : `${cents(s.averageCpp)} per point`}
          sub={s.count === 0 ? "Weighted by points, once you log a redemption" : `Weighted by points, across ${s.count === 1 ? "your redemption" : `all ${s.count} redemptions`}`}
        />
        <Stat
          label="Compared with valuations"
          value={
            s.valued.valuationCpp === null
              ? "—"
              : Math.round(s.valued.vsValuationUsd) === 0
                ? "$0"
                : `${s.valued.vsValuationUsd > 0 ? "+" : "\u2212"}${usd(Math.abs(s.valued.vsValuationUsd))}`
          }
          tone={s.valued.valuationCpp === null ? undefined : s.valued.vsValuationUsd >= 0 ? "success" : "warn"}
          sub={
            s.valued.valuationCpp === null || s.valued.cpp === null
              ? s.count
                ? "None of these has a valuation yet: add your own in \u201cPoints or cash?\u201d"
                : "Value beyond what those points are usually worth"
              : `${s.valued.count === s.count ? (s.count === 1 ? "It got" : "They got") : `${s.valued.count} of ${s.count} have a valuation. Those got`} ${cents(s.valued.cpp)} per point vs ${cents(s.valued.valuationCpp)} valuations`
          }
        />
      </StatRow>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className="panel min-w-0 self-start overflow-hidden">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-5">
            <div>
              <h2 className="text-lg font-semibold text-navy">Redemptions</h2>
              <p className="text-sm text-ink-2">Cents per point = (cash price − taxes) ÷ points × 100.</p>
            </div>
            {!form && list.length > 0 && (
              <button className="btn-primary" onClick={() => setForm({ key: "new", draft: blank() })}>
                <Plus className="h-4 w-4" /> Log a redemption
              </button>
            )}
          </header>
          {form && (
            <RedemptionForm
              key={form.key}
              initial={form.draft}
              today={now}
              onCancel={() => setForm(null)}
              onSave={(r) => {
                const ok = walletActions.addRedemption(r);
                if (ok) setForm(null);
                return ok;
              }}
            />
          )}
          {list.length === 0 && !form ? (
            <EmptyState
              icon={Plane}
              title="Log the trips you book with points"
              actions={
                <button className="btn-primary" onClick={() => setForm({ key: "new", draft: blank() })}>
                  <Plus className="h-4 w-4" /> Log a redemption
                </button>
              }
            >
              Record the points, taxes and what the trip would have cost in cash. You&apos;ll see the value you got per point and
              how much you&apos;ve saved over time.
            </EmptyState>
          ) : (
            <ul className="divide-y divide-line">
              {list.map((r) => (
                <RedemptionRow key={r.id} r={r} valuation={centsOf(r.program)} today={now} />
              ))}
            </ul>
          )}
        </section>

        <PointsVsCash className="self-start lg:sticky lg:top-28" onLog={fromCalculator} />
      </div>
    </TabFrame>
  );
}

function RedemptionRow({ r, valuation, today }: { r: Redemption; valuation?: number; today: Date }) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const cpp = centsPerPoint(r);
  const diff = cpp !== null && valuation !== undefined ? cpp - valuation : null;

  if (editing) {
    return (
      <li>
        <RedemptionForm
          initial={draftOf(r)}
          today={today}
          onCancel={() => setEditing(false)}
          onSave={(next) => {
            const ok = walletActions.updateRedemption({ ...next, id: r.id });
            if (ok) setEditing(false);
            return ok;
          }}
        />
      </li>
    );
  }

  return (
    <li className="grid gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_auto]">
      <div className="min-w-0">
        <p className="text-xs font-medium text-ink-3">{formatDate(r.date)}</p>
        <p className="font-semibold text-ink">{r.label}</p>
        <p className="mt-0.5 text-sm text-ink-2">
          {[
            r.program ? programName(r.program) : null,
            `${num(r.points)} ${programUnit(r.program)}`,
            `${money(r.taxesUsd)} taxes`,
            `${money(r.cashPriceUsd)} cash price`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {r.notes && <p className="mt-1 text-sm whitespace-pre-line text-ink-3">{r.notes}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:flex-col sm:items-end sm:gap-1">
        <p className="text-xl font-semibold text-navy">
          {cpp === null ? "—" : cents(cpp)} <span className="text-sm font-medium text-ink-3">per point</span>
        </p>
        {diff !== null && (
          <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", diff >= 0 ? "bg-success/10 text-success" : "bg-warn/10 text-warn")}>
            {diff >= 0 ? "+" : "−"}
            {cents(Math.abs(diff))} vs {cents(valuation!)} valuation
          </span>
        )}
        {diff === null && cpp !== null && r.program && valuation === undefined && (
          <span className="text-xs text-ink-3">No published value to compare: add your own in &ldquo;Points or cash?&rdquo;</span>
        )}
        <p className="text-xs text-ink-3">Saved {money(cashSaved(r))}</p>
        <span className="flex items-center gap-1">
          {confirming ? (
            <>
              <button className="btn-secondary px-2.5 py-1 text-xs" onClick={() => walletActions.removeRedemption(r.id)}>
                Remove
              </button>
              <button className="btn-ghost px-2.5 py-1 text-xs" onClick={() => setConfirming(false)}>
                Keep
              </button>
            </>
          ) : (
            <>
              <button className="btn-ghost px-2.5 py-1 text-xs" onClick={() => setEditing(true)}>
                <Pencil className="h-3.5 w-3.5" /> Edit
              </button>
              <button className="grid h-7 w-7 place-items-center rounded text-ink-3 hover:bg-canvas hover:text-danger" onClick={() => setConfirming(true)} aria-label={`Remove ${r.label}`} title="Remove">
                <Trash2 className="h-4 w-4" />
              </button>
            </>
          )}
        </span>
      </div>
    </li>
  );
}

function RedemptionForm({
  initial,
  today,
  onSave,
  onCancel,
}: {
  initial: Draft;
  today: Date;
  onSave: (r: Omit<Redemption, "id">) => boolean;
  onCancel: () => void;
}) {
  const [d, setD] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<Draft>) => {
    setD((x) => ({ ...x, ...patch }));
    setError(null);
  };
  const preview = toRedemption(d);
  const cpp = typeof preview === "string" ? null : centsPerPoint(preview);
  return (
    <form
      className="space-y-4 border-b border-line bg-canvas/60 px-5 py-5 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        const r = toRedemption(d);
        if (typeof r === "string") return setError(r);
        if (!onSave(r)) setError("Couldn't save that redemption. The log may be full.");
      }}
    >
      <div className="grid gap-4 sm:grid-cols-[minmax(0,160px)_minmax(0,1fr)]">
        <label className="space-y-1">
          <span className="font-medium text-ink">Date</span>
          <input className="input" type="date" max={isoDate(new Date(today.getFullYear() + 2, 11, 31))} value={d.date} onChange={(e) => set({ date: e.target.value })} required />
        </label>
        <label className="space-y-1">
          <span className="font-medium text-ink">What you booked</span>
          <input className="input" value={d.label} maxLength={WALLET_LIMITS.label} placeholder="e.g. SFO to Tokyo, business" onChange={(e) => set({ label: e.target.value })} />
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.7fr)_repeat(3,minmax(0,1fr))]">
        <label className="space-y-1 sm:col-span-2 xl:col-span-1">
          <span className="font-medium text-ink">Program</span>
          <ProgramSelect label="Program" placeholder="Choose" value={d.program} onChange={(program) => set({ program })} />
        </label>
        <label className="space-y-1">
          <span className="font-medium text-ink">Points used</span>
          <input className="input" type="number" min={1} step={1} inputMode="numeric" placeholder="88000" value={d.points} onChange={(e) => set({ points: e.target.value })} />
        </label>
        <label className="space-y-1">
          <span className="font-medium text-ink">Taxes &amp; fees</span>
          <input className="input" type="number" min={0} step="any" inputMode="decimal" placeholder="$56" value={d.taxes} onChange={(e) => set({ taxes: e.target.value })} />
        </label>
        <label className="space-y-1">
          <span className="font-medium text-ink">Cash price</span>
          <input className="input" type="number" min={0} step="any" inputMode="decimal" placeholder="$4,200" value={d.cash} onChange={(e) => set({ cash: e.target.value })} />
        </label>
      </div>
      <label className="block space-y-1">
        <span className="font-medium text-ink">
          Notes <span className="font-normal text-ink-3">(optional)</span>
        </span>
        <textarea className="input min-h-16" rows={2} maxLength={WALLET_LIMITS.notes} value={d.notes} onChange={(e) => set({ notes: e.target.value })} />
      </label>
      {error && (
        <p className="font-medium text-danger" role="alert">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn-primary">Save redemption</button>
        <button type="button" className="btn-ghost" onClick={onCancel}>
          <X className="h-4 w-4" /> Cancel
        </button>
        {cpp !== null && <span className="ml-auto text-ink-2">That&apos;s {cents(cpp)} per point.</span>}
      </div>
    </form>
  );
}
