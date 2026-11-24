import {
  NO_BONUS,
  type BonusProgress,
  type CardApplication,
  type Certificate,
  type CertificateKind,
  type PointsBalance,
  type Redemption,
  type WalletState,
} from "./wallet";

/**
 * Strict validation for wallets that come from outside this tab: API request bodies, the cloud copy, backup files
 * and the old-domain handoff. Returns a clean copy with only known fields, or null if anything is off.
 *
 * Limits are far above real use (a heavy user has a few hundred usage entries) but keep a single row small and
 * keys safe to use as object properties (no `__proto__` and the like). The list caps and text lengths also keep
 * a full wallet under the 256 KB sync body limit.
 */
export const WALLET_LIMITS = {
  cards: 200,
  entries: 20_000,
  amount: 10_000_000,
  keyLength: 200,
  /** Card applications (opened cards, including closed ones). */
  applications: 150,
  /** Programs with a points balance. */
  balances: 100,
  certificates: 100,
  redemptions: 200,
  /** Largest points figure (balances, certificate caps, redemptions). */
  points: 1_000_000_000,
  /** Labels and card names. */
  label: 80,
  issuer: 40,
  notes: 160,
} as const;

const CARD_ID = /^[a-z0-9][a-z0-9-]{0,79}$/;
const KEY = /^[a-z0-9][a-z0-9:._-]*$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^(19[7-9]\d|20\d\d)-(0[1-9]|1[0-2])$/;
const ITEM_ID = /^[A-Za-z0-9_-]{1,40}$/;
/** Control characters (tabs, newlines, NUL...). Notes may contain newlines; nothing else may. */
const CONTROL = /[\u0000-\u001f\u007f]/;
const CONTROL_EXCEPT_NEWLINE = /[\u0000-\u0009\u000b-\u001f\u007f]/;
const CONTROL_ALL = /[\u0000-\u001f\u007f]/g;
const CONTROL_NOT_NEWLINE_ALL = /[\u0000-\u0009\u000b-\u001f\u007f]/g;
const CERTIFICATE_KINDS: readonly CertificateKind[] = ["free-night", "companion", "voucher", "gift-card", "other"];

/** Single-line text from a form, made safe for the schema: control characters become spaces, then trimmed. */
export const cleanLabel = (s: string, max: number = WALLET_LIMITS.label) => s.replace(CONTROL_ALL, " ").trim().slice(0, max).trim();
/** Multi-line notes from a form: keeps line breaks, drops other control characters. */
export const cleanNotes = (s: string) =>
  s.replace(/\r\n?/g, "\n").replace(CONTROL_NOT_NEWLINE_ALL, " ").trim().slice(0, WALLET_LIMITS.notes).trim();

const isRecord = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);
const validKey = (k: string) => k.length <= WALLET_LIMITS.keyLength && KEY.test(k);
const validAmount = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= WALLET_LIMITS.amount;
const validPoints = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= WALLET_LIMITS.points;
const validDate = (v: unknown): v is string => typeof v === "string" && DATE.test(v) && !Number.isNaN(Date.parse(v));
const validMonth = (v: unknown): v is string => typeof v === "string" && MONTH.test(v);
/** A real calendar day in the MONTH range (no Feb 30). */
const validDay = (v: unknown): v is string => {
  if (typeof v !== "string" || !DATE.test(v) || !MONTH.test(v.slice(0, 7))) return false;
  const [y, m, d] = v.split("-").map(Number);
  return d >= 1 && d <= new Date(y, m, 0).getDate();
};
/** Application dates: "YYYY-MM", or "YYYY-MM-DD" when the user knows the day (day-based issuer windows need it). */
const validMonthOrDay = (v: unknown): v is string => validMonth(v) || validDay(v);
/** `a` can't be before `b`; with only a month on either side, the same month is fine. */
export const notBefore = (a: string, b: string) => (a.length >= 10 && b.length >= 10 ? a >= b : a.slice(0, 7) >= b.slice(0, 7));
/** Program / currency ids share the card id format: lowercase kebab-case. */
export const isProgramId = (v: unknown): v is string => typeof v === "string" && CARD_ID.test(v);
const validText = (v: unknown, max: number, multiline = false): v is string =>
  typeof v === "string" &&
  v.trim().length > 0 &&
  v.length <= max &&
  !(multiline ? CONTROL_EXCEPT_NEWLINE : CONTROL).test(v);

/** Copies a record if every key passes and every value passes `check`; undefined means invalid. */
function record<T>(
  x: unknown,
  check: (v: unknown) => T | undefined,
  keyOk = validKey,
  max: number = WALLET_LIMITS.entries,
): Record<string, T> | undefined {
  if (x === undefined) return {};
  if (!isRecord(x)) return undefined;
  const entries = Object.entries(x);
  if (entries.length > max) return undefined;
  const out: Record<string, T> = Object.create(null);
  for (const [k, v] of entries) {
    const value = check(v);
    if (!keyOk(k) || value === undefined) return undefined;
    out[k] = value;
  }
  return { ...out };
}

/** Validates a list of items with ids. Duplicate ids keep the first copy. `null` means invalid. */
function list<T extends { id: string }>(x: unknown, max: number, check: (v: unknown) => T | undefined): T[] | null {
  if (!Array.isArray(x) || x.length > max) return null;
  const seen = new Set<string>();
  const out: T[] = [];
  for (const v of x) {
    const item = check(v);
    if (!item) return null;
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

const bonus = (v: unknown): BonusProgress | undefined => {
  if (!isRecord(v) || !validAmount(v.target) || !validAmount(v.spent)) return undefined;
  if (typeof v.deadline !== "string" || (v.deadline !== "" && !validDate(v.deadline))) return undefined;
  return { target: v.target, spent: v.spent, deadline: v.deadline };
};

/** One card application, or undefined if invalid. Also used by the wallet store before saving. */
export function parseApplication(v: unknown): CardApplication | undefined {
  if (!isRecord(v) || typeof v.id !== "string" || !ITEM_ID.test(v.id)) return undefined;
  if (!validText(v.issuer, WALLET_LIMITS.issuer) || !validMonthOrDay(v.opened) || typeof v.business !== "boolean") return undefined;
  if (v.cardId !== undefined && !(typeof v.cardId === "string" && CARD_ID.test(v.cardId))) return undefined;
  if (v.name !== undefined && !validText(v.name, WALLET_LIMITS.label)) return undefined;
  if (v.closed !== undefined && !(validMonthOrDay(v.closed) && notBefore(v.closed, v.opened))) return undefined;
  if (v.bonusEarned !== undefined && v.bonusEarned !== NO_BONUS && !(validMonth(v.bonusEarned) && notBefore(v.bonusEarned, v.opened))) {
    return undefined;
  }
  if (v.authorizedUser !== undefined && typeof v.authorizedUser !== "boolean") return undefined;
  return {
    id: v.id,
    issuer: v.issuer,
    ...(v.cardId !== undefined ? { cardId: v.cardId as string } : {}),
    ...(v.name !== undefined ? { name: v.name as string } : {}),
    opened: v.opened,
    business: v.business,
    ...(v.closed !== undefined ? { closed: v.closed as string } : {}),
    ...(v.bonusEarned !== undefined ? { bonusEarned: v.bonusEarned as string } : {}),
    ...(v.authorizedUser === true ? { authorizedUser: true as const } : {}),
  };
}

export function parseBalance(v: unknown): PointsBalance | undefined {
  if (!isRecord(v) || !validPoints(v.points) || !validDate(v.updated)) return undefined;
  if (v.lastActivity !== undefined && !validDate(v.lastActivity)) return undefined;
  return {
    points: v.points,
    updated: v.updated,
    ...(v.lastActivity !== undefined ? { lastActivity: v.lastActivity as string } : {}),
  };
}

export function parseCertificate(v: unknown): Certificate | undefined {
  if (!isRecord(v) || typeof v.id !== "string" || !ITEM_ID.test(v.id)) return undefined;
  if (!CERTIFICATE_KINDS.includes(v.kind as CertificateKind) || !validText(v.label, WALLET_LIMITS.label)) return undefined;
  if (v.program !== undefined && !isProgramId(v.program)) return undefined;
  if (v.valueUsd !== undefined && !validAmount(v.valueUsd)) return undefined;
  if (v.points !== undefined && !validPoints(v.points)) return undefined;
  if (v.expires !== undefined && v.expires !== null && !validDate(v.expires)) return undefined;
  if (v.used !== undefined && typeof v.used !== "boolean") return undefined;
  if (v.notes !== undefined && !validText(v.notes, WALLET_LIMITS.notes, true)) return undefined;
  return {
    id: v.id,
    kind: v.kind as CertificateKind,
    ...(v.program !== undefined ? { program: v.program as string } : {}),
    label: v.label,
    ...(v.valueUsd !== undefined ? { valueUsd: v.valueUsd as number } : {}),
    ...(v.points !== undefined ? { points: v.points as number } : {}),
    ...(v.expires !== undefined ? { expires: v.expires as string | null } : {}),
    ...(v.used !== undefined ? { used: v.used as boolean } : {}),
    ...(v.notes !== undefined ? { notes: v.notes as string } : {}),
  };
}

export function parseRedemption(v: unknown): Redemption | undefined {
  if (!isRecord(v) || typeof v.id !== "string" || !ITEM_ID.test(v.id)) return undefined;
  if (!validDate(v.date) || !validText(v.label, WALLET_LIMITS.label)) return undefined;
  if (v.program !== undefined && !isProgramId(v.program)) return undefined;
  if (!validPoints(v.points) || !validAmount(v.taxesUsd) || !validAmount(v.cashPriceUsd)) return undefined;
  if (v.notes !== undefined && !validText(v.notes, WALLET_LIMITS.notes, true)) return undefined;
  return {
    id: v.id,
    date: v.date,
    label: v.label,
    ...(v.program !== undefined ? { program: v.program as string } : {}),
    points: v.points,
    taxesUsd: v.taxesUsd,
    cashPriceUsd: v.cashPriceUsd,
    ...(v.notes !== undefined ? { notes: v.notes as string } : {}),
  };
}

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

  // Newer, optional fields: absent stays absent, so older wallets round-trip unchanged.
  const applications = x.applications === undefined ? undefined : list(x.applications, WALLET_LIMITS.applications, parseApplication);
  const balances =
    x.balances === undefined ? undefined : (record(x.balances, parseBalance, isProgramId, WALLET_LIMITS.balances) ?? null);
  const certificates = x.certificates === undefined ? undefined : list(x.certificates, WALLET_LIMITS.certificates, parseCertificate);
  const redemptions = x.redemptions === undefined ? undefined : list(x.redemptions, WALLET_LIMITS.redemptions, parseRedemption);
  if (applications === null || balances === null || certificates === null || redemptions === null) return null;

  return {
    version: 1,
    cards: [...new Set(cards)],
    usage,
    ignored,
    bonus: bonuses,
    tally,
    openDates,
    ...(applications ? { applications } : {}),
    ...(balances ? { balances } : {}),
    ...(certificates ? { certificates } : {}),
    ...(redemptions ? { redemptions } : {}),
    ...(updatedAt !== undefined ? { updatedAt } : {}),
  };
}

export const isWalletLike = (x: unknown): x is WalletState => parseWallet(x) !== null;
