## Travel tools

`/tools` lists every tool (catalog: `frontend/features/tools/catalog.ts`, also used for Start here's result icons).
Each tool page is a thin route in `app/tools/<tool>/page.tsx` with a `ToolHero` and its client view from
`frontend/features/tools/`, inside `<Suspense>` (they all read `useSearchParams`). State lives in the URL via
`window.history.replaceState` (Start here uses `pushState` so Back works), so every result can be shared.

| Route | View | URL state |
| --- | --- | --- |
| `/tools/distance` | `distance-calculator.tsx`, `airport-input.tsx` (combobox), `route-map.tsx` | `?route=JFK-LHR-SIN` |
| `/tools/baggage` | `baggage-lookup.tsx` | `?airline=DL` (a code) or `?q=` |
| `/tools/entry-requirements` | `entry-requirements.tsx` | `?q=japan&req=eta` |
| `/tools/hotel-points` | `hotel-points.tsx` | `?program=&brand=&rate=&nights=&tax=&tier=&card=` |
| `/start` | `frontend/features/start/start-wizard.tsx` | `?flow=trip&from=JFK&to=HND&cabin=business` |

- **Flight distance:** `shared/lib/geo.ts` (haversine on R = 6,371 km; miles = km × 0.621371, nm = km × 0.539957;
  flight time = 30 min + 1 h per 530 mi; great-circle arcs; map views that re-center on the route so Pacific routes
  aren't cut at the date line) and `shared/lib/airports.ts` (search ranking, `parseRoute`, `summarizeRoute`). The
  airport list is `public/data/airports.json` (~265 KB), fetched in the browser only by tools that need it
  (`frontend/state/airports.ts`), never bundled. Rebuild it from OurAirports (public domain) with
  `npm run airports:build` (downloads the CSV) or `npm run airports:build -- path/to/airports.csv`: scheduled-service
  large/medium/small airports with an IATA code, rows `[code, name, city, country, lat, lon]`, biggest first. Credit
  "Airport data: OurAirports (public domain)" wherever it shows. The map draws every airport as a dot (no tiles).
- **Sweet-spot links:** `shared/data/travel/regions.ts` maps a country (plus Hawaii by coordinates) to the Points &
  Miles section's regions; `sweetSpotsHref(region)` → `/points/sweet-spots?region=…`. Keep `SWEET_SPOT_REGIONS` equal
  to `REGIONS` in `shared/data/points/types.ts` (or import it from there).
- **Hotel points:** `shared/lib/hotel-points.ts`. Hotel points = room rate (taxes only if `eligibleSpend` says
  "including taxes") × brand rate (a `brandExceptions` entry or `basePerDollar`) + elite bonus % of that; card points
  = total charged × the card's rate. Values use the valuation median (`shared/data/travel/valuations.ts`, ids =
  program slug, e.g. `marriott-bonvoy`, or bank currency id, e.g. `chase-ur`); cards without one fall back to
  `pointValueCents`. Wallet cards earn their `calculator-rates.ts` hotel rate.
- **Lounge guest cost:** `shared/lib/guest-cost.ts` + `frontend/features/lounges/guest-cost.tsx` (`GuestCost`, and
  `GuestCostFinder` on `/lounges`). Cost per visit = guests beyond `freeGuests` × `guestFeeUsd` (else the network's
  default fee); reached spend unlocks (`effect` as `{ freeGuests, guestFeeUsd, visits }` or a phrase like
  "2 complimentary guests") change both. Best card = cheapest, then more spare free guests, then unlimited visits.
  Lounge rows (`lounge-row.tsx`) have a "Guest cost" toggle; once a count is set (`?guests=2` or in any calculator)
  rows you can enter show a one-line summary. Guest count and toggles are shared in memory across the page.
- **Start here:** `shared/lib/start-flows.ts` holds the five flows (2–4 one-tap questions each, optional `when`
  conditions, `accepts` for answers from shared links) and builds result links with parameters filled in. Some
  targets live in other sections (`/points…`, `/next-card`); their parameter names (`currency`, `from`, `cabin`,
  `type`, `spend`, `fee`, `travel`, `category`, `card`, `credits`) are suggestions those pages may read.

### Travel data (`src/shared/data/travel/`)

Types in `types.ts`. One file per dataset: `baggage.ts`, `entry-requirements.ts`, `hotel-earning.ts`,
`valuations.ts`, `lounge-guest-rules.ts`. The types accept the forms research delivers: baggage `standards` and
`awardRules` as strings or `{ fact, sources }`; a hotel `program` as a name or an id (shown via `programName()`);
`basePerDollar: null` while unconfirmed (the calculator then counts card points only and says so); `iso2: null` for
a group such as the Schengen Area; guest-rule `visits` as a number, `"unlimited"` or words ("10 per year"). While a file holds placeholders it starts with
`// SEED DATA: replaced by verified research before release` and its flag in `seed-status.ts` is `true`, which shows
a "Preview data" notice on its pages. When verified data lands: replace the object (same shape), delete the header,
set the flag to `false`. A test fails if a header and its flag disagree. Keep `asOf` (ISO dates) and `sources` (URLs)
on every record, link only official sources for fees and entry rules, and never rename card or network ids (they
must exist in `shared/data/cards` and `shared/data/networks.ts`; a test checks). Entry rules are for U.S. passport
holders; each destination's `officialSource` is its travel.state.gov page, and the page tells people to confirm there.
Tests: `tests/travel.test.ts`.
