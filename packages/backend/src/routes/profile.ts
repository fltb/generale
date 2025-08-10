import { Elysia } from 'elysia';
import { profileService } from '../services/profileService';
import { sessionService } from '../services/sessionService';
import {
  profileUpdateReqSchema,
  profileRespSchema,
  errorRespSchema,
  messageRespSchema
} from '@generale/types';

export const profileRoutes = new Elysia({ prefix: '/api' })
  .get('/profile/:userId', 
    async ({ params: { userId }, set }) => {
      const profile = await profileService.getProfile(userId);
      if (!profile) {
        set.status = 404;
        return { error: 'Profile not found' };
      }
      return {
        userId: profile.userId,
        ...(profile.avatarUrl && { avatarUrl: profile.avatarUrl }),
        ...(profile.bio && { bio: profile.bio }),
        ...(profile.updatedAt && { updatedAt: profile.updatedAt.toISOString() })
      };
    },
    {
      response: {
        200: profileRespSchema,
        404: errorRespSchema
      }
    }
  )
  .post('/profile/update', 
    async ({ body, cookie: { session }, set }) => {
      const userId = sessionService.get(session?.value)?.userId;
      if (!userId) {
        set.status = 401;
        return { error: 'Unauthorized' };
      }
      await profileService.updateProfile(userId, body);
      return { success: true, message: 'Profile updated successfully' };
    },
    {
      body: profileUpdateReqSchema,
      response: {
        200: messageRespSchema,
        401: errorRespSchema
      }
    }
  );

export default profileRoutes;
