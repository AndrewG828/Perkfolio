"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronDown, ShieldCheck } from "lucide-react";
import { getCard } from "@/shared/data/cards";
import { useHydrated, useWallet } from "@/frontend/state/wallet-store";
import { useStrategyPrefs } from "@/frontend/state/strategy-prefs";
import { chase524, evaluateCard, historyContext, sameIssuer, type CardEligibility } from "@/shared/lib/eligibility";
import { cn } from "@/shared/lib/format";
import { Badge, FactQuestion, RuleResults, clearsText, onlyQuestions, verdictOf } from "@/frontend/features/next-card/rule-results";

/**
 * "Can I get it?": the card's issuer rules checked against the visitor's card history. Sits under the welcome offer
 * on the card page; personal, so it renders after hydration.
 */
export function EligibilityPanel({ cardId }: { cardId: string }) {
  const hydrated = useHydrated();
  if (!hydrated) {
    return (
      <div className="mt-4 border-t border-line pt-4" aria-hidden>
        <div className="h-5 w-40 animate-pulse rounded bg-canvas" />
        <div className="mt-2 h-4 w-64 max-w-full animate-pulse rounded bg-canvas" />
      </div>
    );
  }
  return <Panel cardId={cardId} />;
}

const lcFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** "the 4 rules and 1 note": the same count as the headline's "all 4 rules", with notices (nothing to check) apart. */
function rulesPhrase(e: CardEligibility): string {
  const rules = e.results.filter((r) => r.status !== "notice").length;
  const notes = e.results.length - rules;
  const r = rules === 0 ? "" : rules === 1 ? "rule" : `${rules} rules`;
  const n = notes === 0 ? "" : notes === 1 ? (rules ? "1 note" : "note") : `${notes} notes`;
  return `the ${[r, n].filter(Boolean).join(" and ")}`;
}

function headline(e: CardEligibility, count524: string | null): string {
  if (e.closedToApplicants) return "This card is closed to new applicants.";
  if (e.held) return "You have this card already.";
  const checked = e.results.filter((r) => r.status !== "notice");
  if (checked.length === 0) return "We don't track any issuer rules for this card yet.";
  if (e.status === "eligible") {
    const n = checked.length;
    return `You pass ${n === 1 ? "the 1 rule" : `all ${n} rules`} we track for it${count524 ? `, and you're at ${count524}` : ""}.`;
  }
  if (e.status === "blocked") {
    const first = e.blocking[0];
    const clears = clearsText(first, first.rule.kind);
    return `${first.rule.name}: ${lcFirst(first.reason)}${clears ? ` ${clears}.` : ""}`;
  }
  if (e.status === "warning") {
    const w = e.warnings[0];
    const what =
      w.rule.kind === "bonus"
        ? " The issuer may not give you the welcome bonus."
        : w.rule.logic.soft
          ? " It's a soft limit: approval is still possible, just less likely."
          : "";
    return `${w.rule.name}: ${lcFirst(w.reason)}${what}`;
  }
  if (onlyQuestions(e)) return "Nothing blocks you that we know of. One answer below settles the rest.";
  const missing = [...new Set(e.results.flatMap((r) => (r.status === "unknown" ? (r.missing ?? []) : [])))];
  return missing.length ? `Nothing blocks you that we know of. Still needed: ${missing.join("; ")}.` : "We can't settle every rule yet.";
}

function Panel({ cardId }: { cardId: string }) {
  const wallet = useWallet();
  const { facts } = useStrategyPrefs();
  const [now] = useState(() => new Date());
  const [open, setOpen] = useState(false);
  const card = getCard(cardId)!;
  const { e, counter } = useMemo(() => {
    const ctx = historyContext(wallet, now, facts);
    return { e: evaluateCard(card, ctx), counter: chase524(ctx) };
  }, [wallet, now, card, facts]);
  const verdict = verdictOf(e);
  const isChase = sameIssuer(card.issuer, "Chase") && e.results.some((r) => r.rule.logic.type === "max-new-cards");
  // Questions are answered right here; anything else missing (open dates, the exact day) goes in the card history.
  const needsHistory = !e.historyKnown || e.results.some((r) => r.status === "unknown" && (r.missing?.length ?? 0) > 0);
  const active = !e.held && !e.closedToApplicants;
  const showHistoryLink = needsHistory && active;
  // The history entry a rule needs something from (a bonus month, an open date) opens straight in its form.
  const record = e.historyKnown ? e.results.flatMap((r) => (r.status === "unknown" ? (r.records ?? []) : [])).find((k) => !k.startsWith("wallet:")) : undefined;

  return (
    <div className="mt-4 border-t border-line pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold text-ink">
          <ShieldCheck className="h-4 w-4 text-brand" /> Can I get it?
        </p>
        <Badge tone={verdict.tone}>{verdict.label}</Badge>
      </div>
      <p className="mt-1.5 text-sm text-ink-2">{headline(e, isChase ? `${counter.count}/${counter.months}` : null)}</p>
      {active && e.questions.map((q) => <FactQuestion key={q} fact={q} className="mt-2" />)}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        {showHistoryLink && (
          <Link href={record ? `/next-card#history-${record}` : "/next-card#history"} className="link inline-flex min-h-10 items-center sm:min-h-0">
            {e.historyKnown ? "Update your card history" : "Add your card history"}
          </Link>
        )}
        {e.results.length > 0 && (
          <button
            className="inline-flex min-h-10 items-center gap-1 font-medium text-brand hover:underline sm:min-h-0"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
          >
            {open ? "Hide" : "See"} {rulesPhrase(e)}
            <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
          </button>
        )}
        {!showHistoryLink && (
          <Link href="/next-card" className="inline-flex min-h-10 items-center font-medium text-ink-2 hover:text-brand sm:min-h-0">
            Plan your next card
          </Link>
        )}
      </div>
      {open && (
        <div className="mt-4 rounded-md bg-canvas/70 p-4">
          <RuleResults results={e.results} compact />
          <p className="mt-4 border-t border-line pt-3 text-xs leading-relaxed text-ink-3">
            Official rules are the issuer&apos;s own wording, read on its site. Widely reported ones are rules two or more
            independent outlets agree on: most are unwritten, and a few are the issuer&apos;s own wording that we couldn&apos;t
            read on its site (each rule&apos;s details say which). Passing every rule isn&apos;t a promise: issuers can still
            decline you, or withhold a bonus, for other reasons such as income, credit score, recent inquiries or your
            history with them.
          </p>
        </div>
      )}
    </div>
  );
}
