import type { Card } from "@/data/types";
import { loungeNetworks } from "@/data/networks";
import { rateLabel } from "@/data/cards";
import { periodFor, type Period } from "./periods";

/** A spending cap or a visit allowance the user can count against. */
export interface Limit {
  /** Unique within the card; used in storage keys. */
  id: string;
  kind: "spend" | "visits";
  label: string;
  /** Dollars (spend) or count (visits). */
  limit: number;
  period: "year" | "quarter" | "month" | "medallion-year";
  /** What happens at the limit, e.g. "then 1x". */
  after?: string;
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);

/** "Up to $25,000 per calendar year, then 1x" → { limit: 25000, period: "year", after: "then 1x" } */
export function parseCap(text: string): Pick<Limit, "limit" | "period" | "after"> | null {
  const m = text.match(/\$([\d,.]+)\s*(million|M\b)?/i);
  if (!m) return null;
  const limit = Number(m[1].replace(/,/g, "")) * (m[2] ? 1_000_000 : 1);
  if (!limit || limit >= 1_000_000) return null; // caps this high aren't worth tracking
  let period: Limit["period"] | null = null;
  if (/per\s+(calendar\s+)?year|each\s+(calendar\s+)?year|anniversary\s+year/i.test(text)) period = "year";
  else if (/per\s+quarter/i.test(text)) period = "quarter";
  else if (/billing\s+cycle|per\s+month/i.test(text)) period = "month";
  if (!period) return null;
  const after = text.match(/then\s+[\d.]+(?:x|%)/i)?.[0];
  return { limit, period, after };
}

export function limitsFor(card: Card): Limit[] {
  const out: Limit[] = [];
  for (const r of card.earnRates) {
    if (!r.cap) continue;
    const cap = parseCap(r.cap);
    if (!cap) continue;
    const short = r.category.replace(/\s*\(.*?\)\s*/g, " ").trim();
    out.push({ id: `cap-${slug(short)}`, kind: "spend", label: `${rateLabel(card, r.multiplier)} ${short}`, ...cap });
  }
  for (const a of card.loungeAccess) {
    const re = /(\d+)\s+(One-Time\s+Guest\s+Passes|guest\s+passes|passes|visits)\s+per\s+(Medallion\s+Year|calendar\s+year|year)/gi;
    for (const m of a.terms.matchAll(re)) {
      const passes = /pass/i.test(m[2]);
      const net = loungeNetworks[a.network].label;
      out.push({
        id: `visits-${a.network}-${passes ? "guest" : "member"}`,
        kind: "visits",
        label: passes ? `${net} guest passes` : `${net} visits`,
        limit: Number(m[1]),
        period: /medallion/i.test(m[3]) ? "medallion-year" : "year",
      });
    }
  }
  return out;
}

/** Delta's Medallion Year runs Feb 1 – Jan 31. */
export function limitPeriod(limit: Limit, now: Date = new Date()): Period {
  if (limit.period === "medallion-year") {
    const y = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
    return { key: `my-${y}`, label: `Feb ${y} – Jan ${y + 1}`, start: new Date(y, 1, 1), end: new Date(y + 1, 1, 1) };
  }
  if (limit.period === "year") return periodFor("annual", now);
  if (limit.period === "quarter") return periodFor("quarterly", now);
  return periodFor("monthly", now);
}

export const tallyKey = (cardId: string, limitId: string, periodKey: string) => `${cardId}:${limitId}:${periodKey}`;
