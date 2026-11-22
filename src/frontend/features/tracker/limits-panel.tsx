"use client";

import { useState } from "react";
import { Gauge, Minus, Plane, Plus } from "lucide-react";
import type { Card } from "@/shared/data/types";
import { Meter } from "@/frontend/components/meter";
import { limitPeriod, limitsFor, tallyKey, type Limit } from "@/shared/lib/limits";
import { walletActions, type WalletState } from "@/frontend/state/wallet-store";
import { num, usd } from "@/shared/lib/format";

/** Spending caps and lounge visit allowances for one card, each with a meter and a way to log usage. */
export function LimitsPanel({ card, wallet, now }: { card: Card; wallet: WalletState; now: Date }) {
  const limits = limitsFor(card);
  if (limits.length === 0) return null;
  return (
    <div className="border-b border-line px-5 py-4">
      <p className="mb-3 text-xs font-semibold tracking-wide text-ink-3 uppercase">Caps & allowances</p>
      <ul className="space-y-4">
        {limits.map((l) => (
          <LimitRow key={l.id} card={card} limit={l} wallet={wallet} now={now} />
        ))}
      </ul>
    </div>
  );
}

function LimitRow({ card, limit, wallet, now }: { card: Card; limit: Limit; wallet: WalletState; now: Date }) {
  const period = limitPeriod(limit, now);
  const key = tallyKey(card.id, limit.id, period.key);
  const used = wallet.tally?.[key] ?? 0;
  const [adding, setAdding] = useState(false);
  const [amount, setAmount] = useState("");
  const full = used >= limit.limit;
  const near = !full && used / limit.limit >= 0.8;
  const spend = limit.kind === "spend";
  const fmt = (n: number) => (spend ? usd(n) : num(n));

  return (
    <li>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="flex min-w-0 items-center gap-2 font-medium text-ink">
          {spend ? <Gauge className="h-4 w-4 shrink-0 text-brand" /> : <Plane className="h-4 w-4 shrink-0 text-brand" />}
          <span className="truncate">{limit.label}</span>
        </span>
        <span className="text-ink-2">
          <span className="font-semibold text-ink">{fmt(used)}</span> of {fmt(limit.limit)}
          {spend ? "" : ` ${limit.id.endsWith("-guest") ? "passes" : "visits"}`}
        </span>
      </div>
      <Meter
        className="my-2"
        size="sm"
        value={used}
        max={limit.limit}
        tone={full || near ? "warn" : "brand"}
        label={`${card.name}: ${limit.label}`}
      />
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className={full ? "font-semibold text-warn" : near ? "font-medium text-warn" : "text-ink-3"}>
          {full
            ? spend
              ? `Cap reached${limit.after ? ` — earning ${limit.after.replace(/^then\s+/i, "")} now` : ""}. Use another card for this category.`
              : "No visits left this period."
            : `${fmt(limit.limit - used)} left · resets ${period.end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`}
        </span>
        <span className="flex items-center gap-1">
          {spend ? (
            adding ? (
              <form
                className="flex items-center gap-1"
                onSubmit={(e) => {
                  e.preventDefault();
                  const v = Number(amount);
                  if (v) walletActions.setTally(key, Math.max(0, used + v));
                  setAmount("");
                  setAdding(false);
                }}
              >
                <input
                  autoFocus
                  className="input h-8 w-28 py-1 text-xs"
                  type="number"
                  step="any"
                  placeholder="Amount spent"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  aria-label={`Spend to add for ${limit.label}`}
                />
                <button className="btn-primary px-3 py-1 text-xs">Add</button>
              </form>
            ) : (
              <>
                <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setAdding(true)}>
                  <Plus className="h-3.5 w-3.5" /> Log spend
                </button>
                {used > 0 && (
                  <button className="btn-ghost px-2 py-1 text-xs text-ink-3" onClick={() => walletActions.setTally(key, 0)}>
                    Reset
                  </button>
                )}
              </>
            )
          ) : (
            <>
              <button
                className="btn-ghost h-8 w-8 p-0"
                disabled={used <= 0}
                onClick={() => walletActions.setTally(key, used - 1)}
                aria-label={`Remove a ${limit.label} visit`}
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <button className="btn-secondary px-3 py-1 text-xs" onClick={() => walletActions.setTally(key, used + 1)}>
                <Plus className="h-3.5 w-3.5" /> Log visit
              </button>
            </>
          )}
        </span>
      </div>
    </li>
  );
}
