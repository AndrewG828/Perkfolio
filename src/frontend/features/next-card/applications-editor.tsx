"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, History, Pencil, Plus, Trash2, Wand2, X } from "lucide-react";
import { cards, getCard, issuers } from "@/shared/data/cards";
import { ISSUERS } from "@/shared/data/strategy/programs";
import { NAMED_PRODUCTS, namedProduct, namedProductFor } from "@/shared/data/strategy/other-products";
import { MonthInput } from "@/frontend/components/month-input";
import { walletActions, type CardApplication, type WalletState } from "@/frontend/state/wallet-store";
import { accountHistory, dropOffDate, type NewCardCount } from "@/shared/lib/eligibility";
import { NO_BONUS } from "@/shared/lib/wallet";
import { formatDate, formatDateOrMonth, formatMonth, isoDate } from "@/shared/lib/dates";
import { WALLET_LIMITS, cleanLabel, notBefore } from "@/shared/lib/wallet-schema";
import { cn } from "@/shared/lib/format";

const OTHER = "__other";
const OTHER_ISSUER = "__other-issuer";
/** Select value for a card issuer rules name that we don't list (see shared/data/strategy/other-products). */
const NAMED = "named:";
const NAMED_ISSUERS = [...new Set(NAMED_PRODUCTS.map((p) => p.issuer))];

/** The welcome bonus as the form asks it: not sure (not recorded), no bonus, or earned in a month. */
type BonusAnswer = "" | "none" | "earned";

interface Draft {
  cardId: string;
  name: string;
  issuer: string;
  issuerOther: string;
  business: boolean;
  authorizedUser: boolean;
  opened: string;
  closed: string;
  bonus: BonusAnswer;
  bonusEarned: string;
}

const EMPTY_DRAFT: Draft = {
  cardId: "",
  name: "",
  issuer: "",
  issuerOther: "",
  business: false,
  authorizedUser: false,
  opened: "",
  closed: "",
  bonus: "",
  bonusEarned: "",
};

const bonusAnswerOf = (b: string | undefined): BonusAnswer => (b === NO_BONUS ? "none" : b ? "earned" : "");

function draftOf(a: CardApplication): Draft {
  const known = a.cardId ? getCard(a.cardId) : undefined;
  const listed = ISSUERS.includes(a.issuer);
  const named = known ? undefined : namedProductFor(a.name, a.issuer);
  const common = {
    authorizedUser: Boolean(a.authorizedUser),
    opened: a.opened,
    closed: a.closed ?? "",
    bonus: bonusAnswerOf(a.bonusEarned),
    bonusEarned: a.bonusEarned && a.bonusEarned !== NO_BONUS ? a.bonusEarned : "",
  };
  if (named) return { ...EMPTY_DRAFT, ...common, cardId: NAMED + named.key };
  return {
    ...common,
    cardId: known ? known.id : OTHER,
    name: known ? "" : (a.name ?? ""),
    issuer: known ? "" : listed ? a.issuer : OTHER_ISSUER,
    issuerOther: known || listed ? "" : a.issuer,
    business: a.business,
  };
}

/** A history date after today: a month after this month, or a day after today. */
const isFuture = (date: string, todayIso: string) => (date.length >= 10 ? date > todayIso : date > todayIso.slice(0, 7));

/** The bonus answer as stored: a month, NO_BONUS, or nothing (not recorded); or an error message. */
function bonusValue(answer: BonusAnswer, month: string, opened: string, todayIso: string): { bonusEarned?: string } | string {
  if (answer === "none") return { bonusEarned: NO_BONUS };
  if (answer !== "earned") return {};
  if (!month) return "Add the month the bonus posted, or choose “Not sure”.";
  if (isFuture(month, todayIso)) return "The bonus month can't be in the future.";
  if (opened && !notBefore(month, opened)) return "The bonus month is before the opening month.";
  return { bonusEarned: month };
}

/** Turns the form into an application, or an error message. */
function toApplication(d: Draft, todayIso: string): Omit<CardApplication, "id"> | string {
  const named = d.cardId.startsWith(NAMED) ? namedProduct(d.cardId.slice(NAMED.length)) : undefined;
  const known = d.cardId && d.cardId !== OTHER && !named ? getCard(d.cardId) : undefined;
  if (!d.cardId) return "Choose a card, or Other for one we don't list.";
  if (!d.opened) return "Add the month you opened it.";
  if (isFuture(d.opened, todayIso)) return "The opening date can't be in the future.";
  if (d.closed && isFuture(d.closed, todayIso)) return "The closing date can't be in the future.";
  if (d.closed && !notBefore(d.closed, d.opened)) return "The closing date is before the opening date.";
  const bonus = bonusValue(d.bonus, d.bonusEarned, d.opened, todayIso);
  if (typeof bonus === "string") return bonus;
  const base = {
    opened: d.opened,
    ...(d.closed ? { closed: d.closed } : {}),
    ...bonus,
    ...(d.authorizedUser ? { authorizedUser: true as const } : {}),
  };
  if (known) return { issuer: known.issuer, cardId: known.id, business: known.category === "business", ...base };
  if (named) return { issuer: named.issuer, name: named.name, business: named.business, ...base };
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
  // A link to `#history-<id>` (the next-card page's "Update your card history" for a card a rule needs a date or a
  // bonus month for) opens that entry's form.
  const ids = useRef(new Set<string>());
  useEffect(() => {
    ids.current = new Set(apps.map((a) => a.id));
  }, [apps]);
  useEffect(() => {
    const open = () => {
      const hash = decodeURIComponent(window.location.hash.slice(1));
      const appId = hash.startsWith("history-") ? hash.slice("history-".length) : "";
      if (!ids.current.has(appId)) return;
      setEditing(appId);
      requestAnimationFrame(() => document.getElementById(hash)?.scrollIntoView({ block: "center" }));
    };
    open();
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, []);
  const close = () => {
    setEditing(null);
    // So the same link opens the form again next time (the hash has to change for that).
    if (window.location.hash.startsWith("#history-")) window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#history`);
  };
  const fromWallet = accountHistory(wallet).filter((r) => r.source === "wallet");
  const started = Array.isArray(wallet.applications);
  const todayIso = isoDate(today);

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
              Every card you&apos;ve opened, including closed ones, cards we don&apos;t list and cards you&apos;re an authorized user on.
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
          todayIso={todayIso}
          onCancel={() => setEditing(null)}
          onSave={(a) => {
            const ok = walletActions.addApplication(a);
            if (ok) setEditing(null);
            return ok;
          }}
        />
      )}

      {fromWallet.length > 0 && <WalletPrefill records={fromWallet} wallet={wallet} todayIso={todayIso} />}

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
              <li key={a.id} id={`history-${a.id}`} className="scroll-mt-28">
                <ApplicationForm
                  todayIso={todayIso}
                  initial={draftOf(a)}
                  onCancel={close}
                  onSave={(next) => {
                    const ok = walletActions.updateApplication({ ...next, id: a.id });
                    if (ok) close();
                    return ok;
                  }}
                />
              </li>
            ) : (
              <ApplicationRow key={a.id} app={a} counter={counter} todayIso={todayIso} onEdit={() => setEditing(a.id)} />
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

/** Whether and how a history entry counts toward 5/24, in a few words. */
function fiveTwentyFourLabel(app: CardApplication, counter: NewCardCount, todayIso: string): { text: string; counts: boolean } {
  const rule = `${counter.limit}/${counter.months}`;
  const counted = counter.counted.find((c) => c.record.key === app.id);
  if (counted) {
    const drops = `drops off ${formatDate(counted.dropOff)}`;
    if (app.business) return { text: `Shows on your personal report: counts toward ${rule} · ${drops}`, counts: true };
    if (app.authorizedUser) return { text: `Authorized-user cards count toward ${rule} · ${drops}`, counts: true };
    return { text: `Counts toward ${rule} · ${drops}`, counts: true };
  }
  // Inside the window but not counted: a business card that doesn't show on personal credit reports.
  if (dropOffDate(app.opened, counter.months, true) > todayIso && app.business) {
    return { text: `Business card that doesn't show on personal reports: doesn't count toward ${rule}`, counts: false };
  }
  return { text: `Past the ${counter.months}-month window for ${rule}`, counts: false };
}

function ApplicationRow({ app, counter, todayIso, onEdit }: { app: CardApplication; counter: NewCardCount; todayIso: string; onEdit: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const card = app.cardId ? getCard(app.cardId) : undefined;
  const name = card?.name ?? app.name ?? "Card";
  const label = fiveTwentyFourLabel(app, counter, todayIso);
  const bonus = app.bonusEarned === NO_BONUS ? "no bonus" : app.bonusEarned ? `bonus earned ${formatMonth(app.bonusEarned)}` : "bonus not recorded";
  return (
    <li id={`history-${app.id}`} className="grid scroll-mt-28 grid-cols-[minmax(0,1fr)_auto] items-start gap-3 px-5 py-4 sm:items-center">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2">
          {card ? (
            <Link href={`/cards/${card.id}`} className="inline-flex min-h-8 items-center font-semibold text-navy hover:text-brand sm:min-h-0">
              {name}
            </Link>
          ) : (
            <span className="font-semibold text-ink">{name}</span>
          )}
          {app.business && <span className="chip py-0.5">Business</span>}
          {app.authorizedUser && <span className="chip py-0.5">Authorized user</span>}
          {app.closed && <span className="chip py-0.5">Closed {formatDateOrMonth(app.closed)}</span>}
        </p>
        <p className="mt-1 text-sm text-ink-2">
          {app.issuer} · opened {formatDateOrMonth(app.opened)} · <span className={cn(!app.bonusEarned && "text-ink-3")}>{bonus}</span>
        </p>
        <p className={cn("mt-1 text-xs", label.counts ? "font-medium text-warn" : "text-ink-3")}>{label.text}</p>
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
            <button className="btn-ghost min-h-10 px-2 py-1.5 text-xs sm:min-h-0 sm:px-3" onClick={onEdit} aria-label={`Edit ${name}`}>
              <Pencil className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Edit</span>
            </button>
            <button
              className="grid h-10 w-10 place-items-center rounded text-ink-3 hover:bg-canvas hover:text-danger sm:h-8 sm:w-8"
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

/** "Bonus earned?": not sure (rules that depend on it say so), no bonus, or the month it posted. */
function BonusInput({
  label,
  answer,
  month,
  todayIso,
  onChange,
  className,
}: {
  label: string;
  answer: BonusAnswer;
  month: string;
  todayIso: string;
  onChange: (answer: BonusAnswer, month: string) => void;
  className?: string;
}) {
  return (
    <span className={cn("flex flex-wrap gap-2", className)}>
      <select
        className="input w-auto min-w-0 flex-1 basis-32 sm:flex-none"
        value={answer}
        onChange={(e) => onChange(e.target.value as BonusAnswer, month)}
        aria-label={`${label}: earned?`}
      >
        <option value="">Not sure</option>
        <option value="none">No bonus</option>
        <option value="earned">Earned it in…</option>
      </select>
      {answer === "earned" && (
        // A fixed basis (the selects inside are full width) lets the month sit beside the answer when there's room.
        <MonthInput
          label={label}
          value={month}
          maxYear={Number(todayIso.slice(0, 4))}
          max={todayIso}
          className="min-w-0 flex-1 basis-52"
          onChange={(m) => onChange("earned", m)}
        />
      )}
    </span>
  );
}

function ApplicationForm({
  initial = EMPTY_DRAFT,
  todayIso,
  onSave,
  onCancel,
}: {
  initial?: Draft;
  todayIso: string;
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
  const year = Number(todayIso.slice(0, 4));
  return (
    <form
      className="space-y-4 border-b border-line bg-canvas/60 px-5 py-5"
      onSubmit={(e) => {
        e.preventDefault();
        const a = toApplication(d, todayIso);
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
            {NAMED_ISSUERS.map((issuer) => (
              <optgroup key={`named-${issuer}`} label={`${issuer}: other cards issuer rules check`}>
                {NAMED_PRODUCTS.filter((p) => p.issuer === issuer).map((p) => (
                  <option key={p.key} value={NAMED + p.key}>
                    {p.name}
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
            <label className="flex min-h-10 items-center gap-2 text-sm font-medium text-ink">
              <input type="checkbox" className="h-4 w-4 accent-[var(--color-brand)]" checked={d.business} onChange={(e) => set({ business: e.target.checked })} />
              Business card
            </label>
          </>
        )}
        <label className={cn("flex min-h-10 items-start gap-2 text-sm text-ink", !other && "md:col-span-2")}>
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-[var(--color-brand)]"
            checked={d.authorizedUser}
            onChange={(e) => set({ authorizedUser: e.target.checked })}
          />
          <span>
            <span className="font-medium">I&apos;m an authorized user on this card</span>{" "}
            <span className="text-ink-3">(someone else&apos;s account: it counts toward 5/24, but not as a card you hold)</span>
          </span>
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1 text-sm">
          <p className="font-medium text-ink">
            Opened <span className="font-normal text-ink-3">(day optional)</span>
          </p>
          <MonthInput label="Opened" withDay value={d.opened} maxYear={year} max={todayIso} onChange={(opened) => set({ opened })} />
        </div>
        <div className="space-y-1 text-sm">
          <p className="font-medium text-ink">
            Closed <span className="font-normal text-ink-3">(if closed)</span>
          </p>
          <MonthInput label="Closed" optional withDay value={d.closed} maxYear={year} max={todayIso} onChange={(closed) => set({ closed })} />
        </div>
        <div className="space-y-1 text-sm sm:col-span-2">
          <p className="font-medium text-ink">
            Welcome bonus{" "}
            <span className="font-normal text-ink-3">(rules like Capital One&apos;s 48 months and Chase&apos;s 24 months need it)</span>
          </p>
          <BonusInput label="Bonus" answer={d.bonus} month={d.bonusEarned} todayIso={todayIso} onChange={(bonus, bonusEarned) => set({ bonus, bonusEarned })} />
        </div>
      </div>
      <p className="text-xs text-ink-3">
        The day is optional, but some issuers count in days (Citi&apos;s 8 and 65, Amex&apos;s 5 and 90, Chase&apos;s 30), and
        with only a month we may not be able to tell whether a recent card is inside the window.
      </p>
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

/**
 * Wallet cards that aren't in the history yet, each a click away from being added: the open month (prefilled from
 * the tracker's open dates) and whether the welcome bonus was earned, since bonus rules depend on it.
 */
function WalletPrefill({ records, wallet, todayIso }: { records: ReturnType<typeof accountHistory>; wallet: WalletState; todayIso: string }) {
  const [months, setMonths] = useState<Record<string, string>>({});
  const [bonuses, setBonuses] = useState<Record<string, { answer: BonusAnswer; month: string }>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const monthFor = (cardId: string) => months[cardId] ?? wallet.openDates?.[cardId] ?? "";
  const bonusFor = (cardId: string) => bonuses[cardId] ?? { answer: "" as BonusAnswer, month: "" };
  const toApp = (cardId: string): Omit<CardApplication, "id"> | string => {
    const card = getCard(cardId);
    const opened = monthFor(cardId);
    if (!card) return "That card isn't in our list.";
    if (!opened) return "Add the month you opened it.";
    if (isFuture(opened, todayIso)) return "The opening date can't be in the future.";
    const b = bonusFor(cardId);
    const bonus = bonusValue(b.answer, b.month, opened, todayIso);
    if (typeof bonus === "string") return bonus;
    return { issuer: card.issuer, cardId, business: card.category === "business", opened, ...bonus };
  };
  const ready = records.filter((r) => r.cardId && typeof toApp(r.cardId) !== "string");
  const year = Number(todayIso.slice(0, 4));
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
            onClick={() => walletActions.addApplications(ready.map((r) => toApp(r.cardId!)).filter((a): a is Omit<CardApplication, "id"> => typeof a !== "string"))}
          >
            <Plus className="h-3.5 w-3.5" /> Add all {ready.length}
          </button>
        )}
      </div>
      <ul className="mt-3 space-y-2">
        {records.map((r) => {
          const id = r.cardId!;
          const value = monthFor(id);
          const b = bonusFor(id);
          return (
            <li key={r.key} className="rounded-md bg-white p-3 text-sm">
              <p className="font-medium text-ink">{r.name}</p>
              <div className="mt-2 flex flex-wrap items-start gap-x-4 gap-y-2">
                <div className="min-w-0 flex-1 basis-64 space-y-1">
                  <p className="text-xs font-medium text-ink-2">Opened</p>
                  <MonthInput
                    label={`${r.name} opened`}
                    withDay
                    value={value}
                    maxYear={year}
                    max={todayIso}
                    onChange={(m) => {
                      setMonths((x) => ({ ...x, [id]: m }));
                      setErrors((x) => ({ ...x, [id]: "" }));
                    }}
                  />
                </div>
                <div className="min-w-0 flex-1 basis-80 space-y-1">
                  <p className="text-xs font-medium text-ink-2">Did you earn the welcome bonus? When?</p>
                  <BonusInput
                    label={`${r.name} bonus`}
                    answer={b.answer}
                    month={b.month}
                    todayIso={todayIso}
                    onChange={(answer, month) => {
                      setBonuses((x) => ({ ...x, [id]: { answer, month } }));
                      setErrors((x) => ({ ...x, [id]: "" }));
                    }}
                  />
                </div>
                <button
                  className="btn-primary shrink-0 self-end px-4 py-2.5 text-xs"
                  disabled={!value}
                  onClick={() => {
                    const a = toApp(id);
                    if (typeof a === "string") setErrors((x) => ({ ...x, [id]: a }));
                    else walletActions.addApplication(a);
                  }}
                >
                  <Plus className="h-3.5 w-3.5" /> Add
                </button>
              </div>
              {errors[id] && (
                <p className="mt-2 text-xs font-medium text-danger" role="alert">
                  {errors[id]}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs text-ink-3">
        Open dates you set in the tracker fill in automatically. &ldquo;Not sure&rdquo; about a bonus is fine: rules that depend
        on it will say so.
      </p>
    </div>
  );
}
