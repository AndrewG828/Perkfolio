import type { WalletState } from "./wallet-store";

/**
 * Combines two wallets without losing anything: cards are unioned (order kept), and for usage and tallies the
 * larger amount wins (usage only grows within a period). For per-card settings the newer wallet wins.
 */
export function mergeWallets(a: WalletState, b: WalletState): WalletState {
  const [older, newer] = (a.updatedAt ?? 0) <= (b.updatedAt ?? 0) ? [a, b] : [b, a];
  const maxMerge = (x: Record<string, number> = {}, y: Record<string, number> = {}) => {
    const out = { ...x };
    for (const [k, v] of Object.entries(y)) out[k] = Math.max(out[k] ?? 0, v);
    return out;
  };
  return {
    version: 1,
    cards: Array.from(new Set([...newer.cards, ...older.cards])),
    usage: maxMerge(older.usage, newer.usage),
    ignored: { ...older.ignored, ...newer.ignored },
    bonus: { ...(older.bonus ?? {}), ...(newer.bonus ?? {}) },
    tally: maxMerge(older.tally, newer.tally),
    openDates: { ...(older.openDates ?? {}), ...(newer.openDates ?? {}) },
    updatedAt: Math.max(a.updatedAt ?? 0, b.updatedAt ?? 0),
  };
}

export const hasWalletData = (w: WalletState) =>
  w.cards.length > 0 || Object.keys(w.usage).length > 0 || Object.keys(w.tally ?? {}).length > 0;

/** Loose shape check for wallets arriving from outside (cloud, backup file, old-address handoff). */
export function isWalletLike(x: unknown): x is WalletState {
  if (!x || typeof x !== "object") return false;
  const w = x as Record<string, unknown>;
  return (
    Array.isArray(w.cards) &&
    w.cards.every((c) => typeof c === "string") &&
    typeof w.usage === "object" &&
    w.usage !== null &&
    Object.values(w.usage as object).every((v) => typeof v === "number")
  );
}
