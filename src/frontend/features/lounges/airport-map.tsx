"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Locate, MapPinOff, Minus, Plus } from "lucide-react";
import type { Lounge } from "@/shared/data/types";
import type { AirportNav } from "@/shared/data/airport-nav";
import { PREBUILT_AIRPORT_MAPS } from "@/shared/data/airport-map-files";
import { loungeNetworks } from "@/shared/data/networks";
import type { LoungeAccessGrant } from "@/shared/lib/lounge-access";
import { zoneForLounge, type Origin, type Route } from "@/shared/lib/wayfinding";
import { build, overpassQuery } from "@/shared/lib/osm-airport";
import {
  bounds,
  isMapPrepared,
  loungePoint,
  prepareMapStep,
  routeGeometry,
  zoneMarkers,
  type AirportMapData,
  type Pt,
  type SegmentMode,
} from "@/shared/lib/airport-map";
import { terminalRings } from "@/shared/lib/walkable";
import { cn } from "@/shared/lib/format";
import { CAPS_TRACKING, lineBoxes, placeLabels, segmentDistance, shortLoungeName, shortZoneName, type Box, type LabelItem } from "./map-labels";

type View = { x: number; y: number; w: number; h: number };

const cache = new Map<string, Promise<AirportMapData | null>>();
const LOCAL_KEY = (code: string) => `perkfolio:airport-map:v1:${code}`;

/** Builds the map in the browser from OpenStreetMap when there's no pre-built file for this airport. */
async function buildFromOsm(code: string): Promise<AirportMapData | null> {
  try {
    const saved = window.localStorage.getItem(LOCAL_KEY(code));
    if (saved) return JSON.parse(saved) as AirportMapData;
  } catch {}
  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    body: new URLSearchParams({ data: overpassQuery(code) }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) return null;
  const data = build(code, await res.json());
  if (data.gates.length === 0 && data.terminals.length === 0) return null;
  try {
    window.localStorage.setItem(LOCAL_KEY(code), JSON.stringify(data));
  } catch {}
  return data;
}

function loadMap(code: string) {
  if (!cache.has(code)) {
    cache.set(
      code,
      (PREBUILT_AIRPORT_MAPS.includes(code)
        ? fetch(`/airport-maps/${code}.json`).then((r) => (r.ok ? (r.json() as Promise<AirportMapData>) : buildFromOsm(code)))
        : buildFromOsm(code)
      ).catch(() => null),
    );
  }
  return cache.get(code)!;
}

/**
 * Runs `fn` when the browser is idle (or soon, where there's no requestIdleCallback), passing how many milliseconds
 * it may take before it should yield; returns a cancel function.
 */
function whenIdle(fn: (budget: () => number) => void): () => void {
  const w = window as Window & {
    requestIdleCallback?: (cb: (deadline: { timeRemaining: () => number }) => void, opts?: { timeout: number }) => number;
    cancelIdleCallback?: (id: number) => void;
  };
  if (w.requestIdleCallback && w.cancelIdleCallback) {
    const id = w.requestIdleCallback((deadline) => fn(() => Math.min(deadline.timeRemaining(), 12)), { timeout: 250 });
    return () => w.cancelIdleCallback!(id);
  }
  const id = window.setTimeout(() => {
    const t0 = performance.now();
    fn(() => 12 - (performance.now() - t0));
  }, 16);
  return () => window.clearTimeout(id);
}

const MAP_BG = "#e3e8ee";
const BUILDING = "#fdfcf8";
const ROUTE = "var(--color-brand)";
const SEGMENT_STYLE: Record<SegmentMode, { dash?: (w: number) => string; color: string }> = {
  walk: { color: ROUTE },
  train: { color: ROUTE, dash: (w) => `${2 * w} ${1.4 * w}` },
  bus: { color: ROUTE, dash: (w) => `${2 * w} ${1.4 * w}` },
  landside: { color: "var(--color-warn)", dash: (w) => `0.1 ${1.7 * w}` },
  // A walk the map has no building for (a tunnel or bridge): a dotted line in the route's color.
  connector: { color: ROUTE, dash: (w) => `0.1 ${1.6 * w}` },
  // A walk over a gap between buildings the map draws apart: dotted too.
  seam: { color: ROUTE, dash: (w) => `0.1 ${1.6 * w}` },
};
/** The zoom buttons' corner (px), kept clear of the route and labels. */
const CONTROLS = { w: 52, h: 124 };
/** How far in from the map's edges (px) the You marker and the lounge sit when fitted, so their labels fit too. */
const EDGE = { x: 24, y: 44 };
const isRide = (m: SegmentMode) => m === "train" || m === "bus" || m === "landside";

/** A view around the points: short routes zoom in further, so a 40 m walk is still visible. */
function fit(pts: Pt[], aspect: number): View | null {
  const b = bounds(pts);
  if (!b) return null;
  const ext = Math.max(b.maxX - b.minX, b.maxY - b.minY);
  const pad = Math.min(160, Math.max(60, ext * 0.3));
  let w = Math.max(b.maxX - b.minX, 160) + pad * 2;
  let h = Math.max(b.maxY - b.minY, 160) + pad * 2;
  if (w / h < aspect) w = h * aspect;
  else h = w / aspect;
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

/** The view grown (keeping its aspect) so the points are at least `margin` px in from its edges, `width` px wide. */
function clearOfEdges(v: View, pts: Pt[], margin: { x: number; y: number }, width: number): View {
  let out = v;
  // Twice: growing the view shrinks the scale, so the margin in meters grows a little.
  for (let pass = 0; pass < 2 && pts.length; pass++) {
    const s = width / out.w;
    const [mx, my] = [margin.x / s, margin.y / s];
    const minX = Math.min(out.x, ...pts.map((p) => p[0] - mx));
    const maxX = Math.max(out.x + out.w, ...pts.map((p) => p[0] + mx));
    const minY = Math.min(out.y, ...pts.map((p) => p[1] - my));
    const maxY = Math.max(out.y + out.h, ...pts.map((p) => p[1] + my));
    let [w, h] = [maxX - minX, maxY - minY];
    if (w / h < v.w / v.h) w = (h * v.w) / v.h;
    else h = (w * v.h) / v.w;
    out = { x: (minX + maxX) / 2 - w / 2, y: (minY + maxY) / 2 - h / 2, w, h };
  }
  return out;
}

/** Points every `spacing` meters along a polyline, with the direction of travel there (for arrows). */
function along(pts: Pt[], spacing: number): { p: Pt; deg: number }[] {
  const out: { p: Pt; deg: number }[] = [];
  let next = spacing * 0.6;
  let done = 0;
  for (let i = 1; i < pts.length; i++) {
    const [a, b] = [pts[i - 1], pts[i]];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    while (next <= done + len) {
      const t = (next - done) / len;
      out.push({ p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], deg: (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI });
      next += spacing;
    }
    done += len;
  }
  // Leave the last stretch before the destination clear.
  return out.filter(({ p }) => Math.hypot(p[0] - pts[pts.length - 1][0], p[1] - pts[pts.length - 1][1]) > spacing * 0.4);
}

/**
 * Indoor-style airport map (terminal outlines, runways and gates from OpenStreetMap) with lounge pins and the
 * current route drawn on top, inside the buildings. Pan by dragging, zoom with the wheel, pinch or the buttons; pins
 * pick a destination.
 */
export function AirportMap({
  code,
  nav,
  lounges,
  grants,
  closed = () => false,
  checking,
  origin,
  route,
  target,
  onPick,
}: {
  code: string;
  nav: AirportNav;
  lounges: Lounge[];
  grants: Map<string, LoungeAccessGrant[]>;
  /** Lounges closed for now: drawn as hollow, dashed pins. */
  closed?: (l: Lounge) => boolean;
  checking: boolean;
  origin: Origin | null;
  route: Route | null;
  target: Lounge | null;
  onPick: (l: Lounge) => void;
}) {
  const [data, setData] = useState<AirportMapData | null | undefined>(undefined);
  /** The map whose zones and pins are worked out (once per airport, after it loads, outside a render). */
  const [prepared, setPrepared] = useState<AirportMapData | null>(null);
  /** A pan/zoom the user made, remembered for the route it was made on. */
  const [manual, setManual] = useState<{ key: string; view: View } | null>(null);
  const [size, setSize] = useState({ w: 800, h: 420 });
  const box = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ pointers: Map<number, { x: number; y: number }>; start?: View; dist?: number } | null>(null);

  useEffect(() => {
    let alive = true;
    loadMap(code).then((d) => alive && setData(d));
    return () => {
      alive = false;
    };
  }, [code]);

  // The walkable grid, zones, pins and crossings take ~150–350 ms to work out the first time: do it in pieces of a
  // few milliseconds when the browser is idle, not in a render. Later visits to the same airport find it cached.
  const ready = Boolean(data && (prepared === data || isMapPrepared(data, nav)));
  useEffect(() => {
    if (!data || isMapPrepared(data, nav)) return;
    let cancel = () => {};
    // A few pieces per idle period, while it has time to spare (each piece takes a few milliseconds).
    const step = (budget: () => number) => {
      do {
        if (prepareMapStep(data, nav)) return setPrepared(data);
      } while (budget() > 4);
      cancel = whenIdle(step);
    };
    cancel = whenIdle(step);
    return () => cancel();
  }, [data, nav]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    // A box measured while hidden or collapsed reads 0 wide or tall: keep the last real size (no Infinity scales).
    const ro = new ResizeObserver(([e]) => e.contentRect.width > 0 && e.contentRect.height > 0 && setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [data, ready]);

  // The route's geometry (a search on the walkable grid), redone only when the route itself changes: keyed on what it
  // is, since the page builds new origin and route objects on every render (typing, wallet sync, filters).
  const originKey = origin ? JSON.stringify(origin) : "";
  const routeKey = route ? `${route.zones.join(">")}|${route.links.join(",")}` : "";
  const geo = useMemo(
    () => (ready && data && route && origin && target ? routeGeometry(data, nav, origin, route, target) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready, data, nav, originKey, routeKey, target],
  );
  // Pins come from one placement of every lounge at the airport, so filtering never moves them.
  const pins = useMemo(() => {
    if (!ready || !data) return [];
    const shown = target && !lounges.some((l) => l.id === target.id) ? [...lounges, target] : lounges;
    return shown.map((lounge) => ({ lounge, p: loungePoint(data, nav, lounge) })).filter((x): x is { lounge: Lounge; p: Pt } => x.p !== null);
  }, [ready, data, nav, lounges, target]);
  // One path per ring: OSM's outer rings are unioned (overlapping ones mustn't cut holes in each other).
  const outlines = useMemo(() => (data ? terminalRings(data).flatMap((rings) => rings.map((r) => `M${r.map((p) => `${p[0]} ${p[1]}`).join("L")}Z`)) : []), [data]);
  const markers = useMemo(() => (ready && data ? zoneMarkers(data, nav) : []), [ready, data, nav]);

  // Fit to the route when it changes (or to the terminals when there's no route).
  const fitKey = geo ? geo.segments.flatMap((s) => s.pts).concat(geo.end ? [geo.end] : []).join(";") : "all";
  const aspect = size.w / Math.max(size.h, 1);
  const fitView = (): View | null => {
    if (!data) return null;
    const routePts = geo ? [...geo.segments.flatMap((s) => s.pts), ...(geo.end ? [geo.end] : []), ...(geo.start ? [geo.start] : [])] : [];
    const all = data.terminals.flatMap((t) => t.rings.flat());
    let v = fit(routePts.length ? routePts : all.length ? all : pins.map((p) => p.p), aspect);
    if (!v || !routePts.length) return v;
    // Room for the labels of You and the lounge, then the route out from under the zoom buttons: widen the view to the
    // right if it would be under them.
    v = clearOfEdges(v, [geo?.start, geo?.end].filter((p): p is Pt => Boolean(p)), EDGE, size.w);
    const s = size.w / v.w;
    const under = routePts.some((p) => (p[0] - v!.x) * s > size.w - CONTROLS.w && (p[1] - v!.y) * s < CONTROLS.h);
    if (!under) return v;
    const w = (v.w * size.w) / Math.max(size.w - CONTROLS.w, 1);
    const h = w / aspect;
    return { x: v.x, y: v.y - (h - v.h) / 2, w, h };
  };
  const viewKey = `${fitKey}@${Math.round(aspect * 20)}`;
  const view = manual?.key === viewKey ? manual.view : fitView();
  const setView = (next: View | null | ((v: View) => View)) => {
    if (!view) return;
    const v = typeof next === "function" ? next(view) : next;
    setManual(v ? { key: viewKey, view: v } : null);
  };

  // The wheel zooms the map without scrolling the page under it: a listener added by hand, since React's is passive
  // and can't stop the scroll. Re-added each render, with the view it zooms from.
  useEffect(() => {
    const el = svg.current;
    if (!el || !view) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const at: Pt = [view.x + ((e.clientX - r.left) / r.width) * view.w, view.y + ((e.clientY - r.top) / r.height) * view.h];
      const w = Math.min(Math.max(view.w * (e.deltaY > 0 ? 1.15 : 1 / 1.15), 150), 20000);
      const h = (w / view.w) * view.h;
      setManual({ key: viewKey, view: { x: at[0] - ((at[0] - view.x) * w) / view.w, y: at[1] - ((at[1] - view.y) * h) / view.h, w, h } });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  });

  if (data === undefined || (data && !ready))
    return (
      <div className="grid h-[340px] animate-pulse place-items-center rounded-md bg-canvas text-sm text-ink-3 sm:h-[420px]" aria-live="polite">
        {data ? "Finding the way…" : "Loading the airport map…"}
      </div>
    );
  if (data === null)
    return (
      <div className="flex items-start gap-2 rounded-md border border-line bg-canvas p-4 text-sm text-ink-2" role="status">
        <MapPinOff className="mt-0.5 h-4 w-4 shrink-0 text-ink-3" aria-hidden />
        <span>
          The map of {code} couldn&apos;t load right now (it&apos;s built from OpenStreetMap). The directions below still
          work, and the Concourse overview further down shows where each lounge is.
        </span>
      </div>
    );
  if (!view) return null;

  const scale = Math.min(size.w / view.w, size.h / view.h); // px per meter
  const px = (n: number) => n / scale;
  // The viewBox is centred in the box when the aspect ratios differ slightly.
  const ox = (size.w - view.w * scale) / 2;
  const oy = (size.h - view.h * scale) / 2;
  const toScreen = (p: Pt): [number, number] => [(p[0] - view.x) * scale + ox, (p[1] - view.y) * scale + oy];
  const toMapX = (sx: number) => view.x + (sx - ox) / scale;
  const toMapY = (sy: number) => view.y + (sy - oy) / scale;
  const showGateLabels = scale > 0.55;
  const toMap = (clientX: number, clientY: number): Pt => {
    const r = svg.current!.getBoundingClientRect();
    return [view.x + ((clientX - r.left) / r.width) * view.w, view.y + ((clientY - r.top) / r.height) * view.h];
  };
  const zoom = (factor: number, at?: Pt) => {
    const c = at ?? [view.x + view.w / 2, view.y + view.h / 2];
    const w = Math.min(Math.max(view.w * factor, 150), 20000);
    const h = (w / view.w) * view.h;
    setView({ x: c[0] - ((c[0] - view.x) * w) / view.w, y: c[1] - ((c[1] - view.y) * h) / view.h, w, h });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as Element).closest("[data-pin]")) return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    drag.current ??= { pointers: new Map() };
    drag.current.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    drag.current.start = view;
    const ps = [...drag.current.pointers.values()];
    drag.current.dist = ps.length === 2 ? Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y) : undefined;
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || !d.pointers.has(e.pointerId) || !d.start) return;
    const prev = d.pointers.get(e.pointerId)!;
    const before = [...d.pointers.values()];
    d.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const ps = [...d.pointers.values()];
    if (ps.length === 2 && d.dist) {
      // Two fingers: pinch to zoom and move together to pan (one finger scrolls the page on a phone).
      const dist = Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y);
      const r = svg.current!.getBoundingClientRect();
      const dx = (ps[0].x + ps[1].x - before[0].x - before[1].x) / 2;
      const dy = (ps[0].y + ps[1].y - before[0].y - before[1].y) / 2;
      zoom(d.dist / dist, toMap((ps[0].x + ps[1].x) / 2, (ps[0].y + ps[1].y) / 2));
      setView((v) => ({ ...v, x: v.x - (dx / r.width) * v.w, y: v.y - (dy / r.height) * v.h }));
      d.dist = dist;
    } else if (ps.length === 1) {
      const r = svg.current!.getBoundingClientRect();
      setView((v) => ({ ...v, x: v.x - ((e.clientX - prev.x) / r.width) * v.w, y: v.y - ((e.clientY - prev.y) / r.height) * v.h }));
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    drag.current?.pointers.delete(e.pointerId);
    if (drag.current && drag.current.pointers.size < 2) drag.current.dist = undefined;
  };

  const zoneName = (id: string) => shortZoneName(nav.zones.find((z) => z.id === id)?.name ?? id);
  const startGate = origin?.kind === "gate" ? origin.gate : undefined;
  // When the gate isn't on the map the marker is at the zone's middle: say so, and don't label it with the gate.
  const gateMissing = Boolean(startGate && geo?.startAt === "zone");
  // "Gate 3" rather than a bare number; from security, where you come out (the zone's middle), not the checkpoint.
  const youLabel =
    origin?.kind === "gate"
      ? startGate && !gateMissing
        ? `${startGate.prefix ? "" : "Gate "}${startGate.label}`
        : zoneName(origin.zone)
      : "After security";
  const startNote =
    startGate && origin?.kind === "gate"
      ? gateMissing
        ? `Gate ${startGate.label} isn't on the map yet, so you're shown in the middle of ${zoneName(origin.zone)}.`
        : geo?.startAt === "near-gate"
          ? `Gate ${startGate.label} isn't on the map yet, so it's placed by the gates numbered next to it.`
          : null
      : null;
  const isOpen = (l: Lounge) => (grants.get(l.id)?.length ?? 0) > 0;
  // Zoomed far out (a long route on a phone), smaller pins and no gate dots, so the concourses stay readable.
  const far = scale < 0.3;
  const pinRadius = (l: Lounge) => (target?.id === l.id ? (far ? 9 : 11) : far ? 6 : 8.5);

  // Route lines scale with the zoom (about 6 m wide), between 3 and 6 px, so they don't hide narrow walkways.
  const lineW = Math.min(6, Math.max(3, 6 * scale));
  const casingW = lineW + 3;

  // --- Labels, laid out in screen space so they never pile up ----------------------------------------------------
  const inView = (sx: number, sy: number) => sx >= -20 && sy >= -20 && sx <= size.w + 20 && sy <= size.h + 20;
  const obstacles: (Box & { id?: string })[] = pins.map(({ lounge, p }) => {
    const [sx, sy] = toScreen(p);
    const r = pinRadius(lounge) + 1;
    return { id: `pin:${lounge.id}`, left: sx - r, top: sy - r, w: 2 * r, h: 2 * r };
  });
  if (geo?.start) {
    const [sx, sy] = toScreen(geo.start);
    obstacles.push({ id: "you", left: sx - 10, top: sy - 10, w: 20, h: 20 });
  }
  for (const s of geo?.segments ?? []) obstacles.push(...lineBoxes(s.pts.map(toScreen)).map((b) => ({ ...b, id: "route" })));
  // Stations too, which a label mustn't cover even where it may cover the route.
  for (const s of geo?.segments ?? [])
    if (s.mode === "train" || s.mode === "bus")
      for (const p of s.pts) {
        const [sx, sy] = toScreen(p);
        obstacles.push({ id: "station", left: sx - 7, top: sy - 7, w: 14, h: 14 });
      }
  // Gate dots, so labels don't sit on them.
  if (!far)
    data.gates.forEach((g, i) => {
      const [sx, sy] = toScreen([g.x, g.y]);
      if (inView(sx, sy)) obstacles.push({ id: `gate:${i}`, left: sx - 2.5, top: sy - 2.5, w: 5, h: 5 });
    });
  // The zoom buttons in the top-right corner.
  obstacles.push({ left: size.w - CONTROLS.w, top: 0, w: CONTROLS.w, h: CONTROLS.h });
  const labelItems: LabelItem[] = [];
  const targetPin = target ? pins.find((p) => p.lounge.id === target.id) : undefined;
  if (targetPin) {
    const [x, y] = toScreen(targetPin.p);
    labelItems.push({ id: `pin:${targetPin.lounge.id}`, text: shortLoungeName(targetPin.lounge.name), x, y, r: pinRadius(targetPin.lounge), size: 13, weight: 700, force: true });
  }
  if (geo?.start) {
    const [x, y] = toScreen(geo.start);
    labelItems.push({ id: "you", text: `You · ${youLabel}`, x, y, r: 9, size: 12, weight: 700, force: true });
  }
  // Zone names, at the zone's middle or another roomy spot in it (on it, or just above or below), at every zoom: the
  // destination's first (which may go over the route, so it's nearly always named), then the route's, before the other
  // lounges' names (which the pins' tooltips carry anyway).
  const onRoute = new Set(route?.zones ?? []);
  const destZone = target ? zoneForLounge(nav, target)?.id : undefined;
  const zoneRank = (id: string) => (id === destZone ? 0 : onRoute.has(id) ? 1 : 2);
  for (const m of [...markers].sort((a, b) => zoneRank(a.zone.id) - zoneRank(b.zone.id))) {
    const [x, y] = toScreen(m.p);
    // The destination's zone may also go by the lounge's pin, and over the route when there's no other room.
    const dest = m.zone.id === destZone;
    const alts: { x: number; y: number; r?: number }[] = m.alt.map((a) => toScreen(a)).map(([ax, ay]) => ({ x: ax, y: ay }));
    if (dest && targetPin) {
      const [px, py] = toScreen(targetPin.p);
      alts.push({ x: px, y: py, r: 20 });
    }
    labelItems.push({
      id: `zone:${m.zone.id}`,
      text: shortZoneName(m.zone.name).toUpperCase(),
      x,
      y,
      r: 6,
      size: 10.5,
      weight: 700,
      caps: true,
      spots: dest ? ["center", "above", "below", "left", "right"] : ["center", "above", "below"],
      alts,
      over: ["gate:"],
      overIfNeeded: dest ? ["route"] : undefined,
    });
  }
  if (scale > 0.18) {
    const rest = pins.filter((p) => p.lounge.id !== target?.id).sort((a, b) => Number(isOpen(b.lounge)) - Number(isOpen(a.lounge)));
    for (const { lounge, p } of rest) {
      const [x, y] = toScreen(p);
      labelItems.push({ id: `pin:${lounge.id}`, text: shortLoungeName(lounge.name), x, y, r: pinRadius(lounge), size: 11, weight: 600 });
    }
  }
  if (showGateLabels) {
    // OSM sometimes has a gate twice (two nodes a few meters apart): label it once.
    const labelled: { ref: string; p: Pt }[] = [];
    data.gates.forEach((g, i) => {
      const [x, y] = toScreen([g.x, g.y]);
      if (!inView(x, y) || labelled.some((o) => o.ref === g.ref && Math.hypot(o.p[0] - g.x, o.p[1] - g.y) < 60)) return;
      labelled.push({ ref: g.ref, p: [g.x, g.y] });
      labelItems.push({ id: `gate:${i}`, text: g.ref, x, y, r: 2.5, size: 9, weight: 500, spots: ["above", "below"] });
    });
  }
  const labels = placeLabels(labelItems, obstacles, size.w, size.h);
  const labelFor = new Map(labels.map((l) => [l.id, l]));
  const renderLabel = (id: string, fill: string, halo = 3) => {
    const l = labelFor.get(id);
    if (!l) return null;
    // A label pushed away from its marker gets a thin line back to it, from the nearest point of the label.
    const leader = l.leader
      ? (() => {
          const [cx, cy] = [Math.min(Math.max(l.x, l.left), l.left + l.w), Math.min(Math.max(l.y, l.top), l.top + l.h)];
          return <line x1={toMapX(l.x)} y1={toMapY(l.y)} x2={toMapX(cx)} y2={toMapY(cy)} stroke={fill} strokeWidth={1.2} vectorEffect="non-scaling-stroke" />;
        })()
      : null;
    return (
      <>
        {leader}
        <text
          x={toMapX(l.left + 3)}
          y={toMapY(l.top + l.h * 0.78)}
          fontSize={px(l.size)}
          fontWeight={l.weight}
          letterSpacing={l.caps ? px(l.size * CAPS_TRACKING) : undefined}
          fill={fill}
          stroke="#fff"
          strokeWidth={halo}
          strokeLinejoin="round"
          paintOrder="stroke"
          vectorEffect="non-scaling-stroke"
        >
          {l.text}
        </text>
      </>
    );
  };

  const arrows = geo ? geo.segments.filter((s) => s.mode === "walk").flatMap((s) => along(s.pts, px(90))) : [];
  const rides = (geo?.segments ?? []).filter((s) => isRide(s.mode));
  const walks = (geo?.segments ?? []).filter((s) => !isRide(s.mode));
  /** A route segment: a white casing under the line, or just the line, faint (`opacity`), over the buildings. */
  const drawSegment = (s: { mode: SegmentMode; pts: Pt[] }, key: string, opacity?: number) => {
    const points = s.pts.map((p) => p.join(",")).join(" ");
    const line = { points, fill: "none", strokeLinecap: "round", strokeLinejoin: "round", vectorEffect: "non-scaling-stroke" } as const;
    return (
      <g key={key} opacity={opacity}>
        {opacity === undefined && <polyline {...line} stroke="#fff" strokeWidth={casingW} />}
        <polyline {...line} stroke={SEGMENT_STYLE[s.mode].color} strokeWidth={lineW} strokeDasharray={SEGMENT_STYLE[s.mode].dash?.(lineW)} />
      </g>
    );
  };
  // The destination's pin goes on top of the others. Pins go over the You marker, so a lounge right beside you still
  // shows, but for one so close on screen it would hide You altogether: that one goes under it.
  const pinOrder = targetPin ? [...pins.filter((p) => p !== targetPin), targetPin] : pins;
  const underYou = ({ lounge: l, p }: { lounge: Lounge; p: Pt }) => {
    if (!geo?.start || l.id === target?.id) return false;
    const [[x, y], [sx, sy]] = [toScreen(p), toScreen(geo.start)];
    return Math.hypot(x - sx, y - sy) < 7;
  };
  const hasMode = (m: SegmentMode) => Boolean(geo?.segments.some((s) => s.mode === m));
  // You're at a lounge's door (your gate is its gate, so you're on the same spot): ring its pin rather than hide it
  // under the You marker. By where they are, not how close they look when zoomed out.
  const youOnPin = Boolean(geo?.start && pins.some(({ p }) => Math.hypot(p[0] - geo.start![0], p[1] - geo.start![1]) < 6));
  // Where you get on and off trains and buses (and the stops in between), as small station marks.
  const stations = (geo?.segments ?? [])
    .filter((s) => s.mode === "train" || s.mode === "bus")
    .flatMap((s) => s.pts.map((p, i) => ({ p, end: i === 0 || i === s.pts.length - 1 })).filter((x) => x.end || s.mode === "train"))
    .filter(({ p }) => !geo?.start || Math.hypot(p[0] - geo.start[0], p[1] - geo.start[1]) > px(12));
  // Other lounges' pins a walk passes under get a white ring, so the line visibly runs beneath them rather than reading
  // as a stop (rides run under the buildings, where the pins are, already).
  const routeScreen = walks.map((s) => s.pts.map(toScreen));
  const underRoute = (p: Pt, r: number) => {
    const [x, y] = toScreen(p);
    return routeScreen.some((pts) => pts.slice(1).some((b, i) => segmentDistance([x, y], pts[i], b) < r + lineW / 2 + 1));
  };

  const drawPin = ({ lounge: l, p }: { lounge: Lounge; p: Pt }) => {
    const shut = closed(l);
    const ok = !shut && isOpen(l);
    const color = loungeNetworks[l.network].color;
    const isTarget = target?.id === l.id;
    const filled = !shut && (!checking || ok);
    return (
      <g
        key={l.id}
        data-pin
        role="button"
        tabIndex={0}
        aria-label={`Directions to ${l.name}`}
        className="cursor-pointer outline-none"
        onClick={() => onPick(l)}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onPick(l)}
      >
        <title>{`${l.name} (${loungeNetworks[l.network].label})${shut ? " — closed for now" : checking ? (ok ? " — you can get in" : " — not with these cards") : ""}`}</title>
        {!isTarget && underRoute(p, pinRadius(l)) && <circle cx={p[0]} cy={p[1]} r={px(pinRadius(l) + 3.5)} fill="#fff" />}
        <circle
          cx={p[0]}
          cy={p[1]}
          r={px(pinRadius(l))}
          fill={filled ? color : "#fff"}
          stroke={filled ? "#fff" : shut ? "var(--color-warn)" : "#8a8d91"}
          strokeWidth={2}
          strokeDasharray={shut ? "3 2" : undefined}
          vectorEffect="non-scaling-stroke"
        />
        {filled && <circle cx={p[0]} cy={p[1]} r={px(3)} fill="#fff" />}
        {renderLabel(`pin:${l.id}`, isTarget ? "var(--color-navy)" : "#4b4f55")}
      </g>
    );
  };

  return (
    <div className="space-y-2">
      <div ref={box} className="relative h-[340px] overflow-hidden rounded-md border border-line sm:h-[420px]" style={{ background: MAP_BG }}>
        <svg
          ref={svg}
          viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
          className="h-full w-full touch-pan-y select-none"
          role="img"
          aria-label={`Map of ${code} terminals${target ? ` with the way to ${target.name}` : ""}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {data.runways.map((r, i) => (
            <polyline key={`r${i}`} points={r.map((p) => p.join(",")).join(" ")} fill="none" stroke="#cfd6df" strokeWidth={45} strokeLinecap="butt" />
          ))}
          {/* Rides go under the buildings (trains run below or beside the concourses) and show faintly through them, so a
              walk back along a train line, and the pins it passes, stay clear of it. */}
          {rides.map((s, i) => drawSegment(s, `rb${i}`))}
          {/* Buildings: outline first, a little wider, then the fill, so narrow walkways stay visible when zoomed out. */}
          {outlines.map((d, i) => (
            <path key={`to${i}`} d={d} fill="none" stroke="#8e9bab" strokeWidth={5.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          ))}
          {outlines.map((d, i) => (
            <path key={`tf${i}`} d={d} fill={BUILDING} stroke={BUILDING} strokeWidth={3} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          ))}
          {rides.map((s, i) => drawSegment(s, `rf${i}`, 0.4))}
          {!far &&
            data.gates.map((g, i) => (
              <g key={`g${i}`}>
                <circle cx={g.x} cy={g.y} r={px(2.2)} fill="#a3adb9" />
                {showGateLabels && renderLabel(`gate:${i}`, "#717c88", 2)}
              </g>
            ))}
          {markers.map((m) => (
            <g key={`z${m.zone.id}`} aria-hidden="true">
              {renderLabel(`zone:${m.zone.id}`, "#6b7787")}
            </g>
          ))}

          {walks.map((s, i) => drawSegment(s, `w${i}`))}
          {/* The lounge's ring, under the stations, so a train that stops beside it still shows its stop. */}
          {targetPin && (
            <g aria-hidden="true">
              <circle cx={targetPin.p[0]} cy={targetPin.p[1]} r={px(19)} fill="var(--color-brand)" opacity={0.16} />
              <circle cx={targetPin.p[0]} cy={targetPin.p[1]} r={px(14.5)} fill="none" stroke="var(--color-brand)" strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
            </g>
          )}
          {stations.map(({ p, end }, i) => (
            <circle
              key={`st${i}`}
              cx={p[0]}
              cy={p[1]}
              r={px(end ? lineW * 0.75 + 1.5 : lineW * 0.5 + 0.5)}
              fill="#fff"
              stroke={ROUTE}
              strokeWidth={end ? 2 : 1.5}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {arrows.map(({ p, deg }, i) => (
            <path
              key={`a${i}`}
              d="M-3.2,-3.6 L3.6,0 L-3.2,3.6 Z"
              transform={`translate(${p[0]} ${p[1]}) rotate(${deg}) scale(${px(1)})`}
              fill="#fff"
              stroke={ROUTE}
              strokeWidth={1.2}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}

          {pinOrder.filter(underYou).map(drawPin)}
          {/* You, under the pins (but for one right on it), so a lounge right beside you still shows. */}
          {geo?.start && (
            <g aria-hidden="true">
              <circle cx={geo.start[0]} cy={geo.start[1]} r={px(youOnPin ? 19 : 17)} fill="var(--color-navy)" opacity={0.16} />
              {!youOnPin && <circle cx={geo.start[0]} cy={geo.start[1]} r={px(8.5)} fill="var(--color-navy)" stroke="#fff" strokeWidth={3} vectorEffect="non-scaling-stroke" />}
            </g>
          )}
          {pinOrder.filter((x) => !underYou(x)).map(drawPin)}
          {geo?.start && (
            <g>
              {youOnPin && (
                <>
                  <circle cx={geo.start[0]} cy={geo.start[1]} r={px(14)} fill="none" stroke="#fff" strokeWidth={5} vectorEffect="non-scaling-stroke" />
                  <circle cx={geo.start[0]} cy={geo.start[1]} r={px(14)} fill="none" stroke="var(--color-navy)" strokeWidth={3} vectorEffect="non-scaling-stroke" />
                </>
              )}
              {renderLabel("you", "var(--color-navy)")}
            </g>
          )}
        </svg>

        <div className="absolute top-2 right-2 flex flex-col overflow-hidden rounded-md border border-line bg-white shadow-sm">
          <button type="button" className="grid h-9 w-9 place-items-center hover:bg-canvas" onClick={() => zoom(1 / 1.4)} aria-label="Zoom in">
            <Plus className="h-4 w-4" />
          </button>
          <button type="button" className="grid h-9 w-9 place-items-center border-t border-line hover:bg-canvas" onClick={() => zoom(1.4)} aria-label="Zoom out">
            <Minus className="h-4 w-4" />
          </button>
          <button type="button" className="grid h-9 w-9 place-items-center border-t border-line hover:bg-canvas" onClick={() => setManual(null)} aria-label="Fit the route">
            <Locate className="h-4 w-4" />
          </button>
        </div>
      </div>
      {startNote && <p className="text-xs text-ink-2">{startNote}</p>}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-3">
        <span className={cn("flex items-center gap-1.5", !hasMode("walk") && "hidden")}>
          <span className="h-1 w-5 rounded bg-brand" /> Walk
        </span>
        <span className={cn("flex items-center gap-1.5", !hasMode("train") && !hasMode("bus") && "hidden")}>
          <span className="h-1 w-5 rounded bg-[repeating-linear-gradient(90deg,var(--color-brand)_0_6px,transparent_6px_10px)]" />{" "}
          {hasMode("train") && hasMode("bus") ? "Train or bus" : hasMode("bus") ? "Bus" : "Train"}
        </span>
        <span className={cn("flex items-center gap-1.5", !hasMode("connector") && !hasMode("seam") && "hidden")}>
          <span className="h-1.5 w-5 rounded bg-[radial-gradient(circle,var(--color-brand)_1.6px,transparent_1.8px)] bg-[length:6px_6px] bg-center" />{" "}
          {hasMode("connector") ? "Tunnel or bridge" : "Walkway not on the map"}
        </span>
        <span className={cn("flex items-center gap-1.5", !hasMode("landside") && "hidden")}>
          <span className="h-1 w-5 rounded bg-[repeating-linear-gradient(90deg,var(--color-warn)_0_2px,transparent_2px_7px)]" /> Outside security
        </span>
        <span className="ml-auto">
          <span className="hidden pointer-fine:inline">Drag to move · scroll to zoom · </span>
          <span className="pointer-fine:hidden">Two fingers to move or zoom · </span>
          Map data {data.attribution}
        </span>
      </div>
    </div>
  );
}
