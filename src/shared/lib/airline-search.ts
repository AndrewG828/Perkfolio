import { fold } from "@/shared/lib/airports";

/** Words in many airline names, which say nothing about which airline someone means ("air", "airlines"). */
const GENERIC_WORDS = new Set(["air", "airline", "airlines", "airways", "aviation", "jet", "lines", "the"]);

/**
 * Whether a search means this airline: its exact code ("NK"), or 3 or more letters that start its name or one of its
 * words ("spi", "spirit"). Generic words ("air", "airlines") and fragments from inside a word ("it", "ri") don't
 * count, so they never single out one airline.
 */
export function namesAirline(airline: { name: string; code?: string | null }, query: string): boolean {
  const q = fold(query.trim()).replace(/\s+/g, " ");
  if (!q) return false;
  if (airline.code && airline.code.toLowerCase() === q) return true;
  if (q.length < 3 || GENERIC_WORDS.has(q)) return false;
  const name = fold(airline.name);
  if (name.startsWith(q)) return true;
  return name.split(/[^a-z0-9]+/).some((w) => w.length > 0 && !GENERIC_WORDS.has(w) && w.startsWith(q));
}
