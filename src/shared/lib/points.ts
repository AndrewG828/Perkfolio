import type { Card } from "@/shared/data/types";
import { cards as allCards } from "@/shared/data/cards";
import {
  BANK_CURRENCY_IDS,
  awardPrograms,
  bankCurrencies,
  programNames,
  sweetSpots as allSweetSpots,
  transferPartners,
  type AwardProgram,
  type BankCurrency,
  type BankCurrencyId,
  type ProgramId,
  type ProgramKind,
  type SweetSpot,
  type TransferPartner,
} from "@/shared/data/points";

/**
 * Points & Miles wallet logic: what each card's rewards are, where a wallet's points can go, which sweet spots it
 * can book, and whether a redemption is a good deal. Pure; every function takes the dataset as an optional last
 * argument so tests can run against fixed data.
 */

export interface PointsData {
  cards: Card[];
  currencies: BankCurrency[];
  programs: AwardProgram[];
  partners: TransferPartner[];
  sweetSpots: SweetSpot[];
}

export const pointsData: PointsData = {
  cards: allCards,
  currencies: bankCurrencies,
  programs: awardPrograms,
  partners: transferPartners,
  sweetSpots: allSweetSpots,
};

// ------------------------------------------------------------------------------------------------ Card classification

/** What a card's rewards are: a bank currency, or one program's points earned directly (co-brand cards). */
export type CardPoints =
  | { kind: "currency"; currency: BankCurrencyId; limited?: LimitedTransfers }
  | { kind: "program"; program: ProgramId };

/** A card that earns a bank currency but can only transfer it with help from another card. */
export interface LimitedTransfers {
  /** Why, in one sentence. */
  note: string;
  /** Card ids that unlock full transfers once points are combined. */
  unlockedBy: string[];
}

/** Matched against `rewardsCurrency` for cards that earn a bank currency outright. */
const CURRENCY_PATTERNS: [RegExp, BankCurrencyId][] = [
  [/membership rewards/i, "amex-mr"],
  [/ultimate rewards/i, "chase-ur"],
  [/capital one miles/i, "capital-one"],
  [/thankyou/i, "citi-typ"],
  [/bilt points/i, "bilt"],
  [/wells fargo rewards/i, "wells-fargo"],
];

/** Matched against `rewardsCurrency` for co-brand cards. */
const PROGRAM_PATTERNS: [RegExp, ProgramId][] = [
  [/united mileageplus/i, "united-mileageplus"],
  [/delta skymiles/i, "delta-skymiles"],
  [/atmos rewards/i, "atmos-rewards"],
  [/aadvantage/i, "american-aadvantage"],
  [/southwest rapid rewards/i, "southwest-rapid-rewards"],
  [/world of hyatt/i, "world-of-hyatt"],
  [/marriott bonvoy/i, "marriott-bonvoy"],
  [/hilton honors/i, "hilton-honors"],
];

const SAPPHIRE_OR_INK = [
  "chase-sapphire-preferred",
  "chase-sapphire-reserve",
  "chase-sapphire-reserve-business",
  "chase-ink-business-preferred",
];
const STRATA = ["citi-strata-elite", "citi-strata-premier"];
const VENTURE = ["capital-one-venture-x", "capital-one-venture-x-business", "capital-one-venture"];

/** Listed by id, on purpose: these earn a bank currency, but transfers need another card. */
const LIMITED: Record<string, { currency: BankCurrencyId } & LimitedTransfers> = {
  "chase-freedom-unlimited": {
    currency: "chase-ur",
    note: "Points transfer only after you combine them with a Sapphire Preferred, Sapphire Reserve or Ink Business Preferred account.",
    unlockedBy: SAPPHIRE_OR_INK,
  },
  "chase-freedom-flex": {
    currency: "chase-ur",
    note: "Points transfer only after you combine them with a Sapphire Preferred, Sapphire Reserve or Ink Business Preferred account.",
    unlockedBy: SAPPHIRE_OR_INK,
  },
  "citi-double-cash": {
    currency: "citi-typ",
    note: "On its own it transfers to only a few partners at reduced ratios; pair it with a Strata Premier or Strata Elite for the full list.",
    unlockedBy: STRATA,
  },
  "citi-custom-cash": {
    currency: "citi-typ",
    note: "On its own it transfers to only a few partners at reduced ratios; pair it with a Strata Premier or Strata Elite for the full list.",
    unlockedBy: STRATA,
  },
  "capital-one-savor": {
    currency: "capital-one",
    note: "Cash back becomes transferable miles only when you move it to a Venture or Venture X account.",
    unlockedBy: VENTURE,
  },
};

/** Listed by id, on purpose: plain cash back that can't become airline or hotel points. */
const CASH_ONLY = new Set(["amex-blue-cash-preferred", "amex-blue-cash-everyday", "wells-fargo-active-cash"]);

export type ClassificationRule = "limited" | "cash-only" | "currency" | "program" | "unclassified";

/**
 * How a card was classified. "unclassified" means no rule matched: a new card that needs an entry above (a test
 * fails until it has one). Cash-back cards must be listed by id so a "Cash back (… points)" card is never mistaken
 * for one that earns full transferable points.
 */
export function classifyCard(card: Pick<Card, "id" | "rewardsCurrency">): { points: CardPoints | null; rule: ClassificationRule } {
  const limited = LIMITED[card.id];
  if (limited) {
    const { currency, note, unlockedBy } = limited;
    return { points: { kind: "currency", currency, limited: { note, unlockedBy } }, rule: "limited" };
  }
  if (CASH_ONLY.has(card.id)) return { points: null, rule: "cash-only" };
  if (/^cash/i.test(card.rewardsCurrency)) return { points: null, rule: "unclassified" };
  for (const [re, program] of PROGRAM_PATTERNS) {
    if (re.test(card.rewardsCurrency)) return { points: { kind: "program", program }, rule: "program" };
  }
  for (const [re, currency] of CURRENCY_PATTERNS) {
    if (re.test(card.rewardsCurrency)) return { points: { kind: "currency", currency }, rule: "currency" };
  }
  return { points: null, rule: "unclassified" };
}

/** What a card's points are: a bank currency (maybe with limited transfers), a program directly, or null for cash. */
export function currencyOfCard(card: Pick<Card, "id" | "rewardsCurrency">): CardPoints | null {
  return classifyCard(card).points;
}

/** True when the card earns this bank currency with full transfer rights. */
function earnsFully(card: Card, currency: BankCurrencyId): boolean {
  const p = currencyOfCard(card);
  return p?.kind === "currency" && p.currency === currency && !p.limited;
}

/** Cards (from the dataset) that earn a program's points directly. */
export function coBrandCards(program: ProgramId, data: PointsData = pointsData): Card[] {
  return data.cards.filter((c) => {
    const p = currencyOfCard(c);
    return p?.kind === "program" && p.program === program;
  });
}

/** Cards (from the dataset) that earn a bank currency, full earners first. */
export function cardsEarning(currency: BankCurrencyId, data: PointsData = pointsData): Card[] {
  const earning = data.cards.filter((c) => {
    const p = currencyOfCard(c);
    return p?.kind === "currency" && p.currency === currency;
  });
  return [...earning.filter((c) => earnsFully(c, currency)), ...earning.filter((c) => !earnsFully(c, currency))];
}

// ------------------------------------------------------------------------------------------------------- The wallet

export interface WalletCurrency {
  currency: BankCurrencyId;
  /** Wallet cards that earn it, full earners first. */
  cards: Card[];
  /** Some card in the wallet can transfer it to the full partner list. */
  transferable: boolean;
  /** Set when no card can: why, and which card would fix it. */
  limited?: LimitedTransfers;
}

export interface WalletPoints {
  cards: Card[];
  /** Bank currencies, in BANK_CURRENCY_IDS order. */
  currencies: WalletCurrency[];
  /** Programs earned directly with co-brand cards. */
  programs: { program: ProgramId; cards: Card[] }[];
  /** Cards that earn plain cash back. */
  cashOnly: Card[];
}

function walletCards(cardIds: string[], data: PointsData): Card[] {
  const byId = new Map(data.cards.map((c) => [c.id, c]));
  return Array.from(new Set(cardIds))
    .map((id) => byId.get(id))
    .filter((c): c is Card => Boolean(c));
}

/** What a wallet earns: bank currencies (and whether they transfer), co-brand programs, and cash back. */
export function walletPoints(cardIds: string[], data: PointsData = pointsData): WalletPoints {
  const cards = walletCards(cardIds, data);
  const currencies: WalletCurrency[] = [];
  for (const currency of BANK_CURRENCY_IDS) {
    const earning = cards.filter((c) => {
      const p = currencyOfCard(c);
      return p?.kind === "currency" && p.currency === currency;
    });
    if (earning.length === 0) continue;
    const full = earning.filter((c) => earnsFully(c, currency));
    const firstLimited = earning.map(currencyOfCard).find((p) => p?.kind === "currency" && p.limited);
    currencies.push({
      currency,
      cards: [...full, ...earning.filter((c) => !full.includes(c))],
      transferable: full.length > 0,
      limited: full.length === 0 && firstLimited?.kind === "currency" ? firstLimited.limited : undefined,
    });
  }
  const programs = new Map<ProgramId, Card[]>();
  for (const c of cards) {
    const p = currencyOfCard(c);
    if (p?.kind === "program") programs.set(p.program, [...(programs.get(p.program) ?? []), c]);
  }
  return {
    cards,
    currencies,
    programs: Array.from(programs, ([program, list]) => ({ program, cards: list })),
    cashOnly: cards.filter((c) => currencyOfCard(c) === null),
  };
}

// -------------------------------------------------------------------------------------------------------- Transfers

/** Partner points per bank point (1:1 → 1, 2:1.5 → 0.75). */
export const ratioOf = (p: Pick<TransferPartner, "from" | "to">) => p.to / p.from;

const trim = (n: number) => String(Math.round(n * 100) / 100);

/** "1:1", "2:1.5", "5:4"; large bases are normalized ("1000:800" → "1:0.8"). */
export function ratioLabel(p: Pick<TransferPartner, "from" | "to">): string {
  return p.from <= 10 ? `${trim(p.from)}:${trim(p.to)}` : `1:${trim(p.to / p.from)}`;
}

/** Partner points you get for a transfer of `bankPoints`. */
export function partnerPointsFor(p: Pick<TransferPartner, "from" | "to">, bankPoints: number): number {
  return Math.floor((bankPoints * p.to) / p.from + 1e-9);
}

/** The smallest valid transfer (respecting minimum and increment) that yields at least `partnerPoints`. */
export function bankPointsFor(p: Pick<TransferPartner, "from" | "to" | "minimum" | "increment">, partnerPoints: number): number {
  let bank = Math.ceil((partnerPoints * p.from) / p.to - 1e-9);
  if (p.minimum) bank = Math.max(bank, p.minimum);
  if (p.increment) bank = Math.ceil(bank / p.increment - 1e-9) * p.increment;
  return bank;
}

/** Rough speed order for transfer times: instant, then hours, then days (unknown text sorts last). */
export function transferSpeedRank(time: string): number {
  const t = time.toLowerCase();
  if (/instant|immediate|real[- ]time/.test(t)) return 0;
  const n = Math.max(0, ...Array.from(t.matchAll(/\d+(?:\.\d+)?/g), (m) => Number(m[0])));
  if (/hour/.test(t)) return 1 + Math.min(n, 72) / 100;
  if (/day/.test(t)) return 2 + Math.min(n || 1, 30);
  if (/week/.test(t)) return 40 + (n || 1);
  return 100;
}

/** Wallet cards whose points can take this transfer (empty if none can). */
export function cardsForTransfer(partner: TransferPartner, wallet: Card[]): Card[] {
  const sameCurrency = wallet.filter((c) => {
    const p = currencyOfCard(c);
    return p?.kind === "currency" && p.currency === partner.currency;
  });
  const unlocking = partner.cards
    ? sameCurrency.filter((c) => partner.cards!.includes(c.id))
    : sameCurrency.filter((c) => earnsFully(c, partner.currency));
  if (unlocking.length === 0) return [];
  // Points from limited cards can be pooled into a fully earning card and ride along.
  const pooled = unlocking.some((c) => earnsFully(c, partner.currency))
    ? sameCurrency.filter((c) => !unlocking.includes(c) && !earnsFully(c, partner.currency))
    : [];
  return [...unlocking, ...pooled];
}

export interface TransferRoute {
  partner: TransferPartner;
  currency: BankCurrencyId;
  /** Partner points per bank point. */
  ratio: number;
  /** Wallet cards whose points can go this way. */
  cards: Card[];
}

/** Best first: highest ratio, then fastest, then BANK_CURRENCY_IDS order. */
export function compareRoutes(a: Pick<TransferRoute, "partner">, b: Pick<TransferRoute, "partner">): number {
  return (
    ratioOf(b.partner) - ratioOf(a.partner) ||
    transferSpeedRank(a.partner.time) - transferSpeedRank(b.partner.time) ||
    BANK_CURRENCY_IDS.indexOf(a.partner.currency) - BANK_CURRENCY_IDS.indexOf(b.partner.currency)
  );
}

export interface ProgramReach {
  program: ProgramId;
  /** The program's entry, when programs.ts has one. */
  info?: AwardProgram;
  kind: ProgramKind;
  /** Co-brand cards in the wallet that earn its points directly. */
  direct: Card[];
  /** Transfers the wallet can make into it, best first. */
  routes: TransferRoute[];
  best: TransferRoute | null;
}

/**
 * For each program the wallet can get points in: the co-brand cards that earn them directly and every transfer the
 * wallet can make (picking the best ratio across currencies and card-specific ratios). Airlines first, then hotels.
 */
export function reachablePrograms(cardIds: string[], data: PointsData = pointsData): ProgramReach[] {
  const wallet = walletCards(cardIds, data);
  const routes = new Map<ProgramId, TransferRoute[]>();
  for (const partner of data.partners) {
    const cards = cardsForTransfer(partner, wallet);
    if (cards.length === 0) continue;
    const list = routes.get(partner.program) ?? [];
    list.push({ partner, currency: partner.currency, ratio: ratioOf(partner), cards });
    routes.set(partner.program, list);
  }
  const direct = new Map<ProgramId, Card[]>();
  for (const c of wallet) {
    const p = currencyOfCard(c);
    if (p?.kind === "program") direct.set(p.program, [...(direct.get(p.program) ?? []), c]);
  }
  const info = new Map(data.programs.map((p) => [p.id, p]));
  const ids = new Set<ProgramId>([...routes.keys(), ...direct.keys()]);
  return Array.from(ids, (program): ProgramReach => {
    const sorted = (routes.get(program) ?? []).sort(compareRoutes);
    const entry = info.get(program);
    return {
      program,
      info: entry,
      kind: entry?.kind ?? programNames[program]?.kind ?? "airline",
      direct: direct.get(program) ?? [],
      routes: sorted,
      best: sorted[0] ?? null,
    };
  }).sort(
    (a, b) =>
      Number(a.kind === "hotel") - Number(b.kind === "hotel") ||
      (a.info?.name ?? programNames[a.program].name).localeCompare(b.info?.name ?? programNames[b.program].name),
  );
}

/** Sweet spots the wallet can book (its program is reachable), with how. Keeps the dataset's order. */
export function sweetSpotsFor(cardIds: string[], data: PointsData = pointsData): { spot: SweetSpot; reach: ProgramReach }[] {
  const reach = new Map(reachablePrograms(cardIds, data).map((r) => [r.program, r]));
  return data.sweetSpots.flatMap((spot) => {
    const r = reach.get(spot.program);
    return r ? [{ spot, reach: r }] : [];
  });
}

/**
 * The best transfer for a currency into a program, without a wallet: card-specific entries count only when no
 * general one exists. Used for chart cells and "Transfer from" chips.
 */
export function bestPartnerFor(currency: BankCurrencyId, program: string, data: PointsData = pointsData): TransferPartner | null {
  const list = data.partners.filter((p) => p.currency === currency && p.program === program);
  const general = list.filter((p) => !p.cards);
  const pool = general.length ? general : list;
  return [...pool].sort((a, b) => compareRoutes({ partner: a }, { partner: b }))[0] ?? null;
}

/** True when a currency → program transfer has card-specific ratios (an entry with `cards`). */
export function ratioVaries(currency: BankCurrencyId, program: string, data: PointsData = pointsData): boolean {
  return data.partners.some((p) => p.currency === currency && p.program === program && p.cards);
}

/** Every bank currency that transfers into a program, with its best general ratio, in BANK_CURRENCY_IDS order. */
export function transferSources(program: string, data: PointsData = pointsData): { currency: BankCurrencyId; partner: TransferPartner }[] {
  return BANK_CURRENCY_IDS.flatMap((currency) => {
    const partner = bestPartnerFor(currency, program, data);
    return partner ? [{ currency, partner }] : [];
  });
}

// ------------------------------------------------------------------------------------------------- Redemption value

/** Cents of value per point: (cash price − taxes and fees you'd still pay) ÷ points × 100. */
export function centsPerPoint(cashPrice: number, taxes: number, points: number): number | null {
  if (!Number.isFinite(cashPrice) || !Number.isFinite(taxes) || !Number.isFinite(points)) return null;
  if (points <= 0 || cashPrice < 0 || taxes < 0) return null;
  return (Math.max(0, cashPrice - taxes) / points) * 100;
}

export type DealVerdict = "great" | "good" | "fair" | "poor";

export interface DealJudgement {
  cents: number;
  baselineCents: number;
  verdict: DealVerdict;
  /** Dollars more (positive) or less (negative) than the points are worth at the baseline value. */
  vsBaseline: number;
}

/**
 * Compares a redemption with Perkfolio's conservative value for the points: at least 1.5× is great, at least 1× is
 * good, at least 0.8× is fair, below that you'd do better paying cash and keeping the points.
 */
export function judgeRedemption(input: { cashPrice: number; taxes: number; points: number; baselineCents: number }): DealJudgement | null {
  const cents = centsPerPoint(input.cashPrice, input.taxes, input.points);
  if (cents === null || !(input.baselineCents > 0)) return null;
  const r = cents / input.baselineCents;
  const verdict: DealVerdict = r >= 1.5 ? "great" : r >= 1 ? "good" : r >= 0.8 ? "fair" : "poor";
  return {
    cents,
    baselineCents: input.baselineCents,
    verdict,
    vsBaseline: ((cents - input.baselineCents) * input.points) / 100,
  };
}

/** Conservative value of a currency or program: the lowest pointValueCents among cards that fully earn it. */
export function baselineCents(source: BankCurrencyId | ProgramId, data: PointsData = pointsData): number | null {
  const isCurrency = (BANK_CURRENCY_IDS as readonly string[]).includes(source);
  const values = data.cards
    .filter((c) => {
      const p = currencyOfCard(c);
      if (!p) return false;
      return isCurrency ? p.kind === "currency" && p.currency === source && !p.limited : p.kind === "program" && p.program === source;
    })
    .map((c) => c.pointValueCents);
  return values.length ? Math.min(...values) : null;
}

export interface ValueSource {
  id: BankCurrencyId | ProgramId;
  label: string;
  cents: number;
  kind: "currency" | "program";
}

/** Points the deal calculator can value: bank currencies, then co-brand programs (those with a card value). */
export function valueSources(data: PointsData = pointsData): ValueSource[] {
  const currencies = data.currencies.flatMap((c): ValueSource[] => {
    const cents = baselineCents(c.id, data);
    return cents === null ? [] : [{ id: c.id, label: c.shortName, cents, kind: "currency" }];
  });
  const programIds = Array.from(
    new Set(
      data.cards.flatMap((c) => {
        const p = currencyOfCard(c);
        return p?.kind === "program" ? [p.program] : [];
      }),
    ),
  );
  const info = new Map(data.programs.map((p) => [p.id, p]));
  const programs = programIds.flatMap((id): ValueSource[] => {
    const cents = baselineCents(id, data);
    return cents === null ? [] : [{ id, label: info.get(id)?.name ?? programNames[id].name, cents, kind: "program" }];
  });
  return [...currencies, ...programs.sort((a, b) => a.label.localeCompare(b.label))];
}

// ----------------------------------------------------------------------------------------------------- Formatting

const nf = new Intl.NumberFormat("en-US");

/** "60,000 pts" or "15,000–25,000 pts". */
export function pointsRange(spot: Pick<SweetSpot, "points" | "pointsMax">): string {
  return spot.pointsMax && spot.pointsMax > spot.points
    ? `${nf.format(spot.points)}–${nf.format(spot.pointsMax)}`
    : nf.format(spot.points);
}

export const perLabel: Record<SweetSpot["per"], string> = { "one-way": "one-way", "round-trip": "round-trip", night: "per night" };
