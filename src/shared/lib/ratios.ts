import type { TransferPartner } from "@/shared/data/points/types";

/**
 * Transfer ratios as every page writes them, with no Points & Miles data attached, so client islands (a card page's
 * ratio pills) don't load the dataset. shared/lib/points.ts re-exports all of it.
 */

/** Partner points per bank point (1:1 → 1, 2:1.5 → 0.75). */
export const ratioOf = (p: Pick<TransferPartner, "from" | "to">) => p.to / p.from;

const trim = (n: number) => String(Math.round(n * 100) / 100);
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

/**
 * The ratio in smallest whole numbers, so equal rates always read the same: "1:1", "5:4" (also for 1:0.8 and
 * 250:200), "4:3" (also for 2:1.5), "5:8" (1:1.6). Rates that don't reduce to small numbers keep one side at 1
 * ("1:0.67").
 */
export function ratioLabel(p: Pick<TransferPartner, "from" | "to">): string {
  return wholeRatio(p, 20) ?? `1:${trim(p.to / p.from)}`;
}

/**
 * An effective rate written like the pills write ratios: exact when it reduces ("5:2"), else the nearest whole-number
 * ratio within 3% with neither side above 20, marked `approx` (an overall rate through a hotel: 106,500 points for
 * 40,500 miles is ≈8:3, as 107,000 for 40,500 is), else as ratioLabel would ("1:0.37").
 */
export function effectiveRatio(from: number, to: number): Pick<TransferPartner, "from" | "to"> & { approx?: boolean } {
  if (wholeRatio({ from, to }, 20) || !(from > 0) || !(to > 0)) return { from, to };
  const r = to / from;
  let best: { from: number; to: number; err: number } | null = null;
  for (let a = 1; a <= 20; a++) {
    for (let b = 1; b <= 20; b++) {
      const err = Math.abs(b / a - r) / r;
      if (err <= 0.03 && (!best || err < best.err - 1e-12)) best = { from: a, to: b, err };
    }
  }
  return best ? { from: best.from, to: best.to, approx: true } : { from, to };
}

/** `from:to` in smallest whole numbers with neither side above `max`, or null when it doesn't reduce that far. */
export function wholeRatio(p: Pick<TransferPartner, "from" | "to">, max: number): string | null {
  for (const scale of [1, 10, 100]) {
    const [a, b] = [p.from * scale, p.to * scale].map((n) => Math.round(n));
    if (Math.abs(a - p.from * scale) > 1e-6 || Math.abs(b - p.to * scale) > 1e-6 || a <= 0 || b <= 0) continue;
    const d = gcd(a, b);
    if (a / d <= max && b / d <= max) return `${a / d}:${b / d}`;
  }
  return null;
}
