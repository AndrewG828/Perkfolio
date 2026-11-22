import "server-only";
import { parseWallet } from "@/shared/lib/wallet-schema";
import { getWallet, saveWallet } from "../repositories/wallets";
import { HttpError } from "../http/errors";

export const MAX_WALLET_BYTES = 256 * 1024;

export const loadWallet = getWallet;

/** Validates a save request and applies it with the versioning rules in repositories/wallets. */
export async function storeWallet(userId: string, body: unknown) {
  const { data, base } = (body ?? {}) as { data?: unknown; base?: unknown };
  const baseVersion = typeof base === "number" ? base : base === undefined ? 0 : NaN;
  // Only the validated, stripped-down copy is ever stored.
  const wallet = parseWallet(data);
  if (!wallet || !Number.isSafeInteger(baseVersion) || baseVersion < 0) throw new HttpError(400, "Invalid wallet");
  const result = await saveWallet(userId, wallet, baseVersion);
  return { result, cards: wallet.cards.length, base: baseVersion };
}
