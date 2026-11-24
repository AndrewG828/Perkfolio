import { ArrowUpRight, CalendarSearch, Repeat, Undo2 } from "lucide-react";
import { currencies, partnersOfCurrency } from "@/shared/data/points";
import { cardsEarning } from "@/shared/lib/points";
import { CURRENCY_COLOR, Dot, SectionHeading, formatDate, hostOf } from "./ui";

const TIPS = [
  {
    icon: CalendarSearch,
    title: "Find the seat first",
    body: "Search the airline or hotel site for award space before you transfer. Points can sit stranded if the award disappears.",
  },
  {
    icon: Undo2,
    title: "Transfers are one-way",
    body: "Once points move to an airline or hotel, they can't come back to the bank. Move only what you need, in the allowed steps.",
  },
  {
    icon: Repeat,
    title: "Watch for bonuses",
    body: "Banks run limited-time transfer bonuses a few times a year. If you're not in a hurry, a bonus can cut the price noticeably.",
  },
];

export function TransferTips() {
  return (
    <section aria-labelledby="transfer-tips">
      <SectionHeading id="transfer-tips" eyebrow="Before you transfer" title="Three rules that save points" />
      <div className="grid gap-5 md:grid-cols-3">
        {TIPS.map((t) => (
          <div key={t.title} className="panel flex flex-col gap-3 p-5">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-sky text-brand">
              <t.icon className="h-5 w-5" aria-hidden />
            </span>
            <h3 className="font-semibold text-navy">{t.title}</h3>
            <p className="text-sm leading-relaxed text-ink-2">{t.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/** One card per bank currency: who earns it, its rules, and where the partner list comes from. */
export function CurrencyNotes() {
  return (
    <section aria-labelledby="currency-notes">
      <SectionHeading id="currency-notes" eyebrow="The currencies" title="About each points currency" />
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {currencies.map((c) => {
          const partners = partnersOfCurrency(c.id);
          const programs = new Set(partners.map((p) => p.program)).size;
          const cardCount = cardsEarning(c.id).length;
          return (
            <article key={c.id} className="panel flex flex-col gap-3 p-5">
              <div className="flex items-start gap-3">
                <span className="mt-1.5">
                  <Dot color={CURRENCY_COLOR[c.id]} className="h-3 w-3" />
                </span>
                <div className="min-w-0">
                  <h3 className="font-semibold text-navy">{c.name}</h3>
                  <p className="text-xs text-ink-3">
                    {c.issuer} · {programs} partner{programs === 1 ? "" : "s"} · {cardCount} card{cardCount === 1 ? "" : "s"} in our directory
                  </p>
                </div>
              </div>
              <p className="text-sm text-ink-2">
                <span className="font-medium text-ink">Earned with:</span> {c.earnedWith}
              </p>
              {c.restrictions && <p className="text-sm text-ink-2">{c.restrictions}</p>}
              <p className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-xs text-ink-3">
                <a href={c.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-brand hover:underline">
                  {hostOf(c.sourceUrl)} <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                </a>
                <span>Checked {formatDate(c.lastVerified)}</span>
              </p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
