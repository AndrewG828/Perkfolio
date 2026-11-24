"use client";

import { useState } from "react";
import { CheckCircle2, Coins, Info, Pencil, Plus, RefreshCw, Trash2, X } from "lucide-react";
import type { Card } from "@/shared/data/types";
import { getCard } from "@/shared/data/cards";
import { programForCard, programInfo, programKindLabels, programName, programUnit } from "@/shared/data/strategy/programs";
import { ProgramSelect } from "@/frontend/components/program-select";
import { strategyPrefs, useStrategyPrefs } from "@/frontend/state/strategy-prefs";
import { walletActions, type PointsBalance, type WalletState } from "@/frontend/state/wallet-store";
import {
  STALE_BALANCE_DAYS,
  balanceStatus,
  centsFor,
  expirationPolicy,
  pointsValueUsd,
  portfolioValue,
  valuationOf,
  type BalanceStatus,
} from "@/shared/lib/trackers";
import { daysSince, formatDate, isoDate } from "@/shared/lib/dates";
import { cn, num, usd } from "@/shared/lib/format";
import { SourceLinks } from "@/frontend/features/next-card/rule-results";
import { EmptyState, ExpiryChip, Stat, StatRow, TabFrame, relativeDays } from "./tab-parts";

/** Programs and bank currencies that the wallet's cards earn. */
export function earningPrograms(wallet: WalletState): Set<string> {
  const cards = wallet.cards.map(getCard).filter((c): c is Card => Boolean(c));
  return new Set(cards.map(programForCard).filter((x): x is string => Boolean(x)));
}

const cents = (c: number) => `${Number(c.toFixed(2))}¢`;

/** Points balances with estimated value, expiry warnings and a nudge to refresh stale numbers. */
export function PointsTab({ wallet, now }: { wallet: WalletState; now: Date }) {
  const prefs = useStrategyPrefs();
  const [adding, setAdding] = useState<string | null>(null);
  const balances = wallet.balances ?? {};
  const earning = earningPrograms(wallet);
  const rows = Object.entries(balances)
    .map(([id, b]) => {
      const c = centsFor(id, prefs.cpp);
      return { id, b, cents: c, value: c === undefined ? 0 : pointsValueUsd(b.points, c), status: balanceStatus(id, b, now, { earningCard: earning.has(id) }) };
    })
    .sort((a, b) => b.value - a.value || programName(a.id).localeCompare(programName(b.id)));
  const total = portfolioValue(balances, prefs.cpp);
  const dated = rows.filter((r) => r.status.kind === "date" && r.status.tone && r.status.tone !== "ok").sort((a, b) => (a.status.daysLeft ?? 0) - (b.status.daysLeft ?? 0));
  const atRisk = rows.filter((r) => r.status.kind === "at-risk");
  const stale = rows.filter((r) => r.status.stale);
  const overrides = rows.filter((r) => prefs.cpp[r.id] !== undefined).length;
  const suggestions = [...earning].filter((id) => !balances[id] && programInfo(id));

  return (
    <TabFrame>
      <StatRow>
        <Stat
          label="Estimated value"
          value={usd(total.totalUsd)}
          sub={
            rows.length
              ? `${num(rows.reduce((s, r) => s + r.b.points, 0))} points across ${rows.length} program${rows.length === 1 ? "" : "s"}${overrides ? `, ${overrides} at your own value` : ""}`
              : "Add a balance to see what your points are worth"
          }
        />
        <Stat
          label="Expiring within 90 days"
          value={String(dated.length)}
          tone={dated.some((r) => r.status.tone !== "amber") ? "danger" : dated.length ? "warn" : undefined}
          sub={
            dated.length
              ? `${programName(dated[0].id)}: ${dated[0].status.tone === "expired" ? "expired" : "expires"} ${formatDate(dated[0].status.expires!)}`
              : atRisk.length
                ? `${atRisk.length} bank balance${atRisk.length === 1 ? "" : "s"} with no card earning them`
                : "Nothing expiring soon"
          }
        />
        <Stat
          label="Need a refresh"
          value={String(stale.length)}
          tone={stale.length ? "warn" : undefined}
          sub={stale.length ? `Not updated in ${STALE_BALANCE_DAYS}+ days` : rows.length ? "All balances checked recently" : "Nothing to update yet"}
        />
      </StatRow>

      {stale.length > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-warn/20 bg-[#fdf3e7] p-4 text-sm">
          <RefreshCw className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
          <p className="text-ink">
            <span className="font-semibold">
              {stale.length === 1 ? `${programName(stale[0].id)} hasn't` : `${stale.length} balances haven't`} been updated in {STALE_BALANCE_DAYS}+ days.
            </span>{" "}
            <span className="text-ink-2">Check your accounts and update them (or confirm they&apos;re still right) so the value and expiry dates stay accurate.</span>
          </p>
        </div>
      )}

      <section className="panel overflow-hidden">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-5">
          <div>
            <h2 className="text-lg font-semibold text-navy">Balances</h2>
            <p className="text-sm text-ink-2">Valued at the median of published valuations, unless you set your own.</p>
          </div>
          {adding === null && rows.length > 0 && (
            <button className="btn-primary" onClick={() => setAdding("")}>
              <Plus className="h-4 w-4" /> Add balance
            </button>
          )}
        </header>
        {adding !== null && <AddBalance key={adding} initial={adding} existing={new Set(Object.keys(balances))} today={now} onDone={() => setAdding(null)} />}
        {rows.length === 0 && adding === null ? (
          <EmptyState
            icon={Coins}
            title="Track your points and miles"
            actions={
              <>
                {suggestions.slice(0, 4).map((id) => (
                  <button key={id} className="btn-secondary px-3 py-2 text-xs" onClick={() => setAdding(id)}>
                    <Plus className="h-3.5 w-3.5" /> {programName(id)}
                  </button>
                ))}
                <button className="btn-primary" onClick={() => setAdding("")}>
                  <Plus className="h-4 w-4" /> Add a balance
                </button>
              </>
            }
          >
            Add what you have in each program. We&apos;ll estimate what it&apos;s worth, warn you before points expire and remind
            you when a balance is out of date.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((r) => (
              <BalanceRow key={r.id} id={r.id} balance={r.b} cents={r.cents} value={r.value} status={r.status} own={prefs.cpp[r.id]} now={now} />
            ))}
          </ul>
        )}
        {rows.length > 0 && suggestions.length > 0 && adding === null && (
          <div className="flex flex-wrap items-center gap-2 border-t border-line bg-canvas/60 px-5 py-3 text-sm">
            <span className="text-ink-2">Your cards also earn:</span>
            {suggestions.map((id) => (
              <button key={id} className="chip cursor-pointer hover:border-brand hover:text-brand" onClick={() => setAdding(id)}>
                <Plus className="h-3 w-3" /> {programName(id)}
              </button>
            ))}
          </div>
        )}
      </section>

      {rows.length > 0 && <AboutValues ids={rows.map((r) => r.id)} />}
    </TabFrame>
  );
}

function AddBalance({ initial, existing, today, onDone }: { initial: string; existing: Set<string>; today: Date; onDone: () => void }) {
  const [program, setProgram] = useState(initial);
  const [points, setPoints] = useState("");
  const [activity, setActivity] = useState("");
  const [error, setError] = useState<string | null>(null);
  const todayIso = isoDate(today);
  return (
    <form
      className="grid gap-3 border-b border-line bg-canvas/60 px-5 py-4 text-sm sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        const n = Math.round(Number(points));
        if (!program) return setError("Choose a program.");
        if (!Number.isFinite(n) || n < 0 || points.trim() === "") return setError("Enter your balance.");
        const ok = walletActions.setBalance(program, { points: n, updated: todayIso, ...(activity ? { lastActivity: activity } : {}) });
        if (!ok) return setError("Couldn't save that balance.");
        onDone();
      }}
    >
      <label className="space-y-1">
        <span className="font-medium text-ink">Program</span>
        <ProgramSelect
          label="Program"
          value={program}
          onChange={(v) => {
            setProgram(v);
            setError(null);
          }}
          exclude={existing}
          required
        />
      </label>
      <label className="space-y-1">
        <span className="font-medium text-ink">Balance</span>
        <input
          className="input"
          type="number"
          min={0}
          step={1}
          inputMode="numeric"
          placeholder="e.g. 85000"
          value={points}
          onChange={(e) => {
            setPoints(e.target.value);
            setError(null);
          }}
        />
      </label>
      <label className="space-y-1">
        <span className="font-medium text-ink">
          Last activity <span className="font-normal text-ink-3">(optional)</span>
        </span>
        <input className="input" type="date" max={todayIso} value={activity} onChange={(e) => setActivity(e.target.value)} />
      </label>
      <div className="flex gap-2">
        <button className="btn-primary">Save</button>
        <button type="button" className="btn-ghost px-3" onClick={onDone} aria-label="Cancel">
          <X className="h-4 w-4" />
        </button>
      </div>
      {error && (
        <p className="text-sm font-medium text-danger sm:col-span-4" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

function expiryLine(s: BalanceStatus): { chip?: { tone: NonNullable<BalanceStatus["tone"]>; text: string }; text: string } {
  const p = s.policy;
  switch (s.kind) {
    case "date": {
      const days = s.daysLeft ?? 0;
      return {
        chip: { tone: s.tone ?? "ok", text: `${days < 0 ? "Expired" : "Expires"} ${formatDate(s.expires!)}` },
        text: days < 0 ? `${p?.months} months after your last activity` : `${relativeDays(days)} · ${p?.months} months after your last activity`,
      };
    }
    case "needs-activity":
      return { text: `Expires after ${p?.months} months without activity. Add your last activity date to see when.` };
    case "never":
      return { text: "Doesn't expire" };
    case "while-open":
      return { text: "Safe while you keep a card that earns them" };
    case "at-risk":
      return { chip: { tone: "amber", text: "No card earning these" }, text: "These last while you keep a card that earns them open. None is in your wallet." };
    case "fixed-term":
      return { text: `Each batch expires ${p?.months} months after it's earned, whatever you do` };
    default:
      return { text: "No expiry information yet" };
  }
}

function BalanceRow({
  id,
  balance,
  cents: c,
  value,
  status,
  own,
  now,
}: {
  id: string;
  balance: PointsBalance;
  cents?: number;
  value: number;
  status: BalanceStatus;
  own?: number;
  now: Date;
}) {
  const [editing, setEditing] = useState(false);
  const [valuing, setValuing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const info = programInfo(id);
  const unit = programUnit(id);
  const exp = expiryLine(status);
  const checked = daysSince(balance.updated, now);
  const todayIso = isoDate(now);

  if (editing) {
    return (
      <li>
        <EditBalance id={id} balance={balance} todayIso={todayIso} onDone={() => setEditing(false)} />
      </li>
    );
  }

  return (
    <li className="grid gap-x-6 gap-y-3 px-5 py-4 md:grid-cols-[minmax(0,1fr)_auto]">
      <div className="min-w-0">
        <p className="font-semibold text-ink">{programName(id)}</p>
        <p className="text-xs text-ink-3">{info ? programKindLabels[info.kind] : "Program"}</p>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 md:justify-end md:text-right">
        <p className="text-lg font-semibold text-navy">
          {num(balance.points)} <span className="text-sm font-medium text-ink-3">{unit}</span>
        </p>
        <div className="text-sm">
          {valuing ? (
            <ValueEditor id={id} current={c} own={own} onDone={() => setValuing(false)} />
          ) : (
            <p className="text-ink-2">
              <span className="font-semibold text-ink">{c === undefined ? "No valuation" : usd(value)}</span>
              {c !== undefined && <span> at {cents(c)}</span>}
              {own !== undefined && <span className="ml-1 rounded-full bg-sky px-1.5 py-0.5 text-[11px] font-semibold text-brand">your value</span>}
              <button className="ml-1 inline-grid h-6 w-6 place-items-center rounded text-ink-3 align-middle hover:bg-canvas hover:text-brand" onClick={() => setValuing(true)} aria-label={`Set your own value for ${programName(id)}`} title="Set your own value">
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </p>
          )}
        </div>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
        {exp.chip && <ExpiryChip tone={exp.chip.tone}>{exp.chip.text}</ExpiryChip>}
        <span className="text-ink-2">{exp.text}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm md:justify-end">
        <span className={cn(status.stale ? "font-medium text-warn" : "text-ink-3")}>
          Updated {checked <= 0 ? "today" : `${checked} day${checked === 1 ? "" : "s"} ago`}
        </span>
        {status.stale && (
          <button className="btn-secondary px-2.5 py-1 text-xs" onClick={() => walletActions.setBalance(id, { ...balance, updated: todayIso })}>
            <CheckCircle2 className="h-3.5 w-3.5" /> Still right
          </button>
        )}
        {confirming ? (
          <>
            <button className="btn-secondary px-2.5 py-1 text-xs" onClick={() => walletActions.setBalance(id, null)}>
              Remove
            </button>
            <button className="btn-ghost px-2.5 py-1 text-xs" onClick={() => setConfirming(false)}>
              Keep
            </button>
          </>
        ) : (
          <>
            <button className="btn-ghost px-2.5 py-1 text-xs" onClick={() => setEditing(true)}>
              <Pencil className="h-3.5 w-3.5" /> Update
            </button>
            <button className="grid h-7 w-7 place-items-center rounded text-ink-3 hover:bg-canvas hover:text-danger" onClick={() => setConfirming(true)} aria-label={`Remove ${programName(id)}`} title="Remove">
              <Trash2 className="h-4 w-4" />
            </button>
          </>
        )}
      </div>
    </li>
  );
}

function EditBalance({ id, balance, todayIso, onDone }: { id: string; balance: PointsBalance; todayIso: string; onDone: () => void }) {
  const [points, setPoints] = useState(String(balance.points));
  const [activity, setActivity] = useState(balance.lastActivity ?? "");
  return (
    <form
      className="grid gap-3 bg-canvas/60 px-5 py-4 text-sm sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        const n = Math.round(Number(points));
        if (!Number.isFinite(n) || n < 0) return;
        if (walletActions.setBalance(id, { points: n, updated: todayIso, ...(activity ? { lastActivity: activity } : {}) })) onDone();
      }}
    >
      <p className="font-semibold text-ink sm:self-center">{programName(id)}</p>
      <label className="space-y-1">
        <span className="font-medium text-ink">Balance</span>
        <input autoFocus className="input" type="number" min={0} step={1} inputMode="numeric" value={points} onChange={(e) => setPoints(e.target.value)} />
      </label>
      <label className="space-y-1">
        <span className="font-medium text-ink">Last activity</span>
        <input className="input" type="date" max={todayIso} value={activity} onChange={(e) => setActivity(e.target.value)} />
      </label>
      <div className="flex gap-2">
        <button className="btn-primary">Save</button>
        <button type="button" className="btn-ghost px-3" onClick={onDone} aria-label="Cancel">
          <X className="h-4 w-4" />
        </button>
      </div>
    </form>
  );
}

function ValueEditor({ id, current, own, onDone }: { id: string; current?: number; own?: number; onDone: () => void }) {
  const median = valuationOf(id)?.median;
  const [draft, setDraft] = useState(current !== undefined ? String(current) : "");
  return (
    <form
      className="flex flex-wrap items-center gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        const v = Number(draft);
        strategyPrefs.setCpp(id, Number.isFinite(v) && v > 0 && v !== median ? v : null);
        onDone();
      }}
    >
      <input
        autoFocus
        className="input h-8 w-20 py-1 text-right text-xs"
        type="number"
        min={0.01}
        max={100}
        step={0.05}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        aria-label={`Cents per point for ${programName(id)}`}
      />
      <span className="text-xs text-ink-3">¢/pt</span>
      <button className="btn-primary px-2.5 py-1 text-xs">Save</button>
      {own !== undefined && median !== undefined && (
        <button
          type="button"
          className="btn-ghost px-2 py-1 text-xs"
          onClick={() => {
            strategyPrefs.setCpp(id, null);
            onDone();
          }}
        >
          Use {cents(median)}
        </button>
      )}
      <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={onDone} aria-label="Cancel">
        <X className="h-3.5 w-3.5" />
      </button>
    </form>
  );
}

/** Where the numbers come from: valuation sources and expiration policies for the programs shown. */
function AboutValues({ ids }: { ids: string[] }) {
  return (
    <details className="panel group p-5 text-sm">
      <summary className="flex cursor-pointer list-none items-center gap-2 font-semibold text-navy">
        <Info className="h-4 w-4 text-brand" /> Where these numbers come from
        <span className="ml-auto text-xs font-medium text-brand group-open:hidden">Show</span>
        <span className="ml-auto hidden text-xs font-medium text-brand group-open:inline">Hide</span>
      </summary>
      <ul className="mt-4 divide-y divide-line">
        {ids.map((id) => {
          const v = valuationOf(id);
          const p = expirationPolicy(id);
          return (
            <li key={id} className="grid gap-2 py-3 md:grid-cols-[minmax(0,220px)_1fr_1fr] md:gap-6">
              <p className="font-medium text-ink">{programName(id)}</p>
              <div className="text-ink-2">
                {v ? (
                  <>
                    <p>
                      Median {cents(v.median)}
                      {v.low !== v.high && ` (range ${cents(v.low)}–${cents(v.high)})`} from {v.values.length} source{v.values.length === 1 ? "" : "s"}
                    </p>
                    <SourceLinks sources={v.values.map((x) => x.url).filter(Boolean)} className="mt-1" />
                  </>
                ) : (
                  <p>No valuation on file</p>
                )}
              </div>
              <div className="text-ink-2">
                {p ? (
                  <>
                    <p>{p.notes}</p>
                    <p className="mt-0.5 text-xs text-ink-3">
                      Activity: {p.activity} · as of {formatDate(p.asOf)}
                    </p>
                    <SourceLinks sources={p.sources} className="mt-1" />
                  </>
                ) : (
                  <p>No expiration policy on file</p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </details>
  );
}
