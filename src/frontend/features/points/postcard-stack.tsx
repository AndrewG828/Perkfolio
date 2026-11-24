import { BedDouble, Plane } from "lucide-react";
import { sweetSpotPhoto, sweetSpots, type Region } from "@/shared/data/points";
import { PhotoFrame } from "@/frontend/components/photo-frame";

/**
 * Three overlapping destination "postcards" for the hub hero: the first distinct regions in the sweet spot list,
 * regions with a photo first (then the rest, the United States last). Photos keep their credit line; without one a
 * card shows its region on a gradient.
 */
export function PostcardStack() {
  const seen = new Set<Region>();
  const photo = (s: (typeof sweetSpots)[number]) => Boolean(sweetSpotPhoto(s));
  const abroad = (s: (typeof sweetSpots)[number]) => s.to !== "United States";
  const picks = [
    ...sweetSpots.filter((s) => photo(s) && abroad(s)),
    ...sweetSpots.filter((s) => photo(s)),
    ...sweetSpots.filter(abroad),
    ...sweetSpots,
  ]
    .filter((s) => (seen.has(s.to) ? false : (seen.add(s.to), true)))
    .slice(0, 3);
  // A fan, each card a little in front of the one to its left, so every label (bottom left) stays visible.
  const layout = [
    { left: "0%", top: "12%", rotate: -6 },
    { left: "29%", top: "2%", rotate: 1.5 },
    { left: "57%", top: "16%", rotate: 7 },
  ];

  // The cards overlap, so their credits go in one line under the stack, where none is covered.
  const credits = picks.map((s) => sweetSpotPhoto(s)).filter((p) => p !== undefined);
  return (
    <figure className="mx-auto w-full max-w-[540px]">
      <div className="relative aspect-[3/2] w-full">
        {picks.map((s, i) => (
          <div
            key={s.id}
            className="absolute w-[43%] rounded-xl bg-white p-1.5 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.65)]"
            style={{ left: layout[i].left, top: layout[i].top, transform: `rotate(${layout[i].rotate}deg)`, zIndex: i + 1 }}
          >
            <PhotoFrame
              photo={sweetSpotPhoto(s)}
              region={s.to}
              label={s.to}
              sublabel={s.destinations[0]}
              icon={s.kind === "flight" ? <Plane /> : <BedDouble />}
              sizes="240px"
              showCredit={false}
              className="aspect-[4/5] rounded-lg"
            />
          </div>
        ))}
      </div>
      {credits.length > 0 && (
        <figcaption className="mt-2 text-right text-[11px] leading-snug text-white/70">
          Photos:{" "}
          {credits.map((p, i) => (
            <span key={p.src}>
              {i > 0 && ", "}
              <a href={p.sourcePage} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:text-white hover:underline">
                {p.author} ({p.license})
              </a>
            </span>
          ))}
        </figcaption>
      )}
    </figure>
  );
}
