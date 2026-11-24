@AGENTS.md

# Perkfolio

Airport lounge finder first, card benefits second: terminal maps of the lounges at big airports marked with the ones
your cards get you into; then Points & Miles (transfers, award sweet spots, program guides), a tracker for credits,
points, certificates and card applications, card comparison and ranking, and travel tools.
Live at https://perkfolio-app.vercel.app (Vercel project `perkfolio`, deploys `main`).
Repo: https://github.com/AndrewG828/Perkfolio. First-time machine setup: **SETUP.md**.

Stack: Next.js 16 (App Router, `cacheComponents`, `proxy.ts`), React 19, TypeScript, Tailwind CSS v4, lucide-react,
Auth.js v5 (`next-auth@5.0.0-beta.32`, pinned exact) with Google, Neon Postgres via `@neondatabase/serverless` (HTTP).

## Commands

```bash
npm run dev            # http://localhost:3000
npm test               # unit tests (tests/*.test.ts)
npx tsc --noEmit -p .  # types (run `npx next typegen` first if PageProps/LayoutProps are missing)
npm run lint
npm run build          # run all four before pushing
npm run db:migrate     # apply DB migrations by hand (reads DATABASE_URL from .env.local)
npm run points:import -- --a <dir> --b <dir>   # regenerate src/shared/data/points from research (Data pipelines)
npm run maps:build     # airport maps from OpenStreetMap → public/airport-maps/<CODE>.json
npm run airports:build # airport list from OurAirports → public/data/airports.json
vercel logs --project perkfolio --json   # prod logs; Hobby keeps only ~30 minutes
```

## Layout: where code goes

```
src/app/        Routes only: page.tsx / layout.tsx / route.ts. Keep them thin; import from the folders below.
src/frontend/   Runs in the browser.
  components/     Shared UI: site-header/-footer (menus in site-nav.ts), photo-frame, source-links, card-art, ...
  features/       A page's views: lounges, points, cards, compare, best-card, calculator, next-card, tracker,
                  tools (+ catalog.ts), start, import, move
  state/          Client stores: wallet-store, account, compare-store, strategy-prefs, point-values, airports
  lib/            Browser helpers (the .ics builder)
src/backend/    Server only. Modules start with `import "server-only"` (a client import is a build error), except
                db/migrate.ts + db/migrations.ts (also loaded by the CLI script) and http/errors.ts (plain class).
  auth/           Auth.js config (index.ts), server actions (actions.ts), currentUserId() (current-user.ts)
  db/             client.ts (db() = Neon client after migrations), migrations.ts (schema), migrate.ts (runner)
  repositories/   SQL and nothing else: users.ts (users + accounts), wallets.ts
  services/       Business rules: identity.ts (sign-in → user), wallet.ts (validation + versioned save)
  http/           handler.ts (withUser wrapper), security.ts (origin/JSON/size/rate checks), errors.ts (HttpError)
  log.ts          JSON log lines; tag() hashes user ids
src/shared/     Pure code used by both sides. No React, no server APIs.
  data/           cards/, lounges, networks, airport-geo, airport-nav, calculator-rates, card-images
    points/         Points & Miles, made by points:import (by hand: types, program-names, card-partners, index)
    strategy/       Issuer application rules, points expiration, cards the rules name that we don't list, program list
    travel/         Baggage, entry rules, hotel earning, lounge guest rules, regions, card-term checks, seed status
  lib/            wallet, wallet-schema, wallet-merge; periods, credit-status, limits, dates, format; lounge-access,
                  wayfinding, airport-map, walkable, osm-airport; points, point-value; eligibility, next-card,
                  welcome-offer, trackers; geo, airports, hotel-points, guest-cost, card-terms, start-flows, search
                  and travel-format helpers
src/proxy.ts    Rewrites the old domain (credit-card-hacking.vercel.app) to /move.
scripts/        db-migrate, build-airport-maps, build-airports, import-points-research. tests/  node:test, run with tsx.
public/         cards/<id>.webp, airport-maps/<CODE>.json, data/airports.json, photos/ (each one credited)
```

Rules of thumb: a client component may import `frontend/` and `shared/`, plus `"use server"` actions from
`backend/auth/actions.ts`, but never other backend modules. Backend may import `shared/`. `shared/` imports
neither. Use the `@/` alias (`@/backend/...`, `@/shared/...`).

## Pages

| Route | Views in `frontend/features/` | URL state |
| --- | --- | --- |
| `/` | (page) | lounges first (search, big airports), then one row into Points & Miles, tracker, tools |
| `/lounges`, `/lounges/[code]` | `lounges/` | `?from=<gate>&to=<lounge>`, `?guests=2`, `?card=` |
| `/cards`, `/cards/[id]`, `/compare` | `cards/`, `compare/` | `?category=&issuer=`, `?cards=a,b,c` |
| `/best-card`, `/calculator`, `/next-card` | `best-card/`, `calculator/`, `next-card/` | `?category=dining`, `?credits=half`, `?type=business\|all` |
| `/tracker` | `tracker/` | `?tab=credits\|points\|certificates\|redemptions\|applications` |
| `/points`, `/points/…` (sweet-spots, transfers, programs/[id], airlines, booking-rules) | `points/` | `?region=` |
| `/tools`, `/tools/…` (distance, baggage, entry-requirements, hotel-points) | `tools/` | `?route=JFK-LHR-SIN` |
| `/start` | `start/` | `?flow=trip&from=JFK&to=HND&cabin=business` |
| `/about` | (page) | `#methodology`, `#points-data`, `#photos`, `#disclaimer` |
| `/move`, `/import` | `move/`, `import/` | old-domain wallet handoff; unlinked, noindex |

Menus are data in `frontend/components/site-nav.ts` (`NAV` header groups, `TOP_LINKS`, `FOOTER_COLUMNS`); a new page
goes there or on a list page that is (`tests/navigation.test.ts`). A group opens on click, mouse hover and the keyboard
(ArrowDown opens it and focuses the first link, arrows move, Escape closes and refocuses the button). Groups sit
inline from `lg` (1024px), in the menu button below; check 1024px with sign-in enabled when adding one.

## Backend

**Request flow:** `app/api/*/route.ts` → `withUser(scope, op, options, fn)` → service → repository → Neon.

**API**

| Route | Method | Does |
| --- | --- | --- |
| `/api/me` | GET | `{ enabled, sync, user }`: whether accounts are configured, and who's signed in (no DB) |
| `/api/wallet` | GET | `{ data, version }` for the signed-in user (`null, 0` if never saved) |
| `/api/wallet` | PUT | body `{ data, base }`: 200 `{ ok, version }`, or 409 `{ conflict, data, version }` |
| `/api/account` | DELETE | body `{ confirm: "delete my account" }`: deletes user, linked accounts and wallet |
| `/api/auth/*` | * | Auth.js (Google OAuth, CSRF, callbacks) |

**Schema** (`src/backend/db/migrations.ts`)
- `users`: `id uuid` (the key everything references), `email` (unique, lowercase, *can change*), name, image,
  created_at, last_login_at.
- `accounts`: `(provider, provider_account_id)` → `user_id`. Google's account id is permanent.
- `wallets`: `user_id` → one JSON `data` blob (whole WalletState) + `version bigint` + updated_at.
- `schema_migrations`: applied migration ids. `legacy_wallets` (old text-keyed table) may exist and can be dropped.

**Migrations:** append a new entry to `migrations`; never edit a shipped one. They run automatically once per server
instance on first `db()` call (one transaction each, advisory-locked, safe under concurrency), or via
`npm run db:migrate`. Write statements so they're safe to re-run (`IF NOT EXISTS`, `ON CONFLICT`).

**Identity:** without a DB adapter Auth.js gives each sign-in a random `token.sub`. Never use `sub` as a user key.
The `jwt` callback runs `resolveUser()` at sign-in (match on Google account id, then verified email, else create)
and stores `users.id` as `token.uid`; `session.user.id` is that uuid. `currentUserId()` reads it, with a find-only
email fallback for old sessions. Sign-in requires `email_verified`.

**Sync protocol:** server-issued versions, not device clocks. The client sends the version it last saw (`base`).
The repository's upsert only writes if the stored version equals `base`; the new version is
`GREATEST(now_ms, old + 1)`. On 409 the client three-way merges and retries.

## Frontend

- **Wallet:** `frontend/state/wallet-store.ts`, a `useSyncExternalStore` store over localStorage
  `perkfolio:wallet:v1`. Every change goes through `walletActions` and is stamped `updatedAt`. Other tabs' changes
  arrive via the `storage` event. `subscribeWallet` (sync loop) fires only for this tab's edits.
- **Cloud sync:** `frontend/components/cloud-sync.tsx` (mounted in the root layout). Pulls on load, focus and
  every 30s; pushes 800ms after an edit; flushes when the tab is hidden. It keeps `perkfolio:sync:v2` = `{ account,
  version, base }` and merges with `mergeWallets3(base, local, remote)` from `shared/lib/wallet-merge.ts`.
- **Account:** `frontend/state/account.ts` (from `/api/me`) and `frontend/components/account-menu.tsx` (sign in/out,
  sync status, Sync now, Delete account).
- **Rendering:** anything reading `new Date()` or localStorage renders after hydration (`useHydrated()`), or
  prerendering breaks. `useSearchParams` needs a `<Suspense>` boundary. Filters live in the URL so results can be
  shared: views write them with `history.replaceState` (Start here uses `pushState`, so Back works) and drop values
  they can't use.
- **Other storage:** localStorage `perkfolio:strategy:v1` (prefs, not synced), `perkfolio:airport-map:v1:<CODE>`,
  `perkfolio:banner-dismissed`; sessionStorage `perkfolio:compare:v1` (compare selection).

## Lounges

- **Access:** `/lounges` (search, big-airport tiles, directory, guest finder) and `/lounges/[code]`. Rules live in
  `shared/lib/lounge-access.ts` (`accessFor`, `refusedAt`, `isClosed`, `accessibleCountByAirport`); the directory part
  (`terminalsAt`, `gateOf`, `bigAirports` = 5+ lounges, no card data) is `lounge-directory.ts`, which pages that only list
  airports import. A lounge's own rule can turn a card away (`locationRules[].notAdmitted`: Arlanda admits only the
  consumer Platinum); a lounge with `cardAccessUnconfirmed` (Plaza Premium First) opens to no card; a `closed` lounge
  (dated `from`/`until`, checked against the visitor's date after hydration) shows "Closed until …" and is left out of
  access counts, nearest lounges and the automatic destination. With no cards to check (an empty wallet), airport pages
  show every lounge with every card's rules, as the finder does. `airport-geo.ts` has
  coordinates for the OpenStreetMap embed and `terminalOrder` where natural sorting is wrong (ATL's T, A–F); add both
  for a new airport. The schematic terminal map spaces pins by the gate parsed from `location` ("near gate B18").
- **Directions:** `shared/data/airport-nav.ts` describes each big airport as zones (gates, checkpoints, airside
  train/walk/bus links with minutes and optional `caution`, landside links); `shared/lib/wayfinding.ts` resolves "I'm
  at gate B18" to a zone, routes with Dijkstra (cautioned links cost extra), falls back to leave → landside → re-clear
  security, and ranks lounges by time (`ownTerminalOnly`: Heathrow, where you can only use your own terminal's lounges;
  before a gate is given at an airport whose terminals aren't connected, nothing is called "nearest"). An airport whose
  zones have no gate rules (LHR, LGA) asks which terminal a typed gate is in. Add a new lounge's terminal string to a
  zone's `terminals`. Times are estimates; re-verify links when airports announce construction.
- **Airport map:** `frontend/features/lounges/airport-map.tsx` (SVG, pan/zoom) with the route on top. Geometry comes
  from `npm run maps:build` (`shared/lib/osm-airport.ts`); list a new file in `shared/data/airport-map-files.ts` (a test
  checks), since only listed files are fetched. Without one the browser builds the map from overpass-api.de and caches
  it, and says so when that fails (LAS, MIA, PHL and PHX have no file yet: Overpass wasn't reachable when they were
  last built). The wheel zooms without scrolling the page; on phones one finger scrolls the page, two move the map. Routes stay inside buildings: `shared/lib/walkable.ts` rasterizes outlines into a ~3 m grid (A* down
  the middle of corridors, then string pulling) and `shared/lib/airport-map.ts` splits it into zones (IAD's "Concourse
  A & B" belongs to both), keeps pins (~9 m in from the wall, never in a jet bridge) and You inside, and walks each leg
  through the doors between zones. A walkway OSM lacks (ORD's B–C tunnel) is a dotted connector (≤ 300 m, only on a nav
  walk link); trains are dashed hops between stations, drawn under the buildings; buses and trips outside security
  are arcs that keep off buildings. The page builds all this in idle-time steps (`prepareMapStep`), never in a render.
  Credit "© OpenStreetMap contributors (ODbL)" wherever the map shows.
- **Guest cost:** `shared/lib/guest-cost.ts` (`GuestCost` on lounge rows, `GuestCostFinder` on `/lounges`): guests
  beyond `freeGuests` × the card's `guestFeeUsd`. A null fee shows "Fee not published", never the network's usual fee
  (issuers price one network differently); spend unlocks, `guestLimit`, `guestPasses`/`passesOnly`, `localFees` and
  `locationRules` (Centurion Lounges abroad, Capital One Landings, Arlanda) adjust it, and a Priority Pass co-pay comes
  from the lounge's notes. Best card: cheapest, then no co-pay, more spare free guests, unlimited visits; none when a
  card whose fee isn't published leaves fewer guests to pay for (`unclear`). A location rule with its own prices
  replaces the card's child rate too, and lounge rows label the card's terms as U.S. terms next to the lounge's own.
- **Photo:** an airport with `airportPhoto(code)` shows it in its page header (`AirportPhoto`), credited in full.

## Points & Miles

Views in `frontend/features/points/`. Pages server-render the full content; the wallet personalizes it after hydration
(`useWalletReach()`). Anything that depends on today (live bonuses, days left, scheduled ratio changes, a dated
listing that has ended) renders after hydration: `useWalletReach()` returns `today` (`localIsoDate()`) and `data` =
`pointsDataOn(today)`, and views pass `data` to the helpers so no ratio stays stale (card pages' partner pills too).
- **Data** (`shared/data/points/`): generated modules (Data pipelines) plus `types.ts` (fixed lists: `PROGRAM_IDS`,
  `BANK_CURRENCY_IDS`, `REGIONS`, `PROGRAM_BRIDGES`; ids are URL slugs, never rename one; add an id here and in
  `program-names.ts` before the importer uses it), `card-partners.ts` (`transferPartnerNames()`) and `index.ts`
  (lookups: `programList`/`programRef()` cover programs with or without a guide, `airlinesBookableWith`, photos).
- **Logic** (`shared/lib/points.ts`): `currencyOfCard()` classifies every card (`LIMITED`: transfers need another card;
  `CASH_ONLY`), `reachablePrograms()`/`sweetSpotsFor()` take the best ratio across currencies, card-specific rows and
  bridges (Virgin Red → Flying Club, `TransferRoute.via`; direct wins a tie), `liveBonuses()` hides a bonus the day
  after it ends, `milesPlan()` lists direct routes then bank → hotel → airline (hotel minimums and steps, bonuses only
  for their cards and up to their cap), `bookingOptionsFor()` answers who can book an airline, `ratioLabel()` writes
  ratios in smallest whole numbers (1:0.8 → "5:4"), `partnerOn()` applies a scheduled ratio from its date.
- **Photos:** files in `public/photos/`, credits in `photos.ts`. Show one with `PhotoFrame` ("Photo: author · license",
  linked to the source; a region gradient when there's none) or `PhotoAttribution` (title linked to the source, license
  to its terms), both in `frontend/components/photo-frame.tsx`. Region photos appear on sweet spots, airport photos on
  their lounge page; `/about#photos` lists every photo a page shows (`shownPhotos()`), so extend it with any new place.

## Point values

One value per point, everywhere: every page calls `shared/lib/point-value.ts`, never a copy of the numbers.
- `resolvePointValue(id, ctx)`: the user's own value (`ctx.own`, set on the tracker's Points tab), else the published
  median (`valuations.ts`: the middle of TPG, Upgraded Points and NerdWallet, or the mean of two), else a card file's
  `pointValueCents` only for points no outlet values, else undefined: pages ask for the user's own value
  (`noValueReason()`), never estimate. With `ctx.cards` (the wallet) an outlet's figure for those cards replaces its
  headline one (`valueForWallet()`: NerdWallet's lower Citi and Chase figures). Results carry `basis` (`own`, `median`,
  `estimate`, `cash`) and the published figures.
- `cardPointValue(card, ctx)` counts the card as held: cash back is 1¢ (own values never apply); a `LIMITED` card is
  cash back until `ctx.cards` holds one of its `unlockedBy` cards, then it's worth the currency's value. The currency
  follows the same rule: a bank currency the wallet earns only on locked `LIMITED` cards resolves to 1¢ (`locked`), so
  the tracker, the deal calculator and card pages agree. A credit paid in points (`Credit.points`, Venture X's
  anniversary miles) stores its value at the median (a test checks) and `creditValue()`/`annualizedCredits()` value it
  with the visitor's context. Card classification (`currencyOfCard`, `classifyCard`) lives in `shared/lib/card-currency.ts`
  with no Points & Miles data, and point-value imports only the data modules it needs (a test keeps the big ones out).
  `returnPercent()` ranks Which Card? and Start here; `estimateRewards()`, `welcomeValue()`, `firstYearValue()`,
  `rankNextCards({ values })` and `stayPoints({ values })` go through it.
- In the browser `useValueContext()` (`frontend/state/point-values.ts`) gives `{ own, cards }` only after hydration, so
  the server render (medians) matches. Text naming the source uses `MEDIAN_SOURCE`, `VALUE_OUTLETS`,
  `VALUE_EDITION_LABEL` and `basisSentence()`; cents print with `formatCents()`. `/about#methodology` explains it.

## Card strategy and trackers

- **Rules** (`shared/data/strategy/application-rules.ts`): `basis` `official` (the issuer's wording) or `widely
  reported` (two or more outlets agree). Effects `ineligible`/`no-bonus` block, `bonus-at-risk` warns, `likely-denied`
  blocks unless `soft`; `counts` says what a numeric rule counts, `appliesWhen` ties a rule to an answer (BofA 7/12 vs
  3/12), and `appliesTo: []` rules cover cards we don't list (recognized in a history by `other-products.ts`). Rule
  names match the effect: a "may" rule is never titled "blocked".
- **Expiration** (`expiration.ts`): `rule` `never` | `inactivity` | `fixed-term` | `while-account-open`, plus `change`,
  `expiryResumes`, `caveat` and `cardExemption` (no expiry while the user holds the co-brand). `programs.ts` derives the
  program list from the Points & Miles ids (names and units from `program-names.ts`, so the tracker doesn't load the
  guides); a program has a policy, a `missing` entry, or neither when the research didn't cover it (Copa ConnectMiles),
  and pages then guess no expiry. `programForCard()` follows `currencyOfCard()` for listed cards.
- **Wallet fields** (optional, `version: 1`, validated in `parseWallet`, merged by `id` in `mergeWallets3`, capped by
  `WALLET_LIMITS`): `applications` (`undefined` = history not set up, so rules that need it are unknown; `[]` = nothing
  to add; `opened`/`closed` as `YYYY-MM` or `YYYY-MM-DD`; `bonusEarned` `YYYY-MM` or `NO_BONUS`, absent = not recorded:
  bonus rules ask, unless the card is older than `BONUS_POSTS_WITHIN_MONTHS`, then a caveat; `authorizedUser`),
  `balances`, `certificates`, `redemptions`; lists merge by `id`, balances per program key (the more recently
  `updated` wins). Form text goes through `cleanLabel`/`cleanNotes`.
- **Eligibility** (`shared/lib/eligibility.ts`, pure): `evaluateCard(card, historyContext(wallet, today, facts))` gives
  each rule `eligible`, `warning`, `unknown` (with `missing` or a `question`), `blocked` (`until`, `action`) or
  `notice`; card status is blocked > unknown > warning > eligible, notices never count, `caveats` say what wasn't
  checked.
  Day windows are exact, month windows take a month-only date as its last day, 5/24 counts calendar months
  (`chase524()`). Authorized-user cards count only where a rule says so.
- **Next card** (`shared/lib/next-card.ts`): `rankNextCards()` groups eligible / warning / unknown / blocked (held and
  closed cards left out) and ranks by first-year value = welcome offer (`welcome-offer.ts`) + credits the user would use
  − fee. Only offers `bonusBasis()` counts add the bonus; at-risk, unconfirmed and "as high as" offers rank on credits −
  fee and show what the bonus would add.
- **Tracker** (`frontend/features/tracker/`): Points values balances like everywhere else and dates expiry from the
  policy (red under 30 days, amber under 90; a co-brand exemption needs the user's own card, never an authorized-user
  one); Redemptions compares only redemptions that have a valuation. Prefs (`frontend/state/strategy-prefs.ts`):
  `cpp` (own values), `usable` (credits they'd use), `facts` (answers to rule questions).

## Travel tools

`/tools` lists every tool (`frontend/features/tools/catalog.ts`, also Start here's result icons). A tool page is a
thin route with a `ToolHero` and its client view in `<Suspense>`; results live in the URL, so they can be shared.
- **Distance:** `shared/lib/geo.ts` (haversine, R = 6,371 km; flight time = 30 min + 1 h per 530 mi; arcs that don't
  break at the date line), `shared/lib/airports.ts` (search with `METRO_AIRPORTS`, `parseRouteParam`). The airport list
  is fetched only by tools that need it (`frontend/state/airports.ts`), never bundled. Credit "Airport data:
  OurAirports (public domain)" wherever it shows; destinations link to sweet spots via `travel/regions.ts`.
- **Hotel points** (`shared/lib/hotel-points.ts`): room rate (taxes only where `taxesEarn`) × brand rate + elite bonus,
  plus the total charged × the card's rate (another chain's co-brand earns its `baseRate`). A null (`basePerDollar`,
  `taxesEarn`, a tier's `percent`) isn't counted, and the page says so.
- **Start here** (`shared/lib/start-flows.ts`): five flows of 2–4 one-tap questions (`when`, `accepts` for shared
  links) that end on links with parameters filled in, only ones their pages read (a test checks each key).
- **Baggage, entry requirements:** search never matches letters inside a word (`shared/lib/airline-search.ts`,
  `entry-search.ts`); dates and sources render through `shared/lib/travel-format.ts` and `SourceLinks`
  (`frontend/components/source-links.tsx`), which names pages, not addresses.

## Data pipelines

Facts come only from verified research or the issuers' and programs' own pages. The research lives outside the repo
in two directories: A (transfers, programs, sweet spots, photos) and B (everything else). Per track, read
`<track>.final.json` when it exists, else `<track>.verified.json` (never the drafts or `.gapfill.json`), and only the
confirmed lists: nothing under `rejected`, `stillMissing`, `unconfirmed`, `pending` or `notResearched`. In the data,
`null` means "not confirmed" and pages say so. Keep `asOf`/`lastVerified` and `sources` on every record, link only
official sources for fees and entry rules, and keep research-process wording out of what visitors read.

**Points & Miles:** `npm run points:import -- --a <A> --b <B>` (or `POINTS_RESEARCH_A`/`_B`; `--dry-run` prints counts,
what it applied and skipped and what would change; `--no-change-log` keeps the transfer tracks' partner list as is)
rewrites these modules in `src/shared/data/points/`; never edit them by hand:

| Dir | Track(s) | Writes |
| --- | --- | --- |
| A | `transfers-a`, `transfers-b` | `currencies.ts`, `transfers.ts` |
| A | `programs-air-a`, `programs-air-b`, `programs-hotel` | `programs.ts` |
| A | `sweet-flights-a`, `sweet-flights-b`, `sweet-hotels` | `sweet-spots.ts` (featured order) |
| A | `photos.verified.json`, `photos.auto.json` | `photos.ts` |
| B | `booking-rules-a`, `booking-rules-b` | `booking-rules.ts` |
| B | `who-can-book` (+ the flight sweet spots) | `airlines.ts` |
| B | `valuations` | `valuations.ts` (the site's only point values) |
| B | `transfer-extras` | `hotel-transfers.ts`, `transfer-bonuses.ts`, `partner-changes.ts` |

It validates every id, date and https URL (and writes nothing on a problem), applies the dated partner-change log's
in-effect entries to the partner list (scheduled ratios ride on their row), writes prose as the pages do (`prose()`:
dates in words, ratios as the pills write them), and takes a photo only when its file is under `public/` with every
credit field and a CC0, public-domain, CC BY or CC BY-SA license. Its curation rules (`REWRITES`, `CARD_SPECIFIC`,
`ROW_FIXES`, the other `*_FIXES`, `SUPERSEDED`, `EXTRA_AIRLINES`) reword, complete or skip single entries, each backed
by a source; each matches exact content, so it lapses when the research changes, and the run lists lapsed ones (delete
them). Re-run when research lands, then run the checks.

**Strategy and travel:** `strategy/application-rules.ts` and `expiration.ts`, and `travel/baggage.ts`,
`entry-requirements.ts`, `hotel-earning.ts` and `lounge-guest-rules.ts` were transcribed from B's tracks of the same
names (`expiration-policies` for expiration) into typed consts in the research's own shape (`types.ts` beside them,
additions marked "Added"). There's no importer: to refresh one, rebuild the whole object from the new research, keep
the export name and every `asOf`/`lastVerified`/`sources`, and run `npm test`. `travel/seed-status.ts` says where each
travel dataset stands (`verified`; `seed`, with a `// SEED DATA` header and a "Preview data" notice; or `{ partial }`,
shown as "Partly verified"). A card-data clause the research rejected is taken out of the card data (never shipped);
one it couldn't confirm but that stays is listed in `travel/card-term-checks.ts` (empty now) and shown with a note
through `checkTerms` (`shared/lib/card-terms.ts`) on lounge rows, card pages and Compare; drop an entry when the card
data is fixed.

**By hand:** lounges (`shared/data/lounges.ts`), `airport-geo.ts` and `airport-nav.ts`. `npm run maps:build` rebuilds
the airport maps from OpenStreetMap; `npm run airports:build` downloads OurAirports' CSV (or takes a path) and keeps
scheduled-service airports with an IATA code, biggest first.

## Security rules (keep these true)

1. **User identity comes only from the session.** Never accept a user id, email or account id from the request.
2. **Every route that touches user data uses `withUser`.** Routes that change data pass
   `{ mutation: true, json: true, maxBytes, perMinute }`. That gets you the same-origin check (`Origin` /
   `Sec-Fetch-Site`), JSON-only bodies, size limits, a per-user rate limit, 401/403/429 handling, `no-store`
   caching and generic 500s.
3. **Validate everything from outside** with `parseWallet()` (`shared/lib/wallet-schema.ts`) and store only its
   output. Extend the schema when you add a WalletState field, and add a test.
4. **SQL only through tagged templates** (`` sql`... ${value}` ``) so values are parameters. Never build SQL strings
   from input. `sql.query(text)` is only for the static migration statements.
5. **No CORS headers** on API routes, and keep the security headers in `next.config.ts`. They block framing, set
   nosniff, HSTS and a narrow CSP.
6. **Secrets stay server-side.** Only `NEXT_PUBLIC_*` reaches the browser (none are used). Never log emails, tokens or
   wallet contents: use `tag(userId)`. Never commit `.env*` files.
7. **Errors shown to users never include internals** (DB messages and stack traces go to logs only).
8. Destructive endpoints need an explicit confirmation body (see `/api/account`).
9. After touching auth or API code, re-run the checks in "Testing" and `npm audit --omit=dev`.

## Card data

Cards live in `src/shared/data/cards/{amex,chase-bilt,other}.ts` (types in `src/shared/data/types.ts`). When editing:
- keep `lastVerified` current;
- add earn-rate specs in `src/shared/data/calculator-rates.ts` for new cards, and classify them in `currencyOfCard()`;
- `pointValueCents` counts only for points no outlet values, and `welcomeOfferValue` only for offers that can't be
  valued from their points and cash (free nights);
- a card that earns a bank currency gets `transferPartners: transferPartnerNames("<currency>", "<card id>")`, never a
  hand-written list; every lounge network the issuer lists goes in `loungeAccess`, with guest rules in
  `travel/lounge-guest-rules.ts`;
- put images in `public/cards/<id>.webp` mapped in `src/shared/data/card-images.ts`.

**Never rename a card or credit `id`**: they're keys in saved wallets (so are program ids, which are also URLs; network,
lounge and rule ids are referenced across the data). A scheduled Claude task runs on the 1st of each month to verify
terms and open a PR (paths listed in its prompt match this layout).

## Environment

`.env.local` (gitignored), from SETUP.md:
- `AUTH_SECRET`, `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` enable sign-in.
- `DATABASE_URL` enables sync.

The app runs with none of them, in local-only mode. **`DATABASE_URL` from `vercel env pull` is the production
database.** Use a Neon `dev` branch for local work, or leave it unset. Env var changes on Vercel need a redeploy.

## Testing

- `npm test`, `npx tsc --noEmit -p .`, `npm run lint`, `npm run build`.
- What the tests hold the code and data to (fix the cause; don't loosen a test):
  - `wallet`: three-way merges, `parseWallet` caps and formats, new fields survive sync, a full wallet < 256 KB.
  - `lounges`, `wayfinding`, `walkable`, `airport-map`, `airport-routes`: coordinates for every airport with lounges,
    nav data that puts every big-airport lounge in a zone, and routes on every pre-built map from every gate that stay
    in the buildings (trains at stations, arcs off buildings, pins by their gates).
  - `points`: generated modules are valid (ids, references, ratios, regions, ISO dates, https URLs) and follow the
    change log; every card is classified; every photo is credited and openly licensed, every file under
    `public/photos/` has a credit, and the About page credits every photo a page shows.
  - `point-value`, `welcome-offer`: every tool lands on the same value per currency, and no page keeps its own copy.
  - `eligibility`, `trackers`: issuer rules (windows, 5/24, families, unknowns, authorized users), rule names that match
    their effect, expiry and co-brand exemptions, anniversary credits from the card history's open date.
  - `travel`: distance math, hotel and guest-cost rules, sourced and dated records with real card and network ids, no
    research-process wording, seed headers in step with seed flags, tool tiles and Start here results on real pages.
  - `navigation`: every menu and footer link opens a page (tracker tab, About anchor), and every page is linked from
    the menus or the footer, or from a list page that is (`UNLINKED` and `PARENTS` in the test).
- **Manual API checks** against `npm run build && npm start` with test `AUTH_*` values: signed-out requests → 401,
  cross-origin `Origin` → 403, `text/plain` body → 415, over 256 KB → 413, bad wallet → 400, more than 60 PUTs a
  minute → 429.
- **Two-device sync:** sign in on a normal and a private window, mark a credit used in one, focus the other. The
  account menu shows "Synced · time" or the error.
