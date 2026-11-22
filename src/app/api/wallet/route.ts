import { NextResponse } from "next/server";
import { readJson, withUser } from "@/backend/http/handler";
import { loadWallet, MAX_WALLET_BYTES, storeWallet } from "@/backend/services/wallet";

/** GET → `{ data, version }`: the signed-in user's wallet (`data: null, version: 0` if never saved). */
export const GET = withUser("wallet-sync", "get", { perMinute: 120 }, async (_req, { userId, log }) => {
  const wallet = await loadWallet(userId);
  log({ found: wallet.data !== null, version: wallet.version });
  return wallet;
});

/**
 * PUT `{ data, base }` → saves if `base` is still the stored version.
 * - 200 `{ ok: true, version }`
 * - 409 `{ conflict: true, data, version }`: another device saved first; the client merges and retries.
 */
export const PUT = withUser(
  "wallet-sync",
  "put",
  { mutation: true, json: true, maxBytes: MAX_WALLET_BYTES, perMinute: 60 },
  async (req, { userId, log }) => {
    const { result, cards, base } = await storeWallet(userId, await readJson(req, MAX_WALLET_BYTES));
    if (result.saved) {
      log({ result: "saved", cards, base, version: result.version });
      return { ok: true, version: result.version };
    }
    log({ result: "conflict", cards, base, version: result.current.version });
    return NextResponse.json({ conflict: true, ...result.current }, { status: 409 });
  },
);
