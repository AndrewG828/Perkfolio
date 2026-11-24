"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/shared/lib/format";

const TABS = [
  { href: "/points", label: "Overview", exact: true },
  { href: "/points/sweet-spots", label: "Sweet spots" },
  { href: "/points/transfers", label: "Transfer partners", short: "Transfers" },
  { href: "/points/programs", label: "Programs" },
  { href: "/points/airlines", label: "Who can book", short: "Airlines" },
  { href: "/points/booking-rules", label: "Booking rules", short: "Rules" },
];

/**
 * Section tabs along the bottom of the Points & Miles hero. On narrow screens the strip scrolls sideways: it starts
 * scrolled to the current tab, and a fade marks the edge that has more tabs past it.
 */
export function PointsNav() {
  const pathname = usePathname();
  const strip = useRef<HTMLElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  useEffect(() => {
    const el = strip.current;
    if (!el) return;
    const update = () => setEdges({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
    // Bring the current tab into view without moving the page vertically.
    const active = el.querySelector<HTMLElement>('[aria-current="page"]');
    if (active) {
      const { left, right } = active.getBoundingClientRect();
      const box = el.getBoundingClientRect();
      if (left < box.left || right > box.right) el.scrollLeft += right - box.right + 24;
    }
    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [pathname]);

  return (
    <div className="relative">
      <nav ref={strip} aria-label="Points & Miles" className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
        <ul className="flex min-w-max gap-1 border-t border-white/12">
          {TABS.map((t) => {
            const active = t.exact ? pathname === t.href : pathname === t.href || pathname.startsWith(t.href + "/");
            return (
              <li key={t.href}>
                <Link
                  href={t.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative block px-2 py-3.5 text-sm font-semibold whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white sm:px-3",
                    active ? "text-white" : "text-white/70 hover:text-white",
                  )}
                >
                  {t.short ? (
                    <>
                      <span className="sm:hidden">{t.short}</span>
                      <span className="hidden sm:inline">{t.label}</span>
                    </>
                  ) : (
                    t.label
                  )}
                  <span className={cn("absolute inset-x-2 bottom-0 h-[3px] rounded-t bg-white transition-opacity sm:inset-x-3", active ? "opacity-100" : "opacity-0")} />
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <span
        aria-hidden
        className={cn("pointer-events-none absolute inset-y-0 -left-4 w-10 bg-gradient-to-r from-navy to-transparent transition-opacity sm:-left-0", edges.left ? "opacity-100" : "opacity-0")}
      />
      <span
        aria-hidden
        className={cn("pointer-events-none absolute inset-y-0 -right-4 w-10 bg-gradient-to-l from-navy to-transparent transition-opacity sm:-right-0", edges.right ? "opacity-100" : "opacity-0")}
      />
    </div>
  );
}
