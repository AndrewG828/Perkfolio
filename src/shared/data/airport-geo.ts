/**
 * Map data for airports in the lounge finder: the airport's reference point (for the embedded OpenStreetMap
 * view) and, where natural sorting gets it wrong, the real order of terminals/concourses (as you'd walk or ride
 * the train between them). Coordinates are the published airport reference points, rounded to ~100 m.
 */
export interface AirportGeo {
  lat: number;
  lon: number;
  /** Half-height of the map view in degrees; larger airports need a wider view. */
  span?: number;
  /** Terminal names (as used in lounges.ts, before any comma) in physical order. */
  terminalOrder?: string[];
}

export const airportGeo: Record<string, AirportGeo> = {
  // United States
  ATL: {
    lat: 33.6407,
    lon: -84.4277,
    span: 0.025,
    // Domestic terminal → Plane Train east: T, A, B, C, D, E, F (international)
    terminalOrder: ["Concourse T", "Concourse A", "Concourse B", "Concourse C", "Concourse D", "Concourse E", "Concourse F"],
  },
  AUS: { lat: 30.1975, lon: -97.6664 },
  ANC: { lat: 61.1743, lon: -149.9962 },
  BDL: { lat: 41.9389, lon: -72.6832 },
  BOS: { lat: 42.3656, lon: -71.0096 },
  BWI: { lat: 39.1754, lon: -76.6683 },
  CLT: { lat: 35.214, lon: -80.9431 },
  CVG: { lat: 39.0489, lon: -84.6678 },
  DCA: { lat: 38.8512, lon: -77.0402 },
  DEN: { lat: 39.8561, lon: -104.6737, span: 0.04 },
  DFW: { lat: 32.8998, lon: -97.0403, span: 0.04 },
  DTW: { lat: 42.2162, lon: -83.3554, span: 0.03 },
  EWR: { lat: 40.6895, lon: -74.1745 },
  HNL: { lat: 21.3245, lon: -157.9251 },
  IAD: { lat: 38.9531, lon: -77.4565, span: 0.03 },
  IAH: { lat: 29.9902, lon: -95.3368, span: 0.03 },
  JFK: { lat: 40.6413, lon: -73.7781, span: 0.025 },
  LAS: { lat: 36.084, lon: -115.1537 },
  LAX: { lat: 33.9416, lon: -118.4085 },
  LGA: { lat: 40.7769, lon: -73.874 },
  MCO: { lat: 28.4312, lon: -81.3081, span: 0.03 },
  MIA: { lat: 25.7959, lon: -80.287 },
  MSP: { lat: 44.8848, lon: -93.2223, span: 0.03 },
  ORD: { lat: 41.9742, lon: -87.9073, span: 0.03 },
  PDX: { lat: 45.5898, lon: -122.5951 },
  PHL: { lat: 39.8744, lon: -75.2424 },
  PHX: { lat: 33.4352, lon: -112.0101 },
  SAN: { lat: 32.7338, lon: -117.1933 },
  SEA: { lat: 47.4502, lon: -122.3088 },
  SFO: { lat: 37.6213, lon: -122.379 },
  SJC: { lat: 37.3639, lon: -121.9289 },
  SLC: { lat: 40.7899, lon: -111.9791 },
  SMF: { lat: 38.6951, lon: -121.5908 },
  // Americas
  YYZ: { lat: 43.6777, lon: -79.6248, span: 0.03 },
  CUN: { lat: 21.0365, lon: -86.8771 },
  MEX: { lat: 19.4361, lon: -99.0719 },
  MTY: { lat: 25.7785, lon: -100.1069 },
  EZE: { lat: -34.8222, lon: -58.5358 },
  // Europe & Middle East
  LHR: { lat: 51.47, lon: -0.4543, span: 0.025 },
  CDG: { lat: 49.0097, lon: 2.5479, span: 0.03 },
  FRA: { lat: 50.0379, lon: 8.5622, span: 0.03 },
  AMS: { lat: 52.3105, lon: 4.7683, span: 0.03 },
  ARN: { lat: 59.6498, lon: 17.9238 },
  DXB: { lat: 25.2532, lon: 55.3657, span: 0.03 },
  // Asia-Pacific
  DEL: { lat: 28.5562, lon: 77.1 },
  BOM: { lat: 19.0896, lon: 72.8656 },
  HKG: { lat: 22.308, lon: 113.9185, span: 0.03 },
  HND: { lat: 35.5494, lon: 139.7798, span: 0.03 },
  NRT: { lat: 35.772, lon: 140.3929, span: 0.03 },
  SIN: { lat: 1.3644, lon: 103.9915, span: 0.03 },
  SYD: { lat: -33.9399, lon: 151.1753 },
  MEL: { lat: -37.669, lon: 144.841 },
};

const DEFAULT_SPAN = 0.02;

/** OpenStreetMap embed URL centered on the airport (no API key; tiles load from openstreetmap.org). */
export function osmEmbedUrl(code: string): string | null {
  const g = airportGeo[code];
  if (!g) return null;
  const dLat = g.span ?? DEFAULT_SPAN;
  const dLon = dLat * 1.6 / Math.max(0.3, Math.cos((g.lat * Math.PI) / 180));
  const bbox = [g.lon - dLon, g.lat - dLat, g.lon + dLon, g.lat + dLat].map((n) => n.toFixed(4)).join(",");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik`;
}

export function osmLink(code: string): string | null {
  const g = airportGeo[code];
  return g ? `https://www.openstreetmap.org/?mlat=${g.lat}&mlon=${g.lon}#map=15/${g.lat}/${g.lon}` : null;
}

/** Google Maps search for a specific lounge (Google indexes most airport lounges as places). */
export function directionsUrl(loungeName: string, terminal: string, airportName: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${loungeName}, ${terminal}, ${airportName}`)}`;
}
