/** Great-circle math for the flight distance tool: distances, flight-time estimates and arcs for the route map. */

export const EARTH_RADIUS_KM = 6371;
export const MILES_PER_KM = 0.621371;
export const NM_PER_KM = 0.539957;

export interface LatLon {
  lat: number;
  lon: number;
}

const rad = (deg: number) => (deg * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** Central angle between two points, in radians (haversine formula). */
function centralAngle(a: LatLon, b: LatLon): number {
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
  return 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Great-circle distance in kilometres, on a sphere of radius 6,371 km. */
export const haversineKm = (a: LatLon, b: LatLon) => EARTH_RADIUS_KM * centralAngle(a, b);
export const kmToMiles = (km: number) => km * MILES_PER_KM;
export const kmToNm = (km: number) => km * NM_PER_KM;

/** Rough block time for a flight: 30 minutes for taxi, climb and descent, plus an hour per 530 miles. */
export const flightMinutes = (miles: number) => 30 + (miles / 530) * 60;

/** "7h 05m", rounded to the nearest 5 minutes (the estimate isn't more precise than that). */
export function formatDuration(minutes: number): string {
  const total = Math.max(0, Math.round(minutes / 5) * 5);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h === 0 ? `${m}m` : `${h}h ${String(m).padStart(2, "0")}m`;
}

/** Points along the great circle from a to b (inclusive), for drawing. Longitudes stay in −180…180. */
export function greatCirclePoints(a: LatLon, b: LatLon, segments = 64): LatLon[] {
  const d = centralAngle(a, b);
  if (d < 1e-9) return [a, b];
  const [φ1, λ1, φ2, λ2] = [rad(a.lat), rad(a.lon), rad(b.lat), rad(b.lon)];
  const out: LatLon[] = [];
  for (let i = 0; i <= segments; i++) {
    const f = i / segments;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
    const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
    const z = A * Math.sin(φ1) + B * Math.sin(φ2);
    out.push({ lat: deg(Math.atan2(z, Math.hypot(x, y))), lon: deg(Math.atan2(y, x)) });
  }
  return out;
}

/** Longitudes made continuous along a path (no ±360° jumps), so a line across the date line stays one line. */
export function unwrapLongitudes(lons: number[]): number[] {
  const out: number[] = [];
  for (const lon of lons) {
    let v = lon;
    const prev = out[out.length - 1];
    if (prev !== undefined) {
      while (v - prev > 180) v -= 360;
      while (v - prev < -180) v += 360;
    }
    out.push(v);
  }
  return out;
}

/** Wraps a longitude into [center − 180, center + 180). */
export function wrapLongitude(lon: number, center: number): number {
  return ((((lon - center + 180) % 360) + 360) % 360) - 180 + center;
}

// --- Route map view ----------------------------------------------------------------------------------------------

/**
 * A window onto an equirectangular map (with a standard parallel, so mid-latitude routes aren't stretched sideways).
 * x grows east and y grows south, in degrees of latitude.
 */
export interface MapView {
  /** Central meridian: the map is cut at lon0 ± 180. */
  lon0: number;
  /** Horizontal scale, cos(standard parallel). */
  k: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export const project = (view: Pick<MapView, "lon0" | "k">, p: LatLon) => ({
  x: (wrapLongitude(p.lon, view.lon0) - view.lon0) * view.k,
  y: -p.lat,
});

/** Like `project`, but for a longitude already unwrapped along a path (may run past ±180 from lon0). */
export const projectUnwrapped = (view: Pick<MapView, "lon0" | "k">, lat: number, lon: number) => ({
  x: (lon - view.lon0) * view.k,
  y: -lat,
});

const WORLD: MapView = { lon0: 10, k: 1, x: -180, y: -84, width: 360, height: 144 };

/**
 * The map window that fits a route (its arcs, with longitudes unwrapped along the route), padded, at least
 * `minWidth` degrees wide, at the given width:height aspect. With no points it shows the inhabited world.
 */
export function viewForRoute(points: LatLon[], aspect: number, minWidth = 50): MapView {
  if (points.length === 0) {
    const height = WORLD.width / aspect;
    return { ...WORLD, y: Math.max(-90, -18 - height / 2), height };
  }
  const lons = unwrapLongitudes(points.map((p) => p.lon));
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const lon0 = (minLon + maxLon) / 2;
  const lats = points.map((p) => p.lat);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const k = Math.cos(rad(Math.max(-60, Math.min(60, (minLat + maxLat) / 2))));

  let width = Math.max((maxLon - minLon) * k * 1.2 + 16, minWidth);
  let height = Math.max((maxLat - minLat) * 1.25 + 14, 18);
  if (width / height < aspect) width = height * aspect;
  else height = width / aspect;
  width = Math.min(width, 360 * k);
  height = Math.min(height, 170);

  const cy = -(minLat + maxLat) / 2;
  const y = Math.min(Math.max(cy - height / 2, -89), 89 - height);
  return { lon0, k, x: -width / 2, y, width, height };
}

/** Graticule lines every `step` degrees across a view, as SVG path data. */
export function graticulePath(view: MapView, step: number): string {
  const parts: string[] = [];
  const left = view.lon0 + view.x / view.k;
  const right = view.lon0 + (view.x + view.width) / view.k;
  for (let lon = Math.ceil(left / step) * step; lon <= right; lon += step) {
    const x = ((lon - view.lon0) * view.k).toFixed(2);
    parts.push(`M${x} ${view.y.toFixed(2)}V${(view.y + view.height).toFixed(2)}`);
  }
  for (let lat = Math.ceil(-(view.y + view.height) / step) * step; lat <= -view.y; lat += step) {
    if (lat === 0) continue;
    parts.push(`M${view.x.toFixed(2)} ${(-lat).toFixed(2)}H${(view.x + view.width).toFixed(2)}`);
  }
  return parts.join("");
}

/** Whole turns (in degrees) that bring a continuous line nearest the view's central meridian. */
export function lineShift(view: Pick<MapView, "lon0">, lons: number[]): number {
  if (lons.length === 0) return 0;
  return Math.round((view.lon0 - lons[Math.floor(lons.length / 2)]) / 360) * 360;
}

/**
 * SVG path data for a line through points whose longitudes run continuously (see unwrapLongitudes). Points are
 * shifted by whole turns so the line sits nearest the view's central meridian.
 */
export function linePath(view: Pick<MapView, "lon0" | "k">, lats: number[], lons: number[]): string {
  if (lats.length === 0) return "";
  const shift = lineShift(view, lons);
  return lats
    .map((lat, i) => {
      const { x, y } = projectUnwrapped(view, lat, lons[i] + shift);
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join("");
}
