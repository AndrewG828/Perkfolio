import { withUser } from "@/backend/http/handler";
import { deleteUser } from "@/backend/repositories/users";

/** DELETE → removes the signed-in user, their linked sign-ins and their cloud wallet. The client then signs out. */
export const DELETE = withUser("account", "delete", async (_req, { userId, log }) => {
  const deleted = await deleteUser(userId);
  log({ deleted });
  return { ok: true };
});
