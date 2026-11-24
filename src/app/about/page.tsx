import type { Metadata } from "next";
import Link from "next/link";
import { cards } from "@/shared/data/cards";
import { getCurrency, isCurrencyId, programName, valuationEditions, type Photo, type ProgramId } from "@/shared/data/points";
import { shownPhotos } from "@/shared/data/points/shown-photos";
import { currencyOfCard } from "@/shared/lib/points";
import { VALUE_EDITION_LABEL, VALUE_OUTLETS, formatCents, resolvePointValue } from "@/shared/lib/point-value";
import { shortCardName } from "@/shared/lib/card-name";
import { PageHero } from "@/frontend/components/page-hero";
import { formatDate } from "@/shared/lib/dates";

export const metadata: Metadata = {
  title: "About our data",
  description: "How Perkfolio researches card terms and values points.",
};

/** "TPG", "UP", "NW": the outlets' short names in the table. */
const SHORT: Record<string, string> = { "The Points Guy": "TPG", "Upgraded Points": "UP", NerdWallet: "NW" };
const listJoin = (items: string[]) => (items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`);

/** Title (linked to where the photo came from) · author · license (linked to its terms). */
function PhotoCreditLine({ photo }: { photo: Photo }) {
  return (
    <>
      <a href={photo.sourcePage} target="_blank" rel="noopener noreferrer" className="link font-medium">
        {photo.title}
      </a>{" "}
      · {photo.author} ·{" "}
      {photo.licenseUrl ? (
        <a href={photo.licenseUrl} target="_blank" rel="noopener noreferrer license" className="underline underline-offset-2">
          {photo.license}
        </a>
      ) : (
        photo.license
      )}
    </>
  );
}

export default function AboutPage() {
  const photos = shownPhotos();
  // One row per currency or program the cards earn in full: the value every page uses (the outlets' median) and each
  // outlet's figure behind it.
  const ids = Array.from(
    new Set(
      cards.flatMap((c) => {
        const p = currencyOfCard(c);
        return p?.kind === "currency" ? (p.limited ? [] : [p.currency as string]) : p ? [p.program as string] : [];
      }),
    ),
  );
  const rows = ids
    .map((id) => {
      // The value every page uses with no preferences yet: the published median (or a card file's estimate).
      const v = resolvePointValue(id);
      return { id, name: isCurrencyId(id) ? (getCurrency(id)?.name ?? id) : programName(id as ProgramId), value: v?.published, cents: v?.cents };
    })
    .sort((a, b) => (b.cents ?? 0) - (a.cents ?? 0) || a.name.localeCompare(b.name));
  // Points a card earns that no outlet values: the card file's own estimate (none today).
  const estimated = rows.filter((r) => !r.value);
  // Cards whose points transfer only with another card: cash back on their own.
  const limited = cards.filter((c) => {
    const p = currencyOfCard(c);
    return p?.kind === "currency" && p.limited;
  });

  return (
    <>
      <PageHero
        eyebrow="About"
        title="How we build Perkfolio"
        subtitle="Independent research, one published value per point, and a wallet that stays in your browser unless you sign in to sync it."
      />
      <div className="container-page grid gap-12 py-12 lg:grid-cols-[1fr_360px]">
        <article className="max-w-3xl space-y-10 text-[15px] leading-relaxed text-ink-2">
          <section className="space-y-3">
            <h2 className="text-2xl font-semibold text-navy">Where the data comes from</h2>
            <p>
              Every card is researched from issuer product pages and cross-checked against recent coverage from established
              points-and-miles publications. Each card shows the date its terms were last verified. Issuers change offers
              frequently — welcome bonuses in particular can vary by applicant and channel — so always confirm on the issuer&apos;s
              site before you apply.
            </p>
          </section>
          <section id="methodology" className="scroll-mt-28 space-y-3">
            <h2 className="text-2xl font-semibold text-navy">How we value points</h2>
            <p>
              Every page uses one value per point: the calculator, Compare, Which Card?, the next-card ranking, card pages, the
              tracker, Points &amp; Miles and the hotel calculator. It&apos;s the median of the {VALUE_EDITION_LABEL} cents-per-point
              tables from{" "}
              {valuationEditions.map((e, i) => (
                <span key={e.outlet}>
                  {i > 0 ? (i === valuationEditions.length - 1 ? " and " : ", ") : ""}
                  <a href={e.url} target="_blank" rel="noopener noreferrer" className="link">
                    {e.outlet}
                  </a>{" "}
                  ({e.published ? `published ${formatDate(e.published)}, ` : ""}
                  {e.modified ? `updated ${formatDate(e.modified)}` : `read ${formatDate(e.readOn)}`})
                </span>
              ))}
              , each read on the outlet&apos;s own page on {formatDate(valuationEditions[0]?.readOn ?? "")}: the middle of the three
              figures, or the mean of two when only two outlets list the points. NerdWallet gives a lower figure for some
              cardholders (Chase points with a Sapphire Preferred or Ink Business Preferred but no Sapphire Reserve, Citi points
              without a Strata Premier or Strata Elite); when your wallet matches, that figure replaces its headline one. Points
              none of the outlets list have no value until you set one
              {estimated.length > 0 ? `, except ${listJoin(estimated.map((r) => r.name))}, which our cards earn and value at the card's own estimate` : ""}.
            </p>
            <p>
              <strong className="text-ink">Set your own value</strong> on the tracker&apos;s{" "}
              <Link href="/tracker?tab=points" className="link">
                Points tab
              </Link>
              : add a balance and use the pencil next to its value (or &ldquo;Set your own&rdquo; where no outlet publishes one).
              It&apos;s saved in this browser, and every page uses it instead of the median.
            </p>
            <p>
              Cash back counts at face value. Cards whose points transfer only with another card (
              {listJoin(limited.map((c) => shortCardName(c.name)))}) count as cash back until your wallet has a card that unlocks
              transfers; then their points are worth what the currency&apos;s are. Statement credits are shown at face value; use
              the calculator&apos;s utilization slider or the tracker to see what you actually capture.
            </p>
          </section>
          <section id="points-data" className="scroll-mt-28 space-y-3">
            <h2 className="text-2xl font-semibold text-navy">Points &amp; miles data</h2>
            <p>
              Transfer ratios, award prices and program rules in{" "}
              <Link href="/points" className="link">
                Points &amp; Miles
              </Link>{" "}
              come from the banks&apos; and programs&apos; own published partner lists, award charts and terms, cross-checked against
              points-and-miles coverage. Every sweet spot links its sources and shows when it was last checked, and every program and
              currency shows its last-verified date. Where no source confirms a detail (a transfer time, a booking rule, a value) we
              say so instead of guessing. Award prices and partner lists change without notice, so search for space before you
              transfer: transfers can&apos;t be undone.
            </p>
            <p>
              Each program page in Points &amp; Miles lists every outlet&apos;s figure behind its value, with the outlet&apos;s method
              and the month of its table.
            </p>
          </section>
          <section id="photos" className="scroll-mt-28 space-y-3">
            <h2 className="text-2xl font-semibold text-navy">Photo credits</h2>
            <p>
              Photos are used under their licenses and always credited: each one shows its author and license, linked to the page it
              came from. These are all the photos on the site:
            </p>
            {photos.regions.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-ink">Destinations, on award sweet spots</h3>
                <ul className="mt-1 space-y-1 text-sm">
                  {photos.regions.map((p) => (
                    <li key={p.src}>
                      <PhotoCreditLine photo={p} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {photos.airports.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-ink">Airports, on their lounge pages</h3>
                <ul className="mt-1 space-y-1 text-sm">
                  {photos.airports.map(({ code, photo }) => (
                    <li key={photo.src}>
                      <Link href={`/lounges/${code}`} className="font-semibold text-ink underline-offset-2 hover:underline">
                        {code} lounges
                      </Link>
                      : <PhotoCreditLine photo={photo} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
          <section className="space-y-3">
            <h2 className="text-2xl font-semibold text-navy">Your privacy</h2>
            <p>
              Your wallet and benefit usage are saved in your browser&apos;s local storage. Signing in with Google is optional: if
              you do, we keep your name, email address and profile picture from Google, and a copy of your wallet on our server so
              it syncs across your devices. Delete account (in the account menu) removes both; the copy in your browser stays
              until you reset it on the tracker. We never ask for card numbers or bank logins.
            </p>
            <p>
              Lounge pages show maps from OpenStreetMap. For an airport without a saved terminal map, your browser asks
              OpenStreetMap&apos;s Overpass service for the terminal outlines; those requests carry no wallet data. Use Export on
              the tracker to back up your data or move it without signing in.
            </p>
          </section>
          <section id="disclaimer" className="scroll-mt-28 space-y-3">
            <h2 className="text-2xl font-semibold text-navy">Disclaimer</h2>
            <p>
              Perkfolio is an independent tool and is not affiliated with any bank or card network. Card names, trademarks and card
              images belong to their issuers and are used for identification only.
              Nothing here is financial advice.
            </p>
          </section>
        </article>
        <aside className="panel h-fit overflow-hidden">
          <h2 className="border-b border-line px-5 py-4 font-semibold text-navy">What a point is worth</h2>
          <table className="w-full text-sm">
            <caption className="sr-only">The value every page uses for each currency our cards earn, with each outlet&apos;s figure</caption>
            <thead className="text-left text-xs text-ink-3">
              <tr>
                <th className="px-5 pt-3 pb-1 font-medium">Currency</th>
                <th className="py-1 pt-3 pr-5 pl-2 text-right font-medium">
                  Median <span className="block font-normal">{VALUE_EDITION_LABEL}</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map(({ id, name, value, cents }) => (
                <tr key={id} className="align-top">
                  <td className="px-5 py-3 text-ink">
                    {name}
                    {value && (
                      <span className="mt-0.5 block text-xs text-ink-3 tabular-nums">
                        {value.values.map((o) => `${SHORT[o.outlet] ?? o.outlet} ${formatCents(o.cents)}`).join(" · ")}
                      </span>
                    )}
                  </td>
                  <td className="py-3 pr-5 pl-2 text-right font-semibold text-navy tabular-nums">
                    {cents === undefined ? "—" : value ? formatCents(cents) : `${formatCents(cents)} (estimate)`}
                  </td>
                </tr>
              ))}
              <tr>
                <td className="px-5 py-3 text-ink">Cash back</td>
                <td className="py-3 pr-5 pl-2 text-right font-semibold text-navy">Face value</td>
              </tr>
            </tbody>
          </table>
          <p className="border-t border-line px-5 py-3 text-xs leading-relaxed text-ink-3">
            The middle of {listJoin(VALUE_OUTLETS.map((o) => (SHORT[o] ? `${o} (${SHORT[o]})` : o)))}&apos;s {VALUE_EDITION_LABEL} figures, in
            US cents per point. Every page uses it unless you set your own on the tracker&apos;s{" "}
            <Link href="/tracker?tab=points" className="link">
              Points tab
            </Link>
            .
          </p>
        </aside>
      </div>
    </>
  );
}
