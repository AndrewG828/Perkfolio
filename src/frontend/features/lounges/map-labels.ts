/**
 * Label layout for the airport map, in screen pixels: each label tries a few spots around its marker (below, above,
 * right, left) and takes the first that doesn't cover another label, a marker or the map's edge. Labels that can't
 * fit are dropped, except forced ones (the destination and "You"), which take their first choice anyway.
 */

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
  /** Try centred on the point first (zone names, which have no marker). */
  center?: boolean;
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

/** Places labels in priority order (first = most important). `obstacles` are markers labels mustn't cover. */
export function placeLabels(items: LabelItem[], obstacles: (Box & { id?: string })[], width: number, height: number): PlacedLabel[] {
  const placed: PlacedLabel[] = [];
  for (const it of items) {
    if (it.x < -40 || it.y < -40 || it.x > width + 40 || it.y > height + 40) continue;
    const w = textWidth(it.text, it.size, it.weight, it.caps) + 6;
    const h = Math.round(it.size * 1.3);
    const gap = it.r + 3;
    const spots: Box[] = [
      ...(it.center ? [{ left: it.x - w / 2, top: it.y - h / 2, w, h }] : []),
      { left: it.x - w / 2, top: it.y + gap, w, h },
      { left: it.x - w / 2, top: it.y - gap - h, w, h },
      { left: it.x + gap + 1, top: it.y - h / 2, w, h },
      { left: it.x - gap - 1 - w, top: it.y - h / 2, w, h },
    ];
    const inside = (b: Box) => b.left >= 2 && b.top >= 2 && b.left + b.w <= width - 2 && b.top + b.h <= height - 2;
    const free = (b: Box) => inside(b) && !placed.some((p) => overlaps(p, b)) && !obstacles.some((o) => o.id !== it.id && overlaps(o, b, 0));
    const spot = spots.find(free) ?? (it.force ? (spots.find(inside) ?? spots[0]) : undefined);
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
