"use client";

import Link from "next/link";
import { useEffect, useId, useState, useSyncExternalStore } from "react";
import { Minus, Plus, Trophy, Users } from "lucide-react";
import type { Card, LoungeNetwork } from "@/shared/data/types";
import { getCard } from "@/shared/data/cards";
import { loungeNetworks } from "@/shared/data/networks";
import { loungeGuestRules } from "@/shared/data/travel/lounge-guest-rules";
import { datasetStatus } from "@/shared/data/travel/seed-status";
import {
  cardsWithRules,
  copayText,
  costDetail,
  costLabel,
  effectLabel,
  guestCosts,
  moneyText,
  networksWithRules,
  publishedFees,
  unlockLabel,
  visitsLabel,
  type GuestCostOption,
  type GuestPlace,
} from "@/shared/lib/guest-cost";
import { shortCardName } from "@/shared/lib/card-name";
import { checkTerms } from "@/shared/lib/card-terms";
import { formatIsoMonth, noteList } from "@/shared/lib/travel-format";
import { cn, usd } from "@/shared/lib/format";
import { CardArt } from "@/frontend/components/card-art";
import { SourceLinks } from "@/frontend/components/source-links";
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

/** "Free", "$90", "£70", or why guests can't be priced ("Fee not published", "Not confirmed", "Needs unlock"). */
export const costText = costLabel;

/**
 * What bringing guests into a lounge costs with each card, and the card to use. Self-contained: give it the lounge's
 * networks and, optionally, the cards to compare (by default the wallet's).
 */
export function GuestCost({
  networks,
  cardIds,
  initialGuests,
  place = null,
  compact = false,
}: {
  /** Networks the lounge can be entered through (e.g. networksFor(lounge)). */
  networks: LoungeNetwork[];
  /** Cards to compare. Defaults to the cards in the wallet. */
  cardIds?: string[];
  initialGuests?: number;
  /** The lounge, for rules only some lounges have (Centurion Lounges abroad, Capital One Landings). */
  place?: GuestPlace | null;
  compact?: boolean;
}) {
  const id = useId();
  const hydrated = useHydrated();
  const wallet = useWallet();
  const { guests, reached } = useGuestPrefs(initialGuests);
  const ids = cardIds ?? (hydrated ? wallet.cards : []);
  const { options, best, tied, missing } = guestCosts(loungeGuestRules, ids, networks, guests, reached, place);
  const missingCards = missing
    .map(getCard)
    .filter((c): c is Card => Boolean(c))
    .map((c) => ({ card: c, terms: c.loungeAccess.filter((a) => networks.includes(a.network)) }))
    .filter((m) => m.terms.length > 0);
  // Cards whose passes admit everyone, the cardmember included (Strata Elite at the Admirals Club).
  const passCards = options.filter((o) => o.rule.passesOnly && !o.location?.notAdmitted).map((o) => getCard(o.cardId));
  const passNames = passCards.map((c) => (c ? shortCardName(c.name) : "the card")).join(" and ");
  // At a lounge with its own rules an unlock can give less (1 free guest at a Capital One Landing) or not apply.
  const unlocks = Array.from(
    new Map(
      options.flatMap((o) =>
        o.unlocks.map((u) => [u.key, { ...u, cardId: o.cardId, here: o.location?.covered ? o.location.rule.unlockFreeGuests : undefined }] as const),
      ),
    ).values(),
  );
  // What cards that publish a price charge for guests here, for when no card is chosen.
  const published = networks.map((n) => ({ n, fees: publishedFees(loungeGuestRules, n) })).find((x) => x.fees);
  // Every card tied for the cheapest is marked best; when they all cost the same, none is, and when many tie, one line
  // above the list says so instead of a badge on each.
  const allTied = options.length < 2 || tied.length === options.length;
  const manyTied = !allTied && tied.length > 3;
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
        <p className="text-xs text-ink-3">
          {passCards.length === 0
            ? "Adults, per visit. You get in with your card."
            : `Adults, per visit, besides you. With ${passNames}, you use a pass too.`}
        </p>
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
                  <span className="text-ink-3">
                    {" "}
                    →{" "}
                    {u.here === null
                      ? "not stated to apply at this lounge"
                      : u.here !== undefined && u.effect.freeGuests !== undefined
                        ? `${u.here === 1 ? "1 free guest" : `${u.here} free guests`} here`
                        : effectLabel(u.effect, u.unlock.effect)}
                  </span>
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
          {published?.fees &&
            ` With the cards that publish a price, each extra guest costs ${
              published.fees.low === published.fees.high ? usd(published.fees.low) : `${usd(published.fees.low)} to ${usd(published.fees.high)}`
            } at ${networkLabel(published.n)} lounges.`}
        </p>
      ) : (
        <>
          {manyTied && best && (
            <p className="flex items-center gap-1.5 text-sm text-ink-2">
              <Trophy className="h-4 w-4 shrink-0 text-brand" aria-hidden />
              <span>
                <strong className={best.cost?.amount === 0 && !best.copay ? "text-success" : "text-navy"}>{costLabel(best)}</strong> with{" "}
                {tied.length} of these {options.length} cards{best.copay ? `, plus ${copayText(best)}` : ""}
              </span>
            </p>
          )}
          <ol className="space-y-2" aria-label={`Guest cost with each card, for ${guests} guest${guests === 1 ? "" : "s"}`}>
            {options.map((o) => (
              <OptionRow
                key={o.cardId}
                option={o}
                best={!allTied && !manyTied && tied.includes(o)}
                guests={guests}
                compact={compact}
                manyNetworks={networks.length > 1}
              />
            ))}
            {missingCards.map(({ card, terms }) => {
              const checked = checkTerms(card.id, terms[0].network, terms[0].terms);
              return (
                <li key={card.id} className="flex items-start gap-3 rounded-md border border-line bg-white p-3 text-sm">
                  <CardArt card={card} size="xs" className="mt-0.5 shrink-0" />
                  <span className="min-w-0">
                    <span className="font-semibold text-ink">{compact ? shortCardName(card.name) : card.name}</span>
                    <span className="block text-xs text-ink-2">{checked.text}</span>
                    {checked.notes.length > 0 && <span className="mt-0.5 block text-xs text-ink-3">{checked.notes.join(" ")}</span>}
                  </span>
                </li>
              );
            })}
          </ol>
        </>
      )}

      <GuestRulesNote />
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
  // With no cards picked (an empty wallet), show every card's guest rules rather than a list of "no access".
  const everyCard = cardIds === "all" || cardIds.length === 0;
  // A network counts as usable when the card's own data or its guest rules give access (the rules can be newer).
  const opens = (cardId: string, n: LoungeNetwork) =>
    Boolean(getCard(cardId)?.loungeAccess.some((a) => a.network === n)) ||
    loungeGuestRules.cards.some((r) => r.cardId === cardId && r.access.some((a) => a.network === n));
  const usable = everyCard ? all : all.filter((n) => cardIds.some((c) => opens(c, n)));
  const [picked, setPicked] = useState<LoungeNetwork | null>(null);
  const network = picked && all.includes(picked) ? picked : (usable[0] ?? all[0]);
  if (!network) return null;
  const ids = everyCard ? cardsWithRules(loungeGuestRules, [network]) : cardIds;
  return (
    <section className="panel space-y-4 p-5" aria-labelledby={`${id}-title`}>
      <div>
        <h2 id={`${id}-title`} className="text-sm font-semibold text-ink">
          Bringing guests?
        </h2>
        <p className="mt-0.5 text-xs text-ink-3">
          What guests cost with each card, and which card to use
          {cardIds !== "all" && cardIds.length === 0 ? ". Showing every card until you add yours." : "."}
        </p>
      </div>
      <div>
        <label htmlFor={`${id}-network`} className="mb-1.5 block text-xs font-semibold tracking-wide text-ink-3 uppercase">
          Lounge network
        </label>
        <select id={`${id}-network`} className="input py-2" value={network} onChange={(e) => setPicked(e.target.value as LoungeNetwork)}>
          {all.map((n) => (
            <option key={n} value={n}>
              {loungeNetworks[n].label}
              {!everyCard && !usable.includes(n) ? " (no access)" : ""}
            </option>
          ))}
        </select>
      </div>
      {ready ? <GuestCost networks={[network]} cardIds={ids} compact /> : <div className="h-24 animate-pulse rounded-md bg-canvas" />}
      {locationHint(network) && <p className="text-xs text-ink-3">{locationHint(network)} Open a lounge&apos;s guest cost on its airport page to see them.</p>}
    </section>
  );
}

/** Which lounges of a network have their own guest rules, in words ("Some Centurion lounges abroad ..."). */
function locationHint(network: LoungeNetwork): string | null {
  const rules = loungeGuestRules.locationRules?.filter((l) => l.network === network) ?? [];
  if (rules.length === 0) return null;
  const named = rules.find((l) => l.loungeName)?.loungeName;
  return named
    ? `${networkLabel(network)} ${named}s have their own guest rules.`
    : `Some ${networkLabel(network)} lounges abroad have their own guest rules or prices.`;
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
  const cost = costLabel(o);
  const detail = costDetail(o, guests);
  const child = o.childFee !== null && guests > 0 && !o.locked && o.cost !== null ? ` · child rate ${moneyText(o.childFee)}` : "";
  const free = o.cost?.amount === 0 && !o.copay;
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
            {child}
            {manyNetworks && <span className="text-ink-3"> · via {networkLabel(o.network)}</span>}
          </p>
        </div>
        <p
          className={cn(
            "max-w-[7.5rem] shrink-0 text-right text-base font-semibold tabular-nums",
            free ? "text-success" : o.cost === null && o.unpriced !== "passes" ? "text-sm text-ink-3" : "text-navy",
          )}
        >
          {cost}
          {o.copay && o.cost !== null ? (
            <span className="block text-[11px] font-normal text-ink-3">+ {moneyText(o.copay)} co-pay</span>
          ) : (
            o.cost !== null && o.cost.amount > 0 && <span className="block text-[11px] font-normal text-ink-3">per visit</span>
          )}
        </p>
      </div>
      <RulesDetails option={o} />
    </li>
  );
}

/** The full rules behind an option: child rate, visit limit, conditions, local-currency notes, unlocks and sources. */
function RulesDetails({ option: o }: { option: GuestCostOption }) {
  const rules = loungeGuestRules.cards.find((c) => c.cardId === o.cardId);
  const network = loungeGuestRules.networkDefaults.find((d) => d.network === o.network);
  const visits = o.visits === "unlimited" ? null : visitsLabel(o.visits, o.rule.passesOnly);
  const here = o.location;
  const limit = o.rule.guestLimit;
  const lines = [
    here?.covered ? `At this lounge: ${here.rule.notes}` : null,
    here?.notAdmitted ? `This lounge doesn't admit this card. ${here.rule.notes}` : null,
    here && !here.covered && !here.notAdmitted
      ? `This lounge has its own guest rules, which aren't stated for this card. For other cards: ${here.rule.notes}`
      : null,
    o.copay ? `Entering through Priority Pass here adds ${copayText(o)}.` : null,
    o.unlockIgnored ? "The spend unlock isn't stated to apply at this lounge, so it isn't counted here." : null,
    o.childFee !== null && !(here && !here.covered) ? `Child guests: ${moneyText(o.childFee)} each (the age band is in the notes).` : null,
    limit && !(here && !here.covered)
      ? `Up to ${limit.max} guest${limit.max === 1 ? "" : "s"} per visit${limit.beyond ? `, or ${limit.beyond}${limit.beyondFree ? " (also free)" : ""}` : ""}.`
      : null,
    o.rule.guestPasses ? `Guests can also use ${o.rule.guestPasses}.` : null,
    visits ? `${visits}.` : o.visits === null ? "Visit limit not confirmed." : null,
    ...noteList(o.rule.conditions),
    ...noteList(o.rule.notes),
    ...o.unlocks.map((u) => `After ${unlockLabel(u.unlock)}: ${typeof u.unlock.effect === "string" ? u.unlock.effect : effectLabel(u.effect)}`),
    ...(o.unpriced === "unpublished" ? noteList(network?.notes).map((n) => `${networkLabel(o.network)}: ${n}`) : []),
  ].filter((l): l is string => Boolean(l));
  const sources = Array.from(
    new Set([...(here ? here.rule.sources : []), ...(rules?.sources ?? []), ...(o.unpriced === "unpublished" ? (network?.sources ?? []) : [])]),
  );
  if (lines.length === 0 && sources.length === 0) return null;
  return (
    <details className="mt-2 border-t border-line pt-2 text-xs text-ink-3">
      <summary className="cursor-pointer font-medium text-brand">Rules and fees</summary>
      <div className="mt-1.5 space-y-1.5 leading-relaxed">
        {lines.map((l) => (
          <p key={l}>{l}</p>
        ))}
        <p className="flex flex-wrap gap-x-2 gap-y-1">
          {rules?.asOf && <span>Issuer terms as of {formatIsoMonth(rules.asOf)}:</span>}
          <SourceLinks sources={sources} max={3} />
        </p>
      </div>
    </details>
  );
}

/** Where the guest rules come from, and the dataset's status. */
function GuestRulesNote() {
  const status = datasetStatus.loungeGuestRules;
  if (status === "seed") return <p className="text-xs text-ink-3">Preview data while we verify guest rules. Confirm fees with the lounge before you go.</p>;
  return (
    <p className="text-xs text-ink-3">
      {typeof status === "object" ? `Partly verified: ${status.partial} ` : ""}
      From the card issuers&apos; terms{loungeGuestRules.asOf ? `, checked ${formatIsoMonth(loungeGuestRules.asOf)}` : ""}. Lounges can limit
      guests or turn them away when full, so confirm before you go.
    </p>
  );
}
