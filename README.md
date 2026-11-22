# Perkfolio — credit card benefits, tracked

A web app for getting the most out of rewards credit cards:

- **Explore cards** (`/cards`) — 35+ popular cards (Amex Platinum & Gold, Chase Sapphire Reserve & Preferred, Capital One Venture X, Citi Strata Elite, Bilt, airline & hotel cards, cash back) with filters by issuer, category, fee and lounge access.
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

## Deploying

The app builds to static pages and deploys as-is to Vercel (`vercel deploy`) or any Node host (`npm run build && npm start`).

## Roadmap

- Accounts + cloud sync for the wallet (e.g. Auth.js + Postgres), replacing `localStorage`
- Email/push reminders before credits reset
- Card-member-year credits (anniversary-based resets) and card open dates
- Admin workflow for refreshing card terms
