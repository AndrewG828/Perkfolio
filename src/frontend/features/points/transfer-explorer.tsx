"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, Info } from "lucide-react";
import { awardPrograms, currencies, getCurrency, isCurrencyId, type BankCurrencyId } from "@/shared/data/points";
import { bestPartnerFor, ratioVaries } from "@/shared/lib/points";
import { cn } from "@/shared/lib/format";
import { CURRENCY_ABBR, CURRENCY_COLOR, Dot, RatioPill, programColor } from "./ui";
import { useWalletReach, type WalletReach } from "./use-wallet-reach";

/** Hub explorer with the currency in the URL (?currency=chase-ur), defaulting to one the wallet earns. */
export function TransferExplorerLive() {
  const params = useSearchParams();
  const wallet = useWalletReach();
  const fromUrl = params.get("currency");
  const currency = isCurrencyId(fromUrl) ? fromUrl : (currencies.find((c) => wallet.mine.has(c.id))?.id ?? currencies[0]?.id);
  const pick = (id: BankCurrencyId) => {
    const sp = new URLSearchParams(window.location.search);
    sp.set("currency", id);
    window.history.replaceState(null, "", `${window.location.pathname}?${sp.toString()}${window.location.hash}`);
  };
  return currency ? <TransferExplorer currency={currency} onPick={pick} wallet={wallet} /> : null;
}

/** Pick a currency, see where it transfers. Without `onPick` it renders the first currency, inert (prerender). */
export function TransferExplorer({
  currency = currencies[0]?.id,
  onPick,
  wallet,
}: {
  currency?: BankCurrencyId;
  onPick?: (id: BankCurrencyId) => void;
  wallet?: WalletReach;
}) {
  const info = currency ? getCurrency(currency) : undefined;
  if (!currency || !info) return null;
  const mine = wallet?.mine ?? new Set<BankCurrencyId>();
  const rows = awardPrograms
    .map((program) => {
      const general = bestPartnerFor(currency, program.id);
      if (!general) return null;
      const yours = wallet?.reach.get(program.id)?.routes.find((r) => r.currency === currency)?.partner;
      return { program, partner: yours ?? general, varies: !yours && ratioVaries(currency, program.id) };
    })
    .filter((r): r is NonNullable<typeof r> => Boolean(r))
    .sort((a, b) => a.program.name.localeCompare(b.program.name));
  const airlines = rows.filter((r) => r.program.kind === "airline");
  const hotels = rows.filter((r) => r.program.kind === "hotel");
  const isMine = mine.has(currency);

  return (
    <div className="panel overflow-hidden">
      <div className="border-b border-line bg-sky/50 p-4 md:p-5">
        <p id="transfer-explorer-label" className="text-sm font-semibold text-ink">
          Whose points?
        </p>
        <div role="group" aria-labelledby="transfer-explorer-label" className="mt-3 flex flex-wrap gap-2">
          {currencies.map((c) => {
            const on = c.id === currency;
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={on}
                onClick={() => onPick?.(c.id)}
                title={c.name}
                className={cn(
                  "relative inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
                  on ? "border-brand bg-brand text-white" : "border-line bg-white text-ink-2 hover:border-brand hover:text-brand",
                )}
              >
                <Dot color={CURRENCY_COLOR[c.id]} className={on ? "ring-1 ring-white" : undefined} />
                {CURRENCY_ABBR[c.id]}
                <span className="sr-only">{c.shortName}</span>
                {mine.has(c.id) && <span className={cn("text-[10px] font-semibold uppercase", on ? "text-white/85" : "text-brand")}>Yours</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div className="p-4 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-2xl">
            <h3 className="flex items-center gap-2 text-lg font-semibold text-navy">
              <Dot color={CURRENCY_COLOR[currency]} className="h-2.5 w-2.5" />
              {info.name}
            </h3>
            <p className="mt-1 text-sm text-ink-2">
              Earned with {info.earnedWith}. Transfers to{" "}
              <strong className="text-ink">
                {airlines.length} airline{airlines.length === 1 ? "" : "s"}
              </strong>{" "}
              and{" "}
              <strong className="text-ink">
                {hotels.length} hotel program{hotels.length === 1 ? "" : "s"}
              </strong>
              .
            </p>
          </div>
          {isMine && (
            <span className="rounded-full bg-success/10 px-3 py-1 text-xs font-semibold text-success">Your cards earn this</span>
          )}
        </div>
        {info.restrictions && (
          <p className="mt-3 flex gap-2 rounded-md bg-canvas p-3 text-sm text-ink-2">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-ink-3" aria-hidden />
            {info.restrictions}
          </p>
        )}

        <div className="mt-5 grid gap-6 md:grid-cols-[3fr_2fr]">
          {(
            [
              ["Airlines", airlines],
              ["Hotels", hotels],
            ] as const
          ).map(([title, list]) => (
            <div key={title}>
              <h4 className="mb-2 text-xs font-semibold tracking-wide text-ink-3 uppercase">
                {title} · {list.length}
              </h4>
              {list.length === 0 ? (
                <p className="rounded-md border border-dashed border-line p-4 text-sm text-ink-3">No {title.toLowerCase()} partners.</p>
              ) : (
                <ul className="divide-y divide-line rounded-md border border-line">
                  {list.map(({ program, partner, varies }) => (
                    <li key={program.id}>
                      <Link
                        href={`/points/programs/${program.id}`}
                        className="flex items-center gap-3 px-3 py-2.5 hover:bg-canvas focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
                      >
                        <Dot color={programColor(program)} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-ink">{program.name}</span>
                          <span className="block text-xs text-ink-3 sm:hidden">{partner.time}</span>
                        </span>
                        <span className="hidden text-xs text-ink-3 sm:inline">{partner.time}</span>
                        <RatioPill partner={partner} mine={isMine} varies={varies} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>

        {rows.some((r) => r.varies) && <p className="mt-3 text-xs text-ink-3">* The ratio depends on which card you transfer from.</p>}
        <Link href={`/points/transfers?currency=${currency}`} className="group mt-5 inline-flex items-center gap-1 text-sm font-semibold text-brand hover:underline">
          Compare all six currencies <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </Link>
      </div>
    </div>
  );
}
