import { REGIONS, type Photo } from "./types";
import { sweetSpots } from "./sweet-spots";
import { airportPhotos, regionPhotos } from "./photos";
import { lounges } from "../lounges";
import { sweetSpotPhoto } from "./index";

// Kept out of index.ts: it needs the lounge list, which no Points & Miles page should load just for the About page.

/**
 * The photos pages show, for the credits on the About page: a region's photo on the sweet spots that go there (cards,
 * the hub's postcards), and an airport's in the header of its lounge page (airports with lounges have one). Lounge
 * photos aren't shown anywhere yet, nor a region no sweet spot goes to (Canada), so they aren't listed.
 */
export function shownPhotos(): { regions: Photo[]; airports: { code: string; photo: Photo }[] } {
  // A landmark photo heads only the sweet spots that go there (sweetSpotPhoto), so it's listed only if one does.
  const shown = new Set(sweetSpots.map((s) => sweetSpotPhoto(s)).filter((p): p is Photo => Boolean(p)));
  const withPage = new Set(lounges.map((l) => l.airportCode));
  return {
    regions: REGIONS.map((r) => regionPhotos[r]).filter((p): p is Photo => Boolean(p) && shown.has(p!)),
    airports: Object.entries(airportPhotos)
      .filter((e): e is [string, Photo] => Boolean(e[1]) && withPage.has(e[0]))
      .map(([code, photo]) => ({ code, photo }))
      .sort((a, b) => a.code.localeCompare(b.code)),
  };
}
