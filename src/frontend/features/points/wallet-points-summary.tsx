"use client";

import Link from "next/link";
import { useState } from "react";
import { AlarmClock, ArrowRight, Info, Plus } from "lucide-react";
import { PROGRAM_BRIDGES, getCurrency, programName } from "@/shared/data/points";
import { programName as balanceName } from "@/shared/data/strategy/programs";
import { useWallet } from "@/frontend/state/wallet-store";
import { useValueContext } from "@/frontend/state/point-values";
import { resolvePointValue } from "@/shared/lib/point-value";
import { balanceStatus, ownCardPrograms, pointsValueUsd } from "@/shared/lib/trackers";
import { formatDate } from "@/shared/lib/dates";
import { num, usd } from "@/shared/lib/format";
import { CURRENCY_COLOR, Dot, currencyProse, listJoin } from "./ui";
import { useWalletReach } from "./use-wallet-reach";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Hub hero line: what the wallet earns and how far it reaches, or a prompt to add cards. */
export function WalletPointsSummary() {
  const { hydrated, points, reach } = useWalletReach();
  if (!hydrated) return <div className="min-h-[104px]" aria-hidden />;

  if (points.cards.length === 0) {
    return (
      <div className="max-w-xl rounded-lg border border-white/15 bg-white/[0.07] p-5 backdrop-blur-sm">
        <p className="font-semibold text-white">See where your own points can go</p>
        <p className="mt-1 text-sm text-white/75">
          Add the cards you hold and we&apos;ll highlight the currencies you earn, the programs they reach and the sweet spots you can book.
        </p>
        <Link href="/tracker" className="btn-light mt-4">
          <Plus className="h-4 w-4" /> Add my cards
        </Link>
      </div>
    );
  }

  const transferable = points.currencies.filter((c) => c.transferable);
  const limited = points.currencies.filter((c) => !c.transferable);
  const names = [...points.currencies.map((c) => currencyProse(c.currency)), ...points.programs.map((p) => programName(p.program))];
  const all = Array.from(reach.values());
  // Airline programs, not airlines; a bridge program spent through another (Virgin Red → Flying Club, one balance)
  // counts once.
  const bridged = new Set(PROGRAM_BRIDGES.filter((b) => reach.has(b.to)).map((b) => b.from as string));
  const airlines = all.filter((r) => r.kind === "airline" && !bridged.has(r.program)).length;
  const hotels = all.filter((r) => r.kind === "hotel").length;

  return (
    <div className="max-w-2xl space-y-4">
      {names.length > 0 ? (
        <p className="text-lg leading-relaxed text-white/90">
          Your cards earn <strong className="text-white">{listJoin(names)}</strong>
          {all.length > 0 ? (
            <>
              , which reach <strong className="text-white">{plural(airlines, "airline program", "airline programs")}</strong> and{" "}
              <strong className="text-white">{plural(hotels, "hotel program", "hotel programs")}</strong>.
            </>
          ) : (
            "."
          )}
        </p>
      ) : (
        <div className="space-y-2">
          <p className="text-lg text-white/90">Your cards earn cash back, which doesn&apos;t transfer to airlines or hotels.</p>
          <Link href="/cards?category=travel" className="group inline-flex items-center gap-1 text-sm font-semibold text-white hover:underline">
            Cards that earn transferable points <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
      )}
      {(transferable.length > 0 || points.programs.length > 0 || limited.length > 0) && (
      <ul className="flex flex-wrap gap-2" aria-label="What your cards earn">
        {transferable.map((c) => (
          <li key={c.currency} className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-sm font-semibold text-navy">
            <Dot color={CURRENCY_COLOR[c.currency]} />
            {getCurrency(c.currency)?.shortName ?? c.currency}
          </li>
        ))}
        {points.programs.map((p) => (
          <li key={p.program} className="inline-flex items-center gap-2 rounded-full border border-white/30 px-3 py-1 text-sm font-semibold text-white">
            {programName(p.program)}
          </li>
        ))}
        {limited.map((c) => (
          <li key={c.currency} className="inline-flex items-center gap-2 rounded-full border border-dashed border-white/40 px-3 py-1 text-sm font-medium text-white/80">
            <Dot color={CURRENCY_COLOR[c.currency]} className="ring-1 ring-white/70" />
            {getCurrency(c.currency)?.shortName ?? c.currency} · limited
          </li>
        ))}
      </ul>
      )}
      {limited.map((c) => (
        <p key={c.currency} className="flex max-w-xl gap-2 text-sm text-white/75">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            {getCurrency(c.currency)?.shortName}: {c.limited?.note}
          </span>
        </p>
      ))}
      <WalletBalances />
      {all.length > 0 && (
        <Link href="/points/sweet-spots?mine=1" className="group inline-flex items-center gap-1 text-sm font-semibold text-white hover:underline">
          Sweet spots you can book <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </Link>
      )}
    </div>
  );
}

/**
 * The balances on the tracker's Points tab, valued like every page values them, with any that expire soon (the same
 * expiry the tracker dates from the program's policy). Nothing when the tracker has no balances.
 */
function WalletBalances() {
  const wallet = useWallet();
  const values = useValueContext();
  const [now] = useState(() => new Date());
  const entries = Object.entries(wallet.balances ?? {});
  if (entries.length === 0) return null;
  const own = ownCardPrograms(wallet);
  const rows = entries
    .map(([id, b]) => {
      const cents = resolvePointValue(id, values)?.cents;
      const status = balanceStatus(id, b, now, { earningCard: own.open.has(id), closedCardOn: own.closed.get(id) });
      return { id, points: b.points, usd: cents === undefined ? null : pointsValueUsd(b.points, cents), status };
    })
    .sort((a, b) => (b.usd ?? 0) - (a.usd ?? 0));
  const expiring = rows.filter((r) => r.status.kind === "date" && r.status.expires && r.status.tone && r.status.tone !== "ok");
  return (
    <div className="max-w-xl rounded-lg border border-white/15 bg-white/[0.07] p-4 text-sm text-white/85">
      <p className="font-semibold text-white">Your balances (from the tracker)</p>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {rows.slice(0, 6).map((r) => (
          <li key={r.id}>
            <span className="font-semibold text-white tabular-nums">{num(r.points)}</span> {balanceName(r.id)}
            {r.usd !== null ? <span className="text-white/70"> · {usd(r.usd)}</span> : null}
          </li>
        ))}
      </ul>
      {expiring.map((r) => (
        <p key={r.id} className="mt-2 flex gap-2 text-[#ffd59a]">
          <AlarmClock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            {num(r.points)} {balanceName(r.id)} {(r.status.daysLeft ?? 0) < 0 ? "expired" : "expire"} {formatDate(r.status.expires!)}
            {(r.status.daysLeft ?? 0) < 0 ? "" : " unless the account has activity first"}.
          </span>
        </p>
      ))}
      <Link href="/tracker?tab=points" className="group mt-2 inline-flex items-center gap-1 font-semibold text-white hover:underline">
        Update balances <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
      </Link>
    </div>
  );
}
