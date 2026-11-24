"use client";

import { useId, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check, ChevronDown, Navigation, Users, X } from "lucide-react";
import type { Airport, Lounge } from "@/shared/data/types";
import { loungeNetworks } from "@/shared/data/networks";
import { loungeGuestRules } from "@/shared/data/travel/lounge-guest-rules";
import { networksFor, type LoungeAccessGrant } from "@/shared/lib/lounge-access";
import { cardsWithRules, guestCosts } from "@/shared/lib/guest-cost";
import { shortCardName } from "@/shared/lib/card-name";
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
  const summary = count && ok && count.guests > 0 ? guestCosts(loungeGuestRules, guestCards, networks, count.guests, count.reached) : null;
  const bestCard = summary?.best ? getCard(summary.best.cardId) : undefined;

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
              {access.map((a) => (
                <li key={a.card.id + a.via} className="flex items-start gap-3 text-sm">
                  <CardArt card={a.card} size="xs" className="mt-0.5 shrink-0" />
                  <span>
                    <span className="font-semibold text-ink">{a.card.name}</span>
                    {a.via !== lounge.network && <span className="text-ink-3"> via {loungeNetworks[a.via].label}</span>}
                    <span className="block text-ink-2">{a.terms}</span>
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
                {summary.best && bestCard ? (
                  <>
                    <strong className={summary.best.costUsd === 0 ? "text-success" : "text-navy"}>{costText(summary.best)}</strong> with{" "}
                    {shortCardName(bestCard.name)}
                    {summary.options.length > 1 ? ` · compare ${summary.options.length} cards` : ""}
                  </>
                ) : (
                  "the guest fee varies here"
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
              {guestsOpen && <GuestCost networks={networks} cardIds={guestCards} initialGuests={initialGuests} compact />}
            </section>
          )}
        </div>
      </div>
    </li>
  );
}
