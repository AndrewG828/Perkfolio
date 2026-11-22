import "server-only";
import { isWalletLike } from "@/shared/lib/wallet-merge";
import { getWallet, saveWallet } from "../repositories/wallets";
import { HttpError } from "../http/errors";

export const MAX_WALLET_BYTES = 256 * 1024;

export const loadWallet = getWallet;

/** Validates a save request and applies it with the versioning rules in repositories/wallets. */
export async function storeWallet(userId: string, body: unknown) {
  const { data, base } = (body ?? {}) as { data?: unknown; base?: unknown };
  const baseVersion = Number(base ?? 0);
  if (!isWalletLike(data) || !Number.isFinite(baseVersion) || baseVersion < 0) {
    throw new HttpError(400, "Invalid wallet");
  }
  const result = await saveWallet(userId, data, baseVersion);
  return { result, cards: data.cards.length, base: baseVersion };
}
