"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Locate, Minus, Plus } from "lucide-react";
import type { Lounge } from "@/shared/data/types";
import type { AirportNav } from "@/shared/data/airport-nav";
import { loungeNetworks } from "@/shared/data/networks";
import type { LoungeAccessGrant } from "@/shared/lib/lounge-access";
import type { Origin, Route } from "@/shared/lib/wayfinding";
import { build, overpassQuery } from "@/shared/lib/osm-airport";
import { bounds, loungePoint, routeGeometry, zoneMarkers, type AirportMapData, type Pt, type SegmentMode } from "@/shared/lib/airport-map";
import { terminalRings } from "@/shared/lib/walkable";
import { cn } from "@/shared/lib/format";
import { CAPS_TRACKING, placeLabels, shortLoungeName, shortZoneName, type Box, type LabelItem } from "./map-labels";

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
    signal: AbortSignal.timeout(60_000),
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
      fetch(`/airport-maps/${code}.json`)
        .then((r) => (r.ok ? (r.json() as Promise<AirportMapData>) : buildFromOsm(code)))
        .catch(() => null),
    );
  }
  return cache.get(code)!;
}

const MAP_BG = "#e3e8ee";
const ROUTE = "var(--color-brand)";
const SEGMENT_STYLE: Record<SegmentMode, { dash?: string; color: string }> = {
  walk: { color: ROUTE },
  train: { color: ROUTE, dash: "10 7" },
  bus: { color: ROUTE, dash: "10 7" },
  landside: { color: "var(--color-warn)", dash: "2 7" },
  // A walk the map has no building for (a tunnel or bridge): a dotted line in the route's color.
  connector: { color: ROUTE, dash: "0.1 8" },
};

function fit(pts: Pt[], aspect: number, pad: number): View | null {
  const b = bounds(pts);
  if (!b) return null;
  let w = Math.max(b.maxX - b.minX, 250) + pad * 2;
  let h = Math.max(b.maxY - b.minY, 250) + pad * 2;
  if (w / h < aspect) w = h * aspect;
  else h = w / aspect;
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
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
  checking: boolean;
  origin: Origin | null;
  route: Route | null;
  target: Lounge | null;
  onPick: (l: Lounge) => void;
}) {
  const [data, setData] = useState<AirportMapData | null | undefined>(undefined);
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

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [data]);

  const geo = useMemo(() => (data && route && origin && target ? routeGeometry(data, nav, origin, route, target) : null), [data, nav, origin, route, target]);
  // Pins come from one placement of every lounge at the airport, so filtering never moves them.
  const pins = useMemo(() => {
    if (!data) return [];
    const shown = target && !lounges.some((l) => l.id === target.id) ? [...lounges, target] : lounges;
    return shown.map((lounge) => ({ lounge, p: loungePoint(data, nav, lounge) })).filter((x): x is { lounge: Lounge; p: Pt } => x.p !== null);
  }, [data, nav, lounges, target]);
  const outlines = useMemo(
    () => (data ? terminalRings(data).map((rings) => rings.map((r) => `M${r.map((p) => `${p[0]} ${p[1]}`).join("L")}Z`).join("")) : []),
    [data],
  );
  const markers = useMemo(() => (data ? zoneMarkers(data, nav) : []), [data, nav]);

  // Fit to the route when it changes (or to the terminals when there's no route).
  const fitKey = geo ? geo.segments.flatMap((s) => s.pts).concat(geo.end ? [geo.end] : []).join(";") : "all";
  const aspect = size.w / Math.max(size.h, 1);
  const fitView = (): View | null => {
    if (!data) return null;
    const routePts = geo ? [...geo.segments.flatMap((s) => s.pts), ...(geo.end ? [geo.end] : [])] : [];
    if (routePts.length) return fit(routePts, aspect, 160);
    const all = data.terminals.flatMap((t) => t.rings.flat());
    return fit(all.length ? all : pins.map((p) => p.p), aspect, 120);
  };
  const viewKey = `${fitKey}@${Math.round(aspect * 20)}`;
  const view = manual?.key === viewKey ? manual.view : fitView();
  const setView = (next: View | null | ((v: View) => View)) => {
    if (!view) return;
    const v = typeof next === "function" ? next(view) : next;
    setManual(v ? { key: viewKey, view: v } : null);
  };

  if (data === undefined)
    return (
      <div className="grid h-[340px] animate-pulse place-items-center rounded-md bg-canvas text-sm text-ink-3 sm:h-[420px]" aria-live="polite">
        Loading the airport map…
      </div>
    );
  if (data === null || !view) return null;

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
    d.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const ps = [...d.pointers.values()];
    if (ps.length === 2 && d.dist) {
      const dist = Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y);
      zoom(d.dist / dist, toMap((ps[0].x + ps[1].x) / 2, (ps[0].y + ps[1].y) / 2));
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

  const youLabel =
    origin?.kind === "gate" ? (origin.gate?.label ?? nav.zones.find((z) => z.id === origin.zone)?.name ?? "Airside") : "Security";
  const isOpen = (l: Lounge) => (grants.get(l.id)?.length ?? 0) > 0;
  const pinRadius = (l: Lounge) => (target?.id === l.id ? 11 : 8.5);

  // --- Labels, laid out in screen space so they never pile up ----------------------------------------------------
  const obstacles: (Box & { id?: string })[] = pins.map(({ lounge, p }) => {
    const [sx, sy] = toScreen(p);
    const r = pinRadius(lounge) + 1;
    return { id: `pin:${lounge.id}`, left: sx - r, top: sy - r, w: 2 * r, h: 2 * r };
  });
  if (geo?.start) {
    const [sx, sy] = toScreen(geo.start);
    obstacles.push({ id: "you", left: sx - 10, top: sy - 10, w: 20, h: 20 });
  }
  const labelItems: LabelItem[] = [];
  const targetPin = target ? pins.find((p) => p.lounge.id === target.id) : undefined;
  if (targetPin) {
    const [x, y] = toScreen(targetPin.p);
    labelItems.push({ id: `pin:${targetPin.lounge.id}`, text: shortLoungeName(targetPin.lounge.name), x, y, r: 11, size: 13, weight: 700, force: true });
  }
  if (geo?.start) {
    const [x, y] = toScreen(geo.start);
    labelItems.push({ id: "you", text: `You · ${youLabel}`, x, y, r: 9, size: 12, weight: 700, force: true });
  }
  if (scale > 0.18) {
    const rest = pins.filter((p) => p.lounge.id !== target?.id).sort((a, b) => Number(isOpen(b.lounge)) - Number(isOpen(a.lounge)));
    for (const { lounge, p } of rest) {
      const [x, y] = toScreen(p);
      labelItems.push({ id: `pin:${lounge.id}`, text: shortLoungeName(lounge.name), x, y, r: 8.5, size: 11, weight: 600 });
    }
  }
  if (scale < 1.1) {
    for (const m of markers) {
      const [x, y] = toScreen(m.p);
      labelItems.push({ id: `zone:${m.zone.id}`, text: shortZoneName(m.zone.name).toUpperCase(), x, y, r: 0, size: 10.5, weight: 700, caps: true, center: true });
    }
  }
  const labels = placeLabels(labelItems, obstacles, size.w, size.h);
  const labelFor = new Map(labels.map((l) => [l.id, l]));
  const renderLabel = (id: string, fill: string) => {
    const l = labelFor.get(id);
    if (!l) return null;
    return (
      <text
        x={toMapX(l.left + 3)}
        y={toMapY(l.top + l.h * 0.78)}
        fontSize={px(l.size)}
        fontWeight={l.weight}
        letterSpacing={l.caps ? px(l.size * CAPS_TRACKING) : undefined}
        fill={fill}
        stroke="#fff"
        strokeWidth={3}
        strokeLinejoin="round"
        paintOrder="stroke"
        vectorEffect="non-scaling-stroke"
      >
        {l.text}
      </text>
    );
  };

  const arrows = geo ? geo.segments.filter((s) => s.mode === "walk").flatMap((s) => along(s.pts, px(64))) : [];
  const hasMode = (m: SegmentMode) => Boolean(geo?.segments.some((s) => s.mode === m));

  return (
    <div className="space-y-2">
      <div ref={box} className="relative h-[340px] overflow-hidden rounded-md border border-line sm:h-[420px]" style={{ background: MAP_BG }}>
        <svg
          ref={svg}
          viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
          className="h-full w-full touch-none select-none"
          role="img"
          aria-label={`Map of ${code} terminals${target ? ` with the way to ${target.name}` : ""}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={(e) => zoom(e.deltaY > 0 ? 1.15 : 1 / 1.15, toMap(e.clientX, e.clientY))}
        >
          {data.runways.map((r, i) => (
            <polyline key={`r${i}`} points={r.map((p) => p.join(",")).join(" ")} fill="none" stroke="#cfd6df" strokeWidth={45} strokeLinecap="butt" />
          ))}
          {outlines.map((d, i) => (
            <path key={`t${i}`} d={d} fill="#fdfcf8" fillRule="evenodd" stroke="#8e9bab" strokeWidth={1.4} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          ))}
          {data.gates.map((g, i) => (
            <g key={`g${i}`}>
              <circle cx={g.x} cy={g.y} r={px(2.2)} fill="#a3adb9" />
              {showGateLabels && (
                <text x={g.x} y={g.y - px(5)} fontSize={px(9)} textAnchor="middle" fill="#717c88">
                  {g.ref}
                </text>
              )}
            </g>
          ))}
          {markers.map((m) => (
            <g key={`z${m.zone.id}`} aria-hidden="true">
              {renderLabel(`zone:${m.zone.id}`, "#6b7787")}
            </g>
          ))}

          {geo?.segments.map((s, i) => {
            const points = s.pts.map((p) => p.join(",")).join(" ");
            return (
              <g key={`s${i}`}>
                <polyline points={points} fill="none" stroke="#fff" strokeWidth={10} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                <polyline
                  points={points}
                  fill="none"
                  stroke={SEGMENT_STYLE[s.mode].color}
                  strokeWidth={s.mode === "connector" ? 6 : 5}
                  strokeDasharray={SEGMENT_STYLE[s.mode].dash}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            );
          })}
          {arrows.map(({ p, deg }, i) => (
            <path
              key={`a${i}`}
              d="M-2.2,-3.2 L1.6,0 L-2.2,3.2"
              transform={`translate(${p[0]} ${p[1]}) rotate(${deg}) scale(${px(1)})`}
              fill="none"
              stroke="#fff"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}

          {pins.map(({ lounge: l, p }) => {
            const ok = isOpen(l);
            const color = loungeNetworks[l.network].color;
            const isTarget = target?.id === l.id;
            const filled = !checking || ok;
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
                <title>{`${l.name} (${loungeNetworks[l.network].label})${checking ? (ok ? " — you can get in" : " — not with these cards") : ""}`}</title>
                {isTarget && (
                  <>
                    <circle cx={p[0]} cy={p[1]} r={px(19)} fill="var(--color-brand)" opacity={0.16} />
                    <circle cx={p[0]} cy={p[1]} r={px(14.5)} fill="none" stroke="var(--color-brand)" strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
                  </>
                )}
                <circle cx={p[0]} cy={p[1]} r={px(pinRadius(l))} fill={filled ? color : "#fff"} stroke={filled ? "#fff" : "#8a8d91"} strokeWidth={2} vectorEffect="non-scaling-stroke" />
                {filled && <circle cx={p[0]} cy={p[1]} r={px(3)} fill="#fff" />}
                {renderLabel(`pin:${l.id}`, isTarget ? "var(--color-navy)" : "#4b4f55")}
              </g>
            );
          })}

          {geo?.start && (
            <g>
              <circle cx={geo.start[0]} cy={geo.start[1]} r={px(17)} fill="var(--color-navy)" opacity={0.16} />
              <circle cx={geo.start[0]} cy={geo.start[1]} r={px(8.5)} fill="var(--color-navy)" stroke="#fff" strokeWidth={3} vectorEffect="non-scaling-stroke" />
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
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-3">
        <span className="flex items-center gap-1.5">
          <span className="h-1 w-5 rounded bg-brand" /> Walk
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-1 w-5 rounded bg-[repeating-linear-gradient(90deg,var(--color-brand)_0_6px,transparent_6px_10px)]" /> Train or bus
        </span>
        <span className={cn("flex items-center gap-1.5", !hasMode("connector") && "hidden")}>
          <span className="h-1.5 w-5 rounded bg-[radial-gradient(circle,var(--color-brand)_1.6px,transparent_1.8px)] bg-[length:6px_6px] bg-center" /> Tunnel or bridge
        </span>
        <span className={cn("flex items-center gap-1.5", !hasMode("landside") && "hidden")}>
          <span className="h-1 w-5 rounded bg-[repeating-linear-gradient(90deg,var(--color-warn)_0_2px,transparent_2px_7px)]" /> Outside security
        </span>
        <span className="ml-auto">Drag to move · scroll or pinch to zoom · Map data {data.attribution}</span>
      </div>
    </div>
  );
}
