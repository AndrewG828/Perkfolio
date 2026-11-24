@AGENTS.md

# Perkfolio

Airport lounge finder first, card benefits second: terminal maps of the lounges at big airports marked with the ones
your cards get you into, plus tracking statement credits, spending caps and lounge visits, comparing cards and picking
the best card per purchase. Live at https://perkfolio-app.vercel.app (Vercel project `perkfolio`, deploys `main`).
Repo: https://github.com/AndrewG828/Perkfolio. First-time machine setup: **SETUP.md**.

Stack: Next.js 16 (App Router, `cacheComponents`, `proxy.ts`), React 19, TypeScript, Tailwind CSS v4, lucide-react,
Auth.js v5 (`next-auth@5.0.0-beta.32`, pinned exact) with Google, Neon Postgres via `@neondatabase/serverless` (HTTP).

## Commands

```bash
npm run dev            # http://localhost:3000
npm test               # unit tests (tests/*.test.ts: merge + validation)
npx tsc --noEmit -p .  # types
npm run lint
npm run build          # run all four before pushing
npm run db:migrate     # apply DB migrations by hand (reads DATABASE_URL from .env.local)
npm run points:import -- --a <dir> --b <dir>   # regenerate Points & Miles data from research (see Points & Miles)
vercel logs --project perkfolio --json   # prod logs; Hobby keeps only ~30 minutes
```

## Layout: where code goes

```
src/app/        Routes only: page.tsx / layout.tsx / route.ts. Keep them thin; import from the folders below.
src/frontend/   Runs in the browser. components/ (shared UI), features/<page>/ (a page's interactive views),
                state/ (client stores), lib/ (browser helpers like the .ics builder).
src/backend/    Server only. Modules start with `import "server-only"` (a client import is a build error), except
                db/migrate.ts + db/migrations.ts (also loaded by the CLI script) and http/errors.ts (plain class).
  auth/           Auth.js config (index.ts), server actions (actions.ts), currentUserId() (current-user.ts)
  db/             client.ts (db() = Neon client after migrations), migrations.ts (schema), migrate.ts (runner)
  repositories/   SQL and nothing else: users.ts (users + accounts), wallets.ts
  services/       Business rules: identity.ts (sign-in → user), wallet.ts (validation + versioned save)
  http/           handler.ts (withUser wrapper), security.ts (origin/JSON/size/rate checks), errors.ts (HttpError)
  log.ts          JSON log lines; tag() hashes user ids
src/shared/     Pure code used by both sides: data/ (card, lounge, earn-rate, points data), lib/ (wallet types, schema
                validation, three-way merge, credit periods, caps/limits, points logic, formatting). No React, no
                server APIs.
src/proxy.ts    Rewrites the old domain (credit-card-hacking.vercel.app) to /move.
scripts/        CLI scripts (db-migrate.ts, build-airport-maps.ts, import-points-research.ts). tests/  node:test unit
                tests, run with tsx.
```

Rules of thumb: a client component may import `frontend/` and `shared/`, plus `"use server"` actions from
`backend/auth/actions.ts`, but never other backend modules. Backend may import `shared/`. `shared/` imports
neither. Use the `@/` alias (`@/backend/...`, `@/shared/...`).

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
- **Lounges:** `/lounges` (search, big-airport tiles, directory) and `/lounges/[code]` (one airport). Access rules live in
  `shared/lib/lounge-access.ts` (`accessFor`, `terminalsAt`, `gateOf`, `bigAirports` = 5+ lounges). Map data is in
  `shared/data/airport-geo.ts`: coordinates for the OpenStreetMap embed, and `terminalOrder` where natural sorting is
  wrong (e.g. ATL's T, A–F). Add both for any new airport (a test checks coordinates). The terminal map is schematic:
  one strip per terminal, pins spaced by gate parsed from `location` ("near gate B18"), so write locations that way.
- **Directions (wayfinding):** `shared/data/airport-nav.ts` describes each big airport as zones (concourses/terminals)
  with their gates, security checkpoints and *airside* links (train/walk/bus, minutes, optional `caution`), plus how to
  get between zones landside. `shared/lib/wayfinding.ts` resolves "I'm at gate B18" to a zone, routes with Dijkstra
  (cautioned links cost extra), falls back to leave → landside → re-clear security, and ranks lounges by time. The
  airport page keeps `?from=` and `?to=` in the URL. A test requires nav data for every big airport and every lounge
  there to land in a zone; when adding a lounge or airport, add its terminal string to the zone's `terminals`. A zone's
  train stops at its middle unless `stations` says it has more (DFW's terminals: two Skylink stations each, placed
  approximately). Times are estimates. Re-verify links when airports announce construction.
- **Airport map:** `frontend/features/lounges/airport-map.tsx` draws terminals, runways and gates (SVG, pan/zoom) with the
  route on top. Geometry comes from OpenStreetMap: `npm run maps:build` (scripts/build-airport-maps.ts, using
  `shared/lib/osm-airport.ts`) writes `public/airport-maps/<CODE>.json`. If an airport has no file, the browser builds
  it from overpass-api.de and caches it in localStorage. Routes stay inside the buildings: `shared/lib/walkable.ts`
  rasterizes the terminal outlines into a ~3 m grid with each cell's room from the real outline (A* that keeps to the
  middle of corridors, string pulling that keeps most of that room), and `shared/lib/airport-map.ts` splits it into
  zones (nearest zone gates/building by walking; a building named for several, like IAD's "Concourse A & B", belongs
  to each; a zone without gate rules, like Heathrow's terminals, takes the gates in its own buildings), puts every
  zone middle, pin and the You marker well inside a building (gate pins ~9 m in from the wall, never in a jet bridge
  or a gate's stub), and walks each leg through the doors between consecutive zones. Zones a walkway joins that OSM
  doesn't (ORD's B–C tunnel) are drawn one way per pair: a fixed dotted connector (at most 300 m, only ever on a nav
  walk link), or through the buildings; a walk over a gap between buildings OSM draws apart is dotted too. Trains are
  dashed hops that stop only at stations (`trainStations`: a zone's middle, or its `stations`; of several, the pair
  nearest the walks either side), so the walk may come back along the line: rides are drawn under the buildings and
  show faintly through them, with walks on top. Buses (from the outer wall nearest the other stop, on the airfield
  side) and trips outside security (out by the zone's main hall, on the roads' side, from the zone with the exits,
  like JFK T4's hall) are arcs between outer walls that keep off the buildings, their own included; they're the rides
  boarded and left where the walks meet them. A gate OSM lacks is placed between its numbered neighbours (same side
  first), else You goes to the zone's middle, labelled with the zone. With outlines, a walk the buildings can't carry
  (a building missing from the map) isn't drawn: just You and the pin. The page builds all this, crossings included,
  in idle-time steps of a few ms (`prepareMapStep`: the grid passes and zone searches run in chunks), never in a
  render. Without outlines it falls back to following the gates; `tests/airport-routes.test.ts` routes every
  pre-built map from every OSM gate and lounge gate (start zone, You and pins out of stubs, connectors, outlines,
  walls, trains at stations, arcs off buildings, no doubling back on a bus or trip outside security, pins by their
  gates). Credit "© OpenStreetMap contributors (ODbL)" wherever the map shows.
- Other storage: compare selection is in sessionStorage `perkfolio:compare:v1`; banner dismissal is
  `perkfolio:banner-dismissed`.
- Anything reading `new Date()` or localStorage must render after hydration (`useHydrated()`), or prerendering
  breaks. `useSearchParams` needs a `<Suspense>` boundary.
- Header (`frontend/components/site-header.tsx`): the seven primary links fit on one line only from `xl` (1280px), next
  to Sign in and My Wallet; below that they're in the menu. Check 1280px with sign-in enabled when adding a link.

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
- add earn-rate specs in `src/shared/data/calculator-rates.ts` for new cards;
- put images in `public/cards/<id>.webp` mapped in `src/shared/data/card-images.ts`;
- a card that earns a bank currency gets `transferPartners: transferPartnerNames("<currency>", "<card id>")` (from the
  Points & Miles partner list), never a hand-written list.

**Never rename a card or credit `id`**: they're keys in saved wallets. A scheduled Claude task runs on the 1st of
each month to verify terms and open a PR (paths listed in its prompt match this layout).

## Points & Miles

Pages: `/points` (hub: wallet summary, featured sweet spots, transfer bonuses, transfer explorer, program preview,
"is this a good deal?" calculator), `/points/sweet-spots`, `/points/transfers` (two modes: the matrix with
per-currency tabs on phones, and "I need miles"; then bonuses, hotel points to airlines, the partner-change log and
currency notes), `/points/programs`, `/points/programs/[id]` (every program in `programList`, guide or not: transfers,
value per point, airlines it books, booking rules, hotel conversions, sweet spots), `/points/airlines` (pick an airline,
see who can book it, `?airline=NH`) and `/points/booking-rules` (sortable, filterable matrix). Views are in
`frontend/features/points/`. Each page server-renders the full content; the wallet personalizes it after hydration
(`useWalletReach()`), and filters live in the URL (`useSearchParams` inside `<Suspense>` whose fallback is the same
view, unfiltered; writes use `history.replaceState`, and every view drops values it can't use from the URL). Anything
that depends on today's date (live bonuses, days left, bonuses applied in the planner, scheduled ratio changes once
their date comes, a dated airline listing that has ended) renders after hydration via `localIsoDate()`:
`useWalletReach()` returns `today` and `data`, the dataset as it stands today (`pointsDataOn(today)`), and views pass
`data` to the shared helpers (`bestPartnerFor`, `transferSources`, `bookingOptionsFor`, …) so no ratio stays stale under
a "Scheduled" label. Card pages show structured transfer partners (`card-transfer-partners.tsx`; its ratio pills and
change notes are client islands from `dated-partner.tsx` for the same reason).

**Data is generated from research** by `scripts/import-points-research.ts`:

```bash
npm run points:import -- --a <research dir A> --b <research dir B>   # or POINTS_RESEARCH_A / POINTS_RESEARCH_B
npm run points:import -- --a <dir> --b <dir> --dry-run              # print counts, what it applied and skipped
npm run points:import -- --a <dir> --b <dir> --no-change-log        # partner list exactly as the transfer tracks have it
```

For each track it reads `<track>.final.json` when it exists, else `<track>.verified.json` (never `.json` drafts or
`.gapfill.json`), and only the confirmed lists: nothing from `rejected`, `stillMissing`, `unconfirmed`, `notResearched`
or `pending`. Re-run it when research lands (more sweet spots and photos are coming), then run the checks. It prints
what it applied, what it skipped and which curation rules have lapsed (delete those).

| Dir | Track(s) | Writes (in `src/shared/data/points/`) |
| --- | --- | --- |
| A | `transfers-a`, `transfers-b` | `currencies.ts` (`bankCurrencies`), `transfers.ts` (`transferPartners`) |
| A | `programs-air-a`, `programs-air-b`, `programs-hotel` | `programs.ts` (`awardPrograms`) |
| A | `sweet-flights-b`, `sweet-flights-a`, `sweet-hotels` | `sweet-spots.ts` (`sweetSpots`, featured order) |
| A | `photos.verified.json`, `photos.auto.json` (optional manifests) | `photos.ts` (`regionPhotos`, `airportPhotos`, `loungePhotos`, `miscPhotos`) |
| B | `booking-rules-a`, `booking-rules-b` | `booking-rules.ts` (`bookingRules`; `null` = unknown; `notes`, `sameAs`) |
| B | `who-can-book` (+ the flight sweet spots) | `airlines.ts` (`bookableAirlines`, `programBookingNotes`, `whoCanBookCaveats`) |
| B | `valuations` | `valuations.ts` (`pointValues`, `valuationEditions`, `unvaluedIds`) |
| B | `transfer-extras` | `hotel-transfers.ts`, `transfer-bonuses.ts`, `partner-changes.ts` |

What the importer does beyond copying: validates every id, date and https URL (and fails without writing on a problem);
keeps sources and `asOf`/`lastVerified` with every entry; drops research-process sentences ("not one of ours", "this
session", "Treat as weak") after rewording the ones that carry facts (`REWRITES`: "listed by the oneworld rule" →
"listed by oneworld membership", a maintainer's "drop this entry after Dec 17" → "From December 17, …"); writes program
ids in the who-can-book caveats as names; treats "Not confirmed" transfer times as unknown (`time` absent); applies the
in-effect entries of the dated partner-change log to the partner list (removed partners dropped, changed ratios
replaced, added partners listed with the log's ratio, `changedOn` and the bank's general minimum and steps, i.e. those
every other row of the currency carries: Chase's and Citi's 1,000 in 1,000s, any amount for Wells Fargo; a dated,
sourced log entry can restore a pair a transfer track left in `rejected` as unconfirmed, e.g. Citi → JAL, Wells Fargo →
Cathay and Wyndham) and attaches scheduled ratio changes to their row (`scheduled`, e.g. Bilt → Hyatt 4:3 from
2027-01-01); adds to program text that lists the banks transferring in any bank the log added since
(`noteAddedPartners`); assigns card-specific ratios the research gives only in notes (`CARD_SPECIFIC`, e.g. Chase →
Hyatt 1:1 for Sapphire Reserve and Reserve for Business, 4:3 for Sapphire Preferred and Ink Preferred); fixes rows whose
cited pages don't state them (`ROW_FIXES`: the Amex rows gain Upgraded Points' and NerdWallet's Amex guides, which
research B downloaded for transfer-extras, and Qantas's 500-point minimum); adds what a downloaded source states but the
research left out (`HOTEL_RULE_FIXES`: Hilton's 10,000-point minimum from Upgraded Points' table; `BOOKING_RULE_FIXES`:
Upgraded Points' award-calendar page for Aeroplan's 355-day window); updates currency text the change log outdated
(`CURRENCY_TEXT_FIXES`, Wells Fargo's "Choice is 1:2" now names Wyndham) and garbled photo captions (`ALT_FIXES`); skips
entries a newer track contradicts (`SUPERSEDED`); all of these match exact content, so each rule lapses once the
research changes; reads minimums, steps and caps that the research states only in words (hotel rows' "lists a
20,000-point minimum", Marriott's "convert 3,000 to 240,000 points a day", a bonus "capped at 50,000 miles"); writes
prose the way the pages do (`prose()`: ISO dates as words, "on 2026-11-24" → "on November 24, 2026" and a citation's
"TPG (2026-08-25)" → "TPG (Aug 2026)"; a rate the ratio pills show as they show it, "2:1.5" → "4:3"; another 1:x rate
per 1,000 points, "1:0.7" → "1,000 → 700"; hotel rates reduced like the hotel tables, "10:1.5" → "20:3"); gives a
listing the research dates ("drop or relabel this entry after December 17, 2026") an `endsOn`; keeps booking-rule notes
as sentences without process wording or citation-only lines, and turns a bridge program whose every rule is one "uses
Flying Club's rules" sentence into `sameAs`; lists every airline a flight sweet spot books as bookable with its program
(with the sweet spot's sources; operators who-can-book lacks come from `EXTRA_AIRLINES`, with IATA codes as research B's
baggage track checked them). That includes pairs the who-can-book verification rejected for want of a second source
(STARLUX and Aer Lingus on Atmos): the verified sweet spot is the confirmation. It orders sweet spots so neighbours
differ in program, region and cabin and the big programs are spread through the list; and accepts photos only when the
file exists under `public/`, every credit field is filled and the license is CC0, public domain, CC BY or CC BY-SA (a
template or very long Commons description is replaced as alt text by its first sentence or the title). Program ids
outside `PROGRAM_IDS` are skipped in the matrix but kept by name in the hotel-conversion table and the change log.

Hand-written files: `types.ts` (types, `PROGRAM_IDS` and the other fixed lists; ids are URL slugs, never rename one;
add an id here and in `program-names.ts` before the importer will use it; `PROGRAM_BRIDGES`: programs spent through
another with no transfer, Virgin Red → Flying Club), `program-names.ts` (a display name and aliases for every fixed
id), `card-partners.ts` (`transferPartnerNames()`: card data's `transferPartners` are derived from the partner list, so
never list partners by hand) and `index.ts` (lookups: `programList`/`programRef()` for programs with or without a guide,
`bookingRulesOf`, `getAirline`, `airlinesBookableWith` (a bridge program books what its target books), `pointValueOf`,
hotel routes).

Logic lives in `shared/lib/points.ts`: `currencyOfCard()` classifies every card (cards whose transfers need another card
are listed in `LIMITED`, plain cash back in `CASH_ONLY`; a test fails for an unclassified card, so classify new cards
there), `reachablePrograms()` and `sweetSpotsFor()` pick the best ratio across currencies and card-specific entries
(and through bridges: a Capital One or Bilt wallet reaches Flying Club "via Virgin Red", `TransferRoute.via`; a direct
transfer wins a tie), `transferSources()` lists bridged currencies with `via`, `liveBonuses()` hides a bonus the day after
it ends, `milesPlan()` lists direct bank routes (bridged ones included) then bank → hotel → airline routes (Marriott's
per-60,000 bonus and every hotel's minimum and steps via `hotelPointsFor()`/`hotelLimits()`; a bonus counts only for its
cards and up to its cap, `bankPointsWithBonus()`; a scheduled ratio applies from its date, `partnerOn()`),
`bookingOptionsFor()` answers "who can book this airline" (folding Virgin Red into Flying Club, `bookingPrograms()`),
`valueSources()` gives the deal calculator the median published value per currency or program (the user can type their
own; ids no outlet values get no default, never an estimate), `valueForWallet()` swaps in an outlet's figure for the
wallet's cards (NerdWallet's 1.3¢ for Citi cards without a Strata Premier or Elite) and `cardPageValue()` is the
card data's own `pointValueCents` (with the cards behind it), shown next to the published median on card pages, program
pages and in the calculator so the two numbers are always explained. It is usually below the median but not always
(World of Hyatt and Hilton are above every outlet): `valueRelation()` compares them and the wording follows (a "more
conservative" figure only when it is lower). `ratioLabel()` writes every ratio in smallest whole numbers (1:0.8,
250:200 and 5:4 all read "5:4"), `wholeRatio(p, 200)` the hotel rates (`hotelRatio()`: 10:1.5 reads "20:3").
`pointsDataOn(today)` is the dataset with scheduled changes applied (`partnerOn()`: from its date the row takes the new
ratio and `changedOn`); `partnerChangeOf()` finds the log entry behind a row's `changedOn` ("Added Nov 18, 2026").

Photos go in `public/photos/` and every one needs its credit fields (author, license, sourcePage). Show them with
`PhotoFrame` (`frontend/components/photo-frame.tsx`): it prints "Photo: author · license" linked to the source, and
falls back to a region gradient when there's no photo (the hub's overlapping postcards put their credits in one line
under the stack). The About page lists the credits of the photos a page shows (`shownPhotos()`: region photos of the
regions sweet spots go to; airport and lounge photos aren't shown anywhere yet), and a test fails for any file under
`public/photos/` without a credit (`allPhotos()`).
`tests/points.test.ts` checks ids, references, ratios, regions, ISO dates, https URLs, photo credits and licenses, the
change-log reconciliation, card partner lists, bonus expiry and caps, the planner (bridges, hotel minimums, scheduled
ratios), who-can-book (every flight sweet spot's operator lists its program), booking rules and valuations.

UI notes: `/points/sweet-spots` shows 12 cards at a time ("Show more"; a `#<id>` link opens enough pages to include
it) and, once the wallet is known, puts the ones it can book first in Featured order; the transfer chart shows a
bridged route in the cell ("via VR" for Capital One and Bilt to Flying Club); one transfer time shared by every
partner (Amex's terms) or none at all (Bilt) is said once, not on every row; the booking-rules matrix sorts by "Most rules confirmed" by default and shows three rules per phone card, the
section tabs scroll the current tab into view on phones, and the planner shows a prompt instead of a plan for an empty
or invalid amount and drops values it can't use from the URL.

## Environment

`.env.local` (gitignored), from SETUP.md:
- `AUTH_SECRET`, `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` enable sign-in.
- `DATABASE_URL` enables sync.

The app runs with none of them, in local-only mode. **`DATABASE_URL` from `vercel env pull` is the production
database.** Use a Neon `dev` branch for local work, or leave it unset. Env var changes on Vercel need a redeploy.

## Testing

- `npm test`, `npx tsc --noEmit -p .`, `npm run lint`, `npm run build`.
- **Manual API checks** against `npm run build && npm start` with test `AUTH_*` values:
  - signed-out requests → 401;
  - cross-origin `Origin` → 403;
  - `text/plain` body → 415;
  - over 256 KB → 413;
  - bad wallet → 400;
  - more than 60 PUTs a minute → 429.
- **Two-device sync:** sign in on a normal and a private window, mark a credit used in one, focus the other. The
  account menu shows "Synced · time" or the error.
