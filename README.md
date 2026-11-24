# Perkfolio — every lounge your cards get you into

**Live site: https://perkfolio-app.vercel.app**

A web app for getting the most out of rewards credit cards, built around airport lounge access:

- **Lounge finder** (`/lounges`) — search an airport, or pick one of the big airports, and see every Centurion, Chase Sapphire, Capital One, Delta Sky Club, Priority Pass, Plaza Premium, Escape and airline lounge, matched against the cards in your wallet.
- **Airport pages** (`/lounges/JFK`) — a schematic terminal map with a pin per lounge (by terminal and gate) showing which ones you can get into, the real airport map (OpenStreetMap), and the access terms for each of your cards.
- **Directions** — type your gate (or "before security") and get step-by-step directions to the nearest lounge you can enter: trains, walkways, and whether you'd have to leave and re-clear security, drawn on a real airport map (terminal outlines and gates from OpenStreetMap) you can pan and zoom. Hands off to Apple or Google Maps for indoor walking maps.
- **Explore cards** (`/cards`) — 37 popular cards (Amex Platinum & Gold, Chase Sapphire Reserve & Preferred, Capital One Venture X, Citi Strata Elite, Bilt, airline & hotel cards, cash back) with filters by issuer, category, fee and lounge access.
- **Card details** (`/cards/[id]`) — earn rates, every statement credit with its cadence, lounge access, perks and transfer partners.
- **Compare** (`/compare?cards=a,b,c`) — up to four cards side by side with the best value per row highlighted. Shareable URLs.
- **Benefits tracker** (`/tracker`) — add the cards you hold, log credits as you use them (monthly / quarterly / semi-annual / annual / every-4-years), see what's expiring and whether each annual fee has paid for itself. Export/import a JSON backup.
- **Value calculator** (`/calculator`) — enter monthly spending and rank cards by net annual value (rewards + realistic credit usage − fee).
- **Which card?** (`/best-card`) and **Your next card** (`/next-card`) — the best card in your wallet for each purchase, and the cards worth applying for next, with issuer rules like Chase 5/24.
- **Points & Miles** (`/points`) — transfer partners and bonuses, award sweet spots, program guides, booking rules, who can book each airline, and what a point is worth (one published value, or your own, everywhere).
- **Start here** (`/start`) and **travel tools** (`/tools`) — a few one-tap questions that lead to the right page, plus flight distance, baggage rules, entry requirements and hotel points.

## Stack

- [Next.js 16](https://nextjs.org) (App Router, Cache Components) + React 19 + TypeScript
- Tailwind CSS v4 (design tokens in `src/app/globals.css`)
- `lucide-react` icons
- Card, lounge and points data is static TypeScript; the wallet lives in `localStorage`, and optional Google sign-in (Auth.js) syncs it through Neon Postgres. Without the sign-in env vars the app runs in local-only mode.

## Getting started

New machine? See **[SETUP.md](SETUP.md)** for the full local setup, including env vars and Google sign-in.

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build (all pages prerender statically)
npm run lint
```

## Project layout

```
src/
  app/                   Next.js routes only: pages, layouts and API route handlers (thin)
    api/me               who's signed in + whether accounts are configured
    api/wallet           GET / PUT the signed-in user's wallet (versioned)
    api/account          DELETE the account and its cloud data
  frontend/              everything that runs in the browser
    components/          shared UI (header, account menu, card art, meters, cloud sync)
    features/<page>/     each page's interactive views (tracker, compare, lounges, calculator, ...)
    state/               client stores: wallet (localStorage), account, compare selection
    features/lounges/    lounge finder, airport pages, schematic terminal map
    lib/ics.ts           calendar reminders
  backend/               server-only code (import "server-only" makes a client import a build error)
    auth/                Auth.js config, sign-in/out actions, currentUserId()
    db/                  Neon client, migrations, migration runner
    repositories/        SQL for users/accounts and wallets, nothing else
    services/            rules: identity (sign-in → user), wallet (validation + saves)
    http/                route-handler wrapper: auth guard, error mapping, logging
  shared/                pure code used by both sides
    data/                card, lounge and earn-rate data (cards/*.ts by issuer)
    lib/                 wallet types, three-way merge, credit periods, caps/limits, formatting
  proxy.ts               old-domain handoff
scripts/db-migrate.ts    apply migrations by hand (npm run db:migrate)
```

## Updating card data

Card terms change often. Edit the relevant file in `src/shared/data/cards/`, keep `lastVerified` current, and if you add a card
also add an entry in `src/shared/data/calculator-rates.ts` (otherwise rates are inferred from the earn-rate text). Credit `id`s
are used as storage keys — don't rename them once users are tracking them.

## Accounts & cloud sync (optional)

Google sign-in ([Auth.js](https://authjs.dev)) backed by Postgres ([Neon](https://neon.tech) via the Vercel
Marketplace). Everything account-related stays hidden until these env vars exist:

| Variable | Where it comes from |
| --- | --- |
| `AUTH_SECRET` | Random 32 bytes (see SETUP.md) — already set on Vercel |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | Google Cloud Console → OAuth client (Web). Redirect URI: `https://perkfolio-app.vercel.app/api/auth/callback/google` |
| `DATABASE_URL` | Added automatically by `vercel integration add neon` |

**Schema** (see `src/backend/db/migrations.ts`):

| Table | What it holds |
| --- | --- |
| `users` | One row per person. `id` (uuid) is the key everything else references; `email` is a unique attribute that can change. |
| `accounts` | Sign-in identities linked to a user: (`google`, Google account id). Returning users are matched on this first, then on verified email. |
| `wallets` | One per user: the whole wallet as JSON (cards, credit usage, ignored credits, bonus progress, cap/visit tallies, open dates) and a `version` for conflict-free saves. |
| `schema_migrations` | Which migrations have run. |

Migrations run automatically on the first database request after a deploy (or by hand with `npm run db:migrate`).
To change the schema, append a migration; never edit one that has shipped.

**Sync protocol:** the client sends the `version` it last saw with each save. If another device saved in between,
the server answers 409 with the latest copy; the client three-way merges it and saves again, so stale devices
can't overwrite newer data and device clocks don't matter.

Without `DATABASE_URL`, sign-in still works but sync is off.

## Security

- **Identity:** the user id always comes from the signed session cookie (httpOnly, Secure, SameSite=Lax),
  never from the request, so nobody can read or write another person's wallet.
- **Writes:** the server rejects cross-site requests (Origin / Sec-Fetch-Site), non-JSON or oversized bodies,
  and more than 60 saves a minute per user.
- **Stored data:** wallets are strictly validated and stripped to known fields before storing.
- **SQL:** queries are always parameterized.
- **Account deletion:** needs an explicit confirmation body.
- **Errors and logs:** errors never leak internals, and logs never contain emails.
- **Headers:** security headers apply site-wide (no framing, nosniff, HSTS, a narrow CSP), and API responses are
  never cached.
- **Rules to follow when changing code:** see CLAUDE.md → Security rules.

## Deploying

Production is hosted on Vercel at https://perkfolio-app.vercel.app and redeploys automatically on every push to `main`;
pull requests get preview deployments. The app also runs on any Node host (`npm run build && npm start`).

## Roadmap

- Email reminders for signed-in users (calendar + in-app reminders already ship)
- Admin workflow for refreshing card terms
