"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { airports } from "@/shared/data/lounges";
import { loungeCountByAirport } from "@/shared/lib/lounge-directory";
import { cn } from "@/shared/lib/format";

/** Airport search box: type a code or city, pick a result, go to that airport's lounge map. */
export function AirportSearch({ carry = "", size = "md", className }: { carry?: string; size?: "md" | "lg"; className?: string }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return airports
      .filter((a) => loungeCountByAirport[a.code] && `${a.code} ${a.name} ${a.city} ${a.country}`.toLowerCase().includes(q))
      .sort((a, b) => Number(b.code.toLowerCase() === q) - Number(a.code.toLowerCase() === q))
      .slice(0, 8);
  }, [query]);
  const go = (code: string) => router.push(`/lounges/${code}${carry}`);

  return (
    <div className={cn("relative", className)}>
      <label htmlFor="airport-search" className="sr-only">
        Airport
      </label>
      <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-3" />
      <input
        id="airport-search"
        className={cn("input pl-9 text-ink", size === "lg" ? "h-14 text-lg" : "h-12 text-base")}
        placeholder="Airport code or city — e.g. JFK, Denver, London"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && matches[0]) go(matches[0].code);
        }}
        autoComplete="off"
        role="combobox"
        aria-expanded={matches.length > 0}
        aria-controls="airport-results"
      />
      {matches.length > 0 && (
        <ul
          id="airport-results"
          role="listbox"
          className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-md border border-line bg-white text-ink shadow-[var(--shadow-lift)]"
        >
          {matches.map((a) => (
            <li key={a.code} role="option" aria-selected={false}>
              <button onClick={() => go(a.code)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-sky">
                <span className="w-12 font-semibold text-navy">{a.code}</span>
                <span className="flex-1 truncate text-sm">
                  {a.name} <span className="text-ink-3">· {a.city}</span>
                </span>
                <span className="text-xs text-ink-3">{loungeCountByAirport[a.code]} lounges</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
