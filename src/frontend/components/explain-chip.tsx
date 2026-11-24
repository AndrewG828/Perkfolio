"use client";

import { useId, useState, type ReactNode } from "react";
import { cn } from "@/shared/lib/format";

/**
 * A chip that explains itself. Hovering shows the explanation as a tooltip; a tap or click shows it as a line of
 * text underneath, since touch screens have no hover. Place it in a `flex flex-wrap` row: the explanation takes
 * the row's full width. The hit area reaches past the chip's edges so it's easy to tap.
 */
export function ExplainChip({ children, text, className }: { children: ReactNode; text: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <>
      <button
        type="button"
        className={cn(
          "relative inline-flex cursor-help items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap",
          "after:absolute after:-inset-x-1 after:-inset-y-2.5 after:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
          className,
        )}
        title={text}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
      >
        {children}
      </button>
      <span id={id} hidden={!open} className="block basis-full text-xs leading-relaxed font-normal text-ink-2">
        {text}
      </span>
    </>
  );
}
