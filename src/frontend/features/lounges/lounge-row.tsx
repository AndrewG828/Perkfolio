"use client";

import { useId, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check, ChevronDown, Info, Navigation, Users, X } from "lucide-react";
import type { Airport, Lounge } from "@/shared/data/types";
import { loungeNetworks } from "@/shared/data/networks";
import { loungeGuestRules } from "@/shared/data/travel/lounge-guest-rules";
import { networksFor, type LoungeAccessGrant } from "@/shared/lib/lounge-access";
import { cardsWithRules, copayText, costLabel, guestCosts, locationRuleFor } from "@/shared/lib/guest-cost";
import { shortCardName } from "@/shared/lib/card-name";
import { checkTerms } from "@/shared/lib/card-terms";
import { getCard } from "@/shared/data/cards";
import { CardArt } from "@/frontend/components/card-art";
import { cn } from "@/shared/lib/format";
import { GuestCost, costText, useGuestCount } from "./guest-cost";

export function LoungeRow({
  lounge,
  airport,
  access,
  checking,
  onDirections,
}: {
  lounge: Lounge;
  airport: Airport;
  access: LoungeAccessGrant[];
  checking: boolean;
  onDirections?: () => void;
}) {
  const net = loungeNetworks[lounge.network];
  const ok = access.length > 0;

  // Guest cost: with the cards that open this lounge, or (when not checking a wallet) every card with guest rules.
  const params = useSearchParams();
  const guestsParam = Number(params.get("guests"));
  const initialGuests = Number.isInteger(guestsParam) && guestsParam > 0 ? guestsParam : undefined;
  const networks = networksFor(lounge);
  const guestCards = checking ? Array.from(new Set(access.map((a) => a.card.id))) : cardsWithRules(loungeGuestRules, networks);
  const canPriceGuests = guestCards.length > 0;
  const [guestsOpen, setGuestsOpen] = useState(false);
  const panelId = `${useId()}-guests`;
  const panel = useRef<HTMLElement>(null);
  // Once a guest count is set (?guests=2, or in any guest calculator on the page), lounges you can enter show the
  // cheapest way to bring them in, one line each.
  const count = useGuestCount(initialGuests);
  const place = { airport: lounge.airportCode, name: lounge.name, notes: lounge.notes };
  const summary = count && ok && count.guests > 0 ? guestCosts(loungeGuestRules, guestCards, networks, count.guests, count.reached, place) : null;
  // Every card tied for cheapest is named ("Free with Platinum or Sapphire Reserve").
  const bestNames = (summary?.tied ?? [])
    .map((o) => getCard(o.cardId))
    .filter((c): c is NonNullable<typeof c> => Boolean(c))
    .map((c) => shortCardName(c.name));
  const named = bestNames.length > 3 ? `${bestNames.slice(0, 2).join(", ")} or ${bestNames.length - 2} more` : bestNames.join(bestNames.length > 2 ? ", " : " or ").replace(/, ([^,]*)$/, " or $1");
  const others = summary ? summary.options.length - summary.tied.length : 0;
  // Why no card can be priced: the likeliest reason across the cards.
  const first = summary?.options[0];
  const why = first?.unpriced;
  const firstCard = first ? getCard(first.cardId) : undefined;
  // The card's terms as the issuer currently words them, and whether this lounge admits it at all (Arlanda).
  const shown = access.map((a) => {
    const checked = checkTerms(a.card.id, a.via, a.terms);
    const local = locationRuleFor(loungeGuestRules, a.via, place);
    // The rule's first sentence says why ("Amex's finder says ... admits only Consumer Platinum cards").
    const barred = local?.notAdmitted?.includes(a.card.id) ? (/^.*?\.(?=\s|$)/.exec(local.notes)?.[0] ?? local.notes) : null;
    return { grant: a, text: checked.text, notes: barred ? [barred, ...checked.notes] : checked.notes };
  });

  return (
    <li
      id={`lounge-${lounge.id}`}
      className={cn(
        "panel scroll-mt-28 overflow-hidden target:ring-2 target:ring-brand",
        checking && !ok && "opacity-75",
      )}
    >
      <div className="flex">
        <span className="w-1.5 shrink-0" style={{ background: net.color }} />
        <div className="min-w-0 flex-1 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <span className="text-xs font-semibold tracking-wide uppercase" style={{ color: net.color }}>
                {net.label}
              </span>
              <h3 className="mt-0.5 text-lg font-semibold text-ink">{lounge.name}</h3>
              <p className="mt-1 text-sm text-ink-2">
                {lounge.terminal}
                {lounge.location ? ` · ${lounge.location}` : ""}
              </p>
              {lounge.notes && <p className="mt-1 text-sm text-ink-3">{lounge.notes}</p>}
              {(onDirections || canPriceGuests) && (
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                  {onDirections && (
                    <button
                      type="button"
                      onClick={onDirections}
                      className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline"
                      aria-label={`Directions to ${lounge.name} at ${airport.code}`}
                    >
                      <Navigation className="h-3.5 w-3.5" /> Directions
                    </button>
                  )}
                  {canPriceGuests && (
                    <button
                      type="button"
                      onClick={() => setGuestsOpen((o) => !o)}
                      className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline"
                      aria-expanded={guestsOpen}
                      aria-controls={panelId}
                    >
                      <Users className="h-3.5 w-3.5" /> Guest cost
                      <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", guestsOpen && "rotate-180")} aria-hidden />
                    </button>
                  )}
                </div>
              )}
            </div>
            {checking && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold",
                  ok ? "bg-success/10 text-success" : "bg-canvas text-ink-3",
                )}
              >
                {ok ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                {ok ? "You have access" : "No access with selected cards"}
              </span>
            )}
          </div>
          {ok && (
            <ul className="mt-4 space-y-2 border-t border-line pt-4">
              {shown.map(({ grant: a, text, notes }) => (
                <li key={a.card.id + a.via} className="flex items-start gap-3 text-sm">
                  <CardArt card={a.card} size="xs" className="mt-0.5 shrink-0" />
                  <span>
                    <span className="font-semibold text-ink">{a.card.name}</span>
                    {a.via !== lounge.network && <span className="text-ink-3"> via {loungeNetworks[a.via].label}</span>}
                    <span className="block text-ink-2">{text}</span>
                    {notes.length > 0 && (
                      <span className="mt-1 flex items-start gap-1.5 text-xs leading-relaxed text-ink-3">
                        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" aria-hidden />
                        <span>{notes.join(" ")}</span>
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {summary && count && !guestsOpen && (
            <button
              type="button"
              onClick={() => {
                setGuestsOpen(true);
                // This button goes away once the panel opens: move focus into the panel.
                requestAnimationFrame(() => panel.current?.focus());
              }}
              aria-controls={panelId}
              aria-expanded={false}
              className="mt-4 flex w-full items-center gap-2 rounded-md bg-sky/60 px-3 py-2.5 text-left text-sm transition-colors hover:bg-sky"
            >
              <Users className="h-4 w-4 shrink-0 text-brand" aria-hidden />
              <span className="min-w-0 flex-1 text-ink-2">
                {count.guests} guest{count.guests === 1 ? "" : "s"}:{" "}
                {summary.best && named ? (
                  <>
                    <strong className={summary.best.cost?.amount === 0 && !summary.best.copay ? "text-success" : "text-navy"}>
                      {costText(summary.best)}
                    </strong>{" "}
                    with {named}
                    {summary.best.copay ? `, plus ${copayText(summary.best)}` : ""}
                    {others > 0 ? ` · compare ${summary.options.length} cards` : ""}
                  </>
                ) : why === "passes" && first ? (
                  <>
                    <strong className="text-navy">{costLabel(first)}</strong> with {firstCard ? shortCardName(firstCard.name) : "your card"}, you included
                    {summary.options.length > 1 ? ` · compare ${summary.options.length} cards` : ""}
                  </>
                ) : why === "not-admitted" ? (
                  "this lounge doesn't admit your card"
                ) : why === "unpublished" ? (
                  "the fee for extra guests isn't published"
                ) : why === "over-limit" ? (
                  "more guests than the card's terms allow"
                ) : why === "locked" ? (
                  "this lounge opens after a spend unlock"
                ) : (
                  "the guest allowance isn't confirmed"
                )}
              </span>
              <ChevronDown className="h-4 w-4 shrink-0 text-brand" aria-hidden />
            </button>
          )}
          {canPriceGuests && (
            <section
              ref={panel}
              id={panelId}
              tabIndex={-1}
              hidden={!guestsOpen}
              aria-label={`Guest cost at ${lounge.name}`}
              className="mt-4 rounded-md border border-line bg-canvas/60 p-4 outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              {guestsOpen && <GuestCost networks={networks} cardIds={guestCards} initialGuests={initialGuests} place={place} compact />}
            </section>
          )}
        </div>
      </div>
    </li>
  );
}
