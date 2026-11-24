import type { Photo } from "@/shared/data/points/types";
import { PhotoAttribution, PhotoFrame } from "@/frontend/components/photo-frame";

/** An airport's photo in the header of its lounge page, with the full credit underneath. */
export function AirportPhoto({ photo }: { photo: Photo }) {
  return (
    <figure className="min-w-0">
      <PhotoFrame
        photo={photo}
        showCredit={false}
        preload
        sizes="(min-width: 1024px) 400px, calc(100vw - 32px)"
        className="aspect-[5/2] rounded-lg shadow-[0_24px_50px_-24px_rgba(0,0,0,0.85)] ring-1 ring-white/15 sm:aspect-[3/1] lg:aspect-[16/9]"
      />
      <figcaption className="mt-2">
        <PhotoAttribution photo={photo} tone="inverse" />
      </figcaption>
    </figure>
  );
}
