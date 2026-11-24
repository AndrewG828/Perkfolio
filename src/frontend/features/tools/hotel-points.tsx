"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { BedDouble, CreditCard, Info, Minus, Plus } from "lucide-react";
import type { Card } from "@/shared/data/types";
import type { BrandException, HotelChain } from "@/shared/data/travel/types";
import { hotelEarning } from "@/shared/data/travel/hotel-earning";
import { getCard } from "@/shared/data/cards";
import { rateFor } from "@/shared/data/calculator-rates";
import { chainCards, programId, programName, stayCardValue, stayPoints, taxesEarnPoints, walletCard, type StayCard } from "@/shared/lib/hotel-points";
import { MEDIAN_SOURCE, formatCents, resolvePointValue, type ValueContext } from "@/shared/lib/point-value";
import { formatIsoDate, noteList, whole } from "@/shared/lib/travel-format";
import { cn, usd } from "@/shared/lib/format";
import { CardArt } from "@/frontend/components/card-art";
import { useHydrated, useWallet } from "@/frontend/state/wallet-store";
import { useValueContext } from "@/frontend/state/point-values";
import { DataNotice, SourceLinks } from "./ui";

const chains = hotelEarning.chains;
const chainById = (id: string | null) => chains.find((c) => programId(c.program) === id) ?? chains[0];

const num = (v: string | null, fallback: number, min: number, max: number) => {
  const n = Number(v);
  return v !== null && v !== "" && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

const pts = (n: number) => whole(n);
const cents = formatCents;
/** The card's rewards count as cash back (a percent per dollar) rather than points. */
const earnsCash = (card: StayCard, values: ValueContext) => stayCardValue(card, values)?.basis === "cash";

/** Lower-earning brands grouped by what they earn, for the brand picker. */
function brandGroups(chain: HotelChain): { label: string; brands: string[] }[] {
  const groups = new Map<string, string[]>();
  for (const e of chain.brandExceptions) {
    const label = `Earn ${e.perDollar} pts per $${e.eliteBonus === false ? ", no elite bonus" : ""}`;
    groups.set(label, [...(groups.get(label) ?? []), ...e.brands]);
  }
  return [...groups].map(([label, brands]) => ({ label, brands }));
}

/** A brand without its qualifier: "StudioRes (no elite bonus points)" → "StudioRes". */
const brandName = (brand: string) => brand.replace(/\s*\(.*\)\s*$/, "");

const tierLabel = (percent: number | null) => (percent === null ? "bonus not confirmed" : `+${percent}%`);
/** "a Hilton Honors", "an IHG One Rewards". */
const withArticle = (name: string) => `${/^[aeiou]/i.test(name) ? "an" : "a"} ${name}`;
const MAX_RATE = 100_000;
const exceptionText = (e: BrandException) =>
  `${e.brands.join(", ")}: ${e.perDollar} points per dollar${e.eliteBonus === false ? ", with no elite bonus" : ""}.`;

/** Hotel points calculator: a paid stay's hotel points, card points and their value, with the inputs in the URL. */
export function HotelPointsCalculator() {
  const params = useSearchParams();
  const wallet = useWallet();
  const hydrated = useHydrated();
  const values = useValueContext();
  const [chainId, setChainId] = useState(() => programId(chainById(params.get("program")).program));
  const chain = chainById(chainId);
  const [brand, setBrand] = useState(() => params.get("brand") ?? "");
  const [rate, setRate] = useState(() => num(params.get("rate"), 250, 0, MAX_RATE));
  const [nights, setNights] = useState(() => num(params.get("nights"), 3, 1, 60));
  const [tax, setTax] = useState(() => num(params.get("tax"), 15, 0, 60));
  const [tier, setTier] = useState(() => params.get("tier") ?? "");
  const [cardKey, setCardKey] = useState(() => params.get("card") ?? "");

  const options = useMemo(() => {
    const listed = chainCards(chain, getCard);
    const keys = new Set(listed.map((c) => c.key));
    const owned = (hydrated ? wallet.cards : [])
      .map(getCard)
      .filter((c): c is Card => Boolean(c) && !keys.has(c!.id))
      .map((c) => walletCard(c, rateFor(c, "hotels", false), chain));
    // A card from a shared link that isn't in this visitor's wallet still shows, so the link reproduces the result.
    const linked = getCard(cardKey);
    const other =
      linked && !keys.has(linked.id) && !owned.some((c) => c.key === linked.id) ? [walletCard(linked, rateFor(linked, "hotels", false), chain)] : [];
    return { listed, owned, other, all: [...listed, ...owned, ...other] };
  }, [chain, wallet.cards, hydrated, cardKey]);
  const card: StayCard | null = options.all.find((c) => c.key === cardKey) ?? null;

  const brandOk = !brand || chain.brandExceptions.some((e) => e.brands.includes(brand));
  const tierOk = !tier || chain.eliteBonuses.some((e) => e.tier === tier);
  // A tier from a shared link that this program doesn't have: say so rather than quietly dropping the bonus.
  const unknownTier = tier && !tierOk ? tier : null;
  const result = stayPoints({
    chain,
    brand: brandOk ? brand : null,
    nightlyRate: rate,
    nights,
    taxPercent: tax,
    tier: tierOk ? tier : null,
    card,
    values,
  });

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const set = (k: string, v: string | number | null) => (v === null || v === "" ? sp.delete(k) : sp.set(k, String(v)));
    set("program", chainId);
    set("brand", brandOk ? brand : null);
    set("rate", rate);
    set("nights", nights);
    set("tax", tax);
    set("tier", tierOk ? tier : null);
    set("card", card ? card.key : null);
    window.history.replaceState(null, "", `${window.location.pathname}?${sp.toString()}`);
  }, [chainId, brand, brandOk, rate, nights, tax, tier, tierOk, card]);

  const pickChain = (c: HotelChain) => {
    setChainId(programId(c.program));
    setBrand("");
    setTier("");
  };

  const program = programName(chain.program);
  const exception = brandOk && brand ? chain.brandExceptions.find((e) => e.brands.includes(brand)) : null;
  const notes = noteList(chain.notes);
  // What the program's points are worth: the one value every page uses (your own, else the published median).
  const val = resolvePointValue(programId(chain.program), values);
  const taxes = taxesEarnPoints(chain);

  return (
    <div className="bg-canvas">
      <div className="container-page grid grid-cols-1 gap-6 py-8 md:py-10 lg:grid-cols-[380px_minmax(0,1fr)] lg:gap-8">
        <form className="panel h-fit space-y-5 p-5 lg:sticky lg:top-28" onSubmit={(e) => e.preventDefault()} aria-labelledby="stay-title">
          <h2 id="stay-title" className="font-semibold text-navy">
            Your stay
          </h2>

          <fieldset>
            <legend className="mb-2 text-xs font-semibold tracking-wide text-ink-2 uppercase">Hotel program</legend>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Hotel program">
              {chains.map((c) => {
                const on = c === chain;
                return (
                  <button
                    key={c.program}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => pickChain(c)}
                    className={cn(
                      "rounded-md border px-3 py-2.5 text-left text-sm font-semibold transition-colors",
                      on ? "border-brand bg-sky text-brand" : "border-line bg-white text-ink hover:border-brand",
                    )}
                  >
                    {programName(c.program)}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <Field label="Brand" htmlFor="hotel-brand">
            <select id="hotel-brand" className="input" value={brandOk ? brand : ""} onChange={(e) => setBrand(e.target.value)}>
              <option value="">Most brands{chain.basePerDollar === null ? "" : ` · ${chain.basePerDollar} pts per $`}</option>
              {brandGroups(chain).map((g) => (
                <optgroup key={g.label} label={g.label}>
                  {g.brands.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Nightly rate" htmlFor="hotel-rate">
              <span className="relative block">
                <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" aria-hidden>
                  $
                </span>
                <input
                  id="hotel-rate"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step={10}
                  className="input pl-6 tabular-nums"
                  value={rate || ""}
                  placeholder="0"
                  max={MAX_RATE}
                  onChange={(e) => setRate(Math.min(MAX_RATE, Math.max(0, Number(e.target.value) || 0)))}
                />
              </span>
            </Field>
            <Field label="Taxes & fees" htmlFor="hotel-tax">
              <span className="relative block">
                <input
                  id="hotel-tax"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={60}
                  step={1}
                  className="input pr-8 tabular-nums"
                  value={tax}
                  onChange={(e) => setTax(Math.min(60, Math.max(0, Number(e.target.value) || 0)))}
                  aria-describedby="hotel-tax-hint"
                />
                <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-ink-3" aria-hidden>
                  %
                </span>
              </span>
              <span id="hotel-tax-hint" className="sr-only">
                Percent of the room rate
              </span>
            </Field>
          </div>

          <Field label="Nights" htmlFor="hotel-nights">
            <span className="flex items-stretch gap-2">
              <button
                type="button"
                className="grid w-11 place-items-center rounded-[4px] border border-[#97999b] text-navy hover:bg-sky disabled:opacity-40"
                onClick={() => setNights((n) => Math.max(1, n - 1))}
                disabled={nights <= 1}
                aria-label="One night fewer"
              >
                <Minus className="h-4 w-4" />
              </button>
              <input
                id="hotel-nights"
                type="number"
                inputMode="numeric"
                min={1}
                max={60}
                className="input text-center tabular-nums"
                value={nights}
                onChange={(e) => setNights(Math.min(60, Math.max(1, Math.floor(Number(e.target.value) || 1))))}
              />
              <button
                type="button"
                className="grid w-11 place-items-center rounded-[4px] border border-[#97999b] text-navy hover:bg-sky disabled:opacity-40"
                onClick={() => setNights((n) => Math.min(60, n + 1))}
                disabled={nights >= 60}
                aria-label="One more night"
              >
                <Plus className="h-4 w-4" />
              </button>
            </span>
          </Field>

          <Field label="Elite status" htmlFor="hotel-tier">
            <select id="hotel-tier" className="input" value={tierOk ? tier : ""} onChange={(e) => setTier(e.target.value)}>
              <option value="">Member (no elite bonus)</option>
              {chain.eliteBonuses.map((e) => (
                <option key={e.tier} value={e.tier}>
                  {e.tier} · {tierLabel(e.percent)}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Card you pay with" htmlFor="hotel-card">
            <select id="hotel-card" className="input" value={card ? card.key : ""} onChange={(e) => setCardKey(e.target.value)}>
              <option value="">No card, or one that earns nothing extra</option>
              {options.listed.length > 0 && (
                <optgroup label={`${program} cards`}>
                  {options.listed.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.name} · {c.perDollar}x
                    </option>
                  ))}
                </optgroup>
              )}
              {options.owned.length > 0 && (
                <optgroup label="Your wallet">
                  {options.owned.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.name} · {earnsCash(c, values) ? `${c.perDollar}%` : `${c.perDollar}x`}
                    </option>
                  ))}
                </optgroup>
              )}
              {options.other.length > 0 && (
                <optgroup label="Other cards">
                  {options.other.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.name} · {earnsCash(c, values) ? `${c.perDollar}%` : `${c.perDollar}x`}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </Field>
          {hydrated && wallet.cards.length === 0 && (
            <p className="-mt-2 text-xs text-ink-3">
              <Link href="/tracker" className="link">
                Add your cards
              </Link>{" "}
              to compare the ones you hold.
            </p>
          )}
        </form>

        <div className="min-w-0 space-y-6">
          <section className="panel overflow-hidden" aria-labelledby="stay-result-title" aria-live="polite">
            <div className="border-b border-line bg-gradient-to-b from-sky/60 to-white p-5 sm:p-6">
              <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
                <div className="min-w-0">
                  <p id="stay-result-title" className="eyebrow">
                    This stay earns
                  </p>
                  <p className="mt-1 text-4xl font-semibold tracking-tight text-navy tabular-nums">
                    {result.partial && !result.sameCurrency ? "—" : pts(result.totalPoints)}{" "}
                    <span className="text-lg font-medium text-ink-2">{program} points</span>
                  </p>
                  {card && !result.sameCurrency && result.cardPoints > 0 && (
                    <p className="mt-1 text-lg font-semibold text-navy tabular-nums">
                      + {result.cardCash ? usd(result.cardValue ?? 0, { cents: true }) : pts(result.cardPoints)}{" "}
                      <span className="text-base font-medium text-ink-2">{result.cardLabel}</span>
                    </p>
                  )}
                </div>
                <div className="w-full sm:ml-auto sm:w-auto sm:text-right">
                  <p className="text-xs font-semibold tracking-wide text-ink-3 uppercase">Estimated value</p>
                  <p className="text-3xl font-semibold text-success tabular-nums">
                    {result.totalValue === null ? "—" : usd(result.totalValue)}
                  </p>
                  <p className="text-sm text-ink-2 tabular-nums">
                    {result.total === 0
                      ? "Nothing charged, so nothing earned"
                      : result.returnPercent === null
                        ? "No valuation yet"
                        : `${result.returnPercent.toFixed(1)}% back on ${usd(result.total)}`}
                  </p>
                </div>
              </div>
              {(result.partial ||
                result.eliteUnknown ||
                unknownTier ||
                (result.noEliteAtBrand && tierOk && tier) ||
                (result.taxesEarn === null && result.taxes > 0)) && (
                <div className="mt-3 space-y-1 border-t border-line/70 pt-3 text-sm">
                  {result.partial && (
                    <p className="text-warn">{program}&apos;s base earning rate isn&apos;t confirmed yet, so this counts card points only.</p>
                  )}
                  {result.eliteUnknown && <p className="text-warn">The {tier} bonus isn&apos;t confirmed yet, so no elite bonus is counted.</p>}
                  {unknownTier && (
                    <p className="text-warn">
                      We don&apos;t have {withArticle(program)} bonus for &ldquo;{unknownTier}&rdquo;, so no elite bonus is counted.
                    </p>
                  )}
                  {result.noEliteAtBrand && tierOk && tier && <p className="text-ink-2">{brandName(brand)} pays elite members no bonus points.</p>}
                  {result.taxesEarn === null && result.taxes > 0 && (
                    <p className="text-ink-2">Whether taxes earn {program} points isn&apos;t confirmed, so only the room rate is counted.</p>
                  )}
                </div>
              )}
            </div>

            <Breakdown result={result} program={program} card={card} perDollar={result.perDollar} exception={exception && brand ? brandName(brand) : null} tier={tierOk ? tier : ""} nights={nights} />
          </section>

          {options.all.length > 1 && (
            <CardComparison
              rows={options.all.map((c) => ({
                card: c,
                value: stayPoints({ chain, brand: brandOk ? brand : null, nightlyRate: rate, nights, taxPercent: tax, tier: tierOk ? tier : null, card: c, values }),
              }))}
              selected={card?.key ?? null}
              onPick={setCardKey}
              wallet={hydrated ? wallet.cards : []}
            />
          )}

          <section className="panel space-y-3 p-5 text-sm text-ink-2">
            <h2 className="flex items-center gap-2 font-semibold text-navy">
              <BedDouble className="h-4 w-4 text-brand" aria-hidden /> How {program} earns
            </h2>
            <ul className="space-y-1.5 leading-relaxed">
              <li>
                {chain.basePerDollar === null
                  ? "The base earning rate isn't confirmed yet."
                  : `${chain.basePerDollar} base points per dollar at most brands.`}{" "}
                {taxes === true
                  ? "Taxes earn points too."
                  : taxes === false
                    ? "Taxes don't earn hotel points, but your card still earns on them."
                    : "Whether taxes earn hotel points isn't confirmed, so the calculator counts the room rate only. Your card earns on the whole bill."}
              </li>
              {chain.brandExceptions.map((e) => (
                <li key={e.brands.join()}>{exceptionText(e)}</li>
              ))}
              {chain.eliteBonuses.length > 0 && (
                <li>Elite bonuses apply to base points: {chain.eliteBonuses.map((e) => `${e.tier} ${tierLabel(e.percent)}`).join(", ")}.</li>
              )}
            </ul>
            <details>
              <summary className="cursor-pointer font-medium text-brand">What earns points, in full</summary>
              <p className="mt-2 leading-relaxed">{chain.eligibleSpend}</p>
            </details>
            {notes.length > 0 && (
              <details>
                <summary className="cursor-pointer font-medium text-brand">How sure these figures are</summary>
                {notes.map((n) => (
                  <p key={n} className="mt-2 leading-relaxed">
                    {n}
                  </p>
                ))}
              </details>
            )}
            <p className="text-xs leading-relaxed text-ink-3">
              {val?.basis === "own"
                ? `${program} points are valued at ${cents(val.cents)}, your own value from the tracker's Points tab`
                : val?.published
                  ? `${program} points are valued at ${cents(val.cents)}, ${MEDIAN_SOURCE} (${val.published.values.map((v) => `${v.outlet} ${cents(v.cents)}`).join(", ")})`
                  : `Points are valued at ${MEDIAN_SOURCE}`}
              , and card points the same way; cash back counts at face value. Earning rules checked {formatIsoDate(chain.asOf)}.{" "}
              <SourceLinks sources={chain.sources} max={4} />
            </p>
            <DataNotice datasets={["hotelEarning"]} />
          </section>

          <p className="flex gap-2 text-xs leading-relaxed text-ink-3">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            Book direct with the hotel or its app: stays booked through online travel agencies generally earn no hotel points,
            and at Marriott elite benefits don&apos;t apply to them. Promotions and elite welcome gifts aren&apos;t included.
          </p>
        </div>
      </div>
    </div>
  );
}

/** Every way to pay for this stay, by total value, so the best card is obvious. */
function CardComparison({
  rows,
  selected,
  onPick,
  wallet,
}: {
  rows: { card: StayCard; value: ReturnType<typeof stayPoints> }[];
  selected: string | null;
  onPick: (key: string) => void;
  /** Card ids in the visitor's wallet. */
  wallet: string[];
}) {
  const sorted = [...rows].sort((a, b) => (b.value.totalValue ?? -1) - (a.value.totalValue ?? -1));
  const top = sorted[0]?.value.totalValue ?? null;
  // Every card tied for the top value is best (five Marriott cards can tie), unless they all tie.
  const isBest = (v: number | null) => top !== null && top > 0 && v !== null && Math.abs(v - top) < 0.005;
  const allTie = sorted.every((r) => isBest(r.value.totalValue));
  return (
    <section className="panel overflow-hidden" aria-labelledby="pay-with-title">
      <div className="px-5 pt-5 pb-3">
        <h2 id="pay-with-title" className="font-semibold text-navy">
          Which card to pay with
        </h2>
        <p className="text-sm text-ink-2">Hotel and card points together, valued the same way. Pick one to see its breakdown.</p>
      </div>
      <table className="w-full table-fixed text-sm">
        <caption className="sr-only">Total value of this stay with each card</caption>
        <thead>
          <tr className="border-y border-line bg-canvas text-left text-xs font-semibold tracking-wide text-ink-3 uppercase">
            <th scope="col" className="py-2.5 pr-3 pl-4 sm:pl-5">
              Card
            </th>
            <th scope="col" className="hidden w-28 px-3 py-2.5 text-right sm:table-cell">
              Card earns
            </th>
            <th scope="col" className="w-24 py-2.5 pr-4 pl-2 text-right sm:w-28 sm:pr-5">
              Value
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {sorted.map(({ card, value }) => {
            const art = card.cardId ? getCard(card.cardId) : undefined;
            const on = card.key === selected;
            const best = !allTie && isBest(value.totalValue);
            return (
              <tr key={card.key} className={cn(on && "bg-sky/50")}>
                <th scope="row" className="py-2.5 pr-3 pl-4 text-left font-normal sm:pl-5">
                  <button
                    type="button"
                    onClick={() => onPick(card.key)}
                    aria-pressed={on}
                    className="flex w-full items-center gap-3 text-left hover:text-brand"
                  >
                    {art ? (
                      <CardArt card={art} size="xs" className="shrink-0" />
                    ) : (
                      <span className="grid aspect-[1.586] w-16 shrink-0 place-items-center rounded-[5%/8%] border border-line bg-canvas text-ink-3" aria-hidden>
                        <CreditCard className="h-4 w-4" />
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className={cn("block leading-snug font-semibold", on ? "text-brand" : "text-ink")}>{card.name}</span>
                      <span className="block text-xs leading-snug text-ink-3">
                        {best && <span className="font-semibold text-success">Best for this stay · </span>}
                        {card.group === "chain" ? "Co-branded card" : wallet.includes(card.key) ? "In your wallet" : "From the link"}
                      </span>
                    </span>
                  </button>
                </th>
                <td className="hidden px-3 py-2.5 text-right text-ink-2 tabular-nums sm:table-cell">
                  {value.cardCash ? `${card.perDollar}% back` : `${card.perDollar}x`}
                </td>
                <td className={cn("py-2.5 pr-4 pl-2 text-right font-semibold tabular-nums sm:pr-5", best ? "text-success" : "text-navy")}>
                  {value.totalValue === null ? "—" : usd(value.totalValue)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-semibold tracking-wide text-ink-2 uppercase">
        {label}
      </label>
      {children}
    </div>
  );
}

function Breakdown({
  result,
  program,
  card,
  perDollar,
  exception,
  tier,
  nights,
}: {
  result: ReturnType<typeof stayPoints>;
  program: string;
  card: StayCard | null;
  perDollar: number | null;
  /** The lower-earning brand picked, if any. */
  exception: string | null;
  tier: string;
  nights: number;
}) {
  const cardArt = card?.cardId ? getCard(card.cardId) : undefined;
  const parts = [
    { label: "Base points", value: result.basePoints ?? 0, color: "bg-brand" },
    { label: "Elite bonus", value: result.eliteBonus ?? 0, color: "bg-navy-2" },
    { label: "Card points", value: result.sameCurrency ? result.cardPoints : 0, color: "bg-gold" },
  ].filter((p) => p.value > 0);
  const total = parts.reduce((s, p) => s + p.value, 0);
  return (
    <div className="space-y-5 p-5 sm:p-6">
      {total > 0 && (
        <div>
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-canvas" aria-hidden>
            {parts.map((p) => (
              <span key={p.label} className={cn("h-full", p.color)} style={{ width: `${(p.value / total) * 100}%` }} />
            ))}
          </div>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
            {parts.map((p) => (
              <li key={p.label} className="flex items-center gap-1.5">
                <span className={cn("h-2 w-2 rounded-full", p.color)} aria-hidden />
                {p.label} {Math.round((p.value / total) * 100)}%
              </li>
            ))}
          </ul>
        </div>
      )}
      <table className="w-full text-sm">
        <caption className="sr-only">How the points add up</caption>
        <tbody className="divide-y divide-line">
          <tr>
            <th scope="row" className="py-2.5 pr-3 text-left font-normal text-ink-2">
              Room {usd(result.room, { cents: result.room % 1 !== 0 })} ({nights} night{nights === 1 ? "" : "s"}) + taxes {usd(result.taxes, { cents: true })}
            </th>
            <td className="py-2.5 text-right font-medium text-ink tabular-nums">{usd(result.total, { cents: true })}</td>
          </tr>
          <tr>
            <th scope="row" className="py-2.5 pr-3 text-left font-normal text-ink-2">
              {perDollar === null ? (
                <>Base: {program}&apos;s earning rate isn&apos;t confirmed yet</>
              ) : (
                <>
                  Base: {usd(result.eligible, { cents: result.eligible % 1 !== 0 })} × {perDollar} per ${exception ? ` (${exception})` : ""}
                  {result.taxesEarn !== true && result.taxes > 0 && (
                    <span className="block text-xs text-ink-3">
                      {result.taxesEarn === null ? "Room rate only: whether taxes earn isn't confirmed" : "Room rate only: taxes don't earn"}
                    </span>
                  )}
                </>
              )}
            </th>
            <td className="py-2.5 text-right font-medium text-ink tabular-nums">{result.basePoints === null ? "—" : pts(result.basePoints)}</td>
          </tr>
          <tr>
            <th scope="row" className="py-2.5 pr-3 text-left font-normal text-ink-2">
              {!tier
                ? "Elite bonus (no status selected)"
                : result.noEliteAtBrand
                  ? `${tier}: no elite bonus at this brand`
                  : result.eliteUnknown
                    ? `${tier} bonus: not confirmed, so not counted`
                    : `${tier} bonus, +${result.elitePercent}% of base`}
            </th>
            <td className="py-2.5 text-right font-medium text-ink tabular-nums">{result.eliteBonus ? `+${pts(result.eliteBonus)}` : "—"}</td>
          </tr>
          <tr className="font-semibold">
            <th scope="row" className="py-2.5 pr-3 text-left text-navy">
              {program} points
            </th>
            <td className="py-2.5 text-right text-navy tabular-nums">{result.hotelPoints === null ? "—" : pts(result.hotelPoints)}</td>
          </tr>
          <tr>
            <th scope="row" className="py-2.5 pr-3 text-left font-normal text-ink-2">
              {card ? (
                <span className="flex items-center gap-2">
                  {cardArt && <CardArt card={cardArt} size="xs" className="hidden shrink-0 sm:block" />}
                  <span>
                    {card.name}: {usd(result.total, { cents: true })} × {result.cardCash ? `${card.perDollar}%` : `${card.perDollar} per $`}
                    <span className="block text-xs text-ink-3">{result.cardCash ? "Cash back" : result.cardLabel}</span>
                  </span>
                </span>
              ) : (
                "Card points (pick the card you pay with)"
              )}
            </th>
            <td className="py-2.5 text-right font-medium text-ink tabular-nums">
              {card ? (result.cardCash ? usd(result.cardValue ?? 0, { cents: true }) : `+${pts(result.cardPoints)}`) : "—"}
            </td>
          </tr>
          <tr className="font-semibold">
            <th scope="row" className="py-2.5 pr-3 text-left text-navy">
              Value{result.hotelCents !== null ? ` at ${cents(result.hotelCents)} per ${program} point` : ""}
              {card && !result.sameCurrency && result.cardCents !== null && !result.cardCash ? `, ${cents(result.cardCents)} per card point` : ""}
            </th>
            <td className="py-2.5 text-right text-success tabular-nums">{result.totalValue === null ? "—" : usd(result.totalValue, { cents: true })}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
