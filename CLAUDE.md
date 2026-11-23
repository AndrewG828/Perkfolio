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
src/shared/     Pure code used by both sides: data/ (card, lounge, earn-rate data), lib/ (wallet types, schema
                validation, three-way merge, credit periods, caps/limits, formatting). No React, no server APIs.
src/proxy.ts    Rewrites the old domain (credit-card-hacking.vercel.app) to /move.
scripts/        CLI scripts (db-migrate.ts). tests/  node:test unit tests, run with tsx.
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
- Other storage: compare selection is in sessionStorage `perkfolio:compare:v1`; banner dismissal is
  `perkfolio:banner-dismissed`.
- Anything reading `new Date()` or localStorage must render after hydration (`useHydrated()`), or prerendering
  breaks. `useSearchParams` needs a `<Suspense>` boundary.

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
- put images in `public/cards/<id>.webp` mapped in `src/shared/data/card-images.ts`.

**Never rename a card or credit `id`**: they're keys in saved wallets. A scheduled Claude task runs on the 1st of
each month to verify terms and open a PR (paths listed in its prompt match this layout).

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
