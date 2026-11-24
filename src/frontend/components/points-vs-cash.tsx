"use client";

import { useId, useState } from "react";
import { Calculator, Plus } from "lucide-react";
import { programName } from "@/shared/data/strategy/programs";
import { Meter } from "@/frontend/components/meter";
import { ProgramSelect } from "@/frontend/components/program-select";
import { strategyPrefs, useStrategyPrefs } from "@/frontend/state/strategy-prefs";
import { centsFor, missingValuation, pointsVsCash } from "@/shared/lib/trackers";
import { cn, num, usd } from "@/shared/lib/format";

export interface PointsVsCashValues {
  program?: string;
  points: number;
  taxesUsd: number;
  cashPriceUsd: number;
}

const money = (n: number) => usd(n, { cents: Math.abs(n) < 100 && n % 1 !== 0 });
const cents = (c: number) => `${c.toFixed(2).replace(/\.?0+$/, "")}¢`;

/** "an" before a vowel sound ("an EVA Air", "an IHG"), "a" otherwise ("a United", "a Hilton"). */
const aOrAn = (word: string) => (/^(?:[aeio]|u(?!ni|s[aei]))/i.test(word) ? "an" : "a");

/**
 * "Should I use points?": the redemption's actual cents per point against the program's valuation (the user's own
 * figure if they set one), with a verdict and the dollars at stake. Pass `onLog` to offer saving it as a redemption.
 */
export function PointsVsCash({
  defaultProgram = "",
  onLog,
  className,
}: {
  defaultProgram?: string;
  onLog?: (values: PointsVsCashValues) => void;
  className?: string;
}) {
  const prefs = useStrategyPrefs();
  const uid = useId();
  const [program, setProgram] = useState(defaultProgram);
  const [cash, setCash] = useState("");
  const [points, setPoints] = useState("");
  const [taxes, setTaxes] = useState("");
  const p = Number(points);
  const c = Number(cash);
  const t = taxes.trim() === "" ? 0 : Number(taxes);
  const ready = points.trim() !== "" && cash.trim() !== "" && p > 0 && c >= 0 && t >= 0 && Number.isFinite(p + c + t);
  const valuation = centsFor(program || undefined, prefs.cpp);
  const own = Boolean(program && prefs.cpp[program] !== undefined);
  const r = ready ? pointsVsCash({ points: p, taxesUsd: t, cashPriceUsd: c, valuationCents: valuation }) : null;

  return (
    <section className={cn("panel p-6", className)} aria-labelledby={`${uid}-title`}>
      <h2 id={`${uid}-title`} className="flex items-center gap-2 text-lg font-semibold text-navy">
        <Calculator className="h-5 w-5 text-brand" /> Points or cash?
      </h2>
      <p className="mt-1 text-sm text-ink-2">Compare what a redemption gets you per point with what those points are usually worth.</p>
      <div className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
        <label className="space-y-1 sm:col-span-2">
          <span className="font-medium text-ink">Program</span>
          <ProgramSelect label="Program" placeholder="Choose the program" value={program} onChange={setProgram} />
        </label>
        <Field id={`${uid}-cash`} label="Cash price" prefix="$" value={cash} onChange={setCash} placeholder="1,200" />
        <Field id={`${uid}-points`} label="Points needed" value={points} onChange={setPoints} placeholder="60,000" step={1} />
        <Field id={`${uid}-taxes`} label="Taxes & fees on the award" prefix="$" value={taxes} onChange={setTaxes} placeholder="0" className="sm:col-span-2" />
      </div>

      {program && valuation === undefined && <OwnValue key={program} program={program} />}

      <div className="mt-5 rounded-lg bg-canvas p-4" aria-live="polite">
        {!r || r.cpp === null ? (
          <p className="text-sm text-ink-2">Enter the cash price and the points needed to see the value per point.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-ink-3">You&apos;d get</p>
                <p className={cn("text-3xl font-semibold tracking-tight", r.verdict === "cash" ? "text-warn" : r.verdict === "points" ? "text-success" : "text-navy")}>
                  {cents(r.cpp)} <span className="text-base font-medium text-ink-3">per point</span>
                </p>
              </div>
              {r.verdict && (
                <span
                  className={cn(
                    "rounded-full px-3 py-1 text-sm font-semibold",
                    r.verdict === "points" ? "bg-success/10 text-success" : r.verdict === "cash" ? "bg-warn/10 text-warn" : "bg-white text-ink-2",
                  )}
                >
                  {r.verdict === "points" ? "Use points" : r.verdict === "cash" ? "Pay cash" : "About even"}
                </span>
              )}
            </div>
            {r.valuationCents !== undefined && (
              <Meter
                className="mt-4"
                value={Math.max(0, r.cpp)}
                max={Math.max(r.cpp, r.valuationCents) * 1.25}
                tone={r.verdict === "cash" ? "warn" : r.verdict === "points" ? "success" : "brand"}
                marker={{ value: r.valuationCents, label: `${programName(program)} valued at ${cents(r.valuationCents)}` }}
                label="Cents per point compared with the valuation"
              />
            )}
            <p className="mt-3 text-sm text-ink-2">
              {r.verdict === undefined ? (
                program ? (
                  `Add what ${aOrAn(programName(program))} ${programName(program)} point is worth to you (above) to compare.`
                ) : (
                  "Choose a program to compare with what its points are usually worth."
                )
              ) : r.verdict === "points" ? (
                <>
                  Using points saves <strong className="text-ink">{money(r.cashSavedUsd)}</strong> in cash, and {num(p)} points are worth about{" "}
                  {money(r.pointsWorthUsd!)} at {cents(r.valuationCents!)}{own ? " (your value)" : ""}. Points come out{" "}
                  <strong className="text-success">{money(r.advantageUsd!)}</strong> ahead.
                </>
              ) : r.verdict === "cash" ? (
                <>
                  Using points saves {money(r.cashSavedUsd)}, but {num(p)} points are worth about <strong className="text-ink">{money(r.pointsWorthUsd!)}</strong> at{" "}
                  {cents(r.valuationCents!)}{own ? " (your value)" : ""}. Paying cash keeps <strong className="text-warn">{money(-r.advantageUsd!)}</strong> more value.
                </>
              ) : (
                <>
                  Using points saves {money(r.cashSavedUsd)}, about what {num(p)} points are worth at {cents(r.valuationCents!)}. Either way works.
                </>
              )}
            </p>
            {onLog && (
              <button className="btn-secondary mt-4 px-3 py-1.5 text-xs" onClick={() => onLog({ ...(program ? { program } : {}), points: Math.round(p), taxesUsd: t, cashPriceUsd: c })}>
                <Plus className="h-3.5 w-3.5" /> Log this redemption
              </button>
            )}
          </>
        )}
      </div>
    </section>
  );
}

/** For programs no outlet values (missingValuation): ask what a point is worth to the user, and remember it. */
function OwnValue({ program }: { program: string }) {
  const uid = useId();
  const [draft, setDraft] = useState("");
  const v = Number(draft);
  const ok = draft.trim() !== "" && Number.isFinite(v) && v > 0 && v <= 100;
  return (
    <form
      className="mt-4 rounded-lg border border-brand/20 bg-sky/60 p-3 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        if (ok) strategyPrefs.setCpp(program, v);
      }}
    >
      <label htmlFor={`${uid}-own`} className="block text-ink">
        <span className="font-medium">No published value for {programName(program)}.</span>{" "}
        <span className="text-ink-2">{missingValuation(program) ?? ""} What&apos;s a point worth to you?</span>
      </label>
      <span className="mt-2 flex items-center gap-2">
        <input
          id={`${uid}-own`}
          className="input h-9 w-24 py-1 text-right"
          type="number"
          min={0.01}
          max={100}
          step="any"
          inputMode="decimal"
          placeholder="1.2"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <span className="text-xs text-ink-3">¢ per point</span>
        <button className="btn-primary px-3 py-1.5 text-xs" disabled={!ok}>
          Use this value
        </button>
      </span>
    </form>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  prefix,
  placeholder,
  step = "any",
  className,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  prefix?: string;
  placeholder?: string;
  step?: number | "any";
  className?: string;
}) {
  return (
    <div className={cn("space-y-1", className)}>
      <label htmlFor={id} className="font-medium text-ink">
        {label}
      </label>
      <span className="relative block">
        {prefix && <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3">{prefix}</span>}
        <input
          id={id}
          className={cn("input", prefix && "pl-6")}
          type="number"
          min={0}
          step={step}
          inputMode="decimal"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </span>
    </div>
  );
}
