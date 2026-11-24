import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { FOOTER_COLUMNS, NAV, TOP_LINKS, groupActive } from "../src/frontend/components/site-nav";

const APP = join(process.cwd(), "src/app");

/** Every page under src/app as a route pattern ("/lounges/[code]"); route groups add no segment. */
function pages(dir = APP, route = ""): string[] {
  const out = existsSync(join(dir, "page.tsx")) ? [route || "/"] : [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory() || e.name === "api" || e.name.startsWith("_")) continue;
    const seg = /^\(.+\)$/.test(e.name) ? "" : `/${e.name}`;
    out.push(...pages(join(dir, e.name), route + seg));
  }
  return out;
}

/** The page file a link opens (dynamic segments match any value), or null. */
function pageFile(href: string): string | null {
  const segments = href.split(/[?#]/)[0].split("/").filter(Boolean);
  const walk = (dir: string, i: number): string | null => {
    const dirs = readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
    for (const d of dirs.filter((d) => /^\(.+\)$/.test(d))) {
      const hit = walk(join(dir, d), i);
      if (hit) return hit;
    }
    if (i === segments.length) return existsSync(join(dir, "page.tsx")) ? join(dir, "page.tsx") : null;
    if (dirs.includes(segments[i])) {
      const hit = walk(join(dir, segments[i]), i + 1);
      if (hit) return hit;
    }
    for (const d of dirs.filter((d) => /^\[[^.\]]+\]$/.test(d))) {
      const hit = walk(join(dir, d), i + 1);
      if (hit) return hit;
    }
    return null;
  };
  return walk(APP, 0);
}

const menuLinks = NAV.flatMap((g) => (g.items ? g.items.map((i) => i.href) : [g.href!]));
const allLinks = [...menuLinks, ...TOP_LINKS.map((l) => l.href), ...FOOTER_COLUMNS.flatMap((c) => c.links.map((l) => l.href))];

/** The tracker's tabs, as `?tab=` takes them. */
const trackerTabs = [...readFileSync(join(process.cwd(), "src/frontend/features/tracker/tracker-tabs.tsx"), "utf8").matchAll(/\{ id: "(\w+)", label:/g)].map(
  (m) => m[1],
);

test("every menu, top-strip and footer link opens a page, tab or section that exists", () => {
  assert.ok(trackerTabs.includes("points") && trackerTabs.includes("applications"), "read the tracker's tabs");
  for (const href of allLinks) {
    const file = pageFile(href);
    assert.ok(file, `${href} has no page under src/app`);
    const [beforeHash, hash] = href.split("#");
    const tab = new URLSearchParams(beforeHash.split("?")[1] ?? "").get("tab");
    if (tab !== null) {
      assert.equal(beforeHash.split("?")[0], "/tracker", `${href}: only the tracker takes ?tab=`);
      assert.ok(trackerTabs.includes(tab), `${href}: the tracker has no "${tab}" tab`);
    }
    if (hash) assert.ok(readFileSync(file!, "utf8").includes(`id="${hash}"`), `${href}: the page has no #${hash}`);
  }
});

test("menus: each item lights up its own group, and no menu lists a link twice", () => {
  for (const g of NAV) {
    const hrefs = g.items ? g.items.map((i) => i.href) : [g.href!];
    assert.equal(new Set(hrefs).size, hrefs.length, `${g.label} repeats a link`);
    for (const h of hrefs) assert.ok(groupActive(g, h.split(/[?#]/)[0]), `${h} isn't under ${g.label}'s match`);
  }
  for (const c of FOOTER_COLUMNS) assert.equal(new Set(c.links.map((l) => l.href)).size, c.links.length, `footer ${c.title} repeats a link`);
});

/** Pages no menu links to, and why. */
const UNLINKED: Record<string, string> = {
  "/move": "the old address's handoff: proxy.ts rewrites every request to credit-card-hacking.vercel.app here",
  "/import": "where /move sends a wallet saved at the old address",
};

/** Detail pages, reached from a list page that is in the menus (it links every one of them). */
const PARENTS: Record<string, string> = {
  "/cards/[id]": "/cards",
  "/lounges/[code]": "/lounges",
  "/points/programs/[id]": "/points/programs",
};

test("every page is in a menu or the footer, or one click from a page that is", () => {
  const all = pages();
  const linked = new Set(allLinks.map((h) => h.split(/[?#]/)[0]));
  for (const page of all) {
    if (page === "/" || UNLINKED[page]) continue; // the home page is the logo
    if (PARENTS[page]) assert.ok(linked.has(PARENTS[page]), `${page}: its list page ${PARENTS[page]} isn't in a menu`);
    else assert.ok(linked.has(page), `${page} isn't in a menu or the footer (add it to site-nav.ts, or to PARENTS here)`);
  }
  for (const p of [...Object.keys(UNLINKED), ...Object.keys(PARENTS)]) assert.ok(all.includes(p), `${p} is gone: drop it from this test`);
  // The detail pages' list pages link each one (the link pattern, in the list's views).
  const linksTo = (pattern: string) =>
    readdirSync(join(process.cwd(), "src/frontend"), { recursive: true, withFileTypes: true }).some(
      (e) => e.isFile() && /\.tsx?$/.test(e.name) && readFileSync(join(e.parentPath, e.name), "utf8").includes(pattern),
    );
  for (const pattern of ["`/cards/${", "`/lounges/${", "`/points/programs/${"]) assert.ok(linksTo(pattern), `nothing links ${pattern}…}`);
});
