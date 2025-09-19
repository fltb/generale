import { t, type Static } from 'elysia'

/**
 * Schema for profile update request
 */
export const profileUpdateReqSchema = t.Object({
    avatarUrl: t.Optional(t.String()),
    bio: t.Optional(t.String({ maxLength: 500 }))
  });
  
export type ProfileUpdateReqBody = Static<typeof profileUpdateReqSchema>;

/**
 * Schema for profile response
 */
export const profileRespSchema = t.Object({
    userId: t.String(),
    avatarUrl: t.Optional(t.String()),
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
  message: t.String()
});

export type AvatarUploadRespBody = Static<typeof avatarUploadRespSchema>;