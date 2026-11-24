"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Check, History, Pencil, Plus, Trash2, Wand2, X } from "lucide-react";
import { cards, getCard, issuers } from "@/shared/data/cards";
import { ISSUERS } from "@/shared/data/strategy/programs";
import { MonthInput } from "@/frontend/components/month-input";
import { walletActions, type CardApplication, type WalletState } from "@/frontend/state/wallet-store";
import { accountHistory, type NewCardCount } from "@/shared/lib/eligibility";
import { formatDate, formatMonth } from "@/shared/lib/dates";
import { WALLET_LIMITS, cleanLabel } from "@/shared/lib/wallet-schema";
import { cn } from "@/shared/lib/format";

const OTHER = "__other";
const OTHER_ISSUER = "__other-issuer";

interface Draft {
  cardId: string;
  name: string;
  issuer: string;
  issuerOther: string;
  business: boolean;
  opened: string;
  closed: string;
  bonusEarned: string;
}

const EMPTY_DRAFT: Draft = { cardId: "", name: "", issuer: "", issuerOther: "", business: false, opened: "", closed: "", bonusEarned: "" };

function draftOf(a: CardApplication): Draft {
  const known = a.cardId ? getCard(a.cardId) : undefined;
  const listed = ISSUERS.includes(a.issuer);
  return {
    cardId: known ? known.id : OTHER,
    name: known ? "" : (a.name ?? ""),
    issuer: known ? "" : listed ? a.issuer : OTHER_ISSUER,
    issuerOther: known || listed ? "" : a.issuer,
    business: a.business,
    opened: a.opened,
    closed: a.closed ?? "",
    bonusEarned: a.bonusEarned ?? "",
  };
}

/** Turns the form into an application, or an error message. */
function toApplication(d: Draft): Omit<CardApplication, "id"> | string {
  const known = d.cardId && d.cardId !== OTHER ? getCard(d.cardId) : undefined;
  if (!d.cardId) return "Choose a card, or Other for one we don't list.";
  if (!d.opened) return "Add the month you opened it.";
  if (d.closed && d.closed < d.opened) return "The closing month is before the opening month.";
  if (d.bonusEarned && d.bonusEarned < d.opened) return "The bonus month is before the opening month.";
  const base = {
    opened: d.opened,
    ...(d.closed ? { closed: d.closed } : {}),
    ...(d.bonusEarned ? { bonusEarned: d.bonusEarned } : {}),
  };
  if (known) return { issuer: known.issuer, cardId: known.id, business: known.category === "business", ...base };
  const name = cleanLabel(d.name);
  const issuer = cleanLabel(d.issuer === OTHER_ISSUER ? d.issuerOther : d.issuer, WALLET_LIMITS.issuer);
  if (!name) return "Add the card's name.";
  if (!issuer) return "Choose who issues it.";
  return { issuer, name, business: d.business, ...base };
}

/**
 * The user's card history: every card they've opened (open or closed, in our dataset or not), which drives issuer
 * rules like Chase 5/24. Offers to fill itself in from the wallet's cards and open dates.
 */
export function ApplicationsEditor({
  wallet,
  today,
  counter,
  id,
}: {
  wallet: WalletState;
  today: Date;
  /** The 5/24 count, to show which cards count and when they drop off. */
  counter: NewCardCount;
  id?: string;
}) {
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const apps = useMemo(() => [...(wallet.applications ?? [])].sort((a, b) => b.opened.localeCompare(a.opened)), [wallet.applications]);
  const fromWallet = accountHistory(wallet).filter((r) => r.source === "wallet");
  const started = Array.isArray(wallet.applications);
  const year = today.getFullYear();

  return (
    <section id={id} className="panel scroll-mt-28 overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-5">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-sky text-brand">
            <History className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-navy">Card history</h2>
            <p className="text-sm text-ink-2">
              Every card you&apos;ve opened, including closed ones and cards we don&apos;t list.
            </p>
          </div>
        </div>
        {editing !== "new" && (
          <button className="btn-primary" onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" /> Add a card
          </button>
        )}
      </header>

      {editing === "new" && (
        <ApplicationForm
          year={year}
          onCancel={() => setEditing(null)}
          onSave={(a) => {
            const ok = walletActions.addApplication(a);
            if (ok) setEditing(null);
            return ok;
          }}
        />
      )}

      {fromWallet.length > 0 && <WalletPrefill records={fromWallet} wallet={wallet} year={year} />}

      {!started && editing !== "new" && (
        <div className="flex flex-col gap-3 bg-canvas/60 px-5 py-4 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="text-ink-2">
            Nothing here yet. Add the cards you&apos;ve opened in the last two years (and any you&apos;ve had from the same
            issuer) so we can check the rules for you.
          </p>
          <button className="btn-ghost shrink-0" onClick={() => walletActions.confirmNoApplications()}>
            <Check className="h-4 w-4" /> I have nothing to add
          </button>
        </div>
      )}

      {apps.length > 0 && (
        <ul className="divide-y divide-line">
          {apps.map((a) =>
            editing === a.id ? (
              <li key={a.id}>
                <ApplicationForm
                  year={year}
                  initial={draftOf(a)}
                  onCancel={() => setEditing(null)}
                  onSave={(next) => {
                    const ok = walletActions.updateApplication({ ...next, id: a.id });
                    if (ok) setEditing(null);
                    return ok;
                  }}
                />
              </li>
            ) : (
              <ApplicationRow key={a.id} app={a} counter={counter} onEdit={() => setEditing(a.id)} />
            ),
          )}
        </ul>
      )}
      {started && apps.length === 0 && editing !== "new" && (
        <p className="px-5 py-4 text-sm text-ink-2">No other cards on record. Add one whenever you open a new card.</p>
      )}
    </section>
  );
}

function ApplicationRow({ app, counter, onEdit }: { app: CardApplication; counter: NewCardCount; onEdit: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const card = app.cardId ? getCard(app.cardId) : undefined;
  const name = card?.name ?? app.name ?? "Card";
  const counted = counter.counted.find((c) => c.record.key === app.id);
  const rule = `${counter.limit}/${counter.months}`;
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 px-5 py-4 sm:items-center">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2">
          {card ? (
            <Link href={`/cards/${card.id}`} className="font-semibold text-navy hover:text-brand">
              {name}
            </Link>
          ) : (
            <span className="font-semibold text-ink">{name}</span>
          )}
          {app.business && <span className="chip py-0.5">Business</span>}
          {app.closed && <span className="chip py-0.5">Closed {formatMonth(app.closed)}</span>}
        </p>
        <p className="mt-1 text-sm text-ink-2">
          {app.issuer} · opened {formatMonth(app.opened)}
          {app.bonusEarned ? ` · bonus earned ${formatMonth(app.bonusEarned)}` : ""}
        </p>
        <p className={cn("mt-1 text-xs", counted ? "font-medium text-warn" : "text-ink-3")}>
          {app.business
            ? `Business card: doesn't count toward ${rule}`
            : counted
              ? `Counts toward ${rule} · drops off ${formatDate(counted.dropOff)}`
              : `Past the ${counter.months}-month window for ${rule}`}
        </p>
      </div>
      <div className={cn("flex items-center justify-end gap-1", confirming && "col-span-2 flex-wrap sm:col-span-1")}>
        {confirming ? (
          <>
            <span className="mr-1 text-sm text-ink-2">Remove this card?</span>
            <button className="btn-secondary px-3 py-1.5 text-xs" onClick={() => walletActions.removeApplication(app.id)}>
              Remove
            </button>
            <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => setConfirming(false)}>
              Keep
            </button>
          </>
        ) : (
          <>
            <button className="btn-ghost px-2 py-1.5 text-xs sm:px-3" onClick={onEdit} aria-label={`Edit ${name}`}>
              <Pencil className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Edit</span>
            </button>
            <button
              className="grid h-8 w-8 place-items-center rounded text-ink-3 hover:bg-canvas hover:text-danger"
              onClick={() => setConfirming(true)}
              aria-label={`Remove ${name}`}
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

function ApplicationForm({
  initial = EMPTY_DRAFT,
  year,
  onSave,
  onCancel,
}: {
  initial?: Draft;
  year: number;
  onSave: (a: Omit<CardApplication, "id">) => boolean;
  onCancel: () => void;
}) {
  const [d, setD] = useState<Draft>(initial);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<Draft>) => {
    setD((x) => ({ ...x, ...patch }));
    setError(null);
  };
  const other = d.cardId === OTHER;
  return (
    <form
      className="space-y-4 border-b border-line bg-canvas/60 px-5 py-5"
      onSubmit={(e) => {
        e.preventDefault();
        const a = toApplication(d);
        if (typeof a === "string") return setError(a);
        if (!onSave(a)) setError("Couldn't save that card. Your history may be full.");
      }}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-1 text-sm md:col-span-2">
          <span className="font-medium text-ink">Card</span>
          <select className="input" value={d.cardId} onChange={(e) => set({ cardId: e.target.value })} required>
            <option value="">Choose a card</option>
            {issuers.map((issuer) => (
              <optgroup key={issuer} label={issuer}>
                {cards
                  .filter((c) => c.issuer === issuer)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </optgroup>
            ))}
            <option value={OTHER}>Another card (not listed)</option>
          </select>
        </label>
        {other && (
          <>
            <label className="space-y-1 text-sm">
              <span className="font-medium text-ink">Card name</span>
              <input
                className="input"
                value={d.name}
                maxLength={WALLET_LIMITS.label}
                placeholder="e.g. AAdvantage Aviator Red"
                onChange={(e) => set({ name: e.target.value })}
              />
            </label>
            <div className="space-y-1 text-sm">
              <label htmlFor="app-issuer" className="font-medium text-ink">
                Issuer
              </label>
              <div className="flex gap-2">
                <select id="app-issuer" className="input min-w-0 flex-1" value={d.issuer} onChange={(e) => set({ issuer: e.target.value })}>
                  <option value="">Choose</option>
                  {ISSUERS.map((i) => (
                    <option key={i} value={i}>
                      {i}
                    </option>
                  ))}
                  <option value={OTHER_ISSUER}>Other</option>
                </select>
                {d.issuer === OTHER_ISSUER && (
                  <input
                    className="input min-w-0 flex-1"
                    value={d.issuerOther}
                    maxLength={WALLET_LIMITS.issuer}
                    placeholder="Bank name"
                    aria-label="Issuer name"
                    onChange={(e) => set({ issuerOther: e.target.value })}
                  />
                )}
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm font-medium text-ink md:col-span-2">
              <input type="checkbox" className="h-4 w-4 accent-[var(--color-brand)]" checked={d.business} onChange={(e) => set({ business: e.target.checked })} />
              Business card
            </label>
          </>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1 text-sm">
          <p className="font-medium text-ink">Opened</p>
          <MonthInput label="Opened" value={d.opened} maxYear={year} onChange={(opened) => set({ opened })} />
        </div>
        <div className="space-y-1 text-sm">
          <p className="font-medium text-ink">
            Closed <span className="font-normal text-ink-3">(if closed)</span>
          </p>
          <MonthInput label="Closed" optional value={d.closed} maxYear={year} onChange={(closed) => set({ closed })} />
        </div>
        <div className="space-y-1 text-sm">
          <p className="font-medium text-ink">
            Bonus earned <span className="font-normal text-ink-3">(blank if none)</span>
          </p>
          <MonthInput label="Bonus earned" optional value={d.bonusEarned} maxYear={year} onChange={(bonusEarned) => set({ bonusEarned })} />
        </div>
      </div>
      {error && (
        <p className="text-sm font-medium text-danger" role="alert">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button className="btn-primary">Save card</button>
        <button type="button" className="btn-ghost" onClick={onCancel}>
          <X className="h-4 w-4" /> Cancel
        </button>
      </div>
    </form>
  );
}

/** Wallet cards that aren't in the history yet, each one click (and maybe a month) away from being added. */
function WalletPrefill({ records, wallet, year }: { records: ReturnType<typeof accountHistory>; wallet: WalletState; year: number }) {
  const [months, setMonths] = useState<Record<string, string>>({});
  const monthFor = (cardId: string) => months[cardId] ?? wallet.openDates?.[cardId]?.slice(0, 7) ?? "";
  const ready = records.filter((r) => r.cardId && monthFor(r.cardId));
  const toApp = (cardId: string): Omit<CardApplication, "id"> | null => {
    const card = getCard(cardId);
    const opened = monthFor(cardId);
    return card && opened ? { issuer: card.issuer, cardId, business: card.category === "business", opened } : null;
  };
  return (
    <div className="border-b border-line bg-sky/50 px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-navy">
          <Wand2 className="h-4 w-4 text-brand" />
          {records.length === 1 ? "1 card in your wallet isn't in your history yet" : `${records.length} cards in your wallet aren't in your history yet`}
        </p>
        {ready.length > 1 && (
          <button
            className="btn-secondary px-3 py-1.5 text-xs"
            onClick={() => walletActions.addApplications(ready.map((r) => toApp(r.cardId!)).filter((a): a is Omit<CardApplication, "id"> => Boolean(a)))}
          >
            <Plus className="h-3.5 w-3.5" /> Add all {ready.length} with a month
          </button>
        )}
      </div>
      <ul className="mt-3 space-y-2">
        {records.map((r) => {
          const id = r.cardId!;
          const value = monthFor(id);
          return (
            <li key={r.key} className="flex flex-col gap-2 rounded-md bg-white p-3 text-sm sm:flex-row sm:items-center">
              <span className="min-w-0 flex-1 font-medium text-ink">{r.name}</span>
              <span className="flex items-center gap-2">
                <span className="hidden text-xs text-ink-3 sm:inline">Opened</span>
                <MonthInput
                  label={`${r.name} opened`}
                  value={value}
                  maxYear={year}
                  className="min-w-0 flex-1 sm:w-56 sm:flex-none"
                  onChange={(m) => setMonths((x) => ({ ...x, [id]: m }))}
                />
                <button
                  className="btn-primary shrink-0 px-3 py-2 text-xs"
                  disabled={!value}
                  onClick={() => {
                    const a = toApp(id);
                    if (a) walletActions.addApplication(a);
                  }}
                >
                  <Plus className="h-3.5 w-3.5" /> Add
                </button>
              </span>
            </li>
          );
        })}
      </ul>
      {records.some((r) => r.cardId && !wallet.openDates?.[r.cardId]) && (
        <p className="mt-2 text-xs text-ink-3">Pick the month you opened each card. Open dates you set in the tracker fill in automatically.</p>
      )}
    </div>
  );
}

