import { cn } from "@/shared/lib/format";

export type MeterTone = "brand" | "success" | "warn";

const TONES: Record<MeterTone, { fill: string; track: string }> = {
  // Track is a lighter step of the fill's own hue, so the state reads across the whole bar.
  brand: { fill: "bg-brand", track: "bg-[#dbe9f8]" },
  success: { fill: "bg-success", track: "bg-[#d3ece4]" },
  warn: { fill: "bg-warn", track: "bg-[#f5e3cf]" },
};

/**
 * A single ratio against a limit (e.g. $15 of $25 used). Pair it with a visible figure —
 * the bar never carries meaning by color alone.
 */
export function Meter({
  value,
  max,
  tone,
  marker,
  size = "md",
  label,
  className,
}: {
  value: number;
  max: number;
  /** Defaults to success when full, brand otherwise. */
  tone?: MeterTone;
  /** Optional tick on the track, e.g. the break-even point. */
  marker?: { value: number; label: string };
  size?: "sm" | "md" | "lg";
  /** Accessible name, e.g. "Uber Cash used this month". */
  label: string;
  className?: string;
}) {
  const safeMax = max > 0 ? max : 1;
  const pct = Math.max(0, Math.min(100, (value / safeMax) * 100));
  const t = TONES[tone ?? (value >= max && max > 0 ? "success" : "brand")];
  const h = { sm: "h-1", md: "h-2", lg: "h-3" }[size];
  const markerPct = marker ? Math.max(0, Math.min(100, (marker.value / safeMax) * 100)) : null;

  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(value, max)}
      title={`${label}: ${Math.round(pct)}%${marker ? ` · ${marker.label}` : ""}`}
      className={cn("relative w-full", className)}
    >
      <div className={cn("w-full overflow-hidden rounded-full", h, t.track)}>
        <div
          className={cn("h-full rounded-full transition-[width] duration-500 ease-out", t.fill)}
          style={{ width: `${pct}%`, minWidth: value > 0 ? "4px" : 0 }}
        />
      </div>
      {markerPct !== null && (
        <span
          aria-hidden
          className="absolute top-1/2 w-[2px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-navy ring-2 ring-white"
          style={{ left: `${markerPct}%`, height: size === "lg" ? 20 : 14 }}
        />
      )}
    </div>
  );
}
