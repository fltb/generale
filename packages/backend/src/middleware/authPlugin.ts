import { Elysia } from "elysia";
import { sessionService } from "../services/sessionService";

/**
 * Authentication plugin.
 * - Extracts `sid` from Cookie header or `x-session-id` header
 * - Attaches `session` to context if valid
 * - Provides a `.guard()` that rejects 401 when session missing
 */
export const authPlugin = new Elysia({ name: "auth-plugin" })
  // Make session available downstream (may be undefined)
  .derive(({ request, cookie }) => {
    const sid: string | undefined =
      (cookie["sid"]?.value as string | undefined) ?? request.headers.get("x-session-id") ?? undefined;
    const session = sessionService.get(sid);
    return { session } as { session: import("../services/sessionService").Session | undefined };
  })
  // Guard helper to enforce authentication
  .guard(
    {
      beforeHandle({ session, set }) {
        if (!session) {
          set.status = 401;
          return { error: "Unauthorized" };
        }
        return;
      },
    },
    // Apply guard conditionally by wrapping subsequent plugins/routes with `.use(authPlugin.guard)`
  );
