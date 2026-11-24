import type { ReactNode } from "react";
import { ExternalLink, FlaskConical } from "lucide-react";
import { seedData, type TravelDataset } from "@/shared/data/travel/seed-status";
import { hostOf } from "@/shared/lib/travel-format";
import { cn } from "@/shared/lib/format";

/** A link that opens in a new tab, marked as such for screen readers. */
export function ExternalA({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  if (href.startsWith("/")) {
    return (
      <a href={href} className={cn("link", className)}>
        {children}
      </a>
    );
  }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cn("link inline-flex items-center gap-1", className)}>
      {children}
      <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}

/** Shown while a page's dataset is still seed data (see shared/data/travel/seed-status.ts). */
export function SeedNotice({ datasets, className }: { datasets: TravelDataset[]; className?: string }) {
  if (!datasets.some((d) => seedData[d])) return null;
  return (
    <p
      className={cn(
        "flex items-start gap-2 rounded-md border border-warn/30 bg-[#fdf4ea] px-3 py-2 text-xs leading-relaxed text-[#7a4106]",
        className,
      )}
    >
      <FlaskConical className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>
        <strong className="font-semibold">Preview data.</strong> These figures are placeholders while we verify them
        against official sources, so don&apos;t rely on them yet.
      </span>
    </p>
  );
}

/** Numbered source links ("travel.state.gov", ...). */
export function SourceLinks({ sources, className }: { sources: string[]; className?: string }) {
  const unique = Array.from(new Set(sources.filter(Boolean)));
  if (unique.length === 0) return null;
  return (
    <span className={cn("inline-flex flex-wrap gap-x-2 gap-y-1", className)}>
      {unique.map((s) => (
        <ExternalA key={s} href={s} className="font-medium">
          {hostOf(s)}
        </ExternalA>
      ))}
    </span>
  );
}

/** Section heading used across the tools pages. */
export function SectionTitle({ id, eyebrow, title, children }: { id?: string; eyebrow?: string; title: string; children?: ReactNode }) {
  return (
    <div className="mb-4">
      {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
      <h2 id={id} className="text-lg font-semibold text-navy">
        {title}
      </h2>
      {children && <p className="mt-1 text-sm text-ink-2">{children}</p>}
    </div>
  );
}
