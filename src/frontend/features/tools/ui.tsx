import { FlaskConical } from "lucide-react";
import { datasetNotice, type TravelDataset } from "@/shared/data/travel/seed-status";
import { cn } from "@/shared/lib/format";

export { ExternalA, LinkedText, SourceLinks } from "@/frontend/components/source-links";

/**
 * Shown while a page's datasets are seed data or only partly verified (see shared/data/travel/seed-status.ts).
 * Renders nothing once they're all verified.
 */
export function DataNotice({ datasets, className }: { datasets: TravelDataset[]; className?: string }) {
  const { seed, partial } = datasetNotice(datasets);
  if (!seed && partial.length === 0) return null;
  return (
    <div
      role="note"
      className={cn(
        "flex items-start gap-2 rounded-md border border-warn/30 bg-[#fdf4ea] px-3 py-2 text-xs leading-relaxed text-[#7a4106]",
        className,
      )}
    >
      <FlaskConical className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="space-y-1">
        {seed && (
          <span className="block">
            <strong className="font-semibold">Preview data.</strong> Some figures here haven&apos;t been checked against
            official sources yet, so don&apos;t rely on them.
          </span>
        )}
        {partial.map((p) => (
          <span key={p} className="block">
            <strong className="font-semibold">Partly verified.</strong> {p}
          </span>
        ))}
      </span>
    </div>
  );
}
