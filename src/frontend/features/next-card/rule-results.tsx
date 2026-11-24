"use client";

import { ArrowUpRight, CheckCircle2, ChevronDown, CircleHelp, Clock, Info, TriangleAlert, XCircle } from "lucide-react";
import type { ApplicationRule, SourceDetail, UserFact } from "@/shared/data/strategy/types";
import { USER_FACTS, type CardEligibility, type RuleResult, type RuleStatus } from "@/shared/lib/eligibility";
import { strategyPrefs, useStrategyPrefs } from "@/frontend/state/strategy-prefs";
import { ExplainChip } from "@/frontend/components/explain-chip";
import { formatDate, formatDateOrMonth } from "@/shared/lib/dates";
import { cn } from "@/shared/lib/format";

export const CERTAINTY_TEXT: Record<ApplicationRule["certainty"], string> = {
  official: "Official: the issuer's own published wording, read on its site.",
  "widely reported":
    "Widely reported: two or more independent outlets agree on it. Most of these are unwritten rules; a few are the issuer's own wording as outlets quote it. Each rule's details say which.",
};

const CERTAINTY_STYLE: Record<ApplicationRule["certainty"], string> = { official: "bg-navy/5 text-navy", "widely reported": "bg-canvas text-ink-2" };

/**
 * "Official" (the issuer's own wording) or "Widely reported" (outlets agree). Tap or hover to see what it means;
 * `explain={false}` for a static chip where the meaning is already written next to it.
 */
export function CertaintyChip({ certainty, explain = true }: { certainty: ApplicationRule["certainty"]; explain?: boolean }) {
  const label = certainty === "official" ? "Official" : "Widely reported";
  if (!explain) {
    return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap", CERTAINTY_STYLE[certainty])}>{label}</span>;
  }
  return (
    <ExplainChip text={CERTAINTY_TEXT[certainty]} className={CERTAINTY_STYLE[certainty]}>
      {label}
    </ExplainChip>
  );
}

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};
const isWebUrl = (s: string) => /^https?:\/\//i.test(s);

/** Names for the sites our sources come from, so a link reads "The Points Guy" rather than "thepointsguy.com". */
const SITE_NAMES: Record<string, string> = {
  "thepointsguy.com": "The Points Guy",
  "upgradedpoints.com": "Upgraded Points",
  "nerdwallet.com": "NerdWallet",
  "doctorofcredit.com": "Doctor of Credit",
  "americanexpress.com": "American Express",
  "creditcards.chase.com": "Chase",
  "chase.com": "Chase",
  "capitalone.com": "Capital One",
  "citi.com": "Citi",
  "creditcards.wellsfargo.com": "Wells Fargo",
  "wellsfargo.com": "Wells Fargo",
  "bankofamerica.com": "Bank of America",
  "bilt.com": "Bilt",
  "marriott.com": "Marriott",
};
const siteName = (url: string) => SITE_NAMES[hostOf(url)] ?? hostOf(url);

const SMALL = new Set(["a", "an", "and", "at", "for", "from", "in", "of", "on", "or", "the", "to", "vs", "with"]);
/** Words a URL slug lowercases that have their own spelling. */
const SPELLING: Record<string, string> = Object.fromEntries(
  ["AAdvantage", "SkyMiles", "LifeMiles", "KrisFlyer", "MileagePlus", "TrueBlue", "ThankYou", "FAQ", "ANA", "EVA", "TAP", "IHG", "JAL", "KLM", "SPG", "AT&T"].map(
    (w) => [w.toLowerCase().replace("&", ""), w],
  ),
);
/** Slug abbreviations spelled out. */
const EXPAND: Record<string, string> = { mr: "Membership Rewards", pointsplus: "Points Plus" };
const titleCase = (words: string[]) =>
  words.map((w, i) => SPELLING[w] ?? (i > 0 && SMALL.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(" ");

/** The meaningful path segments of a URL, last first: "venture-x", "credit-cards". Ids and numbers are skipped. */
function pageSegments(url: string): string[] {
  try {
    return new URL(url).pathname
      .split("/")
      .map((p) => decodeURIComponent(p).replace(/\.(html?|pdf|aspx?)$/i, ""))
      .filter((p) => p && /[a-z]{3}/i.test(p) && (p.match(/\d/g)?.length ?? 0) < p.length / 2)
      .reverse();
  } catch {
    return [];
  }
}

/** Folders that don't name anything ("credit-cards", "card", "us"). */
const GENERIC_SEGMENT = /^(?:[a-z]+-)*credit-cards$|^cards?$|^(?:en-)?us$|^small-business$|^business$|^benefits$|^rewards$|^terms$|^help-center$/i;

/** Publications: their page names never repeat the site's name the way an issuer's do. */
const OUTLETS = new Set(["The Points Guy", "Upgraded Points", "NerdWallet", "Doctor of Credit"]);

/**
 * A page's name from its URL slug: "faq.points-expiration-dates" → "FAQ Points Expiration Dates",
 * "mr-terms-conditions-september-2026" → "Membership Rewards Terms & Conditions September 2026". On an issuer's site,
 * words that repeat its name are dropped: "american-express-business-platinum-credit-card-amex" on American Express
 * is "Business Platinum Credit Card", and "delta-skymiles-platinum-american-express-card" is "Delta SkyMiles Platinum
 * Card".
 */
function pageName(segment: string, site: string): string {
  const brand = site.replace(/\s*\(.*\)$/, "");
  const brandWords = OUTLETS.has(brand) ? [] : brand.toLowerCase().split(/\W+/).filter(Boolean);
  const drop = new Set([...brandWords, ...(brand === "American Express" ? ["amex"] : [])]);
  let words = segment.toLowerCase().split(/[-_.\s]+/).filter(Boolean);
  while (words.length > 1 && drop.has(words[0])) words = words.slice(1);
  while (words.length > 1 && drop.has(words[words.length - 1])) words = words.slice(0, -1);
  // "… american express card": the issuer's name before a closing "card".
  const n = brandWords.length;
  if (n > 0 && words.length > n + 1 && words[words.length - 1] === "card" && words.slice(-n - 1, -1).join(" ") === brandWords.join(" ")) {
    words = [...words.slice(0, -n - 1), "card"];
  }
  const out: string[] = [];
  for (let i = 0; i < words.length; i++) {
    if (words[i] === "terms" && words[i + 1] === "conditions") {
      out.push("terms", "&", "conditions");
      i++;
    } else out.push(...(EXPAND[words[i]]?.toLowerCase().split(" ") ?? [words[i]]));
  }
  const t = titleCase(out)
    .replace(/\bmembership rewards\b/i, "Membership Rewards")
    .replace(/\b5 24\b/, "5/24");
  if (t.length <= 60) return t;
  const cut = t.slice(0, 59);
  return `${cut.slice(0, cut.lastIndexOf(" ")).replace(/\s+(?:to|the|of|and|a|&)$/i, "")}…`;
}

export interface SourceLabel {
  url: string;
  label: string;
  /** The outlet page's last-updated date, or "read YYYY-MM-DD" for issuer terms. */
  updated?: string;
}

/**
 * Labels that tell a rule's sources apart: the outlet's name where we have it (else the site), plus the page's
 * name whenever the same outlet or site appears more than once with nothing else to tell them apart, like a date
 * ("capitalone.com: Venture X", "capitalone.com: Compare").
 */
export function sourceLabels(urls: string[], details: SourceDetail[] = []): SourceLabel[] {
  const byUrl = new Map(details.map((d) => [d.url, d]));
  const items = [...new Set(urls)].map((url) => {
    const d = byUrl.get(url);
    return { url, site: d?.outlet ?? siteName(url), segments: pageSegments(url), updated: d?.updated };
  });
  // Pages from the same outlet with different last-updated dates are already told apart by the date.
  const keyOf = (x: (typeof items)[number]) => `${x.site}|${x.updated ?? ""}`;
  const sites = new Map<string, number>();
  for (const x of items) sites.set(keyOf(x), (sites.get(keyOf(x)) ?? 0) + 1);
  // A one-word page name takes the folder it's in: /sapphire/preferred is "Sapphire Preferred", not "Preferred".
  const name = (x: (typeof items)[number]) => {
    const own = pageName(x.segments[0], x.site);
    const parent = x.segments[1];
    return !own.includes(" ") && parent && !GENERIC_SEGMENT.test(parent) ? `${pageName(parent, x.site)} ${own}` : own;
  };
  const label = (x: (typeof items)[number], depth: number) =>
    (sites.get(keyOf(x)) ?? 0) > 1 && x.segments.length
      ? `${x.site}: ${depth === 1 ? name(x) : x.segments.slice(0, depth).reverse().map((seg) => pageName(seg, x.site)).join(" › ")}`
      : x.site;
  const once = items.map((x) => label(x, 1));
  return items.map((x, i) => ({
    url: x.url,
    // Two pages with the same last segment (/active-cash-credit-card/ and /cards/active-cash-credit-card): add the one before.
    label: once.filter((l) => l === once[i]).length > 1 ? label(x, 2) : once[i],
    ...(x.updated ? { updated: x.updated } : {}),
  }));
}

export function SourceLinks({
  sources,
  details,
  checked,
  className,
}: {
  sources: string[];
  details?: SourceDetail[];
  /** The day the research last checked these sources (YYYY-MM-DD), when they carry no dates of their own. */
  checked?: string;
  className?: string;
}) {
  const web = sourceLabels(sources.filter(isWebUrl), details);
  const other = [...new Set(sources.filter((s) => !isWebUrl(s)))];
  if (web.length + other.length === 0) return null;
  return (
    <span className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-3", className)}>
      <span>
        Source{web.length + other.length === 1 ? "" : "s"}
        {checked ? `, checked ${formatDate(checked)}` : ""}:
      </span>
      {web.map((s) => (
        <a
          key={s.url}
          href={s.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-8 items-center gap-0.5 py-0.5 font-medium text-brand hover:underline sm:min-h-0"
        >
          {s.label}
          {s.updated && <span className="font-normal text-ink-3">&nbsp;({updatedText(s.updated)})</span>}
          <ArrowUpRight className="h-3 w-3" />
        </a>
      ))}
      {other.map((s) => (
        <span key={s}>{s}</span>
      ))}
    </span>
  );
}

const ICON: Record<RuleStatus, React.ReactNode> = {
  eligible: <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-label="Passes" />,
  warning: <TriangleAlert className="h-4 w-4 shrink-0 text-warn" aria-label="Warning" />,
  unknown: <CircleHelp className="h-4 w-4 shrink-0 text-brand" aria-label="Needs information" />,
  blocked: <XCircle className="h-4 w-4 shrink-0 text-danger" aria-label="Blocks" />,
  notice: <Info className="h-4 w-4 shrink-0 text-ink-3" aria-label="Good to know" />,
};

/** What a blocking or warning rule means for you: "No bonus", "Likely declined", "Bonus at risk"... */
export function effectLabel(r: Pick<RuleResult, "status" | "effect" | "rule">): string | null {
  if (r.status === "blocked") {
    if (r.effect === "no-bonus") return "No bonus";
    if (r.effect === "ineligible") return r.rule.kind === "bonus" ? "Not available" : "Not eligible";
    return "Likely declined";
  }
  // A warning on a bonus rule (Amex's "may not be eligible", or a card the terms may not cover) is about the bonus.
  if (r.status === "warning") return r.effect === "bonus-at-risk" || r.rule.kind === "bonus" ? "Bonus at risk" : "May be declined";
  return null;
}

/** When a blocking or warning rule clears: a date, an action, both, or never. */
export function clearsText(r: Pick<RuleResult, "status" | "until" | "permanent" | "action">, kind: ApplicationRule["kind"]): string | null {
  if (r.permanent) {
    if (r.status === "warning") return "No time limit in the wording";
    return kind === "bonus" ? "No welcome bonus on this card again" : "Doesn't clear";
  }
  if (r.until && r.action) return `Clears ${formatDate(r.until)}, if ${r.action} by then`;
  if (r.until) return `Clears ${formatDate(r.until)}`;
  if (r.action) return `Clears once ${r.action}`;
  return null;
}

/** "Do you have a Bank of America deposit account?" with Yes / No. The answer stays in this browser. */
export function FactQuestion({ fact, className }: { fact: UserFact; className?: string }) {
  const { facts } = useStrategyPrefs();
  const answer = facts[fact];
  return (
    <div className={cn("flex flex-wrap items-center gap-2 rounded-md bg-sky/70 px-3 py-2 text-sm", className)} role="group" aria-label={USER_FACTS[fact].question}>
      <span className="min-w-0 flex-1 font-medium text-ink">{USER_FACTS[fact].question}</span>
      {[true, false].map((v) => (
        <button
          key={String(v)}
          className={cn("btn-secondary min-h-10 px-4 py-1 text-xs sm:min-h-0 sm:px-3", answer === v && "border-brand bg-white text-brand")}
          aria-pressed={answer === v}
          onClick={() => strategyPrefs.setFact(fact, v)}
        >
          {v ? "Yes" : "No"}
        </button>
      ))}
    </div>
  );
}

const updatedText = (u: string) => {
  const read = /^read (\d{4}-\d{2}-\d{2})$/.exec(u);
  if (read) return `read ${formatDate(read[1])}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(u) ? `updated ${formatDate(u)}` : u;
};

/**
 * The rule's sources: outlet names and their last-updated dates where we have them, else the site and page. An
 * official rule's issuer pages were read on the day it was last verified.
 */
function RuleSources({ rule }: { rule: ApplicationRule }) {
  return (
    <ul className="mt-1 space-y-0.5">
      {sourceLabels(rule.sources, rule.sourceDetails).map((s) => (
        <li key={s.url}>
          <a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-8 items-center gap-0.5 font-medium text-brand hover:underline sm:min-h-0">
            {s.label}
            <ArrowUpRight className="h-3 w-3" />
          </a>
          {s.updated ? (
            <span className="text-ink-3"> · {updatedText(s.updated)}</span>
          ) : (
            rule.certainty === "official" && <span className="text-ink-3"> · read {formatDate(rule.lastVerified)}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Everything else the research says about a rule: scope, caveats, what the issuer also weighs, sources and dates. */
export function RuleDetails({ rule, showSummary = false }: { rule: ApplicationRule; showSummary?: boolean }) {
  const L = rule.logic;
  const conditionNotes = (L.conditions ?? []).map((c) => c.note).filter((n): n is string => Boolean(n));
  const windowNotes = (L.windows ?? []).map((w) => w.note).filter((n): n is string => Boolean(n));
  const rows: [string, React.ReactNode][] = [
    ...(showSummary ? ([["The rule", rule.summary]] as [string, React.ReactNode][]) : []),
    ["Covers", L.scope],
    ...(L.dropOff ? ([["Drop-off", L.dropOff]] as [string, React.ReactNode][]) : []),
    ...(L.counts?.excludes?.length ? ([["Doesn't count", L.counts.excludes.join("; ") + "."]] as [string, React.ReactNode][]) : []),
    ...(L.counts?.storeCards ? ([["Store cards", L.counts.storeCards]] as [string, React.ReactNode][]) : []),
    ...(L.exempt?.length ? ([["Exempt", L.exempt.join("; ") + "."]] as [string, React.ReactNode][]) : []),
    ...(L.issuerDiscretion ? ([["The issuer also weighs", L.issuerDiscretion]] as [string, React.ReactNode][]) : []),
    ...[...conditionNotes, ...windowNotes].map((n) => ["Note", n] as [string, React.ReactNode]),
    ...(rule.notes ? ([["Good to know", rule.notes]] as [string, React.ReactNode][]) : []),
    ["Certainty", rule.basis ? `${rule.certainty === "official" ? "Official" : "Widely reported"}: ${rule.basis}` : CERTAINTY_TEXT[rule.certainty]],
    ["Checked", `As of ${formatDateOrMonth(rule.asOf)}; last verified ${formatDate(rule.lastVerified)}`],
  ];
  return (
    <details className="group/rule mt-1.5">
      <summary className="inline-flex min-h-8 cursor-pointer list-none items-center gap-1 text-xs font-medium text-brand hover:underline sm:min-h-0">
        More about this rule
        <ChevronDown className="h-3.5 w-3.5 transition-transform group-open/rule:rotate-180" />
      </summary>
      <dl className="mt-2 space-y-1.5 rounded-md border border-line bg-white p-3 text-xs leading-relaxed">
        {rows.map(([label, value], i) => (
          <div key={i} className="grid gap-x-3 sm:grid-cols-[8.5rem_minmax(0,1fr)]">
            <dt className="font-semibold text-ink-2">{label}</dt>
            <dd className="text-ink-2">{value}</dd>
          </div>
        ))}
        <div className="grid gap-x-3 sm:grid-cols-[8.5rem_minmax(0,1fr)]">
          <dt className="font-semibold text-ink-2">Sources</dt>
          <dd>
            <RuleSources rule={rule} />
          </dd>
        </div>
      </dl>
    </details>
  );
}

/** Every rule checked for a card: verdict, reason, when it clears, caveats, certainty and sources. */
export function RuleResults({ results, compact = false }: { results: RuleResult[]; compact?: boolean }) {
  return (
    <ul className="divide-y divide-line text-sm">
      {results.map((r) => {
        const clears = r.status === "blocked" || r.status === "warning" ? clearsText(r, r.rule.kind) : null;
        const effect = effectLabel(r);
        return (
          <li key={r.rule.id} className="flex gap-3 py-3 first:pt-0 last:pb-0">
            <span className="mt-0.5">{ICON[r.status]}</span>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-semibold text-ink">{r.rule.name}</span>
                <span className="text-xs text-ink-3">{r.status === "notice" ? "Good to know" : r.rule.kind === "bonus" ? "Bonus rule" : "Approval rule"}</span>
                <CertaintyChip certainty={r.rule.certainty} />
                {r.rule.logic.soft && (
                  <ExplainChip text="A soft limit: a tendency seen in reports, not a firm cutoff." className="bg-canvas text-ink-2">
                    Soft limit
                  </ExplainChip>
                )}
                {effect && (
                  <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", r.status === "blocked" ? "bg-danger/10 text-danger" : "bg-warn/10 text-warn")}>
                    {effect}
                  </span>
                )}
              </p>
              <p className={cn("mt-0.5", r.status === "notice" ? "text-ink-3" : "text-ink-2")}>{r.reason}</p>
              {clears && (
                <p className={cn("mt-1 flex items-start gap-1 text-xs font-semibold", r.permanent && r.status === "blocked" ? "text-danger" : "text-warn")}>
                  <Clock className="mt-px h-3.5 w-3.5 shrink-0" /> {clears}
                </p>
              )}
              {r.question && <FactQuestion fact={r.question} className="mt-2" />}
              {r.caveats && r.caveats.length > 0 && (
                <ul className="mt-1.5 space-y-1 text-xs text-ink-3">
                  {r.caveats.map((c) => (
                    <li key={c} className="flex gap-1.5">
                      <Info className="mt-0.5 h-3 w-3 shrink-0" />
                      <span>{c}</span>
                    </li>
                  ))}
                </ul>
              )}
              {!compact && r.status !== "notice" && <p className="mt-1 text-xs text-ink-3">{r.rule.summary}</p>}
              <RuleDetails rule={r.rule} showSummary={compact && r.status !== "notice"} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** "4 rules · 1 note": rules that check something, then notices (nothing to check), counted apart. */
export function rulesCount(results: Pick<RuleResult, "status">[]): string {
  const rules = results.filter((r) => r.status !== "notice").length;
  const notes = results.length - rules;
  return [rules ? `${rules} rule${rules === 1 ? "" : "s"}` : "", notes ? `${notes} note${notes === 1 ? "" : "s"}` : ""].filter(Boolean).join(" · ");
}

export type BadgeTone = "success" | "warn" | "danger" | "info" | "muted";

const TONE: Record<BadgeTone, string> = {
  success: "bg-success/10 text-success",
  warn: "bg-warn/10 text-warn",
  danger: "bg-danger/10 text-danger",
  info: "bg-sky text-brand",
  muted: "bg-canvas text-ink-2",
};

export function Badge({ tone, children, className }: { tone: BadgeTone; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap", TONE[tone], className)}>
      {children}
    </span>
  );
}

/** Unknowns that only wait on an answer to a question (no missing history). */
export const onlyQuestions = (e: CardEligibility) =>
  e.questions.length > 0 && e.results.every((r) => r.status !== "unknown" || (r.question && !r.missing?.length));

/** The headline verdict for a card: label and tone. */
export function verdictOf(e: CardEligibility): { label: string; tone: BadgeTone } {
  if (e.closedToApplicants) return { label: "Closed to applicants", tone: "muted" };
  if (e.held) return { label: "In your wallet", tone: "muted" };
  if (e.status === "eligible") {
    const checked = e.results.some((r) => r.status !== "notice");
    return { label: checked ? "Likely eligible" : "No known rules", tone: checked ? "success" : "muted" };
  }
  if (e.status === "warning") return { label: e.approval === "warning" ? "May be declined" : "Bonus at risk", tone: "warn" };
  if (e.status === "unknown") return { label: onlyQuestions(e) ? "One question" : "Needs info", tone: "info" };
  if (e.until) return { label: `Wait until ${formatDate(e.until)}`, tone: "warn" };
  if (e.permanent) return { label: e.approval === "blocked" ? "Not eligible" : "No bonus", tone: "danger" };
  return { label: "Not yet", tone: "warn" };
}
