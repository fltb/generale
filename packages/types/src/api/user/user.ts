import { t, type Static } from 'elysia';
import { errorRespSchema, okRespSchema, messageRespSchema } from '../base';

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
 * `username` 字段同时接受用户名或邮箱（服务端会按这两种方式各查一次）。
 * 名字保留为 username 是为了兼容已经发出的客户端代码；语义上等价于 identifier。
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

/**
 * 登录态下改密码：需要当前密码 + 新密码
 */
export const changePasswordReqSchema = t.Object({
    currentPassword: t.String(),
    newPassword: t.String({ minLength: 8 }),
});
export type ChangePasswordReqBody = Static<typeof changePasswordReqSchema>;

/**
 * 登录态下发起改邮箱：需要当前密码（防 session 劫持）+ 新邮箱
 */
export const changeEmailReqSchema = t.Object({
    currentPassword: t.String(),
    newEmail: t.String({ format: 'email' }),
});
export type ChangeEmailReqBody = Static<typeof changeEmailReqSchema>;

/**
 * 改邮箱确认（用户点新邮箱里的链接拉过来的）
 */
export const confirmEmailChangeReqSchema = t.Object({
    token: t.String(),
});
export type ConfirmEmailChangeReqBody = Static<typeof confirmEmailChangeReqSchema>;

// --- Responses ---

/**
 * Schema representing the public-facing user profile object.
 * This is the core data model for a user, not a direct response itself.
 * displayName / avatarUrl / avatarThumbUrl / bio 来自 profiles 表（GET /me 时一并返回）。
 */
export const userProfileSchemaResp = t.Object({
    id: t.String(),
    username: t.String(),
    email: t.String(),
    displayName: t.Optional(t.String()),
    /** 原图 URL，profile 页用 */
    avatarUrl: t.Optional(t.String()),
    /** 缩略图 URL，Nav / PlayerList 等小尺寸场景用 */
    avatarThumbUrl: t.Optional(t.String()),
    bio: t.Optional(t.String()),
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
 * Schema for a password reset token validation response
 */
export const passwordResetTokenRespSchema = t.Object({
    valid: t.Boolean(),
    success: t.Optional(t.Boolean()),
    message: t.Optional(t.String())
});

export type PasswordResetTokenRespBody = Static<typeof passwordResetTokenRespSchema>;

/**
 * Schema for an error response
 */
export type ErrorRespBody = Static<typeof errorRespSchema>;

/**
 * Static TypeScript type for the ok response.
 */
export type OkRespBody = Static<typeof okRespSchema>;

export type MessageRespBody = Static<typeof messageRespSchema>;
