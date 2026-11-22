"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { AlarmClock, CheckCircle2, Download, EyeOff, Eye, Plus, RotateCcw, Settings2, Upload } from "lucide-react";
import type { Card, Credit } from "@/data/types";
import { getCard } from "@/data/cards";
import { CardArt } from "@/components/card-art";
import { useHydrated, useWallet, usageKey, walletActions, type WalletState } from "@/lib/wallet-store";
import { daysLeft, frequencyLabel, periodFor, periodsInYear } from "@/lib/periods";
import { cn, usd } from "@/lib/format";
import { CardPickerDialog, CardPickerGrid } from "./card-picker";

interface CreditStatus {
  card: Card;
  credit: Credit;
  periodKey: string;
  periodLabel: string;
  used: number;
  remaining: number;
  daysLeft: number;
  ytd: number;
  ignored: boolean;
}

function statusFor(card: Card, credit: Credit, wallet: WalletState, now: Date): CreditStatus {
  const p = periodFor(credit.frequency, now);
  const used = wallet.usage[usageKey(card.id, credit.id, p.key)] ?? 0;
  const ytd = periodsInYear(credit.frequency, now.getFullYear()).reduce(
    (s, per) => s + (wallet.usage[usageKey(card.id, credit.id, per.key)] ?? 0),
    0,
  );
  return {
    card,
    credit,
    periodKey: p.key,
    periodLabel: p.label,
    used,
    remaining: Math.max(0, credit.amountPerPeriod - used),
    daysLeft: daysLeft(p, now),
    ytd,
    ignored: Boolean(wallet.ignored[`${card.id}:${credit.id}`]),
  };
}

export function TrackerView() {
  const hydrated = useHydrated();
  if (!hydrated) {
    return (
      <div className="container-page py-16">
        <div className="panel h-64 animate-pulse bg-canvas" />
      </div>
    );
  }
  return <TrackerDashboard />;
}

/** Rendered only in the browser: reads localStorage and the current date. */
function TrackerDashboard() {
  const wallet = useWallet();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [now] = useState(() => new Date());

  const owned = wallet.cards.map(getCard).filter((c): c is Card => Boolean(c));
  const statuses = owned.flatMap((card) => card.credits.map((credit) => statusFor(card, credit, wallet, now)));
  const active = statuses.filter((s) => !s.ignored);

  const totalFees = owned.reduce((s, c) => s + c.annualFee, 0);
  const captured = active.reduce((s, x) => s + x.ytd, 0);
  const available = active
    .filter((s) => s.credit.frequency !== "every-4-years" && s.credit.frequency !== "one-time")
    .reduce((s, x) => s + x.credit.annualValue, 0);
  const expiring = active
    .filter((s) => s.remaining > 0 && s.credit.frequency !== "every-4-years" && s.credit.frequency !== "one-time")
    .sort((a, b) => a.daysLeft - b.daysLeft || b.remaining - a.remaining)
    .slice(0, 6);

  if (owned.length === 0) {
    return (
      <div className="container-page py-12">
        <div className="mb-8 max-w-2xl">
          <h2 className="text-2xl font-semibold text-navy">Which cards are in your wallet?</h2>
          <p className="mt-2 text-ink-2">
            Select every card you hold. Your wallet is saved privately in this browser — no account or card numbers needed.
          </p>
        </div>
        <CardPickerGrid />
      </div>
    );
  }

  const pct = totalFees > 0 ? Math.min(100, (captured / totalFees) * 100) : 100;

  return (
    <div className="bg-canvas">
      <div className="container-page space-y-10 py-10">
        {/* Summary */}
        <section className="grid gap-5 md:grid-cols-[1.3fr_1fr_1fr]">
          <div className="panel p-6">
            <p className="text-sm font-medium text-ink-2">Credits captured in {now.getFullYear()}</p>
            <p className="mt-2 text-4xl font-semibold tracking-tight text-navy">{usd(captured)}</p>
            <div className="mt-5 h-2.5 overflow-hidden rounded-full bg-canvas">
              <div className={cn("h-full rounded-full", captured >= totalFees ? "bg-success" : "bg-brand")} style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-3 text-sm text-ink-2">
              {captured >= totalFees ? (
                <span className="font-semibold text-success">Your fees are covered — you&apos;re {usd(captured - totalFees)} ahead.</span>
              ) : (
                <>
                  <span className="font-semibold text-ink">{usd(totalFees - captured)}</span> more to break even on {usd(totalFees)} in annual fees.
                </>
              )}
            </p>
          </div>
          <Stat label="Available this year" value={usd(available)} sub={`Across ${active.length} tracked credits`} />
          <Stat label="Cards in wallet" value={String(owned.length)} sub={`${usd(totalFees)} in annual fees`}>
            <button className="btn-secondary mt-4 w-full" onClick={() => setPickerOpen(true)}>
              <Settings2 className="h-4 w-4" /> Manage cards
            </button>
          </Stat>
        </section>

        {/* Expiring soon */}
        {expiring.length > 0 && (
          <section>
            <div className="mb-4 flex items-center gap-2">
              <AlarmClock className="h-5 w-5 text-warn" />
              <h2 className="text-xl font-semibold text-navy">Use it before you lose it</h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {expiring.map((s) => (
                <div key={s.card.id + s.credit.id} className="panel flex flex-col gap-3 p-5">
                  <div className="flex items-center gap-3">
                    <CardArt card={s.card} size="xs" />
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-ink">{s.credit.name}</p>
                      <p className="truncate text-xs text-ink-3">{s.card.name}</p>
                    </div>
                  </div>
                  <div className="flex items-end justify-between">
                    <p className="text-2xl font-semibold text-navy">{usd(s.remaining, { cents: s.remaining % 1 !== 0 })}</p>
                    <p className={cn("text-sm font-medium", s.daysLeft <= 7 ? "text-danger" : "text-warn")}>
                      {s.daysLeft} day{s.daysLeft === 1 ? "" : "s"} left
                    </p>
                  </div>
                  <button
                    className="btn-secondary w-full"
                    onClick={() => walletActions.setUsage(s.card.id, s.credit.id, s.periodKey, s.credit.amountPerPeriod)}
                  >
                    <CheckCircle2 className="h-4 w-4" /> Mark as used
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Per card */}
        <section className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-semibold text-navy">By card</h2>
            <div className="flex gap-2">
              <BackupButtons wallet={wallet} />
              <button className="btn-primary" onClick={() => setPickerOpen(true)}>
                <Plus className="h-4 w-4" /> Add card
              </button>
            </div>
          </div>
          {owned.map((card) => {
            const rows = statuses.filter((s) => s.card.id === card.id);
            const cardCaptured = rows.filter((r) => !r.ignored).reduce((s, r) => s + r.ytd, 0);
            return (
              <article key={card.id} className="panel overflow-hidden">
                <header className="flex flex-wrap items-center gap-5 border-b border-line p-5">
                  <CardArt card={card} size="sm" />
                  <div className="min-w-0 flex-1">
                    <Link href={`/cards/${card.id}`} className="text-lg font-semibold text-navy hover:text-brand">
                      {card.name}
                    </Link>
                    <p className="text-sm text-ink-2">
                      {usd(cardCaptured)} captured of {usd(card.annualFee)} annual fee
                    </p>
                  </div>
                  <div className="w-full sm:w-48">
                    <div className="h-2 overflow-hidden rounded-full bg-canvas">
                      <div
                        className={cn("h-full rounded-full", cardCaptured >= card.annualFee ? "bg-success" : "bg-brand")}
                        style={{ width: `${card.annualFee ? Math.min(100, (cardCaptured / card.annualFee) * 100) : 100}%` }}
                      />
                    </div>
                  </div>
                </header>
                {rows.length === 0 ? (
                  <p className="p-5 text-sm text-ink-2">This card has no statement credits to track.</p>
                ) : (
                  <ul className="divide-y divide-line">
                    {rows.map((s) => (
                      <CreditRow key={s.credit.id} s={s} wallet={wallet} year={now.getFullYear()} />
                    ))}
                  </ul>
                )}
              </article>
            );
          })}
        </section>
      </div>
      <CardPickerDialog open={pickerOpen} onClose={() => setPickerOpen(false)} />
    </div>
  );
}

function Stat({ label, value, sub, children }: { label: string; value: string; sub: string; children?: React.ReactNode }) {
  return (
    <div className="panel p-6">
      <p className="text-sm font-medium text-ink-2">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-navy">{value}</p>
      <p className="mt-1 text-sm text-ink-3">{sub}</p>
      {children}
    </div>
  );
}

function CreditRow({ s, wallet, year }: { s: CreditStatus; wallet: WalletState; year: number }) {
  const { card, credit } = s;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const periods = periodsInYear(credit.frequency, year);
  const showHistory = periods.length > 1;
  const full = s.used >= credit.amountPerPeriod;

  return (
    <li className={cn("grid gap-4 p-5 md:grid-cols-[1fr_auto] md:items-center", s.ignored && "opacity-50")}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold text-ink">{credit.name}</p>
          <span className="chip">{frequencyLabel[credit.frequency]}</span>
          {credit.enrollmentRequired && <span className="chip border-warn/30 text-warn">Enroll</span>}
        </div>
        <p className="mt-1 line-clamp-2 text-sm text-ink-2">{credit.description}</p>
        {showHistory && !s.ignored && (
          <div className="mt-3 flex flex-wrap gap-1" aria-label={`${credit.name} history for ${year}`}>
            {periods.map((p) => {
              const u = wallet.usage[usageKey(card.id, credit.id, p.key)] ?? 0;
              const state = u >= credit.amountPerPeriod ? "full" : u > 0 ? "partial" : "none";
              const current = p.key === s.periodKey;
              return (
                <button
                  key={p.key}
                  title={`${p.label}: ${usd(u)} of ${usd(credit.amountPerPeriod)} used — click to toggle`}
                  onClick={() => walletActions.setUsage(card.id, credit.id, p.key, state === "full" ? 0 : credit.amountPerPeriod)}
                  className={cn(
                    "h-6 rounded-[3px] border text-[10px] font-semibold transition-colors",
                    periods.length > 4 ? "w-7" : "w-16",
                    state === "full" && "border-success bg-success text-white",
                    state === "partial" && "border-brand bg-sky text-brand",
                    state === "none" && "border-line bg-white text-ink-3 hover:border-brand",
                    current && "ring-2 ring-brand/40 ring-offset-1",
                  )}
                >
                  {periods.length > 4 ? p.label.slice(0, 1) : p.label.split(" ")[0]}
                </button>
              );
            })}
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3 md:justify-end">
        <div className="min-w-[120px] text-right">
          <p className="text-sm text-ink-2">
            <span className="font-semibold text-ink">{usd(s.used, { cents: s.used % 1 !== 0 })}</span> of {usd(credit.amountPerPeriod)}
          </p>
          <p className="text-xs text-ink-3">
            {s.periodLabel}
            {credit.frequency !== "every-4-years" && credit.frequency !== "one-time" && !full ? ` · ${s.daysLeft}d left` : ""}
          </p>
        </div>
        {editing ? (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const v = Number(draft);
              if (!Number.isNaN(v)) walletActions.setUsage(card.id, credit.id, s.periodKey, Math.min(v, credit.amountPerPeriod));
              setEditing(false);
            }}
          >
            <input
              autoFocus
              type="number"
              min={0}
              step="0.01"
              max={credit.amountPerPeriod}
              className="input w-24"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              aria-label="Amount used"
            />
            <button className="btn-primary px-3">Save</button>
          </form>
        ) : (
          <>
            {full ? (
              <button className="btn-ghost px-3" onClick={() => walletActions.setUsage(card.id, credit.id, s.periodKey, 0)} title="Reset this period">
                <RotateCcw className="h-4 w-4" /> Undo
              </button>
            ) : (
              <button
                className="btn-primary px-3"
                disabled={s.ignored}
                onClick={() => walletActions.setUsage(card.id, credit.id, s.periodKey, credit.amountPerPeriod)}
              >
                <CheckCircle2 className="h-4 w-4" /> Used
              </button>
            )}
            <button
              className="btn-secondary px-3"
              disabled={s.ignored}
              onClick={() => {
                setDraft(String(s.used || ""));
                setEditing(true);
              }}
            >
              Partial
            </button>
          </>
        )}
        <button
          className="grid h-9 w-9 place-items-center rounded text-ink-3 hover:bg-canvas hover:text-ink"
          onClick={() => walletActions.toggleIgnored(card.id, credit.id)}
          title={s.ignored ? "Track this credit" : "Ignore this credit (excluded from totals)"}
          aria-label={s.ignored ? "Track this credit" : "Ignore this credit"}
        >
          {s.ignored ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
        </button>
      </div>
    </li>
  );
}

function BackupButtons({ wallet }: { wallet: WalletState }) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        className="btn-ghost"
        title="Download a backup of your wallet"
        onClick={() => {
          const blob = new Blob([JSON.stringify(wallet, null, 2)], { type: "application/json" });
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = `perkfolio-wallet-${new Date().toISOString().slice(0, 10)}.json`;
          a.click();
          URL.revokeObjectURL(a.href);
        }}
      >
        <Download className="h-4 w-4" /> Export
      </button>
      <button className="btn-ghost" onClick={() => fileRef.current?.click()} title="Restore from a backup file">
        <Upload className="h-4 w-4" /> Import
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          try {
            const parsed = JSON.parse(await f.text()) as WalletState;
            if (Array.isArray(parsed.cards) && typeof parsed.usage === "object") walletActions.importState(parsed);
            else alert("That file doesn't look like a Perkfolio backup.");
          } catch {
            alert("Couldn't read that file.");
          }
          e.target.value = "";
        }}
      />
    </>
  );
}
