# Perkfolio — credit card benefits, tracked

**Live site: https://perkfolio-app.vercel.app**

A web app for getting the most out of rewards credit cards:

- **Explore cards** (`/cards`) — 37 popular cards (Amex Platinum & Gold, Chase Sapphire Reserve & Preferred, Capital One Venture X, Citi Strata Elite, Bilt, airline & hotel cards, cash back) with filters by issuer, category, fee and lounge access.
- **Card details** (`/cards/[id]`) — earn rates, every statement credit with its cadence, lounge access, perks and transfer partners.
- **Compare** (`/compare?cards=a,b,c`) — up to four cards side by side with the best value per row highlighted. Shareable URLs.
- **Benefits tracker** (`/tracker`) — add the cards you hold, log credits as you use them (monthly / quarterly / semi-annual / annual / every-4-years), see what's expiring and whether each annual fee has paid for itself. Export/import a JSON backup.
- **Lounge finder** (`/lounges?airport=JFK`) — search an airport and see Centurion, Chase Sapphire, Capital One, Delta Sky Club, Priority Pass, Plaza Premium, Escape and airline lounges, matched against the cards in your wallet.
- **Value calculator** (`/calculator`) — enter monthly spending and rank cards by net annual value (rewards + realistic credit usage − fee).

## Stack

- [Next.js 16](https://nextjs.org) (App Router, Cache Components) + React 19 + TypeScript
- Tailwind CSS v4 (design tokens in `src/app/globals.css`)
- `lucide-react` icons
- No backend yet: card/lounge data is static TypeScript, user data lives in `localStorage`.

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
  app/                 routes (cards, compare, tracker, lounges, calculator, about)
  components/          shared UI (header, footer, card art, tiles)
  data/
    types.ts           Card / Credit / Lounge data model
    cards/*.ts         card data by issuer (amex, chase-bilt, other)
    lounges.ts         airports + lounges
    networks.ts        lounge network metadata
    calculator-rates.ts  structured earn rates for the calculator
  lib/
    wallet-store.ts    localStorage-backed wallet + credit usage
    compare-store.ts   compare selection
    periods.ts         credit period math (month/quarter/half/year)
```

## Updating card data

Card terms change often. Edit the relevant file in `src/data/cards/`, keep `lastVerified` current, and if you add a card
also add an entry in `src/data/calculator-rates.ts` (otherwise rates are inferred from the earn-rate text). Credit `id`s
are used as storage keys — don't rename them once users are tracking them.

## Accounts & cloud sync (optional)

Google sign-in ([Auth.js](https://authjs.dev)) with each user's wallet stored as one JSON row in Postgres
([Neon](https://neon.tech) via the Vercel Marketplace). Everything account-related stays hidden until these env vars exist:

| Variable | Where it comes from |
| --- | --- |
| `AUTH_SECRET` | Random 32 bytes (see SETUP.md) — already set on Vercel |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | Google Cloud Console → OAuth client (Web). Redirect URI: `https://perkfolio-app.vercel.app/api/auth/callback/google` |
| `DATABASE_URL` | Added automatically by `vercel integration add neon` |

The `wallets` table is created on first use. Without `DATABASE_URL`, sign-in still works but sync is off.

## Deploying

Production is hosted on Vercel at https://perkfolio-app.vercel.app and redeploys automatically on every push to `main`;
pull requests get preview deployments. The app also runs on any Node host (`npm run build && npm start`).

## Roadmap

- Email reminders for signed-in users (calendar + in-app reminders already ship)
- Admin workflow for refreshing card terms
