"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Locate, Minus, Plus } from "lucide-react";
import type { Lounge } from "@/shared/data/types";
import type { AirportNav } from "@/shared/data/airport-nav";
import { loungeNetworks } from "@/shared/data/networks";
import type { LoungeAccessGrant } from "@/shared/lib/lounge-access";
import type { Origin, Route } from "@/shared/lib/wayfinding";
import { build, overpassQuery } from "@/shared/lib/osm-airport";
import { bounds, loungePoint, routeGeometry, type AirportMapData, type Pt, type SegmentMode } from "@/shared/lib/airport-map";
import { cn } from "@/shared/lib/format";

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

const SEGMENT_STYLE: Record<SegmentMode, { dash?: string; color: string }> = {
  walk: { color: "var(--color-brand)" },
  train: { color: "var(--color-brand)", dash: "10 7" },
  bus: { color: "var(--color-brand)", dash: "10 7" },
  landside: { color: "var(--color-warn)", dash: "2 7" },
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

/**
 * Indoor-style airport map (terminal outlines, runways and gates from OpenStreetMap) with lounge pins and the
 * current route drawn on top. Pan by dragging, zoom with the wheel, pinch or the buttons; pins pick a destination.
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
    // A box measured while hidden or collapsed reads 0 wide or tall: keep the last real size (no Infinity scales).
    const ro = new ResizeObserver(([e]) => e.contentRect.width > 0 && e.contentRect.height > 0 && setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [data]);

  const geo = useMemo(() => (data && route && origin && target ? routeGeometry(data, nav, origin, route, target) : null), [data, nav, origin, route, target]);
  const pins = useMemo(() => {
    if (!data) return [];
    // Lounges sharing a spot (no gate known) fan out slightly so each stays tappable.
    const byPt = new Map<string, Lounge[]>();
    const out: { lounge: Lounge; p: Pt }[] = [];
    for (const l of lounges) {
      const p = loungePoint(data, nav, l);
      if (!p) continue;
      const k = p.join(",");
      byPt.set(k, [...(byPt.get(k) ?? []), l]);
    }
    for (const [k, ls] of byPt) {
      const [x, y] = k.split(",").map(Number);
      ls.forEach((lounge, i) => {
        const a = (i / ls.length) * Math.PI * 2;
        const r = ls.length > 1 ? 28 : 0;
        out.push({ lounge, p: [x + Math.cos(a) * r, y + Math.sin(a) * r] });
      });
    }
    return out;
  }, [data, nav, lounges]);

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

  return (
    <div className="space-y-2">
      <div ref={box} className="relative h-[340px] overflow-hidden rounded-md border border-line bg-[#eef2f6] sm:h-[420px]">
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
            <polyline key={`r${i}`} points={r.map((p) => p.join(",")).join(" ")} fill="none" stroke="#d5dbe3" strokeWidth={45} strokeLinecap="butt" />
          ))}
          {data.terminals.map((t, i) =>
            t.rings.map((ring, j) => (
              <polygon
                key={`t${i}-${j}`}
                points={ring.map((p) => p.join(",")).join(" ")}
                fill="#ffffff"
                stroke="#b9c3cf"
                strokeWidth={1.2}
                vectorEffect="non-scaling-stroke"
                strokeLinejoin="round"
              />
            )),
          )}
          {data.gates.map((g, i) => (
            <g key={`g${i}`}>
              <circle cx={g.x} cy={g.y} r={px(2.2)} fill="#9aa5b1" />
              {showGateLabels && (
                <text x={g.x} y={g.y - px(5)} fontSize={px(9)} textAnchor="middle" fill="#6b7682">
                  {g.ref}
                </text>
              )}
            </g>
          ))}

          {geo?.segments.map((s, i) => (
            <g key={`s${i}`}>
              <polyline points={s.pts.map((p) => p.join(",")).join(" ")} fill="none" stroke="#fff" strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
              <polyline
                points={s.pts.map((p) => p.join(",")).join(" ")}
                fill="none"
                stroke={SEGMENT_STYLE[s.mode].color}
                strokeWidth={5}
                strokeDasharray={SEGMENT_STYLE[s.mode].dash}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            </g>
          ))}

          {pins.map(({ lounge: l, p }) => {
            const ok = (grants.get(l.id)?.length ?? 0) > 0;
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
                {isTarget && <circle cx={p[0]} cy={p[1]} r={px(17)} fill="var(--color-brand)" opacity={0.2} />}
                <circle cx={p[0]} cy={p[1]} r={px(isTarget ? 11 : 8.5)} fill={filled ? color : "#fff"} stroke={filled ? "#fff" : "#8a8d91"} strokeWidth={2} vectorEffect="non-scaling-stroke" />
                {filled && <circle cx={p[0]} cy={p[1]} r={px(3)} fill="#fff" />}
                {(isTarget || scale > 0.9) && (
                  <text
                    x={p[0]}
                    y={p[1] + px(isTarget ? 26 : 22)}
                    fontSize={px(isTarget ? 13 : 11)}
                    fontWeight={isTarget ? 700 : 600}
                    textAnchor="middle"
                    fill={isTarget ? "var(--color-navy)" : "#53565a"}
                    stroke="#fff"
                    strokeWidth={3}
                    paintOrder="stroke"
                    vectorEffect="non-scaling-stroke"
                  >
                    {l.name.length > 28 ? `${l.name.slice(0, 26)}…` : l.name}
                  </text>
                )}
              </g>
            );
          })}

          {geo?.start && (
            <g>
              <circle cx={geo.start[0]} cy={geo.start[1]} r={px(16)} fill="var(--color-navy)" opacity={0.18} />
              <circle cx={geo.start[0]} cy={geo.start[1]} r={px(9)} fill="var(--color-navy)" stroke="#fff" strokeWidth={3} vectorEffect="non-scaling-stroke" />
              <text
                x={geo.start[0]}
                y={geo.start[1] - px(16)}
                fontSize={px(12)}
                fontWeight={700}
                textAnchor="middle"
                fill="var(--color-navy)"
                stroke="#fff"
                strokeWidth={3}
                paintOrder="stroke"
                vectorEffect="non-scaling-stroke"
              >
                {`You · ${youLabel}`}
              </text>
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
        <span className={cn("flex items-center gap-1.5", !geo?.segments.some((s) => s.mode === "landside") && "hidden")}>
          <span className="h-1 w-5 rounded bg-[repeating-linear-gradient(90deg,var(--color-warn)_0_2px,transparent_2px_7px)]" /> Outside security
        </span>
        <span className="ml-auto">Drag to move · scroll or pinch to zoom · Map data {data.attribution}</span>
      </div>
    </div>
  );
}
