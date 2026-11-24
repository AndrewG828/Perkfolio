import type { Card } from "@/shared/data/types";
import { cards as allCards } from "@/shared/data/cards";
import { cardsEarningIn, currencyOfCard, earnsFully, trimCents, type LimitedTransfers } from "./card-currency";
import {
  BANK_CURRENCY_IDS,
  PROGRAM_BRIDGES,
  awardPrograms,
  bankCurrencies,
  bookableAirlines,
  hotelToAirline,
  hotelTransferRules,
  programBookingNotes,
  programNames,
  programRef,
  sweetSpots as allSweetSpots,
  transferBonuses,
  transferPartners,
  type AwardProgram,
  type BankCurrency,
  type BankCurrencyId,
  type BookableAirline,
  type HotelToAirline,
  type HotelTransferRule,
  type PointValue,
  type ProgramBookingNote,
  type ProgramBridge,
  type ProgramId,
  type ProgramKind,
  type ProgramRef,
  type SweetSpot,
  type TransferBonus,
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
  bonuses: TransferBonus[];
  hotelRoutes: HotelToAirline[];
  hotelRules: HotelTransferRule[];
  airlines: BookableAirline[];
  bookingNotes: ProgramBookingNote[];
  /** Programs spent through another with no transfer (Virgin Red → Flying Club). */
  bridges: readonly ProgramBridge[];
}

export const pointsData: PointsData = {
  cards: allCards,
  currencies: bankCurrencies,
  programs: awardPrograms,
  partners: transferPartners,
  sweetSpots: allSweetSpots,
  bonuses: transferBonuses,
  hotelRoutes: hotelToAirline,
  hotelRules: hotelTransferRules,
  airlines: bookableAirlines,
  bookingNotes: programBookingNotes,
  bridges: PROGRAM_BRIDGES,
};

// ------------------------------------------------------------------------------------------------ Card classification

export {
  classifyCard,
  currencyOfCard,
  earnsFully,
  trimCents,
  type CardPoints,
  type ClassificationRule,
  type LimitedTransfers,
} from "./card-currency";


/** Cards (from the dataset) that earn a program's points directly. */
export function coBrandCards(program: ProgramId, data: PointsData = pointsData): Card[] {
  return data.cards.filter((c) => {
    const p = currencyOfCard(c);
    return p?.kind === "program" && p.program === program;
  });
}

/** Cards (from the dataset) that earn a bank currency, full earners first. */
export function cardsEarning(currency: BankCurrencyId, data: PointsData = pointsData): Card[] {
  return cardsEarningIn(currency, data.cards);
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
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

/**
 * The ratio in smallest whole numbers, so equal rates always read the same: "1:1", "5:4" (also for 1:0.8 and
 * 250:200), "4:3" (also for 2:1.5), "5:8" (1:1.6). Rates that don't reduce to small numbers keep one side at 1
 * ("1:0.67").
 */
export function ratioLabel(p: Pick<TransferPartner, "from" | "to">): string {
  return wholeRatio(p, 20) ?? `1:${trim(p.to / p.from)}`;
}

/**
 * An effective rate written like the pills write ratios: exact when it reduces ("5:2"), else the nearest whole-number
 * ratio within 1% with neither side above 20 (an overall rate through a hotel, 87,500 points for 35,000 miles → "5:2"),
 * else as ratioLabel would ("1:0.37").
 */
export function effectiveRatio(from: number, to: number): Pick<TransferPartner, "from" | "to"> {
  if (wholeRatio({ from, to }, 20) || !(from > 0) || !(to > 0)) return { from, to };
  const r = to / from;
  let best: { from: number; to: number; err: number } | null = null;
  for (let a = 1; a <= 20; a++) {
    for (let b = 1; b <= 20; b++) {
      const err = Math.abs(b / a - r) / r;
      if (err <= 0.01 && (!best || err < best.err - 1e-12)) best = { from: a, to: b, err };
    }
  }
  return best ? { from: best.from, to: best.to } : { from, to };
}

/** `from:to` in smallest whole numbers with neither side above `max`, or null when it doesn't reduce that far. */
export function wholeRatio(p: Pick<TransferPartner, "from" | "to">, max: number): string | null {
  for (const scale of [1, 10, 100]) {
    const [a, b] = [p.from * scale, p.to * scale].map((n) => Math.round(n));
    if (Math.abs(a - p.from * scale) > 1e-6 || Math.abs(b - p.to * scale) > 1e-6 || a <= 0 || b <= 0) continue;
    const d = gcd(a, b);
    if (a / d <= max && b / d <= max) return `${a / d}:${b / d}`;
  }
  return null;
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

/** Rough speed order for transfer times: instant, then hours, then days (unknown or unconfirmed sorts last). */
export function transferSpeedRank(time: string | undefined): number {
  if (!time) return 100;
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
  /** The bank transfer (into `via` when set, else into the program). */
  partner: TransferPartner;
  currency: BankCurrencyId;
  /** Partner points per bank point. */
  ratio: number;
  /** Wallet cards whose points can go this way. */
  cards: Card[];
  /** Set when the points land in a bridge program that shares its balance with this one (Virgin Red → Flying Club). */
  via?: ProgramId;
}

/** Best first: highest ratio, then a direct transfer over one via a bridge program, then fastest, then BANK_CURRENCY_IDS order. */
export function compareRoutes(a: Pick<TransferRoute, "partner" | "via">, b: Pick<TransferRoute, "partner" | "via">): number {
  return (
    ratioOf(b.partner) - ratioOf(a.partner) ||
    Number(Boolean(a.via)) - Number(Boolean(b.via)) ||
    transferSpeedRank(a.partner.time) - transferSpeedRank(b.partner.time) ||
    BANK_CURRENCY_IDS.indexOf(a.partner.currency) - BANK_CURRENCY_IDS.indexOf(b.partner.currency)
  );
}

/** The bridge whose points are spent through `program` (Virgin Red for Flying Club), if any. */
export function bridgesInto(program: string, data: Pick<PointsData, "bridges"> = pointsData): readonly ProgramBridge[] {
  return data.bridges.filter((b) => b.to === program);
}

/** The program a bridge program's points are spent through (Flying Club for Virgin Red), if it is one. */
export function bridgeFrom(program: string, data: Pick<PointsData, "bridges"> = pointsData): ProgramBridge | undefined {
  return data.bridges.find((b) => b.from === program);
}

/** A wallet's direct (not bridged) route from one currency, the one the chart cell for that currency shows. */
export function directRoute(reach: Pick<ProgramReach, "routes"> | null | undefined, currency: BankCurrencyId): TransferRoute | undefined {
  return reach?.routes.find((r) => r.currency === currency && !r.via);
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
  // Points sent to a bridge program (Virgin Red) are spent through the program it shares a balance with.
  for (const b of data.bridges) {
    const into = routes.get(b.from);
    if (!into?.length) continue;
    routes.set(b.to, [...(routes.get(b.to) ?? []), ...into.map((r) => ({ ...r, via: b.from }))]);
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

/**
 * Every ratio a bank currency moves into a program at, best first ("1:1 or 4:3" for Chase to Hyatt: Sapphire Reserve,
 * then Sapphire Preferred and Ink Preferred), for chips that can't say which card the reader holds.
 */
export function ratioRangeLabel(currency: BankCurrencyId, program: string, data: PointsData = pointsData): string {
  const pairs = data.partners.filter((p) => p.currency === currency && p.program === program).sort((a, b) => b.to / b.from - a.to / a.from);
  return Array.from(new Set(pairs.map((p) => ratioLabel(p)))).join(" or ");
}

export interface TransferSource {
  currency: BankCurrencyId;
  /** The best general transfer: into the program, or into `via`. */
  partner: TransferPartner;
  /** The bridge program the points go through (Virgin Red for Flying Club), when the currency doesn't transfer directly. */
  via?: ProgramId;
}

/**
 * Every bank currency that transfers into a program, with its best general ratio, in BANK_CURRENCY_IDS order. A
 * currency that only reaches it through a bridge program (Capital One and Bilt to Flying Club via Virgin Red) is
 * included with `via`.
 */
export function transferSources(program: string, data: PointsData = pointsData): TransferSource[] {
  return BANK_CURRENCY_IDS.flatMap((currency): TransferSource[] => {
    const partner = bestPartnerFor(currency, program, data);
    if (partner) return [{ currency, partner }];
    for (const b of bridgesInto(program, data)) {
      const bridged = bestPartnerFor(currency, b.from, data);
      if (bridged) return [{ currency, partner: bridged, via: b.from }];
    }
    return [];
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
 * Compares a redemption with a value per point (the deal calculator passes the one value every page uses,
 * shared/lib/point-value.ts, or a value typed in): at least 1.5× is great, at least 1× is good, at least 0.8× is fair,
 * below that you'd do better paying cash and keeping the points.
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

/** "1.3–2.2¢" (or "1.3¢" when the outlets agree). */
export function valueRangeLabel(v: Pick<PointValue, "low" | "high">): string {
  return v.low === v.high ? `${trimCents(v.low)}¢` : `${trimCents(v.low)}–${trimCents(v.high)}¢`;
}


// ------------------------------------------------------------------------------------------------ Transfer bonuses

/** The viewer's date as YYYY-MM-DD in their own time zone. Call after hydration (it reads the clock). */
export function localIsoDate(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Whole days from `fromIso` to `toIso` (both YYYY-MM-DD); negative when `toIso` is earlier. */
export function daysBetween(fromIso: string, toIso: string): number {
  const utc = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
  return Math.round((utc(toIso) - utc(fromIso)) / 86_400_000);
}

export interface LiveBonus {
  bonus: TransferBonus;
  /** Days until the last day (0 = it ends today). */
  daysLeft: number;
  /** False when it starts later. */
  started: boolean;
}

/**
 * Bonuses still running (or announced) on `today`: a bonus is hidden once its end date has passed. Soonest end first.
 * `today` comes from localIsoDate() after hydration, so expired bonuses never show.
 */
export function liveBonuses(today: string, data: Pick<PointsData, "bonuses"> = pointsData): LiveBonus[] {
  return data.bonuses
    .filter((b) => b.ends >= today)
    .map((bonus) => ({ bonus, daysLeft: daysBetween(today, bonus.ends), started: bonus.starts <= today }))
    .sort(
      (a, b) =>
        Number(b.started) - Number(a.started) ||
        a.daysLeft - b.daysLeft ||
        BANK_CURRENCY_IDS.indexOf(a.bonus.currency) - BANK_CURRENCY_IDS.indexOf(b.bonus.currency),
    );
}

/** The bonus running on `today` for a currency → program transfer, if any. */
export function bonusOn(
  currency: BankCurrencyId,
  program: string,
  today: string,
  data: Pick<PointsData, "bonuses"> = pointsData,
): TransferBonus | undefined {
  return data.bonuses.find((b) => b.currency === currency && b.program === program && b.starts <= today && b.ends >= today);
}

// ------------------------------------------------------------------------------------------------------ Who can book

export interface BookingOption {
  program: ProgramRef;
  /** It's the airline's own program. */
  own: boolean;
  /** How the wallet gets these points (null when it can't, undefined without a wallet). */
  reach?: ProgramReach | null;
  /** Bank currencies that transfer in, with their best general ratio (and the bridge program, when they go through one). */
  sources: TransferSource[];
  note?: ProgramBookingNote;
  /** Bridge programs folded into this option (Virgin Red into Flying Club), with how they work. */
  bridges: { bridge: ProgramBridge; note?: ProgramBookingNote }[];
}

/**
 * The programs that book an airline, with a bridge program (Virgin Red) folded into the program it books through
 * (Flying Club) when both are listed: the list every view counts and shows.
 */
export function bookingPrograms(airline: Pick<BookableAirline, "bookableWith">, data: Pick<PointsData, "bridges"> = pointsData): ProgramId[] {
  return airline.bookableWith.filter((id) => !data.bridges.some((b) => b.from === id && airline.bookableWith.includes(b.to)));
}

/**
 * Programs that can book an airline's award seats. With `cardIds`, the ones the wallet reaches come first. Within each
 * group the airline's own program leads (its ratio is in its own miles, so it can't be compared with another
 * program's: Aeromexico's 1.6 points per Membership Rewards point aren't worth more than Delta's 1:1), then the best
 * ratio, then the programs most banks transfer to. A bridge program (Virgin Red) is folded into the program it books
 * through (Flying Club) when both are listed.
 */
export function bookingOptionsFor(iata: string, cardIds?: string[], data: PointsData = pointsData): BookingOption[] {
  const airline = data.airlines.find((a) => a.iata === iata.toUpperCase());
  if (!airline) return [];
  const reach = cardIds ? new Map(reachablePrograms(cardIds, data).map((r) => [r.program, r])) : null;
  const options = bookingPrograms(airline, data).map(
    (id): BookingOption => ({
      program: programRef(id),
      own: airline.ownProgram === id,
      reach: reach ? (reach.get(id) ?? null) : undefined,
      sources: transferSources(id, data),
      note: data.bookingNotes.find((n) => n.program === id),
      bridges: bridgesInto(id, data)
        .filter((b) => airline.bookableWith.includes(b.from) || transferSources(id, data).some((s) => s.via === b.from))
        .map((bridge) => ({ bridge, note: data.bookingNotes.find((n) => n.program === bridge.from) })),
    }),
  );
  const ratio = (o: BookingOption) => (o.reach?.best ? o.reach.best.ratio : o.reach?.direct.length ? 1 : 0);
  return options.sort(
    (a, b) =>
      Number(Boolean(b.reach)) - Number(Boolean(a.reach)) ||
      Number(b.own) - Number(a.own) ||
      ratio(b) - ratio(a) ||
      b.sources.length - a.sources.length ||
      a.program.name.localeCompare(b.program.name),
  );
}

// ----------------------------------------------------------------------------------------------- "I need miles"

/** Miles from converting `points` hotel points in one go, counting a per-60,000 bonus (Marriott). */
export function hotelMilesFor(row: Pick<HotelToAirline, "fromPoints" | "toMiles" | "bonusMilesPer60k">, points: number): number {
  const base = Math.floor((points * row.toMiles) / row.fromPoints + 1e-9);
  return base + (row.bonusMilesPer60k ? Math.floor(points / 60_000) * row.bonusMilesPer60k : 0);
}

/** A hotel program's conversion limits: the row's own minimum, else the rule's; steps and caps from the rule. */
export function hotelLimits(
  row: Pick<HotelToAirline, "minimum">,
  rule?: Pick<HotelTransferRule, "minimum" | "increment" | "maxPerTransfer" | "dailyMax">,
): { minimum?: number; increment?: number; maxPerTransfer?: number; dailyMax?: number } {
  return { minimum: row.minimum ?? rule?.minimum, increment: rule?.increment, maxPerTransfer: rule?.maxPerTransfer, dailyMax: rule?.dailyMax };
}

/**
 * The fewest hotel points that convert into at least `miles`. With a per-60,000 bonus (Marriott), whole 60,000-point
 * conversions earn the bonus and the rest converts at the base rate. The row's minimum applies (else the hotel rule's,
 * e.g. Marriott's 3,000), and the rule's steps (IHG converts in 10,000s).
 */
export function hotelPointsFor(
  row: Pick<HotelToAirline, "fromPoints" | "toMiles" | "bonusMilesPer60k" | "minimum">,
  miles: number,
  rule?: Pick<HotelTransferRule, "minimum" | "increment">,
): number {
  const atBase = (m: number) => (m > 0 ? Math.ceil((m * row.fromPoints) / row.toMiles - 1e-9) : 0);
  let best = atBase(miles);
  if (row.bonusMilesPer60k) {
    const perBlock = hotelMilesFor(row, 60_000);
    for (let blocks = 1; blocks <= Math.ceil(miles / perBlock); blocks++) best = Math.min(best, blocks * 60_000 + atBase(miles - blocks * perBlock));
  }
  const { minimum, increment } = hotelLimits(row, rule);
  const points = Math.max(best, minimum ?? 0);
  return increment ? Math.ceil(points / increment - 1e-9) * increment : points;
}

/**
 * The transfer as it stands on `today`: from its date, a scheduled ratio change replaces the ratio, becomes the row's
 * change (`changedOn`, its sources first) and stops being "scheduled". The row's note is dropped: it was written before
 * the change ("1:1 for now …"), and the change log keeps the details. Unchanged without `today` (before hydration) or
 * before the date.
 */
export function partnerOn(p: TransferPartner, today?: string | null): TransferPartner {
  const s = p.scheduled;
  if (!today || !s || today < s.date) return p;
  const dated: TransferPartner = { ...p, from: s.from, to: s.to, changedOn: s.date, sources: Array.from(new Set([...s.sources, ...p.sources])) };
  delete dated.scheduled;
  delete dated.note;
  return dated;
}

const datedData = new Map<string, PointsData>();

/**
 * The dataset as it stands on `today` (scheduled ratio changes applied, partnerOn()), for every view that renders
 * after hydration. The same object comes back until another scheduled change takes effect, so it can key a memo.
 */
export function pointsDataOn(today?: string | null, data: PointsData = pointsData): PointsData {
  if (!today) return data;
  const due = data.partners.filter((p) => p.scheduled && today >= p.scheduled.date);
  if (due.length === 0) return data;
  if (data !== pointsData) return { ...data, partners: data.partners.map((p) => partnerOn(p, today)) };
  const key = due.map((p) => `${p.currency}>${p.program}@${p.scheduled!.date}`).join(",");
  let dated = datedData.get(key);
  if (!dated) {
    dated = { ...data, partners: data.partners.map((p) => partnerOn(p, today)) };
    datedData.set(key, dated);
  }
  return dated;
}

/**
 * Bank points needed for `amount` program points while a bonus runs. A cap on the bonus miles (Turkish: 50,000) means
 * transfers past it earn only the usual ratio. Minimums and steps apply as usual.
 */
export function bankPointsWithBonus(p: TransferPartner, bonus: Pick<TransferBonus, "from" | "to" | "maxBonusMiles">, amount: number): number {
  const boosted = bonus.to / bonus.from;
  const usual = p.to / p.from;
  let needed = amount / boosted;
  if (bonus.maxBonusMiles !== undefined && needed * (boosted - usual) > bonus.maxBonusMiles) needed = (amount - bonus.maxBonusMiles) / usual;
  return bankPointsFor({ ...p, from: 1, to: amount / Math.max(needed, 1e-9) }, amount);
}

/** True when a bonus limited to some cards (`cards`) can apply to a transfer made with these cards. */
function bonusApplies(bonus: TransferBonus, partner: TransferPartner, cards: Card[]): boolean {
  if (!bonus.cards) return true;
  if (partner.cards && !partner.cards.some((id) => bonus.cards!.includes(id))) return false;
  return cards.length === 0 || cards.some((c) => bonus.cards!.includes(c.id));
}

export interface MilesRoute {
  /** Bank → program, or bank → hotel → program. */
  kind: "direct" | "via-hotel";
  currency: BankCurrencyId;
  /** The bank transfer: into the program (direct), into `via`, or into the hotel program (via-hotel). */
  partner: TransferPartner;
  /** Direct only: a bridge program the points land in first, sharing its balance with the target (Virgin Red). */
  via?: ProgramId;
  /** Via-hotel only: the hotel conversion and how many hotel points it needs. */
  hotel?: { row: HotelToAirline; points: number; rule?: HotelTransferRule };
  /** Bank points to move at the standard ratio. */
  bankPoints: number;
  /** A bonus running on the bank transfer `today`, and the bank points needed with it. */
  bonus?: { bonus: TransferBonus; bankPoints: number };
  /** Wallet cards that can make the bank transfer (empty when none can, or without a wallet). */
  cards: Card[];
}

export interface MilesPlan {
  target: ProgramId;
  miles: number;
  /** Bank transfers straight into the program (or into a bridge program that shares its balance), cheapest first. */
  direct: MilesRoute[];
  /** Two steps: bank points into a hotel program, then hotel points into the airline. Cheapest first. */
  viaHotel: MilesRoute[];
  /** Wallet cards that earn the program's points directly. */
  coBrand: Card[];
}

/**
 * How to get `miles` points in `target`: direct bank transfers first (including through a bridge program such as
 * Virgin Red for Flying Club), then two-step routes through hotel points (hotel rules such as Marriott's 5,000 bonus
 * miles per 60,000 points and minimums included). Bonuses and scheduled ratio changes count only when `today` is
 * given (after hydration); a bonus limited to some cards counts only for them, and a bonus cap limits the bonus miles.
 */
export function milesPlan(target: ProgramId, miles: number, opts: { cardIds?: string[]; today?: string } = {}, data: PointsData = pointsData): MilesPlan {
  const wallet = walletCards(opts.cardIds ?? [], data);
  const need = Math.max(0, Math.ceil(miles));
  const withBonus = (p: TransferPartner, amount: number, cards: Card[]): MilesRoute["bonus"] => {
    const bonus = opts.today ? bonusOn(p.currency, p.program, opts.today, data) : undefined;
    return bonus && bonusApplies(bonus, p, cards) ? { bonus, bankPoints: bankPointsWithBonus(p, bonus, amount) } : undefined;
  };
  const usable = (r: MilesRoute) => (r.cards.length > 0 ? 0 : 1);
  // A route with a bonus running today costs what the bonus makes it cost.
  const cost = (r: MilesRoute) => r.bonus?.bankPoints ?? r.bankPoints;
  const order = (a: MilesRoute, b: MilesRoute) =>
    usable(a) - usable(b) ||
    cost(a) - cost(b) ||
    Number(Boolean(a.via)) - Number(Boolean(b.via)) ||
    transferSpeedRank(a.partner.time) - transferSpeedRank(b.partner.time) ||
    BANK_CURRENCY_IDS.indexOf(a.currency) - BANK_CURRENCY_IDS.indexOf(b.currency);
  const route = (p: TransferPartner, amount: number, extra: Partial<MilesRoute>): MilesRoute => {
    const partner = partnerOn(p, opts.today);
    const cards = cardsForTransfer(partner, wallet);
    return {
      kind: "direct",
      currency: partner.currency,
      partner,
      bankPoints: bankPointsFor(partner, amount),
      bonus: withBonus(partner, amount, cards),
      cards,
      ...extra,
    };
  };

  const bridged = bridgesInto(target, data).flatMap((b) => data.partners.filter((p) => p.program === b.from).map((p) => ({ p, via: b.from })));
  const direct = [
    ...data.partners.filter((p) => p.program === target).map((p) => route(p, need, {})),
    ...bridged.map(({ p, via }) => route(p, need, { via })),
  ].sort(order);

  const viaHotel = data.hotelRoutes
    .filter((row) => row.program === target)
    .flatMap((row) => {
      const rule = data.hotelRules.find((r) => r.from === row.from);
      const points = hotelPointsFor(row, need, rule);
      return data.partners.filter((p) => p.program === row.from).map((p) => route(p, points, { kind: "via-hotel", hotel: { row, points, rule } }));
    })
    .sort(order);

  const coBrand = wallet.filter((c) => {
    const p = currencyOfCard(c);
    return p?.kind === "program" && p.program === target;
  });
  return { target, miles: need, direct, viaHotel, coBrand };
}

/** Programs the planner can route to (a bank transfer or a hotel conversion lands there). */
export function plannableTargets(data: PointsData = pointsData): ProgramId[] {
  const ids = new Set<string>([...data.partners.map((p) => p.program), ...data.hotelRoutes.map((r) => r.program)]);
  return (Object.keys(programNames) as ProgramId[]).filter((id) => ids.has(id));
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
