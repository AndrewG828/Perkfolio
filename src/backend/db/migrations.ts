/**
 * Database schema, as an ordered list of migrations. Each runs once, inside a transaction, and is recorded in
 * `schema_migrations`. Never edit a migration that has shipped: add a new one.
 *
 *   users      one row per person. `id` is the internal key every other table points at; `email` is just
 *              an attribute (unique, lowercased) and may change.
 *   accounts   sign-in identities linked to a user, e.g. ('google', <Google account id>). Google's id never
 *              changes, unlike the email, so returning users are matched on it first.
 *   wallets    one per user: the whole wallet as JSON (cards, credit usage, ignored credits, bonus progress,
 *              cap/visit tallies, card open dates) plus `version`, which goes up on every save so a stale
 *              device can't overwrite newer data.
 */
export interface Migration {
  id: string;
  description: string;
  statements: string[];
}

export const migrations: Migration[] = [
  {
    id: "001_users_accounts_wallets",
    description: "Users with linked sign-in accounts; wallets keyed by user id. Adopts email-keyed wallets.",
    statements: [
      // The first version of sync stored wallets keyed by a text id (a random id per sign-in, then the email).
      // Keep that table as legacy_wallets so nothing is lost, and copy the email-keyed rows over below.
      `DO $$ BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema() AND table_name = 'wallets' AND column_name = 'user_id' AND data_type = 'text'
        ) THEN
          ALTER TABLE wallets RENAME TO legacy_wallets;
        END IF;
      END $$`,
      `CREATE TABLE IF NOT EXISTS users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email text NOT NULL UNIQUE CHECK (email = lower(email)),
        name text,
        image text,
        created_at timestamptz NOT NULL DEFAULT now(),
        last_login_at timestamptz NOT NULL DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS accounts (
        provider text NOT NULL,
        provider_account_id text NOT NULL,
        user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (provider, provider_account_id)
      )`,
      `CREATE INDEX IF NOT EXISTS accounts_user_id_idx ON accounts (user_id)`,
      `CREATE TABLE IF NOT EXISTS wallets (
        user_id uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
        data jsonb NOT NULL,
        version bigint NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      )`,
      `DO $$ BEGIN
        IF to_regclass('legacy_wallets') IS NOT NULL THEN
          INSERT INTO users (email)
            SELECT DISTINCT lower(user_id) FROM legacy_wallets WHERE user_id LIKE '%@%'
            ON CONFLICT (email) DO NOTHING;
          INSERT INTO wallets (user_id, data, version)
            SELECT u.id, l.data, l.updated_at FROM legacy_wallets l JOIN users u ON u.email = lower(l.user_id)
            ON CONFLICT (user_id) DO NOTHING;
        END IF;
      END $$`,
    ],
  },
];
