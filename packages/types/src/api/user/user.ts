import { t, type Static } from 'elysia';

// --- Requests ---

/**
 * Schema for the body of the POST /api/register request.
 */
export const registerReqSchema = t.Object({
    username: t.String({ 
        minLength: 3, 
        maxLength: 50, 
        error: "Username must be between 3 and 50 characters." 
    }),
    password: t.String({ 
        minLength: 8, 
        error: "Password must be at least 8 characters long." 
    }),
    email: t.String({ 
        format: 'email', 
        error: "Please provide a valid email address." 
    })
});

/**
 * Static TypeScript type for the user registration request body.
 */
export type RegisterReqBody = Static<typeof registerReqSchema>;

/**
 * Schema for the body of the POST /api/login request.
 */
export const loginReqSchema = t.Object({
    username: t.String(),
    password: t.String()
});

/**
 * Static TypeScript type for the user login request body.
 */
export type LoginReqBody = Static<typeof loginReqSchema>;

/**
 * Schema for the body of the POST /api/request-password-reset request.
 */
export const requestPasswordResetReqSchema = t.Object({
    email: t.String({ format: 'email' })
});

/**
 * Static TypeScript type for the password reset request body.
 */
export type RequestPasswordResetReqBody = Static<typeof requestPasswordResetReqSchema>;

/**
 * Schema for the body of the POST /api/reset-password request.
 */
export const resetPasswordReqSchema = t.Object({
    token: t.String(),
    newPassword: t.String({ minLength: 8 })
});

/**
 * Static TypeScript type for the password reset request body.
 */
export type ResetPasswordReqBody = Static<typeof resetPasswordReqSchema>;

// --- Responses ---

/**
 * Schema representing the public-facing user profile object.
 * This is the core data model for a user, not a direct response itself.
 */
export const userProfileSchemaResp = t.Object({
    id: t.String(),
    username: t.String(),
    email: t.String()
});

/**
 * Static TypeScript type for the user profile object.
 */
export type UserProfileRespBody = Static<typeof userProfileSchemaResp>;

/**
 * Schema for a successful API response that includes user data (e.g., on login or /me).
 */
export const userSuccessRespSchema = t.Object({
    user: userProfileSchemaResp
});

/**
 * Static TypeScript type for a successful API response containing user data.
 */
export type UserSuccessRespBody = Static<typeof userSuccessRespSchema>;

/**
 * Schema for the successful POST /api/logout response.
 */
export const logoutRespSchema = t.Object({
    ok: t.Literal(true)
});

/**
 * Static TypeScript type for the logout response.
 */
export type LogoutRespBody = Static<typeof logoutRespSchema>;

/**
 * Schema for a generic message response (success/failure messages)
 */
export const messageRespSchema = t.Object({
    success: t.Boolean(),
    message: t.String()
});

export type MessageRespBody = Static<typeof messageRespSchema>;

/**
 * Schema for an error response
 */
export const errorRespSchema = t.Object({
    error: t.String()
});

export type ErrorRespBody = Static<typeof errorRespSchema>;

/**
 * Schema for a simple OK response
 */
export const okRespSchema = t.Object({
    ok: t.Literal(true)
});

export type OkRespBody = Static<typeof okRespSchema>;

/**
 * Schema for a password reset token validation response
 */
export const passwordResetTokenRespSchema = t.Object({
    valid: t.Boolean(),
    success: t.Optional(t.Boolean()),
    message: t.Optional(t.String())
});

export type PasswordResetTokenRespBody = Static<typeof passwordResetTokenRespSchema>;

