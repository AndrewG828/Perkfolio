"use client";

import Link from "next/link";
import { useCompare, compareActions, MAX_COMPARE } from "@/frontend/state/compare-store";
import { cn } from "@/shared/lib/format";

export function CompareToggle({ cardId }: { cardId: string }) {
  const ids = useCompare();
  const selected = ids.includes(cardId);
  const full = !selected && ids.length >= MAX_COMPARE;
  return (
    <label className={cn("ml-auto flex cursor-pointer items-center gap-2 text-sm font-medium select-none", full ? "text-ink-3" : "text-ink-2")}>
      <input
        type="checkbox"
        className="h-4 w-4 accent-[var(--color-brand)]"
        checked={selected}
        disabled={full}
        onChange={() => compareActions.toggle(cardId)}
      />
      Compare
    </label>
  );
}

export function CompareTray() {
  const ids = useCompare();
  if (ids.length === 0) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 shadow-[0_-8px_30px_rgba(0,23,90,0.12)] backdrop-blur">
      <div className="container-page flex items-center justify-between gap-4 py-3">
        <p className="text-sm text-ink-2">
          <span className="font-semibold text-navy">{ids.length}</span> of {MAX_COMPARE} cards selected to compare
        </p>
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={() => compareActions.clear()}>Clear</button>
          <Link href={`/compare?cards=${ids.join(",")}`} className={cn("btn-primary", ids.length < 2 && "pointer-events-none opacity-50")}>
            Compare now
          </Link>
        </div>
      </div>
    </div>
  );
}
