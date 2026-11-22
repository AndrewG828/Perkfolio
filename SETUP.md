# Local development setup

Step-by-step setup for a new computer. Written so you can hand it straight to Claude Code ("set up this repo using
SETUP.md"), or follow it yourself.

## 1. Prerequisites

| Tool | Version | Check |
| --- | --- | --- |
| Node.js | 22.x (Next.js 16 needs ≥ 20.9) | `node -v` |
| npm | comes with Node | `npm -v` |
| Git | any recent | `git --version` |
| Vercel CLI | latest | `npm i -g vercel@latest`, then `vercel --version` |

## 2. Get the code

```bash
git clone https://github.com/AndrewG828/Perkfolio.git
cd Perkfolio
npm ci
```

Read `AGENTS.md` first: this project uses Next.js 16, whose APIs differ from older versions. The matching docs ship
in `node_modules/next/dist/docs/`.

## 3. Environment variables

The app runs with **no** env vars: card data is static, and the wallet lives in the browser. Accounts and cloud sync
switch on only when these are set:

| Variable | Needed for | Where to get it |
| --- | --- | --- |
| `AUTH_SECRET` | Sign-in (encrypts the session cookie) | Generate locally (command in step b) |
| `AUTH_GOOGLE_ID` | Google sign-in | Google Cloud Console → APIs & Services → Credentials → your OAuth client |
| `AUTH_GOOGLE_SECRET` | Google sign-in | Same OAuth client |
| `DATABASE_URL` | Cloud sync (Neon Postgres) | `vercel env pull` (step below) |

### a. Pull what Vercel has for development

```bash
vercel login                      # opens a browser; sign in as the project owner
vercel link --project perkfolio --yes
vercel env pull .env.local        # writes DATABASE_URL and the other Neon vars
```

Vercel stores the Google and auth secrets for **production only** and never sends them to `env pull`, so add local
values yourself.

### b. Add the auth values to `.env.local`

```bash
node -e "console.log('AUTH_SECRET=' + require('crypto').randomBytes(32).toString('base64'))" >> .env.local
```

Then add these two lines to `.env.local`, with values copied from the Google OAuth client:

```
AUTH_GOOGLE_ID=<client id>.apps.googleusercontent.com
AUTH_GOOGLE_SECRET=<client secret>
```

### c. Allow localhost in Google

Google Cloud Console → APIs & Services → Credentials → your OAuth client:

- **Authorized JavaScript origins:** add `http://localhost:3000`
- **Authorized redirect URIs:** add `http://localhost:3000/api/auth/callback/google`

Keep the production entries (`https://perkfolio-app.vercel.app` and `.../api/auth/callback/google`).

If Google says "access blocked", the OAuth consent screen is in **Testing** mode. Add your Google account under
*Test users*, or publish the app.

### d. Know which database you're writing to

`DATABASE_URL` from `env pull` points at the **same Neon database production uses**. Signing in locally reads and
writes your real wallet. To keep local testing separate, use either:

- **Option 1:** delete the `DATABASE_URL` line from `.env.local` (sign-in still works; sync is off), or
- **Option 2:** in the Neon dashboard (Vercel → Storage → perkfolio-db → Open in Neon), create a `dev` branch and
  put its connection string in `.env.local` as `DATABASE_URL`.

The `wallets` table is created automatically on first use.

`.env.local` is gitignored. Never commit it, and never paste secrets into chats or issues.

## 4. Run it

```bash
npm run dev                       # http://localhost:3000
```

Before pushing, run the same checks CI-style:

```bash
npx tsc --noEmit -p .
npm run lint
npm run build
```

## 5. Deploying

Vercel deploys `main` to https://perkfolio-app.vercel.app automatically on every push. Other branches and pull
requests get preview URLs. Env var changes need a redeploy (Vercel → Deployments → ⋯ → Redeploy, or
`vercel redeploy <url> --environment production`).

## 6. Good to know

- **Wallets are saved per address.** `localhost:3000` and the live site have separate browser storage. Sign in on
  both to sync.
- **Card data** lives in `src/data/cards/*.ts` (see README → Updating card data). Never rename a credit `id`;
  it's a storage key.
- **Monthly data check.** A scheduled Claude task runs on the 1st of each month and opens a PR with any card-term
  changes for review.

## Prompt for Claude Code on a new machine

> Clone https://github.com/AndrewG828/Perkfolio.git into ~/code/Perkfolio, then follow SETUP.md in the repo:
> install dependencies with npm ci, check Node is 22.x, install the Vercel CLI, run `vercel login` (I'll complete it
> in the browser), link to the `perkfolio` project and pull env vars into .env.local, and generate AUTH_SECRET with
> the node one-liner in SETUP.md step 3b. Ask me to paste AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET into .env.local myself (don't ask for the
> values in chat). Then remind me to add the localhost origin and redirect URI in Google Cloud Console, ask whether
> local dev should use the production database or have DATABASE_URL removed, start `npm run dev`, and confirm
> http://localhost:3000/api/me returns `"enabled":true`.
