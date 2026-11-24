/**
 * Pages that other sections add and that aren't on this branch yet: the Points & Miles section's /points pages and
 * the card strategy section's /next-card. Links to them stay hidden (tool tiles, the Start here flow and results that
 * need them, the distance page's sweet-spots button) until the page exists, so nothing links to a 404. A test fails
 * once one of these routes appears under src/app, so the entry is removed, and the links come back, when that
 * section merges.
 */
export const PENDING_ROUTES: readonly string[] = ["/points", "/next-card"];

/** Whether a link's page is on the site (false while its section hasn't landed). */
export function routeLive(href: string): boolean {
  const path = href.split(/[?#]/)[0];
  return !PENDING_ROUTES.some((r) => path === r || path.startsWith(`${r}/`));
}
