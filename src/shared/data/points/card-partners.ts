import type { BankCurrencyId } from "./types";
import { transferPartners } from "./transfers";
import { programNames } from "./program-names";

/**
 * Names of the programs a card's points transfer to: the currency's general entries plus the card's own
 * card-specific ones, airlines first, then hotels, each alphabetical. Card data uses this for `transferPartners`, so
 * card pages and the compare view always match the verified partner list. Kept apart from index.ts so card data only
 * pulls in the transfer list.
 */
export function transferPartnerNames(currency: BankCurrencyId, cardId: string): string[] {
  const ids = Array.from(
    new Set(transferPartners.filter((p) => p.currency === currency && (!p.cards || p.cards.includes(cardId))).map((p) => p.program)),
  );
  const hotel = (id: (typeof ids)[number]) => Number(programNames[id].kind === "hotel");
  return ids.sort((a, b) => hotel(a) - hotel(b) || programNames[a].name.localeCompare(programNames[b].name)).map((id) => programNames[id].name);
}
