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
