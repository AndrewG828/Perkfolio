import { EMPTY_WALLET, type PointsBalance, type WalletState } from "./wallet";
import { parseApplication, parseCertificate, parseRedemption } from "./wallet-schema";

/**
 * Wallet merging for cloud sync. Everything the user enters lives in WalletState and is synced as a whole:
 * cards, credit usage, ignored credits, welcome-bonus progress, cap/visit tallies, card open dates, card
 * applications, points balances, certificates and redemptions.
 */

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
/** Both sides changed a balance: the one checked more recently wins (this device on a tie); a change beats a delete. */
const newerBalance = (l: PointsBalance | undefined, r: PointsBalance | undefined) =>
  l === undefined ? r : r === undefined ? l : r.updated > l.updated ? r : l;

/**
 * One list item, three ways. A side that left the item alone takes the other side's version, so an edit or a
 * delete on one side carries over. If both sides changed it, an edit beats a delete, and two edits merge field by
 * field (this device wins where both changed the same field).
 */
function mergeItem<T extends object>(b: T | undefined, l: T | undefined, r: T | undefined): T | undefined {
  if (same(l, b)) return r;
  if (same(r, b)) return l;
  if (l === undefined) return r;
  if (r === undefined) return l;
  const base = (b ?? {}) as Record<string, unknown>;
  const lr = l as Record<string, unknown>;
  const rr = r as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of new Set([...Object.keys(base), ...Object.keys(lr), ...Object.keys(rr)])) {
    const v = same(lr[k], base[k]) ? rr[k] : lr[k];
    if (v !== undefined) out[k] = v;
  }
  return out as T;
}

/**
 * Three-way merge of lists keyed by `id`. Stays undefined when neither side has the list (older wallets).
 * `check` is the item's schema validator: a field-by-field merge that breaks a rule (say, a closing month before
 * the opening month) falls back to this device's copy, so the result always passes parseWallet.
 */
function mergeList<T extends { id: string }>(
  base: T[] | undefined,
  local: T[] | undefined,
  remote: T[] | undefined,
  check: (v: unknown) => T | undefined,
): T[] | undefined {
  if (local === undefined && remote === undefined) return undefined;
  const byId = (xs: T[] = []) => new Map(xs.map((x) => [x.id, x]));
  const b = byId(base);
  const l = byId(local);
  const r = byId(remote);
  const ids = new Set([...(remote ?? []), ...(local ?? [])].map((x) => x.id));
  const out: T[] = [];
  for (const id of ids) {
    const merged = mergeItem(b.get(id), l.get(id), r.get(id));
    if (!merged) continue;
    const valid = check(merged) ?? check(l.get(id)) ?? check(r.get(id));
    if (valid) out.push(valid);
  }
  return out;
}

/**
 * Three-way merge of this device's wallet (`local`) with the cloud copy (`remote`), given `base`: the copy both
 * last agreed on. Only true conflicts (both sides changed the same thing) need a rule; everything else, including
 * removing a card or un-marking a credit, carries over from whichever side made the change.
 * With no shared history, pass an empty base: cards are unioned and the larger amounts win.
 */
export function mergeWallets3(base: WalletState | null, local: WalletState, remote: WalletState): WalletState {
  const b = base ?? EMPTY_WALLET;
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

  const applications = mergeList(b.applications, local.applications, remote.applications, parseApplication);
  const balances =
    local.balances === undefined && remote.balances === undefined
      ? undefined
      : merge3(b.balances, local.balances, remote.balances, newerBalance);
  const certificates = mergeList(b.certificates, local.certificates, remote.certificates, parseCertificate);
  const redemptions = mergeList(b.redemptions, local.redemptions, remote.redemptions, parseRedemption);

  return {
    version: 1,
    cards,
    usage: merge3(b.usage, local.usage, remote.usage, maxOf),
    ignored: merge3(b.ignored, local.ignored, remote.ignored, localFirst),
    bonus: merge3(b.bonus, local.bonus, remote.bonus, localFirst),
    tally: merge3(b.tally, local.tally, remote.tally, maxOf),
    openDates: merge3(b.openDates, local.openDates, remote.openDates, localFirst),
    ...(applications ? { applications } : {}),
    ...(balances ? { balances } : {}),
    ...(certificates ? { certificates } : {}),
    ...(redemptions ? { redemptions } : {}),
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
  Object.keys(w.ignored).length > 0 ||
  w.applications !== undefined ||
  Object.keys(w.balances ?? {}).length > 0 ||
  (w.certificates?.length ?? 0) > 0 ||
  (w.redemptions?.length ?? 0) > 0;

export { isWalletLike } from "./wallet-schema";
