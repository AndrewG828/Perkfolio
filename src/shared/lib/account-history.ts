import { getCard } from "@/shared/data/cards";
import { NO_BONUS, type WalletState } from "./wallet";

/**
 * The user's card history as one list: their applications (with open and close dates) plus wallet cards no open
 * application covers. A module of its own, without the issuer rules, so the tracker's balances and the Points & Miles
 * pages (which only need to know which cards are open) don't load them. eligibility.ts re-exports it.
 */

export interface HistoryRecord {
  /** Application id, or `wallet:<cardId>`. */
  key: string;
  source: "application" | "wallet";
  cardId?: string;
  name: string;
  issuer: string;
  business: boolean;
  /** "YYYY-MM", or "YYYY-MM-DD" when the day is known. Undefined when unknown (a wallet card without a date). */
  opened?: string;
  /** "YYYY-MM" or "YYYY-MM-DD". */
  closed?: string;
  /** Month the bonus posted. Undefined: the user says there was none. Null: not recorded. */
  bonusEarned?: string | null;
  open: boolean;
  /** The user is an authorized user on someone else's account. */
  authorizedUser?: boolean;
}

const cardName = (id: string) => getCard(id)?.name ?? id;

/** Applications, plus wallet cards that no open application covers (their open date may be unknown). */
export function accountHistory(wallet: WalletState): HistoryRecord[] {
  const apps = Array.isArray(wallet.applications) ? wallet.applications : [];
  const records: HistoryRecord[] = apps.map((a) => ({
    key: a.id,
    source: "application",
    ...(a.cardId ? { cardId: a.cardId } : {}),
    name: a.name ?? (a.cardId ? cardName(a.cardId) : "Card"),
    issuer: a.issuer,
    business: a.business,
    opened: a.opened,
    ...(a.closed ? { closed: a.closed } : {}),
    // No month and no "none": not recorded, which bonus rules treat as unknown.
    ...(a.bonusEarned === NO_BONUS ? {} : { bonusEarned: a.bonusEarned ?? null }),
    open: !a.closed,
    ...(a.authorizedUser ? { authorizedUser: true } : {}),
  }));
  // An open application covers the wallet card it describes, the user's own or an authorized-user card.
  const covered = new Set(apps.filter((a) => !a.closed && a.cardId).map((a) => a.cardId));
  for (const id of wallet.cards) {
    const card = getCard(id);
    if (!card || covered.has(id)) continue;
    const opened = wallet.openDates?.[id];
    records.push({
      key: `wallet:${id}`,
      source: "wallet",
      cardId: id,
      name: card.name,
      issuer: card.issuer,
      business: card.category === "business",
      ...(opened ? { opened } : {}),
      bonusEarned: null,
      open: true,
    });
  }
  return records;
}
