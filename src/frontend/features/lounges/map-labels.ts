/**
 * Label layout for the airport map, in screen pixels: each label tries a few spots around its marker (below, above,
 * right, left) and takes the first that doesn't cover another label, a marker, the route or the map's edge.
 * Labels that can't fit are dropped, except forced ones (the destination and "You"), which try spots further out
 * (drawn with a leader line back to the marker) and, failing those, take the spot that covers least.
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
  /** Other points the label may go at, after its own (a zone's name elsewhere in the zone), with their own radius. */
  alts?: { x: number; y: number; r?: number }[];
  /** Always shown (destination, "You"). */
  force?: boolean;
  /** Obstacles whose id starts with one of these the label may cover (zone names over gate dots). */
  over?: string[];
  /** More it may cover when there's no room otherwise (the destination's zone name over the route). */
  overIfNeeded?: string[];
}

export interface Box {
  left: number;
  top: number;
  w: number;
  h: number;
}

/** A placed label; `leader` when it sits away from its marker and needs a line back to it. */
export type PlacedLabel = LabelItem & Box & { leader?: boolean };

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

/** Distance from p to the segment a–b (screen pixels). */
export function segmentDistance(p: [number, number], a: [number, number], b: [number, number]): number {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

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

/** Directions for a forced label's spots further out: below, above, right, left, then the diagonals. */
const FAR = [90, -90, 0, 180, 45, 135, -45, -135].map((deg) => [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)]);

/**
 * Places labels in priority order (first = most important). `obstacles` are markers and the route; an obstacle
 * with the label's own id (its marker) doesn't count. A point more than 40 px off screen isn't a candidate, but the
 * label can still go at another of its points (a zone's name where the zone is on screen).
 */
export function placeLabels(items: LabelItem[], obstacles: (Box & { id?: string })[], width: number, height: number): PlacedLabel[] {
  const placed: PlacedLabel[] = [];
  const inside = (b: Box) => b.left >= 2 && b.top >= 2 && b.left + b.w <= width - 2 && b.top + b.h <= height - 2;
  const onScreen = (p: { x: number; y: number }) => p.x >= -40 && p.y >= -40 && p.x <= width + 40 && p.y <= height + 40;
  for (const it of items) {
    const points = [{ x: it.x, y: it.y, r: it.r }, ...(it.alts ?? [])].filter(onScreen);
    if (!points.length) continue;
    const w = textWidth(it.text, it.size, it.weight, it.caps) + 6;
    const h = Math.round(it.size * 1.3);
    const gap = it.r + 3;
    const at = (x: number, y: number, s: Spot, r = it.r): Box => {
      const gap = r + 3;
      return s === "center"
        ? { left: x - w / 2, top: y - h / 2, w, h }
        : s === "below"
          ? { left: x - w / 2, top: y + gap, w, h }
          : s === "above"
            ? { left: x - w / 2, top: y - gap - h, w, h }
            : s === "right"
              ? { left: x + gap + 1, top: y - h / 2, w, h }
              : { left: x - gap - 1 - w, top: y - h / 2, w, h };
    };
    const order = it.spots ?? ["below", "above", "right", "left"];
    const spots = points.flatMap((p) => order.map((s) => at(p.x, p.y, s, p.r ?? it.r)));
    let over = it.over ?? [];
    const blocks = (o: Box & { id?: string }) => o.id !== it.id && !over.some((prefix) => o.id?.startsWith(prefix));
    const free = (b: Box) => inside(b) && !placed.some((p) => overlaps(p, b)) && !obstacles.some((o) => blocks(o) && overlaps(o, b, 0));
    let spot = spots.find(free);
    if (!spot && it.overIfNeeded) {
      over = [...over, ...it.overIfNeeded];
      spot = spots.find(free);
    }
    let leader = false;
    if (!spot && it.force) {
      // Further out, with a leader line back to the marker.
      const far = [16, 34, 52].flatMap((extra) =>
        FAR.map(([c, s]) => {
          const [px, py] = [it.x + c * (gap + extra), it.y + s * (gap + extra)];
          return { left: c > 0.3 ? px : c < -0.3 ? px - w : px - w / 2, top: s > 0.3 ? py : s < -0.3 ? py - h : py - h / 2, w, h };
        }),
      );
      spot = far.find(free);
      leader = Boolean(spot);
      if (!spot) {
        // Best effort: the spot that covers the fewest other things, above all other labels and pins.
        const weight = (o: Box & { id?: string }) => (o.id?.startsWith("pin:") || o.id === "you" ? 10 : 1);
        const cost = (b: Box) =>
          (inside(b) ? 0 : 1000) +
          placed.filter((p) => overlaps(p, b)).length * 10 +
          obstacles.filter((o) => blocks(o) && overlaps(o, b, 0)).reduce((s, o) => s + weight(o), 0);
        spot = [...spots, ...far].reduce((a, b) => (cost(b) < cost(a) ? b : a));
        leader = !spots.includes(spot);
      }
    }
    if (spot) placed.push({ ...it, ...spot, leader });
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

/**
 * A zone name for the map: the concourse when the name has a terminal in front ("Terminal 4, Concourse A"), and
 * "Intl" for "International" ("Tom Bradley Intl", without "Terminal" when that's long).
 */
export function shortZoneName(name: string): string {
  const parts = name.split(",");
  const short = (parts.length > 1 ? parts[parts.length - 1] : name)
    .replace(/[()]/g, "")
    .replace(/\bInternational\b/g, "Intl")
    .replace(/\s+/g, " ")
    .trim();
  return short.length > 18 && /\bIntl Terminal$/.test(short) ? short.replace(/ Terminal$/, "") : short;
}
