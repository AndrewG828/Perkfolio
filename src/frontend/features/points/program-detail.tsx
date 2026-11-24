"use client";

import Link from "next/link";
import { CheckCircle2, CreditCard, Plus, XCircle } from "lucide-react";
import {
  BANK_CURRENCY_IDS,
  getCurrency,
  partnersOfProgram,
  sweetSpotsOf,
  type AwardProgram,
  type TransferPartner,
} from "@/shared/data/points";
import { cardsEarning, coBrandCards, currencyOfCard, ratioLabel } from "@/shared/lib/points";
import { getCard } from "@/shared/data/cards";
import { shortCardName } from "@/shared/lib/card-name";
import { CardArt } from "@/frontend/components/card-art";
import { cn, num } from "@/shared/lib/format";
import { SweetSpotCard } from "./sweet-spot-card";
import { CURRENCY_COLOR, Dot, RatioPill } from "./ui";
import { useWalletReach } from "./use-wallet-reach";

const cardNames = (ids: string[] | undefined) =>
  (ids ?? []).map((id) => getCard(id)).filter(Boolean).map((c) => shortCardName(c!.name));

/** "How to get <currency>": every bank transfer into the program and the co-brand cards, the wallet's highlighted. */
export function ProgramSources({ program }: { program: AwardProgram }) {
  const wallet = useWalletReach();
  const reach = wallet.reach.get(program.id);
  const usable = new Set(reach?.routes.map((r) => r.partner));
  const entries = [...partnersOfProgram(program.id)].sort(
    (a, b) => BANK_CURRENCY_IDS.indexOf(a.currency) - BANK_CURRENCY_IDS.indexOf(b.currency) || b.to / b.from - a.to / a.from,
  );
  const coBrand = coBrandCards(program.id);
  const owned = new Set(wallet.points.cards.map((c) => c.id));

  if (entries.length === 0 && coBrand.length === 0) {
    return <p className="panel p-5 text-sm text-ink-2">No bank currency transfers here and no co-brand card in our directory earns these points.</p>;
  }

  return (
    <div className="space-y-6">
      {entries.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-semibold tracking-wide text-ink-3 uppercase">Transfer from bank points</h3>
          <ul className="panel divide-y divide-line">
            {entries.map((p, i) => (
              <SourceRow key={`${p.currency}-${i}`} partner={p} program={program} yours={usable.has(p)} />
            ))}
          </ul>
        </div>
      )}
      {coBrand.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-semibold tracking-wide text-ink-3 uppercase">Earn directly with a co-brand card</h3>
          <ul className="grid gap-3 sm:grid-cols-2">
            {coBrand.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/cards/${c.id}`}
                  className={cn("panel flex items-center gap-3 p-3 transition-shadow hover:shadow-[var(--shadow-lift)]", owned.has(c.id) && "ring-2 ring-success/60")}
                >
                  <CardArt card={c} size="xs" className="shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink">{c.name}</span>
                    <span className="block text-xs text-ink-3">
                      {c.annualFee ? `$${num(c.annualFee)} annual fee` : "No annual fee"} · {c.issuer}
                    </span>
                  </span>
                  {owned.has(c.id) && <span className="shrink-0 rounded-full bg-success/10 px-2 py-0.5 text-xs font-semibold text-success">In wallet</span>}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function SourceRow({ partner, program, yours }: { partner: TransferPartner; program: AwardProgram; yours: boolean }) {
  const currency = getCurrency(partner.currency);
  const only = cardNames(partner.cards);
  const rules = [partner.minimum ? `minimum ${num(partner.minimum)}` : null, partner.increment ? `steps of ${num(partner.increment)}` : null]
    .filter(Boolean)
    .join(", ");
  return (
    <li className={cn("flex items-start gap-3 p-4", yours && "bg-success/[0.06]")}>
      <Dot color={CURRENCY_COLOR[partner.currency]} className="mt-1.5 h-2.5 w-2.5" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-ink">
          {currency?.name ?? partner.currency}
          {only.length > 0 && <span className="font-normal text-ink-2"> · with {only.join(", ")}</span>}
        </p>
        <p className="mt-0.5 text-sm text-ink-2">
          {num(1000)} points → {num(Math.floor((1000 * partner.to) / partner.from))} {program.currency} · {partner.time}
          {rules && <span className="text-ink-3"> · {rules}</span>}
        </p>
        {partner.note && <p className="mt-1 text-sm text-ink-3">{partner.note}</p>}
        {yours && (
          <p className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-success">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Your cards can make this transfer
          </p>
        )}
      </div>
      <RatioPill partner={partner} mine={yours} className="mt-0.5" />
    </li>
  );
}

/** Sidebar: can this wallet get the program's points, and how (or which cards would). */
export function ProgramAccess({ program }: { program: AwardProgram }) {
  const wallet = useWalletReach();
  if (!wallet.hydrated) return <div className="panel h-40 animate-pulse bg-canvas" aria-hidden />;
  const reach = wallet.reach.get(program.id);

  if (wallet.points.cards.length === 0) {
    return (
      <div className="panel p-5">
        <p className="font-semibold text-navy">Can your cards get you here?</p>
        <p className="mt-1 text-sm text-ink-2">Add the cards you hold to see whether their points move to {program.name}.</p>
        <Link href="/tracker" className="btn-primary mt-4 w-full">
          <Plus className="h-4 w-4" /> Add my cards
        </Link>
      </div>
    );
  }

  if (reach) {
    const best = reach.best;
    return (
      <div className="panel border-l-4 border-l-success p-5">
        <p className="flex items-center gap-2 font-semibold text-navy">
          <CheckCircle2 className="h-5 w-5 text-success" aria-hidden /> Your cards reach {program.name}
        </p>
        <ul className="mt-3 space-y-2.5 text-sm">
          {best && (
            <li className="flex items-center justify-between gap-3">
              <span className="min-w-0 text-ink-2">
                Best transfer:{" "}
                <span className="font-semibold text-ink">{getCurrency(best.currency)?.shortName}</span>
                {best.cards[0] && <span className="block text-xs text-ink-3">via {shortCardName(best.cards[0].name)}</span>}
              </span>
              <RatioPill partner={best.partner} mine />
            </li>
          )}
          {reach.routes.slice(1).map((r) => (
            <li key={`${r.currency}-${ratioLabel(r.partner)}`} className="flex items-center justify-between gap-3 text-ink-2">
              <span>{getCurrency(r.currency)?.shortName}</span>
              <RatioPill partner={r.partner} />
            </li>
          ))}
          {reach.direct.map((c) => (
            <li key={c.id} className="flex items-center gap-2 text-ink-2">
              <CreditCard className="h-4 w-4 text-ink-3" aria-hidden /> Earned directly with {shortCardName(c.name)}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  // Not reachable: suggest cards that earn a currency transferring here.
  const currenciesHere = Array.from(new Set(partnersOfProgram(program.id).filter((p) => !p.cards).map((p) => p.currency)));
  const fullEarners = currenciesHere.flatMap((c) =>
    cardsEarning(c).filter((card) => {
      const p = currencyOfCard(card);
      return p?.kind === "currency" && !p.limited;
    }),
  );
  const suggestions = [...coBrandCards(program.id), ...fullEarners]
    .filter((c, i, all) => all.findIndex((x) => x.id === c.id) === i)
    .slice(0, 4);
  return (
    <div className="panel p-5">
      <p className="flex items-center gap-2 font-semibold text-navy">
        <XCircle className="h-5 w-5 text-ink-3" aria-hidden /> Not with your current cards
      </p>
      <p className="mt-1 text-sm text-ink-2">None of the cards in your wallet earn points that move to {program.name}.</p>
      {suggestions.length > 0 && (
        <>
          <p className="mt-4 text-xs font-semibold tracking-wide text-ink-3 uppercase">Cards that would</p>
          <ul className="mt-2 space-y-2">
            {suggestions.map((c) => (
              <li key={c.id}>
                <Link href={`/cards/${c.id}`} className="flex items-center gap-3 text-sm font-medium text-ink hover:text-brand">
                  <CardArt card={c} size="xs" className="shrink-0" />
                  <span className="truncate">{shortCardName(c.name)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/** The program's sweet spots, personalized. */
export function ProgramSweetSpots({ program }: { program: AwardProgram }) {
  const wallet = useWalletReach();
  const list = sweetSpotsOf(program.id);
  const hasCards = wallet.hydrated && wallet.points.cards.length > 0;
  if (list.length === 0) {
    return (
      <p className="panel p-5 text-sm text-ink-2">
        No sweet spots listed for {program.name} yet.{" "}
        <Link href="/points/sweet-spots" className="link">
          Browse all sweet spots
        </Link>
      </p>
    );
  }
  return (
    <div className="grid gap-6 md:grid-cols-2">
      {list.map((s) => (
        <SweetSpotCard key={s.id} spot={s} reach={hasCards ? (wallet.reach.get(s.program) ?? null) : undefined} mine={wallet.mine} />
      ))}
    </div>
  );
}
