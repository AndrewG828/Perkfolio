/**
 * Applies pending database migrations: `npm run db:migrate` (reads DATABASE_URL from .env.local).
 * The app also does this on its own on first use, so this is for local setup and checking a new migration.
 */
import { neon } from "@neondatabase/serverless";
import { migrate } from "../src/backend/db/migrate";

const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Run `vercel env pull .env.local` first (see SETUP.md).");
  process.exit(1);
}
migrate(neon(url))
  .then((applied) => console.log(applied.length ? `Applied: ${applied.join(", ")}` : "Database is up to date."))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
