// SEED DATA: replaced by verified research before release
import type { Photo, Region } from "./types";

// Credited photos served from /public/photos. Every place that shows one renders a styled fallback when there's no
// entry, and a "Photo: <author> · <license>" credit linking to `sourcePage` when there is. Only add photos whose
// license allows reuse, and fill in every credit field.

/** Destination photos for sweet spots and region tiles, keyed by Region. */
export const regionPhotos: Partial<Record<Region, Photo>> = {};

/** Airport photos, keyed by IATA code (e.g. "JFK"). */
export const airportPhotos: Partial<Record<string, Photo>> = {};

/** Lounge photos, keyed by lounge id from shared/data/lounges.ts. */
export const loungePhotos: Partial<Record<string, Photo>> = {};
