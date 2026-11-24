/**
 * Label layout for the airport map, in screen pixels: each label tries a few spots around its marker (below, above,
 * right, left) and takes the first that doesn't cover another label, a marker, the route or the map's edge.
 * Labels that can't fit are dropped, except forced ones (the destination and "You"), which take their best spot
 * anyway.
 */

export type Spot = "center" | "below" | "above" | "right" | "left";

export interface LabelItem {
  id: string;
  text: string;
  /** Marker position in screen pixels. */
  x: number;
  y: number;
  /** Marker radius in pixels: the label sits just outside it. */
  r: number;
  size: number;
  weight: number;
  /** Uppercase with letter spacing (zone names). */
  caps?: boolean;
  /** Where to try, in order (default below, above, right, left). */
  spots?: Spot[];
  /** Other points the label may go at, after its own (a zone's name elsewhere in the zone). */
  alts?: { x: number; y: number }[];
  /** Always shown (destination, "You"). */
  force?: boolean;
}

export interface Box {
  left: number;
  top: number;
  w: number;
  h: number;
}

export type PlacedLabel = LabelItem & Box;

/** Letter spacing for caps labels, in em. */
export const CAPS_TRACKING = 0.08;

/** Rough rendered width of a string in Inter (good to a few pixels, which the padding absorbs). */
export function textWidth(text: string, size: number, weight: number, caps = false): number {
  let em = 0;
  for (const ch of caps ? text.toUpperCase() : text) {
    if (ch === " ") em += 0.28;
    else if (/[.,:;'·|!]/.test(ch)) em += 0.3;
    else if (/[0-9]/.test(ch)) em += 0.6;
    else if (/[mwMW]/.test(ch)) em += 0.84;
    else if (/[A-Z]/.test(ch)) em += 0.68;
    else if (/[a-z]/.test(ch)) em += /[ijlft]/.test(ch) ? 0.3 : 0.55;
    else em += 0.62;
  }
  const tracking = caps ? CAPS_TRACKING * text.length : 0;
  return (em * (weight >= 700 ? 1.05 : weight >= 600 ? 1.02 : 1) + tracking) * size;
}

const overlaps = (a: Box, b: Box, pad = 2) =>
  a.left < b.left + b.w + pad && b.left < a.left + a.w + pad && a.top < b.top + b.h + pad && b.top < a.top + a.h + pad;

/** Small boxes along a screen-space polyline, so labels keep off the route. */
export function lineBoxes(pts: [number, number][], step = 9, half = 4): Box[] {
  const out: Box[] = [];
  for (let i = 1; i < pts.length; i++) {
    const [a, b] = [pts[i - 1], pts[i]];
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let k = 0; k <= n; k++) {
      const x = a[0] + ((b[0] - a[0]) * k) / n;
      const y = a[1] + ((b[1] - a[1]) * k) / n;
      out.push({ left: x - half, top: y - half, w: 2 * half, h: 2 * half });
    }
  }
  return out;
}

/**
 * Places labels in priority order (first = most important). `obstacles` are markers and the route; an obstacle
 * with the label's own id (its marker) doesn't count.
 */
export function placeLabels(items: LabelItem[], obstacles: (Box & { id?: string })[], width: number, height: number): PlacedLabel[] {
  const placed: PlacedLabel[] = [];
  const inside = (b: Box) => b.left >= 2 && b.top >= 2 && b.left + b.w <= width - 2 && b.top + b.h <= height - 2;
  for (const it of items) {
    if (it.x < -40 || it.y < -40 || it.x > width + 40 || it.y > height + 40) continue;
    const w = textWidth(it.text, it.size, it.weight, it.caps) + 6;
    const h = Math.round(it.size * 1.3);
    const gap = it.r + 3;
    const at = (x: number, y: number, s: Spot): Box =>
      s === "center"
        ? { left: x - w / 2, top: y - h / 2, w, h }
        : s === "below"
          ? { left: x - w / 2, top: y + gap, w, h }
          : s === "above"
            ? { left: x - w / 2, top: y - gap - h, w, h }
            : s === "right"
              ? { left: x + gap + 1, top: y - h / 2, w, h }
              : { left: x - gap - 1 - w, top: y - h / 2, w, h };
    const order = it.spots ?? ["below", "above", "right", "left"];
    const spots = [{ x: it.x, y: it.y }, ...(it.alts ?? [])].flatMap((p) => order.map((s) => at(p.x, p.y, s)));
    const free = (b: Box) => inside(b) && !placed.some((p) => overlaps(p, b)) && !obstacles.some((o) => o.id !== it.id && overlaps(o, b, 0));
    let spot = spots.find(free);
    if (!spot && it.force) {
      // Best effort: the spot that covers the fewest other things.
      const cost = (b: Box) => (inside(b) ? 0 : 1000) + placed.filter((p) => overlaps(p, b)).length * 10 + obstacles.filter((o) => o.id !== it.id && overlaps(o, b, 0)).length;
      spot = spots.reduce((a, b) => (cost(b) < cost(a) ? b : a));
    }
    if (spot) placed.push({ ...it, ...spot });
  }
  return placed;
}

/** A lounge name short enough for a map label: drop "by …"/"(…)" tails, else cut at a word. */
export function shortLoungeName(name: string, max = 28): string {
  if (name.length <= max) return name;
  const trimmed = name.replace(/\s+[–—-]\s+.*$/, "").replace(/\s*\(.*\)\s*$/, "").replace(/\s+(by|with)\s+.*$/i, "").trim();
  if (trimmed.length >= 12 && trimmed.length <= max) return trimmed;
  const cut = name.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max / 2 ? cut.slice(0, space) : cut).trim()}…`;
}

/** A zone name for the map: the concourse when the name has a terminal in front ("Terminal 4, Concourse A"). */
export function shortZoneName(name: string): string {
  const parts = name.split(",");
  return (parts.length > 1 ? parts[parts.length - 1] : name).replace(/[()]/g, "").replace(/\s+/g, " ").trim();
}
