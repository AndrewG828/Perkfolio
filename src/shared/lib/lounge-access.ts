import type { Card, Lounge, LoungeNetwork } from "@/shared/data/types";
import { lounges } from "@/shared/data/lounges";
import { loungeGuestRules } from "@/shared/data/travel/lounge-guest-rules";
import { formatDate } from "./dates";

export * from "./lounge-directory";

/** Who can get into lounges, given a set of cards. Pure, so pages, the map and tests share one set of rules. */

export interface LoungeAccessGrant {
  card: Card;
  terms: string;
  /** The network the card uses to get in (can differ from the lounge's own brand, e.g. via Priority Pass). */
  via: LoungeNetwork;
}

/** A note that says a lounge is out of Priority Pass ("Not in Priority Pass", "left Priority Pass"). */
const NOT_PRIORITY_PASS = /\b(?:not (?:in|part of)|no longer (?:in|part of)|left|leaving|out of)\s+(?:the\s+)?priority pass\b/i;

/** Networks a lounge can be entered through (e.g. a Plaza Premium lounge that also takes Priority Pass). */
export function networksFor(l: Lounge): LoungeNetwork[] {
  const n: LoungeNetwork[] = [l.network];
  const notes = l.notes ?? "";
  if (l.network !== "priority-pass" && /priority pass/i.test(notes) && !NOT_PRIORITY_PASS.test(notes)) n.push("priority-pass");
  return n;
}

/**
 * The lounge's own rule that turns a card away though its network would let it in (Amex's Arlanda lounge admits only
 * the consumer Platinum Card), with the rule's first sentence as the reason; null when there's none.
 */
export function notAdmittedReason(l: Lounge, cardId: string, network: LoungeNetwork): string | null {
  const rule = loungeGuestRules.locationRules?.find(
    (r) =>
      r.network === network &&
      (r.airports ? r.airports.includes(l.airportCode) : true) &&
      (r.loungeName ? l.name.toLowerCase().includes(r.loungeName.toLowerCase()) : true),
  );
  if (!rule?.notAdmitted?.includes(cardId)) return null;
  return /^.*?\.(?=\s|$)/.exec(rule.notes)?.[0] ?? rule.notes;
}

/**
 * The cards that get you into a lounge, and on what terms. A card the lounge's own rules turn away isn't counted
 * (`refusedAt` says why), and neither is any card at a lounge where card access isn't confirmed.
 */
export function accessFor(l: Lounge, cards: Card[]): LoungeAccessGrant[] {
  if (l.cardAccessUnconfirmed) return [];
  const nets = networksFor(l);
  return cards.flatMap((card) =>
    card.loungeAccess
      .filter((a) => nets.includes(a.network) && !notAdmittedReason(l, card.id, a.network))
      .map((a) => ({ card, terms: a.terms, via: a.network })),
  );
}

/** Cards whose network covers the lounge but that the lounge itself doesn't admit, with the reason. */
export function refusedAt(l: Lounge, cards: Card[]): { card: Card; reason: string }[] {
  const nets = networksFor(l);
  return cards.flatMap((card) => {
    const a = card.loungeAccess.find((x) => nets.includes(x.network) && notAdmittedReason(l, card.id, x.network));
    return a ? [{ card, reason: notAdmittedReason(l, card.id, a.network)! }] : [];
  });
}

/**
 * True while the lounge is closed. Without `today` (before the page knows the visitor's date) a closure counts as in
 * effect; with it, only between its `from` and `until` dates.
 */
export function isClosed(l: Lounge, today?: string | null): boolean {
  const c = l.closed;
  if (!c) return false;
  if (!today) return true;
  return (!c.from || c.from <= today) && (!c.until || today < c.until);
}

/** "Closed until end of 2027 (expected)", "Closed until Apr 16, 2027", or "Temporarily closed". */
export function closedLabel(l: Lounge): string {
  const c = l.closed;
  if (!c) return "";
  const until = c.untilLabel ?? (c.until ? formatDate(c.until) : null);
  return until ? `Closed until ${until}` : "Temporarily closed";
}

/** The cards get you in and the lounge is open. */
export const openToCards = (l: Lounge, cards: Card[], today?: string | null) => !isClosed(l, today) && accessFor(l, cards).length > 0;

/** Lounges closed on `today`, by airport (a listed closure counts before the visitor's date is known). */
export function closedCountByAirport(today?: string | null): Record<string, number> {
  const out: Record<string, number> = {};
  for (const l of lounges) if (isClosed(l, today)) out[l.airportCode] = (out[l.airportCode] ?? 0) + 1;
  return out;
}


/** How many open lounges each airport has that these cards unlock (closed ones aren't counted). */
export function accessibleCountByAirport(cards: Card[], today?: string | null): Record<string, number> {
  const out: Record<string, number> = {};
  if (cards.length === 0) return out;
  for (const l of lounges) if (openToCards(l, cards, today)) out[l.airportCode] = (out[l.airportCode] ?? 0) + 1;
  return out;
}
