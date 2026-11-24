"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronDown, CircleHelp, Clock, Info, ListChecks, Trophy } from "lucide-react";
import { CardArt } from "@/frontend/components/card-art";
import { useHydrated, useWallet } from "@/frontend/state/wallet-store";
import { strategyPrefs, useStrategyPrefs } from "@/frontend/state/strategy-prefs";
import { NEEDS_HISTORY, chase524, historyContext } from "@/shared/lib/eligibility";
import { rankNextCards, usableKey, type Candidate, type NextCardScope } from "@/shared/lib/next-card";
import { frequencyShort } from "@/shared/lib/periods";
import { cn, usd } from "@/shared/lib/format";
import { ApplicationsEditor } from "./applications-editor";
import { FiveTwentyFourPanel } from "./five-24-panel";
import { Badge, CertaintyChip, RuleResults, SourceLinks, clearsText, verdictOf } from "./rule-results";

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

const SCOPES: [NextCardScope, string][] = [
  ["personal", "Personal"],
  ["business", "Business"],
  ["all", "All cards"],
];

/** How many rows each list shows before "Show all". */
const FIRST = { eligible: 8, unknown: 5, blocked: 6 };

/** Rendered only in the browser: reads the wallet, preferences and today's date. */
function NextCardDashboard() {
  const wallet = useWallet();
  const prefs = useStrategyPrefs();
  const [now] = useState(() => new Date());
  const [scope, setScope] = useState<NextCardScope>("personal");
  const ctx = useMemo(() => historyContext(wallet, now), [wallet, now]);
  const counter = useMemo(() => chase524(ctx), [ctx]);
  const ranking = useMemo(() => rankNextCards({ wallet, today: now, usable: prefs.usable, scope }), [wallet, now, prefs.usable, scope]);
  // Without a card history almost every rule is unknown, so splitting "ready" from "check first" would put cards we
  // simply have no rules for on top. Rank them together by value instead, each with its own status.
  const combined = !ctx.historyKnown;
  const ready = combined
    ? [...ranking.eligible, ...ranking.unknown].sort((a, b) => b.value.total - a.value.total || a.card.name.localeCompare(b.card.name))
    : ranking.eligible;

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
      <div className={cn("container-page grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]", ctx.historyKnown ? "py-10" : "pt-8 pb-10")}>
        <aside className="space-y-5 lg:sticky lg:top-28 lg:col-start-2 lg:row-span-2 lg:self-start">
          <FiveTwentyFourPanel status={counter} today={now} collapsible />
          <HowWeCheck className="hidden lg:block" />
        </aside>

        <div className="min-w-0 space-y-10 lg:col-start-1 lg:row-start-1">
          <section className="space-y-4" aria-labelledby="ready-title">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 id="ready-title" className="text-xl font-semibold text-navy">
                  {combined ? "Ranked by first-year value" : "Ready to apply"}
                </h2>
                <p className="text-sm text-ink-2">
                  {combined
                    ? "Welcome offer + credits you'd use − annual fee. Each card shows what we can tell without your history."
                    : "Cards whose rules you pass, ranked by first-year value: welcome offer + credits you'd use − annual fee."}
                </p>
              </div>
              <div className="flex gap-1 rounded-md bg-white p-1 shadow-[var(--shadow-card)]" role="radiogroup" aria-label="Card type">
                {SCOPES.map(([id, label]) => (
                  <button
                    key={id}
                    role="radio"
                    aria-checked={scope === id}
                    onClick={() => setScope(id)}
                    className={cn("rounded px-3 py-1.5 text-sm font-medium", scope === id ? "bg-sky text-brand" : "text-ink-2 hover:text-ink")}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {ready.length === 0 ? (
              <div className="panel p-6 text-sm text-ink-2">No cards pass every rule right now. The lists below show what&apos;s missing and when blocks clear.</div>
            ) : (
              <ShowMore key={`e-${scope}-${combined}`} items={ready} first={FIRST.eligible} noun="cards" as="ol">
                {(c, i) => <CandidateRow key={c.card.id} c={c} rank={i + 1} usable={prefs.usable} topLabel={combined ? "Highest value" : "Top pick"} />}
              </ShowMore>
            )}
          </section>

          {!combined && ranking.unknown.length > 0 && (
            <section className="space-y-4" aria-labelledby="check-title">
              <div>
                <h2 id="check-title" className="text-xl font-semibold text-navy">
                  Check first
                </h2>
                <p className="text-sm text-ink-2">Nothing blocks these that we know of, but a rule needs information we don&apos;t have yet.</p>
              </div>
              <ShowMore key={`u-${scope}`} items={ranking.unknown} first={FIRST.unknown} noun="cards">
                {(c) => <CandidateRow key={c.card.id} c={c} usable={prefs.usable} />}
              </ShowMore>
            </section>
          )}

          {ranking.blocked.length > 0 && (
            <section className="space-y-4" aria-labelledby="blocked-title">
              <div>
                <h2 id="blocked-title" className="text-xl font-semibold text-navy">
                  Not yet
                </h2>
                <p className="text-sm text-ink-2">A rule blocks approval or the welcome bonus. Soonest to clear first.</p>
              </div>
              <ShowMore key={`b-${scope}`} items={ranking.blocked} first={FIRST.blocked} noun="cards" className="panel space-y-0 divide-y divide-line">
                {(c) => <BlockedRow key={c.card.id} c={c} />}
              </ShowMore>
            </section>
          )}

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

          <ApplicationsEditor id="history" wallet={wallet} today={now} counter={counter} />
          <HowWeCheck className="lg:hidden" />
        </div>
      </div>
    </div>
  );
}

function HowWeCheck({ className }: { className?: string }) {
  return (
    <div className={cn("panel p-5 text-sm", className)}>
      <p className="flex items-center gap-2 font-semibold text-ink">
        <ListChecks className="h-4 w-4 text-brand" /> How we check
      </p>
      <p className="mt-2 leading-relaxed text-ink-2">
        Each card is checked against its issuer&apos;s approval and welcome-bonus rules, using your card history and wallet.{" "}
        <CertaintyChip certainty="official" /> rules come from the issuer&apos;s terms; <CertaintyChip certainty="widely reported" /> ones from
        applicants&apos; reports.
      </p>
      <p className="mt-2 text-xs text-ink-3">Issuers can still decline for other reasons, like income, credit score or recent inquiries.</p>
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
  children,
}: {
  items: T[];
  first: number;
  noun: string;
  as?: "ul" | "ol";
  className?: string;
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
          {all ? "Show fewer" : `Show all ${items.length} ${noun}`}
          <ChevronDown className={cn("h-4 w-4 transition-transform", all && "rotate-180")} />
        </button>
      )}
    </>
  );
}

function CandidateRow({ c, rank, usable, topLabel = "Top pick" }: { c: Candidate; rank?: number; usable: Record<string, true>; topLabel?: string }) {
  const [open, setOpen] = useState<"credits" | "rules" | null>(null);
  const { card, value, eligibility } = c;
  const verdict = verdictOf(eligibility);
  // The page-level banner already asks for the card history; rows name anything more specific (an open date...).
  const missing = [...new Set(eligibility.results.flatMap((r) => (r.status === "unknown" ? (r.missing ?? []) : [])))].filter((m) => m !== NEEDS_HISTORY);
  const toggle = (k: "credits" | "rules") => setOpen(open === k ? null : k);
  return (
    <li className={cn("panel overflow-hidden", rank === 1 && "ring-2 ring-brand")}>
      <div
        className={cn(
          "grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-3 p-4 sm:items-center sm:gap-x-5 sm:p-5",
          rank !== undefined ? "sm:grid-cols-[1.25rem_auto_minmax(0,1fr)_auto]" : "sm:grid-cols-[auto_minmax(0,1fr)_auto]",
        )}
      >
        {rank !== undefined && <span className="hidden text-center text-lg font-semibold text-ink-3 sm:block">{rank}</span>}
        <div className="pt-1 sm:pt-0">
          <CardArt card={card} size="xs" className="sm:hidden" />
          <CardArt card={card} size="sm" className="hidden sm:block" />
        </div>
        <div className="min-w-0">
          {rank === 1 && (
            <p className="eyebrow mb-0.5 flex items-center gap-1">
              <Trophy className="h-3.5 w-3.5" /> {topLabel}
            </p>
          )}
          <Link href={`/cards/${card.id}`} className="font-semibold text-navy hover:text-brand">
            {card.name}
          </Link>
          <p className="truncate text-sm text-ink-2" title={card.welcomeOffer}>
            {card.welcomeOffer}
          </p>
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <Badge tone={verdict.tone}>{verdict.label}</Badge>
            {missing.length > 0 && <span className="text-xs text-ink-2">Needs {missing.join(", ")}</span>}
          </p>
        </div>
        <div className="col-span-2 border-t border-line pt-3 sm:col-span-1 sm:border-0 sm:pt-0">
          <dl className="grid grid-cols-4 gap-2 text-sm sm:gap-4 sm:text-right">
            <Cell label="Welcome" value={usd(value.welcome)} />
            <Cell label="Credits" value={usd(value.credits)} />
            <Cell label="Fee" value={value.fee ? `−${usd(value.fee)}` : "$0"} />
            <Cell label="First year" value={usd(value.total)} strong tone={value.total >= 0 ? "pos" : "neg"} />
          </dl>
          {(card.credits.length > 0 || eligibility.results.length > 0) && (
            <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm sm:justify-end">
              {card.credits.length > 0 && (
                <Toggle open={open === "credits"} onClick={() => toggle("credits")}>
                  Credits you&apos;d use
                </Toggle>
              )}
              {eligibility.results.length > 0 && (
                <Toggle open={open === "rules"} onClick={() => toggle("rules")}>
                  {eligibility.results.length} rule{eligibility.results.length === 1 ? "" : "s"} checked
                </Toggle>
              )}
            </p>
          )}
        </div>
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
    <button className="inline-flex items-center gap-0.5 font-medium text-brand hover:underline" onClick={onClick} aria-expanded={open}>
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

function BlockedRow({ c }: { c: Candidate }) {
  const { card, eligibility } = c;
  const verdict = verdictOf(eligibility);
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 p-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:p-5">
      <CardArt card={card} size="xs" className="mt-1" />
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Link href={`/cards/${card.id}`} className="font-semibold text-navy hover:text-brand">
            {card.name}
          </Link>
          <Badge tone={verdict.tone}>{verdict.label}</Badge>
        </div>
        <ul className="mt-2 space-y-3">
          {eligibility.blocking.map((r) => {
            const clears = clearsText(r, r.rule.kind);
            return (
              <li key={r.rule.id} className="text-sm">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-ink">{r.rule.name}</span>
                  <CertaintyChip certainty={r.rule.certainty} />
                </p>
                <p className="mt-0.5 text-ink-2">{r.reason}</p>
                {clears && (
                  <p className={cn("mt-1 flex items-start gap-1 text-xs font-semibold", r.permanent ? "text-danger" : "text-warn")}>
                    <Clock className="mt-px h-3.5 w-3.5 shrink-0" /> {clears}
                  </p>
                )}
                <SourceLinks sources={r.rule.sources} className="mt-1" />
              </li>
            );
          })}
        </ul>
      </div>
      {!eligibility.permanent && (
        <div className="col-start-2 text-sm sm:col-start-auto sm:text-right">
          <p className="text-xs text-ink-3">First year, once clear</p>
          <p className="font-semibold text-ink">{usd(c.value.total)}</p>
        </div>
      )}
    </li>
  );
}

function Cell({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: "pos" | "neg" }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className={cn("font-semibold whitespace-nowrap", strong ? (tone === "neg" ? "text-danger" : "text-success") : "text-ink")}>{value}</dd>
    </div>
  );
}
