import { CalendarSearch, Repeat, Undo2 } from "lucide-react";
import { currencies, partnerChanges, partnersOfCurrency, programName } from "@/shared/data/points";
import { cardsEarning, ratioLabel } from "@/shared/lib/points";
import { CardPageNote, ValueInline } from "./point-value";
import { CURRENCY_COLOR, Dot, SectionHeading, SourceList, formatDate } from "./ui";

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
    body: "Banks run limited-time transfer bonuses a few times a year (the ones running now are listed above). If you're not in a hurry, a bonus can cut the price noticeably.",
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

/** One card per bank currency: who earns it, its rules, what a point is worth, and where the partner list comes from. */
export function CurrencyNotes() {
  return (
    <section aria-labelledby="currency-notes">
      <SectionHeading id="currency-notes" eyebrow="The currencies" title="About each points currency" />
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {currencies.map((c) => {
          const partners = partnersOfCurrency(c.id);
          const programs = new Set(partners.map((p) => p.program)).size;
          const cardCount = cardsEarning(c.id).length;
          // Partners the dated change log added (the currency's own text can predate them).
          const added = partners.filter((p) =>
            partnerChanges.some((x) => x.change === "added" && x.currency === c.id && x.program === p.program && x.date === p.changedOn),
          );
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
              <p className="text-sm text-ink-2">
                <span className="font-medium text-ink">Worth per point:</span> <ValueInline id={c.id} />. <CardPageNote id={c.id} />
              </p>
              {c.restrictions && <p className="text-sm text-ink-2">{c.restrictions}</p>}
              {added.length > 0 && (
                <p className="text-sm text-ink-2">
                  <span className="font-medium text-ink">Added recently:</span>{" "}
                  {added.map((p, i) => (
                    <span key={p.program}>
                      {i > 0 && (i === added.length - 1 ? " and " : ", ")}
                      {programName(p.program)} ({ratioLabel(p)}, {formatDate(p.changedOn!)})
                    </span>
                  ))}
                  .
                </p>
              )}
              <div className="mt-auto flex flex-wrap items-start justify-between gap-2 border-t border-line pt-3 text-xs text-ink-3">
                <SourceList urls={c.sources} />
                <span>Checked {formatDate(c.lastVerified)}</span>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
