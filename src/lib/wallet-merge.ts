import type { WalletState } from "./wallet-store";

/**
 * Wallet merging for cloud sync. Everything the user enters lives in WalletState and is synced as a whole:
 * cards, credit usage, ignored credits, welcome-bonus progress, cap/visit tallies and card open dates.
 */

const EMPTY: WalletState = { version: 1, cards: [], usage: {}, ignored: {} };

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Per-key three-way merge: a side that didn't touch a key takes the other side's value (including deletes). */
function merge3<T>(
  base: Record<string, T> = {},
  local: Record<string, T> = {},
  remote: Record<string, T> = {},
  conflict: (l: T | undefined, r: T | undefined) => T | undefined,
): Record<string, T> {
  const out: Record<string, T> = {};
  for (const k of new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)])) {
    const b = base[k];
    const l = local[k];
    const r = remote[k];
    const v = same(l, b) ? r : same(r, b) ? l : conflict(l, r);
    if (v !== undefined) out[k] = v;
  }
  return out;
}

/** Both sides changed a number: keep the larger (usage only grows within a period); a change beats a delete. */
const maxOf = (l: number | undefined, r: number | undefined) =>
  l === undefined ? r : r === undefined ? l : Math.max(l, r);
/** Both sides changed a setting: this device's edit wins, and a change beats a delete. */
const localFirst = <T,>(l: T | undefined, r: T | undefined) => l ?? r;

/**
 * Three-way merge of this device's wallet (`local`) with the cloud copy (`remote`), given `base`: the copy both
 * last agreed on. Only true conflicts (both sides changed the same thing) need a rule; everything else, including
 * removing a card or un-marking a credit, carries over from whichever side made the change.
 * With no shared history, pass an empty base: cards are unioned and the larger amounts win.
 */
export function mergeWallets3(base: WalletState | null, local: WalletState, remote: WalletState): WalletState {
  const b = base ?? EMPTY;
  const baseCards = new Set(b.cards);
  const localCards = new Set(local.cards);
  const remoteCards = new Set(remote.cards);
  const keep = (id: string) => {
    const inB = baseCards.has(id);
    const inL = localCards.has(id);
    const inR = remoteCards.has(id);
    return inL === inB ? inR : inR === inB ? inL : inL;
  };
  const cards = [...new Set([...remote.cards, ...local.cards])].filter(keep);

  return {
    version: 1,
    cards,
    usage: merge3(b.usage, local.usage, remote.usage, maxOf),
    ignored: merge3(b.ignored, local.ignored, remote.ignored, localFirst),
    bonus: merge3(b.bonus, local.bonus, remote.bonus, localFirst),
    tally: merge3(b.tally, local.tally, remote.tally, maxOf),
    openDates: merge3(b.openDates, local.openDates, remote.openDates, localFirst),
    updatedAt: Math.max(local.updatedAt ?? 0, remote.updatedAt ?? 0),
  };
}

/** Combines two wallets with no shared history without losing anything (used for imports). */
export const mergeWallets = (a: WalletState, b: WalletState) => mergeWallets3(null, a, b);

export const hasWalletData = (w: WalletState) =>
  w.cards.length > 0 ||
  Object.keys(w.usage).length > 0 ||
  Object.keys(w.tally ?? {}).length > 0 ||
  Object.keys(w.bonus ?? {}).length > 0 ||
  Object.keys(w.openDates ?? {}).length > 0 ||
  Object.keys(w.ignored).length > 0;

const isNumberRecord = (x: unknown) =>
  x === undefined || (typeof x === "object" && x !== null && Object.values(x).every((v) => typeof v === "number"));

/** Loose shape check for wallets arriving from outside (cloud, backup file, old-address handoff). */
export function isWalletLike(x: unknown): x is WalletState {
  if (!x || typeof x !== "object") return false;
  const w = x as Record<string, unknown>;
  return (
    Array.isArray(w.cards) &&
    w.cards.every((c) => typeof c === "string") &&
    typeof w.usage === "object" &&
    w.usage !== null &&
    isNumberRecord(w.usage) &&
    isNumberRecord(w.tally) &&
    (w.ignored === undefined || (typeof w.ignored === "object" && w.ignored !== null)) &&
    (w.bonus === undefined || (typeof w.bonus === "object" && w.bonus !== null)) &&
    (w.openDates === undefined || (typeof w.openDates === "object" && w.openDates !== null))
  );
}
