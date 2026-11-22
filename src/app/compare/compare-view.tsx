"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, Minus, Plus, X } from "lucide-react";
import type { Card, LoungeNetwork } from "@/data/types";
import { annualizedCreditValue, cards, featuredIds, getCard, issuers, rateLabel } from "@/data/cards";
import { loungeNetworks } from "@/data/networks";
import { CardArt } from "@/components/card-art";
import { WalletButton } from "@/components/wallet-button";
import { compareActions, MAX_COMPARE } from "@/lib/compare-store";
import { frequencyShort } from "@/lib/periods";
import { cn, usd } from "@/lib/format";

const DEFAULT = ["amex-platinum", "chase-sapphire-reserve", "capital-one-venture-x"];

export function CompareView() {
  const params = useSearchParams();
  const router = useRouter();
  const fromUrl = (params.get("cards") ?? "").split(",").filter((id) => getCard(id));
  const ids = (fromUrl.length ? fromUrl : DEFAULT.filter((id) => getCard(id)).length ? DEFAULT : featuredIds).slice(0, MAX_COMPARE);
  const selected = ids.map(getCard).filter((c): c is Card => Boolean(c));

  useEffect(() => {
    compareActions.setAll(ids);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.join(",")]);

  const update = (next: string[]) => router.replace(`/compare?cards=${next.join(",")}`, { scroll: false });
  const setSlot = (i: number, id: string) => {
    const next = [...ids];
    next[i] = id;
    update(Array.from(new Set(next)));
  };
  const remove = (i: number) => update(ids.filter((_, j) => j !== i));

  const networks = Array.from(new Set(selected.flatMap((c) => c.loungeAccess.map((l) => l.network)))) as LoungeNetwork[];
  const credits = selected.map(annualizedCreditValue);
  const bestFee = Math.min(...selected.map((c) => c.annualFee));
  const bestCredits = Math.max(...credits);
  const bestNet = Math.max(...selected.map((c, i) => credits[i] - c.annualFee));
  const bestBonus = Math.max(...selected.map((c) => c.welcomeOfferValue));
  const cols = selected.length + (selected.length < MAX_COMPARE ? 1 : 0);

  return (
    <div className="container-page py-10">
      <div className="overflow-x-auto pb-4">
        <table className="w-full min-w-[760px] border-separate border-spacing-0 text-sm" style={{ tableLayout: "fixed" }}>
          <colgroup>
            <col className="w-[180px]" />
            {Array.from({ length: cols }).map((_, i) => (
              <col key={i} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-white" />
              {selected.map((card, i) => (
                <th key={card.id} className="px-3 pb-6 align-top font-normal">
                  <div className="relative flex flex-col items-center gap-4 text-center">
                    <button
                      onClick={() => remove(i)}
                      className="absolute -top-1 right-0 grid h-7 w-7 place-items-center rounded-full text-ink-3 hover:bg-canvas hover:text-ink"
                      aria-label={`Remove ${card.name}`}
                    >
                      <X className="h-4 w-4" />
                    </button>
                    <CardArt card={card} className="max-w-[220px]" />
                    <select className="input text-center font-semibold text-navy" value={card.id} onChange={(e) => setSlot(i, e.target.value)} aria-label={`Card ${i + 1}`}>
                      <CardOptions />
                    </select>
                    <div className="flex flex-wrap justify-center gap-2">
                      <Link href={`/cards/${card.id}`} className="btn-primary px-4 py-2 text-xs">
                        Details
                      </Link>
                      <WalletButton cardId={card.id} compact />
                    </div>
                  </div>
                </th>
              ))}
              {selected.length < MAX_COMPARE && (
                <th className="px-3 pb-6 align-top font-normal">
                  <div className="flex aspect-[1.586] w-full max-w-[220px] flex-col items-center justify-center gap-3 rounded-[14px] border-2 border-dashed border-line p-4 mx-auto">
                    <Plus className="h-6 w-6 text-ink-3" />
                    <select
                      className="input text-center"
                      value=""
                      onChange={(e) => e.target.value && update([...ids, e.target.value])}
                      aria-label="Add a card"
                    >
                      <option value="">Add a card…</option>
                      <CardOptions exclude={ids} />
                    </select>
                  </div>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            <Group label="Cost & value" cols={cols} />
            <Row label="Annual fee" cards={selected} cols={cols} render={(c) => <Val best={c.annualFee === bestFee && selected.length > 1}>{c.annualFee ? usd(c.annualFee) : "$0"}</Val>} />
            <Row label="Credits per year" hint="Face value, annualized" cards={selected} cols={cols} render={(c, i) => <Val best={credits[i] === bestCredits && credits[i] > 0 && selected.length > 1}>{credits[i] ? usd(credits[i]) : "—"}</Val>} />
            <Row
              label="Net if fully used"
              cards={selected}
              cols={cols}
              render={(c, i) => (
                <Val best={credits[i] - c.annualFee === bestNet && selected.length > 1} tone={credits[i] - c.annualFee >= 0 ? "pos" : "neg"}>
                  {usd(credits[i] - c.annualFee)}
                </Val>
              )}
            />
            <Row
              label="Welcome offer"
              cards={selected}
              cols={cols}
              render={(c) => (
                <div>
                  <p className="text-ink">{c.welcomeOffer}</p>
                  {c.welcomeOfferValue > 0 && <p className={cn("mt-1 text-xs", c.welcomeOfferValue === bestBonus && selected.length > 1 ? "font-semibold text-success" : "text-ink-3")}>≈ {usd(c.welcomeOfferValue)}</p>}
                </div>
              )}
            />
            <Row label="Foreign transaction fee" cards={selected} cols={cols} render={(c) => (c.foreignTransactionFee ? <span className="text-danger">Yes</span> : <span className="text-success">None</span>)} />
            <Row label="Authorized users" cards={selected} cols={cols} render={(c) => <span className="text-ink-2">{c.authorizedUserFee ?? "—"}</span>} />

            <Group label="Earning" cols={cols} />
            <Row label="Rewards currency" cards={selected} cols={cols} render={(c) => <span className="text-ink">{c.rewardsCurrency} <span className="text-ink-3">· {c.pointValueCents}¢</span></span>} />
            <Row
              label="Bonus categories"
              cards={selected}
              cols={cols}
              render={(c) => (
                <ul className="space-y-1.5">
                  {[...c.earnRates].sort((a, b) => b.multiplier - a.multiplier).map((r) => (
                    <li key={r.category} className="flex gap-2">
                      <span className="w-9 shrink-0 font-semibold text-brand">{rateLabel(c, r.multiplier)}</span>
                      <span className="text-ink-2">{r.category}</span>
                    </li>
                  ))}
                </ul>
              )}
            />
            <Row label="Everything else" cards={selected} cols={cols} render={(c) => <span className="font-semibold text-ink">{rateLabel(c, c.baseRate)}</span>} />
            <Row label="Transfer partners" cards={selected} cols={cols} render={(c) => <span className="text-ink-2">{c.transferPartners?.length ? `${c.transferPartners.length} partners` : "—"}</span>} />

            <Group label="Statement credits" cols={cols} />
            <Row
              label="Credits"
              cards={selected}
              cols={cols}
              render={(c) =>
                c.credits.length ? (
                  <ul className="space-y-1.5">
                    {c.credits.map((cr) => (
                      <li key={cr.id} className="flex justify-between gap-3">
                        <span className="text-ink-2">{cr.name}</span>
                        <span className="shrink-0 font-medium whitespace-nowrap text-ink">
                          {cr.frequency === "annual" || cr.frequency === "one-time" ? usd(cr.annualValue) : `${usd(cr.amountPerPeriod)}${frequencyShort[cr.frequency]}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="text-ink-3">None</span>
                )
              }
            />

            <Group label="Lounge access" cols={cols} />
            {networks.length === 0 && <Row label="Lounges" cards={selected} cols={cols} render={() => <span className="text-ink-3">None</span>} />}
            {networks.map((n) => (
              <Row
                key={n}
                label={loungeNetworks[n].label}
                cards={selected}
                cols={cols}
                render={(c) => {
                  const a = c.loungeAccess.find((l) => l.network === n);
                  return a ? (
                    <div className="flex gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                      <span className="text-ink-2">{a.terms}</span>
                    </div>
                  ) : (
                    <Minus className="h-4 w-4 text-ink-3" />
                  );
                }}
              />
            ))}

            <Group label="Perks" cols={cols} />
            <Row
              label="Other benefits"
              cards={selected}
              cols={cols}
              render={(c) => (
                <ul className="space-y-1.5">
                  {c.perks.slice(0, 8).map((p) => (
                    <li key={p} className="flex gap-2 text-ink-2">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
                      {p}
                    </li>
                  ))}
                </ul>
              )}
            />
            <Row label="Best for" cards={selected} cols={cols} render={(c) => <span className="text-ink-2">{c.bestFor}</span>} />
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CardOptions({ exclude = [] }: { exclude?: string[] }) {
  return (
    <>
      {issuers.map((iss) => (
        <optgroup key={iss} label={iss}>
          {cards
            .filter((c) => c.issuer === iss && !exclude.includes(c.id))
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </optgroup>
      ))}
    </>
  );
}

function Group({ label, cols }: { label: string; cols: number }) {
  return (
    <tr>
      <th colSpan={cols + 1} className="sticky left-0 border-b-2 border-navy bg-white px-3 pt-8 pb-2 text-left text-xs font-semibold tracking-[0.14em] text-navy uppercase">
        {label}
      </th>
    </tr>
  );
}

function Row({
  label,
  hint,
  cards,
  cols,
  render,
}: {
  label: string;
  hint?: string;
  cards: Card[];
  cols: number;
  render: (c: Card, i: number) => React.ReactNode;
}) {
  return (
    <tr className="group">
      <th scope="row" className="sticky left-0 z-10 border-b border-line bg-white px-3 py-4 text-left align-top font-medium text-ink group-hover:bg-canvas">
        {label}
        {hint && <span className="block text-xs font-normal text-ink-3">{hint}</span>}
      </th>
      {cards.map((c, i) => (
        <td key={c.id} className="border-b border-line px-3 py-4 align-top group-hover:bg-canvas">
          {render(c, i)}
        </td>
      ))}
      {cards.length < cols && <td className="border-b border-line group-hover:bg-canvas" />}
    </tr>
  );
}

function Val({ children, best, tone }: { children: React.ReactNode; best?: boolean; tone?: "pos" | "neg" }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-base font-semibold", tone === "neg" ? "text-danger" : tone === "pos" ? "text-success" : "text-ink")}>
      {children}
      {best && <span className="rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-success uppercase">Best</span>}
    </span>
  );
}
