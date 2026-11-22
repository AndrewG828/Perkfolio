"use client";

import { useState } from "react";
import { CheckCircle2, Gift, Pencil, Plus, X } from "lucide-react";
import type { Card } from "@/data/types";
import { Meter } from "@/components/meter";
import { walletActions, type BonusProgress } from "@/lib/wallet-store";
import { usd } from "@/lib/format";

/** Pulls "$8,000 ... first 6 months" (or "first 90 days") out of a welcome-offer string, if present. */
export function parseBonusTerms(offer: string): { target: number; amount: number; unit: "months" | "days" } | null {
  const m = offer.match(/\$([\d,]+)\s+in\s+(?:[\w-]+\s+){0,3}?purchases[^.]*?(?:first|within)\s+(\d+)\s+(months?|days?)/i);
  if (!m) return null;
  return { target: Number(m[1].replace(/,/g, "")), amount: Number(m[2]), unit: /^d/i.test(m[3]) ? "days" : "months" };
}

const toISO = (d: Date) => d.toISOString().slice(0, 10);
const DAY = 86_400_000;

export function BonusTracker({ card, progress, now }: { card: Card; progress?: BonusProgress; now: Date }) {
  const terms = parseBonusTerms(card.welcomeOffer);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addAmount, setAddAmount] = useState("");
  const [form, setForm] = useState(() => ({
    target: String(progress?.target ?? terms?.target ?? ""),
    spent: String(progress?.spent ?? 0),
    deadline:
      progress?.deadline ??
      toISO(
        terms?.unit === "days"
          ? new Date(now.getTime() + terms.amount * DAY)
          : new Date(now.getFullYear(), now.getMonth() + (terms?.amount ?? 3), now.getDate()),
      ),
  }));

  // Nothing to track and the user hasn't started: offer it quietly.
  if (!progress && !editing) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-canvas/60 px-5 py-3 text-sm">
        <span className="flex items-center gap-2 text-ink-2">
          <Gift className="h-4 w-4 text-brand" />
          {terms
            ? `Opened recently? Track your progress toward ${usd(terms.target)} in ${terms.amount} ${terms.unit} for the welcome offer.`
            : "Working toward a welcome offer? Track your minimum spend."}
        </span>
        <button className="btn-ghost px-3 py-1.5" onClick={() => setEditing(true)}>
          <Plus className="h-4 w-4" /> Track welcome bonus
        </button>
      </div>
    );
  }

  if (editing) {
    return (
      <form
        className="grid gap-3 border-b border-line bg-canvas/60 px-5 py-4 text-sm sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          const target = Number(form.target);
          if (!target || target <= 0) return;
          walletActions.setBonus(card.id, { target, spent: Math.max(0, Number(form.spent) || 0), deadline: form.deadline });
          setEditing(false);
        }}
      >
        <label className="space-y-1">
          <span className="font-medium text-ink">Spend required</span>
          <input className="input" type="number" min={1} step="any" value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} required />
        </label>
        <label className="space-y-1">
          <span className="font-medium text-ink">Spent so far</span>
          <input className="input" type="number" min={0} step="any" value={form.spent} onChange={(e) => setForm({ ...form, spent: e.target.value })} />
        </label>
        <label className="space-y-1">
          <span className="font-medium text-ink">Deadline</span>
          <input className="input" type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} required />
        </label>
        <div className="flex gap-2">
          <button className="btn-primary">Save</button>
          <button type="button" className="btn-ghost px-3" onClick={() => setEditing(false)} aria-label="Cancel">
            <X className="h-4 w-4" />
          </button>
        </div>
      </form>
    );
  }

  const p = progress!;
  const done = p.spent >= p.target;
  const daysLeft = Math.max(0, Math.ceil((new Date(p.deadline + "T23:59:59").getTime() - now.getTime()) / DAY));
  const remaining = Math.max(0, p.target - p.spent);
  const perMonth = daysLeft > 0 ? remaining / Math.max(1, daysLeft / 30.44) : remaining;
  const behind = !done && (daysLeft <= 30 || (daysLeft > 0 && perMonth > p.target / 3));

  return (
    <div className="border-b border-line bg-canvas/60 px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="flex items-center gap-2 font-semibold text-ink">
          <Gift className="h-4 w-4 text-brand" /> Welcome bonus spend
        </span>
        <span className="text-ink-2">
          <span className="font-semibold text-ink">{usd(p.spent)}</span> of {usd(p.target)}
        </span>
      </div>
      <Meter
        className="my-2"
        value={p.spent}
        max={p.target}
        tone={done ? "success" : behind ? "warn" : "brand"}
        label={`${card.name} welcome bonus spend`}
      />
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        {done ? (
          <span className="flex items-center gap-1 font-semibold text-success">
            <CheckCircle2 className="h-3.5 w-3.5" /> Minimum spend met — the bonus should post after your statement closes.
          </span>
        ) : daysLeft === 0 ? (
          <span className="font-semibold text-danger">Deadline passed with {usd(remaining)} to go.</span>
        ) : (
          <span className={behind ? "font-medium text-warn" : "text-ink-2"}>
            {usd(remaining)} to go · {daysLeft} day{daysLeft === 1 ? "" : "s"} left · about {usd(Math.ceil(perMonth))}/month
          </span>
        )}
        <span className="flex items-center gap-1">
          {adding ? (
            <form
              className="flex items-center gap-1"
              onSubmit={(e) => {
                e.preventDefault();
                const v = Number(addAmount);
                if (v) walletActions.setBonus(card.id, { ...p, spent: Math.max(0, p.spent + v) });
                setAddAmount("");
                setAdding(false);
              }}
            >
              <input
                autoFocus
                className="input h-8 w-24 py-1 text-xs"
                type="number"
                step="0.01"
                placeholder="Amount"
                value={addAmount}
                onChange={(e) => setAddAmount(e.target.value)}
                aria-label="Spend to add"
              />
              <button className="btn-primary px-3 py-1 text-xs">Add</button>
            </form>
          ) : (
            !done && (
              <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setAdding(true)}>
                <Plus className="h-3.5 w-3.5" /> Add spend
              </button>
            )
          )}
          <button
            className="btn-ghost px-2 py-1 text-xs"
            onClick={() => {
              setForm({ target: String(p.target), spent: String(p.spent), deadline: p.deadline });
              setEditing(true);
            }}
          >
            <Pencil className="h-3.5 w-3.5" /> Edit
          </button>
          <button className="btn-ghost px-2 py-1 text-xs text-ink-3" onClick={() => walletActions.setBonus(card.id, null)}>
            Stop tracking
          </button>
        </span>
      </div>
    </div>
  );
}
