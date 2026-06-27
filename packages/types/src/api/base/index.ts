import { type Static, t } from "elysia";

/**
 * Schema for a generic success response that only contains a message.
 * Used for endpoints like registration or email verification.
 */
export const messageRespSchema = t.Object({
  success: t.Literal(true),
  message: t.String(),
});

/**
 * Static TypeScript type for a generic success message response.
 */
export type MessageResp = Static<typeof messageRespSchema>;

/**
 * Schema for a generic error response.
 */
export const errorRespSchema = t.Object({
  error: t.String(),
});

/**
 * Static TypeScript type for a generic error response.
 */
export type ErrorResp = Static<typeof errorRespSchema>;

/**
 * Schema for a generic successful response with a simple "ok" confirmation.
 * Used for endpoints like logout or simple updates.
 */
export const okRespSchema = t.Object({
  ok: t.Literal(true),
});

/**
 * Static TypeScript type for a generic "ok" response.
 */
export type OkResp = Static<typeof okRespSchema>;
