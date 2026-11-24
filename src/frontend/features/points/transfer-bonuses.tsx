"use client";

import Link from "next/link";
import { ArrowRight, ArrowUpRight, Gift } from "lucide-react";
import { getCard } from "@/shared/data/cards";
import { getCurrency, hasProgramPage, programName, transferPartners, type BankCurrencyId } from "@/shared/data/points";
import { liveBonuses, localIsoDate, partnerPointsFor, type LiveBonus } from "@/shared/lib/points";
import { shortCardName } from "@/shared/lib/card-name";
import { cn, num } from "@/shared/lib/format";
import { CURRENCY_ABBR, CURRENCY_COLOR, Dot, SourceList, formatDate, hostOf, listJoin } from "./ui";
import { useWalletReach } from "./use-wallet-reach";

/** "Ends today" / "1 day left" / "12 days left" / "Starts Dec 1". */
export function bonusTiming(b: LiveBonus): string {
  if (!b.started) return `Starts ${formatDate(b.bonus.starts)}`;
  if (b.daysLeft === 0) return "Ends today";
  return `${b.daysLeft} day${b.daysLeft === 1 ? "" : "s"} left`;
}

/**
 * Limited-time transfer bonuses, soonest ending first (as the hub says). The list depends on today's date, so it
 * renders after hydration (a placeholder before): a bonus disappears the day after it ends. Currencies the wallet
 * earns are marked, not moved up, so a bonus about to end is never pushed off a short list.
 */
export function TransferBonuses({ limit, compact = false }: { limit?: number; compact?: boolean }) {
  const wallet = useWalletReach();
  if (!wallet.hydrated) {
    return (
      <div className={cn("grid gap-3", compact ? "sm:grid-cols-2 lg:grid-cols-3" : "md:grid-cols-2")} aria-hidden>
        {Array.from({ length: compact ? 3 : 4 }, (_, i) => (
          <div key={i} className="panel h-28 animate-pulse bg-canvas" />
        ))}
      </div>
    );
  }
  const today = localIsoDate();
  const mine = wallet.mine;
  const all = liveBonuses(today);
  const shown = limit ? all.slice(0, limit) : all;
  if (all.length === 0) {
    return <p className="panel p-5 text-sm text-ink-2">No transfer bonuses are running right now. Banks run them a few times a year; check back.</p>;
  }
  return (
    <div className="space-y-3">
      <ul className={cn("grid gap-3", compact ? "sm:grid-cols-2 lg:grid-cols-3" : "md:grid-cols-2")}>
        {shown.map((b) => (
          <BonusCard key={`${b.bonus.currency}-${b.bonus.program}`} live={b} yours={mine.has(b.bonus.currency)} compact={compact} />
        ))}
      </ul>
      {limit && all.length > shown.length && (
        <Link href="/points/transfers#bonuses" className="group inline-flex items-center gap-1 text-sm font-semibold text-brand hover:underline">
          All {all.length} transfer bonuses <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </Link>
      )}
    </div>
  );
}

function BonusCard({ live, yours, compact }: { live: LiveBonus; yours: boolean; compact: boolean }) {
  const { bonus } = live;
  const currency = getCurrency(bonus.currency);
  const cards = (bonus.cards ?? []).map((id) => getCard(id)).filter(Boolean).map((c) => shortCardName(c!.name));
  const soon = live.started && live.daysLeft <= 3;
  // The usual rate next to the bonus one, so a bonus on a below-1:1 transfer (Copa's 4:3) doesn't read like a loss.
  const usualRow = transferPartners.find((p) => p.currency === bonus.currency && p.program === bonus.program && !p.cards);
  const usual = usualRow && partnerPointsFor(usualRow, 1000) !== 1000 ? usualRow : null;
  return (
    <li className={cn("panel flex flex-col gap-2 p-4", yours && "ring-2 ring-brand/40")}>
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 text-sm font-semibold text-ink">
          <span className="inline-flex items-center gap-1.5">
            <Dot color={CURRENCY_COLOR[bonus.currency]} />
            {CURRENCY_ABBR[bonus.currency as BankCurrencyId]}
          </span>{" "}
          →{" "}
          {hasProgramPage(bonus.program) ? (
            <Link href={`/points/programs/${bonus.program}`} className="hover:text-brand">
              {programName(bonus.program)}
            </Link>
          ) : (
            programName(bonus.program)
          )}
        </p>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-gold/15 px-2.5 py-0.5 text-sm font-bold text-[#7a5a12]">
          <Gift className="h-3.5 w-3.5" aria-hidden />+{bonus.bonusPercent}%
        </span>
      </div>
      <p className="text-sm text-ink-2">
        <span className="font-semibold text-ink tabular-nums">
          {num(1000)} → {num(partnerPointsFor(bonus, 1000))}
        </span>{" "}
        while it runs{usual ? <span className="text-ink-3"> (usually {num(partnerPointsFor(usual, 1000))})</span> : null} ·{" "}
        <span className={cn("font-semibold", soon ? "text-danger" : "text-ink")}>{bonusTiming(live)}</span>
        <span className="text-ink-3"> · ends {formatDate(bonus.ends)}</span>
      </p>
      <div className="flex flex-wrap gap-1.5 text-[11px] font-semibold">
        {yours && <span className="rounded-full bg-brand px-2 py-0.5 text-white">You earn {currency?.shortName}</span>}
        {bonus.targeted && <span className="rounded-full bg-warn/12 px-2 py-0.5 text-warn">Targeted: check your account</span>}
        {cards.length > 0 && <span className="rounded-full bg-canvas px-2 py-0.5 text-ink-2">{listJoin(cards)} only</span>}
        {bonus.startsBasis === "first reported" && live.started && (
          <span className="rounded-full bg-canvas px-2 py-0.5 font-medium text-ink-3">First reported {formatDate(bonus.starts)}</span>
        )}
      </div>
      {!compact && bonus.notes && <p className="text-xs leading-relaxed text-ink-3">{bonus.notes}</p>}
      <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1">
        <a href={bonus.sources[0]} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline">
          Source: {hostOf(bonus.sources[0] ?? "")} <ArrowUpRight className="h-3 w-3" aria-hidden />
        </a>
        {!compact && bonus.sources.length > 1 && <SourceList urls={bonus.sources} label="All sources" />}
      </div>
    </li>
  );
}
