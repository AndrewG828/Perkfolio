/**
 * Turns the verified Points & Miles research into the data modules in src/shared/data/points/.
 *
 *   npm run points:import -- --a <research dir A> --b <research dir B>            # write the modules
 *   npm run points:import -- --a <dir> --b <dir> --dry-run                        # report only (and which modules would change)
 *   npm run points:import -- --a <dir> --b <dir> --no-change-log                  # partner list exactly as researched
 *
 * (or set POINTS_RESEARCH_A / POINTS_RESEARCH_B). For every track it reads `<track>.final.json` when it exists, else
 * `<track>.verified.json`; nothing from a file's rejected / stillMissing / unconfirmed / notResearched / pending lists
 * is used. Inputs (see CLAUDE.md, "Points & Miles"):
 *
 *   A: transfers-a, transfers-b            → currencies.ts, transfers.ts, transfer-routes.ts
 *      programs-air-a, programs-air-b, programs-hotel → programs.ts
 *      sweet-flights-a, sweet-flights-b, sweet-hotels → sweet-spots.ts (featured order is computed here)
 *      photos.verified.json, photos.auto.json (optional manifests) → photos.ts
 *   B: booking-rules-a, booking-rules-b    → booking-rules.ts
 *      who-can-book (+ the flight sweet spots) → airlines.ts
 *      valuations                          → valuations.ts
 *      transfer-extras                     → hotel-transfers.ts, transfer-bonuses.ts, partner-changes.ts
 *
 * The partner list is reconciled with the dated partner-change log (transfer-extras): a partner the log shows as
 * removed is dropped, a ratio change replaces the old ratio, and a partner the log shows as added is listed with the
 * ratio the log gives and the bank's general minimum and steps (those every other row of the currency carries, e.g.
 * Chase's and Citi's 1,000-point minimum in 1,000-point steps; the log's news posts don't repeat them). This can
 * restore a pair a transfer track left in `rejected` as unconfirmed: the log's dated, sourced entry is the
 * confirmation. A scheduled ratio change is attached to its row (`scheduled`). Entries a newer research file
 * contradicts are listed in SUPERSEDED below, matched on their exact content so each rule lapses once the research is
 * updated (the importer reports rules that no longer match anything); HOTEL_RULE_FIXES, BOOKING_RULE_FIXES,
 * CURRENCY_TEXT_FIXES and ALT_FIXES work the same way.
 *
 * Who-can-book also gains every airline a verified flight sweet spot books with its program, even a pair the
 * who-can-book verification rejected for want of a second source (STARLUX on Atmos, Aer Lingus on Atmos): the sweet
 * spot's own verified sources are the confirmation, and they're added to the airline's sources. A listing the research
 * dates ("drop or relabel this entry after December 17, 2026") gets `endsOn`.
 *
 * Prose is written the way the pages write it (prose()): ISO dates as words, ratios as the ratio pills write them.
 * The importer prints everything it applied, skipped and why.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  ALLIANCES,
  BANK_CURRENCY_IDS,
  PROGRAM_BRIDGES,
  PROGRAM_IDS,
  REGIONS,
  type Alliance,
  type AwardProgram,
  type BankCurrency,
  type BankCurrencyId,
  type BookableAirline,
  type BookingRules,
  type Cabin,
  type FeeLevel,
  type HotelToAirline,
  type HotelTransferRule,
  type OutletValue,
  type PartnerChange,
  type PartnerChangeKind,
  type Photo,
  type PointValue,
  type Pricing,
  type ProgramBookingNote,
  type ProgramId,
  type Region,
  type SurchargeLevel,
  type SweetSpot,
  type TransferBonus,
  type TransferPartner,
  type ValuationEdition,
} from "../src/shared/data/points/types";
import { programNames } from "../src/shared/data/points/program-names";
import { airports, lounges } from "../src/shared/data/lounges";

// ------------------------------------------------------------------------------------------------------ Curation

/** Card-specific ratios the research states in its notes instead of a `cards` field: "currency>program" → ratio → cards. */
const CARD_SPECIFIC: Record<string, Record<string, string[]>> = {
  // transfers-a: "1:1 for Sapphire Reserve for Business ... and, per coverage, Sapphire Reserve"; "4:3 ... for Ink
  // Business Preferred since Oct 1, 2026 ... Coverage reports the same 4:3 rate for Sapphire Preferred".
  "chase-ur>world-of-hyatt": {
    "1:1": ["chase-sapphire-reserve", "chase-sapphire-reserve-business"],
    "4:3": ["chase-sapphire-preferred", "chase-ink-business-preferred"],
  },
};

/** Entries a newer research file contradicts, matched on exact content (they stop applying once the research changes). */
const SUPERSEDED: {
  sweetSpots: { id: string; points: number; pointsMax: number | undefined; reason: string }[];
  programText: { program: ProgramId; text: string; reason: string }[];
} = {
  /** Sweet spots priced on a chart a newer track replaced: { id, points, pointsMax, reason }. None apply now. */
  sweetSpots: [],
  /** Program text (a list item, or one sentence of the summary) that states a ratio the partner-change log replaced. */
  programText: [
    {
      program: "etihad-guest",
      text: "Amex, Capital One, Citi (premium cards) and Bilt points all transfer 1:1.",
      reason: "transfer-extras: Amex ended Etihad Guest transfers on June 30, 2026",
    },
    {
      program: "etihad-guest",
      text: "Transfers 1:1 from Amex, Capital One, Citi (premium cards) and Bilt",
      reason: "transfer-extras: Amex ended Etihad Guest transfers on June 30, 2026",
    },
    {
      program: "cathay-pacific-asia-miles",
      text: "Transfers 1:1 from Amex, Capital One, Citi (premium cards), Bilt and Wells Fargo (since April 28, 2026); Citi's no-fee Strata card also lists Cathay, at a reduced rate",
      reason: "transfer-extras: Amex to Asia Miles has been 5:4 since March 1, 2026",
    },
  ],
};

/**
 * Transfer rows whose research cites only pages that state neither the partner nor the ratio (Amex's terms PDF, and
 * global.americanexpress.com, which the research couldn't reach). Research B downloaded both outlets' Amex guides for
 * transfer-extras (txf-dl/src/upgradedpoints.com__amex-membership-rewards-transfer-partners.txt and
 * txf-dl/extra/nerdwallet.com__american-express-transfer-partners.txt); each lists every Amex partner with its ratio
 * and minimum, and both agree with these rows. A fix matches the researched values, so it lapses once they change.
 */
const AMEX_GUIDES = [
  "https://upgradedpoints.com/credit-cards/amex-membership-rewards-transfer-partners/",
  "https://www.nerdwallet.com/travel/learn/american-express-transfer-partners",
];
const AMEX_ONLY = [
  "https://www.americanexpress.com/content/dam/amex/us/rewards/membership-rewards/mr-terms-conditions-september-2026.pdf",
  "https://global.americanexpress.com/rewards/transfer",
];
const ROW_FIXES: {
  currency: BankCurrencyId;
  /** "*" = every row of the currency that matches `when`. */
  program: ProgramId | "*";
  when: { sources?: string[]; from?: number; to?: number; minimum?: number | null; increment?: number | null };
  set?: { minimum?: number };
  /** Fields the fix makes unknown. */
  unset?: ("increment" | "minimum")[];
  addSources: string[];
  reason: string;
}[] = [
  {
    currency: "amex-mr",
    program: "qantas-frequent-flyer",
    when: { minimum: 1000, increment: 1000 },
    set: { minimum: 500 },
    // The 1,000-point steps were the terms' "in most cases" rule; a 500-point minimum rules them out for Qantas.
    unset: ["increment"],
    addSources: AMEX_GUIDES,
    reason: "Upgraded Points: transfers 'usually require a minimum of 1,000 points (250 for JetBlue and 500 for Qantas)'; NerdWallet's table also gives 500",
  },
  {
    currency: "amex-mr",
    program: "jetblue-trueblue",
    when: { from: 250, to: 200, minimum: null },
    set: { minimum: 250 },
    addSources: AMEX_GUIDES,
    reason: "Upgraded Points and NerdWallet list a 250-point minimum for JetBlue",
  },
  {
    currency: "amex-mr",
    program: "*",
    when: { sources: AMEX_ONLY },
    addSources: AMEX_GUIDES,
    reason: "Upgraded Points' and NerdWallet's Amex guides list the partner at this ratio",
  },
];

/**
 * Hotel conversion rules whose general minimum the research leaves out although the page it cites states one. Research
 * B downloaded Upgraded Points' Hilton guide for transfer-extras (txf-dl/src/upgradedpoints.com__hilton-honors-transfer-
 * partners.txt): its "Minimum Points Transfer" column gives 10,000 for every airline except Aeromexico and Hainan
 * (25,000), Flying Blue (20,000) and KrisFlyer (4,000), and the rows for those keep their own minimum. A fix applies
 * only while the rule has no minimum of its own and cites the page, so it lapses once the research states one.
 */
const HOTEL_RULE_FIXES: { from: ProgramId; source: string; set: { minimum: number }; sentence: string; reason: string }[] = [
  {
    from: "hilton-honors",
    source: "https://upgradedpoints.com/travel/hotels/hilton-honors-transfer-partners/",
    set: { minimum: 10_000 },
    sentence: "Most partners have a 10,000-point minimum (20,000 for Flying Blue, 25,000 for Aeromexico).",
    reason: "Upgraded Points' Hilton table gives 10,000 as the minimum for every partner without its own",
  },
];

/**
 * Booking rules whose cited pages don't state them, though a page research B downloaded does: Upgraded Points'
 * award-calendar table (braf-txt2/upgradedpoints.com_travel_airlines_when-do-airlines-release-award-seats.txt, updated
 * April 30, 2026) lists "Air Canada Aeroplan 355 days". Matched on the researched value, so a fix lapses when it changes.
 */
const BOOKING_RULE_FIXES: { program: ProgramId; when: { bookingWindowDays: number }; addSources: string[]; reason: string }[] = [
  {
    program: "air-canada-aeroplan",
    when: { bookingWindowDays: 355 },
    addSources: ["https://upgradedpoints.com/travel/airlines/when-do-airlines-release-award-seats/"],
    reason: "Upgraded Points' award-calendar table lists Aeroplan at 355 days",
  },
];

/**
 * Currency text written before the partner-change log added a partner with its own ratio, matched on the exact words
 * (applied only with the change log, like SUPERSEDED.programText).
 */
const CURRENCY_TEXT_FIXES: { currency: BankCurrencyId; text: string; replace: string; reason: string }[] = [
  {
    currency: "wells-fargo",
    text: "(Choice is 1:2)",
    replace: "(Choice and, since April 15, 2026, Wyndham are 1:2)",
    reason: "partner-change log: Wyndham joined Wells Fargo at 1:2 on 2026-04-15",
  },
];

/** Photo alt text taken from a garbled Commons caption, matched on the exact caption. */
const ALT_FIXES: { src: string; alt: string; replace: string }[] = [
  {
    src: "/photos/regions/south-america.webp",
    alt: "View of the ancient houses of Machu Picchu houses, Urubamba Province, Cusco Region, today Peru.",
    replace: "The ancient houses of Machu Picchu, Urubamba Province, Cusco Region, Peru.",
  },
];

/** Display names for program ids outside PROGRAM_IDS that the research mentions without a name. */
const OTHER_NAMES: Record<string, string> = {
  "hawaiian-hawaiianmiles": "HawaiianMiles",
  "fanatics-fancash": "Fanatics FanCash",
  "spirit-free-spirit": "Spirit Free Spirit",
};

/** Program names pasted into prose in a form that reads oddly; replaced with the display name. */
const PASTED_NAMES: [RegExp, ProgramId][] = [[/\bCathay Pacific Cathay \(Asia Miles\)/g, "cathay-pacific-asia-miles"]];

/**
 * Airlines that verified flight sweet spots book but who-can-book doesn't list. IATA codes and names as research B's
 * baggage track checked them (baggage.final.json: Condor DE against OpenFlights, STARLUX JX against OpenTravelData).
 */
const EXTRA_AIRLINES: Record<string, { iata: string; name: string; alliance?: Alliance }> = {
  condor: { iata: "DE", name: "Condor" },
  starlux: { iata: "JX", name: "STARLUX Airlines" },
};

/**
 * Research wording rewritten for readers before the PROCESS filter runs (applied to each sentence). "Listed by the
 * oneworld rule" means listed because the airline is in oneworld; the rest are data-handling asides around facts.
 */
const REWRITES: [RegExp, string][] = [
  [/\bby the (Star Alliance|oneworld|SkyTeam) rule\b/g, "by $1 membership"],
  [/\bby the alliance rule\b/g, "by alliance membership"],
  [/\bAlliance-rule listings\b/g, "Listings based on alliance membership"],
  [/^It is listed for every Star Alliance airline by\b/, "ConnectMiles is listed for every Star Alliance airline by"],
  [/^This table lists (.+?) for [^;]+; its coverage of\b/, "$1's coverage of"],
  [/^New (?:program )?id(?: \([^)]*\))?, not in the canonical list: /i, ""],
  [/^Drop or relabel this entry after ([^,]+, \d{4}), when (.+)$/, "From $1, $2"],
  [/ \(kept from the project's verified sweet-spot research\)/g, ""],
  [/; neither is one of ours\./g, "; we cover neither."],
  [/^UP says they work on one-way as well as round-trip awards\b/, "UP says stopovers work on one-way as well as round-trip awards"],
  [/; single mapped source, treat as weak\./g, ", so this value rests on that one figure."],
  [/, so the value is null;/g, ";"],
  [/, so they stay null\./g, "."],
  [/, so the field leaves that out\./g, "."],
  [/\bis left null because\b/g, "isn't listed because"],
  [/, so those are left out until (.+?) confirms them/g, ", not yet confirmed by $1"],
  [/; no source states a per-ticket limit, so the earlier '[^']*' was dropped\./g, "; no source states a per-ticket limit."],
  [/ \((?:checked|fetched|read) \d{4}-\d{2}-\d{2}\)/g, ""],
  [/, (?:checked|fetched|read) \d{4}-\d{2}-\d{2}\)/g, ")"],
  // The facts behind a sentence that only says where they came from ("an AA partner guide in this session's search
  // results said …"): kept, without the research's session.
  [/\ban American partner guide seen in this session's (\d{4}) search results said\b/g, "a $1 guide to American's partners said"],
  [/\ban AA partner guide in this session's search results said\b/g, "a guide to American's partners said"],
  // How the research checked a program, as a caveat readers can use.
  [
    /^Checked \d{4}-\d{2}-\d{2} against long-standing (\w+) rules as reported by major points blogs and (.+?), because (\S+) can't be reached from this environment\.$/,
    "These rules follow long-standing $1 rules as reported by major points blogs and $2, not $3's own pages.",
  ],
  [
    /^Checked \d{4}-\d{2}-\d{2}: the (.+?) against (\w+)'s live pages; (.+?) against (\w+)'s long-standing rules as reported by major points blogs, because (\S+) can't be reached from this environment\.$/,
    "The $1 come from $2's pages; $3 follow $4's long-standing rules as reported by major points blogs, not $5's own pages.",
  ],
  // A scheduled change's status is its own field (and a badge that flips on its date), not part of its detail.
  [/^Scheduled, not yet in effect: from\b/, "From"],
  [/\b(is|are) now backed by\b/g, "$1 confirmed by"],
  [/\b(is|are) backed by\b/g, "$1 confirmed by"],
  // Data-handling asides in hotel rules and value notes.
  [/; no second outlet names each airline, so no per-airline \w+ rows are included\./g, "."],
  [/^The chart header says \d+ airlines take part but lists \d+, and JetBlue is not among them\.$/, "JetBlue isn't on Marriott's chart."],
  [/^Only figure is TPG's single Avios row, mapped here because\b/, "The only figure is TPG's value for Avios, used here because"],
];

/** Sentences about the research process rather than the programs ("not one of ours", "this session"), dropped. */
const PROCESS =
  /not one of ours|this session|session's|the project's|canonical list|\bnew (program )?id\b|in rejected|stillMissing|gap-fill|this environment|kept from|\breplaces the earlier\b|\btreat as weak\b|\brow is included per airline\b/i;

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const ISO_IN_TEXT = /\b(\d{4})-(\d{2})-(\d{2})\b/;
/** "2026-11-24" → "November 24, 2026" (day) or "Nov 2026" (month). */
const isoWords = (y: string, m: string, d: string, precision: "day" | "month") =>
  precision === "day" ? `${MONTHS[Number(m) - 1]} ${Number(d)}, ${y}` : `${MONTHS[Number(m) - 1].slice(0, 3)} ${y}`;
/** "December 17, 2026" → "2026-12-17", or undefined. */
function isoFromWords(s: string): string | undefined {
  const m = /^([A-Z][a-z]+) (\d{1,2}), (\d{4})$/.exec(s.trim());
  const month = m ? MONTHS.indexOf(m[1]) + 1 : 0;
  if (!m || !month) return undefined;
  const iso = `${m[3]}-${String(month).padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  return isIso(iso) ? iso : undefined;
}

/** a:b in smallest whole numbers with neither side above `max`, or null (the ratio pills use 20). */
function reduceRatio(a: number, b: number, max: number): string | null {
  const gcd = (x: number, y: number): number => (y ? gcd(y, x % y) : x);
  for (const scale of [1, 10, 100]) {
    const [x, y] = [a * scale, b * scale].map((n) => Math.round(n));
    if (Math.abs(x - a * scale) > 1e-6 || Math.abs(y - b * scale) > 1e-6 || x <= 0 || y <= 0) continue;
    const d = gcd(x, y);
    if (x / d <= max && y / d <= max) return `${x / d}:${y / d}`;
  }
  return null;
}

/**
 * Rates the ratio pills show (every researched transfer, and every ratio the change log adds or sets), as to ÷ from.
 * Filled by collectPillRates() before any text is imported, so prose() writes those rates the way the pills do.
 */
const PILL_RATES = new Set<string>();
const rateKey = (from: number, to: number) => (to / from).toFixed(6);
const fmtNum = (n: number) => new Intl.NumberFormat("en-US").format(n);

/**
 * Dates and ratios in research prose, written the way the pages write them. An ISO date after "on", "since", "from",
 * "until", "after", "before", "updated" or "published" becomes "November 24, 2026"; a date the research only cites
 * ("TPG (2026-08-25)") becomes its month ("TPG (Aug 2026)"). Ratios: whole numbers are reduced ("250:200" → "5:4"); a
 * rate the ratio pills show is written as they write it, in smallest whole numbers ("2:1.5" → "4:3", "1:1.6" → "5:8");
 * another "1:x" rate (a no-fee card's or a bonus's) reads per 1,000 points ("1:0.7" → "1,000 → 700"). `max` is the
 * largest term: 20 as on the pills, 200 for hotel conversions, where every rate is reduced as the hotel tables write
 * it ("25:6.5" → "50:13"). Anything else, and clock times ("11:59 p.m."), stay as written.
 */
/**
 * Wording for visitors, wherever research text lands (prose() runs on all of it): what the research didn't confirm is
 * said as a caveat ("isn't confirmed"), not as how it was checked, and figures from one outlet that the value panels
 * show (from valuations.ts) aren't repeated in prose, where they'd drift from the site's own numbers.
 */
const VISITOR_WORDING: [RegExp, string][] = [
  [/\bcoverage wasn't checked one by one\b/g, "coverage isn't confirmed program by program"],
  [/\bcoverage wasn't checked\b/g, "coverage isn't confirmed"],
  [/\b(booking channels|Non-Star partners|Partner redemptions through AerClub|Other routes and cabins) weren't checked\b/g, "$1 aren't confirmed"],
  [/\bweren't checked program by program\b/g, "aren't confirmed program by program"],
  // Pages show one row per pair, so a note can't point at "the separate row".
  [/ \(see the separate row\)/g, ""],
  [/ \(The Points Guy values them at about [\d.]+ cents, against [\d.]+ for Marriott and [\d.]+ for Hyatt\)/g, ""],
  [
    /; Upgraded Points values points at [\d.]+ to [\d.]+ cents when used for nights, so a bank point moved at 1:2 is worth roughly [\d.]+ to [\d.]+ cents/g,
    "; points go further on free nights",
  ],
  // Which outlet said what, and how many agree, is how the research checked a fact, not something visitors need:
  // agreement goes unsaid, a lone or disputed figure reads as "one report" or "isn't settled".
  [/(?:^| )All three outlets agree\./g, ""],
  [/(?:^| )Upgraded Points, The Points Guy and NerdWallet agree\./g, ""],
  [/ \(Upgraded Points and NerdWallet agree(?:; The Points Guy confirms the [^)]*)?\)/g, ""],
  [/(^| )Upgraded Points dates this partnership to ([A-Z][a-z]+ \d{4})\./g, "$1The partnership dates to $2."],
  [/(?:^| )Upgraded Points' [A-Z][a-z]+ \d{4} Citi guide lists it\./g, ""],
  // A program's airline list isn't the place for its transfer ratios (the transfers section has them).
  [/^Capital One lists Copa as an? [\d.:]+ transfer partner \(guide dated [^)]+\)\.$/g, ""],
  [
    /\bThe Points Guy's [A-Z][a-z]+ \d{4} Choice redemption page leaves the three Avios programs off its list, but Upgraded Points \([^)]*\), NerdWallet \([^)]*\) and The Points Guy's own [A-Z][a-z]+ \d{4} guide include them, and no outlet reports them being dropped\./g,
    "Not every published list of Choice's partners includes the Avios programs, but none reports them being dropped.",
  ],
  [/\bThrifty Traveler lists Emirates among JAL Mileage Bank's partner airlines\./g, "Emirates is also among JAL Mileage Bank's partner airlines."],
  [/\bDoctor of Credit describes it as targeted at some members; The Points Guy and Upgraded Points list it without saying so\./g, "It may be targeted: some members may not see it."],
  [/\bcoverage reports it becomes ([^,]+?), which bilt\.com doesn't show yet/g, "it's reported to become $1, which bilt.com doesn't show yet"],
  [/\bcoverage reports that no-fee ThankYou cards\b/g, "no-fee ThankYou cards"],
  [/\bper coverage\b/g, "reportedly"],
  [/; neither Upgraded Points nor NerdWallet mentions a bonus for large transfers/g, ", with no published bonus for large transfers"],
  [/\bSingapore KrisFlyer is disputed \(Upgraded Points ([\d.:]+), NerdWallet ([\d.:]+)\)\./g, "Singapore KrisFlyer's rate isn't settled: it's reported at both $1 and $2."],
  [/\bUpgraded Points counts (\d+) airline partners and says transfers can take up to (\d+) days\./g, "It has $1 airline partners, and transfers can take up to $2 days."],
  [/\bUpgraded Points lists an? ([\d,]+-point) minimum for most partners\b/g, "Most partners have a $1 minimum"],
  [/ \(NerdWallet, The Points Guy\), usually in ([\d,]+-point) increments \(The Points Guy; Upgraded Points lists ([\d,]+) as the minimum\)/g, ", usually in $1 increments, with a $2-point minimum"],
  [
    /\bTiming estimates differ: NerdWallet says four to six weeks and The Points Guy up to six weeks, while Upgraded Points says 14 to 21 days\./g,
    "How long it takes isn't settled: estimates run from 14 to 21 days to six weeks.",
  ],
  [/\bUpgraded Points names (\d+) airlines and lists (.+?) as the only exceptions\./g, "It has $1 airline partners; the only exceptions are $2."],
  [
    /\bTiming estimates differ: Upgraded Points says conversions usually take two to six weeks, while The Points Guy says they usually arrive within 72 hours and take up to seven days\./g,
    "How long conversions take isn't settled: estimates run from within 72 hours (up to seven days) to two to six weeks.",
  ],
  [/ \(TPG, Upgraded Points; Upgraded Points' reviews of (\d{4}) stays put the fees then at about/g, " (in $1 the fees were about"],
  [
    /^UP reported that (JAL and ANA nearly doubled .+?), while TPG's [A-Z][a-z]+ and [A-Z][a-z]+ \d{4} reports give smaller dollar figures, so the current amount needs checking\./g,
    "$1; other reports give smaller amounts, so check the current figure when you book.",
  ],
  [/ is disputed \(TPG says yes, priced by region; UP says no\)\./g, " isn't settled: one report says yes, priced by region, and another says no."],
  [/ is disputed \(see notes\)/g, " isn't settled (see notes)"],
  [/^UP alone puts the usual reach at (.+?); it reported flights bookable through/g, "The usual reach is $1, by one report; flights were bookable through"],
  [
    /^Upgraded Points alone describes (TAP's other award rules) \((.+)\), not yet confirmed by a second outlet or flytap\.com\./g,
    "$1 aren't confirmed on flytap.com; one report gives them as: $2.",
  ],
  [/ weren't confirmed by two outlets \(UP alone says /g, " aren't confirmed (one report says "],
  [/^Not confirmed by a second outlet: /g, "Not confirmed: "],
  [/\(UP alone gives /g, "(one report gives "],
  [/ \(UP alone\)/g, " (one report)"],
  [/ \(Upgraded Points, (?:[A-Z][a-z]+ \d{1,2}, \d{4}|\d{4}-\d{2}-\d{2})\)(?=\.)/g, ""],
  [/(?:^| )The Points Guy described .+? as the typical no-fee rate a month later, and both outlets' current Citi guides show the reduced no-fee column\./g, ""],
  [
    /\bThe date is when Upgraded Points first reported the change; no second outlet dates it, though The Points Guy confirmed (.+?) by (.+?), and its \d{4} Double Cash guide confirms the earlier Choice, JetBlue and Wyndham-only list\./g,
    "The date is when the change was first reported; $1 was confirmed by $2.",
  ],
  [/^Single outlet \(TPG, ([^)]+)\); Upgraded Points and NerdWallet do not list [^.]+\.$/g, "Only The Points Guy publishes a value for these points ($1)."],
  [/^Single outlet \(TPG\); Upgraded Points and NerdWallet do not list [^.]+\.$/g, "Only The Points Guy publishes a value for these points."],
  [/^Single outlet \(Upgraded Points\); TPG and NerdWallet do not list [^.]+\.$/g, "Only Upgraded Points publishes a value for these points."],
  [/^Single outlet; Upgraded Points labels it ('[^']+')\.$/g, "Only Upgraded Points publishes a value for these points, as $1."],
];

function prose(text: string, max = 20): string {
  const dated = VISITOR_WORDING.reduce((t, [re, to]) => t.replace(re, to), text)
    .replace(
      new RegExp(String.raw`\b(on|since|from|until|after|before|updated|published|first published) ${ISO_IN_TEXT.source}`, "g"),
      (_, w: string, y: string, m: string, d: string) => `${w} ${isoWords(y, m, d, "day")}`,
    )
    .replace(new RegExp(ISO_IN_TEXT.source, "g"), (_, y: string, m: string, d: string) => isoWords(y, m, d, "month"))
    // "(UP Nov 2026, Nov 2026)" → "(UP Nov 2026)"
    .replace(/\b([A-Z][a-z]{2} \d{4})(?:, \1\b)+/g, "$1");
  return (
    dated
      .replace(/(?<![\w.,:])(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)(?![\w:]|\.\d|\s*[ap]\.?m\b)/gi, (token, a: string, b: string, at: number, all: string) => {
        const [x, y] = [Number(a), Number(b)];
        if (/^0\d/.test(b) || !(x > 0) || !(y > 0)) return token;
        // A name someone else uses ("coverage still calls this a 3:1.1 rate") is quoted as they write it.
        if (/\bcalls? (?:this|it) an? $/i.test(all.slice(Math.max(0, at - 24), at))) return token;
        if (!a.includes(".") && !b.includes(".")) return reduceRatio(x, y, max) ?? token;
        if (max > 20 || PILL_RATES.has(rateKey(x, y))) return reduceRatio(x, y, max) ?? token;
        const per1000 = y * 1000;
        return x === 1 && Math.abs(per1000 - Math.round(per1000)) < 1e-9 ? `1,000 → ${fmtNum(Math.round(per1000))}` : token;
      })
      // "at 1,000 → 700 (1,000 points to 700 miles)" says it twice: "at 1,000 points to 700 miles".
      .replace(/\b1,000 → ([\d,]+) \(1,000 (\w+) to \1 ([^)]+)\)/g, "1,000 $2 to $1 $3")
  );
}

/** More process wording that booking-rule notes use (check passes, unreachable sites, what was left out of the data). */
const NOTE_PROCESS =
  /\bPARTIAL\b|\b(?:this|final|first|gap-fill) (?:check|pass)\b|\bthe original research\b|\bcan't be (?:reached|fetched)\b|\bcouldn't (?:reach|run)\b|\bsearch budget\b|\bsee (?:rejected|stillMissing)\b|^Checked \d{4}|\bRemoved as unconfirmed\b|\bstill unconfirmed\b|\bweren't disproved\b|^The versions disagree\b|\bre-fetched\b|\bwere read through\b/i;

/** Outlets the research cites by name, for spotting sentences that only list citations ("Stopovers: TPG (…) and UP (…)."). */
const OUTLETS = /\b(?:TPG|UP|NerdWallet|Upgraded Points|The Points Guy|Doctor of Credit|Mainly Miles|Milelion|One Mile at a Time|Head for Points|Executive Traveller|Australian Frequent Flyer)\b/g;

/** Process asides inside an otherwise useful sentence ("(amount not confirmed in this check)"), removed in place. */
const PROCESS_ASIDE = / in this (check|pass|run)\b/gi;

/** Licenses a photo may carry. */
const LICENSE_OK = /^(cc0|cc zero|public domain|pd\b|pd-|cc by(-sa)? \d+(\.\d+)?$)/i;

// ---------------------------------------------------------------------------------------------------------- Setup

const argv = process.argv.slice(2);
const flag = (name: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const DRY = argv.includes("--dry-run");
/** Skip applying the partner-change log to the partner list (the log itself is still written). */
const NO_CHANGE_LOG = argv.includes("--no-change-log");
const ROOT = process.cwd();
const OUT = join(ROOT, "src", "shared", "data", "points");

const errors: string[] = [];
const skipped: string[] = [];
const applied: string[] = [];
/** Curation rules (SUPERSEDED, ROW_FIXES) that matched nothing: the research changed, so they can be deleted. */
const lapsed: string[] = [];
const fail = (msg: string) => errors.push(msg);

type Json = Record<string, unknown>;
const PROGRAM_SET = new Set<string>(PROGRAM_IDS);
const CURRENCY_SET = new Set<string>(BANK_CURRENCY_IDS);
const isProgram = (s: unknown): s is ProgramId => typeof s === "string" && PROGRAM_SET.has(s);
const isCurrency = (s: unknown): s is BankCurrencyId => typeof s === "string" && CURRENCY_SET.has(s);

const isIso = (s: unknown): s is string =>
  typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
const isMonthOrIso = (s: unknown): s is string => isIso(s) || (typeof s === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(s));
const isHttps = (s: unknown): s is string => {
  try {
    return typeof s === "string" && new URL(s).protocol === "https:";
  } catch {
    return false;
  }
};
/** A trimmed non-empty string, or undefined. */
const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);
/** A trimmed non-empty string without process asides (dates and ratios as prose() writes them), or null (unknown). */
const known = (v: unknown): string | null => {
  const s = str(v)?.replace(PROCESS_ASIDE, "");
  return s ? prose(s) : null;
};
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.map(str).filter((s): s is string => Boolean(s)) : []);
const dedupe = <T>(xs: T[]) => Array.from(new Set(xs));
const urls = (v: unknown, where: string): string[] => {
  const list = dedupe(strings(v));
  for (const u of list) if (!isHttps(u)) fail(`${where}: source is not https: ${u}`);
  return list.filter(isHttps);
};

/** Splits text into sentences (not after abbreviations like "U.S." or "Sept."), keeping the punctuation. */
function sentences(text: string): string[] {
  const out: string[] = [];
  const re = /[.!?](?=\s+[A-Z0-9'"(])/g;
  let start = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (/\b(U\.S|Sept|Jan|Feb|Mar|Apr|Aug|Oct|Nov|Dec|e\.g|i\.e|a\.m|p\.m|St|vs|No)$/.test(text.slice(start, m.index))) continue;
    out.push(text.slice(start, m.index + 1).trim());
    start = m.index + 1;
  }
  out.push(text.slice(start).trim());
  return out.filter(Boolean);
}

/** Display names in place of the odd pasted forms (PASTED_NAMES). */
const displayNames = (text: string) => PASTED_NAMES.reduce((t, [re, id]) => t.replace(re, programNames[id].name), text);

/** One sentence after REWRITES. */
const rewrite = (sentence: string) => REWRITES.reduce((t, [re, to]) => t.replace(re, to), sentence);

/**
 * User-facing sentences: rewritten, those about the research process dropped (and any `keep` rejects), then dates and
 * ratios written as the pages write them (prose(); `max` is the largest ratio term, 200 for hotel conversions).
 */
function userSentences(text: unknown, process: RegExp[] = [PROCESS], opts: { max?: number; keep?: (s: string) => boolean } = {}): string[] {
  const s = str(text);
  if (!s) return [];
  return sentences(displayNames(s))
    .map(rewrite)
    .filter((t) => t && !process.some((re) => re.test(t)) && (opts.keep?.(t) ?? true))
    .map((t) => prose(t, opts.max))
    // A sentence that only said which outlets agree is gone after VISITOR_WORDING.
    .filter(Boolean);
}

/** Drops sentences about the research process; returns undefined when nothing is left. */
function userFacing(text: unknown, max?: number): string | undefined {
  const kept = userSentences(text, [PROCESS], { max });
  return kept.length ? kept.join(" ") : undefined;
}

/** True for a sentence that only lists citations ("Stopovers: TPG (2026-05-22) and UP (2026-09-02)."). */
function citationOnly(sentence: string): boolean {
  const rest = sentence
    .replace(/\([^)]*\)/g, " ")
    .replace(/^[\w ,/'-]{1,40}:/, " ")
    .replace(OUTLETS, " ")
    .replace(/\b(?:and|both|also|news|guides?|'s)\b/gi, " ")
    .replace(/[^A-Za-z]+/g, " ")
    .trim();
  return rest === "";
}

/** A program's booking-rule notes, one sentence each, without process wording or citation-only lines. */
function bookingNotes(text: unknown): string[] {
  return userSentences(text, [PROCESS, NOTE_PROCESS], { keep: (s) => !citationOnly(s) });
}

/** Minimums, steps and caps a hotel-conversion note or rule states in words. */
function conversionLimits(text: string | undefined): { minimum?: number; increment?: number; maxPerTransfer?: number; dailyMax?: number } {
  if (!text) return {};
  const N = String.raw`(\d{1,3}(?:,\d{3})+|\d+)`;
  const n = (s: string) => Number(s.replace(/,/g, ""));
  const out: { minimum?: number; increment?: number; maxPerTransfer?: number; dailyMax?: number } = {};
  const day = new RegExp(String.raw`\bconvert ${N} to ${N} points a day\b`, "i").exec(text);
  if (day) [out.minimum, out.dailyMax] = [n(day[1]), n(day[2])];
  const min =
    new RegExp(String.raw`\b${N}-point minimum\b`, "i").exec(text) ??
    new RegExp(String.raw`\blists ${N}(?: points)? as the minimum\b`, "i").exec(text) ??
    new RegExp(String.raw`\bstarting at ${N}(?: points)?\b`, "i").exec(text);
  if (min && out.minimum === undefined) out.minimum = n(min[1]);
  const step = new RegExp(String.raw`\bin ${N}-point increments\b`, "i").exec(text);
  if (step) out.increment = n(step[1]);
  const max = new RegExp(String.raw`\bup to ${N} points per transfer\b`, "i").exec(text);
  if (max) out.maxPerTransfer = n(max[1]);
  return out;
}

interface Track {
  name: string;
  file: string;
  label: string;
  data: Json;
}

function readTrack(dir: string | undefined, dirLabel: string, track: string): Track | null {
  if (!dir) return null;
  for (const suffix of ["final", "verified"]) {
    const file = join(dir, `${track}.${suffix}.json`);
    if (existsSync(file)) {
      try {
        return { name: track, file, label: `${dirLabel}/${track}.${suffix}.json`, data: JSON.parse(readFileSync(file, "utf8")) as Json };
      } catch (e) {
        fail(`${file}: ${(e as Error).message}`);
        return null;
      }
    }
  }
  fail(`${dirLabel}: neither ${track}.final.json nor ${track}.verified.json exists in ${dir}`);
  return null;
}

const list = (t: Track | null, key: string): Json[] => {
  const v = t?.data[key];
  if (v === undefined) return [];
  if (!Array.isArray(v)) {
    fail(`${t?.label}: "${key}" is not a list`);
    return [];
  }
  return v as Json[];
};
const verifiedAt = (t: Track | null): string => {
  const v = t?.data.verifiedAt;
  if (!isIso(v)) fail(`${t?.label}: verifiedAt is not an ISO date`);
  return isIso(v) ? v : "1970-01-01";
};

const ratioKey = (from: number, to: number) => `${from}:${to}`;
const nameOf = (id: string, fallback?: string) => (isProgram(id) ? programNames[id].name : (fallback ?? OTHER_NAMES[id] ?? id));

// ----------------------------------------------------------------------------------------- Currencies & transfers

function importCurrencies(tracks: (Track | null)[]): BankCurrency[] {
  const out: BankCurrency[] = [];
  for (const t of tracks) {
    for (const c of list(t, "currencies")) {
      const id = c.id;
      if (!isCurrency(id)) {
        fail(`${t?.label}: unknown currency ${String(id)}`);
        continue;
      }
      const lastVerified = isIso(c.asOf) ? c.asOf : verifiedAt(t);
      const entry: BankCurrency = {
        id,
        name: str(c.name) ?? "",
        shortName: str(c.shortName) ?? "",
        issuer: str(c.issuer) ?? "",
        earnedWith: str(c.earnedWith) ?? "",
        restrictions: userFacing(c.restrictions),
        sources: urls(c.sourceUrls ?? c.sources, `${id} currency`),
        lastVerified,
      };
      if (!entry.name || !entry.shortName || !entry.issuer || !entry.earnedWith) fail(`${t?.label}: ${id} is missing a name or earnedWith`);
      if (entry.sources.length === 0) fail(`${t?.label}: ${id} has no sources`);
      out.push(entry);
    }
  }
  const ids = out.map((c) => c.id);
  for (const id of BANK_CURRENCY_IDS) if (!ids.includes(id)) fail(`currency ${id} is missing from the transfer research`);
  if (new Set(ids).size !== ids.length) fail("a currency is listed twice in the transfer research");
  // Text the partner-change log has since outdated (these follow from the log, so only when it's applied).
  if (!NO_CHANGE_LOG)
    for (const fix of CURRENCY_TEXT_FIXES) {
      const c = out.find((x) => x.id === fix.currency);
      if (!c?.restrictions?.includes(fix.text)) {
        lapsed.push(`CURRENCY_TEXT_FIXES ${fix.currency}: "${fix.text}" no longer appears (${fix.reason})`);
        continue;
      }
      c.restrictions = c.restrictions.replace(fix.text, fix.replace);
      applied.push(`${fix.currency} rules: "${fix.text}" → "${fix.replace}" (${fix.reason})`);
    }
  return BANK_CURRENCY_IDS.map((id) => out.find((c) => c.id === id)).filter((c): c is BankCurrency => Boolean(c));
}

function importTransfers(tracks: (Track | null)[]): TransferPartner[] {
  const rows: TransferPartner[] = [];
  for (const t of tracks) {
    for (const p of list(t, "partners")) {
      const where = `${t?.label}: ${String(p.currency)} → ${String(p.program)}`;
      if (!isCurrency(p.currency)) {
        fail(`${where}: unknown currency`);
        continue;
      }
      if (!isProgram(p.program)) {
        skipped.push(`${where}: program isn't in PROGRAM_IDS (${userFacing(p.notes) ?? "no note"})`);
        continue;
      }
      const from = num(p.from);
      const to = num(p.to);
      if (!from || !to || from <= 0 || to <= 0) {
        skipped.push(`${where}: no confirmed ratio`);
        continue;
      }
      const time = str(p.time);
      const row: TransferPartner = {
        currency: p.currency,
        program: p.program,
        from,
        to,
        ...(time && !/not (confirmed|verified)/i.test(time) ? { time } : {}),
        ...(num(p.minimum) ? { minimum: num(p.minimum) } : {}),
        ...(num(p.increment) ? { increment: num(p.increment) } : {}),
        ...(userFacing(p.notes) ? { note: userFacing(p.notes) } : {}),
        ...(strings(p.cards).length ? { cards: strings(p.cards) } : {}),
        sources: urls(p.sources, where),
      };
      if (row.sources.length === 0) fail(`${where}: no sources`);
      rows.push(row);
    }
  }
  applyRowFixes(rows);
  // Pairs with several ratios need card lists.
  const byPair = new Map<string, TransferPartner[]>();
  for (const r of rows) byPair.set(`${r.currency}>${r.program}`, [...(byPair.get(`${r.currency}>${r.program}`) ?? []), r]);
  for (const [pair, entries] of byPair) {
    if (entries.length === 1) continue;
    for (const e of entries) {
      if (e.cards) continue;
      const cards = CARD_SPECIFIC[pair]?.[ratioKey(e.from, e.to)];
      if (cards) {
        e.cards = cards;
        applied.push(`${pair} ${ratioKey(e.from, e.to)}: card-specific ratio for ${cards.join(", ")}`);
      } else fail(`${pair}: ${entries.length} ratios but ${ratioKey(e.from, e.to)} has no card list (add it to CARD_SPECIFIC)`);
    }
  }
  return rows;
}

/** ROW_FIXES: adds sources (and corrected minimums) to rows that still carry the researched values. */
function applyRowFixes(rows: TransferPartner[]) {
  const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));
  for (const fix of ROW_FIXES) {
    const hits: string[] = [];
    for (const r of rows) {
      if (r.currency !== fix.currency || (fix.program !== "*" && r.program !== fix.program)) continue;
      const w = fix.when;
      const matches =
        (w.sources === undefined || sameSet(r.sources, w.sources)) &&
        (w.from === undefined || r.from === w.from) &&
        (w.to === undefined || r.to === w.to) &&
        (w.minimum === undefined || (r.minimum ?? null) === w.minimum) &&
        (w.increment === undefined || (r.increment ?? null) === w.increment);
      if (!matches) continue;
      hits.push(r.program);
      if (fix.set?.minimum !== undefined) r.minimum = fix.set.minimum;
      for (const k of fix.unset ?? []) delete r[k];
      r.sources = dedupe([...fix.addSources, ...r.sources]);
    }
    if (hits.length === 0) {
      lapsed.push(`ROW_FIXES ${fix.currency} → ${fix.program}: matches no row (${fix.reason})`);
      continue;
    }
    const what = [fix.set?.minimum !== undefined ? `minimum ${fix.set.minimum}` : "", ...(fix.unset ?? []).map((k) => `${k} unknown`), "sources added"];
    applied.push(`${fix.currency} → ${hits.join(", ")}: ${what.filter(Boolean).join(", ")} (${fix.reason})`);
  }
}

const RATIO = String.raw`(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)`;

/**
 * The bank's general transfer rule as its researched rows state it: the minimum and steps that every general row of the
 * currency carries ("Transfers go in 1,000-point increments" for Chase, "a 1,000-point minimum; … 1,000-point steps" for
 * Citi, any amount for Wells Fargo). Null when the rows disagree (Amex's JetBlue and Qantas differ) or state none.
 */
function currencyLimits(rows: TransferPartner[], currency: BankCurrencyId): { minimum?: number; increment?: number; count: number } | null {
  const general = rows.filter((r) => r.currency === currency && !r.cards);
  if (general.length < 3) return null;
  const key = (r: TransferPartner) => `${r.minimum ?? ""}|${r.increment ?? ""}`;
  if (new Set(general.map(key)).size !== 1) return null;
  const { minimum, increment } = general[0];
  return minimum === undefined && increment === undefined ? null : { minimum, increment, count: general.length };
}

/** PILL_RATES: the researched rows' ratios, and the ratios the change log adds, sets or schedules (as reconcile reads them). */
function collectPillRates(transferTracks: (Track | null)[], extraTrack: Track | null) {
  for (const t of transferTracks)
    for (const p of list(t, "partners")) {
      const [from, to] = [num(p.from), num(p.to)];
      if (from && to) PILL_RATES.add(rateKey(from, to));
    }
  for (const c of list(extraTrack, "partnerChanges")) {
    const detail = str(c.detail) ?? "";
    const set = new RegExp(String.raw`\bfrom ${RATIO} to ${RATIO}`, "i").exec(detail);
    const added = new RegExp(String.raw`\b(?:joined|added|returned)\b[^.;]*?\bat ${RATIO}`, "i").exec(detail);
    if (set) PILL_RATES.add(rateKey(Number(set[3]), Number(set[4])));
    if (added) PILL_RATES.add(rateKey(Number(added[1]), Number(added[2])));
  }
}

/** Applies the in-effect changes of the dated partner log to the partner list. */
function reconcile(rows: TransferPartner[], changes: PartnerChange[]): TransferPartner[] {
  const out = [...rows];
  const latest = new Map<string, PartnerChange>();
  for (const c of [...changes].sort((a, b) => a.date.localeCompare(b.date))) {
    if (c.status !== "in effect" || !isProgram(c.program) || c.cards) continue;
    if (c.change !== "added" && c.change !== "removed" && c.change !== "ratio changed") continue;
    latest.set(`${c.currency}>${c.program}`, c);
  }
  for (const [pair, c] of latest) {
    const program = c.program as ProgramId;
    const here = out.filter((r) => r.currency === c.currency && r.program === program);
    if (c.change === "removed") {
      if (here.length) {
        for (const r of here) out.splice(out.indexOf(r), 1);
        applied.push(`${pair}: dropped, removed on ${c.date} (partner-change log)`);
      }
      continue;
    }
    const m =
      c.change === "ratio changed"
        ? new RegExp(String.raw`\bfrom ${RATIO} to ${RATIO}`, "i").exec(c.detail)?.slice(3, 5)
        : new RegExp(String.raw`\b(?:joined|added|returned)\b[^.;]*?\bat ${RATIO}`, "i").exec(c.detail)?.slice(1, 3);
    const from = Number(m?.[0]);
    const to = Number(m?.[1]);
    if (!m || !(from > 0) || !(to > 0)) {
      if (!here.length) skipped.push(`${pair}: the change log adds it on ${c.date}, but its ratio couldn't be read from the detail`);
      continue;
    }
    if (here.length === 0) {
      // A partner the log adds takes the bank's general minimum and steps (the log's news posts don't repeat them), so
      // the planner never proposes a transfer the bank won't accept.
      const limits = currencyLimits(rows, c.currency);
      out.push({
        currency: c.currency,
        program,
        from,
        to,
        ...(limits?.minimum !== undefined ? { minimum: limits.minimum } : {}),
        ...(limits?.increment !== undefined ? { increment: limits.increment } : {}),
        note: c.detail,
        sources: c.sources,
        changedOn: c.date,
      });
      const rule = limits ? `, minimum ${limits.minimum ?? "unknown"} and steps ${limits.increment ?? "unknown"} as on all ${limits.count} other ${c.currency} rows` : "";
      applied.push(`${pair}: added at ${from}:${to} on ${c.date} (partner-change log)${rule}`);
      if (!limits && rows.some((r) => r.currency === c.currency && (r.minimum !== undefined || r.increment !== undefined)))
        skipped.push(`${pair}: added without a minimum or steps, because the bank's other rows don't agree on one`);
    } else if (c.change === "ratio changed" && here.every((r) => Math.abs(r.to / r.from - to / from) > 1e-9)) {
      const general = here.filter((r) => !r.cards);
      if (general.length !== 1 || here.length !== 1) {
        skipped.push(`${pair}: the change log gives ${from}:${to} but the pair has card-specific rows; left as researched`);
        continue;
      }
      const r = general[0];
      applied.push(`${pair}: ratio ${r.from}:${r.to} → ${from}:${to}, changed on ${c.date} (partner-change log)`);
      r.from = from;
      r.to = to;
      r.note = c.detail;
      r.changedOn = c.date;
      r.sources = dedupe([...c.sources, ...r.sources]);
    }
  }
  // Scheduled ratio changes ride on the row they will change, so pages can say what's coming (and when).
  for (const c of changes) {
    if (c.status !== "scheduled" || c.change !== "ratio changed" || !isProgram(c.program) || c.cards) continue;
    const m = new RegExp(String.raw`\bfrom ${RATIO} to ${RATIO}`, "i").exec(c.detail);
    const rows = out.filter((r) => r.currency === c.currency && r.program === c.program && !r.cards);
    if (!m || rows.length !== 1) {
      skipped.push(`${c.currency}>${c.program}: scheduled change on ${c.date} not attached (${!m ? "ratio unreadable" : "no single general row"})`);
      continue;
    }
    rows[0].scheduled = { date: c.date, from: Number(m[3]), to: Number(m[4]), detail: c.detail, sources: c.sources };
    applied.push(`${c.currency}>${c.program}: scheduled ${m[3]}:${m[4]} from ${c.date} attached to the row (partner-change log)`);
  }
  const kind = (p: ProgramId) => (programNames[p].kind === "hotel" ? 1 : 0);
  return out.sort(
    (a, b) =>
      BANK_CURRENCY_IDS.indexOf(a.currency) - BANK_CURRENCY_IDS.indexOf(b.currency) ||
      kind(a.program) - kind(b.program) ||
      programNames[a.program].name.localeCompare(programNames[b.program].name) ||
      b.to / b.from - a.to / a.from,
  );
}

// ------------------------------------------------------------------------------------------------------- Programs

const PRICING: Pricing[] = ["award chart", "distance-based", "dynamic", "hybrid"];
const SURCHARGE: SurchargeLevel[] = ["none", "low", "mixed", "high"];

function importPrograms(tracks: (Track | null)[]): AwardProgram[] {
  const out: AwardProgram[] = [];
  const hit = new Set<string>();
  for (const t of tracks) {
    const date = verifiedAt(t);
    for (const p of list(t, "programs")) {
      const id = p.id;
      const where = `${t?.label}: ${String(id)}`;
      if (!isProgram(id)) {
        skipped.push(`${where}: program isn't in PROGRAM_IDS`);
        continue;
      }
      // These rules follow from the partner-change log, so they apply only when the log is applied.
      const superseded = NO_CHANGE_LOG ? [] : SUPERSEDED.programText.filter((s) => s.program === id);
      const drop = (items: string[], field: string) =>
        items.filter((item) => {
          const rule = superseded.find((s) => s.text === item);
          if (rule) {
            applied.push(`${id} ${field}: dropped "${item.slice(0, 60)}…" (${rule.reason})`);
            hit.add(`${rule.program}|${rule.text}`);
          }
          return !rule;
        });
      // SUPERSEDED rules match the research's own words, so prose() (dates and ratios) runs on what they keep.
      const summary = drop(sentences(str(p.summary) ?? ""), "summary")
        .map((s) => prose(s))
        .join(" ");
      const kind = p.kind === "hotel" ? "hotel" : p.kind === "airline" ? "airline" : null;
      if (!kind || kind !== programNames[id].kind) fail(`${where}: kind ${String(p.kind)} doesn't match program-names.ts`);
      const alliance = p.alliance === null || p.alliance === undefined ? undefined : (p.alliance as Alliance);
      if (alliance && !ALLIANCES.includes(alliance)) fail(`${where}: unknown alliance ${String(alliance)}`);
      const pricing = p.pricing as Pricing;
      if (!PRICING.includes(pricing)) fail(`${where}: unknown pricing ${String(p.pricing)}`);
      const surcharges = p.partnerSurcharges === null || p.partnerSurcharges === undefined ? undefined : (p.partnerSurcharges as SurchargeLevel);
      if (surcharges && !SURCHARGE.includes(surcharges)) fail(`${where}: unknown partnerSurcharges ${String(surcharges)}`);
      const perks = drop(strings(p.perks), "perks").map((s) => prose(s));
      const entry: AwardProgram = {
        id,
        name: programNames[id].name,
        owner: str(p.owner) ?? "",
        kind: kind ?? programNames[id].kind,
        ...(alliance ? { alliance } : {}),
        currency: str(p.currency) ?? "",
        pricing,
        summary,
        strengths: drop(strings(p.strengths), "strengths").map((s) => prose(s)),
        watchOuts: drop(strings(p.watchOuts), "watchOuts").map((s) => prose(s)),
        ...(surcharges ? { partnerSurcharges: surcharges } : {}),
        ...(perks.length ? { perks } : {}),
        officialUrl: str(p.officialUrl) ?? "",
        ...(str(p.chartUrl) ? { chartUrl: str(p.chartUrl) } : {}),
        sources: urls(p.sources, where),
        lastVerified: date,
      };
      if (!entry.owner || !entry.currency || !entry.summary) fail(`${where}: owner, currency or summary is empty`);
      if (!isHttps(entry.officialUrl) || (entry.chartUrl && !isHttps(entry.chartUrl))) fail(`${where}: official/chart URL isn't https`);
      out.push(entry);
    }
  }
  const ids = out.map((p) => p.id);
  if (new Set(ids).size !== ids.length) fail("a program is listed twice in the program research");
  if (!NO_CHANGE_LOG)
    for (const s of SUPERSEDED.programText)
      if (!hit.has(`${s.program}|${s.text}`)) lapsed.push(`SUPERSEDED.programText ${s.program}: "${s.text.slice(0, 50)}…" no longer appears`);
  return out.sort((a, b) => Number(a.kind === "hotel") - Number(b.kind === "hotel") || a.name.localeCompare(b.name));
}

const ISSUER_NAME: Record<BankCurrencyId, RegExp> = {
  "amex-mr": /\b(?:Amex|American Express)\b/,
  "chase-ur": /\bChase\b/,
  "capital-one": /\bCapital One\b/,
  "citi-typ": /\bCiti\b/,
  bilt: /\bBilt\b/,
  "wells-fargo": /\bWells Fargo\b/,
};
const longDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

/**
 * Program text that lists the banks transferring in ("Amex, Capital One and Citi transfer in 1:1") was written before
 * the partner-change log added a bank. For each partner the log added, such a summary gets a sentence and such a
 * strength a clause naming the new bank, its ratio and the date, so the lists stay complete.
 */
function noteAddedPartners(programs: AwardProgram[], transfers: TransferPartner[], currencies: BankCurrency[], changes: PartnerChange[]) {
  const issuer = new Map(currencies.map((c) => [c.id, c.issuer]));
  const lists = (t: string) => /transfer/i.test(t) && Object.values(ISSUER_NAME).filter((re) => re.test(t)).length >= 2;
  const added = (r: TransferPartner) =>
    changes.some((c) => c.change === "added" && c.date === r.changedOn && c.currency === r.currency && c.program === r.program);
  for (const row of transfers.filter((r) => r.changedOn && !r.cards && added(r))) {
    const p = programs.find((x) => x.id === row.program);
    if (!p || ISSUER_NAME[row.currency].test(p.summary)) continue;
    const name = issuer.get(row.currency) ?? row.currency;
    const unit = row.currency === "capital-one" ? "miles" : "points";
    const ratio = reduceRatio(row.from, row.to, 20) ?? `${row.from}:${row.to}`;
    const parts = sentences(p.summary);
    const at = parts.findIndex(lists);
    if (at >= 0) {
      parts.splice(at + 1, 0, `${name} ${unit} also transfer in at ${ratio}, since ${longDate(row.changedOn!)}.`);
      p.summary = parts.join(" ");
      applied.push(`${p.id} summary: added ${name} (${ratio}, ${row.changedOn}; partner-change log)`);
    }
    p.strengths = p.strengths.map((s) => {
      if (!lists(s) || ISSUER_NAME[row.currency].test(s)) return s;
      applied.push(`${p.id} strengths: added ${name} to "${s.slice(0, 50)}…" (partner-change log)`);
      return `${s} (and ${name} at ${ratio}, since ${longDate(row.changedOn!)})`;
    });
  }
}

// ---------------------------------------------------------------------------------------------------- Sweet spots

const CABINS: Cabin[] = ["economy", "premium economy", "business", "first"];
const FEES: FeeLevel[] = ["low", "moderate", "high"];

function importSweetSpots(tracks: (Track | null)[]): SweetSpot[] {
  const perTrack: SweetSpot[][] = [];
  for (const t of tracks) {
    const date = verifiedAt(t);
    const spots: SweetSpot[] = [];
    for (const s of list(t, "sweetSpots")) {
      const where = `${t?.label}: ${String(s.id)}`;
      const stale = SUPERSEDED.sweetSpots.find((x) => x.id === s.id && x.points === s.points && x.pointsMax === (s.pointsMax ?? undefined));
      if (stale) {
        skipped.push(`${where}: superseded (${stale.reason})`);
        continue;
      }
      const kind = s.kind === "hotel" ? "hotel" : "flight";
      const from = (s.fromRegion ?? s.from) as Region;
      const to = (s.toRegion ?? s.to) as Region;
      const cabin = s.cabin === null || s.cabin === undefined ? undefined : (s.cabin as Cabin);
      const text = (v: unknown) => {
        const t = str(v);
        return t ? prose(t) : undefined;
      };
      const spot: SweetSpot = {
        id: str(s.id) ?? "",
        kind,
        program: s.program as ProgramId,
        title: text(s.title) ?? "",
        operatedBy: strings(s.operatedBy),
        from,
        to,
        destinations: strings(s.destinations),
        ...(cabin ? { cabin } : {}),
        points: num(s.points) ?? 0,
        ...(num(s.pointsMax) ? { pointsMax: num(s.pointsMax) } : {}),
        per: s.per as SweetSpot["per"],
        fees: s.fees as FeeLevel,
        ...(text(s.feesNote) ? { feesNote: text(s.feesNote) } : {}),
        howToBook: text(s.howToBook) ?? "",
        ...(text(s.caveats) ? { caveats: text(s.caveats) } : {}),
        sources: urls(s.sources, where),
        lastVerified: isIso(s.lastVerified) ? s.lastVerified : date,
      };
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(spot.id)) fail(`${where}: id isn't kebab-case`);
      if (!isProgram(spot.program)) fail(`${where}: unknown program`);
      if (!REGIONS.includes(from) || !REGIONS.includes(to)) fail(`${where}: unknown region ${from} / ${to}`);
      if (kind === "flight" && (!cabin || !CABINS.includes(cabin))) fail(`${where}: flight without a valid cabin`);
      if (kind === "hotel" && (cabin || spot.per !== "night" || from !== to)) fail(`${where}: hotels are per night, same region, no cabin`);
      if (!FEES.includes(spot.fees)) fail(`${where}: unknown fee level`);
      if (!(spot.points > 0) || (spot.pointsMax !== undefined && spot.pointsMax < spot.points)) fail(`${where}: bad points range`);
      if (!spot.title || !spot.howToBook || !spot.operatedBy.length || !spot.destinations.length || !spot.sources.length)
        fail(`${where}: title, howToBook, operatedBy, destinations or sources missing`);
      spots.push(spot);
    }
    perTrack.push(spots);
  }
  const all = perTrack.flat();
  const ids = all.map((s) => s.id);
  if (new Set(ids).size !== ids.length) fail("a sweet spot id is used twice");
  const research = tracks.flatMap((t) => list(t, "sweetSpots"));
  for (const x of SUPERSEDED.sweetSpots)
    if (!research.some((s) => s.id === x.id && s.points === x.points && (s.pointsMax ?? undefined) === x.pointsMax))
      lapsed.push(`SUPERSEDED.sweetSpots ${x.id} (${x.points}–${x.pointsMax ?? ""}): the research no longer has this price`);
  return featuredOrder(perTrack);
}

/**
 * Featured order: tracks interleaved (each track's own ranking), then greedily the spot least like the last few picked
 * (another program, region and cabin). After the hub's first three, a program that has fallen behind its even share
 * of the list (AAdvantage and Atmos have about ten spots each) is preferred, so the big programs are spread through
 * the list instead of piling up at the end.
 */
function featuredOrder(perTrack: SweetSpot[][]): SweetSpot[] {
  const base: SweetSpot[] = [];
  for (let i = 0; base.length < perTrack.flat().length; i++) for (const t of perTrack) if (t[i]) base.push(t[i]);
  const total = new Map<string, number>();
  for (const s of base) total.set(s.program, (total.get(s.program) ?? 0) + 1);
  const out: SweetSpot[] = [];
  const placed = new Map<string, number>();
  const left = [...base];
  while (left.length) {
    const recent = out.slice(-3);
    const last = out[out.length - 1];
    const behind = (s: SweetSpot) =>
      out.length < 3 ? 0 : Math.max(0, ((out.length + 1) * total.get(s.program)!) / base.length - (placed.get(s.program) ?? 0));
    const penalty = (s: SweetSpot) =>
      recent.filter((r) => r.program === s.program).length * 4 +
      recent.slice(-2).filter((r) => r.to === s.to).length * 3 +
      (last && (last.cabin ?? last.kind) === (s.cabin ?? s.kind) ? 1 : 0) -
      behind(s) * 2;
    let best = 0;
    for (let i = 1; i < left.length; i++) if (penalty(left[i]) < penalty(left[best])) best = i;
    const pick = left.splice(best, 1)[0];
    placed.set(pick.program, (placed.get(pick.program) ?? 0) + 1);
    out.push(pick);
  }
  return out;
}

// --------------------------------------------------------------------------------------------------------- Photos

function importPhotos(dir: string | undefined) {
  const result = {
    regionPhotos: {} as Partial<Record<Region, Photo>>,
    airportPhotos: {} as Record<string, Photo>,
    loungePhotos: {} as Record<string, Photo>,
    miscPhotos: {} as Record<string, Photo>,
    label: "none",
  };
  // The verified manifest (photos chosen and credit-checked by hand) and the automatic one; verified wins on a clash.
  const files = ["photos.verified.json", "photos.auto.json"].filter((f) => dir && existsSync(join(dir, f)));
  if (!dir || files.length === 0) return result;
  result.label = files.map((f) => `A/${f}`).join(" + ");
  const manifest: Record<string, Record<string, Json>> = {};
  for (const f of files) {
    const m = JSON.parse(readFileSync(join(dir, f), "utf8")) as Record<string, Record<string, Json>>;
    for (const [group, entries] of Object.entries(m)) manifest[group] = { ...(entries ?? {}), ...(manifest[group] ?? {}) };
  }
  const codes = new Set(airports.map((a) => a.code));
  const loungeIds = new Set(lounges.map((l) => l.id));
  const groups: [string, Record<string, Photo>, (k: string) => boolean][] = [
    ["regions", result.regionPhotos as Record<string, Photo>, (k) => (REGIONS as readonly string[]).includes(k)],
    ["airports", result.airportPhotos, (k) => codes.has(k)],
    ["lounges", result.loungePhotos, (k) => loungeIds.has(k)],
    ["misc", result.miscPhotos, (k) => /^[a-z0-9-]+$/.test(k)],
  ];
  for (const [group, target, validKey] of groups) {
    for (const [key, p] of Object.entries(manifest[group] ?? {})) {
      const where = `photos ${group}/${key}`;
      // "CC-BY-SA-4.0" → "cc by-sa 4.0"
      const license = (str(p.license) ?? "").toLowerCase().replace(/\s+/g, " ").replace(/^cc-by/, "cc by").replace(/-(\d)/, " $1");
      const title = str(p.title) ?? "";
      // Commons descriptions make poor alt text when they're a template ("identified by ID") or a long caption: use
      // the caption's first sentence when that's short enough, else the title.
      let alt = str(p.alt) ?? "";
      const template = /identified by ID|^this is a photo of/i.test(alt);
      if (title && (template || alt.length > 160)) {
        const first = sentences(alt)[0] ?? "";
        const next = !template && first.length <= 160 ? first : title.replace(/\s+\d+$/, "");
        applied.push(`${where}: alt text "${alt.slice(0, 40)}…" shortened to "${next}"`);
        alt = next;
      }
      const altFix = ALT_FIXES.find((f) => f.src === str(p.src) && f.alt === alt);
      if (altFix) {
        applied.push(`${where}: alt text "${alt}" → "${altFix.replace}" (garbled caption)`);
        alt = altFix.replace;
      }
      const photo: Photo = {
        src: str(p.src) ?? "",
        width: num(p.width) ?? 0,
        height: num(p.height) ?? 0,
        alt,
        title,
        author: str(p.author) ?? "",
        license: str(p.license) ?? "",
        ...(isHttps(p.licenseUrl) ? { licenseUrl: p.licenseUrl } : {}),
        sourcePage: str(p.sourcePage) ?? "",
      };
      const problem = !validKey(key)
        ? "unknown key"
        : !/^\/photos\/[\w./-]+\.(webp|jpe?g|png|avif)$/i.test(photo.src)
          ? "bad src"
          : !existsSync(join(ROOT, "public", photo.src))
            ? `file public${photo.src} is missing`
            : !(photo.width > 0 && photo.height > 0)
              ? "no size"
              : !photo.alt || !photo.title || !photo.author || /^unknown/i.test(photo.author)
                ? "credit fields incomplete"
                : !LICENSE_OK.test(license) || /\b(nc|nd)\b|non-?commercial|no ?deriv/i.test(license)
                  ? `license ${photo.license} isn't CC0, public domain, CC BY or CC BY-SA`
                  : !isHttps(photo.sourcePage)
                    ? "sourcePage isn't https"
                    : null;
      if (problem) skipped.push(`${where}: ${problem}`);
      else target[key] = photo;
    }
  }
  return result;
}

// -------------------------------------------------------------------------------------------------- Booking rules

function importBookingRules(tracks: (Track | null)[]): BookingRules[] {
  const out: BookingRules[] = [];
  for (const t of tracks) {
    for (const p of list(t, "programs")) {
      const where = `${t?.label}: ${String(p.id)}`;
      if (!isProgram(p.id)) {
        skipped.push(`${where}: program isn't in PROGRAM_IDS`);
        continue;
      }
      const days = num(p.bookingWindowDays);
      const rules: BookingRules = {
        program: p.id,
        holds: known(p.holds),
        stopovers: known(p.stopovers),
        phoneFee: known(p.phoneFee),
        partnerFee: known(p.partnerFee),
        changeCancel: known(p.changeCancel),
        bookingWindowDays: days && days > 0 ? days : null,
        phoneOnlyPartners: known(p.offlineOnlyPartners ?? p.phoneOnlyPartners),
        fuelSurcharges: known(p.fuelSurcharges),
        asOf: isMonthOrIso(p.asOf) ? p.asOf : verifiedAt(t),
        sources: urls(p.sources, where),
      };
      const notes = bookingNotes(p.notes);
      // A bridge program (Virgin Red) whose every rule repeats one "uses Flying Club's rules" sentence has no rules of
      // its own: keep the sentence as a note and point at the other program instead of counting it seven times.
      const bridge = PROGRAM_BRIDGES.find((b) => b.from === p.id);
      const texts = (["holds", "stopovers", "phoneFee", "partnerFee", "changeCancel", "phoneOnlyPartners", "fuelSurcharges"] as const)
        .map((k) => rules[k])
        .filter((v): v is string => v !== null);
      if (bridge && texts.length >= 3 && new Set(texts).size === 1) {
        for (const k of ["holds", "stopovers", "phoneFee", "partnerFee", "changeCancel", "phoneOnlyPartners", "fuelSurcharges"] as const) rules[k] = null;
        rules.bookingWindowDays = null;
        rules.sameAs = bridge.to;
        notes.unshift(texts[0]);
        applied.push(`${p.id} booking rules: the same sentence in ${texts.length} rules → sameAs ${bridge.to} (none counted as confirmed)`);
      }
      if (notes.length) rules.notes = notes;
      out.push(rules);
    }
  }
  for (const fix of BOOKING_RULE_FIXES) {
    const r = out.find((x) => x.program === fix.program && x.bookingWindowDays === fix.when.bookingWindowDays);
    if (!r) {
      lapsed.push(`BOOKING_RULE_FIXES ${fix.program}: no longer a ${fix.when.bookingWindowDays}-day window (${fix.reason})`);
      continue;
    }
    r.sources = dedupe([...r.sources, ...fix.addSources]);
    applied.push(`${fix.program} booking rules: sources added for the ${fix.when.bookingWindowDays}-day window (${fix.reason})`);
  }
  const ids = out.map((r) => r.program);
  if (new Set(ids).size !== ids.length) fail("a program has booking rules in both booking-rules files");
  return out.sort((a, b) => programNames[a.program].name.localeCompare(programNames[b.program].name));
}

// ---------------------------------------------------------------------------------------------------- Who can book

function importAirlines(t: Track | null): { airlines: BookableAirline[]; notes: ProgramBookingNote[]; caveats: string[]; asOf: string } {
  const airlines: BookableAirline[] = [];
  for (const a of list(t, "airlines")) {
    const where = `${t?.label}: ${String(a.iata)}`;
    const iata = str(a.iata) ?? "";
    if (!/^[A-Z0-9]{2}$/.test(iata)) fail(`${where}: bad IATA code`);
    const alliance = a.alliance === null || a.alliance === undefined ? undefined : (a.alliance as Alliance);
    if (alliance && !ALLIANCES.includes(alliance)) fail(`${where}: unknown alliance`);
    const own = a.ownProgram === null || a.ownProgram === undefined ? undefined : a.ownProgram;
    if (own !== undefined && !isProgram(own)) fail(`${where}: unknown ownProgram ${String(own)}`);
    const bookable = dedupe(strings(a.bookableWith));
    for (const p of bookable) if (!isProgram(p)) fail(`${where}: unknown program ${p}`);
    const restrictions = userFacing(a.restrictions);
    const notes = userFacing(a.notes);
    // A listing the research dates ("Drop or relabel this entry after December 17, 2026, when …"): pages show it as
    // ending on that date and stop listing it as bookable from then on (after hydration, by the viewer's date).
    const until = /\bDrop or relabel this entry after ([A-Z][a-z]+ \d{1,2}, \d{4})\b/.exec(str(a.notes) ?? "")?.[1];
    const endsOn = until ? isoFromWords(until) : undefined;
    if (until && !endsOn) fail(`${where}: can't read the date in "${until}"`);
    if (endsOn) applied.push(`who-can-book ${iata}: listing ends on ${endsOn} (the research says to drop or relabel it then)`);
    airlines.push({
      iata,
      name: str(a.airline) ?? iata,
      ...(alliance ? { alliance } : {}),
      ...(isProgram(own) ? { ownProgram: own } : {}),
      bookableWith: bookable.filter(isProgram),
      ...(restrictions ? { restrictions } : {}),
      ...(notes ? { notes } : {}),
      ...(endsOn ? { endsOn } : {}),
      asOf: isMonthOrIso(a.asOf) ? a.asOf : verifiedAt(t),
      sources: urls(a.sources, where),
    });
  }
  const codes = airlines.map((a) => a.iata);
  if (new Set(codes).size !== codes.length) fail("an airline is listed twice in who-can-book");
  const notes: ProgramBookingNote[] = [];
  for (const n of list(t, "programNotes")) {
    if (!isProgram(n.program)) {
      fail(`${t?.label}: programNotes for unknown program ${String(n.program)}`);
      continue;
    }
    const text = userFacing(n.notes);
    if (text) notes.push({ program: n.program, notes: text, sources: urls(n.sources, `${String(n.program)} note`) });
  }
  // The general caveats (how the lists were built), with program ids written as names.
  const meta = (t?.data.meta ?? {}) as Json;
  const idNames = (s: string) => s.replace(/\b[a-z]+(?:-[a-z]+)+\b/g, (id) => (isProgram(id) ? programNames[id].name : id));
  const caveats = strings(meta.caveats)
    .map((c) => userFacing(idNames(c)))
    .filter((c): c is string => Boolean(c));
  return { airlines, notes, caveats, asOf: isMonthOrIso(meta.asOf) ? meta.asOf : verifiedAt(t) };
}

/** "LATAM Airlines" and "LATAM" → "latam": operator names in sweet spots and airline names in who-can-book. */
const airlineKey = (name: string) =>
  name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\b(?:airlines?|airways|air lines)\b/g, "")
    .replace(/[^a-z0-9]/g, "");

/**
 * Every airline a verified flight sweet spot books with its program is listed as bookable with that program (with the
 * sweet spot's sources), so who-can-book never contradicts a sweet spot. Operators who-can-book lacks are added from
 * EXTRA_AIRLINES; an operator found in neither fails the import.
 */
function unionSweetSpotAirlines(airlines: BookableAirline[], spots: SweetSpot[], notes: ProgramBookingNote[]) {
  const added = new Map<ProgramId, Set<string>>();
  for (const s of spots.filter((x) => x.kind === "flight")) {
    for (const op of s.operatedBy) {
      const key = airlineKey(op);
      let a = airlines.find((x) => airlineKey(x.name) === key);
      if (!a) {
        const extra = EXTRA_AIRLINES[key];
        if (!extra) {
          fail(`sweet spot ${s.id}: operator "${op}" isn't in who-can-book; add it to EXTRA_AIRLINES`);
          continue;
        }
        if (airlines.some((x) => x.iata === extra.iata)) fail(`EXTRA_AIRLINES ${extra.name}: IATA ${extra.iata} is taken`);
        a = { iata: extra.iata, name: extra.name, ...(extra.alliance ? { alliance: extra.alliance } : {}), bookableWith: [], asOf: s.lastVerified, sources: [] };
        airlines.push(a);
        applied.push(`who-can-book ${extra.iata} ${extra.name}: added (flown in sweet spot ${s.id})`);
      }
      if (a.bookableWith.includes(s.program)) continue;
      a.bookableWith.push(s.program);
      // who-can-book lists a bridge program (Virgin Red) wherever the program it spends through is listed.
      for (const b of PROGRAM_BRIDGES) if (b.to === s.program && !a.bookableWith.includes(b.from)) a.bookableWith.push(b.from);
      a.sources = dedupe([...a.sources, ...s.sources]);
      added.set(s.program, new Set([...(added.get(s.program) ?? []), a.name]));
      applied.push(`who-can-book ${a.iata}: + ${s.program} (sweet spot ${s.id})`);
    }
  }
  // A program note that lists partners ("Redeemable partners in late 2026: …") gains the airlines its sweet spots add.
  for (const [program, names] of added) {
    const note = notes.find((n) => n.program === program);
    const missing = [...names].filter((n) => note && !note.notes.includes(n.replace(/ Airlines$/, "")));
    if (!note || missing.length === 0) continue;
    const list = missing.length === 1 ? missing[0] : `${missing.slice(0, -1).join(", ")} and ${missing[missing.length - 1]}`;
    note.notes = `${note.notes} ${programNames[program].name} also books ${list} (see its sweet spots).`;
    applied.push(`${program} booking note: added ${list} (sweet spots)`);
  }
}

// ----------------------------------------------------------------------------------------------------- Valuations

function importValuations(t: Track | null) {
  const editions: ValuationEdition[] = Object.values((t?.data.datasets ?? {}) as Record<string, Json>).map((d) => ({
    outlet: str(d.outlet) ?? "",
    url: str(d.url) ?? "",
    edition: str(d.edition) ?? "",
    ...(isIso(d.published) ? { published: d.published } : {}),
    ...(isIso(d.modified) ? { modified: d.modified } : {}),
    readOn: isIso(d.readOn) ? d.readOn : verifiedAt(t),
    method: str(d.method) ?? "",
  }));
  for (const e of editions) if (!e.outlet || !isHttps(e.url) || !isMonthOrIso(e.edition)) fail(`${t?.label}: bad dataset ${e.outlet}`);
  const values: PointValue[] = [];
  for (const v of list(t, "valuations")) {
    const id = v.id;
    const where = `${t?.label}: ${String(id)}`;
    if (!isProgram(id) && !isCurrency(id)) {
      skipped.push(`${where}: not a currency or program we cover`);
      continue;
    }
    const outlets: OutletValue[] = (Array.isArray(v.values) ? (v.values as Json[]) : []).map((x) => ({
      outlet: str(x.source) ?? "",
      cents: num(x.cents) ?? Number.NaN,
      ...(num(x.previousCents) ? { previousCents: num(x.previousCents) } : {}),
      asOf: str(x.asOf) ?? "",
      url: str(x.url) ?? "",
      ...(str(x.method) ? { method: str(x.method) } : {}),
      ...(userFacing(x.note) ? { note: userFacing(x.note) } : {}),
      ...(Array.isArray(x.variants) && x.variants.length
        ? { variants: (x.variants as Json[]).map((y) => ({ appliesTo: str(y.appliesTo) ?? "", cents: num(y.cents) ?? Number.NaN })) }
        : {}),
    }));
    const entry: PointValue = {
      id,
      low: num(v.low) ?? Number.NaN,
      median: num(v.median) ?? Number.NaN,
      high: num(v.high) ?? Number.NaN,
      values: outlets,
      ...(userFacing(v.note) ? { note: userFacing(v.note) } : {}),
      sources: urls(v.sources, where),
    };
    const cents = outlets.map((o) => o.cents);
    if (!outlets.length || cents.some((c) => !(c > 0)) || outlets.some((o) => !o.outlet || !isHttps(o.url) || !isMonthOrIso(o.asOf)))
      fail(`${where}: an outlet value is incomplete`);
    if (entry.low !== Math.min(...cents) || entry.high !== Math.max(...cents) || !(entry.median >= entry.low && entry.median <= entry.high))
      fail(`${where}: low/median/high don't match the outlet values`);
    values.push(entry);
  }
  const missing = list(t, "missing").map((m) => m.id).filter((id): id is ProgramId | BankCurrencyId => isProgram(id) || isCurrency(id));
  for (const id of missing) if (values.some((v) => v.id === id)) fail(`${t?.label}: ${id} is both valued and missing`);
  return { editions, values, missing };
}

// ---------------------------------------------------------------------------------------------- Transfer extras

const CHANGE_KINDS: PartnerChangeKind[] = ["added", "removed", "ratio changed", "access expanded"];

function importExtras(t: Track | null, otherNames: Map<string, string>) {
  const hotelToAirline: HotelToAirline[] = [];
  for (const r of list(t, "hotelToAirline")) {
    const where = `${t?.label}: ${String(r.from)} → ${String(r.program)}`;
    if (!isProgram(r.from) || programNames[r.from].kind !== "hotel") {
      fail(`${where}: from isn't a hotel program`);
      continue;
    }
    const program = str(r.program) ?? "";
    const fromPoints = num(r.fromPoints);
    const toMiles = num(r.toMiles);
    if (!program || !fromPoints || !toMiles) {
      fail(`${where}: program or ratio missing`);
      continue;
    }
    if (!isProgram(program)) otherNames.set(program, str(r.programName) ?? program);
    // Hotel rates run up to 200:1 (Marriott to Air New Zealand), so prose() reduces them with a larger limit.
    const notes = userFacing(r.notes, 200);
    // A minimum the research states only in the notes ("Upgraded Points lists a 20,000-point minimum").
    const stated = num(r.minimum) ?? conversionLimits(notes).minimum;
    if (!num(r.minimum) && stated) applied.push(`${r.from} → ${program}: minimum ${stated} read from the notes`);
    hotelToAirline.push({
      from: r.from,
      program,
      programName: nameOf(program, str(r.programName)),
      fromPoints,
      toMiles,
      ...(num(r.bonusMilesPer60k) !== undefined ? { bonusMilesPer60k: num(r.bonusMilesPer60k) } : {}),
      ...(stated ? { minimum: stated } : {}),
      ...(notes ? { notes } : {}),
      asOf: isIso(r.asOf) ? r.asOf : verifiedAt(t),
      sources: urls(r.sources, where),
    });
  }
  const rules: HotelTransferRule[] = [];
  const fixedHotelRules = new Set<ProgramId>();
  for (const r of list(t, "hotelTransferRules")) {
    const where = `${t?.label}: ${String(r.from)} rules`;
    if (!isProgram(r.from)) {
      fail(`${where}: unknown hotel program`);
      continue;
    }
    const exceptions = (Array.isArray(r.exceptions) ? (r.exceptions as Json[]) : []).map((e) => ({
      program: str(e.program) ?? "",
      programName: nameOf(str(e.program) ?? "", otherNames.get(str(e.program) ?? "")),
      bonusMiles: num(e.bonusMiles) ?? 0,
    }));
    let rule = userFacing(r.rule, 200) ?? "";
    // Limits the rule states in words ("convert 3,000 to 240,000 points a day", "a 6,000-point minimum").
    const limits = conversionLimits(rule);
    if (Object.keys(limits).length) applied.push(`${r.from} rules: ${Object.entries(limits).map(([k, v]) => `${k} ${v}`).join(", ")} read from the rule text`);
    const sources = urls(r.sources, where);
    // A minimum the cited page states but the rule leaves out (HOTEL_RULE_FIXES).
    const fix = HOTEL_RULE_FIXES.find((f) => f.from === r.from);
    if (fix && limits.minimum === undefined && sources.includes(fix.source)) {
      limits.minimum = fix.set.minimum;
      rule = `${rule} ${fix.sentence}`;
      applied.push(`${r.from} rules: minimum ${fix.set.minimum} (${fix.reason})`);
      fixedHotelRules.add(fix.from);
    }
    rules.push({
      from: r.from,
      ...(num(r.everyPoints) ? { everyPoints: num(r.everyPoints) } : {}),
      ...(num(r.bonusMiles) ? { bonusMiles: num(r.bonusMiles) } : {}),
      ...(str(r.standardRatio) ? { standardRatio: str(r.standardRatio) } : {}),
      ...(exceptions.length ? { exceptions } : {}),
      ...limits,
      rule,
      asOf: isIso(r.asOf) ? r.asOf : verifiedAt(t),
      sources,
    });
  }
  for (const f of HOTEL_RULE_FIXES)
    if (!fixedHotelRules.has(f.from)) lapsed.push(`HOTEL_RULE_FIXES ${f.from}: the rule states a minimum now, or no longer cites ${f.source}`);
  const bonuses: TransferBonus[] = [];
  for (const b of list(t, "activeBonuses")) {
    const where = `${t?.label}: bonus ${String(b.currency)} → ${String(b.program)}`;
    if (!isCurrency(b.currency) || !isProgram(b.program)) {
      skipped.push(`${where}: currency or program we don't cover`);
      continue;
    }
    const notes = userFacing(b.notes);
    const cap = notes ? /\bcapped at (\d{1,3}(?:,\d{3})+|\d+)(?: bonus)? miles\b/i.exec(notes) : null;
    if (cap) applied.push(`bonus ${b.currency} → ${b.program}: at most ${cap[1]} bonus miles, read from the notes`);
    const bonus: TransferBonus = {
      currency: b.currency,
      program: b.program,
      bonusPercent: num(b.bonusPercent) ?? 0,
      from: num(b.from) ?? 0,
      to: num(b.to) ?? 0,
      starts: str(b.starts) ?? "",
      startsBasis: str(b.startsBasis) ?? "",
      ends: str(b.ends) ?? "",
      targeted: b.targeted === true,
      ...(strings(b.cards).length ? { cards: strings(b.cards) } : {}),
      ...(cap ? { maxBonusMiles: Number(cap[1].replace(/,/g, "")) } : {}),
      ...(notes ? { notes } : {}),
      sources: urls(b.sources, where),
    };
    if (!isIso(bonus.starts) || !isIso(bonus.ends) || bonus.ends < bonus.starts) fail(`${where}: bad dates`);
    if (!(bonus.from > 0 && bonus.to > 0 && bonus.bonusPercent > 0)) fail(`${where}: bad ratio or percent`);
    bonuses.push(bonus);
  }
  const changes: PartnerChange[] = [];
  for (const c of list(t, "partnerChanges")) {
    const where = `${t?.label}: change ${String(c.date)} ${String(c.currency)} → ${String(c.program ?? c.programs)}`;
    if (!isCurrency(c.currency)) {
      fail(`${where}: unknown currency`);
      continue;
    }
    const change = c.change as PartnerChangeKind;
    if (!CHANGE_KINDS.includes(change)) fail(`${where}: unknown change ${String(c.change)}`);
    const program = str(c.program);
    const group = str(c.programs);
    const detail = userFacing(c.detail) ?? "";
    changes.push({
      date: str(c.date) ?? "",
      currency: c.currency,
      ...(program ? { program } : {}),
      programName: program
        ? nameOf(program, otherNames.get(program))
        : group
          ? prose(group.charAt(0).toUpperCase() + group.slice(1))
          : "",
      change,
      status: str(c.status) ?? "",
      ...(isIso(c.announced) ? { announced: c.announced } : {}),
      detail,
      ...(strings(c.cards).length ? { cards: strings(c.cards) } : {}),
      sources: urls(c.sources, where),
    });
    const last = changes[changes.length - 1];
    if (!isIso(last.date) || !last.programName || !last.detail || !["in effect", "scheduled", "ended"].includes(last.status))
      fail(`${where}: date, name, detail or status missing`);
  }
  changes.sort((a, b) => b.date.localeCompare(a.date) || a.currency.localeCompare(b.currency));
  return { hotelToAirline, rules, bonuses, changes };
}

// ---------------------------------------------------------------------------------------------------- Generation

/** TS literal: unquoted identifier keys, short arrays and objects kept on one line. */
function lit(v: unknown, indent = ""): string {
  const next = indent + "  ";
  if (v === undefined) return "undefined";
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  const key = (k: string) => (/^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k));
  if (Array.isArray(v)) {
    const parts = v.map((x) => lit(x, next));
    const flat = `[${parts.join(", ")}]`;
    return flat.length + indent.length <= 110 && !flat.includes("\n") ? flat : `[\n${parts.map((p) => next + p).join(",\n")},\n${indent}]`;
  }
  const entries = Object.entries(v as Json).filter(([, x]) => x !== undefined);
  if (entries.length === 0) return "{}";
  const parts = entries.map(([k, x]) => `${key(k)}: ${lit(x, next)}`);
  const flat = `{ ${parts.join(", ")} }`;
  return flat.length + indent.length <= 110 && !flat.includes("\n") ? flat : `{\n${parts.map((p) => next + p).join(",\n")},\n${indent}}`;
}

const outputs: { file: string; body: string }[] = [];
function emit(file: string, sources: string[], imports: string, decls: [string, string, unknown][]) {
  const head = [
    "// Generated by scripts/import-points-research.ts (npm run points:import). Don't edit by hand: fix the research",
    "// and re-run the importer. Sources:",
    ...sources.map((s) => `//   ${s}`),
    imports,
    "",
  ];
  const body = decls.map(([name, type, value]) => `export const ${name}: ${type} = ${lit(value)};\n`).join("\n");
  outputs.push({ file, body: `${head.join("\n")}\n${body}` });
}
const srcLine = (t: Track | null) => (t ? `${t.label} (verified ${String(t.data.verifiedAt ?? "?")})` : "(missing)");

// ------------------------------------------------------------------------------------------------------------ Main

async function main() {
  const dirA = flag("a") ?? process.env.POINTS_RESEARCH_A;
  const dirB = flag("b") ?? process.env.POINTS_RESEARCH_B;
  if (!dirA || !dirB) {
    console.error("Usage: npm run points:import -- --a <research dir A> --b <research dir B> [--dry-run]");
    process.exit(2);
  }
  const A = (track: string) => readTrack(dirA, "A", track);
  const B = (track: string) => readTrack(dirB, "B", track);

  const transferTracks = [A("transfers-a"), A("transfers-b")];
  const programTracks = [A("programs-air-a"), A("programs-air-b"), A("programs-hotel")];
  const spotTracks = [A("sweet-flights-b"), A("sweet-flights-a"), A("sweet-hotels")];
  const ruleTracks = [B("booking-rules-a"), B("booking-rules-b")];
  const whoTrack = B("who-can-book");
  const valueTrack = B("valuations");
  const extraTrack = B("transfer-extras");

  collectPillRates(transferTracks, extraTrack);
  const currencies = importCurrencies(transferTracks);
  const researched = importTransfers(transferTracks);
  // Names of programs we don't cover, from any research row that gives one.
  const otherNames = new Map<string, string>(Object.entries(OTHER_NAMES));
  for (const t of transferTracks) for (const p of list(t, "partners")) if (!isProgram(p.program) && str(p.programName)) otherNames.set(String(p.program), str(p.programName)!);
  const extras = importExtras(extraTrack, otherNames);
  const transfers = reconcile(researched, NO_CHANGE_LOG ? [] : extras.changes);
  const programs = importPrograms(programTracks);
  if (!NO_CHANGE_LOG) noteAddedPartners(programs, transfers, currencies, extras.changes);
  const sweetSpots = importSweetSpots(spotTracks);
  const photos = importPhotos(dirA);
  const bookingRules = importBookingRules(ruleTracks);
  const who = importAirlines(whoTrack);
  unionSweetSpotAirlines(who.airlines, sweetSpots, who.notes);
  const values = importValuations(valueTrack);

  // Card ids, checked against the card data when it loads (it reads the current generated modules).
  try {
    const { cards } = await import("../src/shared/data/cards");
    const ids = new Set(cards.map((c) => c.id));
    const used = [
      ...transfers.flatMap((p) => (p.cards ?? []).map((id) => [`${p.currency} → ${p.program}`, id])),
      ...extras.bonuses.flatMap((b) => (b.cards ?? []).map((id) => [`bonus ${b.currency} → ${b.program}`, id])),
      ...extras.changes.flatMap((c) => (c.cards ?? []).map((id) => [`change ${c.date} ${c.currency}`, id])),
    ];
    for (const [where, id] of used) if (!ids.has(id)) fail(`${where}: unknown card id ${id}`);
  } catch (e) {
    console.warn(`(card ids not checked: the card data didn't load: ${(e as Error).message})`);
  }

  // Referential checks across datasets.
  for (const s of sweetSpots) if (!programs.some((p) => p.id === s.program)) fail(`sweet spot ${s.id}: program ${s.program} has no guide`);
  for (const b of extras.bonuses)
    if (!transfers.some((p) => p.currency === b.currency && p.program === b.program))
      skipped.push(`bonus ${b.currency} → ${b.program}: kept, but the partner list has no such transfer`);

  if (errors.length) {
    console.error(`\n${errors.length} problem(s); nothing written:\n${errors.map((e) => `  ✗ ${e}`).join("\n")}`);
    process.exit(1);
  }

  emit("currencies.ts", transferTracks.map(srcLine), 'import type { BankCurrency } from "./types";', [
    ["bankCurrencies", "BankCurrency[]", currencies],
  ]);
  emit(
    "transfers.ts",
    [...transferTracks.map(srcLine), NO_CHANGE_LOG ? "(partner-change log not applied)" : `${srcLine(extraTrack)}: partner-change log applied`],
    'import type { TransferPartner } from "./types";',
    [
      ["transferPartners", "TransferPartner[]", transfers],
      ["changeLogApplied", "boolean", !NO_CHANGE_LOG],
    ],
  );
  // The partner list without ratios, notes or sources, for the card data (card-partners.ts names each card's partners
  // when the card files load, on every page): one row per currency, program and card list.
  const routes = Array.from(
    new Map(
      transfers.map((p) => {
        const r = { currency: p.currency, program: p.program, ...(p.cards ? { cards: p.cards } : {}) };
        return [JSON.stringify(r), r] as const;
      }),
    ).values(),
  );
  emit(
    "transfer-routes.ts",
    [...transferTracks.map(srcLine), "transfers.ts without ratios, notes or sources: which programs each currency (and card) reaches."],
    'import type { TransferRoute } from "./types";',
    [["transferRoutes", "TransferRoute[]", routes]],
  );
  emit("programs.ts", programTracks.map(srcLine), 'import type { AwardProgram } from "./types";', [["awardPrograms", "AwardProgram[]", programs]]);
  emit("sweet-spots.ts", [...spotTracks.map(srcLine), "Featured order computed by the importer (featuredOrder)."], 'import type { SweetSpot } from "./types";', [
    ["sweetSpots", "SweetSpot[]", sweetSpots],
  ]);
  emit("photos.ts", [photos.label], 'import type { Photo, Region } from "./types";', [
    ["regionPhotos", "Partial<Record<Region, Photo>>", photos.regionPhotos],
    ["airportPhotos", "Partial<Record<string, Photo>>", photos.airportPhotos],
    ["loungePhotos", "Partial<Record<string, Photo>>", photos.loungePhotos],
    ["miscPhotos", "Partial<Record<string, Photo>>", photos.miscPhotos],
  ]);
  emit("booking-rules.ts", ruleTracks.map(srcLine), 'import type { BookingRules } from "./types";', [["bookingRules", "BookingRules[]", bookingRules]]);
  emit("airlines.ts", [srcLine(whoTrack), `${spotTracks.map((t) => t?.label).join(", ")}: airlines the flight sweet spots book`], 'import type { BookableAirline, ProgramBookingNote } from "./types";', [
    ["bookableAirlines", "BookableAirline[]", who.airlines],
    ["programBookingNotes", "ProgramBookingNote[]", who.notes],
    ["whoCanBookCaveats", "string[]", who.caveats],
    ["whoCanBookAsOf", "string", who.asOf],
  ]);
  emit("valuations.ts", [srcLine(valueTrack)], 'import type { BankCurrencyId, PointValue, ProgramId, ValuationEdition } from "./types";', [
    ["valuationEditions", "ValuationEdition[]", values.editions],
    ["pointValues", "PointValue[]", values.values],
    ["unvaluedIds", "(BankCurrencyId | ProgramId)[]", values.missing],
  ]);
  emit("hotel-transfers.ts", [srcLine(extraTrack)], 'import type { HotelToAirline, HotelTransferRule } from "./types";', [
    ["hotelToAirline", "HotelToAirline[]", extras.hotelToAirline],
    ["hotelTransferRules", "HotelTransferRule[]", extras.rules],
  ]);
  emit("transfer-bonuses.ts", [srcLine(extraTrack)], 'import type { TransferBonus } from "./types";', [["transferBonuses", "TransferBonus[]", extras.bonuses]]);
  emit("partner-changes.ts", [srcLine(extraTrack)], 'import type { PartnerChange } from "./types";', [["partnerChanges", "PartnerChange[]", extras.changes]]);

  const pairs = new Set(transfers.map((p) => `${p.currency}>${p.program}`)).size;
  const photoCount = [photos.regionPhotos, photos.airportPhotos, photos.loungePhotos, photos.miscPhotos].reduce((n, g) => n + Object.keys(g).length, 0);
  console.log(
    [
      `currencies ${currencies.length} · transfer rows ${transfers.length} (${pairs} pairs) · programs ${programs.length}`,
      `sweet spots ${sweetSpots.length} · photos ${photoCount} (${photos.label}) · booking rules ${bookingRules.length}`,
      `airlines ${who.airlines.length} (+${who.notes.length} program notes) · valuations ${values.values.length} (none for ${values.missing.length})`,
      `hotel→airline ${extras.hotelToAirline.length} (+${extras.rules.length} rules) · bonuses ${extras.bonuses.length} · partner changes ${extras.changes.length}`,
    ].join("\n"),
  );
  if (applied.length) console.log(`\nApplied:\n${applied.map((s) => `  • ${s}`).join("\n")}`);
  if (skipped.length) console.log(`\nSkipped:\n${skipped.map((s) => `  – ${s}`).join("\n")}`);
  if (lapsed.length) console.log(`\nLapsed curation (delete these rules):\n${lapsed.map((s) => `  ? ${s}`).join("\n")}`);

  // What a real run would change in the shipped modules.
  const changed = outputs.filter((o) => {
    const path = join(OUT, o.file);
    return !existsSync(path) || readFileSync(path, "utf8") !== o.body;
  });
  if (DRY) {
    console.log(
      changed.length
        ? `\n--dry-run: nothing written. A real run would change ${changed.map((o) => o.file).join(", ")}.`
        : "\n--dry-run: nothing written. No changes: the shipped modules match the research.",
    );
    return;
  }
  for (const o of outputs) writeFileSync(join(OUT, o.file), o.body);
  console.log(`\nWrote ${outputs.map((o) => o.file).join(", ")} to src/shared/data/points/.`);
}

if (process.argv[1]?.endsWith("import-points-research.ts")) void main();
