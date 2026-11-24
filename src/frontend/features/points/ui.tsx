import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import {
  PROGRAM_BRIDGES,
  getCurrency,
  hasProgramPage,
  partnerChangeOf,
  programName,
  programRef,
  whoCanBookCaveats,
  type Alliance,
  type AwardProgram,
  type BankCurrencyId,
  type Cabin,
  type FeeLevel,
  type Pricing,
  type ProgramId,
  type SurchargeLevel,
  type SweetSpot,
  type TransferPartner,
} from "@/shared/data/points";
import { ratioLabel, wholeRatio } from "@/shared/lib/points";
import { cn } from "@/shared/lib/format";

// Small presentational pieces shared by the Points & Miles pages. No hooks, so server and client components can
// both use them.

/** Identification colors (a dot next to the name, never the only signal). */
export const CURRENCY_COLOR: Record<BankCurrencyId, string> = {
  "amex-mr": "#006fcf",
  "chase-ur": "#1a3f8f",
  "capital-one": "#c8332b",
  "citi-typ": "#0e8fcf",
  bilt: "#1f2328",
  "wells-fargo": "#c79100",
};

/** Compact labels for chips; full names stay in titles and headings. */
export const CURRENCY_ABBR: Record<BankCurrencyId, string> = {
  "amex-mr": "Amex",
  "chase-ur": "Chase",
  "capital-one": "Capital One",
  "citi-typ": "Citi",
  bilt: "Bilt",
  "wells-fargo": "Wells Fargo",
};

/**
 * The who-can-book research's caveats on how the lists were built, minus two the pages already cover: seat
 * availability (said under each airline) and bridge programs (folded into the program they book through, e.g. Virgin
 * Red into Flying Club).
 */
export const LIST_CAVEATS = whoCanBookCaveats.filter(
  (c) => !/doesn't mean seats/i.test(c) && !PROGRAM_BRIDGES.some((b) => c.includes(programName(b.from))),
);

/** A currency's name in a sentence: its short name, with "miles" for Capital One ("60,000 Capital One miles"). */
export function currencyProse(id: BankCurrencyId): string {
  const short = getCurrency(id)?.shortName ?? CURRENCY_ABBR[id];
  return /miles|points|rewards/i.test(short) ? short : `${short} ${id === "capital-one" ? "miles" : "points"}`;
}

export const ALLIANCE_COLOR: Record<Alliance, string> = {
  "Star Alliance": "#3d4148",
  oneworld: "#6a4c9c",
  SkyTeam: "#0a7bc2",
};
const UNAFFILIATED = "#8a8d91";
const HOTEL = "#b08d3c";

export function programColor(p: { kind: AwardProgram["kind"]; alliance?: Alliance } | undefined): string {
  if (!p) return UNAFFILIATED;
  if (p.kind === "hotel") return HOTEL;
  return p.alliance ? ALLIANCE_COLOR[p.alliance] : UNAFFILIATED;
}

export const PRICING: Record<Pricing, { label: string; detail: string }> = {
  "award chart": { label: "Award chart", detail: "Fixed prices from a published chart." },
  "distance-based": { label: "Distance-based", detail: "Prices are set by how far you fly." },
  dynamic: { label: "Dynamic pricing", detail: "Prices move with demand and the cash rate." },
  hybrid: { label: "Hybrid pricing", detail: "A chart for some awards, dynamic prices for others." },
};

export const SURCHARGES: Record<SurchargeLevel, { label: string; detail: string }> = {
  none: { label: "No surcharges", detail: "Partner awards carry no carrier surcharges." },
  low: { label: "Low surcharges", detail: "Partner awards rarely carry carrier surcharges." },
  mixed: { label: "Mixed surcharges", detail: "Surcharges depend on the airline you fly." },
  high: { label: "High surcharges", detail: "Expect carrier surcharges on many partner awards." },
};

export const FEES: Record<SweetSpot["kind"], Record<FeeLevel, { label: string; detail: string }>> = {
  flight: {
    low: { label: "Low fees", detail: "Mostly government taxes, with little else to pay." },
    moderate: { label: "Moderate fees", detail: "Taxes plus some carrier surcharges." },
    high: { label: "High fees", detail: "Large carrier surcharges on top of taxes." },
  },
  hotel: {
    low: { label: "Low fees", detail: "Little or nothing to pay on top of the points." },
    moderate: { label: "Moderate fees", detail: "Expect some resort fees, taxes or transfer costs." },
    high: { label: "High fees", detail: "Resort fees, taxes or transfers add a lot." },
  },
};

const FEE_TONE: Record<FeeLevel, string> = {
  low: "bg-success",
  moderate: "bg-warn",
  high: "bg-danger",
};

export const CABIN_LABEL: Record<Cabin, string> = {
  economy: "Economy",
  "premium economy": "Premium economy",
  business: "Business",
  first: "First",
};

/** "Nov 1, 2026" from an ISO date, the same on server and client. */
export function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** "Until Dec 16, 2026" for a listing that ends on 2026-12-17 (BookableAirline.endsOn: the first day it no longer applies). */
export function untilLabel(endsOn: string): string {
  const d = new Date(`${endsOn}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return `Until ${formatDate(d.toISOString().slice(0, 10))}`;
}

/** "Nov 2026" from "2026-11", or "Nov 24, 2026" from an ISO date. */
export function formatAsOf(asOf: string): string {
  if (/^\d{4}-\d{2}$/.test(asOf)) {
    return new Date(`${asOf}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
  }
  return formatDate(asOf);
}

/**
 * Hotel points : airline miles in smallest whole numbers, like the transfer ratios ("3:1", "20:3" for 10:1.5, "50:13"
 * for 25:6.5). Hotel rates run up to 200:1 (Marriott to Air New Zealand), so the terms may be larger.
 */
export function hotelRatio(r: { fromPoints: number; toMiles: number }): string {
  const fmt = new Intl.NumberFormat("en-US");
  return wholeRatio({ from: r.fromPoints, to: r.toMiles }, 200) ?? `${fmt.format(r.fromPoints)}:${fmt.format(r.toMiles)}`;
}

/** A transfer's time, or that no source confirms one (never a guess). */
export function timeLabel(p: Pick<TransferPartner, "time">): string {
  return p.time ?? "Time not confirmed";
}

/**
 * "4:3 from Jan 1, 2027" for a transfer with a scheduled ratio change, else null. A dated row (partnerOn(), after
 * hydration) no longer carries `scheduled` once the date comes; changeLabel() then says when it changed.
 */
export function scheduledLabel(p: Pick<TransferPartner, "scheduled">): string | null {
  return p.scheduled ? `${ratioLabel(p.scheduled)} from ${formatDate(p.scheduled.date)}` : null;
}

/** "Added Nov 18, 2026" / "Ratio changed Mar 1, 2026" for a row the partner-change log added or changed, else null. */
export function changeLabel(p: Pick<TransferPartner, "currency" | "program" | "changedOn">): string | null {
  if (!p.changedOn) return null;
  const change = partnerChangeOf(p);
  return `${change?.change === "added" ? "Added" : "Ratio changed"} ${formatDate(p.changedOn)}`;
}

/** "Minimum 1,000, in steps of 1,000" / "Any amount" / null. */
export function rulesLine(p: Pick<TransferPartner, "minimum" | "increment">): string | null {
  if (p.minimum !== undefined && p.minimum <= 1 && (p.increment ?? 1) <= 1) return "Any amount";
  const fmt = new Intl.NumberFormat("en-US");
  const parts = [p.minimum ? `Minimum ${fmt.format(p.minimum)}` : null, p.increment && p.increment > 1 ? `in steps of ${fmt.format(p.increment)}` : null];
  const out = parts.filter(Boolean).join(", ");
  return out ? out.charAt(0).toUpperCase() + out.slice(1) : null;
}

/** Shown in place of a value no source confirms. */
export function Unknown({ children = "Unknown", className }: { children?: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 text-ink-3 italic", className)}>
      <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full border border-ink-3" />
      {children}
    </span>
  );
}

/** "Sources (3)": every link, by host, in a disclosure. */
export function SourceList({ urls, label = "Sources", className }: { urls: string[]; label?: string; className?: string }) {
  const list = Array.from(new Set(urls));
  if (list.length === 0) return null;
  return (
    <details className={cn("group text-xs text-ink-3", className)}>
      <summary className="cursor-pointer list-none font-medium text-brand hover:underline focus-visible:outline-2 focus-visible:outline-brand [&::-webkit-details-marker]:hidden">
        {label} ({list.length})
      </summary>
      <ul className="mt-1.5 space-y-1">
        {list.map((u) => (
          <li key={u} className="min-w-0">
            <a href={u} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-1 text-brand hover:underline">
              <span className="truncate">
                {hostOf(u)}
                <span className="text-ink-3">{pathOf(u)}</span>
              </span>
              <ArrowUpRight className="h-3 w-3 shrink-0" aria-hidden />
            </a>
          </li>
        ))}
      </ul>
    </details>
  );
}

function pathOf(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname.length > 1 ? u.pathname.replace(/\/$/, "") : "";
  } catch {
    return "";
  }
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Two-letter mark for a program ("Air Canada Aeroplan" → "AC"). */
export function monogram(name: string): string {
  const words = name.split(/[\s-]+/).filter((w) => w && !/^(of|the|and|&)$/i.test(w));
  return words
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

export function Dot({ color, className }: { color: string; className?: string }) {
  return <span aria-hidden className={cn("inline-block h-2 w-2 shrink-0 rounded-full", className)} style={{ background: color }} />;
}

export function ProgramMark({
  program,
  size = "md",
  onDark = false,
}: {
  program: Pick<AwardProgram, "name" | "kind" | "alliance">;
  size?: "sm" | "md" | "lg";
  /** Adds a light ring so the mark stands out on the navy hero. */
  onDark?: boolean;
}) {
  const box = { sm: "h-8 w-8 text-[11px]", md: "h-11 w-11 text-sm", lg: "h-12 w-12 text-base md:h-14 md:w-14" }[size];
  return (
    <span
      aria-hidden
      className={cn("grid shrink-0 place-items-center rounded-md font-bold tracking-wide text-white shadow-sm", box, onDark && "ring-2 ring-white/30")}
      style={{ background: `linear-gradient(135deg, ${programColor(program)} 0%, #00175a 140%)` }}
    >
      {monogram(program.name)}
    </span>
  );
}

/** Program name with its alliance (or hotel) color; links to the program page. */
export function ProgramBadge({ program, className }: { program: ProgramId; className?: string }) {
  const inner = (
    <>
      <Dot color={programColor(programRef(program))} />
      <span className="truncate">{programName(program)}</span>
    </>
  );
  const cls = cn(
    "inline-flex max-w-full items-center gap-1.5 rounded-full border border-line bg-white px-2.5 py-0.5 text-xs font-semibold text-ink-2",
    className,
  );
  return hasProgramPage(program) ? (
    <Link href={`/points/programs/${program}`} className={cn(cls, "hover:border-brand hover:text-brand")}>
      {inner}
    </Link>
  ) : (
    <span className={cls}>{inner}</span>
  );
}

export function AllianceBadge({ alliance, onDark = false }: { alliance?: Alliance; onDark?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold",
        onDark ? "bg-white/12 text-white ring-1 ring-white/25" : "bg-canvas text-ink-2 ring-1 ring-line",
      )}
    >
      <Dot color={alliance ? ALLIANCE_COLOR[alliance] : UNAFFILIATED} className={onDark ? "ring-1 ring-white/60" : undefined} />
      {alliance ?? "No alliance"}
    </span>
  );
}

/** "1:1" / "2:1.5" pill. `mine` marks a currency the wallet earns. */
export function RatioPill({
  partner,
  mine = false,
  varies = false,
  className,
}: {
  partner: Pick<TransferPartner, "from" | "to">;
  mine?: boolean;
  /** Ratio depends on the card: adds a marker (explain it nearby). */
  varies?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex min-w-[3.25rem] items-center justify-center gap-0.5 rounded-full px-2.5 py-1 text-xs leading-none font-semibold tabular-nums",
        mine ? "bg-brand text-white" : "bg-sky text-brand-dark ring-1 ring-brand/15",
        className,
      )}
    >
      {ratioLabel(partner)}
      {varies && <span aria-hidden>*</span>}
    </span>
  );
}

export function FeeLevelTag({ kind, level }: { kind: SweetSpot["kind"]; level: FeeLevel }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink">
      <span aria-hidden className={cn("h-2 w-2 rounded-full", FEE_TONE[level])} />
      {FEES[kind][level].label}
    </span>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  children,
  action,
  id,
}: {
  eyebrow?: string;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  id?: string;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-2xl">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h2 id={id} className="mt-2 text-2xl font-semibold tracking-tight text-navy md:text-3xl">
          {title}
        </h2>
        {children && <div className="mt-2 text-ink-2">{children}</div>}
      </div>
      {action}
    </div>
  );
}

/** "A, B and C" */
export function listJoin(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
