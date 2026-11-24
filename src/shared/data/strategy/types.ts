/**
 * Shapes of the strategy datasets: issuer application rules, points expiration policies and point valuations.
 * The data files next to this one (application-rules.ts, expiration.ts, valuations.ts) hold verified research in
 * the shape the research JSON uses, with a few additions marked "Added" below. Card ids are keys from
 * src/shared/data/cards; program ids are listed in ./programs.ts.
 */

// --- Application rules ------------------------------------------------------------------------------------------

export type Segment = "personal" | "business";
export type CardType = "credit" | "charge";

/**
 * What a rule does when it applies:
 * - ineligible: the issuer says the card or offer isn't available to you;
 * - no-bonus: you can be approved, but the welcome bonus isn't available;
 * - bonus-at-risk: the issuer says the bonus may not be available (its discretion), shown as a warning;
 * - likely-denied: approval is unlikely under a hedged or unwritten practice (a warning when the rule is `soft`).
 */
export type RuleEffect = "ineligible" | "no-bonus" | "bonus-at-risk" | "likely-denied";

/**
 * What a condition or count looks for in the user's history:
 * - currently-holds: an open account of a listed product now;
 * - ever-held: has or had one; with a window, held it open at some point inside the window;
 * - opened / approved / applied: an account opened (approved, applied for) inside the window;
 * - declined: an application declined inside the window;
 * - bonus-received: a welcome or upgrade bonus earned inside the window, or ever without one;
 * - converted-after-bonus: another card of the issuer that earned a bonus inside the window was product-changed
 *   into the card applied for;
 * - product-change: a voluntary upgrade or downgrade between the issuer's cards.
 * The history records opened, closed and bonus dates, so declined, converted-after-bonus and product-change can't
 * be checked: they're shown as notices.
 */
export type RuleEvent =
  | "currently-holds"
  | "ever-held"
  | "opened"
  | "approved"
  | "applied"
  | "declined"
  | "bonus-received"
  | "converted-after-bonus"
  | "product-change";

/** One trigger of a condition-based rule. A rule's conditions are an OR-list: any match applies its effect. */
export interface RuleCondition {
  event: RuleEvent;
  /** Card ids. "$self" is the card being applied for; "blockersByTarget" means `logic.blockersByTarget[card]`. */
  products?: string[];
  /** Products outside the dataset, by name. ./other-products.ts says how to recognize them in a card history. */
  otherProducts?: string[];
  /** No window: any time. */
  withinMonths?: number;
  withinDays?: number;
  effect: RuleEffect;
  /** Caveat for this condition. */
  note?: string;
  /**
   * Added: a bonus-received condition that also covers upgrade offers (the condition's note or the rule's notes say
   * so). The card history records welcome bonuses only, and an upgrade offer can post years after opening, so a card
   * with no bonus month recorded is always asked about, however old it is.
   */
  includesUpgradeBonuses?: boolean;
}

/** One window of a numeric rule: blocked once `count` qualifying events fall inside it. */
export interface RuleWindow {
  count: number;
  months?: number;
  days?: number;
  /** Overrides `counts.segments` for this window. */
  segments?: Segment[];
  note?: string;
}

/** What a numeric rule counts. */
export interface RuleCounts {
  issuers: "any" | string[];
  /** "same-as-applied-card": only cards in the segment (personal or business) of the card applied for. */
  segments?: Segment[] | "same-as-applied-card";
  /** Card types that count; omitted means both. */
  cardTypes?: CardType[];
  /** null: no outlet reports it either way. */
  includeAuthorizedUser?: boolean | null;
  includeClosed?: boolean;
  /** A business card counts only if it shows on the personal credit report (see businessCardsOnPersonalReport). */
  includeBusinessIfOnPersonalReport?: boolean;
  /** For "applied": declined applications count too. */
  includeDenied?: boolean;
  /** How retail store cards are treated. */
  storeCards?: string;
  brand?: string;
  event: RuleEvent;
  /** What doesn't count, in plain language. */
  excludes?: string[];
  /**
   * Added: cards the research leaves as an open question for this rule (Discover cards under Capital One's six
   * months, the Green Card under Amex's credit-card cap). They count only as "may count", with `note` (from the
   * rule's notes) as the caveat, so the rule warns instead of blocking.
   */
  mayCount?: { issuers?: string[]; cards?: string[]; note: string }[];
}

/** Facts about the user that decide whether a rule applies (asked in the UI, kept per browser). */
export type UserFact = "hasBankOfAmericaDepositAccount";

/**
 * How a rule decides:
 * - max-new-cards: likely denied once `count` or more qualifying accounts opened inside the window (5/24);
 * - velocity: the issuer's own pacing; `windows` lists every window and any full window blocks;
 * - max-open: blocked while `count` or more qualifying accounts are open;
 * - once-per-lifetime, family-bonus, cooldown: `conditions` decide (an OR-list of events with windows);
 * - notice: nothing to compute; the summary is shown as a caveat.
 * Windows in days count exact days, so they need the day an account was opened (a month alone may not settle
 * them). Windows in months count through the same day N months later; a month-only date is taken as the last day
 * of that month, so those results are on the safe side by up to a month.
 */
export interface RuleLogic {
  type: "max-new-cards" | "velocity" | "max-open" | "once-per-lifetime" | "family-bonus" | "cooldown" | "notice";
  count?: number;
  months?: number;
  days?: number;
  windows?: RuleWindow[];
  /** What the rule covers, in plain language. */
  scope: string;
  /** Card ids in the product family (display; `conditions` decide). "$self" is the card applied for. */
  family?: string[];
  familyOther?: string[];
  conditions?: RuleCondition[];
  counts?: RuleCounts;
  /** Dataset business card id → whether it shows on the personal credit report (false: never counts toward 5/24). */
  businessCardsOnPersonalReport?: Record<string, boolean>;
  /** The same for named groups of cards outside the dataset (matched in ./other-products.ts). */
  businessCardsOnPersonalReportOther?: Record<string, boolean>;
  /** When an account leaves a months-based window, in plain language. */
  dropOff?: string;
  /**
   * Added: the window counts calendar months, so an account opened any day of a month stops counting on the 1st of
   * the month `months + 1` later. From `dropOff`.
   */
  calendarMonths?: boolean;
  /** Evaluate only when the user's answer matches; if it's unknown, ask. */
  appliesWhen?: { userFact: UserFact; equals: boolean };
  /** Effect of a numeric rule. */
  effect?: RuleEffect;
  /** A tendency seen in reports rather than a firm cutoff: shown as a warning, never a block. */
  soft?: boolean;
  /** Other things the issuer says it weighs. */
  issuerDiscretion?: string;
  /** Products the rule explicitly doesn't count. */
  exempt?: string[];
  /** Upgrade rules: card applied for → the cards whose bonus blocks it. */
  blockersByTarget?: Record<string, string[]>;
}

export interface SourceDetail {
  url: string;
  outlet: string;
  /** The page's own last-updated date (YYYY-MM-DD), or "read YYYY-MM-DD" for issuer terms. */
  updated: string;
}

export interface ApplicationRule {
  id: string;
  /** Issuer name as in the card data, e.g. "Chase", "American Express". */
  issuer: string;
  name: string;
  summary: string;
  /** "approval": decides whether you're approved at all. "bonus": decides whether you get the welcome offer. */
  kind: "approval" | "bonus";
  logic: RuleLogic;
  /** Card ids the rule applies to (cards open to new applicants). */
  appliesTo: string[];
  /** Cards outside the dataset it applies to. */
  appliesToOther?: string[];
  /**
   * "official": the issuer's own published wording, read on its site. "widely reported": two or more independent
   * outlets agree on it, either because the issuer doesn't publish the rule or because its wording couldn't be read
   * (`basis` says which).
   */
  certainty: "official" | "widely reported";
  /** YYYY-MM */
  asOf: string;
  /** Added: the day the research last checked it (YYYY-MM-DD). */
  lastVerified: string;
  /** Where the wording comes from, when it isn't simply the issuer's own page. */
  basis?: string;
  notes?: string;
  /** URLs backing the rule. */
  sources: string[];
  /** Outlet and last-updated date for outlet sources. */
  sourceDetails?: SourceDetail[];
}

export interface ApplicationRulesData {
  /** YYYY-MM-DD */
  verified: string;
  /** Added: credit or charge card for every dataset card (Amex's pacing limits count credit cards only). */
  cardTypes: Record<string, CardType>;
  rules: ApplicationRule[];
}

// --- Points expiration ------------------------------------------------------------------------------------------

export interface ExpirationPolicy {
  /** Program or bank currency id. */
  id: string;
  /**
   * - never: points don't expire;
   * - inactivity: they expire `months` months after the last activity;
   * - fixed-term: each batch expires about `months` months after it was earned (activity doesn't move it; `caveat`
   *   says what does, like elite status or a paid extension);
   * - while-account-open: they last while you keep a card that earns them (bank currencies).
   */
  rule: "never" | "inactivity" | "fixed-term" | "while-account-open";
  months?: number | null;
  /** What counts as activity, e.g. "Earning or redeeming miles at least once every 24 months". */
  activity: string;
  notes: string;
  /** YYYY-MM */
  asOf: string;
  sources: string[];
  /** Added: a dated recent or upcoming change worth flagging (it's also described in `notes`). */
  change?: { date: string; text: string };
  /**
   * Added: expiry was paused and applies again from this day (YYYY-MM-DD). A balance whose inactivity deadline fell
   * during the pause lapses on this day instead, unless there's activity first.
   */
  expiryResumes?: string;
  /** Added: one short sentence from `notes` shown next to the expiry (elite exemptions, paid extensions, disputes). */
  caveat?: string;
  /**
   * Added: an inactivity program whose points don't expire while the member holds an open co-brand card (`card`
   * names it, e.g. "World of Hyatt card from Chase"). The tracker counts the user's own open cards that earn the
   * program: wallet cards and card-history entries, never cards they're an authorized user on. `primary`: the
   * notes say primary cardmembers. `afterClosingMonths`: after the card closes, points last at least this many
   * months from the closing date (AAdvantage: four months, or 24 after the last activity if that's later).
   */
  cardExemption?: { card: string; primary?: boolean; afterClosingMonths?: number };
}

export interface ExpirationData {
  /** YYYY-MM-DD */
  verified: string;
  programs: ExpirationPolicy[];
  /** Programs without a confirmed policy (the UI says so instead of guessing). */
  missing: { id: string; reason: string }[];
}

// --- Valuations -------------------------------------------------------------------------------------------------

export interface ValuationVariant {
  appliesTo: string;
  cents: number;
  basis?: string;
  outletLabel?: string;
}

/** One outlet's figure for a program. */
export interface ValuationSource {
  /** Outlet name, e.g. "The Points Guy". */
  source: string;
  /** Cents per point. */
  cents: number;
  /** YYYY-MM */
  asOf: string;
  url: string;
  /** Key into `ValuationsData.datasets`. */
  via?: string;
  /** The row's name in the outlet's table. */
  outletLabel?: string;
  /** The outlet's figure in its previous edition, when it changed. */
  previousCents?: number;
  method?: string;
  basis?: string;
  /** NerdWallet's travel-portal value for bank currencies. */
  baselineCents?: number;
  note?: string;
  /** Other figures the outlet gives for some cardholders. */
  variants?: ValuationVariant[];
}

export interface Valuation {
  /** Program or bank currency id. */
  id: string;
  kind: "bank-currency" | "airline" | "hotel";
  values: ValuationSource[];
  /** Smallest, middle (mean of two) and largest outlet figure, in cents per point. `median` is what we use. */
  low: number;
  median: number;
  high: number;
  outletCount: number;
  sources: string[];
  note?: string;
}

export interface ValuationDataset {
  outlet: string;
  url: string;
  /** YYYY-MM */
  edition: string;
  published?: string;
  modified: string;
  readOn: string;
  method: string;
  methodologyUrl?: string;
}

export interface ValuationsData {
  /** YYYY-MM-DD */
  verified: string;
  unit: string;
  datasets: Record<string, ValuationDataset>;
  valuations: Valuation[];
  /** Programs no outlet values: the UI asks for the user's own figure. */
  missing: { id: string; reason: string }[];
}
