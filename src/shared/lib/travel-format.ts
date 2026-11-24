import type { FeeValue, Notes } from "@/shared/data/travel/types";

/** Formatting for the travel tools. No Date objects: ISO strings are formatted by hand, so server and browser agree. */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-11-24" → "Nov 24, 2026"; "2026-11" → "Nov 2026". Anything else is returned as is. */
export function formatIsoDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(iso);
  if (!m) return iso;
  const month = MONTHS[Number(m[2]) - 1];
  if (!month) return iso;
  return m[3] ? `${month} ${Number(m[3])}, ${m[1]}` : `${month} ${m[1]}`;
}

/** "Nov 2026" from any ISO date. */
export function formatIsoMonth(iso: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(iso);
  const month = m ? MONTHS[Number(m[2]) - 1] : undefined;
  return m && month ? `${month} ${m[1]}` : iso;
}

/** The latest of several ISO dates (string comparison works for ISO). */
export const latestIso = (dates: string[]) => dates.reduce((a, b) => (b > a ? b : a), "");

/** Notes as a list, whichever form they came in. */
export function noteList(notes: Notes | undefined): string[] {
  if (!notes) return [];
  return (Array.isArray(notes) ? notes : [notes]).map((n) => n.trim()).filter(Boolean);
}

/** "Delta's", "Turkish Airlines'". */
export const possessive = (name: string) => (/s$/i.test(name.trim()) ? `${name.trim()}'` : `${name.trim()}'s`);

/** A fee for display: numbers are USD ("$35", "$80.90", "Free"), phrases pass through with readable dates. */
export function feeText(fee: FeeValue | undefined, empty = "—"): string {
  if (fee === null || fee === undefined || fee === "") return empty;
  if (typeof fee === "number") {
    if (fee === 0) return "Free";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: Number.isInteger(fee) ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(fee);
  }
  return readableDates(fee);
}

/**
 * Prose with its ISO dates made readable, to match the page's headings: "from 2026-09-15" → "from Sep 15, 2026",
 * "as of 2026-10" → "as of Oct 2026". Text inside URLs is left alone.
 */
export function readableDates(text: string): string {
  return text
    .split(/(https?:\/\/\S+)/)
    .map((part, i) =>
      i % 2 === 1
        ? part
        : part
            .replace(/\b(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b/g, (m) => formatIsoDate(m))
            .replace(/\b(\d{4})-(0[1-9]|1[0-2])\b(?!-\d)/g, (m) => formatIsoDate(m)),
    )
    .join("");
}

/** Host name of a URL for link text ("travel.state.gov"); relative links get a readable label. */
export function hostOf(url: string): string {
  if (url.startsWith("/")) return "perkfolio";
  try {
    return new URL(url).hostname.replace(/^www\d?\./, "");
  } catch {
    return url;
  }
}

/** "1,234" with no decimals. */
export const whole = (n: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.round(n));

/**
 * Addresses a visitor can't use, shown as the page they belong to: GOV.UK's visa checker is built from source files
 * on GitHub (the research read those), and Chase serves its Southwest Plus page at two addresses.
 */
const VISITOR_PAGES: [RegExp, string][] = [
  [/^https:\/\/raw\.githubusercontent\.com\/alphagov\/smart-answers\/\S*(?:check_uk_visa|uk_visa)/i, "https://www.gov.uk/check-uk-visa"],
  [/^https:\/\/creditcards\.chase\.com\/southwest\/plus-credit-card\/?$/i, "https://creditcards.chase.com/travel-credit-cards/southwest/plus"],
];

/** The address to link for a source: the page a visitor can use (see VISITOR_PAGES), or the address itself. */
export const visitorUrl = (url: string) => VISITOR_PAGES.find(([re]) => re.test(url))?.[1] ?? url;

/** Sources as visitors get them: one link per page, in order. */
export const visitorSources = (sources: string[]) => Array.from(new Set(sources.filter(Boolean).map(visitorUrl)));

/** Datasets and sites whose host alone says little (a GitHub raw file), named for what they are. */
const KNOWN_SOURCES: [RegExp, string][] = [
  [/raw\.githubusercontent\.com\/imorte\/passport-index-data\/main\/README/i, "Passport Index data notes"],
  [/raw\.githubusercontent\.com\/imorte\/passport-index-data/i, "Passport Index data (Feb 2026)"],
  [/raw\.githubusercontent\.com\/ilyankou\/passport-index-dataset/i, "Passport Index data (Jan 2025)"],
  [/raw\.githubusercontent\.com\/jpatokal\/openflights/i, "OpenFlights airline list"],
  [/raw\.githubusercontent\.com\/opentraveldata/i, "OpenTravelData airline list"],
  [/raw\.githubusercontent\.com\/alphagov\/smart-answers/i, "GOV.UK visa checker"],
];

const MONTH_NAMES: Record<string, string> = Object.fromEntries(
  ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"].map((m, i) => [m, MONTHS[i]]),
);
/** Place names an address spells without accents. */
const PLACE_FORMS: Record<string, string> = { curacao: "Curaçao" };
const titleWords = (slug: string) =>
  PLACE_FORMS[slug.toLowerCase()] ??
  slug
    .split("-")
    .map((w, i) => (i > 0 && SMALL_WORDS.has(w) ? w : `${w.charAt(0).toUpperCase()}${w.slice(1)}`))
    .join(" ");

/** Pages whose address names them badly or not at all, named outright. */
const PAGE_LABELS: [RegExp, (m: RegExpExecArray) => string][] = [
  [/^https?:\/\/(?:www\.)?gov\.uk\/check-uk-visa\/?$/i, () => "GOV.UK visa checker"],
  [/^https?:\/\/(?:www\.)?gov\.uk\/eta\/?$/i, () => "GOV.UK · ETA guide"],
  [/^https?:\/\/(?:www\.)?gov\.uk\/eta\/apply\/?$/i, () => "GOV.UK · Apply for an ETA"],
  [/^https?:\/\/(?:www\.)?gov\.uk\/eta\/what-you-can-cannot-do/i, () => "GOV.UK · What an ETA covers"],
  [/^https?:\/\/(?:www\.)?gov\.uk\/eta\/when-not-need-eta/i, () => "GOV.UK · When you don't need an ETA"],
  [
    /home-office-immigration-and-nationality-fees-\d{1,2}-([a-z]+)-(\d{4})/i,
    (m) => `GOV.UK · Home Office fees, ${MONTH_NAMES[m[1].toLowerCase()] ?? titleWords(m[1])} ${m[2]}`,
  ],
  [/^https?:\/\/(?:www\.)?gov\.uk\/foreign-travel-advice\/([a-z-]+)\/entry-requirements/i, (m) => `GOV.UK · ${titleWords(m[1])} entry advice`],
  [/^https?:\/\/(?:www\.)?united\.com\/en\/us\/baggage-calculator/i, () => "United · bag fee calculator"],
  [/^https?:\/\/creditcards\.chase\.com\/travel-credit-cards\/southwest\/plus\/?$/i, () => "Chase · Southwest Plus"],
];

const pageLabel = (url: string): string | null => {
  for (const [re, label] of PAGE_LABELS) {
    const m = re.exec(url);
    if (m) return label(m);
  }
  return null;
};

/** Outlets whose web address doesn't say who they are. */
const OUTLET_NAMES: Record<string, string> = {
  "nbcdfw.com": "NBC 5 Dallas-Fort Worth",
  "khon2.com": "KHON2 Honolulu",
  "adn.com": "Anchorage Daily News",
  "opb.org": "OPB",
};

/** Short names for sites that often appear several times in one list, so their pages read "Chase · Boundless". */
const SITE_NAMES: Record<string, string> = {
  "creditcards.chase.com": "Chase",
  "chase.com": "Chase",
  "americanexpress.com": "Amex",
  "citi.com": "Citi",
  "capitalone.com": "Capital One",
  "thepointsguy.com": "TPG",
  "nerdwallet.com": "NerdWallet",
  "upgradedpoints.com": "Upgraded Points",
  "marriott.com": "Marriott",
  "aa.com": "American",
  "delta.com": "Delta",
  "united.com": "United",
  "southwest.com": "Southwest",
  "alaskaair.com": "Alaska",
  "hawaiianairlines.com": "Hawaiian",
  "suncountry.com": "Sun Country",
  "gov.uk": "GOV.UK",
  "allegiantair.com": "Allegiant",
  "flyfrontier.com": "Frontier",
  "flybreeze.com": "Breeze",
  "aveloair.com": "Avelo",
  "aircanada.com": "Air Canada",
  "westjet.com": "WestJet",
  "jetblue.com": "JetBlue",
  "britishairways.com": "British Airways",
  "aireuropa.com": "Air Europa",
  "turkishairlines.com": "Turkish Airlines",
  "cathaypacific.com": "Cathay Pacific",
  "jal.co.jp": "JAL",
  "ana.co.jp": "ANA",
};

/** A site's short name ("Chase", "United"), or its host when it has none. */
const siteName = (host: string) => SITE_NAMES[host] ?? SITE_NAMES[host.split(".").slice(-2).join(".")] ?? host;

/** Names and words an address can't spell: "jetblue" → "JetBlue", "europes" → "Europe's". */
const WORD_FORMS: Record<string, string> = {
  jetblue: "JetBlue",
  oneworld: "oneworld",
  skyteam: "SkyTeam",
  aadvantage: "AAdvantage",
  skymiles: "SkyMiles",
  mileageplus: "MileagePlus",
  westjet: "WestJet",
  aeromexico: "Aeroméxico",
  europes: "Europe's",
  whats: "What's",
  carryon: "Carry-on",
  hhonors: "HHonors",
  ita: "ITA",
  sas: "SAS",
};

/** Path segments that say nothing about the page. */
const GENERIC_SEGMENT = /^(?:[a-z]{2}(?:[-_][a-z]{2})?|i18n|html?|index|default|content|www|card|cards|credit-cards|news|travel|learn|airline|airlines|hotel|hotels|business|loyalty|loyalty-programs|travel-credit-cards|rewards-credit-cards|business-credit-cards|apply|prospect|\d[\d-]*)$/i;
const ACRONYMS = new Set(["ihg", "mgm", "tpg", "klm", "ana", "jal", "uk", "us", "eu", "ees", "eta", "etias", "faq", "tsa", "dot"]);
const SMALL_WORDS = new Set(["and", "the", "for", "of", "to", "on", "in", "a", "an", "by", "vs", "with", "at", "your"]);
const LEADING_WORDS = /^(?:the|complete|ultimate|guide|to|how|your|a|an)$/i;
const TRAILING_WORDS = /^(?:credit|card|cards|american|express|guide|program)$/i;

/** A page's name from its address: "…/marriott-bonvoy/boundless" → "Boundless"; null when the path says nothing. */
function pageName(url: string, site: string): string | null {
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    return null;
  }
  const all = path
    .split("/")
    .map((x) => decodeURIComponent(x).replace(/\.(?:html?|jsp|aspx|mi|pdf)$/i, ""))
    .filter(Boolean);
  const segments = all.filter((x) => !GENERIC_SEGMENT.test(x));
  const last = segments[segments.length - 1];
  if (!last) return null;
  let words = last.split(/[-_\s]+/).filter(Boolean);
  // Dates and running numbers in an address aren't part of the page's name: "2025-06-30-oneworld-welcomes-…" and
  // "baggage-1". Numbers that are ("club-49", "12-hours") stay.
  words = words.filter((w, i) => {
    if (/^(?:19|20)\d{2}$/.test(w)) return false;
    const nearYear = [words[i - 1], words[i - 2], words[i + 1], words[i + 2]].some((x) => x !== undefined && /^(?:19|20)\d{2}$/.test(x));
    if (/^\d{1,2}$/.test(w) && nearYear) return false;
    return !(/^\d$/.test(w) && i === words.length - 1 && i > 0);
  });
  if (words.length === 0) return null;
  while (words.length > 1 && LEADING_WORDS.test(words[0])) words.shift();
  while (words.length > 1 && TRAILING_WORDS.test(words[words.length - 1])) words.pop();
  // The site is already named: "Amex · Business Platinum", not "Amex · American Express Business Platinum".
  if (words.length > 1 && words[0].toLowerCase() === site.toLowerCase()) words.shift();
  if (site === "Amex" && words.length > 2 && /^american$/i.test(words[0]) && /^express$/i.test(words[1])) words.splice(0, 2);
  const shown = words.slice(0, 4).map((w, i) => {
    const lower = w.toLowerCase();
    if (WORD_FORMS[lower]) return WORD_FORMS[lower];
    if (ACRONYMS.has(lower)) return lower.toUpperCase();
    if (i > 0 && SMALL_WORDS.has(lower)) return lower;
    return `${w.charAt(0).toUpperCase()}${w.slice(1)}`;
  });
  let name = `${shown.join(" ")}${words.length > 4 ? "…" : ""}`.replace(/\bCarry on\b/, "Carry-on").replace(/\bcarry on\b/, "carry-on");
  // Tell a business card's page and an issuer's terms apart from the consumer card's page.
  if (all.some((x) => /^business/i.test(x)) && !/business/i.test(name)) name += " Business";
  if (all.slice(0, -1).some((x) => /terms$/i.test(x)) && !/terms/i.test(name)) name += " terms";
  return name;
}

/**
 * Link text for a list of sources: the host ("travel.state.gov"), a dataset's name for files whose host says little,
 * and, when a site appears more than once, the page as well ("Chase · Boundless", "Chase · Bold"). Labels that would
 * still repeat get a number.
 */
export function sourceLabels(urls: string[]): string[] {
  const hosts = urls.map(hostOf);
  const count = new Map<string, number>();
  for (const h of hosts) count.set(h, (count.get(h) ?? 0) + 1);
  const labels = urls.map((url, i) => {
    const known = KNOWN_SOURCES.find(([re]) => re.test(url));
    if (known) return known[1];
    const named = pageLabel(url);
    if (named) return named;
    const host = hosts[i];
    if ((count.get(host) ?? 0) < 2) return OUTLET_NAMES[host] ?? host;
    const site = siteName(host);
    const page = pageName(url, site);
    return page ? `${site} · ${page}` : host;
  });
  const seen = new Map<string, number>();
  return labels.map((l) => {
    const n = (seen.get(l) ?? 0) + 1;
    seen.set(l, n);
    return n === 1 ? l : `${l} ${n}`;
  });
}

/** Link text for an address quoted in prose: its site and page ("United · Carry-on Bags"). */
export function linkLabel(url: string): string {
  const named = pageLabel(url);
  if (named) return named;
  const host = hostOf(url);
  const site = siteName(host);
  const page = pageName(url, site);
  return page ? `${site} · ${page}` : (OUTLET_NAMES[host] ?? host);
}

/** Text split around the web addresses in it (without trailing punctuation), for turning them into links. */
export function splitUrls(text: string): { text: string; url?: string }[] {
  const out: { text: string; url?: string }[] = [];
  let last = 0;
  for (const m of text.matchAll(/https?:\/\/[^\s)]+/g)) {
    const url = m[0].replace(/[.,;:!?'"]+$/, "");
    const at = m.index ?? 0;
    if (at > last) out.push({ text: text.slice(last, at) });
    out.push({ text: url, url });
    last = at + url.length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}
