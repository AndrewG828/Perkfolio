import type { BankCurrencyId } from "./types";
// The partner list without ratios, notes or sources (generated beside transfers.ts, a test keeps them equal): the card
// files call these when they load, and the cards reach every page (the reminder banner in the root layout).
import { transferRoutes } from "./transfer-routes";
import { programNames } from "./program-names";

/**
 * Names of the programs a card's points transfer to: the currency's general entries plus the card's own
 * card-specific ones, airlines first, then hotels, each alphabetical. Card data uses this for `transferPartners`, so
 * card pages and the compare view always match the verified partner list. Kept apart from index.ts so card data only
 * pulls in the routes, not the transfer list.
 */
export function transferPartnerNames(currency: BankCurrencyId, cardId: string): string[] {
  const ids = Array.from(
    new Set(transferRoutes.filter((p) => p.currency === currency && (!p.cards || p.cards.includes(cardId))).map((p) => p.program)),
  );
  const hotel = (id: (typeof ids)[number]) => Number(programNames[id].kind === "hotel");
  return ids.sort((a, b) => hotel(a) - hotel(b) || programNames[a].name.localeCompare(programNames[b].name)).map((id) => programNames[id].name);
}

/** How many programs a bank currency transfers to with any card (what a card page lists for a card with limited transfers). */
export function currencyPartnerCount(currency: BankCurrencyId): number {
  return new Set(transferRoutes.filter((p) => p.currency === currency).map((p) => p.program)).size;
}
