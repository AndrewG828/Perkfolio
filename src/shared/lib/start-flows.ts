import type { Card } from "@/shared/data/types";
import { annualizedCreditValue, cards, featuredIds, getCard, isCashBack } from "@/shared/data/cards";
import { rateFor, type SpendCategory } from "@/shared/data/calculator-rates";
import { airportByCode, bigAirports, loungeCountByAirport } from "@/shared/lib/lounge-access";
import { shortCardName } from "@/shared/lib/card-name";
import { sweetSpotsHref, type SweetSpotRegion } from "@/shared/data/travel/regions";

/**
 * The "Start here" wizard: five guided flows of one-tap questions that end on the tools that answer them, with
 * parameters filled in. Answers live in the URL (/start?flow=trip&from=JFK&to=HND), one parameter per question.
 */

export type FlowId = "points" | "card" | "fee" | "trip" | "airport";
export type Answers = Partial<Record<string, string>>;

export interface StartContext {
  /** Card ids in the visitor's wallet (empty until hydrated). */
  wallet: string[];
}

export interface StartOption {
  value: string;
  label: string;
  hint?: string;
}

export interface StartQuestion {
  id: string;
  prompt: string;
  help?: string;
  options: (ctx: StartContext) => StartOption[];
  /** Asked only when this returns true for the answers so far. */
  when?: (a: Answers) => boolean;
  /** Answers accepted besides the listed options (e.g. any card id from a shared link). */
  accepts?: (value: string) => boolean;
}

export interface StartResult {
  /** Where to go, with parameters filled in. */
  href: string;
  title: string;
  body: string;
}

export interface StartFlow {
  id: FlowId;
  title: string;
  blurb: string;
  questions: StartQuestion[];
  results: (a: Answers, ctx: StartContext) => StartResult[];
}

const fixed = (options: StartOption[]) => () => options;
const qs = (params: Record<string, string | undefined>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : "";
};

// --- Shared option lists ---------------------------------------------------------------------------------------

const CURRENCIES: StartOption[] = [
  { value: "amex-mr", label: "Amex Membership Rewards" },
  { value: "chase-ur", label: "Chase Ultimate Rewards" },
  { value: "capital-one", label: "Capital One miles" },
  { value: "citi-typ", label: "Citi ThankYou points" },
  { value: "bilt", label: "Bilt Points" },
  { value: "wells-fargo", label: "Wells Fargo Rewards" },
  { value: "airline", label: "Airline miles" },
  { value: "hotel", label: "Hotel points" },
];
const BANK = new Set(["amex-mr", "chase-ur", "capital-one", "citi-typ", "bilt", "wells-fargo"]);

const REGIONS: { value: SweetSpotRegion | "anywhere"; label: string }[] = [
  { value: "Europe", label: "Europe" },
  { value: "Japan", label: "Japan" },
  { value: "East Asia", label: "Korea, China & Taiwan" },
  { value: "Southeast Asia", label: "Southeast Asia" },
  { value: "Hawaii", label: "Hawaii" },
  { value: "Caribbean", label: "The Caribbean" },
  { value: "Mexico & Central America", label: "Mexico & Central America" },
  { value: "South America", label: "South America" },
  { value: "Middle East", label: "Middle East" },
  { value: "Australia & New Zealand", label: "Australia & New Zealand" },
  { value: "Africa", label: "Africa" },
  { value: "anywhere", label: "Anywhere" },
];

const HOME_AIRPORTS = ["ATL", "BOS", "DEN", "DFW", "EWR", "IAD", "IAH", "JFK", "LAX", "MIA", "ORD", "SEA", "SFO"];
const CITY: Record<string, string> = {
  ATL: "Atlanta", BOS: "Boston", DEN: "Denver", DFW: "Dallas", EWR: "Newark", IAD: "Washington", IAH: "Houston",
  JFK: "New York", LAX: "Los Angeles", MIA: "Miami", ORD: "Chicago", SEA: "Seattle", SFO: "San Francisco",
};

/** Trip destinations: an airport, its country (for entry rules) and region (for sweet spots). */
export const TRIP_DESTINATIONS: { code: string; city: string; country: string | null; region: SweetSpotRegion }[] = [
  { code: "LHR", city: "London", country: "United Kingdom", region: "Europe" },
  { code: "CDG", city: "Paris", country: "France", region: "Europe" },
  { code: "FCO", city: "Rome", country: "Italy", region: "Europe" },
  { code: "LIS", city: "Lisbon", country: "Portugal", region: "Europe" },
  { code: "HND", city: "Tokyo", country: "Japan", region: "Japan" },
  { code: "ICN", city: "Seoul", country: "South Korea", region: "East Asia" },
  { code: "SIN", city: "Singapore", country: "Singapore", region: "Southeast Asia" },
  { code: "BKK", city: "Bangkok", country: "Thailand", region: "Southeast Asia" },
  { code: "DXB", city: "Dubai", country: "United Arab Emirates", region: "Middle East" },
  { code: "SYD", city: "Sydney", country: "Australia", region: "Australia & New Zealand" },
  { code: "HNL", city: "Honolulu", country: null, region: "Hawaii" },
  { code: "CUN", city: "Cancún", country: "Mexico", region: "Mexico & Central America" },
  { code: "GRU", city: "São Paulo", country: "Brazil", region: "South America" },
];

const AIRLINES: StartOption[] = [
  { value: "AA", label: "American" },
  { value: "DL", label: "Delta" },
  { value: "UA", label: "United" },
  { value: "AS", label: "Alaska" },
  { value: "B6", label: "JetBlue" },
  { value: "WN", label: "Southwest" },
  { value: "other", label: "Another airline" },
];

const SPEND: Record<string, { label: string; cats: SpendCategory[] }> = {
  dining: { label: "Dining out", cats: ["dining"] },
  groceries: { label: "Groceries", cats: ["groceries"] },
  travel: { label: "Travel", cats: ["flights", "hotels"] },
  gas: { label: "Gas & commuting", cats: ["gas", "otherTravel"] },
  everything: { label: "A bit of everything", cats: ["other"] },
};

const FEES: Record<string, { label: string; max: number }> = {
  "0": { label: "No annual fee", max: 0 },
  "100": { label: "Up to $100", max: 100 },
  "400": { label: "Up to $400", max: 400 },
  any: { label: "Any, if it pays for itself", max: Infinity },
};

const USAGE: Record<string, { label: string; share: number }> = {
  all: { label: "Nearly all of them", share: 0.9 },
  half: { label: "About half", share: 0.5 },
  little: { label: "Hardly any", share: 0.15 },
};

// --- Helpers used by results -------------------------------------------------------------------------------------

/** Return in percent for a spend category (points × our valuation, or the cash-back rate). */
function returnPct(card: Card, cat: SpendCategory) {
  const rate = rateFor(card, cat, false);
  return isCashBack(card) ? rate : rate * card.pointValueCents;
}

/** Up to three personal cards worth comparing for this spending and fee comfort. */
export function suggestCards(spend: string | undefined, fee: string | undefined, travel: string | undefined): string[] {
  const cats = SPEND[spend ?? ""]?.cats ?? ["other"];
  const max = FEES[fee ?? ""]?.max ?? Infinity;
  const traveler = travel === "often";
  return cards
    .filter((c) => c.category !== "business" && c.annualFee <= max)
    .map((c) => {
      const earn = Math.max(...cats.map((cat) => returnPct(c, cat)));
      const lounge = traveler && c.loungeAccess.length > 0 ? 1 : 0;
      return { c, score: earn + lounge };
    })
    .sort((a, b) => b.score - a.score || a.c.annualFee - b.c.annualFee)
    .slice(0, 3)
    .map((x) => x.c.id);
}

/** Credits you'd use vs the annual fee, before any points you earn. */
export function feeCheck(cardId: string | undefined, usage: string | undefined) {
  const card = cardId ? getCard(cardId) : undefined;
  if (!card) return null;
  const share = USAGE[usage ?? ""]?.share ?? 0.5;
  const credits = Math.round(annualizedCreditValue(card) * share);
  return { card, credits, fee: card.annualFee, net: credits - card.annualFee };
}

const airportLabel = (code: string) => {
  const a = airportByCode.get(code);
  return a ? `${a.city} (${code})` : code;
};

// --- Flows -----------------------------------------------------------------------------------------------------

export const START_FLOWS: StartFlow[] = [
  {
    id: "points",
    title: "I have points. What can I do?",
    blurb: "See what they're worth, where they transfer and the best awards for them.",
    questions: [
      { id: "currency", prompt: "Which points do you have the most of?", options: fixed(CURRENCIES) },
      {
        id: "goal",
        prompt: "What would you most like to use them for?",
        options: fixed([
          { value: "business", label: "Business or first class flights" },
          { value: "economy", label: "Economy flights for fewer points" },
          { value: "hotel", label: "Hotel nights" },
          { value: "unsure", label: "Not sure yet" },
        ]),
      },
      {
        id: "region",
        prompt: "Where would you like to go?",
        when: (a) => a.goal !== "unsure",
        options: fixed(REGIONS),
      },
    ],
    results: (a) => {
      const currency = a.currency ?? "";
      const name = CURRENCIES.find((c) => c.value === currency)?.label ?? "your points";
      const bank = BANK.has(currency);
      const region = a.region && a.region !== "anywhere" ? (a.region as SweetSpotRegion) : null;
      const cabin = a.goal === "business" || a.goal === "economy" ? a.goal : undefined;
      const kind = a.goal === "hotel" ? "hotel" : undefined;
      const spots = region
        ? sweetSpotsHref(region, { ...(cabin ? { cabin } : {}), ...(kind ? { type: kind } : {}), ...(bank ? { from: currency } : {}) })
        : `/points/sweet-spots${qs({ cabin, type: kind, from: bank ? currency : undefined })}`;
      const out: StartResult[] = [];
      if (bank) {
        out.push({ href: `/points${qs({ currency })}`, title: `What ${name} are worth`, body: "Our valuation, and the redemptions that get the most from them." });
        out.push({ href: `/points/transfers${qs({ from: currency })}`, title: `Where ${name} transfer`, body: "Every airline and hotel partner, with ratios and transfer times." });
      } else {
        out.push({ href: "/points/programs", title: "Airline and hotel programs", body: "How each program prices awards, and what it's good for." });
      }
      out.push({
        href: spots,
        title: region ? `Award sweet spots: ${region}` : "Award sweet spots",
        body: a.goal === "hotel" ? "Hotel awards that stretch points furthest." : "Awards that cost far fewer points than the cash fare suggests.",
      });
      if (a.goal === "hotel") out.push({ href: "/tools/hotel-points", title: "What a paid stay earns", body: "Hotel and card points for a stay, with elite bonuses." });
      return out;
    },
  },
  {
    id: "card",
    title: "Which card should I get?",
    blurb: "Three quick questions, then your best options side by side.",
    questions: [
      {
        id: "spend",
        prompt: "Where does most of your money go?",
        options: fixed(Object.entries(SPEND).map(([value, s]) => ({ value, label: s.label }))),
      },
      {
        id: "fee",
        prompt: "What annual fee are you comfortable with?",
        options: fixed(Object.entries(FEES).map(([value, f]) => ({ value, label: f.label }))),
      },
      {
        id: "travel",
        prompt: "How often do you fly?",
        options: fixed([
          { value: "rarely", label: "Rarely" },
          { value: "sometimes", label: "A few trips a year" },
          { value: "often", label: "Most months" },
        ]),
      },
    ],
    results: (a) => {
      const picks = suggestCards(a.spend, a.fee, a.travel);
      const cat = a.spend === "travel" ? "flights" : a.spend === "everything" ? "other" : a.spend;
      return [
        { href: `/next-card${qs({ spend: a.spend, fee: a.fee, travel: a.travel })}`, title: "Your next card", body: "Ranked for how you spend and what you already hold, with issuer rules like Chase 5/24." },
        { href: `/compare?cards=${picks.join(",")}`, title: "Compare your top three", body: picks.map((id) => shortCardName(getCard(id)?.name ?? id)).join(", ") },
        { href: `/best-card${qs({ category: cat })}`, title: "Which card to use", body: "The best card in your wallet for each kind of purchase." },
      ];
    },
  },
  {
    id: "fee",
    title: "Is my card worth its fee?",
    blurb: "Credits you'll really use against the fee, then the full math.",
    questions: [
      {
        id: "card",
        prompt: "Which card?",
        accepts: (v) => Boolean(getCard(v)),
        options: ({ wallet }) => {
          const owned = wallet.map(getCard).filter((c): c is Card => Boolean(c && c.annualFee > 0));
          const popular = [...featuredIds, "amex-delta-reserve", "united-club-infinite", "citi-aadvantage-executive"]
            .map(getCard)
            .filter((c): c is Card => Boolean(c && c.annualFee > 0));
          const list = Array.from(new Map([...owned, ...popular].map((c) => [c.id, c])).values()).slice(0, 9);
          return list.map((c) => ({
            value: c.id,
            label: shortCardName(c.name),
            hint: `$${c.annualFee} a year${wallet.includes(c.id) ? " · in your wallet" : ""}`,
          }));
        },
      },
      {
        id: "usage",
        prompt: "How much of its credits do you actually use?",
        options: fixed(Object.entries(USAGE).map(([value, u]) => ({ value, label: u.label }))),
      },
    ],
    results: (a) => {
      const card = a.card ? getCard(a.card) : undefined;
      const short = card ? shortCardName(card.name) : "your card";
      return [
        { href: `/calculator${qs({ card: a.card, credits: a.usage })}`, title: "Run the numbers", body: "Rewards on your spending plus credits, minus the fee, against other cards." },
        { href: "/tracker", title: "Track its credits", body: `Log ${short} credits as you use them and watch value against the fee.` },
        ...(card ? [{ href: `/cards/${card.id}`, title: `Every ${short} benefit`, body: "Credits, earn rates, lounge access and protections." }] : []),
      ];
    },
  },
  {
    id: "trip",
    title: "I'm planning a trip",
    blurb: "Lounges, entry rules, award sweet spots and flight distance for your route.",
    questions: [
      {
        id: "from",
        prompt: "Where are you flying from?",
        accepts: (v) => /^[A-Z]{3}$/.test(v),
        options: fixed(HOME_AIRPORTS.map((code) => ({ value: code, label: CITY[code] ?? code, hint: code }))),
      },
      {
        id: "to",
        prompt: "Where are you headed?",
        options: fixed(TRIP_DESTINATIONS.map((d) => ({ value: d.code, label: d.city, hint: d.code }))),
      },
      {
        id: "cabin",
        prompt: "How do you want to fly?",
        options: fixed([
          { value: "economy", label: "Economy" },
          { value: "premium", label: "Premium economy" },
          { value: "business", label: "Business or first" },
        ]),
      },
    ],
    results: (a) => {
      const from = a.from ?? "";
      const dest = TRIP_DESTINATIONS.find((d) => d.code === a.to);
      const out: StartResult[] = [];
      out.push(
        loungeCountByAirport[from]
          ? { href: `/lounges/${from}`, title: `Lounges at ${from}`, body: "Which ones your cards open, and how to get there from your gate." }
          : { href: "/lounges", title: "Lounge finder", body: "Lounges your cards open at airports along the way." },
      );
      if (dest?.country) {
        out.push({ href: `/tools/entry-requirements${qs({ q: dest.country })}`, title: `Entry rules: ${dest.country}`, body: "Visas, travel authorizations and passport validity for U.S. citizens." });
      }
      if (dest) {
        out.push({ href: sweetSpotsHref(dest.region, { cabin: a.cabin ?? "economy", from }), title: `Award sweet spots: ${dest.region}`, body: "Where your points go furthest on this trip." });
        out.push({ href: `/tools/distance${qs({ route: `${from}-${dest.code}` })}`, title: `Flight distance: ${from} → ${dest.code}`, body: "Miles and flight time, and how much farther a stop makes it." });
      }
      return out;
    },
  },
  {
    id: "airport",
    title: "I'm at the airport",
    blurb: "The lounges you can use right now, and your airline's bag rules.",
    questions: [
      {
        id: "airport",
        prompt: "Which airport are you at?",
        accepts: (v) => (loungeCountByAirport[v] ?? 0) > 0,
        options: fixed(bigAirports.map((x) => ({ value: x.code, label: x.city, hint: x.code }))),
      },
      {
        id: "need",
        prompt: "What do you need?",
        options: fixed([
          { value: "lounge", label: "A lounge" },
          { value: "bags", label: "Baggage rules" },
          { value: "both", label: "Both" },
        ]),
      },
      {
        id: "guests",
        prompt: "Is anyone coming into the lounge with you?",
        when: (a) => a.need !== "bags",
        options: fixed([
          { value: "0", label: "Just me" },
          { value: "1", label: "1 guest" },
          { value: "2", label: "2 guests" },
          { value: "3", label: "3 or more" },
        ]),
      },
      {
        id: "airline",
        prompt: "Which airline are you flying?",
        when: (a) => a.need !== "lounge",
        options: fixed(AIRLINES),
      },
    ],
    results: (a) => {
      const code = a.airport ?? "";
      const guests = Number(a.guests ?? 0);
      const out: StartResult[] = [];
      if (a.need !== "bags") {
        out.push({
          href: `/lounges/${code}${guests > 0 ? qs({ guests: String(guests) }) : ""}`,
          title: `Lounges at ${airportLabel(code)}`,
          body: guests > 0 ? `Which ones your cards open, and what ${guests === 1 ? "your guest costs" : `${guests} guests cost`} with each card.` : "Which ones your cards open, and directions from your gate.",
        });
      }
      if (a.need !== "lounge") {
        const airline = a.airline && a.airline !== "other" ? a.airline : undefined;
        const name = AIRLINES.find((x) => x.value === airline)?.label;
        out.push({ href: `/tools/baggage${qs({ airline })}`, title: name ? `${name} baggage rules` : "Baggage fees and rules", body: "The official bag page, checked-bag fees and award-ticket rules." });
      }
      return out;
    },
  },
];

export const flowById = (id: string | null | undefined) => START_FLOWS.find((f) => f.id === id) ?? null;

/** The questions that apply given the answers so far, in order. */
export function activeQuestions(flow: StartFlow, answers: Answers): StartQuestion[] {
  return flow.questions.filter((q) => !q.when || q.when(answers));
}

export function isAnswered(q: StartQuestion, answers: Answers, ctx: StartContext): boolean {
  const v = answers[q.id];
  return v !== undefined && (q.options(ctx).some((o) => o.value === v) || Boolean(q.accepts?.(v)));
}

/** The first question still to answer (null when the flow is done). Answers that aren't valid options don't count. */
export function nextQuestion(flow: StartFlow, answers: Answers, ctx: StartContext): StartQuestion | null {
  return activeQuestions(flow, answers).find((q) => !isAnswered(q, answers, ctx)) ?? null;
}

/** Answers that belong to the flow's active questions (dropping stale or unknown parameters). */
export function answersFrom(flow: StartFlow, params: { get(name: string): string | null }): Answers {
  const a: Answers = {};
  for (const q of flow.questions) {
    const v = params.get(q.id);
    if (v) a[q.id] = v;
  }
  return a;
}

export const flowHref = (flow: FlowId, answers: Answers) => `/start${qs({ flow, ...answers })}`;
