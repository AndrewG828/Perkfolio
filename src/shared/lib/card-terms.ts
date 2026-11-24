import type { LoungeNetwork } from "@/shared/data/types";
import { CARD_TERM_CHECKS, type CardTermCheck } from "@/shared/data/travel/card-term-checks";

/** A card's terms as the travel tools show them, next to what the issuer's current terms say. */
export interface CheckedTerms {
  /** The terms, without clauses the issuer's current terms contradict. */
  text: string;
  /** What the issuer's terms say about the flagged clauses, in visitor words. */
  notes: string[];
  /** The checks that matched. */
  checks: CardTermCheck[];
}

/** Separators left dangling once a clause is cut: "free), ." → "free).", "access ;" → "access;". */
const tidy = (s: string) =>
  s
    .replace(/\s+([.,;:)])/g, "$1")
    .replace(/([,;:])(?=[.;])/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();

/**
 * A card's lounge terms (`where` = the network) or one of its perks (`where` = "perks"), checked against the clauses
 * the travel research flagged (shared/data/travel/card-term-checks.ts): contradicted clauses marked `hide` are left
 * out, and each flagged clause's note is returned to show under the terms.
 */
export function checkTerms(
  cardId: string,
  where: LoungeNetwork | "perks",
  text: string,
  checks: CardTermCheck[] = CARD_TERM_CHECKS,
): CheckedTerms {
  const hits = checks.filter((c) => c.cardId === cardId && c.where === where && c.clause.test(text));
  let out = text;
  for (const c of hits) if (c.hide) out = out.replace(c.clause, "");
  const notes = Array.from(new Set(hits.map((c) => c.note).filter((n): n is string => Boolean(n))));
  return { text: hits.some((c) => c.hide) ? tidy(out) : text, notes, checks: hits };
}
