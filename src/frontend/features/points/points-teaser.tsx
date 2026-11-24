import Link from "next/link";
import { ArrowRight, BedDouble, Plane } from "lucide-react";
import { awardPrograms, currencies, partnershipCount, programName, regionPhoto, sweetSpots } from "@/shared/data/points";
import { perLabel, pointsRange } from "@/shared/lib/points";
import { PhotoCredit, PhotoFrame } from "@/frontend/components/photo-frame";

/** Home page: a compact Points & Miles band with three sweet spot postcards. */
export function PointsTeaser() {
  // One postcard per destination region, in featured order.
  const spots = sweetSpots.filter((s, i) => sweetSpots.findIndex((x) => x.to === s.to) === i).slice(0, 3);
  const stats = [
    [String(currencies.length), "bank currencies"],
    [String(partnershipCount), "transfer partnerships"],
    [String(sweetSpots.length), "award sweet spots"],
  ];
  return (
    <section className="border-t border-line bg-gradient-to-b from-sky/70 to-white py-16 md:py-20" aria-labelledby="points-teaser">
      <div className="container-page grid items-center gap-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.4fr)]">
        <div>
          <p className="eyebrow">Points &amp; Miles</p>
          <h2 id="points-teaser" className="mt-2 text-3xl font-semibold tracking-tight text-navy">
            Turn your card points into flights
          </h2>
          <p className="mt-3 text-ink-2">
            Where each bank&apos;s points transfer, the award sweet spots worth booking, and guides to {awardPrograms.length} airline and
            hotel programs, matched to the cards in your wallet.
          </p>
          <dl className="mt-6 grid max-w-md grid-cols-3 gap-3">
            {stats.map(([v, l]) => (
              <div key={l} className="rounded-md border border-line bg-white px-3 py-2.5">
                <dt className="sr-only">{l}</dt>
                <dd>
                  <span className="block text-2xl font-semibold text-navy">{v}</span>
                  <span className="block text-xs leading-tight text-ink-2" aria-hidden>
                    {l}
                  </span>
                </dd>
              </div>
            ))}
          </dl>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/points" className="btn-primary">
              Explore Points &amp; Miles <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/points/transfers" className="btn-secondary">
              Transfer partners
            </Link>
          </div>
        </div>
        <ul className="grid gap-4 sm:grid-cols-3">
          {spots.map((s) => {
            const photo = regionPhoto(s.to);
            return (
              <li key={s.id} className="panel group relative flex overflow-hidden transition-shadow hover:shadow-[var(--shadow-lift)] sm:flex-col">
                <PhotoFrame
                  photo={photo}
                  region={s.to}
                  label={s.to}
                  icon={s.kind === "flight" ? <Plane /> : <BedDouble />}
                  showCredit={false}
                  sizes="(min-width: 1024px) 260px, (min-width: 640px) 33vw, 112px"
                  className="aspect-square w-28 shrink-0 sm:aspect-[4/3] sm:w-auto"
                  labelClassName="hidden sm:block"
                />
                <div className="flex min-w-0 flex-1 flex-col gap-1 p-4">
                  <p className="truncate text-xs font-medium text-ink-3">
                    <span className="sm:hidden">{s.to} · </span>
                    {programName(s.program)}
                  </p>
                  <h3 className="line-clamp-2 text-sm leading-snug font-semibold text-navy">
                    <Link href={`/points/sweet-spots#${s.id}`} className="after:absolute after:inset-0 group-hover:text-brand">
                      {s.title}
                    </Link>
                  </h3>
                  <p className="mt-auto pt-1 text-sm font-semibold text-brand">
                    {pointsRange(s)} pts <span className="font-normal whitespace-nowrap text-ink-2">{perLabel[s.per]}</span>
                  </p>
                  {photo && <PhotoCredit photo={photo} tone="plain" className="relative z-10 mt-1" />}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
