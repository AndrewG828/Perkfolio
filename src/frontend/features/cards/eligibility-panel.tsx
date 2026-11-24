"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronDown, ShieldCheck } from "lucide-react";
import { getCard } from "@/shared/data/cards";
import { useHydrated, useWallet } from "@/frontend/state/wallet-store";
import { chase524, evaluateCard, historyContext, sameIssuer, type CardEligibility } from "@/shared/lib/eligibility";
import { cn } from "@/shared/lib/format";
import { Badge, RuleResults, clearsText, verdictOf } from "@/frontend/features/next-card/rule-results";

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

function headline(e: CardEligibility, count524: string | null): string {
  if (e.closedToApplicants) return "This card is closed to new applicants.";
  if (e.held) return "You have this card already.";
  if (e.results.length === 0) return "We don't track any issuer rules for this card yet.";
  if (e.status === "eligible") {
    const n = e.results.length;
    return `You pass ${n === 1 ? "the 1 rule" : `all ${n} rules`} we track for it${count524 ? `, and you're at ${count524}` : ""}.`;
  }
  if (e.status === "blocked") {
    const first = e.blocking[0];
    const clears = clearsText(first, first.rule.kind);
    const reason = first.reason.charAt(0).toLowerCase() + first.reason.slice(1);
    return `${first.rule.name}: ${reason}${clears ? ` ${clears}.` : ""}`;
  }
  const missing = [...new Set(e.results.flatMap((r) => (r.status === "unknown" ? (r.missing ?? []) : [])))];
  return missing.length ? `Nothing blocks you that we know of, but we need ${missing.join(", ")}.` : "We can't settle every rule yet.";
}

function Panel({ cardId }: { cardId: string }) {
  const wallet = useWallet();
  const [now] = useState(() => new Date());
  const [open, setOpen] = useState(false);
  const card = getCard(cardId)!;
  const { e, counter } = useMemo(() => {
    const ctx = historyContext(wallet, now);
    return { e: evaluateCard(card, ctx), counter: chase524(ctx) };
  }, [wallet, now, card]);
  const verdict = verdictOf(e);
  const isChase = sameIssuer(card.issuer, "Chase") && e.results.some((r) => r.rule.logic.type === "max-new-cards");
  const needsHistory = !e.historyKnown || e.results.some((r) => r.status === "unknown");
  const showHistoryLink = needsHistory && !e.held && !e.closedToApplicants;

  return (
    <div className="mt-4 border-t border-line pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold text-ink">
          <ShieldCheck className="h-4 w-4 text-brand" /> Can I get it?
        </p>
        <Badge tone={verdict.tone}>{verdict.label}</Badge>
      </div>
      <p className="mt-1.5 text-sm text-ink-2">{headline(e, isChase ? `${counter.count}/${counter.months}` : null)}</p>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        {showHistoryLink && (
          <Link href="/next-card#history" className="link">
            {e.historyKnown ? "Update your card history" : "Add your card history"}
          </Link>
        )}
        {e.results.length > 0 && (
          <button className="inline-flex items-center gap-1 font-medium text-brand hover:underline" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            {open ? "Hide" : "See"} the {e.results.length === 1 ? "rule" : `${e.results.length} rules`}
            <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
          </button>
        )}
        {!showHistoryLink && (
          <Link href="/next-card" className="font-medium text-ink-2 hover:text-brand">
            Plan your next card
          </Link>
        )}
      </div>
      {open && (
        <div className="mt-4 rounded-md bg-canvas/70 p-4">
          <RuleResults results={e.results} compact />
        </div>
      )}
    </div>
  );
}
