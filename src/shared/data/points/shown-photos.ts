import { REGIONS, type Photo } from "./types";
import { sweetSpots } from "./sweet-spots";
import { airportPhotos, regionPhotos } from "./photos";
import { lounges } from "../lounges";

// Kept out of index.ts: it needs the lounge list, which no Points & Miles page should load just for the About page.

/**
 * The photos pages show, for the credits on the About page: a region's photo on the sweet spots that go there (cards,
 * the hub's postcards), and an airport's in the header of its lounge page (airports with lounges have one). Lounge
 * photos aren't shown anywhere yet, nor a region no sweet spot goes to (Canada), so they aren't listed.
 */
export function shownPhotos(): { regions: Photo[]; airports: { code: string; photo: Photo }[] } {
  const regions = new Set(sweetSpots.map((s) => s.to));
  const withPage = new Set(lounges.map((l) => l.airportCode));
  return {
    regions: REGIONS.filter((r) => regions.has(r))
      .map((r) => regionPhotos[r])
      .filter((p): p is Photo => Boolean(p)),
    airports: Object.entries(airportPhotos)
      .filter((e): e is [string, Photo] => Boolean(e[1]) && withPage.has(e[0]))
      .map(([code, photo]) => ({ code, photo }))
      .sort((a, b) => a.code.localeCompare(b.code)),
  };
}
