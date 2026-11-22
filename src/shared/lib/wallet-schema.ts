import type { BonusProgress, WalletState } from "./wallet";

/**
 * Strict validation for wallets that come from outside this tab: API request bodies, the cloud copy, backup files
 * and the old-domain handoff. Returns a clean copy with only known fields, or null if anything is off.
 *
 * Limits are far above real use (a heavy user has a few hundred usage entries) but keep a single row small and
 * keys safe to use as object properties (no `__proto__` and the like).
 */
export const WALLET_LIMITS = {
  cards: 200,
  entries: 20_000,
  amount: 10_000_000,
  keyLength: 200,
} as const;

const CARD_ID = /^[a-z0-9][a-z0-9-]{0,79}$/;
const KEY = /^[a-z0-9][a-z0-9:._-]*$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const isRecord = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);
const validKey = (k: string) => k.length <= WALLET_LIMITS.keyLength && KEY.test(k);
const validAmount = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= WALLET_LIMITS.amount;
const validDate = (v: unknown): v is string => typeof v === "string" && DATE.test(v) && !Number.isNaN(Date.parse(v));

/** Copies a record if every key passes and every value passes `check`; undefined means invalid. */
function record<T>(x: unknown, check: (v: unknown) => T | undefined, keyOk = validKey): Record<string, T> | undefined {
  if (x === undefined) return {};
  if (!isRecord(x)) return undefined;
  const entries = Object.entries(x);
  if (entries.length > WALLET_LIMITS.entries) return undefined;
  const out: Record<string, T> = Object.create(null);
  for (const [k, v] of entries) {
    const value = check(v);
    if (!keyOk(k) || value === undefined) return undefined;
    out[k] = value;
  }
  return { ...out };
}

const bonus = (v: unknown): BonusProgress | undefined => {
  if (!isRecord(v) || !validAmount(v.target) || !validAmount(v.spent)) return undefined;
  if (typeof v.deadline !== "string" || (v.deadline !== "" && !validDate(v.deadline))) return undefined;
  return { target: v.target, spent: v.spent, deadline: v.deadline };
};

export function parseWallet(x: unknown): WalletState | null {
  if (!isRecord(x)) return null;
  const { cards } = x;
  if (!Array.isArray(cards) || cards.length > WALLET_LIMITS.cards) return null;
  if (!cards.every((c): c is string => typeof c === "string" && CARD_ID.test(c))) return null;
  const cardKey = (k: string) => CARD_ID.test(k);

  const usage = record(x.usage, (v) => (validAmount(v) ? v : undefined));
  const tally = record(x.tally, (v) => (validAmount(v) ? v : undefined));
  const ignored = record(x.ignored, (v) => (v === true ? (true as const) : undefined));
  const bonuses = record(x.bonus, bonus, cardKey);
  const openDates = record(x.openDates, (v) => (validDate(v) ? v : undefined), cardKey);
  if (x.usage === undefined || !usage || !tally || !ignored || !bonuses || !openDates) return null;
  const updatedAt = x.updatedAt === undefined ? undefined : Number(x.updatedAt);
  if (updatedAt !== undefined && !Number.isFinite(updatedAt)) return null;

  return {
    version: 1,
    cards: [...new Set(cards)],
    usage,
    ignored,
    bonus: bonuses,
    tally,
    openDates,
    ...(updatedAt !== undefined ? { updatedAt } : {}),
  };
}

export const isWalletLike = (x: unknown): x is WalletState => parseWallet(x) !== null;
