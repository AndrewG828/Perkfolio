"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, CircleHelp, Clock, Info, ListChecks, Trophy } from "lucide-react";
import { CardArt } from "@/frontend/components/card-art";
import { ExplainChip } from "@/frontend/components/explain-chip";
import { useHydrated, useWallet } from "@/frontend/state/wallet-store";
import { strategyPrefs, useStrategyPrefs } from "@/frontend/state/strategy-prefs";
import { applicationRules } from "@/shared/data/strategy/application-rules";
import { programUnit } from "@/shared/data/strategy/programs";
import { valuations } from "@/shared/data/strategy/valuations";
import type { UserFact } from "@/shared/data/strategy/types";
import { NEEDS_HISTORY, USER_FACTS, chase524, historyContext, type RuleResult } from "@/shared/lib/eligibility";
import { NEXT_CARD_SCOPES, byRankValue, rankNextCards, usableKey, type Candidate, type NextCardScope } from "@/shared/lib/next-card";
import { centsFor } from "@/shared/lib/trackers";
import { frequencyShort } from "@/shared/lib/periods";
import { formatMonth } from "@/shared/lib/dates";
import { cn, num, usd } from "@/shared/lib/format";
import { ApplicationsEditor } from "./applications-editor";
import { FiveTwentyFourPanel } from "./five-24-panel";
import { Badge, CertaintyChip, FactQuestion, RuleDetails, RuleResults, clearsText, effectLabel, rulesCount, verdictOf } from "./rule-results";

export function NextCardView() {
  const hydrated = useHydrated();
  if (!hydrated) {
    return (
      <div className="bg-canvas">
        <div className="container-page grid gap-8 py-10 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="panel h-96 animate-pulse bg-white" />
          <div className="panel hidden h-72 animate-pulse bg-white lg:block" />
        </div>
      </div>
    );
  }
  return <NextCardDashboard />;
}

const SCOPE_LABELS: Record<NextCardScope, string> = { personal: "Personal", business: "Business", all: "All cards" };
/** The card-type filter lives in `?type=` (personal when absent), so it survives reloads and can be shared. */
const scopeFromUrl = (): NextCardScope => {
  const t = new URLSearchParams(window.location.search).get("type");
  return NEXT_CARD_SCOPES.find((s) => s === t) ?? "personal";
};

/** How many rows each list shows before "Show all". */
const FIRST = { eligible: 8, unknown: 5, blocked: 6 };

const OUTLETS = Object.values(valuations.datasets).map((d) => d.outlet);
/** "The Points Guy, Upgraded Points and NerdWallet". */
const OUTLET_LIST = `${OUTLETS.slice(0, -1).join(", ")} and ${OUTLETS[OUTLETS.length - 1]}`;
const EDITION = formatMonth(Object.values(valuations.datasets)[0]?.edition ?? valuations.verified.slice(0, 7));

/** Rendered only in the browser: reads the wallet, preferences, the URL and today's date. */
function NextCardDashboard() {
  const wallet = useWallet();
  const prefs = useStrategyPrefs();
  const [now] = useState(() => new Date());
  const [scope, setScopeState] = useState<NextCardScope>(scopeFromUrl);
  const setScope = (s: NextCardScope) => {
    setScopeState(s);
    const url = new URL(window.location.href);
    if (s === "personal") url.searchParams.delete("type");
    else url.searchParams.set("type", s);
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  };
  // The page renders after hydration, so the browser's own jump to #history found nothing: scroll once it's there.
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (id) document.getElementById(id)?.scrollIntoView({ block: "start" });
  }, []);
  const ctx = useMemo(() => historyContext(wallet, now, prefs.facts), [wallet, now, prefs.facts]);
  const counter = useMemo(() => chase524(ctx), [ctx]);
  const ranking = useMemo(
    () => rankNextCards({ wallet, today: now, usable: prefs.usable, scope, facts: prefs.facts, cents: (p) => centsFor(p, prefs.cpp) }),
    [wallet, now, prefs.usable, scope, prefs.facts, prefs.cpp],
  );
  // Without a card history almost every rule is unknown, so splitting "ready" from "check first" would put cards we
  // simply have no rules for on top. Rank them together instead, each with its own status; a bonus at risk still
  // ranks on the value without it.
  const combined = !ctx.historyKnown;
  const ready = combined ? [...ranking.eligible, ...ranking.warning, ...ranking.unknown].sort(byRankValue) : ranking.eligible;
  const checkFirst = [...ranking.warning, ...ranking.unknown].sort(byRankValue);
  // Questions the list already asks on a card, so "About you" doesn't ask them again.
  const asked = new Map<UserFact, string[]>();
  for (const c of [...ranking.eligible, ...ranking.warning, ...ranking.unknown]) {
    for (const q of c.eligibility.questions) asked.set(q, [...(asked.get(q) ?? []), c.card.name]);
  }
  // Questions that matter for some card in this list (the deposit-account question only for Bank of America's).
  const listed = new Set([...ranking.eligible, ...ranking.warning, ...ranking.unknown, ...ranking.blocked].map((c) => c.card.id));
  const relevant = new Set(
    applicationRules.rules.flatMap((r) => (r.logic.appliesWhen && r.appliesTo.some((id) => listed.has(id)) ? [r.logic.appliesWhen.userFact] : [])),
  );

  return (
    <div className="bg-canvas">
      {!ctx.historyKnown && (
        <div className="container-page pt-10">
          <div className="flex flex-col gap-3 rounded-lg border border-brand/20 bg-sky p-4 text-sm sm:flex-row sm:items-center">
            <CircleHelp className="hidden h-5 w-5 shrink-0 text-brand sm:block" />
            <p className="flex-1 text-ink">
              <span className="font-semibold">Add your card history to get real answers.</span>{" "}
              <span className="text-ink-2">
                Rules like Chase 5/24 and Amex&apos;s once-per-card bonus depend on what you&apos;ve opened before. Until then
                we only know the cards in your wallet.
              </span>
            </p>
            <a href="#history" className="btn-primary shrink-0">
              Add history
            </a>
          </div>
        </div>
      )}
      {/* On phones the lists come first, then the 5/24 count and questions, then the history; on wide screens the
          count and questions sit in a sticky sidebar. */}
      <div className={cn("container-page grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]", ctx.historyKnown ? "py-10" : "pt-8 pb-10")}>
        <div className="order-1 min-w-0 space-y-10 lg:order-none lg:col-start-1 lg:row-start-1">
          <section className="space-y-4" aria-labelledby="ready-title">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-0 flex-1 basis-80">
                <h2 id="ready-title" className="text-xl font-semibold text-navy">
                  {combined ? "Ranked by first-year value" : "Ready to apply"}
                </h2>
                <p className="text-sm text-ink-2">
                  {combined
                    ? "Welcome offer + credits you'd use − annual fee. Each card shows what we can tell without your history."
                    : "Cards whose rules you pass, ranked by first-year value: welcome offer + credits you'd use − annual fee. Issuers can still decline for other reasons."}
                </p>
                <p className="mt-1 text-xs text-ink-3">
                  Points are valued at the median of the {EDITION} figures from {OUTLET_LIST}, or at your own value from the
                  Points tab. The ranking leaves out a bonus the issuer may withhold, one a rule can&apos;t confirm yet and
                  the amount of an &ldquo;as high as&rdquo; offer (the most anyone gets); those cards show what the bonus would
                  add.
                </p>
              </div>
              <ScopePicker scope={scope} onChange={setScope} />
            </div>
            {ready.length === 0 ? (
              <div className="panel p-6 text-sm text-ink-2">No cards pass every rule right now. The lists below show what&apos;s missing and when blocks clear.</div>
            ) : (
              <ShowMore key={`e-${scope}-${combined}`} items={ready} first={FIRST.eligible} noun="cards" as="ol">
                {(c, i) => (
                  <CandidateRow
                    key={c.card.id}
                    c={c}
                    rank={i + 1}
                    usable={prefs.usable}
                    topLabel={combined ? "Highest value" : "Top pick"}
                  />
                )}
              </ShowMore>
            )}
          </section>

          {!combined && checkFirst.length > 0 && (
            <section className="space-y-4" aria-labelledby="check-title">
              <div>
                <h2 id="check-title" className="text-xl font-semibold text-navy">
                  Check first
                </h2>
                <p className="text-sm text-ink-2">
                  Nothing firmly blocks these, but a rule needs information we don&apos;t have yet, a soft limit makes approval
                  less likely, or the issuer says it may withhold the bonus.
                </p>
              </div>
              <ShowMore key={`u-${scope}`} items={checkFirst} first={FIRST.unknown} noun="cards">
                {(c) => <CandidateRow key={c.card.id} c={c} usable={prefs.usable} />}
              </ShowMore>
            </section>
          )}

          {ranking.blocked.length > 0 && <BlockedSection key={`b-${scope}`} blocked={ranking.blocked} />}

          {(ranking.held.length > 0 || ranking.closed.length > 0) && (
            <p className="-mt-4 flex gap-2 text-xs text-ink-3">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Not shown:{" "}
                {[
                  ranking.held.length ? `${ranking.held.length} card${ranking.held.length === 1 ? "" : "s"} you already have` : "",
                  ranking.closed.length ? `${ranking.closed.length} closed to new applicants` : "",
                ]
                  .filter(Boolean)
                  .join(" and ")}
                .
              </span>
            </p>
          )}
        </div>

        <aside className="order-2 space-y-5 lg:sticky lg:top-28 lg:order-none lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start">
          <FiveTwentyFourPanel status={counter} today={now} collapsible />
          <AboutYou asked={asked} relevant={relevant} />
          <HowWeCheck className="hidden lg:block" />
        </aside>

        <div className="order-3 min-w-0 space-y-10 lg:order-none lg:col-start-1 lg:row-start-2">
          <ApplicationsEditor id="history" wallet={wallet} today={now} counter={counter} />
          <HowWeCheck className="lg:hidden" />
        </div>
      </div>
    </div>
  );
}

/** Personal / Business / All cards: a radio group with arrow-key navigation (roving focus). */
function ScopePicker({ scope, onChange }: { scope: NextCardScope; onChange: (s: NextCardScope) => void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const go = (i: number) => {
    const n = NEXT_CARD_SCOPES.length;
    const k = (i + n) % n;
    onChange(NEXT_CARD_SCOPES[k]);
    refs.current[k]?.focus();
  };
  return (
    <div className="flex gap-1 rounded-md bg-white p-1 shadow-[var(--shadow-card)]" role="radiogroup" aria-label="Card type">
      {NEXT_CARD_SCOPES.map((id, i) => (
        <button
          key={id}
          ref={(el) => {
            refs.current[i] = el;
          }}
          role="radio"
          aria-checked={scope === id}
          tabIndex={scope === id ? 0 : -1}
          onClick={() => onChange(id)}
          onKeyDown={(e) => {
            const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
            if (step) go(i + step);
            else if (e.key === "Home") go(0);
            else if (e.key === "End") go(NEXT_CARD_SCOPES.length - 1);
            else return;
            e.preventDefault();
          }}
          className={cn("min-h-10 rounded px-3 py-1.5 text-sm font-medium sm:min-h-0", scope === id ? "bg-sky text-brand" : "text-ink-2 hover:text-ink")}
        >
          {SCOPE_LABELS[id]}
        </button>
      ))}
    </div>
  );
}

/** Rules for cards we don't list (Barclays, U.S. Bank, Chase's Marriott Boundless): kept for reference. */
const OTHER_RULES = applicationRules.rules.filter((r) => r.appliesTo.length === 0);

function HowWeCheck({ className }: { className?: string }) {
  return (
    <div className={cn("panel p-5 text-sm", className)}>
      <p className="flex items-center gap-2 font-semibold text-ink">
        <ListChecks className="h-4 w-4 text-brand" /> How we check
      </p>
      <p className="mt-2 leading-relaxed text-ink-2">
        Each card is checked against its issuer&apos;s approval and welcome-bonus rules, using your card history and wallet.
      </p>
      <ul className="mt-2 space-y-1.5 leading-relaxed text-ink-2">
        <li>
          <CertaintyChip certainty="official" explain={false} /> rules are the issuer&apos;s own published wording, read on its site.
        </li>
        <li>
          <CertaintyChip certainty="widely reported" explain={false} /> rules are ones two or more independent outlets (The Points
          Guy, Upgraded Points, NerdWallet, Doctor of Credit) agree on. Most are unwritten rules; a few are the issuer&apos;s own
          wording that we couldn&apos;t read on its site, like Amex&apos;s Platinum, Gold and Blue Cash offer terms. Each
          rule&apos;s details say which.
        </li>
        <li>Soft limits are tendencies, not cutoffs, and so is a bonus the issuer says it &quot;may&quot; withhold: those show as warnings, not blocks.</li>
      </ul>
      <p className="mt-2 text-xs leading-relaxed text-ink-3">
        Passing every rule isn&apos;t a promise: issuers can still decline you, or withhold a bonus, for other reasons, like
        income, credit score, recent inquiries or your history with them. Rules checked November 2026.
      </p>
      {OTHER_RULES.length > 0 && (
        <details className="group/others mt-3 border-t border-line pt-3">
          <summary className="flex min-h-10 cursor-pointer list-none items-center gap-1 text-xs font-medium text-brand sm:min-h-0">
            Rules for cards we don&apos;t list ({OTHER_RULES.length})
            <ChevronDown className="h-3.5 w-3.5 transition-transform group-open/others:rotate-180" />
          </summary>
          <ul className="mt-2 space-y-3">
            {OTHER_RULES.map((r) => (
              <li key={r.id} className="text-xs">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-ink">{r.name.startsWith(r.issuer) ? r.name : `${r.issuer}: ${r.name}`}</span>
                  <CertaintyChip certainty={r.certainty} />
                </p>
                <p className="mt-0.5 leading-relaxed text-ink-2">{r.summary}</p>
                <RuleDetails rule={r} />
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/**
 * Questions some rules depend on, answered once and kept in this browser. Only questions a card in the list depends
 * on are shown, and one a card in the list already asks isn't repeated here; once answered, this is where to change
 * it.
 */
function AboutYou({ asked, relevant }: { asked: Map<UserFact, string[]>; relevant: Set<UserFact> }) {
  const { facts: answers } = useStrategyPrefs();
  const facts = (Object.keys(USER_FACTS) as UserFact[]).filter((f) => relevant.has(f));
  if (!facts.length) return null;
  return (
    <div className="panel p-5 text-sm">
      <p className="font-semibold text-ink">About you</p>
      <p className="mt-1 text-xs text-ink-3">Some issuers&apos; limits depend on this. Your answer stays in this browser.</p>
      {facts.map((f) => {
        const where = asked.get(f);
        if (answers[f] === undefined && where?.length) {
          return (
            <p key={f} className="mt-2 rounded-md bg-sky/70 px-3 py-2 text-ink-2">
              <span className="font-medium text-ink">{USER_FACTS[f].short}:</span> asked on {where.length === 1 ? "the" : `${where.length} cards in the list:`}{" "}
              {where.join(" and ")}
              {where.length === 1 ? " in the list" : ""}.
            </p>
          );
        }
        return (
          <div key={f} className="mt-2">
            <FactQuestion fact={f} />
            {answers[f] !== undefined && (
              <button className="mt-1 inline-flex min-h-8 items-center text-xs font-medium text-brand hover:underline" onClick={() => strategyPrefs.setFact(f, null)}>
                Forget my answer
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** A list that shows its first few items, with a button for the rest. */
function ShowMore<T>({
  items,
  first,
  noun,
  as = "ul",
  className = "space-y-3",
  moreLabel,
  children,
}: {
  items: T[];
  first: number;
  noun: string;
  as?: "ul" | "ol";
  className?: string;
  /** Replaces "Show all N {noun}" (when items are groups of cards, say). */
  moreLabel?: string;
  children: (item: T, index: number) => React.ReactNode;
}) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, first);
  const List = as;
  return (
    <>
      <List className={className}>{shown.map(children)}</List>
      {items.length > first && (
        <button className="btn-ghost w-full" onClick={() => setAll((x) => !x)} aria-expanded={all}>
          {all ? "Show fewer" : (moreLabel ?? `Show all ${items.length} ${noun}`)}
          <ChevronDown className={cn("h-4 w-4 transition-transform", all && "rotate-180")} />
        </button>
      )}
    </>
  );
}

const thousands = (n: number) => (n >= 1000 ? `$${num(Math.round(n / 1000))}k` : usd(n));
/** "$1,205", or a negative amount with a real minus sign (U+2212), like the fee. */
const signedUsd = (n: number) => (n < 0 ? `\u2212${usd(-n)}` : usd(n));
const centsText = (c: number) => `${Number(c.toFixed(3))}¢`;

/** Chips that say what the headline offer leaves out: it varies, it ends, or it needs a lot of spending. */
function OfferChips({ c }: { c: Candidate }) {
  const o = c.value.offer;
  const chips: React.ReactNode[] = [];
  if (o.upTo || o.varies) {
    chips.push(
      <ExplainChip
        key="varies"
        className="bg-warn/10 text-warn"
        text={o.upTo ? "“As high as” is the most anyone gets: offers vary by applicant, so yours may be lower." : "Offers vary by applicant, so yours may differ."}
      >
        Offers vary
      </ExplainChip>,
    );
  }
  if (o.limited) chips.push(<span key="limited" className="rounded-full bg-sky px-2 py-0.5 text-[11px] font-semibold text-brand">Limited time</span>);
  if (o.spendAll) {
    chips.push(
      <span key="all" className="rounded-full bg-canvas px-2 py-0.5 text-[11px] font-semibold text-ink-2">
        Full offer needs {thousands(o.spendAll)} spend
      </span>,
    );
  } else if (o.spend && o.spend >= 10_000) {
    chips.push(
      <span key="spend" className="rounded-full bg-canvas px-2 py-0.5 text-[11px] font-semibold text-ink-2">
        {thousands(o.spend)} spend{o.within ? ` in ${o.within}` : ""}
      </span>,
    );
  }
  if (!chips.length) return null;
  return <p className="mt-1.5 flex flex-wrap items-center gap-1.5">{chips}</p>;
}

const issuerShort = (issuer: string) => (issuer === "American Express" ? "Amex" : issuer);

/**
 * What the welcome bonus would add when the ranking leaves it out (see BonusBasis), as one line; `short` for a
 * narrow column ("up to $2,605 with the bonus").
 */
function bonusAddsText(c: Candidate, short = false): string | null {
  const v = c.value;
  if (c.bonus === "counted") return null;
  const upTo = v.offer.upTo ? "Up to " : "";
  if (short) return `${upTo ? "up to " : ""}${signedUsd(v.total)} with the bonus`;
  if (c.bonus === "at-risk") return `${upTo}${signedUsd(v.total)} if ${issuerShort(c.card.issuer)} gives you the bonus`;
  if (c.bonus === "unconfirmed") return `${upTo}${signedUsd(v.total)} if the bonus is available to you`;
  return `Up to ${signedUsd(v.total)} with the full advertised offer: offers vary, so yours may be lower`;
}

/** Where to settle what a card's rules still need: the history entry's edit form, or the history section. */
const fixHref = (keys: string[] | undefined) => {
  const k = keys?.[0];
  return k && !k.startsWith("wallet:") ? `#history-${k}` : "#history";
};

/** The lines under the value cells: how the points were valued, and what the headline number leaves out. */
function ValueNotes({ c, own }: { c: Candidate; own: boolean }) {
  const v = c.value;
  const o = v.offer;
  const notes: { text: string; tone?: "warn" | "strong" }[] = [];
  if (o.points > 0 && v.cents !== undefined) {
    notes.push({ text: `${num(o.points)} ${programUnit(v.program)} at ${centsText(v.cents)} (${own ? "your value" : `${EDITION} median`})` });
  }
  const adds = bonusAddsText(c);
  if (adds) notes.push({ text: adds, tone: c.bonus === "varies" ? "strong" : "warn" });
  if (v.totalAll > v.total && c.bonus === "counted") {
    const how = o.spendAll ? `with ${thousands(o.spendAll)} spend` : o.authorizedUserPoints ? "if you add an authorized user" : "with every part of the offer";
    notes.push({ text: `${signedUsd(v.totalAll)} ${how}` });
  }
  if (!notes.length) return null;
  return (
    <div className="mt-1.5 space-y-0.5 text-xs xl:text-right">
      {notes.map((n) => (
        <p key={n.text} className={n.tone === "warn" ? "font-medium text-warn" : n.tone === "strong" ? "font-medium text-ink-2" : "text-ink-3"}>
          {n.text}
        </p>
      ))}
    </div>
  );
}

function CandidateRow({ c, rank, usable, topLabel = "Top pick" }: { c: Candidate; rank?: number; usable: Record<string, true>; topLabel?: string }) {
  const prefs = useStrategyPrefs();
  const [open, setOpen] = useState<"credits" | "rules" | null>(null);
  const { card, value, eligibility } = c;
  const verdict = verdictOf(eligibility);
  // The page-level banner already asks for the card history; rows name anything more specific (an open date...).
  const unknowns = eligibility.results.filter((r) => r.status === "unknown");
  const missing = [...new Set(unknowns.flatMap((r) => r.missing ?? []))].filter((m) => m !== NEEDS_HISTORY);
  const fix = fixHref(unknowns.flatMap((r) => r.records ?? []));
  const toggle = (k: "credits" | "rules") => setOpen(open === k ? null : k);
  const own = Boolean(value.program && prefs.cpp[value.program] !== undefined);
  const counted = c.bonus === "counted";
  return (
    <li className={cn("panel overflow-hidden", rank === 1 && "ring-2 ring-brand")}>
      <div
        className={cn(
          "grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-3 p-4 sm:gap-x-5 sm:p-5",
          // The values sit beside the card only where there's room for the offer text to breathe.
          rank !== undefined ? "sm:grid-cols-[1.25rem_auto_minmax(0,1fr)] xl:grid-cols-[1.25rem_auto_minmax(0,1fr)_auto]" : "xl:grid-cols-[auto_minmax(0,1fr)_auto]",
        )}
      >
        {rank !== undefined && <span className="hidden pt-1 text-center text-lg font-semibold text-ink-3 sm:block">{rank}</span>}
        <div className="pt-1">
          <CardArt card={card} size="xs" className="sm:hidden" />
          <CardArt card={card} size="sm" className="hidden sm:block" />
        </div>
        <div className="min-w-0">
          {rank === 1 && (
            <p className="eyebrow mb-0.5 flex items-center gap-1">
              <Trophy className="h-3.5 w-3.5" /> {topLabel}
            </p>
          )}
          <Link href={`/cards/${card.id}`} className="inline-block py-1 font-semibold text-navy hover:text-brand sm:py-0">
            {card.name}
          </Link>
          <p className="text-sm text-ink-2">{card.welcomeOffer}</p>
          <OfferChips c={c} />
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <Badge tone={verdict.tone}>{verdict.label}</Badge>
            {missing.length > 0 && (
              <span className="text-xs text-ink-2">
                Needs: {missing.join("; ")}.{" "}
                <a href={fix} className="inline-flex min-h-8 items-center font-medium text-brand hover:underline sm:min-h-0">
                  {fix === "#history" ? "Go to your card history" : "Update your card history"}
                </a>
              </span>
            )}
          </p>
          {eligibility.status === "warning" && eligibility.warnings[0] && (
            <p className="mt-1 text-xs text-ink-2">
              <span className="font-medium text-ink">{eligibility.warnings[0].rule.name}:</span> {eligibility.warnings[0].reason}
            </p>
          )}
        </div>
        <div className="col-span-full border-t border-line pt-3 xl:col-span-1 xl:w-72 xl:border-0 xl:pt-0">
          {/* "up to" sits on its own line above the welcome amount; every cell keeps that line so the amounts align. */}
          <dl className="grid grid-cols-4 gap-2 text-sm sm:gap-4 xl:text-right">
            <Cell
              label="Welcome"
              value={usd(value.welcome)}
              prefix={value.offer.upTo ? "up to" : undefined}
              reserve={value.offer.upTo}
              muted={!counted}
              strike={c.bonus === "at-risk" || c.bonus === "unconfirmed"}
            />
            <Cell label="Credits" value={usd(value.credits)} reserve={value.offer.upTo} />
            <Cell label="Fee" value={value.fee ? `−${usd(value.fee)}` : "$0"} reserve={value.offer.upTo} />
            <Cell label="First year" value={signedUsd(c.rankValue)} reserve={value.offer.upTo} strong tone={c.rankValue >= 0 ? "pos" : "neg"} />
          </dl>
          <ValueNotes c={c} own={own} />
          {(card.credits.length > 0 || eligibility.results.length > 0) && (
            <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm xl:justify-end">
              {card.credits.length > 0 && (
                <Toggle open={open === "credits"} onClick={() => toggle("credits")}>
                  Credits you&apos;d use
                </Toggle>
              )}
              {eligibility.results.length > 0 && (
                <Toggle open={open === "rules"} onClick={() => toggle("rules")}>
                  {rulesCount(eligibility.results)}
                </Toggle>
              )}
            </p>
          )}
        </div>
        {/* A question that would settle this card's rules, across the whole row so it reads in one or two lines. */}
        {eligibility.questions.map((q) => (
          <FactQuestion key={q} fact={q} className="col-span-full" />
        ))}
      </div>
      {open === "credits" && <CreditPicker c={c} usable={usable} />}
      {open === "rules" && (
        <div className="border-t border-line bg-canvas/40 px-5 py-4">
          <RuleResults results={eligibility.results} />
        </div>
      )}
    </li>
  );
}

function Toggle({ open, onClick, children }: { open: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button className="inline-flex min-h-10 items-center gap-0.5 font-medium text-brand hover:underline sm:min-h-0" onClick={onClick} aria-expanded={open}>
      {children}
      <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
    </button>
  );
}

function CreditPicker({ c, usable }: { c: Candidate; usable: Record<string, true> }) {
  const { card } = c;
  const all = card.credits.map((x) => x.id);
  const marked = all.filter((id) => usable[usableKey(card.id, id)]);
  return (
    <div className="border-t border-line bg-canvas/40 px-5 py-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-2">Tick the credits you&apos;d really use in the first year. Only those count toward its value.</p>
        <span className="flex gap-1">
          <button className="btn-ghost px-2 py-1 text-xs" onClick={() => strategyPrefs.setUsable(card.id, all, true)} disabled={marked.length === all.length}>
            Select all
          </button>
          <button className="btn-ghost px-2 py-1 text-xs" onClick={() => strategyPrefs.setUsable(card.id, all, false)} disabled={marked.length === 0}>
            Clear
          </button>
        </span>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {card.credits.map((credit) => {
          const on = Boolean(usable[usableKey(card.id, credit.id)]);
          return (
            <li key={credit.id}>
              <label
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm transition-colors",
                  on ? "border-brand bg-sky/60" : "border-line bg-white hover:border-brand/50",
                )}
              >
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 accent-[var(--color-brand)]"
                  checked={on}
                  onChange={(e) => strategyPrefs.setUsable(card.id, [credit.id], e.target.checked)}
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-ink">{credit.name}</span>
                  <span className="text-xs text-ink-3">
                    {credit.frequency === "every-4-years"
                      ? `${usd(credit.annualValue)} once every 4 years`
                      : credit.frequency === "one-time"
                        ? `${usd(credit.annualValue)} one time`
                        : credit.frequency === "annual"
                          ? `${usd(credit.annualValue)} a year`
                          : `${usd(credit.amountPerPeriod, { cents: credit.amountPerPeriod % 1 !== 0 })}${frequencyShort[credit.frequency]} · ${usd(credit.annualValue)} a year`}
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Cards blocked by exactly the same rules for the same reasons (Amex's 5-day limit, say) share one block. */
function groupBlocked(list: Candidate[]): Candidate[][] {
  const groups = new Map<string, Candidate[]>();
  for (const c of list) {
    const key = c.eligibility.blocking.map((r) => [r.rule.id, r.reason, r.until ?? "", r.action ?? "", r.permanent ? "p" : ""].join("|")).join("§");
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }
  return [...groups.values()];
}

function BlockedSection({ blocked }: { blocked: Candidate[] }) {
  const groups = groupBlocked(blocked);
  return (
    <section className="space-y-4" aria-labelledby="blocked-title">
      <div>
        <h2 id="blocked-title" className="text-xl font-semibold text-navy">
          Not yet
        </h2>
        <p className="text-sm text-ink-2">A rule blocks approval or the welcome bonus. Soonest to clear first.</p>
      </div>
      <ShowMore
        items={groups}
        first={FIRST.blocked}
        noun="cards"
        moreLabel={`Show all ${blocked.length} cards`}
        className="panel space-y-0 divide-y divide-line"
      >
        {(g) => (g.length === 1 ? <BlockedRow key={g[0].card.id} c={g[0]} /> : <BlockedGroup key={g.map((c) => c.card.id).join()} group={g} />)}
      </ShowMore>
    </section>
  );
}

function BlockingRules({ results }: { results: RuleResult[] }) {
  return (
    <ul className="space-y-3">
      {results.map((r) => {
        const clears = clearsText(r, r.rule.kind);
        return (
          <li key={r.rule.id} className="text-sm">
            <p className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-ink">{r.rule.name}</span>
              <CertaintyChip certainty={r.rule.certainty} />
              {effectLabel(r) && <span className="rounded-full bg-danger/10 px-2 py-0.5 text-[11px] font-semibold text-danger">{effectLabel(r)}</span>}
            </p>
            <p className="mt-0.5 text-ink-2">{r.reason}</p>
            {clears && (
              <p className={cn("mt-1 flex items-start gap-1 text-xs font-semibold", r.permanent ? "text-danger" : "text-warn")}>
                <Clock className="mt-px h-3.5 w-3.5 shrink-0" /> {clears}
              </p>
            )}
            {r.caveats && r.caveats.length > 0 && (
              <ul className="mt-1 space-y-0.5 text-xs text-ink-3">
                {r.caveats.map((x) => (
                  <li key={x} className="flex gap-1.5">
                    <Info className="mt-0.5 h-3 w-3 shrink-0" />
                    <span>{x}</span>
                  </li>
                ))}
              </ul>
            )}
            <RuleDetails rule={r.rule} />
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Besides what blocks it, why a blocked card's bonus may not come once it clears: a bonus the issuer may withhold,
 * or one a rule can't confirm yet ("Bonus at risk: Blue Cash Everyday: a past Everyday or Preferred may cost the
 * bonus").
 */
function BonusIssue({ c, className }: { c: Candidate; className?: string }) {
  const r = c.bonusRule;
  if (!r || (c.bonus !== "at-risk" && c.bonus !== "unconfirmed")) return null;
  return (
    <p className={cn("text-xs text-ink-2", className)}>
      <span className="font-semibold text-warn">{c.bonus === "at-risk" ? "Bonus at risk" : "Bonus not confirmed"}:</span> {r.rule.name}.{" "}
      {c.bonus === "unconfirmed" && r.records?.length ? (
        <a href={fixHref(r.records)} className="inline-flex min-h-8 items-center font-medium text-brand hover:underline sm:min-h-0">
          Update your card history
        </a>
      ) : null}
    </p>
  );
}

/** The first year once a block clears: without the bonus when the ranking leaves it out, and what it would add. */
function OnceClear({ c, compact = false }: { c: Candidate; compact?: boolean }) {
  const adds = bonusAddsText(c, compact);
  return (
    <>
      <span className={cn("font-semibold", c.rankValue < 0 ? "text-danger" : "text-ink")}>{signedUsd(c.rankValue)}</span>
      {adds && <span className="block text-[11px] leading-snug font-normal text-ink-3">{adds}</span>}
    </>
  );
}

function BlockedRow({ c }: { c: Candidate }) {
  const { card, eligibility } = c;
  const verdict = verdictOf(eligibility);
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 p-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:p-5">
      <CardArt card={card} size="xs" className="mt-1" />
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Link href={`/cards/${card.id}`} className="inline-block py-1 font-semibold text-navy hover:text-brand sm:py-0">
            {card.name}
          </Link>
          <Badge tone={verdict.tone}>{verdict.label}</Badge>
        </div>
        <div className="mt-2">
          <BlockingRules results={eligibility.blocking} />
          <BonusIssue c={c} className="mt-2" />
        </div>
      </div>
      {!eligibility.permanent && (
        <div className="col-start-2 text-sm sm:col-start-auto sm:max-w-56 sm:text-right">
          <p className="text-xs text-ink-3">First year, once clear</p>
          <p>
            <OnceClear c={c} />
          </p>
        </div>
      )}
    </li>
  );
}

/** Several cards held back by the same rule: the rule once, then the cards. */
function BlockedGroup({ group }: { group: Candidate[] }) {
  const verdict = verdictOf(group[0].eligibility);
  return (
    <li className="space-y-3 p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="font-semibold text-navy">
          {group.length} {issuerShort(group[0].card.issuer)} cards
        </p>
        <Badge tone={verdict.tone}>{verdict.label}</Badge>
      </div>
      <BlockingRules results={group[0].eligibility.blocking} />
      <ul className="divide-y divide-line rounded-md border border-line">
        {group.map((c) => (
          <li key={c.card.id} className="flex items-start gap-3 px-3 py-2 text-sm">
            <CardArt card={c.card} size="xs" className="mt-1" />
            <div className="min-w-0 flex-1">
              <Link href={`/cards/${c.card.id}`} className="inline-block py-1 font-medium text-navy hover:text-brand">
                {c.card.name}
              </Link>
              <BonusIssue c={c} />
            </div>
            {!c.eligibility.permanent && (
              <span className="shrink-0 pt-1 text-right text-xs text-ink-3">
                Once clear{" "}
                <span className="block text-sm">
                  <OnceClear c={c} compact />
                </span>
              </span>
            )}
          </li>
        ))}
      </ul>
    </li>
  );
}

function Cell({
  label,
  value,
  prefix,
  reserve,
  strong,
  strike,
  muted,
  tone,
}: {
  label: string;
  value: string;
  /** Small text on a line above the value, like "up to". */
  prefix?: string;
  /** Keep the prefix line even without a prefix, so the values in a row line up. */
  reserve?: boolean;
  strong?: boolean;
  /** The amount may not be paid (a bonus at risk or not confirmed). */
  strike?: boolean;
  /** Not counted in the first-year value. */
  muted?: boolean;
  tone?: "pos" | "neg";
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd
        className={cn(
          "font-semibold",
          strong ? (tone === "neg" ? "text-danger" : "text-success") : "text-ink",
          (strike || muted) && "text-ink-3",
        )}
      >
        {(prefix || reserve) && (
          <span className="block text-[11px] leading-tight font-normal text-ink-3" aria-hidden={prefix ? undefined : true}>
            {prefix || "\u00a0"}
          </span>
        )}
        <span className={cn("whitespace-nowrap", strike && "line-through decoration-warn")}>{value}</span>
      </dd>
    </div>
  );
}
