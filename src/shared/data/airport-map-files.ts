/**
 * Airports with a pre-built map in public/airport-maps/<CODE>.json (`npm run maps:build`). The page asks for the file
 * only when it's listed here, so an airport without one goes straight to building its map in the browser instead of a
 * 404. A test keeps this list and the folder in step.
 */
export const PREBUILT_AIRPORT_MAPS: readonly string[] = [
  "ATL",
  "CLT",
  "DEN",
  "DFW",
  "IAD",
  "IAH",
  "JFK",
  "LAX",
  "LGA",
  "LHR",
  "ORD",
  "SEA",
  "SFO",
];
