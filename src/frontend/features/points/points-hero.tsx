import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/shared/lib/format";
import { PointsNav } from "./points-nav";

/** Navy hero shared by the Points & Miles pages, with dashed flight paths and the section tabs along the bottom. */
export function PointsHero({
  eyebrow,
  title,
  subtitle,
  back,
  mark,
  aside,
  children,
}: {
  eyebrow: ReactNode;
  title: string;
  subtitle?: ReactNode;
  back?: { href: string; label: string };
  /** Shown left of the title (e.g. a program's monogram). */
  mark?: ReactNode;
  /** Right-hand column on large screens (e.g. the postcard stack). */
  aside?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="relative overflow-hidden bg-navy text-white">
      <div
        className="absolute inset-0"
        style={{ background: "radial-gradient(70% 140% at 90% 0%, #0a5fc2 0%, transparent 60%), radial-gradient(50% 90% at 0% 100%, #0a2472 0%, transparent 70%)" }}
      />
      <FlightPaths />
      <div className="container-page relative">
        <div className={cn("grid gap-10 pt-10 pb-8 md:pt-14 md:pb-10", aside ? "lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-center" : undefined)}>
          <div className="min-w-0">
            {back && (
              <Link href={back.href} className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-white/80 hover:text-white">
                <ChevronLeft className="h-4 w-4" /> {back.label}
              </Link>
            )}
            <p className="flex flex-wrap items-center gap-2 text-xs font-semibold tracking-[0.18em] text-white/70 uppercase">{eyebrow}</p>
            {mark ? (
              <div className="mt-3 flex items-center gap-4">
                {mark}
                <h1 className="min-w-0 text-3xl leading-tight font-semibold tracking-tight md:text-[44px]">{title}</h1>
              </div>
            ) : (
              <h1 className="mt-3 max-w-3xl text-3xl leading-tight font-semibold tracking-tight md:text-[44px]">{title}</h1>
            )}
            {subtitle && <div className="mt-4 max-w-2xl text-lg text-white/80">{subtitle}</div>}
            {children && <div className="mt-7">{children}</div>}
          </div>
          {aside && <div className="hidden min-w-0 lg:block">{aside}</div>}
        </div>
        <PointsNav />
      </div>
    </section>
  );
}

/** Faint dashed arcs behind the hero text. Decorative. */
function FlightPaths() {
  return (
    <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1200 400" preserveAspectRatio="xMidYMid slice">
      <g fill="none" stroke="#fff" strokeLinecap="round" strokeDasharray="2 10" strokeWidth="2">
        <path d="M-40 360 C 240 120, 620 60, 1240 140" strokeOpacity="0.12" />
        <path d="M120 420 C 420 200, 860 180, 1260 300" strokeOpacity="0.08" />
        <path d="M600 -20 C 760 120, 980 160, 1260 60" strokeOpacity="0.1" />
      </g>
      <g fill="#fff">
        <circle cx="1080" cy="122" r="3" fillOpacity="0.35" />
        <circle cx="760" cy="96" r="2.5" fillOpacity="0.25" />
        <circle cx="300" cy="230" r="2.5" fillOpacity="0.2" />
      </g>
    </svg>
  );
}
