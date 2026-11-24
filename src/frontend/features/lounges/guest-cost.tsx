"use client";

import Link from "next/link";
import { useEffect, useId, useState, useSyncExternalStore } from "react";
import { Minus, Plus, Trophy, Users } from "lucide-react";
import type { Card, LoungeNetwork } from "@/shared/data/types";
import { getCard } from "@/shared/data/cards";
import { loungeNetworks } from "@/shared/data/networks";
import { loungeGuestRules } from "@/shared/data/travel/lounge-guest-rules";
import { seedData } from "@/shared/data/travel/seed-status";
import { cardsWithRules, effectLabel, guestCosts, networksWithRules, unlockLabel, visitsLabel, type GuestCostOption } from "@/shared/lib/guest-cost";
import { shortCardName } from "@/shared/lib/card-name";
import { noteList } from "@/shared/lib/travel-format";
import { cn, usd } from "@/shared/lib/format";
import { CardArt } from "@/frontend/components/card-art";
import { useHydrated, useWallet } from "@/frontend/state/wallet-store";

/**
 * Guest count and "spend threshold reached" toggles, shared by every guest calculator on the page, so setting
 * "2 guests" once applies to each lounge. Kept in memory only.
 */
interface GuestPrefs {
  guests: number;
  reached: ReadonlySet<string>;
  touched: boolean;
}
let prefs: GuestPrefs = { guests: 1, reached: new Set(), touched: false };
const listeners = new Set<() => void>();
const setPrefs = (next: Partial<GuestPrefs>) => {
  prefs = { ...prefs, ...next, touched: true };
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
const SERVER_PREFS: GuestPrefs = { guests: 1, reached: new Set(), touched: false };

export const MAX_GUESTS = 8;

function useGuestPrefs(initialGuests?: number) {
  const p = useSyncExternalStore(
    subscribe,
    () => prefs,
    () => SERVER_PREFS,
  );
  useEffect(() => {
    // A link such as /lounges/JFK?guests=2 sets the count, unless the visitor already changed it on this page.
    if (initialGuests !== undefined && !prefs.touched && prefs.guests !== initialGuests) {
      prefs = { ...prefs, guests: Math.max(0, Math.min(MAX_GUESTS, initialGuests)) };
      listeners.forEach((l) => l());
    }
  }, [initialGuests]);
  return p;
}

/**
 * The page's guest count and reached thresholds, once a visitor has set a count (by link, e.g. ?guests=2, or in any
 * guest calculator); null before that. Lounge rows use it for their one-line guest summary.
 */
export function useGuestCount(initialGuests?: number): { guests: number; reached: ReadonlySet<string> } | null {
  const p = useGuestPrefs(initialGuests);
  if (!p.touched && initialGuests === undefined) return null;
  return { guests: p.touched ? p.guests : (initialGuests ?? p.guests), reached: p.reached };
}

const networkLabel = (n: LoungeNetwork) => loungeNetworks[n]?.short ?? n;

/** "Free", "$90" or "Fee varies" for an option's guest cost. */
export const costText = (o: GuestCostOption) => (o.costUsd === null ? "Fee varies" : o.costUsd === 0 ? "Free" : usd(o.costUsd));

/**
 * What bringing guests into a lounge costs with each card, and the card to use. Self-contained: give it the lounge's
 * networks and, optionally, the cards to compare (by default the wallet's).
 */
export function GuestCost({
  networks,
  cardIds,
  initialGuests,
  compact = false,
}: {
  /** Networks the lounge can be entered through (e.g. networksFor(lounge)). */
  networks: LoungeNetwork[];
  /** Cards to compare. Defaults to the cards in the wallet. */
  cardIds?: string[];
  initialGuests?: number;
  compact?: boolean;
}) {
  const id = useId();
  const hydrated = useHydrated();
  const wallet = useWallet();
  const { guests, reached } = useGuestPrefs(initialGuests);
  const ids = cardIds ?? (hydrated ? wallet.cards : []);
  const { options, best, missing } = guestCosts(loungeGuestRules, ids, networks, guests, reached);
  const missingCards = missing
    .map(getCard)
    .filter((c): c is Card => Boolean(c))
    .map((c) => ({ card: c, terms: c.loungeAccess.filter((a) => networks.includes(a.network)) }))
    .filter((m) => m.terms.length > 0);
  const unlocks = Array.from(
    new Map(options.flatMap((o) => o.unlocks.map((u) => [u.key, { ...u, cardId: o.cardId }] as const))).values(),
  );
  const fallback = loungeGuestRules.networkDefaults.find((d) => networks.includes(d.network) && d.guestFeeUsd !== null);
  // When every card costs the same, no card is "best".
  const allTied = options.length < 2 || options.every((o) => o.costUsd === options[0].costUsd);
  const waiting = cardIds === undefined && !hydrated;

  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2" role="group" aria-labelledby={`${id}-guests-label`}>
          <span id={`${id}-guests-label`} className="flex items-center gap-1.5 text-sm font-semibold text-ink">
            <Users className="h-4 w-4 text-brand" aria-hidden /> Guests
          </span>
          <span className="flex items-center rounded-md border border-line bg-white">
            <button
              type="button"
              className="grid h-9 w-9 place-items-center text-navy hover:bg-sky disabled:opacity-40"
              onClick={() => setPrefs({ guests: Math.max(0, guests - 1) })}
              disabled={guests <= 0}
              aria-label="One guest fewer"
            >
              <Minus className="h-4 w-4" />
            </button>
            <output className="w-8 text-center text-sm font-semibold text-navy tabular-nums" aria-live="polite" aria-label={`${guests} guests`}>
              {guests}
            </output>
            <button
              type="button"
              className="grid h-9 w-9 place-items-center text-navy hover:bg-sky disabled:opacity-40"
              onClick={() => setPrefs({ guests: Math.min(MAX_GUESTS, guests + 1) })}
              disabled={guests >= MAX_GUESTS}
              aria-label="One more guest"
            >
              <Plus className="h-4 w-4" />
            </button>
          </span>
        </div>
        <p className="text-xs text-ink-3">Adults, per visit. You get in with your card.</p>
      </div>

      {unlocks.length > 0 && (
        <fieldset className="space-y-2">
          <legend className="mb-1 text-xs font-semibold tracking-wide text-ink-3 uppercase">Spend thresholds you&apos;ve reached</legend>
          {unlocks.map((u) => {
            const card = getCard(u.cardId);
            return (
              <label key={u.key} className="flex items-start gap-2 text-sm text-ink-2">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-brand)]"
                  checked={u.reached}
                  onChange={(e) => {
                    const next = new Set(reached);
                    if (e.target.checked) next.add(u.key);
                    else next.delete(u.key);
                    setPrefs({ reached: next });
                  }}
                />
                <span>
                  <span className="font-medium text-ink">{card ? shortCardName(card.name) : u.cardId}</span>: {unlockLabel(u.unlock)}
                  <span className="text-ink-3"> → {effectLabel(u.effect, u.unlock.effect)}</span>
                </span>
              </label>
            );
          })}
        </fieldset>
      )}

      {waiting ? (
        <div className="h-16 animate-pulse rounded-md bg-canvas" />
      ) : options.length === 0 && missingCards.length === 0 ? (
        <p className="rounded-md bg-canvas p-3 text-sm text-ink-2">
          {ids.length === 0 ? (
            <>
              Choose cards, or{" "}
              <Link href="/tracker" className="link">
                add yours to your wallet
              </Link>
              , to compare what guests cost with each.
            </>
          ) : (
            "None of these cards gets you into this lounge network."
          )}
          {fallback && ` Guests usually cost ${usd(fallback.guestFeeUsd ?? 0)} each at ${networkLabel(fallback.network)} lounges.`}
        </p>
      ) : (
        <ol className="space-y-2" aria-label={`Guest cost with each card, for ${guests} guest${guests === 1 ? "" : "s"}`}>
          {options.map((o) => (
            <OptionRow
              key={o.cardId}
              option={o}
              best={Boolean(best) && !allTied && o.costUsd === best?.costUsd}
              guests={guests}
              compact={compact}
              manyNetworks={networks.length > 1}
            />
          ))}
          {missingCards.map(({ card, terms }) => (
            <li key={card.id} className="flex items-start gap-3 rounded-md border border-line bg-white p-3 text-sm">
              <CardArt card={card} size="xs" className="mt-0.5 shrink-0" />
              <span className="min-w-0">
                <span className="font-semibold text-ink">{compact ? shortCardName(card.name) : card.name}</span>
                <span className="block text-xs text-ink-2">{terms[0].terms}</span>
              </span>
            </li>
          ))}
        </ol>
      )}

      {seedData.loungeGuestRules && (
        <p className="text-xs text-ink-3">Preview data while we verify guest rules. Confirm fees with the lounge before you go.</p>
      )}
    </div>
  );
}

/**
 * The lounge finder's guest control: pick a lounge network and see what guests cost with the selected cards
 * (or every card, when the finder isn't checking a wallet).
 */
export function GuestCostFinder({ cardIds, ready }: { cardIds: string[] | "all"; ready: boolean }) {
  const id = useId();
  const all = networksWithRules(loungeGuestRules).filter((n) => loungeNetworks[n]);
  const usable = cardIds === "all" ? all : all.filter((n) => cardIds.some((c) => getCard(c)?.loungeAccess.some((a) => a.network === n)));
  const [picked, setPicked] = useState<LoungeNetwork | null>(null);
  const network = picked && all.includes(picked) ? picked : (usable[0] ?? all[0]);
  if (!network) return null;
  const ids = cardIds === "all" ? cardsWithRules(loungeGuestRules, [network]) : cardIds;
  return (
    <section className="panel space-y-4 p-5" aria-labelledby={`${id}-title`}>
      <div>
        <h2 id={`${id}-title`} className="text-sm font-semibold text-ink">
          Bringing guests?
        </h2>
        <p className="mt-0.5 text-xs text-ink-3">What guests cost with each card, and which card to use.</p>
      </div>
      <div>
        <label htmlFor={`${id}-network`} className="mb-1.5 block text-xs font-semibold tracking-wide text-ink-3 uppercase">
          Lounge network
        </label>
        <select id={`${id}-network`} className="input py-2" value={network} onChange={(e) => setPicked(e.target.value as LoungeNetwork)}>
          {all.map((n) => (
            <option key={n} value={n}>
              {loungeNetworks[n].label}
              {cardIds !== "all" && !usable.includes(n) ? " (no access)" : ""}
            </option>
          ))}
        </select>
      </div>
      {ready ? <GuestCost networks={[network]} cardIds={ids} compact /> : <div className="h-24 animate-pulse rounded-md bg-canvas" />}
    </section>
  );
}

function OptionRow({
  option: o,
  best,
  guests,
  compact,
  manyNetworks,
}: {
  option: GuestCostOption;
  best: boolean;
  guests: number;
  compact: boolean;
  manyNetworks: boolean;
}) {
  const card = getCard(o.cardId);
  const name = card ? (compact ? shortCardName(card.name) : card.name) : o.cardId;
  const cost = costText(o);
  const fee = o.guestFeeUsd === null ? null : usd(o.guestFeeUsd);
  const detail =
    guests === 0
      ? "Just you"
      : o.paidGuests === 0
        ? `${guests === 1 ? "Your guest is" : `All ${guests} guests are`} free`
        : `${o.freeUsed ? `${o.freeUsed} free + ` : ""}${o.paidGuests} × ${fee ?? "a fee set by the lounge"}${o.feeFromNetwork ? " (usual fee)" : ""}`;
  const conditions = noteList(o.rule.conditions);
  const visits = o.visits === "unlimited" ? null : visitsLabel(o.visits);
  return (
    <li className={cn("rounded-md border bg-white p-3", best ? "border-brand ring-1 ring-brand" : "border-line")}>
      <div className="flex items-center gap-3">
        {card && <CardArt card={card} size="xs" className="shrink-0" />}
        <div className="min-w-0 flex-1">
          {best && (
            <p className="eyebrow mb-0.5 flex items-center gap-1 text-[10px]">
              <Trophy className="h-3 w-3" aria-hidden /> {compact ? "Best value" : `Best for ${guests} guest${guests === 1 ? "" : "s"}`}
            </p>
          )}
          <p className="truncate text-sm font-semibold text-ink">{name}</p>
          <p className="text-xs text-ink-2">
            {detail}
            {manyNetworks && <span className="text-ink-3"> · via {networkLabel(o.network)}</span>}
          </p>
        </div>
        <p
          className={cn(
            "shrink-0 text-right text-base font-semibold tabular-nums",
            o.costUsd === 0 ? "text-success" : o.costUsd === null ? "text-ink-3 text-sm" : "text-navy",
          )}
        >
          {cost}
          {o.costUsd !== null && o.costUsd > 0 && <span className="block text-[11px] font-normal text-ink-3">per visit</span>}
        </p>
      </div>
      {!compact && (conditions.length > 0 || visits) && (
        <p className="mt-2 border-t border-line pt-2 text-xs text-ink-3">{[...conditions, ...(visits && !conditions.some((c) => /visit/i.test(c)) ? [visits] : [])].join(" · ")}</p>
      )}
    </li>
  );
}
