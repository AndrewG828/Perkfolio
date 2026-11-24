import Image from "next/image";
import type { ReactNode } from "react";
import type { Photo, Region } from "@/shared/data/points/types";
import { cn } from "@/shared/lib/format";

/** Gradient pairs for the no-photo fallback, one per region so a grid of cards still reads as different places. */
const REGION_TONES: Record<Region, [string, string]> = {
  "United States": ["#0a2472", "#1f6fd1"],
  Canada: ["#0b3550", "#2b86b5"],
  "Mexico & Central America": ["#0c4a4d", "#1f9e8a"],
  Caribbean: ["#05506b", "#18b3c4"],
  "South America": ["#163f2f", "#3a8f5c"],
  Hawaii: ["#0b4566", "#e0874a"],
  Europe: ["#00175a", "#4a63d8"],
  "Middle East": ["#4a300f", "#c28a3a"],
  Africa: ["#4d260d", "#cf7a2e"],
  "South Asia": ["#5c1a33", "#d4555a"],
  "Indian Ocean": ["#023f57", "#14a6b8"],
  "Southeast Asia": ["#123f31", "#2aa776"],
  "East Asia": ["#3f0d2a", "#bd2f6c"],
  Japan: ["#2f0a1c", "#cf3f4c"],
  "Australia & New Zealand": ["#0a3354", "#d9772f"],
  "South Pacific": ["#03445c", "#22b8cc"],
};

const DEFAULT_TONE: [string, string] = ["#00175a", "#006fcf"];

export function regionTone(region?: Region): [string, string] {
  return (region && REGION_TONES[region]) || DEFAULT_TONE;
}

/** "Photo: Jane Doe · CC BY-SA 4.0", linking to where the photo came from. */
export function PhotoCredit({ photo, tone = "overlay", className }: { photo: Photo; tone?: "overlay" | "plain"; className?: string }) {
  return (
    <a
      href={photo.sourcePage}
      target="_blank"
      rel="noopener noreferrer"
      title={`${photo.title}. Photo: ${photo.author}, ${photo.license}`}
      className={cn(
        "block max-w-full rounded-sm text-[10px] leading-tight font-medium underline-offset-2 hover:underline focus-visible:outline-2",
        tone === "overlay"
          ? "truncate text-white/90 hover:text-white focus-visible:outline-white"
          : "break-words text-ink-3 hover:text-ink-2 focus-visible:outline-brand",
        className,
      )}
    >
      Photo: {photo.author} · {photo.license}
    </a>
  );
}

/**
 * A credited photo, or (when there isn't one yet) a gradient with a flight-path pattern and a label. Give it a size
 * with `className` (e.g. "aspect-[16/9]"). The credit sits on the image, bottom right.
 */
export function PhotoFrame({
  photo,
  region,
  label,
  sublabel,
  icon,
  sizes = "(min-width: 1024px) 400px, (min-width: 640px) 50vw, 100vw",
  preload = false,
  showCredit = true,
  className,
  labelClassName,
  children,
}: {
  photo?: Photo;
  /** Picks the fallback colors. */
  region?: Region;
  /** Fallback title, e.g. the region name. */
  label?: string;
  sublabel?: string;
  /** Fallback glyph, drawn at the end of the flight path. */
  icon?: ReactNode;
  sizes?: string;
  preload?: boolean;
  showCredit?: boolean;
  className?: string;
  /** Classes for the fallback label block (e.g. hide it where the frame is small). */
  labelClassName?: string;
  /** Overlays (badges) placed over the image or fallback. */
  children?: ReactNode;
}) {
  const [from, to] = regionTone(region);
  return (
    <div className={cn("relative isolate overflow-hidden bg-navy", className)}>
      {photo ? (
        <>
          <Image src={photo.src} alt={photo.alt} fill sizes={sizes} preload={preload} className="-z-10 object-cover" />
          {showCredit && (
            <div className="absolute inset-x-0 bottom-0 flex justify-end bg-gradient-to-t from-black/55 to-transparent px-2.5 pt-6 pb-1.5">
              <PhotoCredit photo={photo} />
            </div>
          )}
        </>
      ) : (
        <>
          <div className="absolute inset-0 -z-10" style={{ background: `linear-gradient(135deg, ${from} 0%, ${to} 100%)` }} />
          <FlightPattern />
          {icon && (
            <span aria-hidden className="absolute top-[18%] right-[13%] text-white/85 [&_svg]:h-6 [&_svg]:w-6">
              {icon}
            </span>
          )}
          {(label || sublabel) && (
            <div className={cn("absolute inset-x-0 bottom-0 p-4", labelClassName)}>
              {label && <p className="text-lg leading-tight font-semibold tracking-tight text-white drop-shadow-sm">{label}</p>}
              {sublabel && <p className="mt-0.5 line-clamp-1 text-sm text-white/80">{sublabel}</p>}
            </div>
          )}
        </>
      )}
      {children}
    </div>
  );
}

/**
 * Dot grid, ripple rings (like the card art) and a dashed great-circle arc. Decorative. No SVG ids (pattern/gradient
 * defs), since many frames share a page and a hidden copy would break the references.
 */
function FlightPattern() {
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{ backgroundImage: "radial-gradient(rgba(255,255,255,0.15) 1px, transparent 1.3px)", backgroundSize: "14px 14px" }}
      />
      <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 400 225" preserveAspectRatio="xMidYMid slice">
        <g fill="none" stroke="#fff" strokeOpacity="0.1" strokeWidth="1.5">
          <circle cx="352" cy="44" r="58" />
          <circle cx="352" cy="44" r="96" />
          <circle cx="352" cy="44" r="134" />
        </g>
        <path
          d="M30 118 C 110 52, 240 30, 336 60"
          fill="none"
          stroke="#fff"
          strokeOpacity="0.45"
          strokeWidth="2"
          strokeDasharray="5 7"
          strokeLinecap="round"
        />
        <circle cx="30" cy="118" r="4.5" fill="#fff" fillOpacity="0.85" />
        <circle cx="30" cy="118" r="10" fill="none" stroke="#fff" strokeOpacity="0.35" />
      </svg>
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent from-50% to-black/30" />
    </>
  );
}
