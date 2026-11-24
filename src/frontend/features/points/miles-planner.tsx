"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, BedDouble, CheckCircle2, CreditCard, Gift, Info, Plane } from "lucide-react";
import { getCard } from "@/shared/data/cards";
import { getCurrency, programName, programNames, programRef, type ProgramId } from "@/shared/data/points";
import {
  bridgeFrom,
  hotelLimits,
  hotelMilesFor,
  liveBonuses,
  localIsoDate,
  milesPlan,
  partnerPointsFor,
  plannableTargets,
  ratioLabel,
  type MilesRoute,
} from "@/shared/lib/points";
import { shortCardName } from "@/shared/lib/card-name";
import { cn, num } from "@/shared/lib/format";
import { CURRENCY_COLOR, Dot, RatioPill, SourceList, currencyProse, formatDate, hotelRatio, listJoin, rulesLine, timeLabel } from "./ui";
import type { WalletReach } from "./use-wallet-reach";

export const DEFAULT_TARGET: ProgramId = "united-mileageplus";
export const DEFAULT_MILES = 60_000;
const PRESETS = [25_000, 60_000, 100_000];
const VIA_SHOWN = 6;
const MAX_MILES = 5_000_000;

/** The typed amount as a whole number of miles, or null when it isn't one the planner can use. */
function parseMiles(text: string): number | null {
  if (text.trim() === "") return null;
  const n = Math.round(Number(text));
  return Number.isFinite(n) && n > 0 && n <= MAX_MILES ? n : null;
}

const TARGETS = plannableTargets()
  .map(programRef)
  .sort((a, b) => a.name.localeCompare(b.name));

/**
 * "I need miles": pick a program and an amount, get every way to put that many points there: bank transfers straight
 * in first, then two steps through hotel points. Bonuses running today count once the page has hydrated.
 */
export function MilesPlanner({
  need,
  miles,
  onChange,
  wallet,
}: {
  need?: ProgramId | null;
  miles?: number | null;
  onChange?: (patch: { need?: ProgramId; miles?: number }) => void;
  wallet?: WalletReach;
}) {
  const target = need ?? DEFAULT_TARGET;
  const amount = miles && miles > 0 ? miles : DEFAULT_MILES;
  const [text, setText] = useState(String(amount));
  const [allVia, setAllVia] = useState(false);
  const today = wallet?.hydrated ? localIsoDate() : undefined;
  const personal = Boolean(wallet?.hydrated && wallet.points.cards.length > 0);
  const plan = milesPlan(target, amount, { cardIds: personal ? wallet!.cardIds : [], today });
  const unit = programNames[target].kind === "hotel" ? "points" : "miles";
  const ref = programRef(target);
  const bonusesHere = today ? liveBonuses(today).filter((b) => b.started && b.bonus.program === target) : [];

  const setMiles = (v: string) => {
    setText(v);
    const n = parseMiles(v);
    if (n !== null) onChange?.({ miles: n });
  };
  // What's typed decides whether there's a plan: an empty or invalid amount shows a prompt, not the last plan.
  const typed = onChange ? parseMiles(text) : amount;

  return (
    <div className="space-y-6">
      <form className="panel grid gap-4 p-4 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] md:p-5" onSubmit={(e) => e.preventDefault()} aria-label="What you need">
        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-xs font-semibold tracking-wide text-ink-3 uppercase">Program you need points in</span>
          <select className="input h-11 text-base" value={target} onChange={(e) => onChange?.({ need: e.target.value as ProgramId })} disabled={!onChange}>
            {(["airline", "hotel"] as const).map((kind) => (
              <optgroup key={kind} label={kind === "airline" ? "Airlines" : "Hotels"}>
                {TARGETS.filter((t) => t.kind === kind).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor="miles-needed" className="text-xs font-semibold tracking-wide text-ink-3 uppercase">
            {unit === "miles" ? "Miles" : "Points"} needed
          </label>
          <input
            id="miles-needed"
            type="number"
            inputMode="numeric"
            min={1000}
            step={1000}
            className="input h-11 text-base tabular-nums"
            value={text}
            onChange={(e) => setMiles(e.target.value)}
            disabled={!onChange}
            aria-invalid={typed === null}
            aria-describedby={typed === null ? "miles-needed-hint" : undefined}
          />
          {typed === null && (
            <p id="miles-needed-hint" className="text-xs font-medium text-danger">
              Enter a number of {unit} from 1 to {num(MAX_MILES)}.
            </p>
          )}
          <div className="flex flex-wrap gap-1.5 pt-1">
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                disabled={!onChange}
                onClick={() => setMiles(String(p))}
                className={cn("chip cursor-pointer px-2.5 py-1 text-xs", amount === p ? "border-brand bg-sky text-brand" : "hover:border-brand/50")}
              >
                {num(p)}
              </button>
            ))}
          </div>
        </div>
      </form>

      {typed === null ? (
        <p className="panel flex items-center gap-3 p-5 text-sm text-ink-2" aria-live="polite">
          <Info className="h-4 w-4 shrink-0 text-ink-3" aria-hidden />
          Enter how many {ref.name} {unit} you need to see every way to get them.
        </p>
      ) : (
      <section aria-live="polite" aria-labelledby="plan-title" className="space-y-6">
        <div>
          <h3 id="plan-title" className="text-xl font-semibold text-navy">
            To get {num(plan.miles)} {ref.name} {unit}
          </h3>
          <p className="mt-1 text-sm text-ink-2">
            {personal ? "Routes your cards can take come first in each list." : "Add your cards to see which routes your points can take."}{" "}
            <Link href={`/points/programs/${target}`} className="link">
              About {ref.name}
            </Link>
          </p>
        </div>

        {plan.coBrand.length > 0 && (
          <p className="flex gap-2 rounded-md bg-success/8 px-3 py-2.5 text-sm text-ink">
            <CreditCard className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
            You already earn these {unit} directly with {listJoin(plan.coBrand.map((c) => shortCardName(c.name)))}.
          </p>
        )}
        {bonusesHere.length > 0 && (
          <p className="flex gap-2 rounded-md bg-gold/12 px-3 py-2.5 text-sm text-ink">
            <Gift className="mt-0.5 h-4 w-4 shrink-0 text-[#7a5a12]" aria-hidden />
            Transfer bonus running now:{" "}
            {listJoin(bonusesHere.map((b) => `${getCurrency(b.bonus.currency)?.shortName} +${b.bonus.bonusPercent}% until ${formatDate(b.bonus.ends)}`))}.
          </p>
        )}

        <div>
          <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold tracking-wide text-ink-3 uppercase">
            <Plane className="h-3.5 w-3.5" aria-hidden /> Straight from bank points · {plan.direct.length}
          </h4>
          {plan.direct.length === 0 ? (
            <p className="rounded-md border border-dashed border-line p-4 text-sm text-ink-3">No bank currency transfers straight into {ref.name}.</p>
          ) : (
            <ul className="panel divide-y divide-line">
              {plan.direct.map((r) => (
                <RouteRow
                  key={`${r.currency}-${ratioLabel(r.partner)}-${(r.partner.cards ?? []).join()}-${r.via ?? ""}`}
                  route={r}
                  need={plan.miles}
                  unit={unit}
                  target={ref.name}
                />
              ))}
            </ul>
          )}
        </div>

        {ref.kind === "airline" && (
          <div>
            <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold tracking-wide text-ink-3 uppercase">
              <BedDouble className="h-3.5 w-3.5" aria-hidden /> Two steps, through hotel points · {plan.viaHotel.length}
            </h4>
            {plan.viaHotel.length === 0 ? (
              <p className="rounded-md border border-dashed border-line p-4 text-sm text-ink-3">No hotel program we track converts into {ref.name}.</p>
            ) : (
              <>
                <p className="mb-3 text-sm text-ink-2">
                  Usually far more expensive than a direct transfer and slower (hotel conversions can take days or weeks), but it can
                  reach a program none of your bank points transfer to.
                </p>
                <ul className="panel divide-y divide-line">
                  {(allVia ? plan.viaHotel : plan.viaHotel.slice(0, VIA_SHOWN)).map((r) => (
                    <RouteRow key={`${r.currency}-${r.hotel!.row.from}`} route={r} need={plan.miles} unit={unit} target={ref.name} />
                  ))}
                </ul>
                {plan.viaHotel.length > VIA_SHOWN && (
                  <button type="button" className="mt-3 text-sm font-semibold text-brand hover:underline" onClick={() => setAllVia((v) => !v)}>
                    {allVia ? "Show fewer" : `Show all ${plan.viaHotel.length} hotel routes`}
                  </button>
                )}
                <HotelRules routes={plan.viaHotel} />
              </>
            )}
          </div>
        )}
        <p className="flex gap-2 text-xs leading-relaxed text-ink-3">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          Amounts round up to the minimums and transfer steps our sources give for each bank and hotel. Transfers can&apos;t be undone, so find the
          award seat before you move points.
        </p>
      </section>
      )}
    </div>
  );
}

function RouteRow({ route: r, need, unit, target }: { route: MilesRoute; need: number; unit: string; target: string }) {
  const currency = getCurrency(r.currency);
  const only = (r.partner.cards ?? []).map((id) => getCard(id)).filter(Boolean).map((c) => shortCardName(c!.name));
  const yours = r.cards.length > 0;
  const hotel = r.hotel;
  const received = hotel ? hotelMilesFor(hotel.row, hotel.points) : partnerPointsFor(r.partner, r.bankPoints);
  const bonusCards = (r.bonus?.bonus.cards ?? []).map((id) => getCard(id)).filter(Boolean).map((c) => shortCardName(c!.name));
  const limits = hotel ? hotelLimits(hotel.row, hotel.rule) : {};
  const bridge = r.via ? bridgeFrom(r.via) : undefined;
  return (
    <li className={cn("flex flex-wrap items-start gap-x-4 gap-y-2 p-4", yours && "bg-success/[0.06]")}>
      <Dot color={CURRENCY_COLOR[r.currency]} className="mt-1.5 h-2.5 w-2.5" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-ink">
          {currency?.name ?? r.currency}
          {hotel && (
            <span className="font-normal text-ink-2">
              {" "}
              → {programName(hotel.row.from)} → {target}
            </span>
          )}
          {r.via && <span className="font-normal text-ink-2"> → {programName(r.via)} (same balance as {target})</span>}
          {only.length > 0 && <span className="font-normal text-ink-2"> · with {listJoin(only)}</span>}
        </p>
        <p className="mt-1 text-sm text-ink-2">
          Move <span className="font-semibold text-ink tabular-nums">{num(r.bankPoints)}</span> {currencyProse(r.currency)}
          {hotel ? (
            <>
              {" "}
              → <span className="tabular-nums">{num(hotel.points)}</span> {programName(hotel.row.from)} points →{" "}
              <span className="tabular-nums">{num(received)}</span> {unit}
            </>
          ) : r.via ? (
            <>
              {" "}
              to {programName(r.via)} → <span className="tabular-nums">{num(received)}</span> {unit}
            </>
          ) : (
            received > need && (
              <>
                {" "}
                → <span className="tabular-nums">{num(received)}</span> {unit}
              </>
            )
          )}
        </p>
        <p className="mt-0.5 text-xs text-ink-3">
          {hotel ? (
            <>
              {ratioLabel(r.partner)} into {programName(hotel.row.from)}, then {hotelRatio(hotel.row)}
              {hotel.row.bonusMilesPer60k ? ` plus ${num(hotel.row.bonusMilesPer60k)} bonus ${unit} per 60,000 points` : ""}
              {hotel.row.bonusMilesPer60k === 0 ? " (no 60,000-point bonus for this airline)" : ""}
              {hotel.row.bonusMilesPer60k && hotel.points >= 60_000 ? ` · convert all ${num(hotel.points)} points in one transfer: the bonus counts only within one` : ""}
              {limits.minimum && hotel.points <= limits.minimum ? ` · ${programName(hotel.row.from)} converts at least ${num(limits.minimum)} points` : ""}
              {limits.increment ? ` · in steps of ${num(limits.increment)}` : ""}
              {limits.maxPerTransfer && hotel.points > limits.maxPerTransfer ? ` · more than the ${num(limits.maxPerTransfer)}-point limit per conversion` : ""}
              {limits.dailyMax && hotel.points > limits.dailyMax ? ` · more than ${programName(hotel.row.from)}'s ${num(limits.dailyMax)}-a-day limit` : ""}
            </>
          ) : (
            <>
              <span className={r.partner.time ? undefined : "italic"}>{timeLabel(r.partner)}</span>
              {rulesLine(r.partner) ? ` · ${rulesLine(r.partner)}` : ""}
              {bridge ? ` · ${bridge.note}` : ""}
            </>
          )}
        </p>
        {r.bonus && (
          <p className="mt-1.5 flex w-fit max-w-full items-start gap-1.5 rounded-md bg-gold/12 px-2 py-1 text-xs text-ink">
            <Gift className="mt-px h-3.5 w-3.5 shrink-0 text-[#7a5a12]" aria-hidden />
            <span>
              With the +{r.bonus.bonus.bonusPercent}% bonus (until {formatDate(r.bonus.bonus.ends)}):{" "}
              <span className="font-semibold tabular-nums">{num(r.bonus.bankPoints)}</span>
              {r.bonus.bonus.maxBonusMiles !== undefined && <span className="text-ink-3"> · bonus capped at {num(r.bonus.bonus.maxBonusMiles)} {unit}</span>}
              {r.bonus.bonus.targeted && <span className="text-warn"> · targeted</span>}
              {bonusCards.length > 0 && <span className="text-ink-3"> · {listJoin(bonusCards)} only</span>}
            </span>
          </p>
        )}
        {yours && (
          <p className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-success">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Your {listJoin(r.cards.slice(0, 2).map((c) => shortCardName(c.name)))} can do this
          </p>
        )}
      </div>
      {hotel ? (
        <span className="mt-0.5 flex flex-col items-end gap-0.5" title={`${num(received)} ${unit} for ${num(r.bankPoints)} bank points`}>
          <RatioPill partner={{ from: r.bankPoints, to: received }} mine={yours} />
          <span className="text-[10px] text-ink-3">overall</span>
        </span>
      ) : (
        <RatioPill partner={r.partner} mine={yours} className="mt-0.5" />
      )}
    </li>
  );
}

/** Each hotel's conversion rule, once, under the two-step routes. */
function HotelRules({ routes }: { routes: MilesRoute[] }) {
  const rules = Array.from(new Map(routes.flatMap((r) => (r.hotel?.rule ? [[r.hotel.rule.from, r.hotel.rule] as const] : []))).values());
  if (rules.length === 0) return null;
  return (
    <details className="group mt-3 rounded-md border border-line bg-white">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 text-sm font-semibold text-navy hover:bg-canvas [&::-webkit-details-marker]:hidden">
        How these hotel conversions work
        <ArrowRight className="h-4 w-4 text-ink-3 transition-transform group-open:rotate-90" aria-hidden />
      </summary>
      <ul className="space-y-3 border-t border-line px-3 py-3 text-sm leading-relaxed text-ink-2">
        {rules.map((rule) => (
          <li key={rule.from}>
            <p className="font-semibold text-ink">{programName(rule.from)}</p>
            <p>{rule.rule}</p>
            <SourceList urls={rule.sources} className="mt-1" />
          </li>
        ))}
      </ul>
    </details>
  );
}
