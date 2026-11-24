"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { WorldAirport } from "@/shared/lib/airports";
import {
  graticulePath,
  greatCirclePoints,
  haversineKm,
  linePath,
  lineShift,
  project,
  unwrapLongitudes,
  viewForRoute,
  type LatLon,
  type MapView,
} from "@/shared/lib/geo";

/** Width of the element, tracked with a ResizeObserver (null until measured). */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState<number | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // A hidden or collapsed box measures 0 wide: keep the last real width rather than dividing by zero.
    const ro = new ResizeObserver(([entry]) => {
      const w = Math.round(entry.contentRect.width);
      if (w > 0) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Great-circle samples for each leg, joined, with longitudes unwrapped along the whole route. */
function routeLine(points: LatLon[]) {
  const pts: LatLon[] = points.length ? [points[0]] : [];
  /** Index of each route point among the samples. */
  const at: number[] = points.length ? [0] : [];
  for (let i = 1; i < points.length; i++) {
    const km = haversineKm(points[i - 1], points[i]);
    const seg = greatCirclePoints(points[i - 1], points[i], Math.max(8, Math.min(160, Math.round(km / 120))));
    pts.push(...seg.slice(1));
    at.push(pts.length - 1);
  }
  return { lats: pts.map((p) => p.lat), lons: unwrapLongitudes(pts.map((p) => p.lon)), at };
}

/**
 * Equirectangular map of a route: graticule, every airport as a faint dot (the continents emerge from them), the
 * great-circle legs, and a dashed nonstop arc for comparison. The view re-centers on the route, so routes across the
 * Pacific aren't cut at the date line. With `connect` false (a route with an unknown or repeated airport) only the
 * airports are marked, so no partial route looks like a real one.
 */
export function RouteMap({
  points,
  airports,
  connect = true,
}: {
  points: WorldAirport[];
  airports: WorldAirport[] | null;
  connect?: boolean;
}) {
  const [ref, measured] = useWidth<HTMLDivElement>();
  const width = measured && measured > 0 ? measured : 800;
  const aspect = width < 560 ? 1.55 : 2.15;
  const height = Math.round(width / aspect);

  const legs = useMemo(() => routeLine(points), [points]);
  const nonstop = useMemo(() => {
    if (!connect || points.length < 3) return null;
    const a = points[0];
    const b = points[points.length - 1];
    if (a.code === b.code) return null;
    return routeLine([a, b]);
  }, [points, connect]);
  const view: MapView = useMemo(() => {
    // Fit the route and the dashed nonstop arc (which can run far north of the route, e.g. near the pole).
    const samples = legs.lats.map((lat, i) => ({ lat, lon: legs.lons[i] }));
    if (nonstop) {
      const shift = Math.round((legs.lons[0] - nonstop.lons[0]) / 360) * 360;
      nonstop.lats.forEach((lat, i) => samples.push({ lat, lon: nonstop.lons[i] + shift }));
    }
    return viewForRoute(samples, aspect, points.length > 1 ? 36 : 120);
  }, [legs, nonstop, aspect, points.length]);
  const s = view.width / width; // map units per screen pixel

  const dots = useMemo(() => {
    if (!airports) return "";
    const pad = 2;
    let d = "";
    for (const a of airports) {
      const { x, y } = project(view, a);
      if (x < view.x - pad || x > view.x + view.width + pad || y < view.y - pad || y > view.y + view.height + pad) continue;
      d += `M${x.toFixed(2)} ${y.toFixed(2)}h0`;
    }
    return d;
  }, [airports, view]);

  const step = view.height > 100 ? 30 : view.height > 45 ? 15 : view.height > 20 ? 10 : 5;
  const grid = graticulePath(view, step);
  const equator = -view.y >= 0 && -(view.y + view.height) <= 0;
  const routePath = connect ? linePath(view, legs.lats, legs.lons) : "";

  // Where each route airport sits (its sample on the unwrapped line, so markers follow the line across the date line),
  // and which way its label goes: away from the lines leaving the airport, so the code never sits on the route.
  const marks = useMemo(() => {
    if (points.length === 1) {
      const { x, y } = project(view, points[0]);
      return [{ a: points[0], x, y, dx: 0, dy: -1 }];
    }
    const shift = lineShift(view, legs.lons);
    const xy = (i: number) => ({ x: (legs.lons[i] + shift - view.lon0) * view.k, y: -legs.lats[i] });
    return points.map((a, i) => {
      const at = legs.at[i];
      const here = xy(at);
      // Without lines there's nothing to keep the label off: put it above.
      if (!connect) return { a, x: here.x, y: here.y, dx: 0, dy: -1 };
      let vx = 0;
      let vy = 0;
      for (const j of [at - 3, at + 3]) {
        if (j < 0 || j >= legs.lats.length) continue;
        const o = xy(j);
        const len = Math.hypot(o.x - here.x, o.y - here.y) || 1;
        vx += (o.x - here.x) / len;
        vy += (o.y - here.y) / len;
      }
      const len = Math.hypot(vx, vy);
      // Lines leaving in opposite directions (a stop on a straight route) cancel out: put the label above.
      return { a, x: here.x, y: here.y, dx: len > 0.35 ? -vx / len : 0, dy: len > 0.35 ? -vy / len : -1 };
    });
  }, [points, legs, view, connect]);

  // A nonstop arc over the pole runs flat along the top of an equirectangular map: say where it goes.
  const polar = useMemo(() => {
    if (!nonstop) return null;
    let i = 0;
    for (let j = 1; j < nonstop.lats.length; j++) if (Math.abs(nonstop.lats[j]) > Math.abs(nonstop.lats[i])) i = j;
    const lat = nonstop.lats[i];
    if (Math.abs(lat) < 72) return null;
    const shift = lineShift(view, nonstop.lons);
    return { x: (nonstop.lons[i] + shift - view.lon0) * view.k, y: -lat, north: lat > 0 };
  }, [nonstop, view]);

  const label = !points.length
    ? "World map"
    : connect
      ? `Map of the route ${points.map((p) => p.code).join(" to ")}`
      : `Map of ${points.map((p) => p.code).join(", ")}, without a route until every airport is found`;
  const seen = new Set<string>();

  return (
    <div ref={ref} className="w-full overflow-hidden rounded-md border border-line bg-[#eef5fc]">
      <svg
        role="img"
        aria-label={label}
        width={width}
        height={height}
        viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}
        preserveAspectRatio="xMidYMid meet"
        className="block h-auto w-full"
      >
        <title>{label}</title>
        <path d={grid} fill="none" stroke="#d3e1f1" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        {equator && (
          <path
            d={`M${view.x} 0H${view.x + view.width}`}
            stroke="#bcd0e8"
            strokeWidth={1}
            strokeDasharray="4 4"
            vectorEffect="non-scaling-stroke"
          />
        )}
        <path d={dots} stroke="#93abc8" strokeWidth={2.4} strokeLinecap="round" vectorEffect="non-scaling-stroke" fill="none" />
        {nonstop && (
          <path
            d={linePath(view, nonstop.lats, nonstop.lons)}
            fill="none"
            stroke="#53565a"
            strokeOpacity={0.6}
            strokeWidth={1.5}
            strokeDasharray="5 5"
            vectorEffect="non-scaling-stroke"
          />
        )}
        {polar && (
          <text
            x={Math.min(Math.max(polar.x, view.x + 60 * s), view.x + view.width - 60 * s)}
            y={polar.north ? Math.max(polar.y, view.y) + 15 * s : Math.min(polar.y, view.y + view.height) - 8 * s}
            textAnchor="middle"
            fontSize={11 * s}
            fontWeight={600}
            fill="#53565a"
            stroke="#eef5fc"
            strokeWidth={3 * s}
            paintOrder="stroke"
          >
            {polar.north ? "Nonstop flies over the Arctic" : "Nonstop flies near Antarctica"}
          </text>
        )}
        {routePath && (
          <>
            <path d={routePath} fill="none" stroke="#fff" strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            <path d={routePath} fill="none" stroke="#006fcf" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          </>
        )}
        {marks.map(({ a, x, y, dx, dy }, i) => {
          const end = i === 0 || i === marks.length - 1;
          const first = !seen.has(a.code);
          seen.add(a.code);
          // Flip a label back inside the frame when it would spill over an edge.
          const gap = 14 * s;
          const lx = x + dx * gap < view.x + 26 * s ? Math.abs(dx) : x + dx * gap > view.x + view.width - 26 * s ? -Math.abs(dx) : dx;
          const ly = y + dy * gap < view.y + 18 * s ? Math.abs(dy) || 1 : y + dy * gap > view.y + view.height - 10 * s ? -(Math.abs(dy) || 1) : dy;
          const anchor = lx > 0.45 ? "start" : lx < -0.45 ? "end" : "middle";
          return (
            <g key={`${a.code}-${i}`}>
              <circle cx={x} cy={y} r={(end ? 6 : 5) * s} fill={end ? "#00175a" : "#fff"} stroke={end ? "#fff" : "#006fcf"} strokeWidth={2.5 * s} />
              {first && (
                <text
                  x={x + lx * gap}
                  y={y + ly * gap + 4.5 * s}
                  textAnchor={anchor}
                  fontSize={13 * s}
                  fontWeight={700}
                  fill="#00175a"
                  stroke="#fff"
                  strokeWidth={3.5 * s}
                  paintOrder="stroke"
                  strokeLinejoin="round"
                >
                  {a.code}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
