import { t, type Static } from 'elysia'

/**
 * Schema for profile update request (PATCH /me)。avatarUrl 不接受通过这里改——
 * 头像走 POST /profile/avatar 上传文件流。
 */
export const profileUpdateReqSchema = t.Object({
    displayName: t.Optional(t.String({ maxLength: 50 })),
    bio: t.Optional(t.String({ maxLength: 500 })),
});

export type ProfileUpdateReqBody = Static<typeof profileUpdateReqSchema>;

/**
 * Schema for profile response
 */
export const profileRespSchema = t.Object({
    userId: t.String(),
    displayName: t.Optional(t.String()),
    avatarUrl: t.Optional(t.String()),
    avatarThumbUrl: t.Optional(t.String()),
    bio: t.Optional(t.String()),
    updatedAt: t.Optional(t.String({ format: 'date-time' }))
});

export type ProfileRespBody = Static<typeof profileRespSchema>;

/**
 * Schema for avatar upload request
 */
export const avatarUploadReqSchema = t.Object({
  file: t.File()
});

export type AvatarUploadReqBody = Static<typeof avatarUploadReqSchema>;

/**
 * Schema for avatar upload response
 */
export const avatarUploadRespSchema = t.Object({
  success: t.Boolean(),
  avatarUrl: t.String(),
  avatarThumbUrl: t.String(),
  message: t.String()
});

export type AvatarUploadRespBody = Static<typeof avatarUploadRespSchema>;