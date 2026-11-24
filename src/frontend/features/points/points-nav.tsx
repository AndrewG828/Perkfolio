"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/shared/lib/format";

const TABS = [
  { href: "/points", label: "Overview", exact: true },
  { href: "/points/sweet-spots", label: "Sweet spots" },
  { href: "/points/transfers", label: "Transfer partners", short: "Transfers" },
  { href: "/points/programs", label: "Programs" },
];

/** Section tabs along the bottom of the Points & Miles hero. */
export function PointsNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Points & Miles" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
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
                <span className={cn("absolute inset-x-2 bottom-0 sm:inset-x-3 h-[3px] rounded-t bg-white transition-opacity", active ? "opacity-100" : "opacity-0")} />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
