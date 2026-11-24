"use client";

import { useState } from "react";
import { CheckCircle2, Coins, Info, Pencil, Plus, RefreshCw, Trash2, X } from "lucide-react";
import type { Card } from "@/shared/data/types";
import { getCard } from "@/shared/data/cards";
import { programForCard, programInfo, programKindLabels, programName, programUnit } from "@/shared/data/strategy/programs";
import { ProgramSelect } from "@/frontend/components/program-select";
import { strategyPrefs, useStrategyPrefs } from "@/frontend/state/strategy-prefs";
import { walletActions, type PointsBalance, type WalletState } from "@/frontend/state/wallet-store";
import { expirationPolicies } from "@/shared/data/strategy/expiration";
import type { ExpirationPolicy } from "@/shared/data/strategy/types";
import {
  EXPIRY_AMBER_DAYS,
  STALE_BALANCE_DAYS,
  balanceStatus,
  expirationPolicy,
  missingPolicy,
  ownCardPrograms,
  pointsValueUsd,
  type BalanceStatus,
} from "@/shared/lib/trackers";
import { MEDIAN_SOURCE, VALUE_EDITION, VALUE_OUTLETS, formatCents, noValueReason, resolvePointValue, type ValueContext } from "@/shared/lib/point-value";
import { daysSince, daysUntil, formatDate, formatMonth, isoDate } from "@/shared/lib/dates";
import { cn, num, usd } from "@/shared/lib/format";
import { SourceLinks } from "@/frontend/features/next-card/rule-results";
import { ExplainChip } from "@/frontend/components/explain-chip";
import { EmptyState, ExpiryChip, Stat, StatRow, TabFrame, relativeDays } from "./tab-parts";

/** Programs and bank currencies that the wallet's cards earn (authorized-user cards too): balances worth adding. */
export function earningPrograms(wallet: WalletState): Set<string> {
  const cards = wallet.cards.map(getCard).filter((c): c is Card => Boolean(c));
  return new Set(cards.map(programForCard).filter((x): x is string => Boolean(x)));
}

/**
 * Each balance's status. Expiry exemptions and "safe while a card is open" go by the user's own cards (wallet and
 * card history, not cards they're an authorized user on): see ownCardPrograms.
 */
export function balanceStatuses(wallet: WalletState, now: Date): Map<string, BalanceStatus> {
  const own = ownCardPrograms(wallet);
  return new Map(
    Object.entries(wallet.balances ?? {}).map(([id, b]) => [id, balanceStatus(id, b, now, { earningCard: own.open.has(id), closedCardOn: own.closed.get(id) })]),
  );
}

const cents = formatCents;
/** "The Points Guy, Upgraded Points and NerdWallet" */
const OUTLET_NAMES = VALUE_OUTLETS.join(", ").replace(/, ([^,]*)$/, " and $1");
const EDITION = VALUE_EDITION ? formatMonth(VALUE_EDITION) : "";

/** A dated change worth flagging next to a balance, within a year either side of today. */
function changeChip(policy: ExpirationPolicy | undefined, now: Date): { text: string; title: string } | null {
  const c = policy?.change;
  if (!c) return null;
  const days = daysUntil(c.date, now);
  if (Math.abs(days) > 365) return null;
  return { text: `${days > 0 ? "Changes" : "Changed"} ${formatDate(c.date)}`, title: c.text };
}

/** Points balances with estimated value, expiry warnings and a nudge to refresh stale numbers. */
export function PointsTab({ wallet, now }: { wallet: WalletState; now: Date }) {
  const prefs = useStrategyPrefs();
  const [adding, setAdding] = useState<string | null>(null);
  const balances = wallet.balances ?? {};
  const earning = earningPrograms(wallet);
  const statuses = balanceStatuses(wallet, now);
  // The one value every page uses (shared/lib/point-value.ts): the user's own, else the published median for their cards.
  const values: ValueContext = { own: prefs.cpp, cards: wallet.cards };
  const rows = Object.entries(balances)
    .map(([id, b]) => {
      const c = resolvePointValue(id, values)?.cents;
      return { id, b, cents: c, value: c === undefined ? 0 : pointsValueUsd(b.points, c), status: statuses.get(id)! };
    })
    .sort((a, b) => b.value - a.value || programName(a.id).localeCompare(programName(b.id)));
  // Points past their expiry date (as far as the last activity entered shows) aren't worth anything any more.
  const expired = rows.filter((r) => r.status.tone === "expired");
  const live = rows.filter((r) => r.status.tone !== "expired");
  const totalUsd = live.reduce((s, r) => s + r.value, 0);
  const dated = rows.filter((r) => r.status.kind === "date" && r.status.tone && r.status.tone !== "ok").sort((a, b) => (a.status.daysLeft ?? 0) - (b.status.daysLeft ?? 0));
  const atRisk = rows.filter((r) => r.status.kind === "at-risk");
  const stale = rows.filter((r) => r.status.stale);
  const overrides = rows.filter((r) => prefs.cpp[r.id] !== undefined).length;
  const suggestions = [...earning].filter((id) => !balances[id] && programInfo(id));
  const soon = dated.filter((r) => r.status.tone !== "expired").length;

  return (
    <TabFrame>
      <StatRow>
        <Stat
          label="Estimated value"
          value={usd(totalUsd)}
          sub={
            rows.length
              ? `${num(live.reduce((s, r) => s + r.b.points, 0))} points across ${live.length} program${live.length === 1 ? "" : "s"}${overrides ? `, ${overrides} at your own value` : ""}${expired.length ? `; ${expired.length} expired balance${expired.length === 1 ? "" : "s"} not counted` : ""}`
              : "Add a balance to see what your points are worth"
          }
        />
        <Stat
          label="Expiring or expired"
          value={String(dated.length)}
          tone={dated.some((r) => r.status.tone !== "amber") ? "danger" : dated.length ? "warn" : undefined}
          sub={
            dated.length
              ? [
                  soon ? `${soon === 1 && !expired.length ? `${programName(dated[0].id)} expires ${formatDate(dated[0].status.expires!)}` : `${soon} within ${EXPIRY_AMBER_DAYS} days`}` : "",
                  expired.length ? `${expired.length === 1 && !soon ? `${programName(expired[0].id)} expired ${formatDate(expired[0].status.expires!)}` : `${expired.length} already expired`}` : "",
                ]
                  .filter(Boolean)
                  .join(" · ")
              : atRisk.length
                ? `${atRisk.length} bank balance${atRisk.length === 1 ? "" : "s"} with no card of yours earning them`
                : `Nothing expiring in the next ${EXPIRY_AMBER_DAYS} days`
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
            <p className="text-sm text-ink-2">
              Valued at {MEDIAN_SOURCE}, unless you set your own. Every page on Perkfolio uses the same value.
            </p>
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
              <BalanceRow key={r.id} id={r.id} balance={r.b} cents={r.cents} value={r.value} status={r.status} own={prefs.cpp[r.id]} cards={wallet.cards} now={now} />
            ))}
          </ul>
        )}
        {rows.length > 0 && suggestions.length > 0 && adding === null && (
          <div className="flex flex-wrap items-center gap-2 border-t border-line bg-canvas/60 px-5 py-3 text-sm">
            <span className="text-ink-2">Your cards also earn:</span>
            {suggestions.map((id) => (
              <button key={id} className="chip min-h-10 cursor-pointer hover:border-brand hover:text-brand sm:min-h-0" onClick={() => setAdding(id)}>
                <Plus className="h-3 w-3" /> {programName(id)}
              </button>
            ))}
          </div>
        )}
      </section>

      {rows.length > 0 && <AboutValues ids={rows.map((r) => r.id)} cards={wallet.cards} />}
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
      <ActivityHint program={program} className="sm:col-span-4" />
      {error && (
        <p className="text-sm font-medium text-danger sm:col-span-4" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

/**
 * What counts as activity for a program whose points expire after inactivity, under the "Last activity" field:
 * for some programs only a flight or a stay does, so a transfer entered as the last activity would give too late a
 * date.
 */
function ActivityHint({ program, className }: { program: string; className?: string }) {
  const p = program ? expirationPolicy(program) : undefined;
  if (!p || p.rule !== "inactivity") return null;
  return (
    <p className={cn("text-xs leading-relaxed text-ink-3", className)}>
      <span className="font-medium text-ink-2">What counts as activity for {programName(program)}:</span> {p.activity}
    </p>
  );
}

function expiryLine(s: BalanceStatus): { chip?: { tone: NonNullable<BalanceStatus["tone"]>; text: string }; text: string } {
  const p = s.policy;
  switch (s.kind) {
    case "card-exempt": {
      const ex = p?.cardExemption;
      // AAdvantage's exemption is for primary cardmembers; an authorized user's card doesn't count (see ownCardPrograms).
      return { text: ex?.primary ? `Doesn't expire while you're the primary cardmember on an open ${ex.card}` : `Doesn't expire while your ${ex?.card ?? "co-brand card"} is open` };
    }
    case "date": {
      const days = s.daysLeft ?? 0;
      const why = s.afterClosing
        ? `${p?.cardExemption?.afterClosingMonths} months after you closed your ${p?.cardExemption?.card}, later than ${p?.months} months after your last activity`
        : `${p?.months} months after your last activity`;
      return {
        chip: { tone: s.tone ?? "ok", text: `${days < 0 ? "Expired" : "Expires"} ${formatDate(s.expires!)}` },
        text: s.resumes
          ? `${days < 0 ? "Expiry resumed then" : `${relativeDays(days)} · expiry resumes then`}, and your last activity was over ${p?.months} months before`
          : days < 0
            ? why
            : `${relativeDays(days)} · ${why}`,
      };
    }
    case "needs-activity":
      return { text: `Expires after ${p?.months} months without activity. Add your last activity date to see when.` };
    case "never":
      return { text: "Doesn't expire" };
    case "while-open":
      return { text: "Safe while you keep a card that earns them" };
    case "at-risk":
      return {
        chip: { tone: "amber", text: "No card earning these" },
        text: "These last while you keep a card of your own that earns them open. Your wallet and card history have none (cards you're an authorized user on don't count).",
      };
    case "fixed-term":
      // Activity doesn't move the date, but elite status, a paid extension or the program's own timing can: the
      // policy's caveat says which, shown under this line.
      return { text: `Each batch expires about ${p?.months} months after it's earned` };
    default:
      return { text: "No confirmed expiration policy yet: check the program's own terms" };
  }
}

function BalanceRow({
  id,
  balance,
  cents: c,
  value,
  status,
  own,
  cards,
  now,
}: {
  id: string;
  balance: PointsBalance;
  cents?: number;
  value: number;
  status: BalanceStatus;
  own?: number;
  /** The wallet's cards, for the published median that applies to them. */
  cards: string[];
  now: Date;
}) {
  const [editing, setEditing] = useState(false);
  const [valuing, setValuing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const info = programInfo(id);
  const unit = programUnit(id);
  const exp = expiryLine(status);
  const change = changeChip(status.policy, now);
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
            <ValueEditor id={id} current={c} own={own} cards={cards} onDone={() => setValuing(false)} />
          ) : (
            <p className="text-ink-2">
              {c === undefined ? (
                <>
                  <span className="font-semibold text-ink">No published value</span>
                  <button className="ml-2 inline-flex min-h-10 items-center font-medium text-brand hover:underline sm:min-h-0" onClick={() => setValuing(true)}>
                    Set your own
                  </button>
                </>
              ) : (
                <>
                  {status.tone === "expired" ? (
                    <span className="font-semibold text-ink-3 line-through decoration-danger" title="Expired: not counted in the estimated value">
                      {usd(value)}
                    </span>
                  ) : (
                    <span className="font-semibold text-ink">{usd(value)}</span>
                  )}
                  <span> at {cents(c)}</span>
                  {own !== undefined && <span className="ml-1 rounded-full bg-sky px-1.5 py-0.5 text-[11px] font-semibold text-brand">your value</span>}
                  <button
                    className="ml-1 inline-grid h-10 w-10 place-items-center rounded text-ink-3 align-middle hover:bg-canvas hover:text-brand sm:h-6 sm:w-6"
                    onClick={() => setValuing(true)}
                    aria-label={`Set your own value for ${programName(id)}`}
                    title="Set your own value"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </p>
          )}
        </div>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
        {exp.chip && <ExpiryChip tone={exp.chip.tone}>{exp.chip.text}</ExpiryChip>}
        <span className="text-ink-2">{exp.text}</span>
        {change && (
          <ExplainChip text={change.title} className="bg-sky px-2.5 text-xs text-brand">
            {change.text}
          </ExplainChip>
        )}
        {status.policy?.caveat && status.kind !== "no-data" && <span className="basis-full text-xs text-ink-3">{status.policy.caveat}</span>}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm md:justify-end">
        <span className={cn(status.stale ? "font-medium text-warn" : "text-ink-3")}>
          Updated {checked <= 0 ? "today" : `${checked} day${checked === 1 ? "" : "s"} ago`}
        </span>
        {status.stale && (
          <button className="btn-secondary min-h-10 px-2.5 py-1 text-xs sm:min-h-0" onClick={() => walletActions.setBalance(id, { ...balance, updated: todayIso })}>
            <CheckCircle2 className="h-3.5 w-3.5" /> Still right
          </button>
        )}
        {confirming ? (
          <>
            <button className="btn-secondary min-h-10 px-2.5 py-1 text-xs sm:min-h-0" onClick={() => walletActions.setBalance(id, null)}>
              Remove
            </button>
            <button className="btn-ghost min-h-10 px-2.5 py-1 text-xs sm:min-h-0" onClick={() => setConfirming(false)}>
              Keep
            </button>
          </>
        ) : (
          <>
            <button className="btn-ghost min-h-10 px-2.5 py-1 text-xs sm:min-h-0" onClick={() => setEditing(true)}>
              <Pencil className="h-3.5 w-3.5" /> Update
            </button>
            <button
              className="grid h-10 w-10 place-items-center rounded text-ink-3 hover:bg-canvas hover:text-danger sm:h-7 sm:w-7"
              onClick={() => setConfirming(true)}
              aria-label={`Remove ${programName(id)}`}
              title="Remove"
            >
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
      <ActivityHint program={id} className="sm:col-span-4" />
    </form>
  );
}

function ValueEditor({ id, current, own, cards, onDone }: { id: string; current?: number; own?: number; cards: string[]; onDone: () => void }) {
  // What the balance falls back to without the user's own value: the published median for their cards.
  const median = resolvePointValue(id, { cards })?.cents;
  const [draft, setDraft] = useState(current !== undefined ? String(current) : "");
  const none = median === undefined;
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
        step="any"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        aria-label={`Cents per point for ${programName(id)}`}
      />
      <span className="text-xs text-ink-3">¢/pt</span>
      <button className="btn-primary px-2.5 py-1 text-xs">Save</button>
      {none && <span className="basis-full text-xs text-ink-3">No outlet publishes a value for this one: use what you usually get per point.</span>}
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

/** Where the numbers come from: each outlet's valuation and the expiration policy for the programs shown. */
function AboutValues({ ids, cards }: { ids: string[]; cards: string[] }) {
  return (
    <details className="panel group p-5 text-sm">
      <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 font-semibold text-navy sm:min-h-0">
        <Info className="h-4 w-4 text-brand" /> Where these numbers come from
        <span className="ml-auto text-xs font-medium text-brand group-open:hidden">Show</span>
        <span className="ml-auto hidden text-xs font-medium text-brand group-open:inline">Hide</span>
      </summary>
      <p className="mt-3 text-xs leading-relaxed text-ink-3">
        Values are cents per point from the {EDITION} tables of {OUTLET_NAMES}; we use the middle figure, the same one every
        page on Perkfolio uses unless you set your own. Expiration policies come from the programs&apos; and card issuers&apos;
        own pages, or from two or more outlets that agree, checked {formatDate(expirationPolicies.verified)}.
      </p>
      <ul className="mt-2 divide-y divide-line">
        {ids.map((id) => {
          // The published median for the user's cards (an outlet's figure for cards like theirs can replace its headline one).
          const r = resolvePointValue(id, { cards });
          const v = r?.published;
          const f = r?.forCards;
          const p = expirationPolicy(id);
          return (
            <li key={id} className="grid gap-2 py-3 md:grid-cols-[minmax(0,200px)_1fr_1fr] md:gap-6">
              <p className="font-medium text-ink">{programName(id)}</p>
              <div className="min-w-0 text-ink-2">
                {v && f ? (
                  <>
                    <p>
                      Median {cents(f.median)}
                      {f.low !== f.high && ` (range ${cents(f.low)}–${cents(f.high)})`}
                      {f.variant && `, with ${f.variant.outlet}'s ${cents(f.variant.cents)} for ${f.variant.appliesTo}`}
                    </p>
                    <ul className="mt-1 space-y-0.5 text-xs">
                      {v.values.map((x) => (
                        <li key={x.outlet}>
                          <a
                            href={x.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex min-h-8 items-center font-medium text-brand hover:underline sm:inline sm:min-h-0"
                          >
                            {x.outlet}
                          </a>
                          : {cents(x.cents)}
                          {x.previousCents !== undefined && <span className="text-ink-3"> (was {cents(x.previousCents)})</span>}
                          {x.variants?.map((va) => (
                            <span key={va.appliesTo} className="text-ink-3">
                              ; {cents(va.cents)} for {va.appliesTo}
                            </span>
                          ))}
                          <span className="text-ink-3"> · {formatMonth(x.asOf)}</span>
                        </li>
                      ))}
                    </ul>
                    {v.note && <p className="mt-1 text-xs text-ink-3">{v.note}</p>}
                  </>
                ) : r?.basis === "estimate" ? (
                  <p>No outlet we follow publishes a value, so balances use the card data&apos;s estimate of {cents(r.cents)}. Use &ldquo;Set your own&rdquo; next to the balance to change it.</p>
                ) : (
                  <p>No published value. {noValueReason(id) ?? ""} Use &ldquo;Set your own&rdquo; next to the balance.</p>
                )}
              </div>
              <div className="min-w-0 text-ink-2">
                {p ? (
                  <>
                    <p>{p.notes}</p>
                    <p className="mt-0.5 text-xs text-ink-3">
                      Activity: {p.activity} · as of {formatMonth(p.asOf)}
                    </p>
                    <SourceLinks sources={p.sources} checked={expirationPolicies.verified} className="mt-1" />
                  </>
                ) : (
                  <p>No confirmed expiration policy. {missingPolicy(id) ?? ""}</p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </details>
  );
}
