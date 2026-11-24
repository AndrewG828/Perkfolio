"use client";

import { useId, useState } from "react";
import { Calculator, Info } from "lucide-react";
import type { BankCurrencyId } from "@/shared/data/points";
import { judgeRedemption, valueSources, type DealVerdict } from "@/shared/lib/points";
import { Meter, type MeterTone } from "@/frontend/components/meter";
import { cn, usd } from "@/shared/lib/format";
import { useWalletReach } from "./use-wallet-reach";

const SOURCES = valueSources();

const VERDICT: Record<DealVerdict, { label: string; tone: MeterTone; badge: string }> = {
  great: { label: "Great deal", tone: "success", badge: "bg-success text-white" },
  good: { label: "Good deal", tone: "success", badge: "bg-success/12 text-success" },
  fair: { label: "About break-even", tone: "warn", badge: "bg-warn/12 text-warn" },
  poor: { label: "Poor value", tone: "warn", badge: "bg-danger/10 text-danger" },
};

const toNumber = (v: string) => (v.trim() === "" ? Number.NaN : Number(v));

/** "Is this a good redemption?": cents per point against Perkfolio's conservative value for the points. */
export function DealCalculator() {
  const id = useId();
  const wallet = useWalletReach();
  const [cash, setCash] = useState("1200");
  const [taxes, setTaxes] = useState("85");
  const [points, setPoints] = useState("60000");
  const [picked, setPicked] = useState<string | null>(null);

  const walletDefault = SOURCES.find((s) => s.kind === "currency" && wallet.mine.has(s.id as BankCurrencyId))?.id;
  const sourceId = picked ?? walletDefault ?? SOURCES[0]?.id;
  const source = SOURCES.find((s) => s.id === sourceId);
  const result = source
    ? judgeRedemption({ cashPrice: toNumber(cash), taxes: toNumber(taxes), points: toNumber(points), baselineCents: source.cents })
    : null;
  const v = result ? VERDICT[result.verdict] : null;

  const field = (key: string, label: string, value: string, set: (v: string) => void, opts: { prefix?: string; hint?: string; step?: number }) => (
    <div className="space-y-1.5">
      <label htmlFor={`${id}-${key}`} className="block text-sm font-medium text-ink">
        {label}
      </label>
      <div className="relative">
        {opts.prefix && <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3">{opts.prefix}</span>}
        <input
          id={`${id}-${key}`}
          type="number"
          min={0}
          step={opts.step ?? 1}
          inputMode="decimal"
          className={cn("input h-11 text-base tabular-nums", opts.prefix && "pl-7")}
          value={value}
          onChange={(e) => set(e.target.value)}
          aria-describedby={opts.hint ? `${id}-${key}-hint` : undefined}
        />
      </div>
      {opts.hint && (
        <p id={`${id}-${key}-hint`} className="text-xs text-ink-3">
          {opts.hint}
        </p>
      )}
    </div>
  );

  return (
    <div className="panel grid overflow-hidden md:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <form className="space-y-4 p-5 md:p-6" onSubmit={(e) => e.preventDefault()} aria-label="Redemption details">
        {field("cash", "Cash price of the same ticket or room", cash, setCash, { prefix: "$", step: 10 })}
        {field("taxes", "Taxes and fees you'd still pay on the award", taxes, setTaxes, { prefix: "$", step: 5 })}
        {field("points", "Points needed", points, setPoints, {
          step: 500,
          hint: "Transferring at a ratio other than 1:1? Enter the bank points you'd move.",
        })}
        <div className="space-y-1.5">
          <label htmlFor={`${id}-source`} className="block text-sm font-medium text-ink">
            Points you&apos;d use
          </label>
          <select id={`${id}-source`} className="input h-11 text-base" value={sourceId ?? ""} onChange={(e) => setPicked(e.target.value)}>
            <optgroup label="Bank points">
              {SOURCES.filter((s) => s.kind === "currency").map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label} ({s.cents}¢)
                </option>
              ))}
            </optgroup>
            <optgroup label="Airline and hotel points">
              {SOURCES.filter((s) => s.kind === "program").map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label} ({s.cents}¢)
                </option>
              ))}
            </optgroup>
          </select>
        </div>
      </form>

      <div className="flex flex-col justify-center gap-4 border-t border-line bg-canvas p-5 md:border-t-0 md:border-l md:p-6" aria-live="polite">
        {result && v && source ? (
          <>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <p>
                <span className="block text-sm font-medium text-ink-2">You&apos;d get</span>
                <span className="text-5xl font-semibold tracking-tight text-navy tabular-nums">{result.cents.toFixed(2)}¢</span>
                <span className="ml-1.5 text-sm text-ink-2">per point</span>
              </p>
              <span className={cn("rounded-full px-3 py-1 text-sm font-semibold", v.badge)}>{v.label}</span>
            </div>
            <Meter
              size="lg"
              value={result.cents}
              max={Math.max(result.cents, result.baselineCents * 2)}
              tone={v.tone}
              marker={{ value: result.baselineCents, label: `Our value ${result.baselineCents}¢` }}
              label="Cents per point for this redemption"
            />
            <div className="flex justify-between text-xs text-ink-3">
              <span>0¢</span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-3 w-[2px] rounded-full bg-navy" /> Our value for {source.label}: {result.baselineCents}¢
              </span>
            </div>
            <p className="text-sm leading-relaxed text-ink-2">
              {result.vsBaseline >= 0 ? (
                <>
                  That&apos;s {(result.cents / result.baselineCents).toFixed(1)}× the {result.baselineCents}¢ we value {source.label} at, about{" "}
                  <strong className="text-ink">{usd(result.vsBaseline)} more</strong> than these points are worth to us.
                </>
              ) : result.verdict === "fair" ? (
                <>
                  Close to the {result.baselineCents}¢ we value {source.label} at. Fine if you&apos;d rather keep the cash, but not a standout.
                </>
              ) : (
                <>
                  Below the {result.baselineCents}¢ we value {source.label} at: you&apos;d give up about{" "}
                  <strong className="text-ink">{usd(-result.vsBaseline)}</strong> of value. Paying cash and saving the points is likely better.
                </>
              )}
            </p>
          </>
        ) : (
          <p className="flex items-center gap-3 text-sm text-ink-2">
            <Calculator className="h-5 w-5 text-ink-3" aria-hidden />
            Enter a cash price and the points needed to see what each point is worth.
          </p>
        )}
        <p className="flex gap-2 border-t border-line pt-3 text-xs leading-relaxed text-ink-3">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          Value per point = (cash price − taxes and fees) ÷ points × 100. Our values are the conservative ones we use for
          each card.
        </p>
      </div>
    </div>
  );
}
