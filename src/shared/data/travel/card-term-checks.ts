import type { LoungeNetwork } from "../types";

/**
 * Clauses in the card data (shared/data/cards) that the verified travel research couldn't confirm from the issuers'
 * own pages and that stay for now, each shown with a note: lounge rows (lounge-row.tsx), the guest panel, card pages,
 * Compare and the baggage tool's card perks leave out a clause marked `hide` and print the `note` under the card's
 * terms. Rejected clauses don't ship at all: the ones the research rejected (the Sapphire Lounge's $27 guest fee,
 * under-2s, early entry and Priority Pass end date; the Lufthansa end date; the Atmos Summit's pass count) were taken
 * out of the card data on November 24, 2026, so the list is empty. A test fails once a listed clause is gone from the
 * card data, so its entry is removed with the fix.
 */
export type CardTermStatus =
  /** The issuer's page doesn't confirm it (it may still be true). */
  "unconfirmed";

export interface CardTermCheck {
  cardId: string;
  /** Which text the clause is in: a lounge network's terms, or the card's perks. */
  where: LoungeNetwork | "perks";
  /** The clause as the card data words it (with its leading separator when `hide` removes it). */
  clause: RegExp;
  status: CardTermStatus;
  /** Leave the clause out where the travel tools show the card's terms. */
  hide?: boolean;
  /** What the issuer's terms say, in visitor words, shown under the card's terms. None for clauses only tracked here. */
  note?: string;
  /** For the card data's owner: what's wrong and where the research says so. */
  why: string;
  sources: string[];
}

export const CARD_TERM_CHECKS: CardTermCheck[] = [];
