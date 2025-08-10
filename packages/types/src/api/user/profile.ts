import { t, Static } from 'elysia'


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
  