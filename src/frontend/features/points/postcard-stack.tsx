import { BedDouble, Plane } from "lucide-react";
import { regionPhoto, sweetSpots, type Region } from "@/shared/data/points";
import { PhotoFrame } from "@/frontend/components/photo-frame";

/**
 * Three overlapping destination "postcards" for the hub hero: the first distinct regions in the sweet spot list.
 * Photos keep their credit line; without photos each card shows its region on a gradient.
 */
export function PostcardStack() {
  const seen = new Set<Region>();
  const picks = [...sweetSpots.filter((s) => s.to !== "United States"), ...sweetSpots]
    .filter((s) => (seen.has(s.to) ? false : (seen.add(s.to), true)))
    .slice(0, 3);
  // A fan, each card a little in front of the one to its left, so every label (bottom left) stays visible.
  const layout = [
    { left: "0%", top: "12%", rotate: -6 },
    { left: "29%", top: "2%", rotate: 1.5 },
    { left: "57%", top: "16%", rotate: 7 },
  ];

  return (
    <div className="relative mx-auto aspect-[3/2] w-full max-w-[540px]">
      {picks.map((s, i) => (
        <div
          key={s.id}
          className="absolute w-[43%] rounded-xl bg-white p-1.5 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.65)]"
          style={{ left: layout[i].left, top: layout[i].top, transform: `rotate(${layout[i].rotate}deg)`, zIndex: i + 1 }}
        >
          <PhotoFrame
            photo={regionPhoto(s.to)}
            region={s.to}
            label={s.to}
            sublabel={s.destinations[0]}
            icon={s.kind === "flight" ? <Plane /> : <BedDouble />}
            sizes="240px"
            className="aspect-[4/5] rounded-lg"
          />
        </div>
      ))}
    </div>
  );
}
