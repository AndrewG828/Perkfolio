import { HttpError } from "@/backend/http/errors";
import { readJson, withUser } from "@/backend/http/handler";
import { deleteUser } from "@/backend/repositories/users";

/**
 * DELETE `{ confirm: "delete my account" }` → removes the signed-in user, their linked sign-ins and their cloud
 * wallet. The explicit body guards against accidental or forged calls. The client then signs out.
 */
export const DELETE = withUser(
  "account",
  "delete",
  { mutation: true, json: true, maxBytes: 1024, perMinute: 5 },
  async (req, { userId, log }) => {
    const body = (await readJson(req, 1024)) as { confirm?: unknown } | null;
    if (body?.confirm !== "delete my account") throw new HttpError(400, "Missing confirmation");
    const deleted = await deleteUser(userId);
    log({ deleted });
    return { ok: true };
  },
);
