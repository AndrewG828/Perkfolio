import { ArrowUpRight, CheckCircle2, CircleHelp, Clock, XCircle } from "lucide-react";
import type { ApplicationRule } from "@/shared/data/strategy/types";
import type { CardEligibility, RuleResult } from "@/shared/lib/eligibility";
import { formatDate } from "@/shared/lib/dates";
import { cn } from "@/shared/lib/format";

/** "Official" (from the issuer's terms) or "Widely reported" (data points from applicants). */
export function CertaintyChip({ certainty }: { certainty: ApplicationRule["certainty"] }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap",
        certainty === "official" ? "bg-navy/5 text-navy" : "bg-canvas text-ink-2",
      )}
      title={certainty === "official" ? "In the issuer's own terms" : "Not in the terms; based on applicants' reports"}
    >
      {certainty === "official" ? "Official" : "Widely reported"}
    </span>
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

export function SourceLinks({ sources, className }: { sources: string[]; className?: string }) {
  if (sources.length === 0) return null;
  return (
    <span className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-3", className)}>
      <span>Source{sources.length === 1 ? "" : "s"}:</span>
      {sources.map((s) =>
        isWebUrl(s) ? (
          <a key={s} href={s} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 font-medium text-brand hover:underline">
            {hostOf(s)}
            <ArrowUpRight className="h-3 w-3" />
          </a>
        ) : (
          <span key={s}>{s}</span>
        ),
      )}
    </span>
  );
}

const ICON = {
  eligible: <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-label="Passes" />,
  unknown: <CircleHelp className="h-4 w-4 shrink-0 text-brand" aria-label="Needs information" />,
  blocked: <XCircle className="h-4 w-4 shrink-0 text-danger" aria-label="Blocks" />,
};

/** When a blocking rule clears: a date, an action, both, or never. */
export function clearsText(r: Pick<RuleResult, "until" | "permanent" | "action">, kind: ApplicationRule["kind"]): string | null {
  if (r.permanent) return kind === "bonus" ? "No welcome bonus on this card again" : "Doesn't clear";
  if (r.until && r.action) return `Clears ${formatDate(r.until)}, if ${r.action} by then`;
  if (r.until) return `Clears ${formatDate(r.until)}`;
  if (r.action) return `Clears once ${r.action}`;
  return null;
}

/** Every rule checked for a card: verdict, reason, when it clears, certainty and sources. */
export function RuleResults({ results, compact = false }: { results: RuleResult[]; compact?: boolean }) {
  return (
    <ul className={cn("divide-y divide-line", compact ? "text-sm" : "text-sm")}>
      {results.map((r) => {
        const clears = r.status === "blocked" ? clearsText(r, r.rule.kind) : null;
        return (
          <li key={r.rule.id} className="flex gap-3 py-3 first:pt-0 last:pb-0">
            <span className="mt-0.5">{ICON[r.status]}</span>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-semibold text-ink">{r.rule.name}</span>
                <span className="text-xs text-ink-3">{r.rule.kind === "bonus" ? "Bonus rule" : "Approval rule"}</span>
                <CertaintyChip certainty={r.rule.certainty} />
              </p>
              <p className="mt-0.5 text-ink-2">{r.reason}</p>
              {clears && (
                <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-warn">
                  <Clock className="h-3.5 w-3.5" /> {clears}
                </p>
              )}
              {!compact && <p className="mt-1 text-xs text-ink-3">{r.rule.summary}</p>}
              <SourceLinks sources={r.rule.sources} className="mt-1" />
            </div>
          </li>
        );
      })}
    </ul>
  );
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

/** The headline verdict for a card: label and tone. */
export function verdictOf(e: CardEligibility): { label: string; tone: BadgeTone } {
  if (e.closedToApplicants) return { label: "Closed to applicants", tone: "muted" };
  if (e.held) return { label: "In your wallet", tone: "muted" };
  if (e.status === "eligible") return { label: e.results.length ? "Likely eligible" : "No known rules", tone: e.results.length ? "success" : "muted" };
  if (e.status === "unknown") return { label: "Needs info", tone: "info" };
  if (e.until) return { label: `Wait until ${formatDate(e.until)}`, tone: "warn" };
  if (e.permanent) return { label: e.approval === "blocked" ? "Not eligible" : "No bonus", tone: "danger" };
  return { label: "Not yet", tone: "warn" };
}
