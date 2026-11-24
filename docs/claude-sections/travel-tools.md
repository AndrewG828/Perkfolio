## Travel tools

`/tools` lists every tool (catalog: `frontend/features/tools/catalog.ts`, also used for Start here's result icons).
Links to pages other sections add (`/points…`, `/next-card`) stay hidden while those routes aren't on the branch:
`shared/lib/site-routes.ts` lists them in `PENDING_ROUTES` and `routeLive(href)` gates tool tiles, Start here flows
and results (`LIVE_FLOWS`, `resultsFor`) and the distance page's sweet-spots button. A test checks every link the
tools build against `src/app` and fails once a pending route exists, so the entry is removed when that section merges.
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
  aren't cut at the date line) and `shared/lib/airports.ts` (search ranking with `METRO_AIRPORTS` for places filed
  under other cities, like Tokyo's Narita or New York's Newark; `parseRouteParam`, which keeps a long link's origin and
  destination and names the stops it drops; `sameAirportLegs`; `summarizeRoute`). Results found through a metro area
  are labelled with it (`metroNamesFor`: "Milan" for MXP, which OurAirports files under Ferno). A route with an unknown
  code or a same-airport leg isn't added up: the page says what to fix, and the map marks the airports without legs
  (`RouteMap connect={false}`). "Add a stop" moves focus into the new stop. A nonstop arc over a pole is labelled. The
  airport list is `public/data/airports.json` (~265 KB), fetched in the browser only by tools that need it
  (`frontend/state/airports.ts`), never bundled. Rebuild it from OurAirports (public domain) with
  `npm run airports:build` (downloads the CSV) or `npm run airports:build -- path/to/airports.csv`: scheduled-service
  large/medium/small airports with an IATA code, rows `[code, name, city, country, lat, lon]`, biggest first. Credit
  "Airport data: OurAirports (public domain)" wherever it shows. The map draws every airport as a dot (no tiles).
- **Sweet-spot links:** `shared/data/travel/regions.ts` maps a country (plus Hawaii by coordinates) to the Points &
  Miles section's regions; `sweetSpotsHref(region)` → `/points/sweet-spots?region=…`. Keep `SWEET_SPOT_REGIONS` equal
  to `REGIONS` in `shared/data/points/types.ts` (or import it from there).
- **Hotel points:** `shared/lib/hotel-points.ts`. Hotel points = room rate (taxes only if `taxesEarn` is true, or,
  without it, `eligibleSpend` says "including taxes") × brand rate (a `brandExceptions` entry or `basePerDollar`) +
  elite bonus % of that (none at a brand group with `eliteBonus: false`); card points = total charged × the card's
  rate. Cash back is a currency that starts with "Cash" (`earnsCashBack`); Bilt Points "(plus Bilt Cash)" are points.
  What isn't confirmed is said on the page, not assumed: `basePerDollar: null` counts card points only,
  `taxesEarn: null` counts the room rate only, and a tier with `percent: null` adds no bonus. Values use the
  valuation median (`shared/data/travel/valuations.ts`, ids = program slug, e.g. `marriott-bonvoy`, or bank currency
  id, e.g. `chase-ur`); cards without one fall back to `pointValueCents`. Wallet cards earn their `calculator-rates.ts`
  hotel rate, except another chain's co-branded card, whose bonus is for its own chain: it earns its `baseRate` there
  (`hotelRateAt`: a World of Hyatt card earns 1x at a Marriott). Currencies show without the card data's aside
  (`currencyName`: "Bilt Points", since no Bilt Cash is counted).
- **Lounge guest cost:** `shared/lib/guest-cost.ts` + `frontend/features/lounges/guest-cost.tsx` (`GuestCost`, and
  `GuestCostFinder` on `/lounges`). Cost per visit = guests beyond `freeGuests` × the card's `guestFeeUsd`. A null
  fee means the issuer doesn't publish one, so those guests show "Fee not published": the network's usual fee is
  never assumed, since issuers price one network differently (Priority Pass: $27 with Chase, $35 with Capital One,
  unpublished with Amex). Reached spend unlocks (`effect` as `{ freeGuests, guestFeeUsd, visits }` or a phrase like
  "2 complimentary guests") change the allowance. `freeGuests: null` leaves guests unpriced ("Not confirmed"), and
  "0 per year" visits mean the network opens only after an unlock ("Needs unlock"). `guestLimit` caps guests per visit
  (`beyond: "your immediate family"` lets family past it, `beyondFree` at no charge), `guestPasses` names passes the
  card includes and `passesOnly` means everyone enters on one of the card's passes, the cardmember included (Citi
  Strata Elite: 2 guests use 3 of the 4 yearly passes; `visits` then counts passes). `localFees` words a USD fee's
  prices abroad (Maple Leaf: CA$59, £59, €59). `locationRules` override a card's rule at some lounges, matched by
  airport or lounge name (`GuestPlace`): Centurion Lounges abroad (local prices such as £35 in London, their own
  allowances in Sydney, Buenos Aires, Delhi, Mexico City, where the $75,000 unlock isn't stated to apply), Capital One
  Landings (1 free guest after the unlock) and Arlanda (`notAdmitted`: Business Platinum isn't let in). Cards a
  location rule doesn't cover aren't priced there. A lounge whose notes name a Priority Pass co-pay ("$15 co-pay",
  `copayFor` reads `GuestPlace.notes`) adds it to Priority Pass options, which rank after equal ones without it.
  Costs carry a currency (`Money`); `costLabel` and `costDetail` word them. Best card = cheapest, then no co-pay, then
  more spare free guests, then unlimited visits; a card that costs the same through two networks goes in through the
  lounge's own (Amex at Escape and Plaza Premium lounges checks in under their rules, not Priority Pass). Every card
  tied for cheapest is named; when more than 3 tie, one line ("Free with 8 of these 9 cards") replaces the badges.
  Lounge rows (`lounge-row.tsx`) have a "Guest cost" toggle; once a count is set (`?guests=2` or in any calculator)
  rows you can enter show a one-line summary. Guest count and toggles are shared in memory across the page. On phones `/lounges`
  puts the airport search first and the guest finder after the big-airport tiles (the column wrappers use
  `display: contents` below `lg`).
- **Start here:** `shared/lib/start-flows.ts` holds the five flows (2–4 one-tap questions each, optional `when`
  conditions, `accepts` for answers from shared links) and builds result links with parameters filled in. Some
  targets live in other sections (`/points…`, `/next-card`); their parameter names (`currency`, `from`, `cabin`,
  `type`, `spend`, `fee`, `travel`, `category`, `card`, `credits`) are suggestions those pages may read. Until those
  pages exist, the points flow (`requires: "/points"`) and results that link to them are left out (`site-routes.ts`).

### Travel data (`src/shared/data/travel/`)

Types in `types.ts`. One file per dataset: `baggage.ts`, `entry-requirements.ts`, `hotel-earning.ts`,
`valuations.ts`, `lounge-guest-rules.ts`, filled from research verified in November 2026. A `null` means "not
confirmed", and pages say so rather than guess (an entry fee shows "check the official site", a max stay "not
confirmed"). The types accept the forms research delivers: facts as strings or `{ fact, sources, status }`; a hotel
`program` as a name or an id (shown via `programName()`); `iso2: null` plus `members` for a group such as the Schengen
Area; guest-rule `visits` as a number, `"unlimited"` or words ("10 per year").
- **Baggage:** `airlines` have a confirmed official link (`verification.method`: `airline-site`, the address is on the
  airline's own domain, or `two-outlets`, two independent outlets link it), explained under "How this was checked".
  `pendingAirlines` have none; a `candidate` is a page on the airline's domain that a single article links, shown as
  "Possible page · cited by <outlet>, <month>, not verified", with who links it under "About this link". Addresses in
  notes become links (`LinkedText`). A fee row with `ceased` (Spirit) stays out of the comparison, and searching for it
  says it stopped flying: a search finds it by code or by 3+ letters starting its name or a word in it, never by
  "air", "airlines" or letters inside a word (`namesAirline` in `shared/lib/airline-search.ts`). On phones your
  cards' bag perks, then the data notice, follow the search, and a featured airline's free-bag and Basic Economy
  notes are folded so the perks come right after its fees; the unverified list shows 12 airlines and the sidebar's rule lists
  9 and 5 until "Show all".
- **Entry:** `officialSource` is the destination's confirmed official page (GOV.UK for the UK, Canada.ca) or else the
  State Department's travel advisories index (its country pages moved in 2026 and aren't confirmed). Only the UK is
  `confidence: "high"`; single-outlet details live in `notes` or `feeNote`, attributed to their outlet. `caution`
  shows on the collapsed row (Cuba: U.S. law bars tourist travel). Search (`shared/lib/entry-search.ts`) also takes
  common names and places (`COUNTRY_ALIASES`: UK, Turkey, Holland, Dubai, Bali...) and finds a group for its members
  (Slovenia → Schengen Area); one or two letters match a code or short name first, then the start of a name, never
  letters inside one ("US" isn't Austria; "ja" finds Jamaica and Japan). A place with its own charges the guide
  doesn't cover says so on its row (`PLACE_NOTES`: Bali's levy, the Galápagos fees). When the requirement filter hides
  every match the page says so, with "Show all requirements", and a U.S. state or territory (`usPlaceFor`) gets "this
  guide is for going abroad" rather than "we're adding more countries". ISO dates in prose and fees render as "Sep 15,
  2026" (`readableDates`, also in `feeText`). A search for a few countries narrows Recent changes and Connecting
  flights to them.
- **Valuations:** per-outlet November 2026 figures (The Points Guy, Upgraded Points, NerdWallet) with low, median
  and high; programs in `missing` have no value.
- **Lounge guest rules:** from the issuers' own terms, keeping `childGuestFeeUsd`, local-currency `notes` and
  `locationRules` (above). Clauses in `shared/data/cards` that the travel research contradicts or couldn't confirm
  are listed in `shared/data/travel/card-term-checks.ts` for the card data's owner (each with `why` and the research
  item). Until they're fixed, lounge rows, the guest panel and the baggage tool's card perks show the card's terms
  through `checkTerms` (`shared/lib/card-terms.ts`), which leaves out a clause marked `hide` (the Sapphire Lounge
  "$27" guests, Amex's "guest fees apply") and prints its `note`, the issuer's terms, underneath. A test fails once a
  clause is gone from the card data, so its entry goes with the fix. The
  `air-canada-maple-leaf` and `star-alliance-lounges` networks come from these rules; the cards' own `loungeAccess`
  doesn't list them yet, and a test names those gaps (`NOT_IN_CARD_DATA_YET`) so they're cleared once
  `shared/data/cards` catches up.

`seed-status.ts` says where each dataset stands: `"verified"`, `"seed"` (unverified stand-in values: the file then
starts with `// SEED DATA: replaced by verified research before release` and its pages show "Preview data"; a test
keeps the header and the flag in step) or `{ partial: "..." }`, shown in a "Partly verified" notice that says what's
missing.
Baggage is partial: 19 airlines have a confirmed link and 110 don't. Keep `asOf` and `sources` on every record (tests
check entry records and guest-rule defaults; an unsourced fact isn't shipped), link only official sources for fees and
entry rules, keep research-process wording out of shipped text and the tools' own strings (a test checks the data
files and view code for phrases like "search results", "web search", "re-checked", "source code", "fetched";
provenance goes in a "How this was checked" disclosure, in visitor words),
and never rename card or network ids (they must exist in `shared/data/cards` and `shared/data/networks.ts`; a test
checks). Pages list sources with `SourceLinks` (`frontend/components/source-links.tsx`): a site that appears more than
once is named by page ("Chase · Boundless"), datasets by what they are ("Passport Index data (Feb 2026)"), pages
whose address names them badly by `PAGE_LABELS` ("GOV.UK · Home Office fees, Oct 2026", "United · bag fee
calculator"), cryptic outlets by `OUTLET_NAMES`, and long lists fold behind "+N more". Addresses visitors can't use link
the page they belong to (`visitorUrl`: GOV.UK's visa checker for its source files on GitHub). Labels drop dates and
running numbers from addresses and fix casing (`WORD_FORMS`: JetBlue, Europe's); a test fails if a shown list numbers
its labels. Tests: `tests/travel.test.ts`.
