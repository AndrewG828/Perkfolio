/**
 * Shapes of the strategy datasets: issuer application rules, points expiration policies and point valuations.
 * The data files next to this one (application-rules.ts, expiration.ts, valuations.ts) are drop-in: replace their
 * contents with verified research in exactly these shapes. Card ids are keys from src/shared/data/cards; program
 * ids are listed in ./programs.ts.
 */

/**
 * Which cards in the user's history a rule counts:
 * - "personal" / "business" / "all": cards from any issuer (Chase 5/24 counts personal cards from every bank);
 * - "issuer" / "issuer-personal" / "issuer-business": only cards from the rule's `issuer`;
 * - "family": only the card ids in `family`.
 * Defaults when omitted: max-new-cards "personal", velocity "issuer", max-open "family" if `family` is set, else
 * "issuer".
 */
export type RuleScope = "personal" | "business" | "all" | "issuer" | "issuer-personal" | "issuer-business" | "family";

/**
 * How a rule decides, using the user's card history (opened, closed and bonus months):
 * - max-new-cards: blocked when `count` or more cards in `scope` were opened in the last `months` months (5/24);
 * - velocity: the same count over a short window, usually one issuer's own cards (e.g. 1 card per 6 months);
 * - max-open: blocked while `count` or more cards in `scope` are open;
 * - once-per-lifetime: bonus blocked for good if the user has or had the card (or any card in `family`);
 * - family-bonus: with `months`, blocked while the user holds a `family` card or earned a bonus on one within
 *   `months` months; without `months`, blocked for good once they have had any `family` card;
 * - cooldown: blocked for `months` months after earning a bonus on the card (or any card in `family`).
 * Windows are whole months. A date given only as a month counts to the end of that month, so results are
 * conservative by up to a month.
 */
export interface RuleLogic {
  type: "max-new-cards" | "once-per-lifetime" | "family-bonus" | "cooldown" | "velocity" | "max-open";
  count?: number;
  months?: number;
  scope?: RuleScope;
  /** Card ids. */
  family?: string[];
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
  /** Card ids the rule applies to. */
  appliesTo: string[];
  certainty: "official" | "widely reported";
  /** YYYY-MM-DD */
  asOf: string;
  /** URLs (or citations) backing the rule. */
  sources: string[];
}

export interface ApplicationRulesData {
  rules: ApplicationRule[];
}

export interface ExpirationPolicy {
  /** Program or bank currency id. */
  id: string;
  /**
   * - never: points don't expire;
   * - inactivity: they expire `months` months after the last activity;
   * - fixed-term: each batch expires `months` months after it was earned, whatever you do;
   * - while-account-open: they last while you keep a card that earns them (bank currencies).
   */
  rule: "never" | "inactivity" | "fixed-term" | "while-account-open";
  months?: number;
  /** What counts as activity, e.g. "Earning or redeeming any miles". */
  activity: string;
  notes: string;
  asOf: string;
  sources: string[];
}

export interface ExpirationData {
  programs: ExpirationPolicy[];
}

export interface ValuationSource {
  source: string;
  /** Cents per point. */
  cents: number;
  asOf: string;
  url: string;
}

export interface Valuation {
  /** Program or bank currency id. */
  id: string;
  values: ValuationSource[];
  low: number;
  median: number;
  high: number;
}

export interface ValuationsData {
  valuations: Valuation[];
}
